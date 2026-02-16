/**
 * Step 5: Review & Deploy Configurations
 *
 * Review transformed SmartZone data and deploy WLANs, AP Groups, and RF settings to RUCKUS One
 */

import { useState, useEffect } from 'react'
import { CheckCircle, Wifi, Radio, Loader, AlertCircle, Settings } from 'lucide-react'
import {
  createWifiNetwork,
  createAPGroup,
  updateVenueRadioSettings,
  createRadiusServerProfile,
  linkRadiusProfileToWifiNetwork,
  enableRadiusProxyMode,
  activateWifiNetworkOnVenue,
  type R1WifiNetwork,
  type R1APGroup,
  type R1WifiSecurityType,
  type RuckusOneCredentials,
  type R1RadiusServerProfileInput,
} from '../../services/ruckusOneClient'
import { transformAPGroups, transformRFSettings } from '../../services/dataTransformer'
import type { SmartZoneData } from '../../types/migration'
import { useAuth } from '../../contexts/AuthContext'
import { Link } from 'react-router-dom'

interface Step7_GenerateConfigsProps {
  projectId: string
  extractedData: SmartZoneData
  venueMapping: Record<string, string> // zoneId -> venueId
  onComplete: (apGroupMapping: Record<string, string>) => void // szApGroupId -> r1ApGroupId
  onBack: () => void
}

