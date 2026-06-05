import { useState } from 'react'
import { CheckCircle, Wifi, Loader, AlertCircle } from 'lucide-react'
import {
  batchUploadAPs,
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

  const totalAPs = extractedData.accessPoints.length

  function sanitizeSerial(serial: string): string {
    const digits = serial.replace(/\D/g, '')
    const padded = digits.padStart(12, '0')
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

    const r1Credentials: RuckusOneCredentials = credentials

    try {
      // Detect duplicate AP names (R1 limit: 2-32 chars, must be unique)
      const nameCount = new Map<string, number>()
      extractedData.accessPoints.forEach((ap) => {
        nameCount.set(ap.name, (nameCount.get(ap.name) || 0) + 1)
      })

      // Transform SmartZone APs to R1 format, including group assignment
      const allAPs: R1AccessPoint[] = extractedData.accessPoints.map((ap) => {
        const zone = extractedData.zones.find((z) => z.id === ap.zoneId)
        const zoneName = zone?.name || 'unknown-zone'
        const venueId = venueMapping[ap.zoneId]
        const apGroupId = ap.apGroupId ? apGroupMapping[ap.apGroupId] : undefined

        let apName = ap.name
        const isDuplicate = (nameCount.get(ap.name) || 0) > 1

        if (isDuplicate || apName.length > 32) {
          const macSuffix = ap.mac.slice(-6).toUpperCase()
          apName = apName.length > 25
            ? apName.slice(0, 25) + '-' + macSuffix
            : `${apName}-${macSuffix}`
          if (apName.length > 32) apName = apName.slice(0, 32)
        }

        return {
          serialNumber: sanitizeSerial(ap.serial),
          name: apName,
          description: `${ap.name} (migrated from SmartZone zone: ${zoneName})`,
          model: ap.model,
          tags: ['migrated-from-smartzone', `sz-zone:${zoneName}`, `sz-name:${ap.name}`],
          deviceGps: ap.gps
            ? { latitude: ap.gps.latitude, longitude: ap.gps.longitude }
            : undefined,
          venueId,
          apGroupId,
        }
      })

      // Filter APs with no venue mapping — can't upload without a venue
      const validAPs = allAPs.filter((ap) => ap.venueId)
      const skippedCount = allAPs.length - validAPs.length
      if (skippedCount > 0) {
        setErrors([`${skippedCount} AP${skippedCount > 1 ? 's' : ''} skipped — no venue mapping found`])
      }

      const batchSize = 50
      const totalBatches = Math.ceil(validAPs.length / batchSize)
      setProgress({ total: validAPs.length, completed: 0, failed: 0, currentBatch: 0, totalBatches })

      // Batch upload — apGroupId is included in payload so group assignment happens at upload time
      const result = await batchUploadAPs(r1Credentials, validAPs, (completed, total) => {
        setProgress({
          total,
          completed,
          failed: 0,
          currentBatch: Math.ceil(completed / batchSize),
          totalBatches,
        })
      })

      const failErrors = result.failed.map(
        ({ ap, error }) => `Failed to upload AP "${ap.name}": ${error}`
      )

      setProgress((prev) => ({
        ...prev,
        completed: result.success.length,
        failed: result.failed.length,
      }))
      setErrors((prev) => [...prev, ...failErrors])
      setUploadComplete(true)

    } catch (err) {
      setErrors([`AP upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`])
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
              <h3 className="font-semibold text-blue-900">Uploading APs...</h3>
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
      {uploadComplete && (
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

        {uploadComplete ? (
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
