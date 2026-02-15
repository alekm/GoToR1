/**
 * Step 6: Create Venues/End Customers
 *
 * Map SmartZone zones to RUCKUS One venues and create them
 */

import { useState } from 'react'
import { CheckCircle, Building2, MapPin, Loader, AlertCircle } from 'lucide-react'
import { createVenue, type R1Venue, type RuckusOneCredentials } from '../../services/ruckusOneClient'
import type { SmartZoneData, RuckusOneConfig } from '../../types/migration'
import { migrationStateManager } from '../../services/migrationStateManager'

interface Step6_CreateVenuesProps {
  projectId: string
  extractedData: SmartZoneData
  ruckusOneConfig?: RuckusOneConfig  // Optional - will prompt if not provided
  onComplete: (venueMapping: Record<string, string>) => void
  onBack: () => void
  onRefresh?: () => Promise<void>  // Refresh parent project state
}

interface VenueFormData {
  name: string
  description: string
  addressLine1: string
  city: string
  state: string
  country: string
  postalCode: string
}

export default function Step6_CreateVenues({
  projectId,
  extractedData,
  ruckusOneConfig: initialR1Config,
  onComplete,
  onBack,
  onRefresh,
}: Step6_CreateVenuesProps) {
  // R1 Credentials state (if not provided)
  const [ruckusOneConfig, setRuckusOneConfig] = useState<RuckusOneConfig | undefined>(initialR1Config)
  const [r1Form, setR1Form] = useState({
    tenantId: '',
    clientId: '',
    clientSecret: '',
    region: 'na' as 'na' | 'eu' | 'asia',
  })

  const [venueMapping, setVenueMapping] = useState<Record<string, VenueFormData>>(
    extractedData.zones.reduce(
      (acc, zone) => ({
        ...acc,
        [zone.id]: {
          name: zone.name,
          description: zone.description || `Migrated from SmartZone zone: ${zone.name}`,
          addressLine1: '',
          city: '',
          state: '',
          country: 'USA',
          postalCode: '',
        },
      }),
      {}
    )
  )
  const [creating, setCreating] = useState(false)
  const [createdVenues, setCreatedVenues] = useState<Record<string, string>>({}) // zoneId -> venueId
  const [errors, setErrors] = useState<string[]>([])

  const updateVenue = (zoneId: string, field: keyof VenueFormData, value: string) => {
    setVenueMapping({
      ...venueMapping,
      [zoneId]: {
        ...venueMapping[zoneId],
        [field]: value,
      },
    })
  }

  const handleR1ConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const config: RuckusOneConfig = {
      tenantId: r1Form.tenantId,
      clientId: r1Form.clientId,
      clientSecret: r1Form.clientSecret,
      region: r1Form.region,
    }
    // Save to project
    await migrationStateManager.updateProject(projectId, {
      ruckusOneConfig: config,
    })
    // Refresh parent project state
    if (onRefresh) {
      await onRefresh()
    }
    setRuckusOneConfig(config)
  }

  const handleCreateVenues = async () => {
    if (!ruckusOneConfig) {
      setErrors(['RUCKUS One credentials not configured'])
      return
    }

    setCreating(true)
    setErrors([])
    const newCreatedVenues: Record<string, string> = {}

    const r1Credentials: RuckusOneCredentials = {
      tenantId: ruckusOneConfig.tenantId,
      clientId: ruckusOneConfig.clientId,
      clientSecret: ruckusOneConfig.clientSecret,
      region: ruckusOneConfig.region,
    }

    try {
      for (const zone of extractedData.zones) {
        const formData = venueMapping[zone.id]

        try {
          const venueData: R1Venue = {
            name: formData.name,
            description: formData.description,
            address: {
              addressLine1: formData.addressLine1 || undefined,
              city: formData.city || undefined,
              state: formData.state || undefined,
              country: formData.country || undefined,
              postalCode: formData.postalCode || undefined,
            },
            tags: ['migrated-from-smartzone', `sz-zone:${zone.name}`],
          }

          const result = await createVenue(r1Credentials, venueData)
          newCreatedVenues[zone.id] = result.id

          setCreatedVenues({ ...newCreatedVenues })
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          setErrors((prev) => [...prev, `Failed to create venue for zone "${zone.name}": ${errorMsg}`])
        }
      }

      // If all venues created successfully, continue
      if (Object.keys(newCreatedVenues).length === extractedData.zones.length) {
        onComplete(newCreatedVenues)
      }
    } catch (err) {
      setErrors((prev) => [...prev, `Venue creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`])
    } finally {
      setCreating(false)
    }
  }

  const allVenuesCreated = Object.keys(createdVenues).length === extractedData.zones.length

  // If R1 credentials not configured, show credential form first
  console.log('Step6: ruckusOneConfig =', ruckusOneConfig)
  console.log('Step6: initialR1Config =', initialR1Config)

  if (!ruckusOneConfig) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Configure RUCKUS One API</h1>
          <p className="text-gray-600">
            Enter your RUCKUS One API credentials to create venues and configure the migration
          </p>
        </div>

        <form onSubmit={handleR1ConfigSubmit} className="card">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tenant ID *
              </label>
              <input
                type="text"
                value={r1Form.tenantId}
                onChange={(e) => setR1Form({ ...r1Form, tenantId: e.target.value })}
                className="input-field"
                placeholder="e.g., abc123def456"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Found in RUCKUS One Portal → API Credentials
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client ID *
              </label>
              <input
                type="text"
                value={r1Form.clientId}
                onChange={(e) => setR1Form({ ...r1Form, clientId: e.target.value })}
                className="input-field"
                placeholder="Client ID"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Secret *
              </label>
              <input
                type="password"
                value={r1Form.clientSecret}
                onChange={(e) => setR1Form({ ...r1Form, clientSecret: e.target.value })}
                className="input-field"
                placeholder="Client Secret"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Region *
              </label>
              <select
                value={r1Form.region}
                onChange={(e) => setR1Form({ ...r1Form, region: e.target.value as 'na' | 'eu' | 'asia' })}
                className="input-field"
                required
              >
                <option value="na">North America (api.ruckusone.io)</option>
                <option value="eu">Europe (api-eu.ruckusone.io)</option>
                <option value="asia">Asia Pacific (api-asia.ruckusone.io)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center mt-8 pt-6 border-t">
            <button
              type="button"
              onClick={onBack}
              className="btn-secondary"
            >
              ← Back
            </button>
            <button type="submit" className="btn-primary">
              Save & Continue →
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Venues in RUCKUS One</h1>
        <p className="text-gray-600">
          Configure venue details for each SmartZone zone before creating them in RUCKUS One
        </p>
      </div>

      {/* Progress Summary */}
      {creating && (
        <div className="card mb-6 bg-blue-50 border-blue-200">
          <div className="flex items-center space-x-3">
            <Loader size={20} className="text-blue-600 animate-spin" />
            <div>
              <h3 className="font-semibold text-blue-900">Creating Venues...</h3>
              <p className="text-sm text-blue-700">
                {Object.keys(createdVenues).length} of {extractedData.zones.length} venues created
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success Summary */}
      {allVenuesCreated && (
        <div className="card mb-6 bg-green-50 border-green-200">
          <div className="flex items-center space-x-3">
            <CheckCircle size={24} className="text-green-600" />
            <div>
              <h3 className="font-semibold text-green-900">All Venues Created Successfully!</h3>
              <p className="text-sm text-green-700">
                Created {Object.keys(createdVenues).length} venues in RUCKUS One
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

      {/* Venue Configuration Forms */}
      <div className="space-y-6">
        {extractedData.zones.map((zone) => {
          const formData = venueMapping[zone.id]
          const isCreated = !!createdVenues[zone.id]

          return (
            <div
              key={zone.id}
              className={`card ${isCreated ? 'border-green-300 bg-green-50' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <Building2 size={24} className={isCreated ? 'text-green-600' : 'text-gray-600'} />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      SmartZone Zone: {zone.name}
                    </h3>
                    <p className="text-sm text-gray-500">{zone.description}</p>
                  </div>
                </div>
                {isCreated && <CheckCircle size={24} className="text-green-600" />}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Venue Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateVenue(zone.id, 'name', e.target.value)}
                    disabled={creating || isCreated}
                    className="input"
                    placeholder="e.g., Main Campus Building"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => updateVenue(zone.id, 'description', e.target.value)}
                    disabled={creating || isCreated}
                    className="input"
                    placeholder="Optional description"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center space-x-2">
                    <MapPin size={16} />
                    <span>Address (Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.addressLine1}
                    onChange={(e) => updateVenue(zone.id, 'addressLine1', e.target.value)}
                    disabled={creating || isCreated}
                    className="input"
                    placeholder="Street address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => updateVenue(zone.id, 'city', e.target.value)}
                    disabled={creating || isCreated}
                    className="input"
                    placeholder="City"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => updateVenue(zone.id, 'state', e.target.value)}
                    disabled={creating || isCreated}
                    className="input"
                    placeholder="State"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => updateVenue(zone.id, 'country', e.target.value)}
                    disabled={creating || isCreated}
                    className="input"
                    placeholder="Country"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => updateVenue(zone.id, 'postalCode', e.target.value)}
                    disabled={creating || isCreated}
                    className="input"
                    placeholder="Postal code"
                  />
                </div>
              </div>

              {isCreated && (
                <div className="mt-4 bg-green-100 border border-green-300 rounded-lg p-3">
                  <p className="text-sm text-green-800">
                    ✓ Venue created successfully (ID: {createdVenues[zone.id]})
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-6">
        <button
          type="button"
          onClick={onBack}
          disabled={creating}
          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Back
        </button>

        {allVenuesCreated ? (
          <button type="button" onClick={() => onComplete(createdVenues)} className="btn-primary">
            Continue to Configuration Generation →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCreateVenues}
            disabled={creating}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating Venues...' : 'Create Venues in RUCKUS One'}
          </button>
        )}
      </div>
    </div>
  )
}
