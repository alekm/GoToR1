/**
 * Step 5: Data Validation
 *
 * Run validation checks and display report
 */

import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { validateData, hasBlockingIssues } from '../../services/validator'
import type { SmartZoneData, ValidationReport } from '../../types/migration'

interface Step5DataValidationProps {
  projectId: string
  extractedData: SmartZoneData
  onComplete: () => void
  onBack: () => void
}

export default function Step5_DataValidation({
  extractedData,
  onComplete,
  onBack,
}: Step5DataValidationProps) {
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [validating, setValidating] = useState(true)
  const [showDetails, setShowDetails] = useState({
    errors: true,
    warnings: true,
    info: false,
    conflicts: true,
    unsupported: true,
  })

  useEffect(() => {
    // Run validation
    setValidating(true)
    setTimeout(() => {
      const validationReport = validateData(extractedData)
      setReport(validationReport)
      setValidating(false)
    }, 500) // Small delay for UX
  }, [extractedData])

  const handleContinue = () => {
    if (report && hasBlockingIssues(report)) {
      alert('Please resolve all errors before continuing')
      return
    }
    onComplete()
  }

  const getSeverityIcon = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={20} className="text-red-600" />
      case 'warning':
        return <AlertTriangle size={20} className="text-yellow-600" />
      case 'info':
        return <Info size={20} className="text-blue-600" />
    }
  }

  const errorIssues = report?.issues.filter((i) => i.severity === 'error') || []
  const warningIssues = report?.issues.filter((i) => i.severity === 'warning') || []
  const infoIssues = report?.issues.filter((i) => i.severity === 'info') || []
  const blockerConflicts = report?.conflicts.filter((c) => c.severity === 'blocker') || []
  const warningConflicts = report?.conflicts.filter((c) => c.severity === 'warning') || []

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Data Validation</h1>
        <p className="text-gray-600">
          Pre-migration validation to detect issues before proceeding to RUCKUS One
        </p>
      </div>

      {validating && (
        <div className="card text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mb-4"></div>
          <p className="text-gray-600">Running validation checks...</p>
        </div>
      )}

      {!validating && report && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className={`card ${hasBlockingIssues(report) ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}>
            <div className="flex items-center space-x-3 mb-4">
              {hasBlockingIssues(report) ? (
                <AlertCircle size={24} className="text-red-600" />
              ) : (
                <CheckCircle size={24} className="text-green-600" />
              )}
              <h3 className={`text-lg font-semibold ${hasBlockingIssues(report) ? 'text-red-900' : 'text-green-900'}`}>
                {hasBlockingIssues(report) ? 'Validation Failed - Issues Found' : 'Validation Passed'}
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className="text-center">
                <div className={`text-3xl font-bold ${hasBlockingIssues(report) ? 'text-red-900' : 'text-green-900'}`}>
                  {report.summary.totalVenues}
                </div>
                <div className={`text-sm ${hasBlockingIssues(report) ? 'text-red-700' : 'text-green-700'}`}>Venues</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${hasBlockingIssues(report) ? 'text-red-900' : 'text-green-900'}`}>
                  {report.summary.totalWLANs}
                </div>
                <div className={`text-sm ${hasBlockingIssues(report) ? 'text-red-700' : 'text-green-700'}`}>WLANs</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${hasBlockingIssues(report) ? 'text-red-900' : 'text-green-900'}`}>
                  {report.summary.totalAPGroups}
                </div>
                <div className={`text-sm ${hasBlockingIssues(report) ? 'text-red-700' : 'text-green-700'}`}>AP Groups</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${hasBlockingIssues(report) ? 'text-red-900' : 'text-green-900'}`}>
                  {report.summary.totalAPs}
                </div>
                <div className={`text-sm ${hasBlockingIssues(report) ? 'text-red-700' : 'text-green-700'}`}>Access Points</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${report.summary.errors + report.summary.conflicts > 0 ? 'text-red-900' : report.summary.warnings > 0 ? 'text-yellow-900' : 'text-green-900'}`}>
                  {report.summary.errors + report.summary.conflicts}
                </div>
                <div className={`text-sm ${hasBlockingIssues(report) ? 'text-red-700' : 'text-green-700'}`}>Errors</div>
              </div>
            </div>

            <div className={`text-sm ${hasBlockingIssues(report) ? 'text-red-700' : 'text-green-700'}`}>
              <div className="space-y-1">
                <div>{report.summary.errors} errors, {report.summary.warnings} warnings</div>
                <div>Validated at: {new Date(report.timestamp).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Zones/Venues Details */}
          {extractedData.zones.length > 0 && (
            <div className="card border-gray-300 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Zones / Venues ({extractedData.zones.length})
              </h3>
              <div className="space-y-2">
                {extractedData.zones.map((zone, idx) => (
                  <div key={idx} className="py-2 px-3 bg-gray-50 rounded border border-gray-200">
                    <div className="font-medium text-gray-900">{zone.name}</div>
                    {zone.description && (
                      <div className="text-sm text-gray-600 mt-1">{zone.description}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">Zone ID: {zone.id}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WLAN Details */}
          {extractedData.wlans.length > 0 && (
            <div className="card border-gray-300 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                WLANs ({extractedData.wlans.length})
              </h3>
              <div className="space-y-2">
                {extractedData.wlans.map((wlan, idx) => (
                  <div key={idx} className="py-2 px-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <span className="font-medium text-gray-900">{wlan.name}</span>
                        <span className="text-gray-500 ml-2">
                          ({wlan.type || 'no type specified'})
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        SSID: {wlan.ssid}
                      </div>
                    </div>
                    {wlan.vlan?.accessVlan && (
                      <div className="text-sm text-gray-600 mt-1">VLAN: {wlan.vlan.accessVlan}</div>
                    )}
                    {wlan.encryption && (
                      <div className="text-sm text-gray-600">
                        Encryption: {wlan.encryption.method} / {wlan.encryption.algorithm}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AP Groups Details */}
          {extractedData.apGroups.length > 0 && (
            <div className="card border-gray-300 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                AP Groups ({extractedData.apGroups.length})
              </h3>
              <div className="space-y-2">
                {extractedData.apGroups.map((group, idx) => {
                  const zone = extractedData.zones.find((z) => z.id === group.zoneId)
                  return (
                    <div key={idx} className="py-2 px-3 bg-gray-50 rounded border border-gray-200">
                      <div className="font-medium text-gray-900">{group.name}</div>
                      {group.description && (
                        <div className="text-sm text-gray-600 mt-1">{group.description}</div>
                      )}
                      <div className="text-sm text-gray-600 mt-1">
                        Zone: {zone?.name || group.zoneId}
                      </div>
                      {group.wlans && group.wlans.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          WLANs: {group.wlans.map((w) => w.name).join(', ')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Access Points Details */}
          {extractedData.accessPoints.length > 0 && (
            <div className="card border-gray-300 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Access Points ({extractedData.accessPoints.length})
              </h3>
              <div className="space-y-2">
                {extractedData.accessPoints.map((ap, idx) => {
                  const zone = extractedData.zones.find((z) => z.id === ap.zoneId)
                  const apGroup = extractedData.apGroups.find((g) => g.id === ap.apGroupId)
                  return (
                    <div key={idx} className="py-2 px-3 bg-gray-50 rounded border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-900">{ap.name}</div>
                        <div className="text-sm text-gray-600">{ap.model}</div>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">Serial: {ap.serial}</div>
                      <div className="text-sm text-gray-600">
                        Zone: {zone?.name || 'Unknown'} | AP Group: {apGroup?.name || 'Unknown'}
                      </div>
                      {ap.gps && (
                        <div className="text-xs text-gray-500 mt-1">
                          GPS: {ap.gps.latitude}, {ap.gps.longitude}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Switches Details */}
          {extractedData.switches.length > 0 && (
            <div className="card border-gray-300 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Switches ({extractedData.switches.length})
              </h3>
              <div className="space-y-2">
                {extractedData.switches.map((sw, idx) => (
                  <div key={idx} className="py-2 px-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900">{sw.name}</div>
                      <div className="text-sm text-gray-600">{sw.model}</div>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">Serial: {sw.serial}</div>
                    {sw.location && (
                      <div className="text-sm text-gray-600">Location: {sw.location}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {errorIssues.length > 0 && (
            <div className="card border-red-300 bg-red-50">
              <button
                onClick={() => setShowDetails({ ...showDetails, errors: !showDetails.errors })}
                className="w-full flex items-center justify-between mb-4"
              >
                <div className="flex items-center space-x-3">
                  <AlertCircle size={20} className="text-red-600" />
                  <h3 className="text-lg font-semibold text-red-900">
                    Errors ({errorIssues.length})
                  </h3>
                </div>
                <span className="text-red-600">{showDetails.errors ? '−' : '+'}</span>
              </button>

              {showDetails.errors && (
                <div className="space-y-3">
                  {errorIssues.map((issue, idx) => (
                    <div key={idx} className="bg-white border border-red-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        {getSeverityIcon(issue.severity)}
                        <div className="flex-1">
                          <p className="font-medium text-red-900">{issue.message}</p>
                          {issue.suggestion && (
                            <p className="text-sm text-red-700 mt-1">💡 {issue.suggestion}</p>
                          )}
                          <p className="text-xs text-red-600 mt-2">
                            Affected: {issue.affectedItems.length} item(s)
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Conflicts */}
          {blockerConflicts.length > 0 && (
            <div className="card border-red-300 bg-red-50">
              <button
                onClick={() => setShowDetails({ ...showDetails, conflicts: !showDetails.conflicts })}
                className="w-full flex items-center justify-between mb-4"
              >
                <div className="flex items-center space-x-3">
                  <X size={20} className="text-red-600" />
                  <h3 className="text-lg font-semibold text-red-900">
                    Conflicts ({blockerConflicts.length})
                  </h3>
                </div>
                <span className="text-red-600">{showDetails.conflicts ? '−' : '+'}</span>
              </button>

              {showDetails.conflicts && (
                <div className="space-y-3">
                  {blockerConflicts.map((conflict, idx) => (
                    <div key={idx} className="bg-white border border-red-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <X size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-medium text-red-900">{conflict.type?.replace(/_/g, ' ').toUpperCase() || 'CONFLICT'}</p>
                          <p className="text-sm text-red-700 mt-1">
                            {conflict.items.length} conflicting items
                          </p>
                          {conflict.resolution && (
                            <p className="text-sm text-red-600 mt-2">💡 {conflict.resolution}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Warnings */}
          {(warningIssues.length > 0 || warningConflicts.length > 0) && (
            <div className="card border-yellow-300 bg-yellow-50">
              <button
                onClick={() => setShowDetails({ ...showDetails, warnings: !showDetails.warnings })}
                className="w-full flex items-center justify-between mb-4"
              >
                <div className="flex items-center space-x-3">
                  <AlertTriangle size={20} className="text-yellow-600" />
                  <h3 className="text-lg font-semibold text-yellow-900">
                    Warnings ({warningIssues.length + warningConflicts.length})
                  </h3>
                </div>
                <span className="text-yellow-600">{showDetails.warnings ? '−' : '+'}</span>
              </button>

              {showDetails.warnings && (
                <div className="space-y-3">
                  {warningIssues.map((issue, idx) => (
                    <div key={idx} className="bg-white border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        {getSeverityIcon(issue.severity)}
                        <div className="flex-1">
                          <p className="font-medium text-yellow-900">{issue.message}</p>
                          {issue.affectedItems && issue.affectedItems.length > 0 && (
                            <p className="text-sm text-yellow-700 mt-1">
                              Affected: {issue.affectedItems.join(', ')}
                            </p>
                          )}
                          {issue.suggestion && (
                            <p className="text-sm text-yellow-700 mt-1">💡 {issue.suggestion}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {warningConflicts.map((conflict, idx) => (
                    <div key={idx} className="bg-white border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-medium text-yellow-900">{conflict.type?.replace(/_/g, ' ').toUpperCase() || 'WARNING'}</p>
                          {conflict.resolution && (
                            <p className="text-sm text-yellow-700 mt-1">{conflict.resolution}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Info */}
          {infoIssues.length > 0 && (
            <div className="card border-blue-300 bg-blue-50">
              <button
                onClick={() => setShowDetails({ ...showDetails, info: !showDetails.info })}
                className="w-full flex items-center justify-between mb-4"
              >
                <div className="flex items-center space-x-3">
                  <Info size={20} className="text-blue-600" />
                  <h3 className="text-lg font-semibold text-blue-900">
                    Info ({infoIssues.length})
                  </h3>
                </div>
                <span className="text-blue-600">{showDetails.info ? '−' : '+'}</span>
              </button>

              {showDetails.info && (
                <div className="space-y-3">
                  {infoIssues.map((issue, idx) => (
                    <div key={idx} className="bg-white border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        {getSeverityIcon(issue.severity)}
                        <div className="flex-1">
                          <p className="font-medium text-blue-900">{issue.message}</p>
                          {issue.suggestion && (
                            <p className="text-sm text-blue-700 mt-1">💡 {issue.suggestion}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Unsupported Features */}
          {report.unsupportedFeatures.length > 0 && (
            <div className="card border-purple-300 bg-purple-50">
              <button
                onClick={() => setShowDetails({ ...showDetails, unsupported: !showDetails.unsupported })}
                className="w-full flex items-center justify-between mb-4"
              >
                <div className="flex items-center space-x-3">
                  <AlertTriangle size={20} className="text-purple-600" />
                  <h3 className="text-lg font-semibold text-purple-900">
                    Unsupported Features ({report.unsupportedFeatures.length})
                  </h3>
                </div>
                <span className="text-purple-600">{showDetails.unsupported ? '−' : '+'}</span>
              </button>

              {showDetails.unsupported && (
                <div className="space-y-3">
                  {report.unsupportedFeatures.map((feature, idx) => (
                    <div key={idx} className="bg-white border border-purple-200 rounded-lg p-4">
                      <p className="font-medium text-purple-900">{feature.feature}</p>
                      <p className="text-sm text-purple-700 mt-1">
                        Affects {feature.affectedItems.length} item(s): {feature.affectedItems.join(', ')}
                      </p>
                      {feature.workaround && (
                        <p className="text-sm text-purple-600 mt-2">💡 {feature.workaround}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <div className="card border-blue-300 bg-blue-50">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Recommendations</h3>
              <ul className="space-y-2 text-sm text-blue-800">
                {report.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <span className="text-blue-600 flex-shrink-0">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center mt-6">
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!report || hasBlockingIssues(report)}
          className={`btn-primary disabled:opacity-50 disabled:cursor-not-allowed ${
            report && hasBlockingIssues(report) ? 'bg-gray-400 hover:bg-gray-400' : ''
          }`}
        >
          {report && hasBlockingIssues(report) ? 'Fix Errors to Continue' : 'Continue to Venue Creation →'}
        </button>
      </div>
    </div>
  )
}
