/**
 * Data Validator
 *
 * Pre-migration validation to detect issues before migration
 */

import type {
  SmartZoneData,
  ValidationReport,
  ValidationIssue,
  Conflict,
  UnsupportedFeature,
} from '../types/migration'

/**
 * Validate extracted SmartZone data
 */
export function validateData(data: SmartZoneData): ValidationReport {
  const issues: ValidationIssue[] = []
  const conflicts: Conflict[] = []
  const unsupportedFeatures: UnsupportedFeature[] = []
  const recommendations: string[] = []

  // 1. Duplicate Detection
  checkDuplicateAPNames(data, conflicts)
  checkDuplicateSerials(data, conflicts)
  checkDuplicateSSIDs(data, conflicts)

  // 2. Dependency Validation
  checkWLANDependencies(data, issues)
  checkAPDependencies(data, issues)

  // 3. Data Integrity
  checkAPNames(data, issues)
  checkSerialNumbers(data, issues)
  checkGPSCoordinates(data, issues, recommendations)
  checkSSIDNames(data, issues)

  // 4. Compatibility Check
  checkUnsupportedWLANFeatures(data, unsupportedFeatures)
  checkSecurityTypes(data, issues, recommendations)

  const summary = {
    totalAPs: data.totalItems.aps,
    totalWLANs: data.totalItems.wlans,
    totalAPGroups: data.totalItems.apGroups,
    totalVenues: data.totalItems.zones,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    conflicts: conflicts.filter((c) => c.severity === 'blocker').length,
  }

  return {
    timestamp: new Date().toISOString(),
    summary,
    issues,
    conflicts,
    unsupportedFeatures,
    recommendations,
  }
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

function checkDuplicateAPNames(data: SmartZoneData, conflicts: Conflict[]) {
  const nameMap = new Map<string, string[]>()

  // Group APs by name
  data.accessPoints.forEach((ap) => {
    const existing = nameMap.get(ap.name) || []
    nameMap.set(ap.name, [...existing, ap.serial])
  })

  // Find duplicates
  nameMap.forEach((serials, name) => {
    if (serials.length > 1) {
      conflicts.push({
        type: 'duplicate_name',
        severity: 'blocker',
        items: serials.map((serial) => ({
          source: 'smartzone',
          id: serial,
          name: name,
        })),
        resolution: `Rename APs to ensure unique names (e.g., ${name}-1, ${name}-2)`,
      })
    }
  })
}

function checkDuplicateSerials(data: SmartZoneData, conflicts: Conflict[]) {
  const serialMap = new Map<string, number>()

  // Count occurrences of each serial
  data.accessPoints.forEach((ap) => {
    serialMap.set(ap.serial, (serialMap.get(ap.serial) || 0) + 1)
  })

  data.switches.forEach((sw) => {
    serialMap.set(sw.serial, (serialMap.get(sw.serial) || 0) + 1)
  })

  // Find duplicates
  serialMap.forEach((count, serial) => {
    if (count > 1) {
      conflicts.push({
        type: 'duplicate_serial',
        severity: 'blocker',
        items: [
          {
            source: 'smartzone',
            id: serial,
            name: serial,
          },
        ],
        resolution: `Serial number ${serial} appears ${count} times - check for data errors`,
      })
    }
  })
}

function checkDuplicateSSIDs(data: SmartZoneData, conflicts: Conflict[]) {
  // Group WLANs by zone and SSID
  const zoneSSIDMap = new Map<string, Map<string, string[]>>()

  data.wlans.forEach((wlan) => {
    if (!zoneSSIDMap.has(wlan.zoneId)) {
      zoneSSIDMap.set(wlan.zoneId, new Map())
    }
    const ssidMap = zoneSSIDMap.get(wlan.zoneId)!
    const existing = ssidMap.get(wlan.ssid) || []
    ssidMap.set(wlan.ssid, [...existing, wlan.id])
  })

  // Find duplicates within same zone
  zoneSSIDMap.forEach((ssidMap, zoneId) => {
    const zone = data.zones.find((z) => z.id === zoneId)
    ssidMap.forEach((wlanIds, ssid) => {
      if (wlanIds.length > 1) {
        conflicts.push({
          type: 'duplicate_name',
          severity: 'warning', // Warning because R1 allows duplicate SSIDs across venues
          items: wlanIds.map((id) => ({
            source: 'smartzone',
            id: id,
            name: ssid,
          })),
          resolution: `SSID "${ssid}" appears ${wlanIds.length} times in zone "${zone?.name || zoneId}". This may be intentional.`,
        })
      }
    })
  })
}

// ============================================================================
// DEPENDENCY VALIDATION
// ============================================================================

function checkWLANDependencies(data: SmartZoneData, issues: ValidationIssue[]) {
  // Check that WLANs reference valid zones
  data.wlans.forEach((wlan) => {
    const zone = data.zones.find((z) => z.id === wlan.zoneId)
    if (!zone) {
      issues.push({
        severity: 'error',
        category: 'wlan',
        message: `WLAN "${wlan.name}" references non-existent zone ${wlan.zoneId}`,
        affectedItems: [wlan.id],
        suggestion: 'Remove this WLAN or verify zone selection',
      })
    }
  })
}

function checkAPDependencies(data: SmartZoneData, issues: ValidationIssue[]) {
  // Check that APs reference valid zones and AP groups
  data.accessPoints.forEach((ap) => {
    const zone = data.zones.find((z) => z.id === ap.zoneId)
    if (!zone) {
      issues.push({
        severity: 'error',
        category: 'ap',
        message: `AP "${ap.name}" references non-existent zone ${ap.zoneId}`,
        affectedItems: [ap.serial],
        suggestion: 'Remove this AP or verify zone selection',
      })
    }

    if (ap.apGroupId) {
      const apGroup = data.apGroups.find((g) => g.id === ap.apGroupId)
      if (!apGroup) {
        issues.push({
          severity: 'warning',
          category: 'ap',
          message: `AP "${ap.name}" references non-existent AP Group ${ap.apGroupId}`,
          affectedItems: [ap.serial],
          suggestion: 'AP will be migrated without AP Group assignment',
        })
      }
    }
  })
}

// ============================================================================
// DATA INTEGRITY
// ============================================================================

function checkAPNames(data: SmartZoneData, issues: ValidationIssue[]) {
  const invalidNames: string[] = []

  data.accessPoints.forEach((ap) => {
    // Check length (R1 requires 2-32 chars)
    if (ap.name.length < 2 || ap.name.length > 32) {
      invalidNames.push(ap.serial)
    }

    // Check for invalid characters (R1 pattern: (?=^((?!`|\$\()[ -_a-~]){2,32}$)^(\S.*\S)$)
    if (ap.name.includes('`') || ap.name.includes('$(')) {
      invalidNames.push(ap.serial)
    }
  })

  if (invalidNames.length > 0) {
    issues.push({
      severity: 'error',
      category: 'ap',
      message: `${invalidNames.length} AP names are invalid for RUCKUS One`,
      affectedItems: invalidNames,
      suggestion: 'AP names must be 2-32 characters and not contain ` or $(',
    })
  }
}

function checkSerialNumbers(data: SmartZoneData, issues: ValidationIssue[]) {
  const invalidSerials: string[] = []

  // R1 AP serial pattern: ^[1-9][0-9]{11}$ (12 digits, not starting with 0)
  const serialPattern = /^[1-9][0-9]{11}$/

  data.accessPoints.forEach((ap) => {
    if (!serialPattern.test(ap.serial)) {
      invalidSerials.push(ap.serial)
    }
  })

  if (invalidSerials.length > 0) {
    issues.push({
      severity: 'error',
      category: 'ap',
      message: `${invalidSerials.length} AP serial numbers are invalid for RUCKUS One`,
      affectedItems: invalidSerials,
      suggestion: 'AP serial numbers must be 12 digits, starting with 1-9',
    })
  }
}

function checkGPSCoordinates(
  data: SmartZoneData,
  issues: ValidationIssue[],
  recommendations: string[]
) {
  const missingGPS = data.accessPoints.filter((ap) => !ap.gps).map((ap) => ap.serial)

  if (missingGPS.length > 0) {
    issues.push({
      severity: 'info',
      category: 'ap',
      message: `${missingGPS.length} of ${data.totalItems.aps} APs are missing GPS coordinates`,
      affectedItems: missingGPS,
      suggestion: 'GPS coordinates can be added in RUCKUS One after migration',
    })

    recommendations.push(
      `Consider adding GPS coordinates to ${missingGPS.length} APs for better location tracking in RUCKUS One`
    )
  }

  // Validate GPS ranges for APs that have coordinates
  const invalidGPS: string[] = []
  data.accessPoints.forEach((ap) => {
    if (ap.gps) {
      const lat = parseFloat(ap.gps.latitude)
      const lng = parseFloat(ap.gps.longitude)
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        invalidGPS.push(ap.serial)
      }
    }
  })

  if (invalidGPS.length > 0) {
    issues.push({
      severity: 'warning',
      category: 'ap',
      message: `${invalidGPS.length} APs have invalid GPS coordinates`,
      affectedItems: invalidGPS,
      suggestion: 'Latitude must be -90 to 90, longitude must be -180 to 180',
    })
  }
}

