import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FolderOpen, Download, Upload, Trash2, Calendar } from 'lucide-react'
import { useMigrationProjects } from '../hooks/useMigrationProjects'
import { formatDistanceToNow } from 'date-fns'

export default function Home() {
  const { projects, loading, error, createProject, deleteProject, exportProject, importProject } =
    useMigrationProjects()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectName.trim()) return

    try {
      await createProject(projectName, projectDescription)
      setProjectName('')
      setProjectDescription('')
      setShowCreateDialog(false)
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      await importProject(file)
      // Clear the input so the same file can be imported again if needed
      e.target.value = ''
    } catch (err) {
      console.error('Failed to import project:', err)
      alert(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"? This cannot be undone.`)) {
      return
    }

    try {
      await deleteProject(projectId)
    } catch (err) {
      console.error('Failed to delete project:', err)
      alert(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to GoToR1</h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Your comprehensive, user-guided assistant for migrating complete RUCKUS SmartZone
          Controller infrastructures to RUCKUS One cloud platform.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4 mb-12">
        <button
          onClick={() => setShowCreateDialog(true)}
          className="card hover:shadow-lg transition-shadow cursor-pointer border-2 border-primary-200"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Plus className="text-primary-600" size={24} />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-semibold text-gray-900">New Project</h3>
              <p className="text-sm text-gray-600">Start a migration</p>
            </div>
          </div>
        </button>

        <button
          onClick={handleImportClick}
          className="card hover:shadow-lg transition-shadow cursor-pointer border-2 border-gray-200"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Upload className="text-gray-600" size={24} />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-semibold text-gray-900">Import</h3>
              <p className="text-sm text-gray-600">Load from file</p>
            </div>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileImport}
          className="hidden"
        />

        <Link
          to="/settings"
          className="card hover:shadow-lg transition-shadow border-2 border-gray-200"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FolderOpen className="text-gray-600" size={24} />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-semibold text-gray-900">Settings</h3>
              <p className="text-sm text-gray-600">Configure R1 API</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Migration Projects List */}
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Your Migration Projects</h2>
          {projects.length > 0 && (
            <span className="text-sm text-gray-500">{projects.length} project(s)</span>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading projects...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-medium">Error loading projects:</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FolderOpen size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg mb-2">No migration projects yet</p>
            <p className="text-sm">Create your first project to get started</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Link to={`/migrate/${project.id}`} className="block group">
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                      )}
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center space-x-1">
                          <Calendar size={14} />
                          <span>
                            {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                          </span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            project.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : project.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : project.status === 'migrating'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {project.status}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span>{project.currentStep}</span>
                      </div>
                    </Link>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => exportProject(project.id)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Export project"
                    >
                      <Download size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(project.id, project.name)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete project"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Migration Project</h2>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Building A Migration"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  className="input-field"
                  rows={3}
                  placeholder="Brief description of this migration..."
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateDialog(false)
                    setProjectName('')
                    setProjectDescription('')
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feature Overview */}
      <div className="mt-12 grid md:grid-cols-3 gap-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-phase-gathering rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">1</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Data Gathering</h3>
          <p className="text-sm text-gray-600">
            Connect to SmartZone and extract zones, WLANs, AP Groups, APs, and switches
          </p>
        </div>

        <div className="text-center">
          <div className="w-16 h-16 bg-phase-validation rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">2</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Validation</h3>
          <p className="text-sm text-gray-600">
            Review and validate extracted data with conflict detection and resolution
          </p>
        </div>

        <div className="text-center">
          <div className="w-16 h-16 bg-phase-config rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">3</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Configuration</h3>
          <p className="text-sm text-gray-600">
            Create venues and generate WLAN/AP Group configs with user approval
          </p>
        </div>
      </div>
    </div>
  )
}
