/**
 * Step 10: Migration Verification & Reporting
 *
 * Display migration summary and verification results
 */

import { useState } from 'react'
import { CheckCircle, AlertCircle, Info, Download, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { SmartZoneData } from '../../types/migration'

interface Step10_VerificationProps {
  projectId: string
  extractedData: SmartZoneData
  venueMapping: Record<string, string>
  onBack: () => void
}

export default function Step10_Verification({
  projectId,
  extractedData,
  venueMapping,
  onBack,
}: Step10_VerificationProps) {
  const navigate = useNavigate()
  const [downloadingReport, setDownloadingReport] = useState(false)

  const stats = {
    zones: extractedData.zones.length,
    wlans: extractedData.wlans.length,
    apGroups: extractedData.apGroups.length,
    aps: extractedData.accessPoints.length,
    switches: extractedData.switches.length,
    venues: Object.keys(venueMapping).length,
  }

  const handleDownloadReport = () => {
    setDownloadingReport(true)

    // Generate migration report
    const report = {
      projectId,
      timestamp: new Date().toISOString(),
      summary: {
        totalZones: stats.zones,
        totalWLANs: stats.wlans,
        totalAPGroups: stats.apGroups,
        totalAPs: stats.aps,
        totalSwitches: stats.switches,
        totalVenues: stats.venues,
      },
      zones: extractedData.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        venueId: venueMapping[zone.id],
      })),
      wlans: extractedData.wlans.map((wlan) => ({
        id: wlan.id,
        name: wlan.name,
        ssid: wlan.ssid,
        type: wlan.type,
        zoneId: wlan.zoneId,
      })),
      apGroups: extractedData.apGroups.map((group) => ({
        id: group.id,
        name: group.name,
        zoneId: group.zoneId,
      })),
      accessPoints: extractedData.accessPoints.map((ap) => ({
        serial: ap.serial,
        name: ap.name,
        model: ap.model,
        zoneId: ap.zoneId,
        apGroupId: ap.apGroupId,
      })),
      switches: extractedData.switches.map((sw) => ({
        serial: sw.serial,
        name: sw.name,
        model: sw.model,
        zoneId: sw.zoneId,
      })),
    }

    // Create downloadable JSON file
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `migration-report-${projectId}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setDownloadingReport(false)
  }

  const handleFinish = () => {
    navigate('/')
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Migration Complete!</h1>
        <p className="text-gray-600">
          Your SmartZone configuration has been successfully migrated to RUCKUS One
        </p>
      </div>

      {/* Success Banner */}
      <div className="card mb-6 bg-green-50 border-green-200">
        <div className="flex items-start space-x-4">
          <CheckCircle size={32} className="text-green-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-green-900 mb-2">
              Migration Completed Successfully
            </h3>
            <p className="text-green-800">
              All resources have been migrated to RUCKUS One. Review the summary below and
              verify the configuration in your RUCKUS One portal.
            </p>
          </div>
        </div>
      </div>

      {/* Migration Summary */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Migration Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <p className="text-sm font-medium text-gray-700">Venues Created</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.venues}</p>
            <p className="text-xs text-gray-500 mt-1">from {stats.zones} SmartZone zones</p>
          </div>

          <div>
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full" />
              <p className="text-sm font-medium text-gray-700">WiFi Networks</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.wlans}</p>
            <p className="text-xs text-gray-500 mt-1">WLANs migrated</p>
          </div>

          <div>
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 bg-indigo-500 rounded-full" />
              <p className="text-sm font-medium text-gray-700">AP Groups</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.apGroups}</p>
            <p className="text-xs text-gray-500 mt-1">AP groups created</p>
          </div>

          <div>
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <p className="text-sm font-medium text-gray-700">Access Points</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.aps}</p>
            <p className="text-xs text-gray-500 mt-1">APs uploaded</p>
          </div>

          <div>
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full" />
              <p className="text-sm font-medium text-gray-700">Switches</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.switches}</p>
            <p className="text-xs text-gray-500 mt-1">switches uploaded</p>
          </div>

          <div>
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 bg-gray-500 rounded-full" />
              <p className="text-sm font-medium text-gray-700">Total Resources</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {stats.venues + stats.wlans + stats.apGroups + stats.aps + stats.switches}
            </p>
            <p className="text-xs text-gray-500 mt-1">items migrated</p>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="card mb-6 bg-blue-50 border-blue-200">
        <div className="flex items-start space-x-4">
          <Info size={24} className="text-blue-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">Next Steps</h3>
            <ol className="space-y-2 text-blue-800">
              <li className="flex items-start space-x-2">
                <span className="font-semibold mt-0.5">1.</span>
                <span>
                  <strong>Log into RUCKUS One</strong> and verify all resources were created
                  correctly
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="font-semibold mt-0.5">2.</span>
                <span>
                  <strong>Verify RF settings</strong> for each venue match your SmartZone
                  configuration
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="font-semibold mt-0.5">3.</span>
                <span>
                  <strong>Test WLANs</strong> to ensure security settings and network policies
                  are correct
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="font-semibold mt-0.5">4.</span>
                <span>
                  <strong>Verify AP assignments</strong> to ensure all APs are in the correct
                  AP Groups
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="font-semibold mt-0.5">5.</span>
                <span>
                  <strong>Plan hardware cutover</strong> - disconnect APs from SmartZone and
                  allow them to adopt to RUCKUS One
                </span>
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Important Notes */}
      <div className="card mb-6 bg-yellow-50 border-yellow-200">
        <div className="flex items-start space-x-4">
          <AlertCircle size={24} className="text-yellow-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-yellow-900 mb-3">Important Notes</h3>
            <ul className="space-y-2 text-yellow-800 text-sm">
              <li className="flex items-start space-x-2">
                <span className="mt-1">•</span>
                <span>
                  <strong>AAA/802.1X networks:</strong> RADIUS servers must be pre-configured
                  in RUCKUS One before WLANs can authenticate users
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="mt-1">•</span>
                <span>
                  <strong>Hotspot 2.0:</strong> Limited support in RUCKUS One - manual review
                  and configuration required
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="mt-1">•</span>
                <span>
                  <strong>Advanced features:</strong> Some SmartZone features (L2/L3 ACL,
                  dynamic VLAN, etc.) may require manual configuration in RUCKUS One
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="mt-1">•</span>
                <span>
                  <strong>AP adoption:</strong> APs will need to be factory reset or manually
                  pointed to RUCKUS One for adoption
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Zone → Venue Mapping */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Zone to Venue Mapping</h3>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  SmartZone Zone
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  RUCKUS One Venue ID
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  WLANs
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  APs
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {extractedData.zones.map((zone) => {
                const wlanCount = extractedData.wlans.filter(
                  (w) => w.zoneId === zone.id
                ).length
                const apCount = extractedData.accessPoints.filter(
                  (ap) => ap.zoneId === zone.id
                ).length
                return (
                  <tr key={zone.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900 font-medium">{zone.name}</td>
                    <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                      {venueMapping[zone.id] || 'Not created'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{wlanCount}</td>
                    <td className="px-3 py-2 text-gray-600">{apCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          type="button"
          onClick={handleDownloadReport}
          disabled={downloadingReport}
          className="btn-secondary flex items-center justify-center space-x-2"
        >
          <Download size={16} />
          <span>{downloadingReport ? 'Downloading...' : 'Download Migration Report'}</span>
        </button>

        <a
          href="https://ruckus.cloud"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex items-center justify-center space-x-2"
        >
          <ExternalLink size={16} />
          <span>Open RUCKUS One Portal</span>
        </a>

        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back
        </button>

        <button type="button" onClick={handleFinish} className="btn-primary ml-auto">
          Return to Projects
        </button>
      </div>
    </div>
  )
}
