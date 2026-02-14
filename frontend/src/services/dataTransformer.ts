/**
 * Data Transformer
 *
 * Transforms SmartZone data structures to RUCKUS One format
 */

import type {
  SmartZoneData,
  RuckusOneData,
  SZZone,
  SZWLAN,
  SZAPGroup,
  SZAccessPoint,
  SZSwitch,
  R1Venue,
  R1Network,
  R1APGroup,
  R1AccessPoint,
  R1Switch,
} from '../types/migration'

/**
 * Security type mapping from SmartZone to RUCKUS One
 */
const SECURITY_TYPE_MAP: Record<string, string> = {
  Standard_Open: 'open',
  Standard: 'psk',
  Standard_8021X: 'aaa',
  Standard_MAC: 'aaa', // MAC auth uses AAA in R1
  Hotspot: 'open', // Simplified - actual Hotspot config more complex
  'Hotspot_MAC': 'aaa',
  'Hotspot_8021X': 'aaa',
  Guest: 'open',
  Web_Auth: 'open',
}

/**
 * Transform complete SmartZone data to RUCKUS One format
 */
export function transformData(szData: SmartZoneData): RuckusOneData {
  return {
    venues: transformZonesToVenues(szData.zones),
    networks: transformWLANsToNetworks(szData.wlans, szData.zones),
    apGroups: transformAPGroups(szData.apGroups, szData.zones),
    accessPoints: transformAccessPoints(szData.accessPoints, szData.zones, szData.apGroups),
    switches: transformSwitches(szData.switches, szData.zones),
    transformedAt: new Date().toISOString(),
  }
}

// ============================================================================
// ZONES → VENUES
// ============================================================================

export function transformZonesToVenues(zones: SZZone[]): R1Venue[] {
  return zones.map((zone) => ({
    name: zone.name,
    description: zone.description
      ? `${zone.description} [Migrated from SmartZone]`
      : 'Migrated from SmartZone',
    sourceZoneId: zone.id,
    // Address and location will be set by user in Step 6
  }))
}

// ============================================================================
// WLANs → NETWORKS
// ============================================================================

export function transformWLANsToNetworks(wlans: SZWLAN[], zones: SZZone[]): R1Network[] {
  return wlans.map((wlan) => {
    const zone = zones.find((z) => z.id === wlan.zoneId)
    const securityType = mapSecurityType(wlan.type)

    // Base network configuration
    const network: R1Network & { _zoneName?: string } = {
      name: wlan.name,
      wlan: {
        ssid: wlan.ssid,
        enabled: true,
        wlanSecurity: securityType,
        encryption: wlan.encryption?.method === 'AES' ? 'aes' : undefined,
        vlanId: wlan.vlan?.accessVlan,
      },
      sourceWlanId: wlan.id,
      _zoneName: zone?.name,
    }

    // Add passphrase for PSK networks
    if (securityType === 'psk' && wlan.passphrase) {
      network.wlan.passphrase = wlan.passphrase
    }

    // Add AAA service references if available (must be manually mapped to R1 services)
    if (securityType === 'aaa') {
      // Note: authService and accountingService IDs from SmartZone won't match R1
      // These will need to be manually mapped in Step 7 or later
      if (wlan.authService?.id) {
        network.authServiceOrProfile = { id: wlan.authService.id }
      }
      if (wlan.accountingService?.id) {
        network.accountingServiceOrProfile = { id: wlan.accountingService.id }
      }
    }

    return network
  })
}

function mapSecurityType(szType: string): string {
  return SECURITY_TYPE_MAP[szType] || 'open'
}

// ============================================================================
// AP GROUPS → AP GROUPS
// ============================================================================

export function transformAPGroups(apGroups: SZAPGroup[], zones: SZZone[]): R1APGroup[] {
  return apGroups.map((group) => {
    const zone = zones.find((z) => z.id === group.zoneId)

    return {
      name: group.name,
      description: group.description
        ? `${group.description} [Migrated from SmartZone]`
        : `Migrated from SmartZone zone: ${zone?.name || group.zoneId}`,
      sourceApGroupId: group.id,
      // venueId will be set during migration (Step 6)
      _zoneName: zone?.name,
      _wlanNames: group.wlans?.map((w) => w.name),
    } as R1APGroup & { _zoneName?: string; _wlanNames?: string[] }
  })
}

// ============================================================================
// ACCESS POINTS → ACCESS POINTS
// ============================================================================

