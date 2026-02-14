export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center text-sm text-gray-500">
          <div>
            <p>GoToR1.com - SmartZone to RUCKUS One Migration Assistant</p>
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="https://github.com/alekm"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 transition-colors"
            >
              GitHub
            </a>
            <span>•</span>
            <a
              href="https://r1tools.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 transition-colors"
            >
              R1Tools.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
