// GoToR1 Migration Type Definitions
// Comprehensive types for SmartZone → RUCKUS One migration

// ============================================================================
// MIGRATION PROJECT
// ============================================================================

export type MigrationStep =
  | 'setup'           // Step 1: Project setup
  | 'connect'         // Step 2: Connect to SmartZone
  | 'extract'         // Step 3: Extract data
  | 'venues'          // Step 4: Create venues/ECs
  | 'configs'         // Step 5: Review & Deploy configs
  | 'migrate-aps'     // Step 6: Migrate APs
  | 'migrate-switches'// Step 7: Migrate switches
  | 'verify'          // Step 8: Verify results
  | 'complete'

export type MigrationStatus =
  | 'draft'           // Project created, not started
  | 'extracting'      // Currently extracting from SmartZone
  | 'extracted'       // Data extracted successfully
  | 'ready'           // Ready to migrate
  | 'migrating'       // Migration in progress
  | 'completed'       // Successfully completed
  | 'failed'          // Migration failed
  | 'paused'          // Migration paused

export interface MigrationProject {
  id: string
  name: string
  description?: string
  createdAt: string       // ISO timestamp
  updatedAt: string
  currentStep: MigrationStep
  status: MigrationStatus

  smartZoneConfig: SmartZoneConfig
  ruckusOneConfig?: RuckusOneConfig
  mappingConfig?: MappingConfig

  extractedData?: SmartZoneData
  transformedData?: RuckusOneData
  validationReport?: ValidationReport
  venueMapping?: Record<string, string>  // SmartZone zone ID -> RUCKUS One venue ID
  apGroupMapping?: Record<string, string> // SmartZone AP Group ID -> RUCKUS One AP Group ID
  radiusMapping?: Record<string, string> // SmartZone RADIUS service ID -> RUCKUS One RADIUS profile ID

  checkpoints: Checkpoint[]
  errors: MigrationError[]
}

// ============================================================================
// SMARTZONE CONFIGURATION
// ============================================================================

export interface SmartZoneConfig {
  host: string
  port: number                        // 8443 (vSZ-H) or 7443 (vSZ-E)
  apiVersion: string                  // Auto-detected: 'v9_1', 'v10_0', etc.
  authType: 'password' | 'apikey'
  credentials: {
    username?: string
    password?: string
    apiKey?: string
  }
  tlsVerify: boolean                  // Allow self-signed certs in dev
  selectedZone?: string               // Single zone ID to migrate (changed from array to single)
}

// ============================================================================
// SMARTZONE DATA MODELS
// ============================================================================

export interface SmartZoneData {
  zones: SZZone[]
  wlans: SZWLAN[]
  apGroups: SZAPGroup[]
  accessPoints: SZAccessPoint[]
  switches: SZSwitch[]                // SmartZone-managed switches
  radiusServices: SZRadiusAuthService[] // RADIUS authentication/accounting services
  extractedAt: string
  totalItems: {
    zones: number
    wlans: number
    apGroups: number
    aps: number
    switches: number
    radiusServices: number
  }
}

export interface SZZone {
  id: string
  name: string
  description?: string
  domainId: string
  // GPS coordinates
  latitude?: number
  longitude?: number
  // RF Configuration - 2.4GHz
  channelWidth24?: string           // '20MHz', '40MHz'
  channel24?: number | 'Auto'
  txPower24?: number | 'Auto'
  autoChannelSelection24?: boolean
  channelChangeFrequency24?: number
  // RF Configuration - 5GHz
  channelWidth5?: string            // '20MHz', '40MHz', '80MHz', '160MHz'
  channel5?: number | 'Auto'
  txPower5?: number | 'Auto'
  autoChannelSelection5?: boolean
  channelChangeFrequency5?: number
  // Additional RF settings
  dfsEnabled?: boolean
  bandSteering?: boolean
  loadBalancing?: boolean
  clientLimit?: number
}

