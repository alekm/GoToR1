import { Link } from 'react-router-dom'
import { Settings, Home } from 'lucide-react'

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">G</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">GoToR1</h1>
              <p className="text-xs text-gray-500">SmartZone Migration Tool</p>
            </div>
          </Link>

          <nav className="flex items-center space-x-4">
            <Link
              to="/"
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Home size={20} />
              <span className="hidden sm:inline">Projects</span>
            </Link>
            <Link
              to="/settings"
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Settings size={20} />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}
