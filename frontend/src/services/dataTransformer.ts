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
 * Security type mapping from SmartZone to RUCKUS One API types
 */
const SECURITY_TYPE_MAP: Record<string, 'STANDARD_OPEN' | 'STANDARD' | 'STANDARD_8021X'> = {
  Standard_Open: 'STANDARD_OPEN',
  Standard: 'STANDARD',
  Standard_8021X: 'STANDARD_8021X',
  Standard_MAC: 'STANDARD_8021X', // MAC auth uses 802.1X in R1
  Hotspot: 'STANDARD_OPEN', // Simplified - actual Hotspot config more complex
  'Hotspot_MAC': 'STANDARD_8021X',
  'Hotspot_8021X': 'STANDARD_8021X',
  Guest: 'STANDARD_OPEN',
  Web_Auth: 'STANDARD_OPEN',
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
    const r1Type = mapSecurityType(wlan.type)

    // Base network configuration (R1 API format)
    const network: R1Network & { _zoneName?: string } = {
      name: wlan.name,
      ssid: wlan.ssid,
      type: r1Type,
      enabled: true,
      sourceWlanId: wlan.id,
      _zoneName: zone?.name,
    }

    // Add encryption for PSK and AAA networks
    if (r1Type === 'STANDARD' || r1Type === 'STANDARD_8021X') {
      network.encryption = {
        method: wlan.encryption?.method === 'WPA' ? 'WPA' : 'AES',
        algorithm: wlan.encryption?.algorithm === 'TKIP' ? 'TKIP' : 'AES',
      }
    } else {
      // Open network
      network.encryption = { method: 'None' }
    }

    // Add passphrase for PSK networks (REQUIRED for type='STANDARD')
    if (r1Type === 'STANDARD') {
      if (wlan.passphrase) {
        network.passphrase = wlan.passphrase
      }
      // Note: If passphrase is missing, validator will flag this as an error
    }

    // Add VLAN if configured
    if (wlan.vlan?.accessVlan) {
      network.vlan = { accessVlan: wlan.vlan.accessVlan }
    }

    // Add AAA service references if available (must be manually mapped to R1 services)
    if (r1Type === 'STANDARD_8021X') {
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

function mapSecurityType(szType: string): 'STANDARD_OPEN' | 'STANDARD' | 'STANDARD_8021X' {
  return SECURITY_TYPE_MAP[szType] || 'STANDARD_OPEN'
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
      name: sanitizeAPName(ap.name),
      serialNumber: sanitizeSerial(ap.serial),
      description: ap.description || `Migrated from SmartZone zone: ${zone?.name || ap.zoneId}`,
      model: ap.model,
      tags,
      deviceGps: ap.gps
        ? {
            latitude: ap.gps.latitude.toString(),
            longitude: ap.gps.longitude.toString(),
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
    case 'STANDARD_OPEN':
      return 'Open'
    case 'STANDARD':
      return 'WPA2-Personal (PSK)'
    case 'STANDARD_8021X':
      return 'WPA2-Enterprise (802.1X)'
    default:
      return szType
  }
}

// ============================================================================
// RF SETTINGS TRANSFORMATION
// ============================================================================

/**
 * Transform SmartZone zone RF settings to RUCKUS One venue radio settings
 */
export function transformRFSettings(zone: SZZone): any {
  const radioSettings: any = {}

  // SmartZone stores RF config in radioConfig.radio24g, radio5g, and radio6g (7.x+)
  const radio24g = (zone as any).radioConfig?.radio24g
  const radio5g = (zone as any).radioConfig?.radio5g
  const radio6g = (zone as any).radioConfig?.radio6g  // Wi-Fi 6E support (SmartZone 7.x+)

  // 2.4GHz settings
  if (radio24g) {
    radioSettings.radioParams24G = {}

    // Channel bandwidth (SmartZone: channelWidth in MHz number, R1: string with 'MHz')
    if (radio24g.channelWidth) {
      radioSettings.radioParams24G.channelBandwidth = radio24g.channelWidth === 40 ? '40MHz' : '20MHz'
    }

    // Channel selection method (SmartZone: channelSelectMode, R1: method)
    if (radio24g.autoChannelSelection?.channelSelectMode) {
      const mode = radio24g.autoChannelSelection.channelSelectMode
      if (mode === 'ChannelFly') {
        radioSettings.radioParams24G.method = 'CHANNELFLY'
      } else if (mode === 'BackgroundScanning') {
        radioSettings.radioParams24G.method = 'BACKGROUND_SCANNING'
      } else {
        radioSettings.radioParams24G.method = 'MANUAL'
      }
    }

    // TX Power (SmartZone: "Full", "Half", "Min", etc. R1: "MAX", "Auto", "-1", etc.)
    if (radio24g.txPower) {
      const power = radio24g.txPower
      if (power === 'Full') {
        radioSettings.radioParams24G.txPower = 'MAX'
      } else if (power === 'Min') {
        radioSettings.radioParams24G.txPower = 'MIN'
      } else if (power === 'Half' || power === '-3dBm') {
        radioSettings.radioParams24G.txPower = '-3'
      } else {
        radioSettings.radioParams24G.txPower = 'MAX' // Default
      }
    }

    // ACS change interval (ChannelFly MTBC - Mean Time Between Change in minutes)
    if (radio24g.autoChannelSelection?.channelFlyMtbc) {
      // Convert minutes to R1's changeInterval (need to verify R1's units)
      radioSettings.radioParams24G.changeInterval = Math.min(100, Math.max(1, radio24g.autoChannelSelection.channelFlyMtbc))
    }
  }

  // 5GHz settings
  if (radio5g) {
    radioSettings.radioParams50G = {}

    // Channel bandwidth
    if (radio5g.channelWidth) {
      const width = radio5g.channelWidth
      if (width === 160) {
        radioSettings.radioParams50G.channelBandwidth = '160MHz'
      } else if (width === 80) {
        radioSettings.radioParams50G.channelBandwidth = '80MHz'
      } else if (width === 40) {
        radioSettings.radioParams50G.channelBandwidth = '40MHz'
      } else {
        radioSettings.radioParams50G.channelBandwidth = '20MHz'
      }
    }

    // Channel selection method
    if (radio5g.autoChannelSelection?.channelSelectMode) {
      const mode = radio5g.autoChannelSelection.channelSelectMode
      if (mode === 'ChannelFly') {
        radioSettings.radioParams50G.method = 'CHANNELFLY'
      } else if (mode === 'BackgroundScanning') {
        radioSettings.radioParams50G.method = 'BACKGROUND_SCANNING'
      } else {
        radioSettings.radioParams50G.method = 'MANUAL'
      }
    }

    // TX Power
    if (radio5g.txPower) {
      const power = radio5g.txPower
      if (power === 'Full') {
        radioSettings.radioParams50G.txPower = 'MAX'
      } else if (power === 'Min') {
        radioSettings.radioParams50G.txPower = 'MIN'
      } else if (power === 'Half' || power === '-3dBm') {
        radioSettings.radioParams50G.txPower = '-3'
      } else {
        radioSettings.radioParams50G.txPower = 'MAX'
      }
    }

    // ACS change interval
    if (radio5g.autoChannelSelection?.channelFlyMtbc) {
      radioSettings.radioParams50G.changeInterval = Math.min(100, Math.max(1, radio5g.autoChannelSelection.channelFlyMtbc))
    }
  }

  // 6GHz settings (Wi-Fi 6E - SmartZone 7.x+)
  if (radio6g) {
    radioSettings.radioParams6G = {}

    // Channel bandwidth (6GHz typically supports 20/40/80/160MHz)
    if (radio6g.channelWidth) {
      const width = radio6g.channelWidth
      if (width === 160) {
        radioSettings.radioParams6G.channelBandwidth = '160MHz'
      } else if (width === 80) {
        radioSettings.radioParams6G.channelBandwidth = '80MHz'
      } else if (width === 40) {
        radioSettings.radioParams6G.channelBandwidth = '40MHz'
      } else {
        radioSettings.radioParams6G.channelBandwidth = '20MHz'
      }
    }

    // Channel selection method
    if (radio6g.autoChannelSelection?.channelSelectMode) {
      const mode = radio6g.autoChannelSelection.channelSelectMode
      if (mode === 'ChannelFly') {
        radioSettings.radioParams6G.method = 'CHANNELFLY'
      } else if (mode === 'BackgroundScanning') {
        radioSettings.radioParams6G.method = 'BACKGROUND_SCANNING'
      } else {
        radioSettings.radioParams6G.method = 'MANUAL'
      }
    }

    // TX Power
    if (radio6g.txPower) {
      const power = radio6g.txPower
      if (power === 'Full') {
        radioSettings.radioParams6G.txPower = 'MAX'
      } else if (power === 'Min') {
        radioSettings.radioParams6G.txPower = 'MIN'
      } else if (power === 'Half' || power === '-3dBm') {
        radioSettings.radioParams6G.txPower = '-3'
      } else {
        radioSettings.radioParams6G.txPower = 'MAX'
      }
    }

    // ACS change interval
    if (radio6g.autoChannelSelection?.channelFlyMtbc) {
      radioSettings.radioParams6G.changeInterval = Math.min(100, Math.max(1, radio6g.autoChannelSelection.channelFlyMtbc))
    }
  }

  return Object.keys(radioSettings).length > 0 ? radioSettings : null
}
