/**
 * Migration Wizard
 *
 * Main wizard container that manages the migration workflow
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMigrationProject } from '../hooks/useMigrationProjects'
import { migrationStateManager } from '../services/migrationStateManager'
import Step2_ConnectSZ from './wizard/Step2_ConnectSZ'
import Step3_ExtractData from './wizard/Step3_ExtractData'
import Step6_CreateVenues from './wizard/Step6_CreateVenues'
import Step7_GenerateConfigs from './wizard/Step7_GenerateConfigs'
import Step8_UploadAPs from './wizard/Step8_UploadAPs'
import Step9_UploadSwitches from './wizard/Step9_UploadSwitches'
import Step10_Verification from './wizard/Step10_Verification'
import type { SmartZoneConfig, SmartZoneData, MigrationStep } from '../types/migration'

export default function MigrationWizard() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { project, loading, refresh } = useMigrationProject(projectId)
  const [currentStep, setCurrentStep] = useState<MigrationStep>('connect')

  useEffect(() => {
    if (project) {
      setCurrentStep(project.currentStep)
    }
  }, [project])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="card text-center">
          <p className="text-gray-600">Loading project...</p>
        </div>
      </div>
    )
  }

  if (!project || !projectId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="card text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Project Not Found</h1>
          <p className="text-gray-600 mb-4">The migration project could not be found.</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            ← Back to Projects
          </button>
        </div>
      </div>
    )
  }

  const handleConnectComplete = async (config: SmartZoneConfig) => {
    try {
      // Save SmartZone config to project
      await migrationStateManager.updateProject(projectId, {
        smartZoneConfig: config,
        currentStep: 'extract',
        status: 'extracting',
      })
      await refresh() // Refresh project data
      setCurrentStep('extract')
    } catch (err) {
      console.error('Failed to save SmartZone config:', err)
      alert('Failed to save configuration. Please try again.')
    }
  }

  const handleExtractComplete = async (data: SmartZoneData) => {
    try {
      // Save extracted data and proceed directly to venue creation
      await migrationStateManager.saveExtractedData(projectId, data)
      await migrationStateManager.updateProject(projectId, {
        extractedData: data,
        currentStep: 'venues',
        status: 'extracted',
      })
      await refresh() // Refresh project data
      setCurrentStep('venues')
    } catch (err) {
      console.error('Failed to save extracted data:', err)
      alert('Failed to save extracted data. Please try again.')
    }
  }

  const handleVenueCreationComplete = async (venueMapping: Record<string, string>) => {
    try {
      // Save venue mapping and proceed to next step
      await migrationStateManager.updateProject(projectId, {
        venueMapping,
        currentStep: 'configs',
        status: 'ready',
      })
      await refresh()
      setCurrentStep('configs')
    } catch (err) {
      console.error('Failed to save venue mapping:', err)
      alert('Failed to proceed. Please try again.')
    }
  }

  const handleConfigsComplete = async (
    apGroupMapping: Record<string, string>,
    wlanMapping: Record<string, string>,
    radiusMapping: Record<string, string>
  ) => {
    try {
      // Save all R1 ID mappings and proceed to AP upload
      await migrationStateManager.updateProject(projectId, {
        apGroupMapping,
        wlanMapping,
        radiusMapping,
        currentStep: 'migrate-aps',
        status: 'migrating',
      })
      await refresh()
      setCurrentStep('migrate-aps')
    } catch (err) {
      console.error('Failed to proceed to AP upload:', err)
      alert('Failed to proceed. Please try again.')
    }
  }

  const handleAPUploadComplete = async () => {
    try {
      // Proceed to switch upload
      await migrationStateManager.updateProject(projectId, {
        currentStep: 'migrate-switches',
        status: 'migrating',
      })
      await refresh()
      setCurrentStep('migrate-switches')
    } catch (err) {
      console.error('Failed to proceed to switch upload:', err)
      alert('Failed to proceed. Please try again.')
    }
  }

  const handleSwitchUploadComplete = async () => {
    try {
      // Proceed to verification
      await migrationStateManager.updateProject(projectId, {
        currentStep: 'verify',
        status: 'completed',
      })
      await refresh()
      setCurrentStep('verify')
    } catch (err) {
      console.error('Failed to proceed to verification:', err)
      alert('Failed to proceed. Please try again.')
    }
  }

  const handleBack = () => {
    if (currentStep === 'verify') {
      setCurrentStep('migrate-switches')
    } else if (currentStep === 'migrate-switches') {
      setCurrentStep('migrate-aps')
    } else if (currentStep === 'migrate-aps') {
      setCurrentStep('configs')
    } else if (currentStep === 'configs') {
      setCurrentStep('venues')
    } else if (currentStep === 'venues') {
      setCurrentStep('extract')
    } else if (currentStep === 'extract') {
      setCurrentStep('connect')
    } else if (currentStep === 'connect') {
      navigate('/')
    }
  }

  return (
    <div>
      {/* Wizard Stepper */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center space-x-4 text-sm">
            <span className={currentStep === 'setup' ? 'font-bold' : 'text-gray-500'}>
              1. Setup
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'connect' ? 'font-bold' : 'text-gray-500'}>
              2. Connect
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'extract' ? 'font-bold' : 'text-gray-500'}>
              3. Extract
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'venues' ? 'font-bold' : 'text-gray-500'}>
              4. Venues
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'configs' ? 'font-bold' : 'text-gray-500'}>
              5. Review & Deploy
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'migrate-aps' ? 'font-bold' : 'text-gray-500'}>
              6. APs
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'migrate-switches' ? 'font-bold' : 'text-gray-500'}>
              7. Switches
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'verify' ? 'font-bold' : 'text-gray-500'}>
              8. Verify
            </span>
          </div>
        </div>
      </div>

      {/* Wizard Step Content */}
      {currentStep === 'connect' && (
        <Step2_ConnectSZ
          projectId={projectId}
          initialConfig={project.smartZoneConfig}
          onComplete={handleConnectComplete}
          onBack={handleBack}
        />
      )}

      {currentStep === 'extract' && project.smartZoneConfig && (
        <Step3_ExtractData
          projectId={projectId}
          config={project.smartZoneConfig}
          onComplete={handleExtractComplete}
          onBack={handleBack}
        />
      )}

      {currentStep === 'venues' && project.extractedData && (
        <Step6_CreateVenues
          extractedData={project.extractedData}
          onComplete={handleVenueCreationComplete}
          onBack={handleBack}
        />
      )}

      {currentStep === 'configs' && project.extractedData && project.venueMapping && (
        <Step7_GenerateConfigs
          projectId={projectId}
          extractedData={project.extractedData}
          venueMapping={project.venueMapping}
          onComplete={handleConfigsComplete}
          onBack={handleBack}
        />
      )}

      {currentStep === 'migrate-aps' && project.extractedData && project.venueMapping && project.apGroupMapping && (
        <Step8_UploadAPs
          extractedData={project.extractedData}
          venueMapping={project.venueMapping}
          apGroupMapping={project.apGroupMapping}
          onComplete={handleAPUploadComplete}
          onBack={handleBack}
        />
      )}

      {currentStep === 'migrate-switches' && project.extractedData && project.venueMapping && (
        <Step9_UploadSwitches
          extractedData={project.extractedData}
          venueMapping={project.venueMapping}
          onComplete={handleSwitchUploadComplete}
          onBack={handleBack}
        />
      )}

      {currentStep === 'verify' && project.extractedData && project.venueMapping && (
        <Step10_Verification
          projectId={projectId}
          extractedData={project.extractedData}
          venueMapping={project.venueMapping}
          wlanMapping={project.wlanMapping}
          radiusMapping={project.radiusMapping}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
