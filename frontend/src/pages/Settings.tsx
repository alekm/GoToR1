import { useState, useEffect } from 'react'
import { Save, CheckCircle, XCircle, Loader } from 'lucide-react'
import { useAuth, getDefaultCredentials } from '../contexts/AuthContext'
import { testConnection } from '../services/ruckusOneClient'
import type { RuckusRegion } from '../services/apiClient'

export default function Settings() {
  const { credentials, saveCredentials, clearCredentials } = useAuth()
  const [formData, setFormData] = useState(getDefaultCredentials())
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  // Load credentials into form when available
  useEffect(() => {
    if (credentials) {
      setFormData(credentials)
    }
  }, [credentials])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setTestResult(null)

    try {
      saveCredentials(formData)
      setTestResult({
        success: true,
        message: 'Settings saved successfully!',
      })
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to save settings',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const result = await testConnection(formData)
      if (result.success) {
        setTestResult({
          success: true,
          message: 'Connection successful! Credentials are valid.',
        })
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Connection failed',
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

  const handleClear = () => {
    if (confirm('Are you sure you want to clear your RUCKUS One credentials?')) {
      clearCredentials()
      setFormData(getDefaultCredentials())
      setTestResult(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">
          Configure your RUCKUS One API credentials to enable migrations
        </p>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          RUCKUS One API Configuration
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Region</label>
            <select
              className="input-field"
              value={formData.region}
              onChange={(e) =>
                setFormData({ ...formData, region: e.target.value as RuckusRegion })
              }
            >
              <option value="na">North America (api.ruckus.cloud)</option>
              <option value="eu">Europe (api.eu.ruckus.cloud)</option>
              <option value="asia">Asia (api.asia.ruckus.cloud)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tenant ID</label>
            <input
              type="text"
              className="input-field font-mono text-sm"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={formData.tenantId}
              onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Client ID</label>
            <input
              type="text"
              className="input-field font-mono text-sm"
              placeholder="Application Token Client ID"
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Secret
            </label>
            <input
              type="password"
              className="input-field font-mono text-sm"
              placeholder="Application Token Client Secret"
              value={formData.clientSecret}
              onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
              required
            />
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">How to get your credentials:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Log into your RUCKUS One account</li>
              <li>Navigate to Administration → Account Management → Settings</li>
              <li>Create an Application Token with Administrator scope</li>
              <li>Copy the Client ID, Client Secret, and Tenant ID</li>
            </ol>
          </div>

          <div className="flex justify-between items-center pt-4">
            <button
              type="button"
              onClick={handleClear}
              className="text-red-600 hover:text-red-700 font-medium text-sm"
            >
              Clear Credentials
            </button>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !formData.tenantId || !formData.clientId || !formData.clientSecret}
                className="btn-secondary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    <span>Test Connection</span>
                  </>
                )}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex items-center space-x-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save Settings</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
