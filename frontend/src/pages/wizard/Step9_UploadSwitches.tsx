/**
 * Step 9: Upload Switches to RUCKUS One
 *
 * Batch upload SmartZone-managed switches
 */

import { useState } from 'react'
import { CheckCircle, Network, Loader, AlertCircle, Info } from 'lucide-react'
import {
  batchUploadSwitches,
  type R1Switch,
  type RuckusOneCredentials,
} from '../../services/ruckusOneClient'
import type { SmartZoneData } from '../../types/migration'
import { useAuth } from '../../contexts/AuthContext'

interface Step9_UploadSwitchesProps {
  extractedData: SmartZoneData
  venueMapping: Record<string, string> // zoneId -> venueId
  onComplete: () => void
  onBack: () => void
}

interface UploadProgress {
  total: number
  completed: number
  failed: number
  currentBatch: number
  totalBatches: number
}

export default function Step9_UploadSwitches({
  extractedData,
  venueMapping,
  onComplete,
  onBack,
}: Step9_UploadSwitchesProps) {
  const { credentials, isConfigured } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    currentBatch: 0,
    totalBatches: 0,
  })
  const [errors, setErrors] = useState<string[]>([])
  const [uploadComplete, setUploadComplete] = useState(false)

  const totalSwitches = extractedData.switches.length

  const handleUploadSwitches = async () => {
    if (!credentials) {
      setErrors(['RUCKUS One credentials not configured'])
      return
    }

    setUploading(true)
    setErrors([])
    const newErrors: string[] = []

    const r1Credentials: RuckusOneCredentials = credentials

    try {
      // Transform SmartZone switches to R1 format
      const r1Switches: R1Switch[] = extractedData.switches.map((sw) => {
        // Find the zone name for tagging and venue assignment
        const zone = extractedData.zones.find((z) => z.id === sw.zoneId)
        const zoneName = zone?.name || 'unknown-zone'
        const venueId = sw.zoneId ? venueMapping[sw.zoneId] : undefined

        return {
          serialNumber: sw.serial,
          name: sw.name,
          description: sw.description || `Migrated from SmartZone zone: ${zoneName}`,
          model: sw.model,
          location: sw.location,
          tags: ['migrated-from-smartzone', `sz-zone:${zoneName}`],
          venueId: venueId,
        }
      })

      // Calculate batches
      const batchSize = 25
      const totalBatches = Math.ceil(r1Switches.length / batchSize)
      setProgress({
        total: r1Switches.length,
        completed: 0,
        failed: 0,
        currentBatch: 0,
        totalBatches,
      })

      console.log(`Uploading ${r1Switches.length} switches in ${totalBatches} batches...`)

      // Upload switches in batches
      const result = await batchUploadSwitches(
        r1Credentials,
        r1Switches,
        (completed, total) => {
          const currentBatch = Math.ceil(completed / batchSize)
          setProgress({
            total,
            completed,
            failed: 0,
            currentBatch,
            totalBatches,
          })
        }
      )

      setProgress((prev) => ({
        ...prev,
        completed: result.success.length,
        failed: result.failed.length,
      }))

      // Log failures
      if (result.failed.length > 0) {
        result.failed.forEach(({ sw, error }) => {
          const errorMsg = `Failed to upload switch "${sw.name}" (${sw.serialNumber}): ${error}`
          console.error(errorMsg)
          newErrors.push(errorMsg)
        })
      }

      console.log(
        `Switch upload complete: ${result.success.length} succeeded, ${result.failed.length} failed`
      )
      setErrors(newErrors)
      setUploadComplete(true)
    } catch (err) {
      const errorMsg = `Switch upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      console.error(errorMsg)
      setErrors([...newErrors, errorMsg])
    } finally {
      setUploading(false)
    }
  }

  if (!isConfigured) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="card bg-yellow-50 border-yellow-200">
          <div className="flex items-start space-x-4">
            <AlertCircle size={24} className="text-yellow-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                RUCKUS One Credentials Required
              </h3>
              <p className="text-yellow-800">
                Please configure RUCKUS One credentials in Settings before uploading switches.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Switches</h1>
        <p className="text-gray-600">
          {totalSwitches > 0
            ? `Upload ${totalSwitches} SmartZone-managed switches to RUCKUS One`
            : 'No SmartZone-managed switches detected'}
        </p>
      </div>

      {/* No Switches Info */}
      {totalSwitches === 0 && (
        <div className="card mb-6 bg-blue-50 border-blue-200">
          <div className="flex items-start space-x-4">
            <Info size={24} className="text-blue-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                No Switches to Upload
              </h3>
              <p className="text-blue-800 mb-2">
                Your SmartZone deployment does not have any managed switches configured, or
                your SmartZone version does not support switch management.
              </p>
              <p className="text-sm text-blue-700">
                You can proceed to the verification step to review the migration results.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Card */}
      {totalSwitches > 0 && (
        <>
          <div className="card mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Migration Summary</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total Switches</p>
                <p className="text-2xl font-bold text-gray-900">{totalSwitches}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">With Zone Assignment</p>
                <p className="text-2xl font-bold text-gray-900">
                  {extractedData.switches.filter((sw) => sw.zoneId).length}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Without Zone</p>
                <p className="text-2xl font-bold text-gray-900">
                  {extractedData.switches.filter((sw) => !sw.zoneId).length}
                </p>
              </div>
            </div>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="card mb-6 bg-blue-50 border-blue-200">
              <div className="flex items-center space-x-3 mb-4">
                <Loader size={20} className="text-blue-600 animate-spin" />
                <div>
                  <h3 className="font-semibold text-blue-900">Uploading Switches...</h3>
                  <p className="text-sm text-blue-700">
                    {progress.completed} of {progress.total} switches processed
                    {progress.totalBatches > 0 &&
                      ` (Batch ${progress.currentBatch}/${progress.totalBatches})`}
                  </p>
                </div>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Success Summary */}
          {uploadComplete && (
            <div className="card mb-6 bg-green-50 border-green-200">
              <div className="flex items-center space-x-3">
                <CheckCircle size={24} className="text-green-600" />
                <div>
                  <h3 className="font-semibold text-green-900">
                    Switches Uploaded Successfully!
                  </h3>
                  <p className="text-sm text-green-700">
                    {progress.completed} switches uploaded to RUCKUS One
                    {progress.failed > 0 && ` (${progress.failed} failed)`}
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

          {/* Switch List Preview */}
          <div className="card mb-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <Network size={20} />
              <span>Switches to Upload</span>
            </h3>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Serial
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Model
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Zone
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {extractedData.switches.map((sw) => {
                    const zone = extractedData.zones.find((z) => z.id === sw.zoneId)
                    return (
                      <tr key={sw.serial} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900">{sw.name}</td>
                        <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                          {sw.serial}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{sw.model}</td>
                        <td className="px-3 py-2 text-gray-600">{zone?.name || 'None'}</td>
                        <td className="px-3 py-2 text-gray-600">{sw.location || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={onBack}
          disabled={uploading}
          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Back
        </button>

        {uploadComplete || totalSwitches === 0 ? (
          <button type="button" onClick={onComplete} className="btn-primary">
            Continue to Verification →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleUploadSwitches}
            disabled={uploading || totalSwitches === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading Switches...' : `Upload ${totalSwitches} Switches`}
          </button>
        )}
      </div>
    </div>
  )
}