function checkSSIDNames(data: SmartZoneData, issues: ValidationIssue[]) {
  const invalidSSIDs: string[] = []

  data.wlans.forEach((wlan) => {
    // Check length (1-32 chars)
    if (wlan.ssid.length < 1 || wlan.ssid.length > 32) {
      invalidSSIDs.push(wlan.id)
    }
  })

  if (invalidSSIDs.length > 0) {
    issues.push({
      severity: 'error',
      category: 'wlan',
      message: `${invalidSSIDs.length} SSID names are invalid`,
      affectedItems: invalidSSIDs,
      suggestion: 'SSID names must be 1-32 characters',
    })
  }
}

// ============================================================================
// COMPATIBILITY CHECK
// ============================================================================

function checkUnsupportedWLANFeatures(data: SmartZoneData, unsupportedFeatures: UnsupportedFeature[]) {
  // Check for Hotspot 2.0
  const hotspot20WLANs = data.wlans.filter((w) => w.type.toLowerCase().includes('hotspot'))
  if (hotspot20WLANs.length > 0) {
    unsupportedFeatures.push({
      feature: 'Hotspot 2.0',
      type: 'wlan',
      affectedItems: hotspot20WLANs.map((w) => w.name),
      workaround: 'RUCKUS One has limited Hotspot 2.0 support. Review configurations manually.',
    })
  }

  // Check for WeChat
  const wechatWLANs = data.wlans.filter((w) => w.type.toLowerCase().includes('wechat'))
  if (wechatWLANs.length > 0) {
    unsupportedFeatures.push({
      feature: 'WeChat Authentication',
      type: 'wlan',
      affectedItems: wechatWLANs.map((w) => w.name),
      workaround: 'WeChat authentication is not supported in RUCKUS One. Use alternative auth methods.',
    })
  }
}

