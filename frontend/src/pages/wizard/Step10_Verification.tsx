import { useState } from 'react'
import { CheckCircle, AlertCircle, Info, Download, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  getVenue,
  getWifiNetwork,
  getAPGroup,
  getRadiusServerProfile,
  type RuckusOneCredentials,
} from '../../services/ruckusOneClient'
import { useAuth } from '../../contexts/AuthContext'
import type { SmartZoneData } from '../../types/migration'

interface Step10_VerificationProps {
  projectId: string
  extractedData: SmartZoneData
  venueMapping: Record<string, string>
  apGroupMapping?: Record<string, string>
  wlanMapping?: Record<string, string>
  radiusMapping?: Record<string, string>
  onBack: () => void
}

interface VerificationItem {
  id: string
  name: string
  found: boolean
  error?: string
}

interface VerificationResults {
  venues: VerificationItem[]
  wlans: VerificationItem[]
  apGroups: VerificationItem[]
  radiusProfiles: VerificationItem[]
}

type VerifyState = 'idle' | 'running' | 'done'

export default function Step10_Verification({
  projectId,
  extractedData,
  venueMapping,
  apGroupMapping,
  wlanMapping,
  radiusMapping,
  onBack,
}: Step10_VerificationProps) {
  const navigate = useNavigate()
  const { credentials } = useAuth()
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [verifyPhase, setVerifyPhase] = useState('')
  const [verifyResults, setVerifyResults] = useState<VerificationResults | null>(null)

  const stats = {
    zones: extractedData.zones.length,
    wlans: extractedData.wlans.length,
    apGroups: extractedData.apGroups.length,
    aps: extractedData.accessPoints.length,
    switches: extractedData.switches.length,
    venues: Object.keys(venueMapping).length,
  }

  const handleVerify = async () => {
    if (!credentials) return

    setVerifyState('running')
    setVerifyResults(null)

    const creds: RuckusOneCredentials = credentials

    async function check<T>(fn: () => Promise<T>): Promise<boolean> {
      try {
        await fn()
        return true
      } catch {
        return false
      }
    }

    // Venues
    setVerifyPhase('venues')
    const venueItems: VerificationItem[] = await Promise.all(
      extractedData.zones.map(async (zone) => {
        const r1Id = venueMapping[zone.id]
        if (!r1Id) return { id: zone.id, name: zone.name, found: false, error: 'No venue ID mapped' }
        const found = await check(() => getVenue(creds, r1Id))
        return { id: r1Id, name: zone.name, found }
      })
    )

    // WLANs
    setVerifyPhase('WLANs')
    const wlanItems: VerificationItem[] = wlanMapping
      ? await Promise.all(
          extractedData.wlans.map(async (wlan) => {
            const r1Id = wlanMapping[wlan.id]
            if (!r1Id) return { id: wlan.id, name: wlan.name, found: false, error: 'Not created' }
            const found = await check(() => getWifiNetwork(creds, r1Id))
            return { id: r1Id, name: wlan.name, found }
          })
        )
      : []

    // AP Groups
    setVerifyPhase('AP Groups')
    const apGroupItems: VerificationItem[] = apGroupMapping
      ? await Promise.all(
          extractedData.apGroups.map(async (apg) => {
            const r1ApGroupId = apGroupMapping[apg.id]
            const venueId = venueMapping[apg.zoneId]
            if (!r1ApGroupId) return { id: apg.id, name: apg.name, found: false, error: 'Not created' }
            if (!venueId) return { id: apg.id, name: apg.name, found: false, error: 'No venue for zone' }
            const found = await check(() => getAPGroup(creds, venueId, r1ApGroupId))
            return { id: r1ApGroupId, name: apg.name, found }
          })
        )
      : []

    // RADIUS profiles
    setVerifyPhase('RADIUS profiles')
    const radiusItems: VerificationItem[] = radiusMapping
      ? await Promise.all(
          extractedData.radiusServices.map(async (svc) => {
            const r1Id = radiusMapping[svc.id]
            if (!r1Id) return { id: svc.id, name: svc.name, found: false, error: 'Not created' }
            const found = await check(() => getRadiusServerProfile(creds, r1Id))
            return { id: r1Id, name: svc.name, found }
          })
        )
      : []

    setVerifyResults({
      venues: venueItems,
      wlans: wlanItems,
      apGroups: apGroupItems,
      radiusProfiles: radiusItems,
    })
    setVerifyState('done')
    setVerifyPhase('')
  }

  const handleDownloadReport = () => {
    setDownloadingReport(true)

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
      mappings: {
        venues: Object.fromEntries(
          extractedData.zones.map((z) => [z.name, venueMapping[z.id] || null])
        ),
        wlans: wlanMapping
          ? Object.fromEntries(extractedData.wlans.map((w) => [w.name, wlanMapping[w.id] || null]))
          : {},
        apGroups: apGroupMapping
          ? Object.fromEntries(
              extractedData.apGroups.map((g) => [g.name, apGroupMapping[g.id] || null])
            )
          : {},
        radiusProfiles: radiusMapping
          ? Object.fromEntries(
              extractedData.radiusServices.map((r) => [r.name, radiusMapping[r.id] || null])
            )
          : {},
      },
      verification: verifyResults || null,
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

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Migration Complete!</h1>
        <p className="text-gray-600">
          Your SmartZone configuration has been migrated to RUCKUS One
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
              All resources have been migrated to RUCKUS One. Use the verification tool below to
              confirm everything exists in your tenant.
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

      {/* Live Verification */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Verify in RUCKUS One</h3>
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifyState === 'running' || !credentials}
            className="btn-secondary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={16} className={verifyState === 'running' ? 'animate-spin' : ''} />
            <span>
              {verifyState === 'running'
                ? `Checking ${verifyPhase}...`
                : verifyState === 'done'
                  ? 'Re-verify'
                  : 'Run Verification'}
            </span>
          </button>
        </div>

        {verifyState === 'idle' && (
          <p className="text-sm text-gray-500">
            Queries RUCKUS One to confirm each venue, WLAN, AP group, and RADIUS profile exists
            in your tenant.
          </p>
        )}

        {verifyState === 'running' && (
          <div className="space-y-2">
            {(['venues', 'WLANs', 'AP Groups', 'RADIUS profiles'] as const).map((phase) => (
              <div key={phase} className="flex items-center space-x-2 text-sm text-gray-600">
                {verifyPhase === phase ? (
                  <RefreshCw size={14} className="animate-spin text-blue-500 flex-shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-gray-300 flex-shrink-0" />
                )}
                <span>{phase}</span>
              </div>
            ))}
          </div>
        )}

        {verifyState === 'done' && verifyResults && (
          <div className="space-y-3">
            <VerifyCategory label="Venues" items={verifyResults.venues} />
            <VerifyCategory label="WLANs" items={verifyResults.wlans} />
            <VerifyCategory label="AP Groups" items={verifyResults.apGroups} />
            <VerifyCategory label="RADIUS Profiles" items={verifyResults.radiusProfiles} />
          </div>
        )}
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
                  <strong>Log into RUCKUS One</strong> and verify all resources were created correctly
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="font-semibold mt-0.5">2.</span>
                <span>
                  <strong>Verify RF settings</strong> for each venue match your SmartZone configuration
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="font-semibold mt-0.5">3.</span>
                <span>
                  <strong>Test WLANs</strong> to ensure security settings and network policies are correct
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="font-semibold mt-0.5">4.</span>
                <span>
                  <strong>Verify AP assignments</strong> — all APs should be in the correct AP Groups
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="font-semibold mt-0.5">5.</span>
                <span>
                  <strong>Plan hardware cutover</strong> — disconnect APs from SmartZone and allow
                  them to adopt to RUCKUS One
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
                  <strong>RADIUS shared secrets:</strong> If SmartZone did not export RADIUS shared
                  secrets, you must manually configure them in RUCKUS One RADIUS server profiles
                  before AAA/802.1X networks can authenticate users
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="mt-1">•</span>
                <span>
                  <strong>AAA/802.1X networks:</strong> Verify RADIUS server connectivity and test
                  authentication after configuring shared secrets
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="mt-1">•</span>
                <span>
                  <strong>Hotspot 2.0:</strong> Limited support in RUCKUS One — manual review and
                  configuration required
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="mt-1">•</span>
                <span>
                  <strong>Advanced features:</strong> Some SmartZone features (L2/L3 ACL, dynamic
                  VLAN, etc.) may require manual configuration in RUCKUS One
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

      {/* WLAN Mapping */}
      {wlanMapping && Object.keys(wlanMapping).length > 0 && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">WLAN Mapping</h3>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    SmartZone WLAN
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    SSID
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Security
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    R1 Network ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {extractedData.wlans.map((wlan) => (
                  <tr key={wlan.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900 font-medium">{wlan.name}</td>
                    <td className="px-3 py-2 text-gray-600">{wlan.ssid}</td>
                    <td className="px-3 py-2 text-gray-600">{wlan.type || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {wlanMapping[wlan.id] ? (
                        <span className="text-green-700">{wlanMapping[wlan.id]}</span>
                      ) : (
                        <span className="text-red-500">Not created</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                const wlanCount = extractedData.wlans.filter((w) => w.zoneId === zone.id).length
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

        <button type="button" onClick={() => navigate('/')} className="btn-primary ml-auto">
          Return to Projects
        </button>
      </div>
    </div>
  )
}

// ── Verify category row ──────────────────────────────────────────────────────

function VerifyCategory({ label, items }: { label: string; items: VerificationItem[] }) {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  const found = items.filter((i) => i.found).length
  const total = items.length
  const allOk = found === total
  const missing = items.filter((i) => !i.found)

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => !allOk && setExpanded((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left ${
          allOk ? 'bg-green-50' : 'bg-red-50 cursor-pointer hover:bg-red-100'
        }`}
      >
        <div className="flex items-center space-x-3">
          {allOk ? (
            <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
          ) : (
            <XCircle size={18} className="text-red-500 flex-shrink-0" />
          )}
          <span className={`font-medium text-sm ${allOk ? 'text-green-900' : 'text-red-900'}`}>
            {label}
          </span>
        </div>
        <span className={`text-sm ${allOk ? 'text-green-700' : 'text-red-700'}`}>
          {found}/{total} found
          {!allOk && <span className="ml-1 text-xs">({missing.length} missing{!expanded ? ' — click to expand' : ''})</span>}
        </span>
      </button>

      {expanded && missing.length > 0 && (
        <ul className="bg-white border-t divide-y">
          {missing.map((item) => (
            <li key={item.id} className="px-4 py-2 flex items-center space-x-3 text-sm">
              <XCircle size={14} className="text-red-400 flex-shrink-0" />
              <span className="text-gray-900">{item.name}</span>
              {item.error && <span className="text-gray-400 text-xs">— {item.error}</span>}
              {item.id && (
                <span className="text-gray-400 font-mono text-xs ml-auto">{item.id}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