export interface SZWLAN {
  id: string
  zoneId: string
  name: string
  ssid: string
  type: string                        // 'Standard_Open', 'Standard_8021X', etc. (often incorrect from SZ)
  encryption?: {
    method: string
    algorithm: string
    passphrase?: string               // Can be in encryption object OR top level
  }
  vlan?: {
    accessVlan: number
    aaaVlanOverride?: boolean
  }
  passphrase?: string                 // For PSK networks only (can be top level OR in encryption)
  authServiceOrProfile?: {            // For AAA/802.1X networks (from detail endpoint)
    id: string
    name: string
    throughController?: boolean
  }
  accountingServiceOrProfile?: {      // For AAA networks (from detail endpoint)
    id: string
    name: string
  }
  dpsk?: {                            // Internal DPSK (managed by SmartZone)
    dpskEnabled: boolean
  }
  externalDpsk?: {                    // External DPSK (RADIUS-generated PSKs)
    enabled: boolean
    authService?: {
      id: string
      name: string
    }
  }
}

export interface SZAPGroup {
  id: string
  zoneId: string
  name: string
  description?: string
  wlans?: Array<{
    id: string
    name: string
  }>
}

export interface SZAccessPoint {
  serial: string
  mac: string
  name: string
  model: string
  zoneId: string
  apGroupId?: string
  description?: string
  gps?: {
    latitude: string
    longitude: string
  }
  ipAddress?: string
  status?: string
}

export interface SZSwitch {
  serial: string
  mac: string
  name: string
  model: string
  zoneId?: string                     // May be null if not zone-associated
  description?: string
  ipAddress?: string
  location?: string
  status?: string
  managedBy: 'smartzone' | 'csv' | 'manual'
  ports?: SZSwitchPort[]
}

export interface SZSwitchPort {
  portNumber: number
  portName?: string
  description?: string
  vlanId?: number
  poeEnabled?: boolean
  portSpeed?: string
  status?: string
}

export interface SZRadiusAuthService {
  id: string
  zoneId: string                      // Zone this RADIUS service belongs to
  name: string
  description?: string
  type: 'Authentication' | 'Accounting' // Service type
  primary: {
    ip: string
    port: number
    sharedSecret?: string             // May not be retrievable from SZ API
  }
  secondary?: {
    ip: string
    port: number
    sharedSecret?: string
  }
}

// ============================================================================
// RUCKUS ONE CONFIGURATION
// ============================================================================

export interface RuckusOneConfig {
  region: 'na' | 'eu' | 'asia'
  tenantId: string
  clientId: string
  clientSecret: string
  mspId?: string                      // For MSP accounts
}

// ============================================================================
// RUCKUS ONE DATA MODELS
// ============================================================================

export interface RuckusOneData {
  venues: R1Venue[]
  endCustomers?: R1EndCustomer[]      // For MSP migrations
  networks: R1Network[]
  apGroups: R1APGroup[]
  accessPoints: R1AccessPoint[]
  switches: R1Switch[]
  radiusProfiles: R1RadiusServerProfile[] // RADIUS server profiles for AAA
  transformedAt: string
}

export interface R1Venue {
  name: string
  description?: string
  address?: string
  location?: {
    latitude: number
    longitude: number
  }
  sourceZoneId: string                // Track original SZ zone
  r1VenueId?: string                  // Set after creation
}

export interface R1EndCustomer {
  name: string
  description?: string
  sourceZoneId?: string               // Track original SZ zone if 1:1 mapping
  r1CustomerId?: string               // Set after creation
}

export interface R1Network {
  name: string
  ssid: string
  type: 'STANDARD_OPEN' | 'STANDARD' | 'STANDARD_8021X'  // R1 API security types
  enabled?: boolean                   // Optional - defaults to true
  passphrase?: string                 // Required for type='STANDARD' (PSK)
  encryption?: {                      // Required for PSK and AAA
    method: 'None' | 'WPA' | 'AES'
    algorithm?: 'TKIP' | 'AES'
  }
  vlan?: {                            // Optional VLAN configuration
    accessVlan: number
  }
  authServiceOrProfile?: {            // For AAA networks (optional - must exist in R1)
    id: string
  }
  accountingServiceOrProfile?: {      // For AAA networks (optional - must exist in R1)
    id: string
  }
  sourceWlanId: string
  r1NetworkId?: string                // Set after creation
}

