/**
 * Step 2: Connect to SmartZone
 *
 * User enters SmartZone connection details and selects zones to migrate
 */

import { useState, useEffect } from 'react'
import { Loader, CheckCircle, XCircle, Server } from 'lucide-react'
import { testConnection, getZones } from '../../services/smartZoneClient'
import type { SmartZoneConfig, SZZone } from '../../types/migration'

interface Step2ConnectSZProps {
  projectId: string
  initialConfig?: SmartZoneConfig
  onComplete: (config: SmartZoneConfig) => void
  onBack: () => void
}

export default function Step2_ConnectSZ({
  initialConfig,
  onComplete,
  onBack,
}: Step2ConnectSZProps) {
  const [config, setConfig] = useState<SmartZoneConfig>(
    initialConfig || {
      host: '',
      port: 8443, // Default vSZ-H port
      apiVersion: 'auto',
      authType: 'password',
      credentials: {
        username: '',
        password: '',
      },
      tlsVerify: false, // Allow self-signed certs
      selectedZone: undefined,
    }
  )

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    version?: string
  } | null>(null)

  const [loadingZones, setLoadingZones] = useState(false)
  const [zones, setZones] = useState<SZZone[]>([])
  const [zonesLoaded, setZonesLoaded] = useState(false)

  // No longer need to auto-load zones on mount

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setZonesLoaded(false)
    setZones([])

    try {
      // Step 1: Test connection
      const result = await testConnection(config)

      if (result.success) {
        // Update config with detected version
        let updatedConfig = config
        if (result.version) {
          updatedConfig = { ...config, apiVersion: result.version }
          setConfig(updatedConfig)
        }

        // Step 2: Automatically load zones after successful connection
        const fetchedZones = await getZones(updatedConfig)
        setZones(fetchedZones)
        setZonesLoaded(true)

        setTestResult({
          success: true,
          message: `Connection successful! SmartZone API ${result.version || config.apiVersion} detected. Found ${fetchedZones.length} zone(s).`,
          version: result.version,
        })

        // Don't auto-select zones - let user choose
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Connection test failed',
        })
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      })
    } finally {
      setTesting(false)
    }
  }


  const handleSelectZone = (zoneId: string) => {
    setConfig({
      ...config,
      selectedZone: zoneId,
    })
  }

  const handleContinue = () => {
    if (!config.selectedZone) {
      alert('Please select a zone to migrate')
      return
    }
    onComplete(config)
  }

  const isFormValid =
    config.host &&
    config.port &&
    config.credentials.username &&
    config.credentials.password

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Connect to SmartZone</h1>
        <p className="text-gray-600">
          Enter your SmartZone Controller connection details to begin the migration
        </p>
      </div>

      <div className="card space-y-6">
        {/* Connection Details */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Server size={20} className="mr-2" />
            Connection Details
          </h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hostname or IP Address
                </label>
                <input
                  type="text"
                  className="input-field font-mono text-sm"
                  placeholder="192.168.1.10 or smartzone.example.com"
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Port</label>
                <select
                  className="input-field"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
                >
                  <option value="8443">8443 (vSZ-H)</option>
                  <option value="7443">7443 (vSZ-E)</option>
                  <option value="443">443 (Custom)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="admin"
                  value={config.credentials.username}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      credentials: { ...config.credentials, username: e.target.value },
                    })
                  }
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  value={config.credentials.password}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      credentials: { ...config.credentials, password: e.target.value },
                    })
                  }
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={`border rounded-lg p-4 flex items-start space-x-3 ${
              testResult.success
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {testResult.success ? (
              <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={20} className="flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-medium">{testResult.message}</p>
            </div>
          </div>
        )}

        {/* Test Connection Button */}
        <div>
          <button
            type="button"
            onClick={handleTest}
            disabled={!isFormValid || testing}
            className="btn-secondary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <>
                <Loader size={16} className="animate-spin" />
                <span>Testing Connection...</span>
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                <span>Test Connection</span>
              </>
            )}
          </button>
        </div>

        {/* Zone Selection */}
        {testResult?.success && (
          <div className="border-t pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Select Zones to Migrate</h2>

            {!zonesLoaded ? (
              <button
                type="button"
                onClick={handleLoadZones}
                disabled={loadingZones}
                className="btn-secondary flex items-center space-x-2"
              >
                {loadingZones ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    <span>Loading Zones...</span>
                  </>
                ) : (
                  <span>Load Available Zones</span>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                {zones.length === 0 ? (
                  <p className="text-gray-600">No zones found in this SmartZone controller</p>
                ) : (
                  zones.map((zone) => (
                    <label
                      key={zone.id}
                      className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="zone-selection"
                        checked={config.selectedZone === zone.id}
                        onChange={() => handleSelectZone(zone.id)}
                        className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{zone.name}</div>
                        {zone.description && (
                          <div className="text-sm text-gray-600">{zone.description}</div>
                        )}
                      </div>
                    </label>
                  ))
                )}

                <div className="text-sm text-gray-600 mt-4">
                  {config.selectedZone
                    ? `Selected: ${zones.find((z) => z.id === config.selectedZone)?.name || 'Unknown'}`
                    : 'No zone selected'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center pt-4 border-t">
          <button type="button" onClick={onBack} className="btn-secondary">
            ← Back
          </button>

          <button
            type="button"
            onClick={handleContinue}
            disabled={!zonesLoaded || !config.selectedZone}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to Data Extraction →
          </button>
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">Connection Tips:</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Ensure your SmartZone Controller is accessible from this browser</li>
          <li>vSZ-H (High-Scale) typically uses port 8443</li>
          <li>vSZ-E (Essentials) typically uses port 7443</li>
          <li>Self-signed certificates are automatically accepted</li>
          <li>Your credentials are stored securely in your browser only</li>
        </ul>
      </div>
    </div>
  )
}
