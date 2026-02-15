/**
 * Step 8: Upload Access Points to RUCKUS One
 *
 * Batch upload APs and assign them to AP Groups
 */

import { useState } from 'react'
import { CheckCircle, Wifi, Loader, AlertCircle } from 'lucide-react'
import {
  batchUploadAPs,
  assignAPsToGroup,
  type R1AccessPoint,
  type RuckusOneCredentials,
} from '../../services/ruckusOneClient'
import type { SmartZoneData } from '../../types/migration'
import { useAuth } from '../../contexts/AuthContext'

interface Step8_UploadAPsProps {
  extractedData: SmartZoneData
  venueMapping: Record<string, string> // zoneId -> venueId
  apGroupMapping: Record<string, string> // szApGroupId -> r1ApGroupId
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

export default function Step8_UploadAPs({
  extractedData,
  venueMapping,
  apGroupMapping,
  onComplete,
  onBack,
}: Step8_UploadAPsProps) {
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
  const [assignmentComplete, setAssignmentComplete] = useState(false)

  const totalAPs = extractedData.accessPoints.length

  /**
   * Sanitize AP serial number for R1 API
   * R1 requires: ^[1-9][0-9]{11}$ (12 digits, first digit 1-9)
   */
  function sanitizeSerial(serial: string): string {
    // Remove non-digits
    const digits = serial.replace(/\D/g, '')

    // Pad to 12 digits if needed
    const padded = digits.padStart(12, '0')

    // Replace leading 0 with 1 if needed
    if (padded[0] === '0') {
      return '1' + padded.slice(1, 12)
    }

    return padded.slice(0, 12)
  }

  const handleUploadAPs = async () => {
    if (!credentials) {
      setErrors(['RUCKUS One credentials not configured'])
      return
    }

    setUploading(true)
    setErrors([])
    const newErrors: string[] = []

    const r1Credentials: RuckusOneCredentials = credentials

    try {
      // Transform SmartZone APs to R1 format
      const r1APs: R1AccessPoint[] = extractedData.accessPoints.map((ap) => {
        // Find the zone name for tagging
        const zone = extractedData.zones.find((z) => z.id === ap.zoneId)
        const zoneName = zone?.name || 'unknown-zone'

        return {
          serialNumber: sanitizeSerial(ap.serial),
          name: ap.name,
          description: ap.description || `Migrated from SmartZone zone: ${zoneName}`,
          model: ap.model,
          tags: ['migrated-from-smartzone', `sz-zone:${zoneName}`],
          deviceGps: ap.gps
            ? {
                latitude: ap.gps.latitude,
                longitude: ap.gps.longitude,
              }
            : undefined,
        }
      })

      // Calculate batches
      const batchSize = 50
      const totalBatches = Math.ceil(r1APs.length / batchSize)
      setProgress({
        total: r1APs.length,
        completed: 0,
        failed: 0,
        currentBatch: 0,
        totalBatches,
      })

      console.log(`Uploading ${r1APs.length} APs in ${totalBatches} batches...`)

      // Upload APs in batches
      const result = await batchUploadAPs(
        r1Credentials,
        r1APs,
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
        result.failed.forEach(({ ap, error }) => {
          const errorMsg = `Failed to upload AP "${ap.name}" (${ap.serialNumber}): ${error}`
          console.error(errorMsg)
          newErrors.push(errorMsg)
        })
      }

      console.log(`AP Upload complete: ${result.success.length} succeeded, ${result.failed.length} failed`)
      setUploadComplete(true)

      // Now assign APs to AP Groups
      console.log('Assigning APs to AP Groups...')
      const assignmentErrors: string[] = []

      for (const apGroup of extractedData.apGroups) {
        const r1ApGroupId = apGroupMapping[apGroup.id]
        if (!r1ApGroupId) {
          console.warn(`No R1 AP Group ID found for SZ AP Group ${apGroup.name}`)
          continue
        }

        // Find venue ID for this AP Group's zone
        const venueId = venueMapping[apGroup.zoneId]
        if (!venueId) {
          console.warn(`No venue ID found for zone ${apGroup.zoneId}`)
          continue
        }

        // Find all APs in this AP Group
        const apsInGroup = extractedData.accessPoints.filter(
          (ap) => ap.apGroupId === apGroup.id
        )

        if (apsInGroup.length === 0) {
          console.log(`No APs in AP Group ${apGroup.name}, skipping assignment`)
          continue
        }

        const serialNumbers = apsInGroup.map((ap) => sanitizeSerial(ap.serial))

        try {
          console.log(
            `Assigning ${serialNumbers.length} APs to AP Group "${apGroup.name}" (${r1ApGroupId})`
          )
          await assignAPsToGroup(r1Credentials, venueId, r1ApGroupId, serialNumbers)
          console.log(`Successfully assigned APs to "${apGroup.name}"`)
        } catch (err) {
          const errorMsg = `Failed to assign APs to group "${apGroup.name}": ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
          console.error(errorMsg)
          assignmentErrors.push(errorMsg)
        }
      }

      if (assignmentErrors.length > 0) {
        setErrors([...newErrors, ...assignmentErrors])
      } else {
        setErrors(newErrors)
      }

      setAssignmentComplete(true)
      console.log('AP assignment complete')
    } catch (err) {
      const errorMsg = `AP upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      console.error(errorMsg)
      setErrors([...newErrors, errorMsg])
    } finally {
      setUploading(false)
    }
  }

  const allComplete = uploadComplete && assignmentComplete

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
                Please configure RUCKUS One credentials in Settings before uploading APs.
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Access Points</h1>
        <p className="text-gray-600">
          Upload {totalAPs} access points to RUCKUS One and assign them to AP Groups
        </p>
      </div>

      {/* Summary Card */}
      <div className="card mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Migration Summary</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">Total APs</p>
            <p className="text-2xl font-bold text-gray-900">{totalAPs}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">AP Groups</p>
            <p className="text-2xl font-bold text-gray-900">
              {extractedData.apGroups.length}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Venues</p>
            <p className="text-2xl font-bold text-gray-900">
              {Object.keys(venueMapping).length}
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
              <h3 className="font-semibold text-blue-900">
                {uploadComplete ? 'Assigning APs to Groups...' : 'Uploading APs...'}
              </h3>
              <p className="text-sm text-blue-700">
                {progress.completed} of {progress.total} APs processed
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
      {allComplete && (
        <div className="card mb-6 bg-green-50 border-green-200">
          <div className="flex items-center space-x-3">
            <CheckCircle size={24} className="text-green-600" />
            <div>
              <h3 className="font-semibold text-green-900">APs Uploaded Successfully!</h3>
              <p className="text-sm text-green-700">
                {progress.completed} APs uploaded and assigned to AP Groups
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

      {/* AP List Preview */}
      <div className="card mb-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <Wifi size={20} />
          <span>Access Points to Upload</span>
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
                  AP Group
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {extractedData.accessPoints.map((ap) => {
                const zone = extractedData.zones.find((z) => z.id === ap.zoneId)
                const apGroup = extractedData.apGroups.find((g) => g.id === ap.apGroupId)
                return (
                  <tr key={ap.serial} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900">{ap.name}</td>
                    <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                      {sanitizeSerial(ap.serial)}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{ap.model}</td>
                    <td className="px-3 py-2 text-gray-600">{zone?.name || 'Unknown'}</td>
                    <td className="px-3 py-2 text-gray-600">{apGroup?.name || 'None'}</td>
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
          disabled={uploading}
          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Back
        </button>

        {allComplete ? (
          <button type="button" onClick={onComplete} className="btn-primary">
            Continue to Switch Upload →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleUploadAPs}
            disabled={uploading || totalAPs === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading APs...' : `Upload ${totalAPs} Access Points`}
          </button>
        )}
      </div>
    </div>
  )
}
