# GoToR1.com - SmartZone to RUCKUS One Migration Tool

A comprehensive, user-guided migration assistant for moving complete RUCKUS SmartZone Controller infrastructures to RUCKUS One cloud platform.

## Features

- **Direct SmartZone API Integration** - Connect to vSZ 6.x/7.x controllers and extract full configuration
- **Complete Infrastructure Migration** - Zones → Venues, WLANs, AP Groups, Access Points, Switches
- **Switch Migration** - SmartZone-managed, CSV import, and manual entry support
- **User-Guided Workflow** - Validation gates at each phase with user approval
- **Venue & Config Creation** - Assisted creation with user review before applying
- **Hardware Migration** - Batch upload APs and switches with progress tracking
- **Validation & Verification** - Pre and post-migration reports with conflict detection
- **Checkpoint & Rollback** - Safe migration with ability to rollback on errors

## Technology Stack

- React 19 + TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Zustand for state management
- IndexedDB for persistence
- Netlify for deployment

## Getting Started

### Development

```bash
# Install dependencies
cd frontend
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5175`

### Building for Production

```bash
npm run build
```

## Migration Workflow

**Phase 1: Data Gathering**
1. Project Setup
2. Connect SmartZone
3. Extract Data

**Phase 2: Validation**
4. Review Extracted Data
5. Data Validation

**Phase 3: RUCKUS One Configuration**
6. Create Venues/End Customers
7. Generate & Apply Configurations

**Phase 4: Hardware Migration**
8. Migrate Access Points
9. Migrate Switches

**Phase 5: Post-Migration**
10. Verify Results

## Requirements

- **SmartZone Controller**: vSZ 6.x or 7.x with API access
- **RUCKUS One**: OAuth2 credentials (Client ID, Client Secret, Tenant ID)
- **Browser**: Modern browser with IndexedDB support

## License

Built for the RUCKUS One community.
