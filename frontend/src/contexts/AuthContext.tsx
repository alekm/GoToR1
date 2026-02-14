/**
 * Auth Context
 *
 * Manages RUCKUS One API credentials across the application
 */

import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { RuckusOneCredentials } from '../services/ruckusOneClient'
import type { RuckusRegion } from '../services/apiClient'

interface AuthContextType {
  credentials: RuckusOneCredentials | null
  isConfigured: boolean
  saveCredentials: (creds: RuckusOneCredentials) => void
  clearCredentials: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY = 'gotor1_r1_credentials'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<RuckusOneCredentials | null>(null)

  // Load credentials from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setCredentials(parsed)
      }
    } catch (err) {
      console.error('Failed to load credentials:', err)
    }
  }, [])

  const saveCredentials = (creds: RuckusOneCredentials) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(creds))
      setCredentials(creds)
    } catch (err) {
      console.error('Failed to save credentials:', err)
      throw new Error('Failed to save credentials')
    }
  }

  const clearCredentials = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      setCredentials(null)
    } catch (err) {
      console.error('Failed to clear credentials:', err)
    }
  }

  const isConfigured =
    credentials !== null &&
    !!credentials.tenantId &&
    !!credentials.clientId &&
    !!credentials.clientSecret

  return (
    <AuthContext.Provider
      value={{
        credentials,
        isConfigured,
        saveCredentials,
        clearCredentials,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper to get default credentials structure
export function getDefaultCredentials(): RuckusOneCredentials {
  return {
    region: 'na' as RuckusRegion,
    tenantId: '',
    clientId: '',
    clientSecret: '',
  }
}
