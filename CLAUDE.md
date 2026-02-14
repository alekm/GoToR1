# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GoToR1.com is a user-guided migration tool for moving RUCKUS SmartZone Controller infrastructures to RUCKUS One cloud platform. It connects directly to SmartZone APIs (vSZ 6.x/7.x), extracts complete configurations, and orchestrates a phased migration workflow with validation gates at each step.

## Development Commands

### Start Development Server

```bash
# Start Netlify Dev (includes Vite + Netlify Functions)
netlify dev
# OR
npm run dev --prefix frontend

# Vite runs on http://localhost:5175
# Netlify Functions run on http://localhost:8888
```

**Important:** Use `netlify dev` (not `npm run dev`) when testing SmartZone integration, as it runs both Vite and the Netlify Functions proxy simultaneously.

### Build & Preview

```bash
# Build for production
cd frontend && npm run build

# Preview production build
npm run preview
```

### Type Checking & Linting

```bash
cd frontend
npm run lint
npx tsc --noEmit  # Type check without building
```

## Architecture

### Multi-Phase Migration Workflow

The application implements a **10-step wizard workflow** across 5 phases:

1. **Data Gathering** (Steps 1-3): Project setup → SmartZone connection → Extract zones/WLANs/APs/switches
2. **Validation** (Steps 4-5): Review data → Validate for conflicts/duplicates
3. **R1 Configuration** (Steps 6-7): Create venues/ECs → Generate WLAN/AP Group configs
4. **Hardware Migration** (Steps 8-9): Upload APs → Upload switches
5. **Post-Migration** (Step 10): Verification & reporting

### State Management Architecture

**IndexedDB (via `idb`)** - Primary persistence layer
- Migration projects stored in `projects` object store
- Extracted SmartZone data persisted separately
- Survives browser refreshes and sessions
- Managed by `migrationStateManager.ts`

**Zustand** - Planned for wizard state (not yet implemented)

**React Router** - Navigation between wizard steps

### API Integration Pattern

#### SmartZone API Client (`smartZoneClient.ts`)

- **Version Detection**: Auto-detects v13_1, v10_0, v9_1, v9_0, v8_0
- **Authentication**: Uses v10_0 `/session` endpoint (session-based auth)
- **Resources**: Uses v13_1 endpoints for zones, WLANs, AP Groups, APs
- **Session Management**: Custom `X-Session-ID` header (converted to Cookie by proxy)
- **Proxy**: All requests go through Netlify Function `sz-proxy.ts` (handles CORS + self-signed certs)

**Critical API Version Pattern:**
```typescript
// Authentication uses v10_0
POST /wsg/api/public/v10_0/session

// Resource endpoints use v13_1
GET /wsg/api/public/v13_1/rkszones
GET /wsg/api/public/v13_1/rkszones/{zoneId}/wlans
GET /wsg/api/public/v13_1/rkszones/{zoneId}/apgroups

// APs endpoint uses query parameter (NOT path parameter)
GET /wsg/api/public/v13_1/aps?zoneId={zoneId}&index=0&listSize=100
```

#### RUCKUS One API Client (`ruckusOneClient.ts`)

- Placeholder - will be copied from existing r1helper/r1gather/r1mapper projects
- OAuth2 client credentials flow
- Multi-region support (NA, EU, Asia)
- Proxied through Vite dev server (`/r1`, `/r1-eu`, `/r1-asia`)

### Netlify Function Proxy (`sz-proxy.ts`)

**Purpose:** Handle SmartZone API requests that require:
- CORS headers
- Self-signed SSL certificates (common in SmartZone deployments)
- Session cookie management

**Session Injection Pattern:**
```typescript
// Proxy extracts JSESSIONID from Set-Cookie header
// and injects it into response body as _sessionId
// Client stores this and sends via X-Session-ID header
// Proxy converts X-Session-ID back to Cookie header for SmartZone
```

This workaround is necessary because browsers block JavaScript from reading/setting Cookie headers directly.

### File Organization Patterns

```
frontend/src/
├── services/          # API clients and business logic
│   ├── smartZoneClient.ts       # SmartZone API integration
│   ├── ruckusOneClient.ts       # RUCKUS One API integration
│   └── migrationStateManager.ts # IndexedDB persistence
├── types/
│   └── migration.ts   # ALL TypeScript interfaces (SmartZone, R1, Migration)
├── pages/
│   ├── Home.tsx       # Project list
│   ├── MigrationWizard.tsx     # Main wizard container
│   └── wizard/
│       ├── Step2_ConnectSZ.tsx
│       └── Step3_ExtractData.tsx
├── hooks/             # Custom React hooks
├── components/        # Reusable UI components
└── contexts/          # React Context providers
```

**Key Pattern:** All type definitions are centralized in `types/migration.ts` (not scattered across files).

## SmartZone API Documentation

API reference documentation is available in `/docs/smartzone-api/`:

- `01_getting_started.md` - Authentication and session management
- `02_access_points.md` - AP configuration, AP Groups, Zones, operational data
- `03_wlan.md` - WLAN/network configuration, WLAN Groups, WLAN Schedulers
- `04_authentication.md` - Authentication services, profiles, AAA
- `05_guest_hotspot.md` - Guest access, Hotspot, Hotspot 2.0
- `06_security_acl.md` - Firewall, L2/L3 ACL, device policy, rogue detection
- `07_network_services.md` - DHCP, DNS, VLAN pooling, bridge, L2oGRE
- `08_tunneling.md` - GRE, SoftGRE, IPsec profiles
- `09_clients.md` - Wireless/wired clients, block client, isolation
- `10_identity.md` - Users, roles, guest pass, Dynamic PSK
- `11_location_services.md` - LBS, RTLS, geofence, indoor maps
- `12_profiles.md` - Traffic profiles, port profiles, VSA, precedence
- `13_system_admin.md` - System info, inventory, domain, cluster management
- `14_monitoring.md` - SNMP, syslog, events/alarms, connectivity tools
- `15_advanced_features.md` - AVC, URL filtering, SCI, northbound streaming
- `16_misc.md` - Certificates, accounting, FTP, SMS, portal detection

