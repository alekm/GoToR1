/**
 * RUCKUS One API Client
 *
 * Handles authentication and API calls to RUCKUS One cloud platform
 * Based on OpenAPI 3 specifications in /docs/r1api/
 *
 * Key APIs:
 * - venue-0.2.8-public-openapi3.json - Venue management
 * - wifi-offline-17.3.3.118-public-openapi3.json - WiFi networks, AP groups, APs
 * - switch-offline-0.3.4-public-openapi3.json - Switch management
 * - mspservice-offline-0.3.3-public-openapi3.json - MSP/End Customer management
 */

export type RuckusRegion = 'na' | 'eu' | 'asia'

export interface RuckusOneCredentials {
  tenantId: string
  clientId: string
  clientSecret: string
  region?: RuckusRegion
}

export interface MspContext {
  mspId: string
  targetTenantId?: string // For MSP operations on customer tenants
}

// Token storage
const TOKEN_COOKIE_PREFIX = 'gotor1_r1_token_'
const DEFAULT_REGION: RuckusRegion = 'na'

function cookieKey(creds: RuckusOneCredentials): string {
  const region = creds.region || DEFAULT_REGION
  return `${TOKEN_COOKIE_PREFIX}${encodeURIComponent(creds.tenantId)}_${encodeURIComponent(creds.clientId)}_${region}`
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Path=/; SameSite=Lax`
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+\^])/g, '\\$1') + '=([^;]*)')
  )
  return match ? decodeURIComponent(match[1]) : null
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/`
}

import { apiFetch } from './apiClient'

/**
 * OAuth2 Authentication
 * Gets access token using client credentials flow
 */
export async function getAccessToken(creds: RuckusOneCredentials): Promise<string> {
  const key = cookieKey(creds)
  const fromCookie = getCookie(key)

  if (fromCookie) {
    return fromCookie
  }

  const region = creds.region || DEFAULT_REGION

  // Try multiple auth methods (some deployments use different patterns)
  const attempts = [
    // Preferred: client_id/client_secret in form body (tenant-scoped)
    async () => {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      })

      const response = await apiFetch(region, `/oauth2/token/${encodeURIComponent(creds.tenantId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })

      // Some deployments return token in header
      const headerToken = response.headers.get('login-token') || response.headers.get('Login-Token')
      if (response.ok) {
        if (headerToken) {
          return { access_token: headerToken }
        }
        const jsonData = await response.json()
        console.log('OAuth2 response:', jsonData) // Debug logging
        return jsonData
      }

      let errorDetail = ''
      try {
        errorDetail = JSON.stringify(await response.json())
      } catch {
        errorDetail = await response.text()
      }
      throw new Error(`${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ''}`)
    },

    // Fallback: Basic auth with tenant-scoped endpoint
    async () => {
      const body = new URLSearchParams({ grant_type: 'client_credentials' })

      const response = await apiFetch(region, `/oauth2/token/${encodeURIComponent(creds.tenantId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + btoa(`${creds.clientId}:${creds.clientSecret}`),
        },
        body: body.toString(),
      })

      if (response.ok) {
        const headerToken = response.headers.get('login-token') || response.headers.get('Login-Token')
        if (headerToken) {
          return { access_token: headerToken }
        }
        return await response.json()
      }

      throw new Error(`${response.status} ${response.statusText}`)
    },

    // Alternative: Standard OAuth2 endpoint (no tenant in path)
    async () => {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      })

      const response = await apiFetch(region, '/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })

      if (response.ok) {
        return await response.json()
      }

      throw new Error(`${response.status} ${response.statusText}`)
    },
  ]

  let lastError: unknown
  for (const attempt of attempts) {
    try {
      const data = await attempt()
      const token = data.access_token

      // Validate token before caching
      if (!token || token === 'undefined' || typeof token !== 'string' || token.trim() === '') {
        throw new Error('Invalid token received from authentication response')
      }

      const expiresIn = Math.max(60, Number(data.expires_in) || 3600)
      setCookie(key, token, expiresIn - 30) // Expire cookie 30s early for safety
      return token
    } catch (e) {
      lastError = e
      continue
    }
  }

  // All attempts failed
  if (lastError instanceof Error) {
    if (lastError.message.includes('500') || lastError.message.includes('redirect')) {
      throw new Error('Authentication failed - please check your credentials')
    }
    throw new Error(`Authentication failed: ${lastError.message}`)
  }
  throw new Error('Authentication failed - unknown error')
}

