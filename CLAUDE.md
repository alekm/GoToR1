# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GoToR1.com is a user-guided migration tool for moving RUCKUS SmartZone Controller infrastructures to RUCKUS One cloud platform. It connects directly to SmartZone APIs (vSZ 6.x/7.x), extracts complete configurations, and orchestrates a phased migration workflow with validation gates at each step.

## Development Commands

```bash
# Full dev environment (Vite + Netlify Functions) — required for SmartZone proxy
netlify dev
# Vite only (no SmartZone proxy) — faster for frontend-only work
npm run dev --prefix frontend

# Vite: http://localhost:5175 | Netlify Functions: http://localhost:8888

# Build
cd frontend && npm run build

# Type check / lint
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
```

**Always run `netlify dev` from the repository root**, not `frontend/`. Running from `frontend/` causes `frontend/frontend/package.json not found`.

## Architecture

### Wizard Workflow

The migration wizard uses named steps (not numeric) managed in `MigrationWizard.tsx`:

| Step key | Component | Status |
|---|---|---|
| `connect` | `Step2_ConnectSZ.tsx` | ✅ |
| `extract` | `Step3_ExtractData.tsx` | ✅ |
| `venues` | `Step6_CreateVenues.tsx` | ✅ |
| `configs` | `Step7_GenerateConfigs.tsx` | ✅ (eDPSK, RADIUS, WLAN activation) |
| `migrate-aps` | `Step8_UploadAPs.tsx` | ⏭️ coming soon |
| `migrate-switches` | `Step9_UploadSwitches.tsx` | ⏭️ coming soon |
| `verify` | `Step10_Verification.tsx` | ⏭️ coming soon |

`MigrationWizard.tsx` handles step sequencing, back navigation, and conditional rendering based on project state (e.g., `venues` requires `extractedData` to be set).

### State Management

**IndexedDB (via `idb`)** — primary persistence, managed by `migrationStateManager.ts`. Always update with partial objects:

```typescript
// CORRECT — partial update
await migrationStateManager.updateProject(projectId, { currentStep: 'extract' })
// WRONG — never pass the full project object
```

**React Router** — SPA routing. **Zustand** is installed but not used.

### Services

```
frontend/src/services/
├── smartZoneClient.ts       # SmartZone API (all SZ calls go here)
├── ruckusOneClient.ts       # RUCKUS One API (OAuth2, token caching, regions)
├── apiClient.ts             # Shared URL builder: dev uses Vite proxy, prod uses /api
├── dataTransformer.ts       # Transforms SZ data structures → R1 format
└── migrationStateManager.ts # IndexedDB CRUD for migration projects
```

All TypeScript interfaces are centralized in `frontend/src/types/migration.ts`.

### Proxy Architecture

**Development** — Vite proxies R1 traffic, Netlify Dev handles functions:
- `/r1` → `https://api.ruckus.cloud` (NA)
- `/r1-eu` → `https://api.eu.ruckus.cloud`
- `/r1-asia` → `https://api.asia.ruckus.cloud`
- `/.netlify/functions/*` → `http://localhost:8888`

**Production** — Netlify redirects + functions:
- `/api/*` → `/.netlify/functions/api/:splat` (R1 proxy, `api.js`)
- SmartZone calls go through `sz-proxy.ts` (TypeScript — esbuild handles it)

**SmartZone proxy** (`sz-proxy.ts`): converts `X-Session-ID` header → `JSESSIONID` cookie, accepts self-signed TLS certs, called with `?host=&port=&path=`.

**R1 proxy** (`api.js`): forwards Authorization, Content-Type, tenant headers with regional routing.

## SmartZone API

Documentation extracted from vSZ 7.1.1 is in `/docs/smartzone-api/` (01–16 covering auth, APs, WLANs, AAA, etc.).

**Critical version pattern** — always use these exact versions:
```
Auth:      POST /wsg/api/public/v10_0/session
Resources: GET  /wsg/api/public/v13_1/rkszones
           GET  /wsg/api/public/v13_1/rkszones/{zoneId}/wlans
           GET  /wsg/api/public/v13_1/rkszones/{zoneId}/apgroups
           GET  /wsg/api/public/v13_1/aps?zoneId={id}&index=0&listSize=100
RADIUS:    v13_1 ONLY (hardcode — do not use config.apiVersion)
```

Version detection tries v13_1 → v10_0 → v9_1 → v9_0 → v8_0 via `GET /systemInfo`.

**Known limitation**: `/rkszones/{zoneId}/wlans` list returns only `id/name/ssid` — no security type. Full config requires a second call to `/wlans/{wlanId}` per WLAN.

## RUCKUS One API

Interactive reference for all 1552 endpoints is available at the hidden `/docs` route (served from `frontend/public/docs/`).

**WLAN Activation is required** — creating a WLAN does not make it broadcast. Must explicitly activate:
```
PUT /venues/{venueId}/wifiNetworks/{wifiNetworkId}
Body: { venueId, networkId, isAllApGroups, apGroups: [ids],
        allApGroupsRadio: "Both", allApGroupsRadioTypes: ["2.4-GHz","5-GHz"],
        scheduler: {type: "ALWAYS_ON"} }
```
Respect SmartZone AP Group WLAN membership (`apGroup.wlans[]`) — activate per AP group when data exists, fallback to all AP groups.

**Venue creation** requires `address.city` + `address.country` at minimum (omitting causes `VENUE-10001`).

**WLAN payload differs by security type:**
- Open: `type: 'STANDARD_OPEN'`, `encryption.method: 'None'`
- PSK: `type: 'STANDARD'`, `passphrase` required
- AAA/eDPSK: `type: 'STANDARD_8021X'`, always AES, optional RADIUS service IDs

**AP serial format**: `^[1-9][0-9]{11}$` — sanitize by removing non-digits, padding to 12 chars, replacing leading 0 with 1.

**Batch limits**: APs → 50/batch (`POST /venues/aps`), Switches → 25/batch (`POST /switches`).

## Critical Patterns

### Response body consumption
Never read a `Response` body twice — always text-first:
```typescript
const text = await response.text()
const data = JSON.parse(text)   // ✅
// NOT: response.json() then response.text() — second call fails
```

### UUID generation
Dev runs on HTTP, so `crypto.randomUUID()` is unavailable. `migrationStateManager.ts` has a fallback — use it rather than calling `crypto.randomUUID()` directly.

### External DPSK (eDPSK) / RADIUS
- SmartZone "Proxy (SZ Authenticator)" mode maps to R1 External DPSK with RADIUS
- SmartZone does not export RADIUS shared secrets — must prompt user
- RADIUS Proxy Mode (APs → R1 → RADIUS vs APs → RADIUS direct) is a user choice per network; default off

### Step 7 creation order
1. Create RADIUS profiles (validate shared secrets first — stop if creation fails)
2. Create WLANs (link RADIUS for eDPSK/AAA types)
3. Create AP Groups within venues
4. Activate WLANs on venues (respecting AP Group WLAN membership)
5. Apply RF settings

## Troubleshooting

**Port 8888 in use**: `lsof -ti:8888 | xargs kill -9`

**SmartZone 502**: Controller not reachable from dev machine — check firewall/NAT, test with `curl` from the same host.

**R1 401 JWT Invalid**: Wrong credentials or region. Clear cached tokens by deleting cookies prefixed `gotor1_r1_token_`.

**CORS errors in production**: Verify `/api/*` redirect in `netlify.toml` and that `api.js` deployed successfully.