export default function Step7_GenerateConfigs({
  extractedData,
  venueMapping,
  onComplete,
  onBack,
}: Step7_GenerateConfigsProps) {
  const { credentials, isConfigured } = useAuth()
  const [generatedNetworks, setGeneratedNetworks] = useState<Array<R1WifiNetwork & { szWlanId: string; _zoneName?: string }>>([])
  const [generatedAPGroups, setGeneratedAPGroups] = useState<Array<R1APGroup & { szApGroupId: string; _zoneName?: string }>>([])
  const [generatedRFSettings, setGeneratedRFSettings] = useState<Array<{ zoneId: string; venueId: string; zoneName: string; settings: any }>>([])
  const [generatedRadiusProfiles, setGeneratedRadiusProfiles] = useState<Array<R1RadiusServerProfileInput & { szRadiusId: string }>>([])
  const [creating, setCreating] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<'idle' | 'radius' | 'wlans' | 'apgroups' | 'rf' | 'complete'>('idle')
  const [createdWLANs, setCreatedWLANs] = useState<string[]>([])
  const [createdAPGroups, setCreatedAPGroups] = useState<string[]>([])
  const [createdRadiusProfiles, setCreatedRadiusProfiles] = useState<string[]>([])
  const [apGroupMapping, setApGroupMapping] = useState<Record<string, string>>({}) // szApGroupId -> r1ApGroupId
  const [appliedRFSettings, setAppliedRFSettings] = useState<string[]>([]) // venue IDs
  const [errors, setErrors] = useState<string[]>([])
  const [radiusSecrets, setRadiusSecrets] = useState<Record<string, { primary?: string; secondary?: string }>>({})
  const [useProxyMode, setUseProxyMode] = useState<Record<string, boolean>>({}) // szWlanId -> useProxy

  useEffect(() => {
    // Generate configurations on mount
    const apGroups = transformAPGroups(extractedData.apGroups, extractedData.zones)

    // Map WLANs directly from SmartZone data (skip transformWLANsToNetworks to avoid confusion)
    const mappedNetworks = extractedData.wlans.map((szWlan) => {
      const zone = extractedData.zones.find((z) => z.id === szWlan.zoneId)

      // Log full WLAN structure for debugging
      console.log(`\n=== WLAN: ${szWlan.name} ===`)
      console.log('SmartZone WLAN data:', {
        type: szWlan.type,
        encryption: szWlan.encryption,
        hasPassphrase: !!(szWlan.passphrase || szWlan.encryption?.passphrase),
        hasAuthService: !!szWlan.authServiceOrProfile,
        externalDpskEnabled: szWlan.externalDpsk?.enabled,
        dpskEnabled: szWlan.dpsk?.dpskEnabled,
        vlan: szWlan.vlan,
      })

      // Extract passphrase (can be at top level OR in encryption object)
      const passphrase = szWlan.passphrase || szWlan.encryption?.passphrase

      // Determine security type based on ACTUAL configuration (not SmartZone's type field which is often wrong)
      // Priority: DPSK (internal/external) > AAA/802.1X > Static PSK > Open
      let securityType: R1WifiSecurityType = 'open'

      // DPSK - Dynamic PSK (either internal SmartZone-managed or external RADIUS-generated)
      if (szWlan.dpsk?.dpskEnabled || szWlan.externalDpsk?.enabled) {
        securityType = 'dpsk'
        if (szWlan.externalDpsk?.enabled) {
          console.log('  → Detected: External DPSK (RADIUS-generated PSKs)')
        } else {
          console.log('  → Detected: Internal DPSK (SmartZone-managed PSKs)')
        }
      }
      // Enterprise/AAA authentication (802.1X)
      else if (szWlan.authServiceOrProfile) {
        securityType = 'aaa'
        console.log('  → Detected: AAA/802.1X (Enterprise)')
      }
      // Static PSK authentication (has passphrase)
      else if (passphrase) {
        securityType = 'psk'
        console.log('  → Detected: Static PSK')
      }
      // Open network (no auth, may have encryption)
      else if (szWlan.encryption?.method === 'None' || !szWlan.encryption?.method) {
        securityType = 'open'
        console.log('  → Detected: Open (no encryption)')
      }
      // Open with encryption (rare - encrypted but no auth)
      else {
        securityType = 'open'
        console.log(`  → Detected: Open with encryption (type="${szWlan.type}", method="${szWlan.encryption?.method}")`)
      }

      console.log(`Mapped to R1: securityType="${securityType}"`)
      console.log(`  - Passphrase: ${passphrase ? '***present***' : 'none'}`)
      console.log(`  - Encryption: ${szWlan.encryption?.method}/${szWlan.encryption?.algorithm}`)
      console.log(`  - Auth Service: ${szWlan.authServiceOrProfile?.name || szWlan.externalDpsk?.authService?.name || 'none'}`)
      console.log('===\n')

      return {
        szWlanId: szWlan.id,
        name: szWlan.name,
        ssid: szWlan.ssid,
        securityType,
        encryptionMethod: szWlan.encryption?.method, // WPA, WPA2, WPA3, etc.
        encryption: szWlan.encryption?.algorithm?.toLowerCase() as 'aes' | 'tkip' | undefined,
        passphrase: passphrase, // Include passphrase from SmartZone (from either location)
        vlanId: szWlan.vlan?.accessVlan,
        enabled: true,
        useExternalDpsk: szWlan.externalDpsk?.enabled, // Set true for External DPSK (RADIUS-generated PSKs)
        _zoneName: zone?.name,
        // Store SmartZone auth/accounting service IDs for later linkage to R1 RADIUS profiles
        // External DPSK uses authService from externalDpsk object, AAA uses authServiceOrProfile
        _szAuthServiceId: szWlan.externalDpsk?.authService?.id || szWlan.authServiceOrProfile?.id,
        _szAccountingServiceId: szWlan.accountingServiceOrProfile?.id,
      }
    })

    const mappedAPGroups = apGroups.map((group) => {
      const szGroup = extractedData.apGroups.find((g) => g.id === group.sourceApGroupId)!
      const zone = extractedData.zones.find((z) => z.id === szGroup.zoneId)
      const venueId = venueMapping[szGroup.zoneId]

      return {
        szApGroupId: group.sourceApGroupId,
        name: group.name,
        description: group.description,
        venueId,
        _zoneName: zone?.name || `Unknown zone (${szGroup.zoneId})`,
        _zoneId: szGroup.zoneId,
      }
    })

    setGeneratedNetworks(mappedNetworks)
    setGeneratedAPGroups(mappedAPGroups)

    // Generate RF settings for each zone/venue
    const rfSettings = extractedData.zones
      .map((zone) => {
        const venueId = venueMapping[zone.id]
        if (!venueId) return null

        const settings = transformRFSettings(zone)
        if (!settings) return null

        return {
          zoneId: zone.id,
          venueId,
          zoneName: zone.name,
          settings,
        }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)

    setGeneratedRFSettings(rfSettings)

    // Generate RADIUS server profiles from SmartZone RADIUS services
    const radiusProfiles = extractedData.radiusServices.map((szRadius) => ({
      szRadiusId: szRadius.id,
      name: szRadius.name,
      type: szRadius.type.toUpperCase() as 'AUTHENTICATION' | 'ACCOUNTING',
      primary: {
        ip: szRadius.primary.ip,
        port: szRadius.primary.port,
        sharedSecret: szRadius.primary.sharedSecret, // Optional in R1 API v1.1
      },
      secondary: szRadius.secondary ? {
        ip: szRadius.secondary.ip,
        port: szRadius.secondary.port,
        sharedSecret: szRadius.secondary.sharedSecret, // Optional in R1 API v1.1
      } : undefined,
    }))

    setGeneratedRadiusProfiles(radiusProfiles)
  }, [extractedData, venueMapping])

  const handleCreateConfigs = async () => {
    if (!credentials) {
      setErrors(['RUCKUS One credentials not configured'])
      return
    }

    // Validate RADIUS shared secrets are provided
    const missingSecrets: string[] = []
    for (const profile of generatedRadiusProfiles) {
      const secrets = radiusSecrets[profile.szRadiusId]
      if (!secrets?.primary) {
        missingSecrets.push(profile.name)
      }
    }
    if (missingSecrets.length > 0) {
      setErrors([`RADIUS shared secrets required for: ${missingSecrets.join(', ')}`])
      return
    }

    setCreating(true)
    setErrors([])

    const r1Credentials: RuckusOneCredentials = credentials

    try {
      // Phase 0: Create RADIUS Server Profiles (for AAA networks)
      setCurrentPhase('radius')
      const newRadiusMapping: Record<string, string> = {}
      const radiusErrors: string[] = []

      for (const radiusProfile of generatedRadiusProfiles) {
        try {
          // Include user-provided shared secrets if available
          const profileWithSecrets = { ...radiusProfile }
          const secrets = radiusSecrets[radiusProfile.szRadiusId]

          if (secrets?.primary) {
            profileWithSecrets.primary = {
              ...profileWithSecrets.primary,
              sharedSecret: secrets.primary,
            }
          }

          if (secrets?.secondary && profileWithSecrets.secondary) {
            profileWithSecrets.secondary = {
              ...profileWithSecrets.secondary,
              sharedSecret: secrets.secondary,
            }
          }

          console.log(`Creating RADIUS profile "${radiusProfile.name}" (${radiusProfile.type})`)
          const result = await createRadiusServerProfile(r1Credentials, profileWithSecrets)
          setCreatedRadiusProfiles((prev) => [...prev, radiusProfile.szRadiusId])
          newRadiusMapping[radiusProfile.szRadiusId] = result.id
          console.log(`✓ RADIUS profile "${radiusProfile.name}" created with ID: ${result.id}`)
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          console.error(`✗ RADIUS profile "${radiusProfile.name}" creation failed:`, errorMsg)
          radiusErrors.push(`Failed to create RADIUS profile "${radiusProfile.name}": ${errorMsg}`)
        }
      }

      // Stop if any RADIUS profiles failed to create
      if (radiusErrors.length > 0) {
        setErrors(radiusErrors)
        setCurrentPhase('idle')
        setCreating(false)
        return
      }

      // Phase 1: Create WLANs
      setCurrentPhase('wlans')
      const newWlanMapping: Record<string, string> = {} // szWlanId -> r1WlanId
      for (const network of generatedNetworks) {
        try {
          // Link AAA networks to RADIUS profiles if available
          const networkWithRadius: R1WifiNetwork = { ...network }

          if (network.securityType === 'aaa') {
            // @ts-ignore - temporary access to private fields
            const szAuthServiceId = network._szAuthServiceId
            // @ts-ignore - temporary access to private fields
            const szAccountingServiceId = network._szAccountingServiceId

            if (szAuthServiceId && newRadiusMapping[szAuthServiceId]) {
              networkWithRadius.authServiceOrProfile = { id: newRadiusMapping[szAuthServiceId] }
              console.log(`  - Linked auth service: ${newRadiusMapping[szAuthServiceId]}`)
            } else if (szAuthServiceId) {
              console.warn(`  - Auth service ${szAuthServiceId} not found in RADIUS mapping`)
            }

            if (szAccountingServiceId && newRadiusMapping[szAccountingServiceId]) {
              networkWithRadius.accountingServiceOrProfile = { id: newRadiusMapping[szAccountingServiceId] }
              console.log(`  - Linked accounting service: ${newRadiusMapping[szAccountingServiceId]}`)
            }

            // Note: AAA networks require pre-configured RADIUS servers in R1
            if (!networkWithRadius.authServiceOrProfile) {
              console.warn(`  ⚠️  AAA network "${network.name}" has no linked RADIUS auth service - may fail creation`)
            }
          }

          console.log(`Creating WLAN "${network.name}":`, {
            securityType: network.securityType,
            hasPassphrase: !!network.passphrase,
            encryption: network.encryption,
            vlanId: network.vlanId,
            useExternalDpsk: network.useExternalDpsk,
            hasAuthService: !!networkWithRadius.authServiceOrProfile,
            hasAccountingService: !!networkWithRadius.accountingServiceOrProfile,
          })

          const result = await createWifiNetwork(r1Credentials, networkWithRadius)
          setCreatedWLANs((prev) => [...prev, network.szWlanId])
          newWlanMapping[network.szWlanId] = result.id
          console.log(`✓ WLAN "${network.name}" created successfully with ID: ${result.id}`)

          // For External DPSK, link to RADIUS profile after creation
          if (network.securityType === 'dpsk' && network.useExternalDpsk) {
            // @ts-ignore - temporary access to private fields
            const szAuthServiceId = network._szAuthServiceId

            if (szAuthServiceId && newRadiusMapping[szAuthServiceId]) {
              const radiusProfileId = newRadiusMapping[szAuthServiceId]
              console.log(`  - Linking External DPSK WLAN to RADIUS profile ${radiusProfileId}`)

              try {
                await linkRadiusProfileToWifiNetwork(r1Credentials, result.id, radiusProfileId)
                console.log(`  ✓ Successfully linked RADIUS profile to DPSK WLAN "${network.name}"`)

                // Enable R1 as proxy if user selected (like SmartZone's "SZ Authenticator" mode)
                const enableProxy = useProxyMode[network.szWlanId] ?? false
                if (enableProxy) {
                  console.log(`  - Enabling RADIUS proxy mode (R1 proxies auth to RADIUS)`)
                  await enableRadiusProxyMode(r1Credentials, result.id, true, false)
                  console.log(`  ✓ Successfully enabled RADIUS proxy mode`)
                } else {
                  console.log(`  - Proxy mode disabled (APs authenticate directly to RADIUS)`)
                }
              } catch (linkErr) {
                const linkErrMsg = linkErr instanceof Error ? linkErr.message : 'Unknown error'
                console.error(`  ✗ Failed to link RADIUS profile or enable proxy:`, linkErrMsg)
                setErrors((prev) => [...prev, `Failed to link RADIUS profile to DPSK WLAN "${network.name}": ${linkErrMsg}`])
              }
            } else {
              console.warn(`  ⚠️  External DPSK network "${network.name}" has no linked RADIUS auth service - may not function correctly`)
            }
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          console.error(`✗ WLAN "${network.name}" creation failed:`, errorMsg)
          setErrors((prev) => [...prev, `Failed to create WLAN "${network.name}": ${errorMsg}`])
        }
      }

      // Phase 2: Create AP Groups
      setCurrentPhase('apgroups')
      const newApGroupMapping: Record<string, string> = {}
      for (const apGroup of generatedAPGroups) {
        try {
          const result = await createAPGroup(r1Credentials, apGroup)
          setCreatedAPGroups((prev) => [...prev, apGroup.szApGroupId])
          newApGroupMapping[apGroup.szApGroupId] = result.id
          setApGroupMapping((prev) => ({ ...prev, [apGroup.szApGroupId]: result.id }))
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          setErrors((prev) => [...prev, `Failed to create AP Group "${apGroup.name}": ${errorMsg}`])
        }
      }

      // Phase 2.5: Activate WLANs on Venues
      // WLANs must be activated on venues to actually broadcast
      // Use SmartZone AP Group WLAN member data to activate only on specific AP groups
      console.log('\n=== Activating WLANs on Venues ===')
      for (const zone of extractedData.zones) {
        const venueId = venueMapping[zone.id]
        if (!venueId) {
          console.warn(`  ⚠️  No venue mapping for zone ${zone.name} - skipping WLAN activation`)
          continue
        }

        // Find all WLANs for this zone
        const wlansForZone = generatedNetworks.filter(net => net._zoneName === zone.name)
        console.log(`\nVenue "${zone.name}": Activating ${wlansForZone.length} WLANs`)

        for (const network of wlansForZone) {
          const r1WlanId = newWlanMapping[network.szWlanId]
          if (!r1WlanId) {
            console.warn(`  - WLAN "${network.name}" was not created - skipping activation`)
            continue
          }

          // Find which AP Groups in SmartZone have this WLAN as a member
          const apGroupsWithThisWlan = extractedData.apGroups.filter(apg =>
            apg.zoneId === zone.id &&
            apg.wlans?.some(w => w.id === network.szWlanId)
          )

          try {
            if (apGroupsWithThisWlan.length > 0) {
              // Activate on specific AP groups (matching SmartZone configuration)
              const r1ApGroupConfigs = apGroupsWithThisWlan
                .map(szApg => {
                  const r1ApGroupId = newApGroupMapping[szApg.id]
                  if (!r1ApGroupId) {
                    console.warn(`  ⚠️  AP Group "${szApg.name}" not found in R1 mapping`)
                    return null
                  }
                  return { apGroupId: r1ApGroupId, radio: 'Both' as const }
                })
                .filter((cfg): cfg is { apGroupId: string; radio: 'Both' } => cfg !== null)

              if (r1ApGroupConfigs.length > 0) {
                await activateWifiNetworkOnVenue(r1Credentials, venueId, r1WlanId, {
                  isAllApGroups: false,
                  apGroups: r1ApGroupConfigs,
                  radio: 'Both',
                })
                console.log(`  ✓ Activated WLAN "${network.name}" on ${r1ApGroupConfigs.length} AP groups`)
              } else {
                console.warn(`  - No valid R1 AP groups found for WLAN "${network.name}" - skipping`)
              }
            } else {
              // No specific AP group membership - activate on all AP groups in venue
              await activateWifiNetworkOnVenue(r1Credentials, venueId, r1WlanId, {
                isAllApGroups: true,
                radio: 'Both',
              })
              console.log(`  ✓ Activated WLAN "${network.name}" on all AP groups (no specific membership in SZ)`)
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error'
            console.error(`  ✗ Failed to activate WLAN "${network.name}" on venue:`, errorMsg)
            setErrors((prev) => [...prev, `Failed to activate WLAN "${network.name}" on venue "${zone.name}": ${errorMsg}`])
          }
        }
      }

      // Phase 3: Apply RF Settings to Venues
      setCurrentPhase('rf')
      for (const rfConfig of generatedRFSettings) {
        try {
          await updateVenueRadioSettings(r1Credentials, rfConfig.venueId, rfConfig.settings)
          setAppliedRFSettings((prev) => [...prev, rfConfig.venueId])
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          setErrors((prev) => [...prev, `Failed to apply RF settings for venue "${rfConfig.zoneName}": ${errorMsg}`])
        }
      }

      setCurrentPhase('complete')
    } catch (err) {
      setErrors((prev) => [...prev, `Configuration creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`])
    } finally {
      setCreating(false)
    }
  }

  const allConfigsCreated =
    createdRadiusProfiles.length === generatedRadiusProfiles.length &&
    createdWLANs.length === generatedNetworks.length &&
    createdAPGroups.length === generatedAPGroups.length &&
    appliedRFSettings.length === generatedRFSettings.length

  // If R1 credentials not configured, show message
  if (!isConfigured) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Configure RUCKUS One API</h1>
          <p className="text-gray-600">
            RUCKUS One API credentials are required to configure WLANs and AP Groups
          </p>
        </div>

        <div className="card bg-yellow-50 border-yellow-200">
          <div className="flex items-start space-x-4">
            <AlertCircle size={24} className="text-yellow-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                RUCKUS One Credentials Not Configured
              </h3>
              <p className="text-yellow-800 mb-4">
                Please configure your RUCKUS One API credentials in Settings before continuing.
              </p>
              <div className="flex items-center space-x-4">
                <Link to="/settings" className="btn-primary flex items-center space-x-2">
                  <Settings size={16} />
                  <span>Go to Settings</span>
                </Link>
                <button onClick={onBack} className="btn-secondary">
                  ← Back to Venue Creation
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Review & Deploy Configurations</h1>
        <p className="text-gray-600">
          Review transformed SmartZone data and deploy WLANs, AP Groups, and RF settings to RUCKUS One
        </p>
      </div>

      {/* Progress Summary */}
      {creating && (
        <div className="card mb-6 bg-blue-50 border-blue-200">
          <div className="flex items-center space-x-3">
            <Loader size={20} className="text-blue-600 animate-spin" />
            <div>
              <h3 className="font-semibold text-blue-900">Creating Configurations...</h3>
              {currentPhase === 'radius' && (
                <p className="text-sm text-blue-700">
                  Creating RADIUS Profiles: {createdRadiusProfiles.length} of {generatedRadiusProfiles.length}
                </p>
              )}
              {currentPhase === 'wlans' && (
                <p className="text-sm text-blue-700">
                  Creating WLANs: {createdWLANs.length} of {generatedNetworks.length}
                </p>
              )}
              {currentPhase === 'apgroups' && (
                <p className="text-sm text-blue-700">
                  Creating AP Groups: {createdAPGroups.length} of {generatedAPGroups.length}
                </p>
              )}
              {currentPhase === 'rf' && (
                <p className="text-sm text-blue-700">
                  Applying RF Settings: {appliedRFSettings.length} of {generatedRFSettings.length}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success Summary */}
      {allConfigsCreated && currentPhase === 'complete' && (
        <div className="card mb-6 bg-green-50 border-green-200">
          <div className="flex items-center space-x-3">
            <CheckCircle size={24} className="text-green-600" />
            <div>
              <h3 className="font-semibold text-green-900">All Configurations Created Successfully!</h3>
              <p className="text-sm text-green-700">
                Created {createdWLANs.length} WLANs, {createdAPGroups.length} AP Groups, and applied RF settings to {appliedRFSettings.length} venues
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="card mb-6 bg-red-50 border-red-200">
          <div className="flex items-start space-x-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">Errors Occurred</h3>
              <ul className="text-sm text-red-700 mt-2 space-y-1">
                {errors.map((error, idx) => (
                  <li key={idx}>• {error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* RADIUS Server Profiles */}
      {generatedRadiusProfiles.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Settings size={24} className="text-gray-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">RADIUS Server Profiles ({generatedRadiusProfiles.length})</h3>
                <p className="text-sm text-gray-500">RADIUS profiles for AAA/802.1X networks</p>
              </div>
            </div>
            {currentPhase !== 'idle' && (
              <span className="text-sm text-gray-600">
                {createdRadiusProfiles.length} / {generatedRadiusProfiles.length} created
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Primary Server</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Primary Secret</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Secondary Server</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Secondary Secret</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {generatedRadiusProfiles.map((profile) => {
                  const isCreated = createdRadiusProfiles.includes(profile.szRadiusId)
                  const secrets = radiusSecrets[profile.szRadiusId] || {}
                  return (
                    <tr key={profile.szRadiusId}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{profile.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          profile.type === 'AUTHENTICATION' ? 'bg-purple-100 text-purple-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {profile.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {profile.primary.ip}:{profile.primary.port}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <input
                          type="password"
                          disabled={creating || isCreated}
                          placeholder="Required"
                          value={secrets.primary || ''}
                          onChange={(e) => setRadiusSecrets(prev => ({
                            ...prev,
                            [profile.szRadiusId]: {
                              ...prev[profile.szRadiusId],
                              primary: e.target.value
                            }
                          }))}
                          className="w-32 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {profile.secondary ? `${profile.secondary.ip}:${profile.secondary.port}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {profile.secondary ? (
                          <input
                            type="password"
                            disabled={creating || isCreated}
                            placeholder="Optional"
                            value={secrets.secondary || ''}
                            onChange={(e) => setRadiusSecrets(prev => ({
                              ...prev,
                              [profile.szRadiusId]: {
                                ...prev[profile.szRadiusId],
                                secondary: e.target.value
                              }
                            }))}
                            className="w-32 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                          />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isCreated ? (
                          <span className="text-green-600">✓ Created</span>
                        ) : creating && currentPhase === 'radius' ? (
                          <Loader size={16} className="text-blue-600 animate-spin" />
                        ) : (
                          <span className="text-gray-400">Pending</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* RADIUS Shared Secret Warning */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-start space-x-2">
              <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-800">
                <p className="font-semibold mb-1">RADIUS Shared Secrets</p>
                <p>
                  SmartZone does not export shared secrets (security policy). You can optionally enter them above
                  to configure during migration, or leave blank and configure manually in RUCKUS One portal later.
                </p>
                <p className="mt-1 text-blue-700">
                  <strong>Note:</strong> RADIUS authentication will not work until shared secrets are configured.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WLAN Configurations */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Wifi size={24} className="text-gray-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">WiFi Networks ({generatedNetworks.length})</h3>
              <p className="text-sm text-gray-500">WLANs to be created in RUCKUS One</p>
            </div>
          </div>
          {currentPhase !== 'idle' && (
            <span className="text-sm text-gray-600">
              {createdWLANs.length} / {generatedNetworks.length} created
            </span>
          )}
        </div>

        {generatedNetworks.some(n => n.securityType === 'dpsk' && n.useExternalDpsk) && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>R1 Proxy Mode:</strong> For External DPSK networks, you can choose whether RUCKUS One acts as a proxy between APs and RADIUS.
              <br />
              • <strong>OFF (default, recommended):</strong> APs authenticate directly to RADIUS — more resilient, continues working if R1 is down
              <br />
              • <strong>ON:</strong> APs → R1 → RADIUS — adds cloud dependency (like SmartZone's "SZ Authenticator" mode)
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SSID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Security</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">VLAN</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">R1 Proxy</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {generatedNetworks.map((net) => {
                const isCreated = createdWLANs.includes(net.szWlanId)
                return (
                  <tr key={net.szWlanId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{net.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{net.ssid}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          net.securityType === 'aaa'
                            ? 'bg-blue-100 text-blue-800'
                            : net.securityType === 'dpsk'
                              ? 'bg-purple-100 text-purple-800'
                              : net.securityType === 'psk'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {net.securityType}
                        {net.securityType === 'dpsk' && net.useExternalDpsk && ' (ext)'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{net.vlanId || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {net.securityType === 'dpsk' && net.useExternalDpsk ? (
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useProxyMode[net.szWlanId] ?? false}
                            onChange={(e) => {
                              setUseProxyMode((prev) => ({
                                ...prev,
                                [net.szWlanId]: e.target.checked,
                              }))
                            }}
                            disabled={creating || isCreated}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                          />
                          <span className="text-xs text-gray-600">
                            {useProxyMode[net.szWlanId] ? 'ON' : 'OFF'}
                          </span>
                        </label>
                      ) : (
                        <span className="text-gray-400 text-xs">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{net._zoneName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {isCreated ? (
                        <span className="text-green-600">✓ Created</span>
                      ) : creating && currentPhase === 'wlans' ? (
                        <Loader size={16} className="text-blue-600 animate-spin" />
                      ) : (
                        <span className="text-gray-400">Pending</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* AP Group Configurations */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Radio size={24} className="text-gray-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">AP Groups ({generatedAPGroups.length})</h3>
              <p className="text-sm text-gray-500">AP Groups to be created in RUCKUS One</p>
            </div>
          </div>
          {currentPhase !== 'idle' && (
            <span className="text-sm text-gray-600">
              {createdAPGroups.length} / {generatedAPGroups.length} created
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venue ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {generatedAPGroups.map((group) => {
                const isCreated = createdAPGroups.includes(group.szApGroupId)
                return (
                  <tr key={group.szApGroupId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{group.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{group.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={group._zoneName?.startsWith('Unknown') ? 'text-red-600 italic' : ''}>
                        {group._zoneName}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs">
                      {group.venueId?.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {isCreated ? (
                        <span className="text-green-600">✓ Created</span>
                      ) : creating && currentPhase === 'apgroups' ? (
                        <Loader size={16} className="text-blue-600 animate-spin" />
                      ) : (
                        <span className="text-gray-400">Pending</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RF Settings */}
      {generatedRFSettings.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Settings size={24} className="text-gray-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">RF Settings ({generatedRFSettings.length})</h3>
                <p className="text-sm text-gray-500">Radio configurations to be applied to venues</p>
              </div>
            </div>
            {currentPhase !== 'idle' && (
              <span className="text-sm text-gray-600">
                {appliedRFSettings.length} / {generatedRFSettings.length} applied
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zone/Venue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">2.4GHz Settings</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">5GHz Settings</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">6GHz Settings</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {generatedRFSettings.map((rfConfig) => {
                  const isApplied = appliedRFSettings.includes(rfConfig.venueId)
                  const rf24G = rfConfig.settings.radioParams24G || {}
                  const rf50G = rfConfig.settings.radioParams50G || {}
                  const rf6G = rfConfig.settings.radioParams6G || {}

                  return (
                    <tr key={rfConfig.venueId}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{rfConfig.zoneName}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {rf24G.channelBandwidth && <div>BW: {rf24G.channelBandwidth}</div>}
                        {rf24G.method && <div>Method: {rf24G.method}</div>}
                        {rf24G.txPower && <div>Power: {rf24G.txPower}</div>}
                        {!rf24G.channelBandwidth && !rf24G.method && !rf24G.txPower && <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {rf50G.channelBandwidth && <div>BW: {rf50G.channelBandwidth}</div>}
                        {rf50G.method && <div>Method: {rf50G.method}</div>}
                        {rf50G.txPower && <div>Power: {rf50G.txPower}</div>}
                        {!rf50G.channelBandwidth && !rf50G.method && !rf50G.txPower && <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {rf6G.channelBandwidth && <div>BW: {rf6G.channelBandwidth}</div>}
                        {rf6G.method && <div>Method: {rf6G.method}</div>}
                        {rf6G.txPower && <div>Power: {rf6G.txPower}</div>}
                        {!rf6G.channelBandwidth && !rf6G.method && !rf6G.txPower && <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isApplied ? (
                          <span className="text-green-600">✓ Applied</span>
                        ) : creating && currentPhase === 'rf' ? (
                          <Loader size={16} className="text-blue-600 animate-spin" />
                        ) : (
                          <span className="text-gray-400">Pending</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={onBack}
          disabled={creating}
          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Back
        </button>

        {allConfigsCreated && currentPhase === 'complete' ? (
          <button type="button" onClick={() => onComplete(apGroupMapping)} className="btn-primary">
            Continue to Hardware Migration →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCreateConfigs}
            disabled={creating}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating Configurations...' : 'Create Configurations in RUCKUS One'}
          </button>
        )}
      </div>
    </div>
  )
}