/**
 * Logout and clear cached token
 */
export async function logout(creds: RuckusOneCredentials): Promise<void> {
  clearCookie(cookieKey(creds))
}

/**
 * Generic API request helper
 */
async function apiRequest<T>(
  creds: RuckusOneCredentials,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  msp?: MspContext
): Promise<T> {
  const token = await getAccessToken(creds)
  const region = creds.region || DEFAULT_REGION

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }

  // MSP headers (if applicable)
  if (msp) {
    if (msp.targetTenantId) {
      headers['x-rks-tenantid'] = msp.targetTenantId
    }
    if (msp.mspId) {
      headers['X-MSP-ID'] = msp.mspId
    }
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  const response = await apiFetch(region, path, options)

  if (!response.ok) {
    let errorDetail = ''
    try {
      // Read as text first (can only read body once)
      const errorText = await response.text()
      try {
        // Try to parse as JSON for structured error messages
        const errorData = JSON.parse(errorText)
        errorDetail = JSON.stringify(errorData)
      } catch {
        // If not JSON, use raw text
        errorDetail = errorText
      }
    } catch {
      errorDetail = 'Unable to read error response'
    }
    throw new Error(
      `API request failed: ${response.status}${errorDetail ? ` - ${errorDetail}` : ''}`
    )
  }

  // Handle 202 Accepted responses (async operations)
  if (response.status === 202) {
    return (await response.json()) as T
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T
  }

  return (await response.json()) as T
}

/**
 * Test RUCKUS One connection
 */
