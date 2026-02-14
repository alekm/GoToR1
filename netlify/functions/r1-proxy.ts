/**
 * RUCKUS One API Proxy
 * 
 * Proxies requests to RUCKUS One API to avoid CORS issues
 * Supports all three regions: NA, EU, Asia
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'

const API_HOSTS = {
  na: 'https://api.ruckus.cloud',
  eu: 'https://api.eu.ruckus.cloud',
  asia: 'https://api.asia.ruckus.cloud',
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { region, path, method = 'GET', headers = {}, body: requestBody } = body

    // Validate region
    if (!region || !['na', 'eu', 'asia'].includes(region)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid region. Must be na, eu, or asia' }),
      }
    }

    // Validate path
    if (!path || typeof path !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Path is required' }),
      }
    }

    // Build target URL
    const targetUrl = `${API_HOSTS[region as keyof typeof API_HOSTS]}${path}`

    // Prepare headers (don't override Content-Type if already set)
    const requestHeaders: Record<string, string> = { ...headers }
    if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
      requestHeaders['Content-Type'] = 'application/json'
    }

    // Debug logging for OAuth2 requests
    if (path.includes('/oauth2/token')) {
      console.log('OAuth2 Request:', {
        url: targetUrl,
        method,
        headers: requestHeaders,
        bodyLength: requestBody?.length,
        bodyPreview: requestBody?.substring(0, 100)
      })
    }

    // Make request to RUCKUS One API
    const response = await fetch(targetUrl, {
      method,
      headers: requestHeaders,
      body: requestBody, // Already stringified by client
    })

    const responseText = await response.text()
    let responseData

    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = responseText
    }

    // Debug logging for OAuth2 responses
    if (path.includes('/oauth2/token')) {
      console.log('OAuth2 Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData
      })
    }

    // Forward important headers from RUCKUS One API
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, login-token, Login-Token',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Expose-Headers': 'login-token, Login-Token', // Allow client to read these headers
    }

    // Forward login-token header if present (used by some RUCKUS One deployments)
    const loginToken = response.headers.get('login-token') || response.headers.get('Login-Token')
    if (loginToken) {
      responseHeaders['login-token'] = loginToken
    }

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: JSON.stringify(responseData),
    }
  } catch (error) {
    console.error('R1 Proxy Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Proxy error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}
