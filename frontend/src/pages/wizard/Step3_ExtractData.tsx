/**
 * Step 3: Extract Data from SmartZone
 *
 * Extracts zones, WLANs, AP Groups, APs, and switches with real-time progress
 */

import { useState, useEffect } from 'react'
import { Loader, CheckCircle, Download, AlertCircle } from 'lucide-react'
import { extractData } from '../../services/smartZoneClient'
import type { SmartZoneConfig, SmartZoneData } from '../../types/migration'

interface Step3ExtractDataProps {
  projectId: string
  config: SmartZoneConfig
  onComplete: (data: SmartZoneData) => void
  onBack: () => void
}

interface ProgressState {
  stage: string
  current: number
  total: number
  percentage: number
}

export default function Step3_ExtractData({
  config,
  onComplete,
  onBack,
}: Step3ExtractDataProps) {
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState<Record<string, ProgressState>>({
    zones: { stage: 'zones', current: 0, total: 0, percentage: 0 },
    wlans: { stage: 'wlans', current: 0, total: 0, percentage: 0 },
    apGroups: { stage: 'apGroups', current: 0, total: 0, percentage: 0 },
    aps: { stage: 'aps', current: 0, total: 0, percentage: 0 },
    switches: { stage: 'switches', current: 0, total: 0, percentage: 0 },
  })
  const [extractedData, setExtractedData] = useState<SmartZoneData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExtract = async () => {
    setExtracting(true)
    setError(null)
    setExtractedData(null)

    try {
      const data = await extractData(
        config,
        config.selectedZone ? [config.selectedZone] : [],
        (stage: string, current: number, total: number) => {
          setProgress((prev) => ({
            ...prev,
            [stage]: {
              stage,
              current,
              total,
              percentage: total > 0 ? Math.round((current / total) * 100) : 0,
            },
          }))
        }
      )

      setExtractedData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract data from SmartZone')
    } finally {
      setExtracting(false)
    }
  }

  const handleContinue = () => {
    if (extractedData) {
      onComplete(extractedData)
    }
  }

  // Auto-start extraction on mount
  useEffect(() => {
    handleExtract()
  }, [])

  const getStageLabel = (stage: string): string => {
    switch (stage) {
      case 'zones':
        return 'Zones'
      case 'wlans':
        return 'WLANs'
      case 'apGroups':
        return 'AP Groups'
      case 'aps':
        return 'Access Points'
      case 'switches':
        return 'Switches'
      default:
        return stage
    }
  }

  const getStageIcon = (stage: string) => {
    const p = progress[stage]
    if (!extracting && extractedData) {
      return <CheckCircle size={20} className="text-green-600" />
    }
    if (extracting && p.current > 0) {
      return <Loader size={20} className="text-orange-600 animate-spin" />
    }
    return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Extract Data from SmartZone</h1>
        <p className="text-gray-600">
          Extracting configuration data from selected zone
        </p>
      </div>

      <div className="card space-y-6">
        {/* Progress Display */}
        <div className="space-y-4">
          {['zones', 'wlans', 'apGroups', 'aps', 'switches'].map((stage) => {
            const p = progress[stage]
            return (
              <div key={stage} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    {getStageIcon(stage)}
                    <span className="font-medium text-gray-900">{getStageLabel(stage)}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {extractedData ? (
                      <span className="text-green-600 font-medium">
                        ✓ {extractedData.totalItems[stage as keyof typeof extractedData.totalItems]}{' '}
                        extracted
                      </span>
                    ) : extracting && p.total > 0 ? (
                      `${p.current} / ${p.total}`
                    ) : (
                      <span className="text-gray-400">Waiting...</span>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {extracting && p.total > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${p.percentage}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-900">Extraction Failed</p>
              <p className="text-sm text-red-800 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Success Summary */}
        {extractedData && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <CheckCircle size={24} className="text-green-600" />
              <h3 className="text-lg font-semibold text-green-900">
                Extraction Complete!
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-900">
                  {extractedData.totalItems.zones}
                </div>
                <div className="text-sm text-green-700">Zones</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-900">
                  {extractedData.totalItems.wlans}
                </div>
                <div className="text-sm text-green-700">WLANs</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-900">
                  {extractedData.totalItems.apGroups}
                </div>
                <div className="text-sm text-green-700">AP Groups</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-900">
                  {extractedData.totalItems.aps}
                </div>
                <div className="text-sm text-green-700">Access Points</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-900">
                  {extractedData.totalItems.switches}
                </div>
                <div className="text-sm text-green-700">Switches</div>
              </div>
            </div>

            <div className="mt-4 text-sm text-green-700">
              <div className="flex items-center space-x-2">
                <Download size={16} />
                <span>
                  Extracted at: {new Date(extractedData.extractedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center pt-4 border-t">
          <button
            type="button"
            onClick={onBack}
            disabled={extracting}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Back
          </button>

          <div className="flex space-x-3">
            {error && (
              <button
                type="button"
                onClick={handleExtract}
                className="btn-secondary"
              >
                Retry Extraction
              </button>
            )}

            <button
              type="button"
              onClick={handleContinue}
              disabled={!extractedData}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue to Review Data →
            </button>
          </div>
        </div>
      </div>

      {/* Info Section */}
      {extracting && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Extraction in Progress</h4>
          <p className="text-sm text-blue-800">
            This may take a few minutes depending on the size of your SmartZone deployment.
            Please keep this window open until extraction completes.
          </p>
        </div>
      )}
    </div>
  )
}
