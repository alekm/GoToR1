/**
 * Migration State Manager
 *
 * Handles persistence of migration projects using IndexedDB.
 * Stores projects, extracted data, checkpoints, and logs across browser sessions.
 */

import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type {
  MigrationProject,
  SmartZoneData,
  RuckusOneData,
  ValidationReport,
  Checkpoint,
  MigrationStatus,
  MigrationStep,
} from '../types/migration'

// ============================================================================
// DATABASE SCHEMA
// ============================================================================

interface MigrationDB extends DBSchema {
  // Main projects table
  projects: {
    key: string // project.id
    value: MigrationProject
    indexes: {
      'by-status': MigrationStatus
      'by-created': string // ISO timestamp
      'by-updated': string // ISO timestamp
    }
  }

  // Extracted SmartZone data (can be large)
  extractedData: {
    key: string // projectId
    value: {
      projectId: string
      timestamp: string
      data: SmartZoneData
    }
  }

  // Transformed RUCKUS One data
  transformedData: {
    key: string // projectId
    value: {
      projectId: string
      timestamp: string
      data: RuckusOneData
    }
  }

  // Validation reports
  validationReports: {
    key: string // projectId
    value: {
      projectId: string
      timestamp: string
      report: ValidationReport
    }
  }

  // Migration checkpoints for rollback
  checkpoints: {
    key: string // checkpointId
    value: {
      id: string
      projectId: string
      timestamp: string
      checkpoint: Checkpoint
    }
    indexes: {
      'by-project': string // projectId
    }
  }

  // Migration logs
  logs: {
    key: number // auto-increment
    value: {
      id?: number // auto-increment key
      projectId: string
      timestamp: string
      level: 'info' | 'warning' | 'error' | 'success'
      message: string
      details?: any
    }
    indexes: {
      'by-project': string // projectId
      'by-timestamp': string
    }
  }
}

// ============================================================================
// DATABASE MANAGER CLASS
// ============================================================================

class MigrationStateManager {
  private dbName = 'gotor1-migrations'
  private dbVersion = 1
  private db: IDBPDatabase<MigrationDB> | null = null

