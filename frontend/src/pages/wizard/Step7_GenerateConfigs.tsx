/**
 * Step 7: Generate & Apply Configurations
 *
 * Create WLANs and AP Groups in RUCKUS One based on SmartZone data
 */

import { useState, useEffect } from 'react'
import { CheckCircle, Wifi, Radio, Loader, AlertCircle, Settings } from 'lucide-react'
import {
  createWifiNetwork,
  createAPGroup,
  updateVenueRadioSettings,
  type R1WifiNetwork,
  type R1APGroup,
  type R1WifiSecurityType,
  type RuckusOneCredentials,
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
  const [creating, setCreating] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<'idle' | 'wlans' | 'apgroups' | 'rf' | 'complete'>('idle')
  const [createdWLANs, setCreatedWLANs] = useState<string[]>([])
  const [createdAPGroups, setCreatedAPGroups] = useState<string[]>([])
  const [apGroupMapping, setApGroupMapping] = useState<Record<string, string>>({}) // szApGroupId -> r1ApGroupId
  const [appliedRFSettings, setAppliedRFSettings] = useState<string[]>([]) // venue IDs
  const [errors, setErrors] = useState<string[]>([])

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
        hasPassphrase: !!szWlan.passphrase,
        hasAuthService: !!szWlan.authService,
        vlan: szWlan.vlan,
      })

      // Extract passphrase (can be at top level OR in encryption object)
      const passphrase = szWlan.passphrase || szWlan.encryption?.passphrase

      // Determine security type based on auth + encryption
      // SmartZone model: type (authorization) + encryption (method + algorithm + passphrase)
      let securityType: R1WifiSecurityType = 'open'

      // Enterprise/AAA authentication (802.1X, MAC, etc.)
      if (szWlan.type.includes('8021X') || szWlan.type.includes('MAC')) {
        securityType = 'aaa'
      }
      // PSK authentication (has passphrase in encryption or top level)
      else if (passphrase) {
        securityType = 'psk'
      }
      // Open authentication (no passphrase, no encryption, no enterprise)
      else if (szWlan.encryption?.method === 'None' || !szWlan.encryption?.method) {
        securityType = 'open'
      }
      // Default: if uncertain but has encryption method, treat as open with encryption
      else {
        console.warn(`Ambiguous WLAN type="${szWlan.type}", encryption="${szWlan.encryption?.method}", no passphrase - defaulting to open`)
        securityType = 'open'
      }

      console.log(`Mapped to R1: securityType="${securityType}"`)
      console.log(`  - Passphrase: ${passphrase ? '***present***' : 'none'}`)
      console.log(`  - Encryption: ${szWlan.encryption?.method}/${szWlan.encryption?.algorithm}`)
      if (securityType === 'psk' && !passphrase) {
        console.error(`⚠️  PSK network but no passphrase found!`)
      }
      console.log('===\n')

      return {
        szWlanId: szWlan.id,
        name: szWlan.name,
        ssid: szWlan.ssid,
        securityType,
        encryption: szWlan.encryption?.algorithm?.toLowerCase() as 'aes' | 'tkip' | undefined,
        passphrase: passphrase, // Include passphrase from SmartZone (from either location)
        vlanId: szWlan.vlan?.accessVlan,
        enabled: true,
        _zoneName: zone?.name,
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
  }, [extractedData, venueMapping])

  const handleCreateConfigs = async () => {
    if (!credentials) {
      setErrors(['RUCKUS One credentials not configured'])
      return
    }

    setCreating(true)
    setErrors([])

    const r1Credentials: RuckusOneCredentials = credentials

    try {
      // Phase 1: Create WLANs
      setCurrentPhase('wlans')
      for (const network of generatedNetworks) {
        try {
          console.log(`Creating WLAN "${network.name}":`, {
            securityType: network.securityType,
            hasPassphrase: !!network.passphrase,
            encryption: network.encryption,
            vlanId: network.vlanId,
          })
          await createWifiNetwork(r1Credentials, network)
          setCreatedWLANs((prev) => [...prev, network.szWlanId])
          console.log(`✓ WLAN "${network.name}" created successfully`)
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Generate & Apply Configurations</h1>
        <p className="text-gray-600">
          Review and create WiFi networks and AP groups in RUCKUS One
        </p>
      </div>

      {/* Progress Summary */}
      {creating && (
        <div className="card mb-6 bg-blue-50 border-blue-200">
          <div className="flex items-center space-x-3">
            <Loader size={20} className="text-blue-600 animate-spin" />
            <div>
              <h3 className="font-semibold text-blue-900">Creating Configurations...</h3>
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

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SSID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Security</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">VLAN</th>
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
                            : net.securityType === 'psk'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {net.securityType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{net.vlanId || '-'}</td>
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
