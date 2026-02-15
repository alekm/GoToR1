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
import Step4_ReviewExtractedData from './wizard/Step4_ReviewExtractedData'
import Step5_DataValidation from './wizard/Step5_DataValidation'
import Step6_CreateVenues from './wizard/Step6_CreateVenues'
import Step7_GenerateConfigs from './wizard/Step7_GenerateConfigs'
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
      // Save extracted data
      await migrationStateManager.saveExtractedData(projectId, data)
      await migrationStateManager.updateProject(projectId, {
        extractedData: data,
        currentStep: 'review',
        status: 'extracted',
      })
      await refresh() // Refresh project data
      setCurrentStep('review')
    } catch (err) {
      console.error('Failed to save extracted data:', err)
      alert('Failed to save extracted data. Please try again.')
    }
  }

  const handleReviewComplete = async (data: SmartZoneData) => {
    try {
      // Save updated data (with any additional switches)
      await migrationStateManager.saveExtractedData(projectId, data)
      await migrationStateManager.updateProject(projectId, {
        extractedData: data,
        currentStep: 'validate',
        status: 'validating',
      })
      await refresh()
      setCurrentStep('validate')
    } catch (err) {
      console.error('Failed to save reviewed data:', err)
      alert('Failed to save data. Please try again.')
    }
  }

  const handleValidationComplete = async () => {
    try {
      // Update project to next step
      await migrationStateManager.updateProject(projectId, {
        currentStep: 'venues',
        status: 'ready',
      })
      await refresh()
      setCurrentStep('venues')
    } catch (err) {
      console.error('Failed to proceed to venue creation:', err)
      alert('Failed to proceed. Please try again.')
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

  const handleConfigsComplete = async () => {
    try {
      // Update project to next step (hardware migration)
      await migrationStateManager.updateProject(projectId, {
        currentStep: 'migrate-aps',
        status: 'ready',
      })
      await refresh()
      setCurrentStep('migrate-aps')
      // TODO: Implement Steps 8-10
      alert('Steps 8-10 (Hardware Migration) coming soon...')
    } catch (err) {
      console.error('Failed to proceed to hardware migration:', err)
      alert('Failed to proceed. Please try again.')
    }
  }

  const handleBack = () => {
    if (currentStep === 'configs') {
      setCurrentStep('venues')
    } else if (currentStep === 'venues') {
      setCurrentStep('validate')
    } else if (currentStep === 'validate') {
      setCurrentStep('review')
    } else if (currentStep === 'review') {
      setCurrentStep('extract')
    } else if (currentStep === 'extract') {
      setCurrentStep('connect')
    } else if (currentStep === 'connect') {
      navigate('/')
    }
  }

  return (
    <div>
      {/* Wizard Stepper - Placeholder for now */}
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
            <span className={currentStep === 'review' ? 'font-bold' : 'text-gray-500'}>
              4. Review
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'validate' ? 'font-bold' : 'text-gray-500'}>
              5. Validate
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'venues' ? 'font-bold' : 'text-gray-500'}>
              6. Venues
            </span>
            <span className="text-gray-300">→</span>
            <span className={currentStep === 'configs' ? 'font-bold' : 'text-gray-500'}>
              7. Configure
            </span>
            <span className="text-gray-300">→</span>
            <span className="text-gray-500">8-10. Hardware</span>
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

      {currentStep === 'review' && project.extractedData && (
        <Step4_ReviewExtractedData
          projectId={projectId}
          extractedData={project.extractedData}
          onComplete={handleReviewComplete}
          onBack={handleBack}
        />
      )}

      {currentStep === 'validate' && project.extractedData && (
        <Step5_DataValidation
          projectId={projectId}
          extractedData={project.extractedData}
          onComplete={handleValidationComplete}
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
    </div>
  )
}