  /**
   * Generate UUID (works in non-secure contexts)
   */
  private generateUUID(): string {
    // Fallback for non-secure contexts (when crypto.randomUUID is not available)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }

    // Simple UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    if (this.db) return // Already initialized

    this.db = await openDB<MigrationDB>(this.dbName, this.dbVersion, {
      upgrade(db) {
        // Projects store
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' })
          projectStore.createIndex('by-status', 'status')
          projectStore.createIndex('by-created', 'createdAt')
          projectStore.createIndex('by-updated', 'updatedAt')
        }

        // Extracted data store
        if (!db.objectStoreNames.contains('extractedData')) {
          db.createObjectStore('extractedData', { keyPath: 'projectId' })
        }

        // Transformed data store
        if (!db.objectStoreNames.contains('transformedData')) {
          db.createObjectStore('transformedData', { keyPath: 'projectId' })
        }

        // Validation reports store
        if (!db.objectStoreNames.contains('validationReports')) {
          db.createObjectStore('validationReports', { keyPath: 'projectId' })
        }

        // Checkpoints store
        if (!db.objectStoreNames.contains('checkpoints')) {
          const checkpointStore = db.createObjectStore('checkpoints', { keyPath: 'id' })
          checkpointStore.createIndex('by-project', 'projectId')
        }

        // Logs store
        if (!db.objectStoreNames.contains('logs')) {
          const logStore = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true })
          logStore.createIndex('by-project', 'projectId')
          logStore.createIndex('by-timestamp', 'timestamp')
        }
      },
    })
  }

  /**
   * Ensure database is initialized
   */
  private async ensureDB(): Promise<IDBPDatabase<MigrationDB>> {
    if (!this.db) {
      await this.init()
    }
    return this.db!
  }

  // ============================================================================
  // PROJECT OPERATIONS
  // ============================================================================

  /**
   * Create a new migration project
   */
  async createProject(name: string, description?: string): Promise<MigrationProject> {
    const db = await this.ensureDB()

    const project: MigrationProject = {
      id: this.generateUUID(),
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStep: 'connect', // Start at Step 2 (Connect to SmartZone) for now
      status: 'draft',
      smartZoneConfig: {
        host: '',
        port: 8443,
        apiVersion: '',
        authType: 'password',
        credentials: {},
        tlsVerify: false,
      },
      checkpoints: [],
      errors: [],
    }

    await db.put('projects', project)
    await this.log(project.id, 'info', `Project "${name}" created`)

    return project
  }

  /**
   * Get a project by ID
   */
  async getProject(projectId: string): Promise<MigrationProject | undefined> {
    const db = await this.ensureDB()
    return db.get('projects', projectId)
  }

  /**
   * Get all projects
   */
  async getAllProjects(): Promise<MigrationProject[]> {
    const db = await this.ensureDB()
    return db.getAll('projects')
  }

  /**
   * Get projects by status
   */
  async getProjectsByStatus(status: MigrationStatus): Promise<MigrationProject[]> {
    const db = await this.ensureDB()
    return db.getAllFromIndex('projects', 'by-status', status)
  }

  /**
   * Update a project with partial data
   */
  async updateProject(
    projectId: string,
    updates: Partial<MigrationProject>
  ): Promise<void> {
    const db = await this.ensureDB()
    const project = await this.getProject(projectId)
    if (!project) throw new Error(`Project ${projectId} not found`)

    // Merge updates into project
    Object.assign(project, updates)
    project.updatedAt = new Date().toISOString()

    await db.put('projects', project)
  }

  /**
   * Update project status
   */
  async updateProjectStatus(projectId: string, status: MigrationStatus): Promise<void> {
    await this.updateProject(projectId, { status })
    await this.log(projectId, 'info', `Project status changed to: ${status}`)
  }

  /**
   * Update project step
   */
  async updateProjectStep(projectId: string, step: MigrationStep): Promise<void> {
    const project = await this.getProject(projectId)
    if (!project) throw new Error(`Project ${projectId} not found`)

    await this.updateProject(projectId, { currentStep: step })
    await this.log(projectId, 'info', `Project step changed to: ${step}`)
  }

  /**
   * Delete a project and all associated data
   */
  async deleteProject(projectId: string): Promise<void> {
    const db = await this.ensureDB()

    // Delete project
    await db.delete('projects', projectId)

    // Delete associated data
    await db.delete('extractedData', projectId)
    await db.delete('transformedData', projectId)
    await db.delete('validationReports', projectId)

    // Delete checkpoints
    const checkpoints = await db.getAllFromIndex('checkpoints', 'by-project', projectId)
    for (const checkpoint of checkpoints) {
      await db.delete('checkpoints', checkpoint.id)
    }

    // Delete logs
    const logs = await db.getAllFromIndex('logs', 'by-project', projectId)
    for (const log of logs) {
      if (log.id) {
        await db.delete('logs', log.id)
      }
    }

    console.log(`Project ${projectId} and all associated data deleted`)
  }

  // ============================================================================
  // EXTRACTED DATA OPERATIONS
  // ============================================================================

  /**
   * Save extracted SmartZone data
   */
  async saveExtractedData(projectId: string, data: SmartZoneData): Promise<void> {
    const db = await this.ensureDB()

    await db.put('extractedData', {
      projectId,
      timestamp: new Date().toISOString(),
      data,
    })

    // Update project
    const project = await this.getProject(projectId)
    if (project) {
      await this.updateProject(projectId, { extractedData: data })
    }

    await this.log(
      projectId,
      'success',
      `Extracted data saved: ${data.totalItems.aps} APs, ${data.totalItems.wlans} WLANs, ${data.totalItems.switches} switches`
    )
  }

  /**
   * Get extracted data for a project
   */
  async getExtractedData(projectId: string): Promise<SmartZoneData | undefined> {
    const db = await this.ensureDB()
    const record = await db.get('extractedData', projectId)
    return record?.data
  }

  // ============================================================================
  // TRANSFORMED DATA OPERATIONS
  // ============================================================================

  /**
   * Save transformed RUCKUS One data
   */
  async saveTransformedData(projectId: string, data: RuckusOneData): Promise<void> {
    const db = await this.ensureDB()

    await db.put('transformedData', {
      projectId,
      timestamp: new Date().toISOString(),
      data,
    })

    // Update project
    const project = await this.getProject(projectId)
    if (project) {
      await this.updateProject(projectId, { transformedData: data })
    }

    await this.log(projectId, 'success', 'Transformed data saved')
  }

  /**
   * Get transformed data for a project
   */
  async getTransformedData(projectId: string): Promise<RuckusOneData | undefined> {
    const db = await this.ensureDB()
    const record = await db.get('transformedData', projectId)
    return record?.data
  }

  // ============================================================================
  // VALIDATION REPORT OPERATIONS
  // ============================================================================

  /**
   * Save validation report
   */
  async saveValidationReport(projectId: string, report: ValidationReport): Promise<void> {
    const db = await this.ensureDB()

    await db.put('validationReports', {
      projectId,
      timestamp: new Date().toISOString(),
      report,
    })

    // Update project
    const project = await this.getProject(projectId)
    if (project) {
      await this.updateProject(projectId, { validationReport: report })
    }

    await this.log(
      projectId,
      report.summary.errors > 0 ? 'error' : 'success',
      `Validation complete: ${report.summary.errors} errors, ${report.summary.warnings} warnings`
    )
  }

  /**
   * Get validation report for a project
   */
  async getValidationReport(projectId: string): Promise<ValidationReport | undefined> {
    const db = await this.ensureDB()
    const record = await db.get('validationReports', projectId)
    return record?.report
  }

  // ============================================================================
  // CHECKPOINT OPERATIONS
  // ============================================================================

  /**
   * Create a checkpoint
   */
  async createCheckpoint(projectId: string, checkpoint: Checkpoint): Promise<void> {
    const db = await this.ensureDB()

    await db.put('checkpoints', {
      id: checkpoint.id,
      projectId,
      timestamp: new Date().toISOString(),
      checkpoint,
    })

    // Update project
    const project = await this.getProject(projectId)
    if (project) {
      const updatedCheckpoints = [...(project.checkpoints || []), checkpoint]
      await this.updateProject(projectId, { checkpoints: updatedCheckpoints })
    }

    await this.log(projectId, 'info', `Checkpoint created: ${checkpoint.stage}`)
  }

  /**
   * Get all checkpoints for a project
   */
  async getCheckpoints(projectId: string): Promise<Checkpoint[]> {
    const db = await this.ensureDB()
    const records = await db.getAllFromIndex('checkpoints', 'by-project', projectId)
    return records.map((r) => r.checkpoint)
  }

  /**
   * Get latest checkpoint for a project
   */
  async getLatestCheckpoint(projectId: string): Promise<Checkpoint | undefined> {
    const checkpoints = await this.getCheckpoints(projectId)
    if (checkpoints.length === 0) return undefined
    return checkpoints.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  }

  // ============================================================================
  // LOGGING OPERATIONS
  // ============================================================================

  /**
   * Log a message
   */
  async log(
    projectId: string,
    level: 'info' | 'warning' | 'error' | 'success',
    message: string,
    details?: any
  ): Promise<void> {
    const db = await this.ensureDB()

    await db.add('logs', {
      projectId,
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
    })

    // Also log to console in development
    if (import.meta.env.DEV) {
      const method = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log'
      console[method](`[${projectId}] ${message}`, details || '')
    }
  }

  /**
   * Get logs for a project
   */
  async getLogs(
    projectId: string,
    options?: {
      limit?: number
      level?: 'info' | 'warning' | 'error' | 'success'
    }
  ): Promise<Array<{
    timestamp: string
    level: string
    message: string
    details?: any
  }>> {
    const db = await this.ensureDB()
    let logs = await db.getAllFromIndex('logs', 'by-project', projectId)

    // Filter by level if specified
    if (options?.level) {
      logs = logs.filter((log) => log.level === options.level)
    }

    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    // Limit if specified
    if (options?.limit) {
      logs = logs.slice(0, options.limit)
    }

    return logs.map((log) => ({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message,
      details: log.details,
    }))
  }

  /**
   * Clear logs for a project
   */
  async clearLogs(projectId: string): Promise<void> {
    const db = await this.ensureDB()
    const logs = await db.getAllFromIndex('logs', 'by-project', projectId)

    for (const log of logs) {
      if (log.id) {
        await db.delete('logs', log.id)
      }
    }

    await this.log(projectId, 'info', 'Logs cleared')
  }

  // ============================================================================
  // UTILITY OPERATIONS
  // ============================================================================

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalProjects: number
    projectsByStatus: Record<MigrationStatus, number>
    totalSize: number // Approximate size in bytes
  }> {
    const db = await this.ensureDB()
    const projects = await db.getAll('projects')

    const projectsByStatus: Record<string, number> = {}
    for (const project of projects) {
      projectsByStatus[project.status] = (projectsByStatus[project.status] || 0) + 1
    }

    // Estimate total size (very rough)
    const extractedData = await db.getAll('extractedData')
    const transformedData = await db.getAll('transformedData')
    const totalSize =
      JSON.stringify(projects).length +
      JSON.stringify(extractedData).length +
      JSON.stringify(transformedData).length

    return {
      totalProjects: projects.length,
      projectsByStatus: projectsByStatus as Record<MigrationStatus, number>,
      totalSize,
    }
  }

  /**
   * Export project data as JSON
   */
  async exportProject(projectId: string): Promise<string> {
    const project = await this.getProject(projectId)
    if (!project) throw new Error(`Project ${projectId} not found`)

    const extractedData = await this.getExtractedData(projectId)
    const transformedData = await this.getTransformedData(projectId)
    const validationReport = await this.getValidationReport(projectId)
    const checkpoints = await this.getCheckpoints(projectId)
    const logs = await this.getLogs(projectId, { limit: 1000 })

    const exportData = {
      version: 1, // Export format version
      project,
      extractedData,
      transformedData,
      validationReport,
      checkpoints,
      logs,
      exportedAt: new Date().toISOString(),
    }

    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Download project as JSON file
   */
  async downloadProject(projectId: string): Promise<void> {
    const json = await this.exportProject(projectId)
    const project = await this.getProject(projectId)
    if (!project) return

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gotor1-${project.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    await this.log(projectId, 'info', 'Project exported and downloaded')
  }

  /**
   * Import project from JSON data
   */
  async importProject(jsonData: string): Promise<MigrationProject> {
    const db = await this.ensureDB()

    let importData: any
    try {
      importData = JSON.parse(jsonData)
    } catch (err) {
      throw new Error('Invalid JSON format')
    }

    // Validate import data structure
    if (!importData.project || !importData.version) {
      throw new Error('Invalid project export format')
    }

    const project = importData.project as MigrationProject

    // Check if project with this ID already exists
    const existing = await this.getProject(project.id)
    if (existing) {
      // Generate new ID to avoid conflicts
      const originalId = project.id
      project.id = crypto.randomUUID()
      project.name = `${project.name} (imported)`
      project.createdAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()

      console.log(`Project ID conflict - reassigned ${originalId} → ${project.id}`)
    }

    // Import project
    await db.put('projects', project)

    // Import extracted data if present
    if (importData.extractedData) {
      await db.put('extractedData', {
        projectId: project.id,
        timestamp: new Date().toISOString(),
        data: importData.extractedData,
      })
    }

    // Import transformed data if present
    if (importData.transformedData) {
      await db.put('transformedData', {
        projectId: project.id,
        timestamp: new Date().toISOString(),
        data: importData.transformedData,
      })
    }

    // Import validation report if present
    if (importData.validationReport) {
      await db.put('validationReports', {
        projectId: project.id,
        timestamp: new Date().toISOString(),
        report: importData.validationReport,
      })
    }

    // Import checkpoints if present
    if (importData.checkpoints && Array.isArray(importData.checkpoints)) {
      for (const checkpoint of importData.checkpoints) {
        await db.put('checkpoints', {
          id: checkpoint.id,
          projectId: project.id,
          timestamp: checkpoint.timestamp,
          checkpoint,
        })
      }
    }

    // Import logs if present (optional - can be large)
    if (importData.logs && Array.isArray(importData.logs)) {
      for (const log of importData.logs.slice(0, 100)) {
        // Limit to 100 most recent
        await db.add('logs', {
          projectId: project.id,
          timestamp: log.timestamp,
          level: log.level,
          message: log.message,
          details: log.details,
        })
      }
    }

    await this.log(project.id, 'success', `Project imported from file`)

    return project
  }

  /**
   * Import project from uploaded file
   */
  async importFromFile(file: File): Promise<MigrationProject> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = async (e) => {
        try {
          const jsonData = e.target?.result as string
          const project = await this.importProject(jsonData)
          resolve(project)
        } catch (err) {
          reject(err)
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsText(file)
    })
  }

  /**
   * Clear all data (use with caution!)
   */
  async clearAllData(): Promise<void> {
    const db = await this.ensureDB()

    await db.clear('projects')
    await db.clear('extractedData')
    await db.clear('transformedData')
    await db.clear('validationReports')
    await db.clear('checkpoints')
    await db.clear('logs')

    console.log('All migration data cleared')
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const migrationStateManager = new MigrationStateManager()

// Initialize on import
migrationStateManager.init().catch((err) => {
  console.error('Failed to initialize migration database:', err)
})

export default migrationStateManager