export function transformAccessPoints(
  aps: SZAccessPoint[],
  zones: SZZone[],
  apGroups: SZAPGroup[]
): R1AccessPoint[] {
  return aps.map((ap) => {
    const zone = zones.find((z) => z.id === ap.zoneId)
    const apGroup = apGroups.find((g) => g.id === ap.apGroupId)

    const tags: string[] = ['migrated-from-sz']
    if (zone?.name) {
      tags.push(`zone:${zone.name}`)
    }
    if (apGroup?.name) {
      tags.push(`apgroup:${apGroup.name}`)
    }

    return {
      name: ap.name,
      serialNumber: ap.serial,
      description: ap.description || `Migrated from SmartZone zone: ${zone?.name || ap.zoneId}`,
      model: ap.model,
      tags,
      deviceGps: ap.gps
        ? {
            latitude: ap.gps.latitude,
            longitude: ap.gps.longitude,
          }
        : undefined,
      apGroupName: apGroup?.name,
      sourceSerial: ap.serial,
      _zoneName: zone?.name,
      _apGroupName: apGroup?.name,
    } as R1AccessPoint & { _zoneName?: string; _apGroupName?: string }
  })
}

// ============================================================================
// SWITCHES → SWITCHES
// ============================================================================

export function transformSwitches(switches: SZSwitch[], zones: SZZone[]): R1Switch[] {
  return switches.map((sw) => {
    const zone = sw.zoneId ? zones.find((z) => z.id === sw.zoneId) : undefined

    const tags: string[] = ['migrated-from-sz']
    if (sw.managedBy === 'smartzone') {
      tags.push('smartzone-managed')
    } else if (sw.managedBy === 'csv') {
      tags.push('csv-import')
    } else if (sw.managedBy === 'manual') {
      tags.push('manual-entry')
    }
    if (zone?.name) {
      tags.push(`zone:${zone.name}`)
    }

    return {
      name: sw.name,
      serialNumber: sw.serial,
      description: sw.description || sw.location || `Migrated from SmartZone`,
      model: sw.model,
      location: sw.location,
      tags,
      sourceSerial: sw.serial,
      managedBy: sw.managedBy,
      portConfigs: sw.ports?.map((port) => ({
        portNumber: port.portNumber,
        vlanId: port.vlanId,
        poeEnabled: port.poeEnabled,
        description: port.description,
      })),
      _zoneName: zone?.name,
    } as R1Switch & { _zoneName?: string }
  })
}

// ============================================================================
// FIELD MAPPING UTILITIES
// ============================================================================

/**
 * Sanitize AP name for RUCKUS One
 * R1 pattern: (?=^((?!`|\$\()[ -_a-~]){2,32}$)^(\S.*\S)$
 */
export function sanitizeAPName(name: string): string {
  // Remove invalid characters
  let sanitized = name.replace(/[`$()]/g, '')

  // Ensure 2-32 chars
  if (sanitized.length < 2) {
    sanitized = sanitized.padEnd(2, '-')
  }
  if (sanitized.length > 32) {
    sanitized = sanitized.substring(0, 32)
  }

  // Ensure not just whitespace
  if (!sanitized.trim()) {
    sanitized = 'AP-' + name.substring(0, 29)
  }

  return sanitized
}

/**
 * Sanitize serial number for RUCKUS One
 * R1 pattern: ^[1-9][0-9]{11}$ (12 digits, not starting with 0)
 */
export function sanitizeSerial(serial: string): string {
  // Remove non-digit characters
  const digits = serial.replace(/\D/g, '')

  // Ensure 12 digits
  if (digits.length < 12) {
    return digits.padStart(12, '1')
  }
  if (digits.length > 12) {
    return digits.substring(0, 12)
  }

  // Ensure doesn't start with 0
  if (digits[0] === '0') {
    return '1' + digits.substring(1)
  }

  return digits
}

/**
 * Validate GPS coordinates
 */
export function isValidGPS(latitude: string, longitude: string): boolean {
  const lat = parseFloat(latitude)
  const lng = parseFloat(longitude)
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/**
 * Get encryption type from SmartZone encryption config
 */
export function getEncryptionType(encryption?: { method: string; algorithm: string }): 'aes' | 'tkip' | undefined {
  if (!encryption) return undefined
  if (encryption.method === 'AES' || encryption.algorithm === 'AES') {
    return 'aes'
  }
  if (encryption.algorithm === 'TKIP') {
    return 'tkip'
  }
  return 'aes' // Default to AES
}

/**
 * Generate venue address from zone info (if available)
 */
export function generateVenueAddress(_zone: SZZone): string | undefined {
  // SmartZone zones don't typically have address info
  // This would need to be set manually in Step 6
  return undefined
}

/**
 * Get security type display name
 */
export function getSecurityTypeDisplay(szType: string): string {
  const r1Type = mapSecurityType(szType)
  switch (r1Type) {
    case 'open':
      return 'Open'
    case 'psk':
      return 'WPA2-Personal'
    case 'aaa':
      return 'WPA2-Enterprise'
    default:
      return szType
  }
}
