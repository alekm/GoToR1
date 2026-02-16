/**
 * SmartZone API Client
 *
 * Handles authentication and API calls to RUCKUS SmartZone Controller
 * Based on vSZ Public API v9_1 (6.x) and v10_0 (7.x)
 * Official API Docs: https://docs.ruckuswireless.com/smartzone/7.1.1/vszh-public-api-reference-guide-711.html
 */

import type {
  SmartZoneConfig,
  SZZone,
  SZWLAN,
  SZAPGroup,
  SZAccessPoint,
  SZSwitch,
  SZRadiusAuthService,
  SmartZoneData,
} from '../types/migration'

// Session management
const SESSION_COOKIE_PREFIX = 'gotor1_sz_session_'

function sessionKey(config: SmartZoneConfig): string {
  return `${SESSION_COOKIE_PREFIX}${encodeURIComponent(config.host)}_${config.port}`
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Path=/; SameSite=Lax`
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)')
  )
  return match ? decodeURIComponent(match[1]) : null
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/`
}

/**
 * Build SmartZone API URL
 * Always uses Netlify function (works in both dev with `netlify dev` and production)
 */
function buildUrl(config: SmartZoneConfig, path: string): string {
  const url = new URL('/.netlify/functions/sz-proxy', window.location.origin)
  url.searchParams.set('host', config.host)
  url.searchParams.set('port', config.port.toString())
  url.searchParams.set('path', path)
  return url.toString()
}

/**
 * Detect SmartZone API version
 */
async function detectApiVersion(config: SmartZoneConfig): Promise<string> {
  // Try v13_1 first (vSZ 7.1.1), then v10_0 (vSZ 7.0), then v9_1 (vSZ 6.x)
  const versions = ['v13_1', 'v10_0', 'v9_1', 'v9_0', 'v8_0']

  for (const version of versions) {
    try {
      const url = buildUrl(config, `/wsg/api/public/${version}/systemInfo`)
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (response.ok) {
        return version
      }
    } catch (err) {
      // Continue to next version
      continue
    }
  }

  // Default to v10_0 if detection fails
  return 'v10_0'
}

/**
 * Authenticate with SmartZone and get session cookie
 */
async function authenticate(config: SmartZoneConfig): Promise<string> {
  const key = sessionKey(config)
  const existingSession = getCookie(key)

  if (existingSession) {
    // Validate existing session
    try {
      const testUrl = buildUrl(config, `/wsg/api/public/${config.apiVersion}/session`)
      const testResponse = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Cookie': `JSESSIONID=${existingSession}`,
        },
      })

      if (testResponse.ok) {
        return existingSession
      }
    } catch {
      // Session invalid, clear it
      clearCookie(key)
    }
  }

  // Create new session
  if (config.authType === 'apikey') {
    throw new Error('API Key authentication not yet implemented. Please use username/password.')
  }

  // Use v10_0 for session (authentication), but v13_1 for resources (vSZ 7.1.1)
  const loginUrl = buildUrl(config, `/wsg/api/public/v10_0/session`)
  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      username: config.credentials.username,
      password: config.credentials.password,
    }),
  })

  if (!response.ok) {
    let errorDetail = ''
    try {
      const errorData = await response.json()
      errorDetail = JSON.stringify(errorData)
    } catch {
      errorDetail = await response.text()
    }
    throw new Error(`Authentication failed: ${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ''}`)
  }

  // Extract session ID from response body (injected by proxy)
  try {
    const data = await response.json()

    // Check for session ID injected by proxy
    if (data._sessionId) {
      setCookie(key, data._sessionId, 3600)
      return data._sessionId
    }

    // Some deployments return session in response body
    if (data.sessionId) {
      setCookie(key, data.sessionId, 3600)
      return data.sessionId
    }
  } catch (err) {
    console.error('Failed to parse session response:', err)
  }

  throw new Error('Failed to extract session ID from authentication response')
}

/**
 * Make authenticated API request to SmartZone
 */