function checkSecurityTypes(
  data: SmartZoneData,
  issues: ValidationIssue[],
  recommendations: string[]
) {
  // Map SmartZone security types to R1
  const securityMapping: Record<string, string> = {
    Standard_Open: 'open',
    Standard: 'psk',
    Standard_8021X: 'aaa',
    'Standard_MAC': 'aaa', // MAC auth requires AAA in R1
  }

  const unmappedTypes = new Set<string>()
  const macAuthWLANs: string[] = []

  data.wlans.forEach((wlan) => {
    if (!securityMapping[wlan.type]) {
      unmappedTypes.add(wlan.type)
    }

    if (wlan.type === 'Standard_MAC') {
      macAuthWLANs.push(wlan.name)
    }
  })

  if (unmappedTypes.size > 0) {
    issues.push({
      severity: 'warning',
      category: 'wlan',
      message: `${unmappedTypes.size} unknown security types detected`,
      affectedItems: Array.from(unmappedTypes),
      suggestion: 'Review these WLANs manually and configure security settings in RUCKUS One',
    })
  }

  if (macAuthWLANs.length > 0) {
    recommendations.push(
      `${macAuthWLANs.length} WLANs use MAC authentication. Configure RADIUS servers in RUCKUS One for AAA.`
    )
  }
}

/**
 * Get severity color for UI display
 */
export function getSeverityColor(severity: 'error' | 'warning' | 'info'): string {
  switch (severity) {
    case 'error':
      return 'red'
    case 'warning':
      return 'yellow'
    case 'info':
      return 'blue'
    default:
      return 'gray'
  }
}

/**
 * Check if validation has blocking issues
 */
export function hasBlockingIssues(report: ValidationReport): boolean {
  return (
    report.summary.errors > 0 ||
    report.conflicts.filter((c) => c.severity === 'blocker').length > 0
  )
}
