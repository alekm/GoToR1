/**
 * Step 4: Review Extracted Data
 *
 * Display extracted SmartZone configuration with detailed tables
 * Allow CSV import and manual entry for additional switches
 */

import { useState } from 'react'
import {
  CheckCircle,
  AlertCircle,
  Download,
  Upload,
  Plus,
  X,
  FileText,
  Wifi,
  Radio,
  HardDrive,
  Building2,
} from 'lucide-react'
import type { SmartZoneData, SZSwitch } from '../../types/migration'

interface Step4ReviewExtractedDataProps {
  projectId: string
  extractedData: SmartZoneData
  onComplete: (data: SmartZoneData) => void
  onBack: () => void
}

export default function Step4_ReviewExtractedData({
  extractedData: initialData,
  onComplete,
  onBack,
}: Step4ReviewExtractedDataProps) {
  const [data, setData] = useState<SmartZoneData>(initialData)
  const [activeTab, setActiveTab] = useState<'summary' | 'zones' | 'wlans' | 'apgroups' | 'aps' | 'switches'>('summary')
  const [showSwitchImport, setShowSwitchImport] = useState(false)
  const [showManualSwitch, setShowManualSwitch] = useState(false)
  const [manualSwitch, setManualSwitch] = useState<Partial<SZSwitch>>({
    managedBy: 'manual',
  })

  // Stats
  const totalAPs = data.accessPoints.length
  const apsWithGPS = data.accessPoints.filter((ap) => ap.gps).length
  const apsWithoutGPS = totalAPs - apsWithGPS
  const totalSwitches = data.switches.length
  const szManagedSwitches = data.switches.filter((sw) => sw.managedBy === 'smartzone').length
  const csvSwitches = data.switches.filter((sw) => sw.managedBy === 'csv').length
  const manualSwitches = data.switches.filter((sw) => sw.managedBy === 'manual').length

  const handleCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string

      // Split lines and filter out comments and empty lines
      const lines = text.split('\n')
        .filter((line) => line.trim() && !line.trim().startsWith('#'))

      if (lines.length < 2) {
        alert('CSV file must have a header and at least one data row')
        return
      }

      // Parse CSV with RFC 4180 support (simple implementation)
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = []
        let current = ''
        let inQuotes = false

        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          const nextChar = line[i + 1]

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              current += '"'
              i++ // Skip next quote
            } else {
              inQuotes = !inQuotes
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        result.push(current.trim())
        return result
      }

      const header = parseCSVLine(lines[0]).map(h => h.toLowerCase())
      const newSwitches: SZSwitch[] = []

      // Detect format
      const isR1Format = header.includes('switch name') || header.includes('serial number')
      const serialIdx = header.findIndex(h => h.includes('serial'))
      const nameIdx = header.findIndex(h => h.includes('name'))
      const modelIdx = header.findIndex(h => h.includes('model'))
      const locationIdx = header.findIndex(h => h.includes('location'))

      for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i])

        // Skip empty rows
        if (parts.every(p => !p)) continue

        const serial = parts[serialIdx] || parts[0]
        const name = parts[nameIdx] || parts[1] || `Switch-${i}`

        if (!serial) continue

        newSwitches.push({
          serial,
          mac: `00:00:00:00:00:${i.toString().padStart(2, '0')}`, // Placeholder MAC
          name,
          model: (modelIdx >= 0 ? parts[modelIdx] : '') || 'Unknown',
          location: (locationIdx >= 0 ? parts[locationIdx] : '') || '',
          managedBy: 'csv',
        })
      }

      if (newSwitches.length > 0) {
        setData((prev) => ({
          ...prev,
          switches: [...prev.switches, ...newSwitches],
          totalItems: {
            ...prev.totalItems,
            switches: prev.switches.length + newSwitches.length,
          },
        }))
        setShowSwitchImport(false)
        alert(`Imported ${newSwitches.length} switches from CSV`)
      } else {
        alert('No valid switch data found in CSV')
      }
    }
    reader.readAsText(file)
  }

  const handleAddManualSwitch = () => {
    if (!manualSwitch.serial || !manualSwitch.name) {
      alert('Serial number and name are required')
      return
    }

    const newSwitch: SZSwitch = {
      serial: manualSwitch.serial,
      mac: manualSwitch.mac || `00:00:00:00:00:${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
      name: manualSwitch.name,
      model: manualSwitch.model || 'Unknown',
      location: manualSwitch.location,
      description: manualSwitch.description,
      managedBy: 'manual',
    }

    setData((prev) => ({
      ...prev,
      switches: [...prev.switches, newSwitch],
      totalItems: {
        ...prev.totalItems,
        switches: prev.switches.length + 1,
      },
    }))

    setManualSwitch({ managedBy: 'manual' })
    setShowManualSwitch(false)
  }

  const handleRemoveSwitch = (serial: string) => {
    if (confirm(`Remove switch ${serial}?`)) {
      setData((prev) => ({
        ...prev,
        switches: prev.switches.filter((sw) => sw.serial !== serial),
        totalItems: {
          ...prev.totalItems,
          switches: prev.switches.length - 1,
        },
      }))
    }
  }

  const handleDownloadTemplate = () => {
    const template = `# RUCKUS One Switch Import Template
# Supports two formats:
#
# Format 1 - R1 Standard (for direct import to RUCKUS One):
# Switch Name,Serial Number,Reason
# My Switch,FEK3204N001,
#
# Format 2 - Extended (includes model and location):
# Serial,Name,Model,Location
# FEK3204N001,My Switch,ICX7150,Building A
#
# Notes:
# - Lines starting with # are ignored
# - Header row is required
# - Serial number format: PPPnnWWYsss (e.g., FEK3204N001)
#
Switch Name,Serial Number,Reason
`
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'switch-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleContinue = () => {
    onComplete(data)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Review Extracted Data</h1>
        <p className="text-gray-600">
          Review the configuration data extracted from SmartZone and add additional switches if needed
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="card mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 overflow-x-auto" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('summary')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'summary'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText size={18} />
              <span>Summary</span>
            </button>
            <button
              onClick={() => setActiveTab('zones')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'zones'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Building2 size={18} />
              <span>Zones ({data.totalItems.zones})</span>
            </button>
            <button
              onClick={() => setActiveTab('wlans')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'wlans'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Wifi size={18} />
              <span>WLANs ({data.totalItems.wlans})</span>
            </button>
            <button
              onClick={() => setActiveTab('apgroups')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'apgroups'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Radio size={18} />
              <span>AP Groups ({data.totalItems.apGroups})</span>
            </button>
            <button
              onClick={() => setActiveTab('aps')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'aps'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Radio size={18} />
              <span>Access Points ({data.totalItems.aps})</span>
            </button>
            <button
              onClick={() => setActiveTab('switches')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'switches'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <HardDrive size={18} />
              <span>Switches ({data.totalItems.switches})</span>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <CheckCircle size={24} className="text-green-600" />
                  <h3 className="text-lg font-semibold text-green-900">Extraction Summary</h3>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-900">{data.totalItems.zones}</div>
                    <div className="text-sm text-green-700">Zones</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-900">{data.totalItems.wlans}</div>
                    <div className="text-sm text-green-700">WLANs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-900">{data.totalItems.apGroups}</div>
                    <div className="text-sm text-green-700">AP Groups</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-900">{data.totalItems.aps}</div>
                    <div className="text-sm text-green-700">Access Points</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-900">{data.totalItems.switches}</div>
                    <div className="text-sm text-green-700">Switches</div>
                  </div>
                </div>

                <div className="text-sm text-green-700">
                  <div className="flex items-center space-x-2">
                    <Download size={16} />
                    <span>Extracted at: {new Date(data.extractedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {apsWithoutGPS > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-900">Missing GPS Coordinates</p>
                      <p className="text-sm text-yellow-800 mt-1">
                        {apsWithoutGPS} of {totalAPs} Access Points are missing GPS coordinates. You can add these
                        later in RUCKUS One.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Switch Sources Breakdown */}
              {totalSwitches > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Switch Sources</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <div>SmartZone-managed: {szManagedSwitches}</div>
                    <div>CSV imported: {csvSwitches}</div>
                    <div>Manually added: {manualSwitches}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Zones Tab */}
          {activeTab === 'zones' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Zone ID
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.zones.map((zone) => (
                    <tr key={zone.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {zone.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{zone.description || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {zone.id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* WLANs Tab */}
          {activeTab === 'wlans' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SSID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Security Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      VLAN
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Zone
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.wlans.map((wlan) => {
                    const zone = data.zones.find((z) => z.id === wlan.zoneId)
                    return (
                      <tr key={wlan.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {wlan.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{wlan.ssid}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            {wlan.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {wlan.vlan?.accessVlan || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {zone?.name || wlan.zoneId}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* AP Groups Tab */}
          {activeTab === 'apgroups' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      WLANs
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Zone
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.apGroups.map((group) => {
                    const zone = data.zones.find((z) => z.id === group.zoneId)
                    return (
                      <tr key={group.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {group.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{group.description || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {group.wlans?.length || 0} WLANs
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {zone?.name || group.zoneId}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Access Points Tab */}
          {activeTab === 'aps' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Serial
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Model
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      GPS
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Zone
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.accessPoints.map((ap) => {
                    const zone = data.zones.find((z) => z.id === ap.zoneId)
                    return (
                      <tr key={ap.serial}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {ap.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                          {ap.serial}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{ap.model}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {ap.gps ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-yellow-600">⚠</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {zone?.name || ap.zoneId}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Switches Tab */}
          {activeTab === 'switches' && (
            <div className="space-y-4">
              {/* Actions */}
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Switches</h3>
                  <p className="text-sm text-gray-500">Add additional switches via CSV or manual entry</p>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowSwitchImport(true)}
                    className="btn-secondary flex items-center space-x-2"
                  >
                    <Upload size={16} />
                    <span>Import CSV</span>
                  </button>
                  <button
                    onClick={() => setShowManualSwitch(true)}
                    className="btn-primary flex items-center space-x-2"
                  >
                    <Plus size={16} />
                    <span>Add Manually</span>
                  </button>
                </div>
              </div>

              {/* CSV Import Modal */}
              {showSwitchImport && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium text-blue-900">Import Switches from CSV</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        Supports R1 format (Switch Name,Serial Number,Reason) or extended format (Serial,Name,Model,Location)
                      </p>
                    </div>
                    <button onClick={() => setShowSwitchImport(false)} className="text-blue-600 hover:text-blue-800">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={handleDownloadTemplate}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      📥 Download CSV Template
                    </button>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvImport}
                      className="block w-full text-sm text-gray-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-md file:border-0
                        file:text-sm file:font-semibold
                        file:bg-blue-600 file:text-white
                        hover:file:bg-blue-700"
                    />
                  </div>
                </div>
              )}

              {/* Manual Entry Modal */}
              {showManualSwitch && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-medium text-gray-900">Add Switch Manually</h4>
                    <button onClick={() => setShowManualSwitch(false)} className="text-gray-600 hover:text-gray-800">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Serial Number <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={manualSwitch.serial || ''}
                        onChange={(e) => setManualSwitch({ ...manualSwitch, serial: e.target.value })}
                        className="input"
                        placeholder="e.g., SW001234567890"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={manualSwitch.name || ''}
                        onChange={(e) => setManualSwitch({ ...manualSwitch, name: e.target.value })}
                        className="input"
                        placeholder="e.g., Main-Switch-01"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                      <input
                        type="text"
                        value={manualSwitch.model || ''}
                        onChange={(e) => setManualSwitch({ ...manualSwitch, model: e.target.value })}
                        className="input"
                        placeholder="e.g., ICX7150"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        type="text"
                        value={manualSwitch.location || ''}
                        onChange={(e) => setManualSwitch({ ...manualSwitch, location: e.target.value })}
                        className="input"
                        placeholder="e.g., Building A, Floor 1"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <input
                        type="text"
                        value={manualSwitch.description || ''}
                        onChange={(e) => setManualSwitch({ ...manualSwitch, description: e.target.value })}
                        className="input"
                        placeholder="Optional description"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end space-x-3">
                    <button onClick={() => setShowManualSwitch(false)} className="btn-secondary">
                      Cancel
                    </button>
                    <button onClick={handleAddManualSwitch} className="btn-primary">
                      Add Switch
                    </button>
                  </div>
                </div>
              )}

              {/* Switches Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Serial
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Model
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Source
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.switches.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                          No switches found. Import CSV or add manually.
                        </td>
                      </tr>
                    ) : (
                      data.switches.map((sw) => (
                        <tr key={sw.serial}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {sw.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                            {sw.serial}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sw.model}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                sw.managedBy === 'smartzone'
                                  ? 'bg-green-100 text-green-800'
                                  : sw.managedBy === 'csv'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {sw.managedBy}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {sw.managedBy !== 'smartzone' && (
                              <button
                                onClick={() => handleRemoveSwitch(sw.serial)}
                                className="text-red-600 hover:text-red-800"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back
        </button>

        <button type="button" onClick={handleContinue} className="btn-primary">
          Continue to Data Validation →
        </button>
      </div>
    </div>
  )
}