export async function testConnection(
  creds: RuckusOneCredentials,
  msp?: MspContext
): Promise<{ success: boolean; error?: string }> {
  try {
    // Try to authenticate - if successful, connection is valid
    await getAccessToken(creds)

    // Optionally test with a simple API call
    // For MSP, check /organizations endpoint
    // For regular, can check /venues or similar
    const testPath = msp ? '/organizations' : '/venues'
    await apiRequest<unknown>(creds, 'GET', testPath, undefined, msp)

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ============================================================================
// VENUE MANAGEMENT
// Based on venue-0.2.8-public-openapi3.json
// ============================================================================

export interface R1Venue {
  id?: string
  name: string
  description?: string
  address: R1Address // Required by R1 API
  tags?: string[]
  isTemplate?: boolean
}

export interface R1Address {
  addressLine1?: string
  addressLine2?: string
  city: string // Required by R1 API
  state?: string
  country: string // Required by R1 API
  postalCode?: string
}

export interface R1VenueCreateResponse {
  id: string
  name: string
}

/**
 * Create a new venue
 * POST /venues
 */
export async function createVenue(
  creds: RuckusOneCredentials,
  venue: R1Venue,
  msp?: MspContext
): Promise<R1VenueCreateResponse> {
  const response = await apiRequest<any>(
    creds,
    'POST',
    '/venues',
    venue,
    msp
  )
  console.log('createVenue response:', response)

  // R1 API wraps response in { requestId: "...", response: {...} }
  const venueData = response.response || response.result || response

  if (!venueData || !venueData.id) {
    throw new Error(`Venue creation failed - no valid response. Got: ${JSON.stringify(response)}`)
  }

  return venueData
}

/**
 * List all venues
 * GET /venues
 */
export async function listVenues(
  creds: RuckusOneCredentials,
  msp?: MspContext
): Promise<R1Venue[]> {
  const response = await apiRequest<{ list?: R1Venue[] }>(creds, 'GET', '/venues', undefined, msp)
  return response.list || []
}

/**
 * Get venue by ID
 * GET /venues/{venueId}
 */
export async function getVenue(
  creds: RuckusOneCredentials,
  venueId: string,
  msp?: MspContext
): Promise<R1Venue> {
  return await apiRequest<R1Venue>(creds, 'GET', `/venues/${venueId}`, undefined, msp)
}

// ============================================================================
// WIFI NETWORK MANAGEMENT
// Based on wifi-offline-17.3.3.118-public-openapi3.json
// ============================================================================

export type R1WifiSecurityType = 'open' | 'psk' | 'aaa'

export interface R1WifiNetwork {
  id?: string
  name: string
  ssid: string
  securityType: R1WifiSecurityType
  encryption?: 'aes' | 'tkip'
  passphrase?: string // For PSK
  vlanId?: number
  enabled?: boolean
  // AAA-specific fields
  authServiceId?: string
  accountingServiceId?: string
  // Additional fields
  description?: string
}

export interface R1WifiNetworkCreateResponse {
  id: string
}

/**
 * Create WiFi network (WLAN)
 * POST /wifiNetworks
 */
export async function createWifiNetwork(
  creds: RuckusOneCredentials,
  network: R1WifiNetwork,
  msp?: MspContext
): Promise<R1WifiNetworkCreateResponse> {
  // Transform to appropriate schema based on security type
  let payload: unknown

  if (network.securityType === 'open') {
    payload = {
      type: 'open',
      name: network.name,
      description: network.description,
      wlan: {
        ssid: network.ssid,
        enabled: network.enabled ?? true,
        vlanId: network.vlanId,
        wlanSecurity: 'Open',
      },
    }
  } else if (network.securityType === 'psk') {
    payload = {
      type: 'psk',
      name: network.name,
      description: network.description,
      wlan: {
        ssid: network.ssid,
        enabled: network.enabled ?? true,
        vlanId: network.vlanId,
        passphrase: network.passphrase,
        wlanSecurity: network.encryption === 'tkip' ? 'WPA_Mixed' : 'WPA2',
      },
    }
  } else if (network.securityType === 'aaa') {
    payload = {
      type: 'aaa',
      name: network.name,
      description: network.description,
      wlan: {
        ssid: network.ssid,
        enabled: network.enabled ?? true,
        vlanId: network.vlanId,
        wlanSecurity: 'WPA2_802_1X',
        authenticationServiceId: network.authServiceId,
        accountingServiceId: network.accountingServiceId,
      },
    }
  }

  const response = await apiRequest<any>(
    creds,
    'POST',
    '/wifiNetworks',
    payload,
    msp
  )

  console.log('createWifiNetwork response:', response)

  // R1 API may return different response structures
  const networkData = response.result || response.response || response

  if (!networkData || !networkData.id) {
    throw new Error(`WiFi network creation failed - unexpected response structure. Got: ${JSON.stringify(response)}`)
  }

  return { id: networkData.id }
}

/**
 * List WiFi networks
 * GET /wifiNetworks
 */
export async function listWifiNetworks(
  creds: RuckusOneCredentials,
  msp?: MspContext
): Promise<R1WifiNetwork[]> {
  const response = await apiRequest<{ list?: R1WifiNetwork[] }>(
    creds,
    'GET',
    '/wifiNetworks',
    undefined,
    msp
  )
  return response.list || []
}

// ============================================================================
// AP GROUP MANAGEMENT
// Based on wifi-offline-17.3.3.118-public-openapi3.json
// ============================================================================

export interface R1APGroup {
  id?: string
  name: string
  description?: string
  venueId: string
}

export interface R1APGroupCreateResponse {
  id: string
}

/**
 * Create AP Group in a venue
 * POST /venues/{venueId}/apGroups
 */
export async function createAPGroup(
  creds: RuckusOneCredentials,
  apGroup: R1APGroup,
  msp?: MspContext
): Promise<R1APGroupCreateResponse> {
  const response = await apiRequest<any>(
    creds,
    'POST',
    `/venues/${apGroup.venueId}/apGroups`,
    {
      name: apGroup.name,
      description: apGroup.description,
    },
    msp
  )

  console.log('createAPGroup response:', response)

  // R1 API may return different response structures
  const apGroupData = response.result || response.response || response

  if (!apGroupData || !apGroupData.id) {
    throw new Error(`AP Group creation failed - unexpected response structure. Got: ${JSON.stringify(response)}`)
  }

  return { id: apGroupData.id }
}

/**
 * List AP Groups in a venue
 * GET /venues/{venueId}/apGroups
 */
export async function listAPGroups(
  creds: RuckusOneCredentials,
  venueId: string,
  msp?: MspContext
): Promise<R1APGroup[]> {
  const response = await apiRequest<{ list?: R1APGroup[] }>(
    creds,
    'GET',
    `/venues/${venueId}/apGroups`,
    undefined,
    msp
  )
  return response.list || []
}

// ============================================================================
// ACCESS POINT MANAGEMENT
// Based on wifi-offline-17.3.3.118-public-openapi3.json
// ============================================================================

export interface R1AccessPoint {
  serialNumber: string
  name: string
  description?: string
  model?: string
  tags?: string[]
  deviceGps?: {
    latitude: string
    longitude: string
  }
  venueId?: string
  apGroupId?: string
}

export interface R1APUploadResult {
  success: R1AccessPoint[]
  failed: Array<{ ap: R1AccessPoint; error: string }>
}

/**
 * Batch upload Access Points
 * POST /venues/aps
 */
export async function batchUploadAPs(
  creds: RuckusOneCredentials,
  aps: R1AccessPoint[],
  onProgress?: (completed: number, total: number) => void,
  msp?: MspContext
): Promise<R1APUploadResult> {
  const result: R1APUploadResult = {
    success: [],
    failed: [],
  }

  // Upload in batches to avoid overwhelming the API
  const batchSize = 50
  const batches = Math.ceil(aps.length / batchSize)

  for (let i = 0; i < batches; i++) {
    const start = i * batchSize
    const end = Math.min(start + batchSize, aps.length)
    const batch = aps.slice(start, end)

    try {
      await apiRequest<unknown>(creds, 'POST', '/venues/aps', batch, msp)

      // If successful, add all APs in batch to success list
      result.success.push(...batch)
    } catch (err) {
      // If batch fails, add all to failed list
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      batch.forEach((ap) => {
        result.failed.push({ ap, error: errorMsg })
      })
    }

    onProgress?.(end, aps.length)
  }

  return result
}

/**
 * Assign APs to AP Group
 * POST /venues/{venueId}/apGroups/{apGroupId}/aps
 */
export async function assignAPsToGroup(
  creds: RuckusOneCredentials,
  venueId: string,
  apGroupId: string,
  serialNumbers: string[],
  msp?: MspContext
): Promise<void> {
  await apiRequest<unknown>(
    creds,
    'POST',
    `/venues/${venueId}/apGroups/${apGroupId}/aps`,
    { serialNumbers },
    msp
  )
}

// ============================================================================
// SWITCH MANAGEMENT
// Based on switch-offline-0.3.4-public-openapi3.json
// ============================================================================

export interface R1Switch {
  serialNumber: string
  name: string
  description?: string
  model?: string
  location?: string
  tags?: string[]
  venueId?: string
}

export interface R1SwitchUploadResult {
  success: R1Switch[]
  failed: Array<{ sw: R1Switch; error: string }>
}

/**
 * Batch upload Switches
 * POST /switches (path TBD - needs verification from API spec)
 */
export async function batchUploadSwitches(
  creds: RuckusOneCredentials,
  switches: R1Switch[],
  onProgress?: (completed: number, total: number) => void,
  msp?: MspContext
): Promise<R1SwitchUploadResult> {
  const result: R1SwitchUploadResult = {
    success: [],
    failed: [],
  }

  // Upload in batches
  const batchSize = 25
  const batches = Math.ceil(switches.length / batchSize)

  for (let i = 0; i < batches; i++) {
    const start = i * batchSize
    const end = Math.min(start + batchSize, switches.length)
    const batch = switches.slice(start, end)

    try {
      await apiRequest<unknown>(creds, 'POST', '/switches', batch, msp)
      result.success.push(...batch)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      batch.forEach((sw) => {
        result.failed.push({ sw, error: errorMsg })
      })
    }

    onProgress?.(end, switches.length)
  }

  return result
}

// ============================================================================
// RF / RADIO SETTINGS
// Based on wifi-offline-17.3.3.118-public-openapi3.json
// ============================================================================

export interface R1RadioParams24G {
  allowedChannels?: string[] // ['1', '2', '3', ..., '13']
  changeInterval?: number // 1-100, default 33
  channelBandwidth?: 'AUTO' | '20MHz' | '40MHz'
  method?: 'MANUAL' | 'BACKGROUND_SCANNING' | 'CHANNELFLY'
  scanInterval?: number // 1-65535, default 20
  txPower?: 'Auto' | 'MAX' | '-1' | '-2' | '-3' | '-4' | '-5' | '-6' | '-7' | '-8' | '-9' | '-10' | 'MIN'
}

export interface R1RadioParams50G {
  allowedChannels?: string[] // Channel numbers as strings
  changeInterval?: number
  channelBandwidth?: 'AUTO' | '20MHz' | '40MHz' | '80MHz' | '160MHz'
  method?: 'MANUAL' | 'BACKGROUND_SCANNING' | 'CHANNELFLY'
  scanInterval?: number
  txPower?: 'Auto' | 'MAX' | '-1' | '-2' | '-3' | '-4' | '-5' | '-6' | '-7' | '-8' | '-9' | '-10' | 'MIN'
}

export interface R1VenueRadioCustomization {
  radioParams24G?: R1RadioParams24G
  radioParams50G?: R1RadioParams50G
  // radioParams6G and radioParamsDual5G also available but not commonly used
}

/**
 * Update venue radio settings
 * PUT /venues/{venueId}/radioSettings
 */
export async function updateVenueRadioSettings(
  creds: RuckusOneCredentials,
  venueId: string,
  radioSettings: R1VenueRadioCustomization,
  msp?: MspContext
): Promise<void> {
  await apiRequest<unknown>(
    creds,
    'PUT',
    `/venues/${venueId}/radioSettings`,
    radioSettings,
    msp
  )
}

/**
 * Get venue radio settings
 * GET /venues/{venueId}/radioSettings
 */
export async function getVenueRadioSettings(
  creds: RuckusOneCredentials,
  venueId: string,
  msp?: MspContext
): Promise<R1VenueRadioCustomization> {
  return await apiRequest<R1VenueRadioCustomization>(
    creds,
    'GET',
    `/venues/${venueId}/radioSettings`,
    undefined,
    msp
  )
}

// ============================================================================
// MSP / END CUSTOMER MANAGEMENT
// Based on mspservice-offline-0.3.3-public-openapi3.json
// ============================================================================

export interface R1EndCustomer {
  id?: string
  name: string
  description?: string
  tenantId?: string
}

/**
 * Create End Customer (MSP only)
 * POST /mspCustomers
 */
export async function createEndCustomer(
  creds: RuckusOneCredentials,
  customer: R1EndCustomer,
  msp: MspContext
): Promise<{ id: string; tenantId: string }> {
  const response = await apiRequest<{ result?: { id: string; tenantId: string } }>(
    creds,
    'POST',
    '/mspCustomers',
    customer,
    msp
  )

  if (!response.result) {
    throw new Error('End Customer creation failed - no result in response')
  }

  return response.result
}

/**
 * List End Customers (MSP only)
 * GET /mspCustomers
 */
export async function listEndCustomers(
  creds: RuckusOneCredentials,
  msp: MspContext
): Promise<R1EndCustomer[]> {
  const response = await apiRequest<{ list?: R1EndCustomer[] }>(
    creds,
    'GET',
    '/mspCustomers',
    undefined,
    msp
  )
  return response.list || []
}
