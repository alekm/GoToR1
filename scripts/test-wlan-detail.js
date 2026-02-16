#!/usr/bin/env node
/**
 * Test script to fetch individual WLAN details from SmartZone
 * This will show us the full WLAN configuration including authService/accountingService
 */

const https = require('https');

// SmartZone credentials - set these via command line args or environment
const SZ_HOST = process.env.SZ_HOST || process.argv[2];
const SZ_PORT = process.env.SZ_PORT || process.argv[3] || '8443';
const SZ_USERNAME = process.env.SZ_USERNAME || process.argv[4];
const SZ_PASSWORD = process.env.SZ_PASSWORD || process.argv[5];

if (!SZ_HOST || !SZ_USERNAME || !SZ_PASSWORD) {
  console.error('Usage: node test-wlan-detail.js <host> [port] <username> <password>');
  console.error('  or set env vars: SZ_HOST, SZ_PORT, SZ_USERNAME, SZ_PASSWORD');
  process.exit(1);
}

// Disable SSL verification for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let sessionId = null;
let apiVersion = 'v13_1';

/**
 * Make authenticated request to SmartZone API
 */
async function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SZ_HOST,
      port: SZ_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
      },
      rejectUnauthorized: false,
    };

    // Add session cookie if we have one
    if (sessionId) {
      options.headers['Cookie'] = `JSESSIONID=${sessionId}`;
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }

        try {
          const json = JSON.parse(data);
          // Return both JSON and headers for login endpoint
          resolve({ data: json, headers: res.headers });
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Authenticate to SmartZone
 */
async function login() {
  console.log(`\n🔐 Authenticating to SmartZone at ${SZ_HOST}:${SZ_PORT}...`);

  const response = await apiRequest('POST', `/wsg/api/public/v10_0/session`, {
    username: SZ_USERNAME,
    password: SZ_PASSWORD,
  });

  console.log(`\n📥 Login response body:`, JSON.stringify(response.data, null, 2));
  console.log(`\n📥 Response headers:`, response.headers);

  // Extract session ID from response body or Set-Cookie header
  if (response.data && response.data.sessionId) {
    sessionId = response.data.sessionId;
    console.log(`✓ Authenticated successfully (from response body)`);
    console.log(`  Session ID: ${sessionId.substring(0, 20)}...`);
  } else if (response.headers['set-cookie']) {
    // Try to extract from Set-Cookie header
    const cookies = Array.isArray(response.headers['set-cookie'])
      ? response.headers['set-cookie']
      : [response.headers['set-cookie']];

    for (const cookie of cookies) {
      const match = cookie.match(/JSESSIONID=([^;]+)/);
      if (match) {
        sessionId = match[1];
        console.log(`✓ Authenticated successfully (from Set-Cookie header)`);
        console.log(`  Session ID: ${sessionId.substring(0, 20)}...`);
        return;
      }
    }
    throw new Error('No JSESSIONID found in Set-Cookie header');
  } else {
    throw new Error('No session ID in response body or headers');
  }
}

/**
 * Get zones
 */
async function getZones() {
  console.log(`\n📍 Fetching zones...`);
  const response = await apiRequest('GET', `/wsg/api/public/${apiVersion}/rkszones`);
  const zones = response.data?.list || [];
  console.log(`✓ Found ${zones.length} zones`);
  return zones;
}

/**
 * Get WLAN list for a zone
 */
async function getWLANList(zoneId) {
  console.log(`\n📡 Fetching WLAN list for zone ${zoneId}...`);
  const response = await apiRequest('GET', `/wsg/api/public/${apiVersion}/rkszones/${zoneId}/wlans`);
  const wlans = response.data?.list || [];
  console.log(`✓ Found ${wlans.length} WLANs (from list endpoint)`);
  return wlans;
}

/**
 * Get individual WLAN detail
 */
async function getWLANDetail(zoneId, wlanId) {
  console.log(`\n🔍 Fetching WLAN detail for ${wlanId}...`);
  const response = await apiRequest('GET', `/wsg/api/public/${apiVersion}/rkszones/${zoneId}/wlans/${wlanId}`);
  console.log(`✓ Fetched WLAN detail`);
  return response.data;
}

/**
 * Main execution
 */
async function main() {
  try {
    // Login
    await login();

    // Get zones
    const zones = await getZones();
    if (zones.length === 0) {
      console.log('❌ No zones found');
      return;
    }

    // Use first zone
    const zone = zones[0];
    console.log(`\n📍 Using zone: ${zone.name} (${zone.id})`);

    // Get WLAN list
    const wlanList = await getWLANList(zone.id);
    if (wlanList.length === 0) {
      console.log('❌ No WLANs found in this zone');
      return;
    }

    // Fetch detail for each WLAN
    console.log(`\n${'='.repeat(80)}`);
    console.log(`COMPARING WLAN LIST vs DETAIL ENDPOINTS`);
    console.log('='.repeat(80));

    for (const wlanSummary of wlanList) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`WLAN: ${wlanSummary.name} (${wlanSummary.ssid})`);
      console.log('─'.repeat(80));

      // Show what the list endpoint returned
      console.log(`\n📋 FROM LIST ENDPOINT:`);
      console.log(JSON.stringify(wlanSummary, null, 2));

      // Fetch full detail
      const wlanDetail = await getWLANDetail(zone.id, wlanSummary.id);

      // Show what the detail endpoint returned
      console.log(`\n🔍 FROM DETAIL ENDPOINT:`);
      console.log(JSON.stringify(wlanDetail, null, 2));

      // Highlight key differences
      console.log(`\n📊 KEY FIELDS FOR MIGRATION:`);
      console.log(`  Name: ${wlanDetail.name}`);
      console.log(`  SSID: ${wlanDetail.ssid}`);
      console.log(`  Type: ${wlanDetail.type || '(not present)'}`);
      console.log(`  Encryption Method: ${wlanDetail.encryption?.method || '(not present)'}`);
      console.log(`  Encryption Algorithm: ${wlanDetail.encryption?.algorithm || '(not present)'}`);
      console.log(`  Passphrase: ${wlanDetail.passphrase ? '***present***' : wlanDetail.encryption?.passphrase ? '***in encryption object***' : '(none)'}`);
      console.log(`  Auth Service: ${wlanDetail.authService ? JSON.stringify(wlanDetail.authService) : '(none)'}`);
      console.log(`  Accounting Service: ${wlanDetail.accountingService ? JSON.stringify(wlanDetail.accountingService) : '(none)'}`);
      console.log(`  DPSK Enabled: ${wlanDetail.dpskEnabled || wlanDetail.dpsk?.enabled || '(not present)'}`);
      console.log(`  AAA VLAN Override: ${wlanDetail.vlan?.aaaVlanOverride || '(not present)'}`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✓ WLAN detail fetch test complete`);
    console.log('='.repeat(80));

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Run
main();