**Note:** SmartZone API is not publicly documented. These files were extracted from official vSZ 7.1.1 documentation.

### Currently Implemented SmartZone Endpoints

Our `smartZoneClient.ts` implements the critical endpoints for migration:

✅ **Authentication**
- `POST /wsg/api/public/v10_0/session` - Login and get session
- `DELETE /wsg/api/public/{version}/session` - Logout
- `GET /wsg/api/public/{version}/session` - Validate session

✅ **Data Extraction**
- `GET /wsg/api/public/v13_1/rkszones` - List all zones
- `GET /wsg/api/public/v13_1/rkszones/{zoneId}/wlans` - WLANs by zone
- `GET /wsg/api/public/v13_1/rkszones/{zoneId}/apgroups` - AP Groups by zone
- `GET /wsg/api/public/v13_1/aps?zoneId={id}&index={i}&listSize={n}` - APs by zone (paginated)
- `GET /wsg/api/public/v13_1/switch` - SmartZone-managed switches

✅ **Version Detection**
- `GET /wsg/api/public/{version}/systemInfo` - Detect API version (tries v13_1 → v10_0 → v9_1 → v9_0 → v8_0)

### Potentially Useful Endpoints (Not Yet Implemented)

These endpoints are available but not critical for MVP migration:

**Enhanced Data Gathering:**
- WLAN Groups - `GET /wsg/api/public/v13_1/rkszones/{zoneId}/wlangroups`
- AP Operational Info - Query APs with operational status, mesh topology
- System Inventory - `GET /wsg/api/public/v13_1/system/inventory`
- Domain Management - For multi-domain SmartZone deployments

**Advanced Features (Future Enhancements):**
- Profiles - L2/L3 ACL, firewall, traffic profiles, Ethernet port profiles
- Network Services - DHCP, DNS, VLAN pooling settings
- Authentication Services - RADIUS, AD, LDAP configurations
- Hotspot/Guest Access - Hotspot profiles, guest pass settings
- Client Data - Current connected clients for pre-migration reporting

### Migration-Critical Data Coverage

**Phase 1 (MVP) - ✅ Fully Covered:**
- Zones (venues)
- WLANs (networks/SSIDs)
- AP Groups
- Access Points (with GPS, model, name, serial, zone/group assignment)
- Switches (SmartZone-managed only)

**Phase 2 (Enhanced) - 🔄 Partially Covered:**
- Network Policies (L2/L3 ACL) - Available but not yet extracted
- Authentication Profiles (RADIUS, AAA) - Available but not yet extracted
- DHCP/DNS Settings - Available but not yet extracted
- Tunneling Profiles (GRE, IPsec) - Available but not yet extracted

**Phase 3 (Advanced) - ⚠️ Not Covered:**
- Guest Pass Configurations
- Hotspot 2.0 Settings (NOTE: R1 has limited HS2.0 support)
- Dynamic PSK
- Client Isolation Whitelists
- Location Services (LBS, RTLS) - Not applicable to R1

## Critical Development Patterns

### Adding New SmartZone API Endpoints

1. Add TypeScript interface to `types/migration.ts`
2. Add function to `smartZoneClient.ts`:
   ```typescript
   export async function getSomething(
     config: SmartZoneConfig,
     zoneId: string
   ): Promise<Something[]> {
     const response = await apiRequest<Response>(
       config,
       `/wsg/api/public/v13_1/rkszones/${zoneId}/something`
     )
     return response.list || []
   }
   ```
3. Use v13_1 for resource endpoints, v10_0 for authentication only
4. Handle pagination if `hasMore: true` in response

### IndexedDB State Updates

Always use `migrationStateManager.updateProject()` with partial updates:

```typescript
// CORRECT
await migrationStateManager.updateProject(projectId, {
  currentStep: 'extract',
  status: 'extracting',
})

// WRONG - Don't pass full project object
await migrationStateManager.updateProject(project)
```

### UUID Generation

The codebase includes a fallback UUID generator for non-HTTPS contexts:

```typescript
// Uses crypto.randomUUID() if available, otherwise fallback
private generateUUID(): string
```

This is necessary because the dev server runs on HTTP (not HTTPS) and `crypto.randomUUID()` requires a secure context.

## Testing SmartZone Integration

To test with a live SmartZone controller:

1. Start dev server: `netlify dev`
2. Navigate to project creation
3. Use Step 2 (Connect SmartZone) with:
   - Host: SmartZone IP or hostname
   - Port: 8443 (vSZ-H) or 7743 (vSZ-E)
   - Username/password with API access

The proxy (`sz-proxy.ts`) automatically handles self-signed certificates.

## Deployment

Deploys to Netlify:
- Build command: `cd frontend && npm run build`
- Publish directory: `frontend/dist`
- Functions directory: `netlify/functions`

All redirects route to `/index.html` for client-side routing.

## Known Limitations

- **Switches endpoint**: `/v13_1/switch` returns 404 on deployments without SmartZone switch management (expected behavior, handled gracefully)
- **API version detection**: Currently tries v13_1 → v10_0 → v9_1 → v9_0 → v8_0 sequentially (not all versions may exist)
- **Session timeout**: SmartZone sessions expire after 1 hour (client stores for 3600 seconds)