async function apiRequest<T>(
  config: SmartZoneConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const sessionId = await authenticate(config)
  const url = buildUrl(config, path)

  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId, // Pass session via custom header (proxy will convert to Cookie)
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorDetail = ''
    try {
      errorDetail = JSON.stringify(await response.json())
    } catch {
      try {
        errorDetail = await response.text()
      } catch {
        errorDetail = 'Unable to parse error response'
      }
    }
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ''}`
    )
  }

  return response.json()
}

/**
 * Test SmartZone connection
 */
export async function testConnection(
  config: SmartZoneConfig
): Promise<{ success: boolean; version?: string; error?: string }> {
  try {
    // Auto-detect API version if not set
    if (!config.apiVersion || config.apiVersion === 'auto') {
      const detectedVersion = await detectApiVersion(config)
      config.apiVersion = detectedVersion
    }

    // Try to authenticate - if this succeeds, connection is valid
    await authenticate(config)

    return {
      success: true,
      version: config.apiVersion,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Get zones from SmartZone
 * @param selectedZoneIds - Optional array of zone IDs to fetch. If provided, only these zones are fetched.
 */
export async function getZones(config: SmartZoneConfig, selectedZoneIds?: string[]): Promise<SZZone[]> {
  interface ZoneListResponse {
    list?: Array<{ id: string; name: string; description?: string; domainId: string }>
    totalCount?: number
  }

  // Step 1: Get zone list (basic info only)
  const listResponse = await apiRequest<ZoneListResponse>(
    config,
    `/wsg/api/public/v13_1/rkszones`
  )

  const allZones = listResponse.list || []
  if (allZones.length === 0) {
    return []
  }

  // Filter to selected zones if specified
  const zoneList = selectedZoneIds
    ? allZones.filter(z => selectedZoneIds.includes(z.id))
    : allZones

  // Step 2: Fetch full details for each zone to get RF configuration
  const fullZones: SZZone[] = []
  console.log(`=== FETCHING DETAILS FOR ${zoneList.length} ${selectedZoneIds ? 'SELECTED' : 'ALL'} ZONES ===`)

  for (const zoneSummary of zoneList) {
    console.log(`Fetching zone: ${zoneSummary.name} (ID: ${zoneSummary.id})`)

    try {
      const fullZone = await apiRequest<any>(
        config,
        `/wsg/api/public/v13_1/rkszones/${encodeURIComponent(zoneSummary.id)}`
      )

      // EXPLORATORY LOGGING - Log complete zone structure
      console.log('=== ZONE DETAIL SUCCESS ===')
      console.log(`Zone: ${zoneSummary.name}`)
      console.log('Full response:', JSON.stringify(fullZone, null, 2))
      console.log('Available fields:', Object.keys(fullZone))
      console.log('===========================')

      fullZones.push(fullZone)
    } catch (err) {
      console.error(`=== ZONE DETAIL FAILED ===`)
      console.error(`Zone: ${zoneSummary.name} (ID: ${zoneSummary.id})`)
      console.error('Error:', err)
      console.error('==========================')

      // Fallback: Use summary data
      fullZones.push({
        id: zoneSummary.id,
        name: zoneSummary.name,
        description: zoneSummary.description,
        domainId: zoneSummary.domainId,
      })
    }
  }

  console.log(`=== ZONE DETAIL FETCH COMPLETE: ${fullZones.length} zones ===`)

  return fullZones
}

/**
 * Get WLANs for a specific zone
 * Uses two-step fetch: list endpoint (basic info) + individual detail endpoints (full config)
 */
export async function getWLANs(config: SmartZoneConfig, zoneId: string): Promise<SZWLAN[]> {
  interface WLANListResponse {
    list?: Array<{ id: string; name: string; ssid?: string }>
    totalCount?: number
  }

  // Step 1: Get WLAN list (basic info only - no type, encryption, vlan, passphrase)
  const listResponse = await apiRequest<WLANListResponse>(
    config,
    `/wsg/api/public/v13_1/rkszones/${encodeURIComponent(zoneId)}/wlans`
  )

  const wlanList = listResponse.list || []
  if (wlanList.length === 0) {
    return []
  }

  // Step 2: Fetch full details for each WLAN to get type, encryption, vlan, passphrase
  const fullWLANs: SZWLAN[] = []
  for (const wlanSummary of wlanList) {
    try {
      // Fetch individual WLAN details
      const fullWLAN = await apiRequest<SZWLAN>(
        config,
        `/wsg/api/public/v13_1/rkszones/${encodeURIComponent(zoneId)}/wlans/${encodeURIComponent(wlanSummary.id)}`
      )
      // SmartZone API may not include zoneId, so ensure it's set
      fullWLANs.push({ ...fullWLAN, zoneId })
    } catch (err) {
      console.warn(`Failed to fetch details for WLAN ${wlanSummary.name} (ID: ${wlanSummary.id}):`, err)
      // Fallback: Use summary data and mark as unknown type
      fullWLANs.push({
        id: wlanSummary.id,
        zoneId,
        name: wlanSummary.name,
        ssid: wlanSummary.ssid || wlanSummary.name, // Fallback assumption
        type: 'Unknown',  // Mark for manual review
      })
    }
  }

  return fullWLANs
}

/**
 * Get AP Groups for a specific zone
 */
export async function getAPGroups(config: SmartZoneConfig, zoneId: string): Promise<SZAPGroup[]> {
  interface APGroupResponse {
    list?: SZAPGroup[]
    totalCount?: number
  }

  const response = await apiRequest<APGroupResponse>(
    config,
    `/wsg/api/public/v13_1/rkszones/${encodeURIComponent(zoneId)}/apgroups`
  )

  // SmartZone API doesn't include zoneId in response, so add it manually
  const apGroups = response.list || []
  return apGroups.map(group => ({ ...group, zoneId }))
}

/**
 * Get Access Points for a specific zone
 */
export async function getAccessPoints(
  config: SmartZoneConfig,
  zoneId: string
): Promise<SZAccessPoint[]> {
  interface APResponse {
    list?: SZAccessPoint[]
    totalCount?: number
    hasMore?: boolean
  }

  let allAPs: SZAccessPoint[] = []
  let index = 0
  const limit = 100 // Fetch in batches of 100

  while (true) {
    const response = await apiRequest<APResponse>(
      config,
      `/wsg/api/public/v13_1/aps?zoneId=${encodeURIComponent(zoneId)}&index=${index}&listSize=${limit}`
    )

    const aps = response.list || []
    allAPs = allAPs.concat(aps)

    if (!response.hasMore || aps.length < limit) {
      break
    }

    index += limit
  }

  return allAPs
}

/**
 * Get Switches (if SmartZone-managed)
 */
export async function getSwitches(config: SmartZoneConfig): Promise<SZSwitch[]> {
  try {
    interface SwitchResponse {
      list?: SZSwitch[]
      totalCount?: number
    }

    const response = await apiRequest<SwitchResponse>(
      config,
      `/wsg/api/public/v13_1/switch`
    )

    return response.list || []
  } catch (err) {
    // Switch management might not be available on all SmartZone deployments
    console.warn('Failed to fetch switches from SmartZone:', err)
    return []
  }
}

/**
 * Get RADIUS authentication/accounting services for a zone (Zone AAA)
 */
export async function getRadiusServices(
  config: SmartZoneConfig,
  zoneId: string
): Promise<SZRadiusAuthService[]> {
  try {
    interface RadiusServiceResponse {
      list?: any[]
      totalCount?: number
    }

    const response = await apiRequest<RadiusServiceResponse>(
      config,
      `/wsg/api/public/${config.apiVersion}/rkszones/${zoneId}/aaa/radius`
    )

    const services: SZRadiusAuthService[] = (response.list || []).map((svc: any) => ({
      id: svc.id,
      zoneId: zoneId,
      name: svc.name || `RADIUS-${svc.id}`,
      description: svc.description,
      type: svc.type === 'ACCOUNTING' ? 'Accounting' : 'Authentication',
      primary: {
        ip: svc.primary?.ip || svc.primaryServer?.ip,
        port: svc.primary?.port || svc.primaryServer?.port || 1812,
        sharedSecret: svc.primary?.sharedSecret || svc.primaryServer?.sharedSecret,
      },
      secondary: svc.secondary?.ip || svc.secondaryServer?.ip ? {
        ip: svc.secondary?.ip || svc.secondaryServer?.ip,
        port: svc.secondary?.port || svc.secondaryServer?.port || 1812,
        sharedSecret: svc.secondary?.sharedSecret || svc.secondaryServer?.sharedSecret,
      } : undefined,
    }))

    console.log(`Fetched ${services.length} Zone AAA RADIUS services for zone ${zoneId}`)
    return services
  } catch (err) {
    console.warn(`Failed to fetch Zone AAA RADIUS services for zone ${zoneId}:`, err)
    return []
  }
}

/**
 * Get global Authentication Service by ID
 * Used for External DPSK and Enterprise/AAA WLANs
 *
 * Endpoint: /wsg/api/public/v13_1/services/auth/radius/{id}
 */
export async function getAuthenticationService(
  config: SmartZoneConfig,
  serviceId: string
): Promise<SZRadiusAuthService | null> {
  try {
    const endpoint = `/wsg/api/public/${config.apiVersion}/services/auth/radius/${serviceId}`

    const svc = await apiRequest<any>(config, endpoint)

    if (svc && svc.id) {
      const service: SZRadiusAuthService = {
        id: svc.id,
        zoneId: '', // Global auth services don't belong to a specific zone
        name: svc.name || `Auth-${svc.id}`,
        description: svc.description || '',
        type: svc.type === 'ACCOUNTING' ? 'Accounting' : 'Authentication',
        primary: {
          ip: svc.primary.ip,
          port: svc.primary.port || 1812,
          sharedSecret: undefined, // SmartZone doesn't export shared secrets
        },
        secondary: svc.secondary ? {
          ip: svc.secondary.ip,
          port: svc.secondary.port || 1812,
          sharedSecret: undefined,
        } : undefined,
      }

      console.log(`✓ Fetched Authentication Service "${service.name}" (IP: ${service.primary.ip}:${service.primary.port})`)
      return service
    }

    console.warn(`Authentication Service ${serviceId} returned empty response`)
    return null
  } catch (err) {
    console.warn(`Failed to fetch Authentication Service ${serviceId}:`, err)
    return null
  }
}

/**
 * Extract all data from SmartZone for selected zones
 */
export async function extractData(
  config: SmartZoneConfig,
  selectedZoneIds: string[],
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<SmartZoneData> {
  const data: SmartZoneData = {
    zones: [],
    wlans: [],
    apGroups: [],
    accessPoints: [],
    switches: [],
    radiusServices: [],
    extractedAt: new Date().toISOString(),
    totalItems: {
      zones: 0,
      wlans: 0,
      apGroups: 0,
      aps: 0,
      switches: 0,
      radiusServices: 0,
    },
  }

  // Fetch selected zones only
  onProgress?.('zones', 0, 1)
  data.zones = await getZones(config, selectedZoneIds)
  data.totalItems.zones = data.zones.length
  onProgress?.('zones', 1, 1)

  // Fetch WLANs, AP Groups, APs, and RADIUS services for each selected zone
  for (let i = 0; i < data.zones.length; i++) {
    const zone = data.zones[i]

    // WLANs
    onProgress?.('wlans', i, data.zones.length)
    const wlans = await getWLANs(config, zone.id)
    data.wlans.push(...wlans)

    // AP Groups
    onProgress?.('apGroups', i, data.zones.length)
    const apGroups = await getAPGroups(config, zone.id)
    data.apGroups.push(...apGroups)

    // Access Points
    onProgress?.('aps', i, data.zones.length)
    const aps = await getAccessPoints(config, zone.id)
    data.accessPoints.push(...aps)

    // RADIUS Services
    onProgress?.('radiusServices', i, data.zones.length)
    const radiusServices = await getRadiusServices(config, zone.id)
    data.radiusServices.push(...radiusServices)
  }

  onProgress?.('wlans', data.zones.length, data.zones.length)
  onProgress?.('apGroups', data.zones.length, data.zones.length)
  onProgress?.('aps', data.zones.length, data.zones.length)
  onProgress?.('radiusServices', data.zones.length, data.zones.length)

  // Fetch global Authentication Services referenced by WLANs (for External DPSK and AAA)
  console.log('Checking WLANs for Authentication Service references...')
  const authServiceIds = new Set<string>()

  for (const wlan of data.wlans) {
    // External DPSK auth service
    if (wlan.externalDpsk?.authService?.id) {
      authServiceIds.add(wlan.externalDpsk.authService.id)
    }
    // AAA/802.1X auth service
    if (wlan.authServiceOrProfile?.id) {
      authServiceIds.add(wlan.authServiceOrProfile.id)
    }
    // Accounting service
    if (wlan.accountingServiceOrProfile?.id) {
      authServiceIds.add(wlan.accountingServiceOrProfile.id)
    }
  }

  console.log(`Found ${authServiceIds.size} unique Authentication Service references`)

  // Fetch each authentication service
  for (const serviceId of authServiceIds) {
    // Skip if already fetched (might be in Zone AAA RADIUS list)
    if (data.radiusServices.some(svc => svc.id === serviceId)) {
      console.log(`  - Auth Service ${serviceId} already in RADIUS services list`)
      continue
    }

    const service = await getAuthenticationService(config, serviceId)
    if (service) {
      data.radiusServices.push(service)
      console.log(`  + Added Authentication Service "${service.name}" to RADIUS services`)
    } else {
      console.warn(`  ✗ Could not fetch Authentication Service ${serviceId}`)
    }
  }

  data.totalItems.wlans = data.wlans.length
  data.totalItems.apGroups = data.apGroups.length
  data.totalItems.aps = data.accessPoints.length
  data.totalItems.radiusServices = data.radiusServices.length

  console.log(`\nTotal RADIUS services extracted: ${data.radiusServices.length}`)

  // Fetch switches (SmartZone-managed only)
  onProgress?.('switches', 0, 1)
  const switches = await getSwitches(config)
  data.switches = switches
  data.totalItems.switches = switches.length
  onProgress?.('switches', 1, 1)

  return data
}

/**
 * Logout and clear session
 */
export async function logout(config: SmartZoneConfig): Promise<void> {
  try {
    const sessionId = getCookie(sessionKey(config))
    if (sessionId) {
      await fetch(buildUrl(config, `/wsg/api/public/${config.apiVersion}/session`), {
        method: 'DELETE',
        headers: {
          'Cookie': `JSESSIONID=${sessionId}`,
        },
      })
    }
  } catch {
    // Ignore errors during logout
  } finally {
    clearCookie(sessionKey(config))
  }
}