export interface R1APGroup {
  name: string
  description?: string
  venueId?: string                    // Set during migration
  sourceApGroupId: string
  r1APGroupId?: string                // Set after creation
}

export interface R1AccessPoint {
  name: string
  serialNumber: string
  description?: string
  model?: string
  tags: string[]                      // ['migrated-from-sz', 'zone-name']
  deviceGps?: {
    latitude: string
    longitude: string
  }
  apGroupName?: string
  sourceSerial: string
}

export interface R1Switch {
  name: string
  serialNumber: string
  description?: string
  model?: string
  location?: string
  tags: string[]                      // ['migrated-from-sz', etc.]
  venueId?: string                    // Set during migration
  sourceSerial: string
  managedBy: 'smartzone' | 'csv' | 'manual'
  portConfigs?: R1SwitchPortConfig[]
}

export interface R1SwitchPortConfig {
  portNumber: number
  vlanId?: number
  poeEnabled?: boolean
  description?: string
}

export interface R1RadiusServerProfile {
  id?: string                         // Set after creation in R1
  name: string
  type: 'AUTHENTICATION' | 'ACCOUNTING'
  primary: {
    ip: string
    port: number
    sharedSecret?: string             // Required for creation but may not be in SZ export
  }
  secondary?: {
    ip: string
    port: number
    sharedSecret?: string
  }
  sourceRadiusServiceId: string       // Track original SZ RADIUS service ID
}

// ============================================================================
// MAPPING CONFIGURATION
// ============================================================================

export interface MappingConfig {
  zoneToVenueMap: Record<string, VenueMapping>
  wlanSecurityMap: Record<string, string>     // SZ type → R1 security
  apGroupNamingStrategy: 'keep' | 'prefix' | 'suffix'
  apGroupPrefix?: string
  apGroupSuffix?: string
  apTags: string[]
  applyGPSCoordinates: boolean
  defaultVenueSettings?: {
    address?: string
    location?: {
      latitude: number
      longitude: number
    }
  }
}

export interface VenueMapping {
  action: 'create' | 'use-existing'
  venueName?: string                  // If creating new
  venueId?: string                    // If using existing
  r1VenueId?: string                  // Set after creation
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidationReport {
  timestamp: string
  summary: {
    totalAPs: number
    totalWLANs: number
    totalAPGroups: number
    totalVenues: number
    totalSwitches: number
    errors: number
    warnings: number
    conflicts: number
  }
  issues: ValidationIssue[]
  conflicts: Conflict[]
  unsupportedFeatures: UnsupportedFeature[]
  recommendations: string[]
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  category: 'ap' | 'wlan' | 'apgroup' | 'venue' | 'switch' | 'dependency'
  message: string
  affectedItems: string[]             // IDs or names
  suggestion?: string
}

export interface Conflict {
  type: 'duplicate_name' | 'duplicate_serial' | 'missing_dependency' | 'incompatible_config'
  severity: 'blocker' | 'warning'
  items: ConflictItem[]
  resolution?: string
}

export interface ConflictItem {
  source: 'smartzone' | 'ruckusone'
  id: string
  name: string
  detail?: string
}

export interface UnsupportedFeature {
  feature: string                     // 'Mesh', 'Hotspot 2.0', 'QoS'
  type: 'wlan' | 'apgroup' | 'policy' | 'switch'
  affectedItems: string[]
  workaround?: string
}

// ============================================================================
// MIGRATION EXECUTION
// ============================================================================

export interface Checkpoint {
  id: string
  timestamp: string
  stage: 'venues' | 'apgroups' | 'networks' | 'aps' | 'switches'
  completed: string[]                 // IDs of successfully migrated items
  failed: string[]
  canRollback: boolean
  createdR1Ids: Record<string, string>  // SZ ID → R1 ID mapping
}

export interface MigrationError {
  timestamp: string
  stage: string
  itemId?: string
  itemName?: string
  error: string
  retryable: boolean
  retryCount?: number
}

export interface MigrationProgress {
  currentStage: string
  currentBatch?: string
  totalBatches: number
  completedBatches: number
  totalItems: number
  completedItems: number
  failedItems: number
  percentComplete: number
  estimatedTimeRemaining: number      // seconds
  itemsPerSecond: number
}
