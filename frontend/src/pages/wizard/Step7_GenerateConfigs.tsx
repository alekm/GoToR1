/**
 * Step 7: Generate & Apply Configurations
 *
 * Create WLANs and AP Groups in RUCKUS One based on SmartZone data
 */

import { useState, useEffect } from 'react'
import { CheckCircle, Wifi, Radio, Loader, AlertCircle, Eye } from 'lucide-react'
import {
  createWifiNetwork,
  createAPGroup,
  type R1WifiNetwork,
  type R1APGroup,
  type R1WifiSecurityType,
  type RuckusOneCredentials,
} from '../../services/ruckusOneClient'
import { transformWLANsToNetworks, transformAPGroups } from '../../services/dataTransformer'
import type { SmartZoneData, RuckusOneConfig, SZWLAN, SZAPGroup } from '../../types/migration'

interface Step7_GenerateConfigsProps {
  projectId: string
  extractedData: SmartZoneData
  ruckusOneConfig: RuckusOneConfig
  venueMapping: Record<string, string> // zoneId -> venueId
  onComplete: () => void
  onBack: () => void
}

export default function Step7_GenerateConfigs({
  extractedData,
  ruckusOneConfig,
  venueMapping,
  onComplete,
  onBack,
}: Step7_GenerateConfigsProps) {
  const [generatedNetworks, setGeneratedNetworks] = useState<Array<R1WifiNetwork & { szWlanId: string }>>([])
  const [generatedAPGroups, setGeneratedAPGroups] = useState<Array<R1APGroup & { szApGroupId: string }>>([])
  const [creating, setCreating] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<'idle' | 'wlans' | 'apgroups' | 'complete'>('idle')
  const [createdWLANs, setCreatedWLANs] = useState<string[]>([])
  const [createdAPGroups, setCreatedAPGroups] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState<string | null>(null)

  const r1Credentials: RuckusOneCredentials = {
    tenantId: ruckusOneConfig.tenantId,
    clientId: ruckusOneConfig.clientId,
    clientSecret: ruckusOneConfig.clientSecret,
    region: ruckusOneConfig.region,
  }

  useEffect(() => {
    // Generate configurations on mount
    const networks = transformWLANsToNetworks(extractedData.wlans, extractedData.zones)
    const apGroups = transformAPGroups(extractedData.apGroups, extractedData.zones)

    // Map to R1 format with zone info
    const mappedNetworks = networks.map((net) => {
      const szWlan = extractedData.wlans.find((w) => w.id === net.sourceWlanId)!
      const zone = extractedData.zones.find((z) => z.id === szWlan.zoneId)

      // Determine security type
      let securityType: R1WifiSecurityType = 'open'
      if (szWlan.type.includes('8021X')) securityType = 'aaa'
      else if (szWlan.type.includes('Standard') && szWlan.type !== 'Standard_Open') securityType = 'psk'

      return {
        szWlanId: net.sourceWlanId,
        name: net.name,
        ssid: net.wlan.ssid,
        securityType,
        encryption: net.wlan.encryption as 'aes' | 'tkip' | undefined,
        vlanId: net.wlan.vlanId,
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
        _zoneName: zone?.name,
      }
    })

    setGeneratedNetworks(mappedNetworks)
    setGeneratedAPGroups(mappedAPGroups)
  }, [extractedData, venueMapping])

  const handleCreateConfigs = async () => {
    setCreating(true)
    setErrors([])

    try {
      // Phase 1: Create WLANs
      setCurrentPhase('wlans')
      for (const network of generatedNetworks) {
        try {
          await createWifiNetwork(r1Credentials, network)
          setCreatedWLANs((prev) => [...prev, network.szWlanId])
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          setErrors((prev) => [...prev, `Failed to create WLAN "${network.name}": ${errorMsg}`])
        }
      }

      // Phase 2: Create AP Groups
      setCurrentPhase('apgroups')
      for (const apGroup of generatedAPGroups) {
        try {
          await createAPGroup(r1Credentials, apGroup)
          setCreatedAPGroups((prev) => [...prev, apGroup.szApGroupId])
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          setErrors((prev) => [...prev, `Failed to create AP Group "${apGroup.name}": ${errorMsg}`])
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
    createdWLANs.length === generatedNetworks.length && createdAPGroups.length === generatedAPGroups.length

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
                Created {createdWLANs.length} WLANs and {createdAPGroups.length} AP Groups in RUCKUS One
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{group._zoneName}</td>
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
          <button type="button" onClick={onComplete} className="btn-primary">
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
