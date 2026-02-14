/**
 * React Hook for Migration Projects
 *
 * Provides easy access to migration state management in React components
 */

import { useState, useEffect } from 'react'
import type { MigrationProject, MigrationStatus } from '../types/migration'
import migrationStateManager from '../services/migrationStateManager'

export function useMigrationProjects() {
  const [projects, setProjects] = useState<MigrationProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load all projects
  const loadProjects = async () => {
    try {
      setLoading(true)
      setError(null)
      const allProjects = await migrationStateManager.getAllProjects()
      setProjects(allProjects)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  // Create new project
  const createProject = async (name: string, description?: string) => {
    try {
      const project = await migrationStateManager.createProject(name, description)
      setProjects((prev) => [...prev, project])
      return project
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
      throw err
    }
  }

  // Delete project
  const deleteProject = async (projectId: string) => {
    try {
      await migrationStateManager.deleteProject(projectId)
      setProjects((prev) => prev.filter((p) => p.id !== projectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
      throw err
    }
  }

  // Export project
  const exportProject = async (projectId: string) => {
    try {
      await migrationStateManager.downloadProject(projectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export project')
      throw err
    }
  }

  // Import project
  const importProject = async (file: File) => {
    try {
      const project = await migrationStateManager.importFromFile(file)
      setProjects((prev) => [...prev, project])
      return project
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import project')
      throw err
    }
  }

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [])

  return {
    projects,
    loading,
    error,
    createProject,
    deleteProject,
    exportProject,
    importProject,
    refresh: loadProjects,
  }
}

export function useMigrationProject(projectId: string | undefined) {
  const [project, setProject] = useState<MigrationProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProject = async () => {
    if (!projectId) {
      setProject(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const p = await migrationStateManager.getProject(projectId)
      setProject(p || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (status: MigrationStatus) => {
    if (!projectId) return
    try {
      await migrationStateManager.updateProjectStatus(projectId, status)
      await loadProject()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
      throw err
    }
  }

  useEffect(() => {
    loadProject()
  }, [projectId])

  return {
    project,
    loading,
    error,
    updateStatus,
    refresh: loadProject,
  }
}
