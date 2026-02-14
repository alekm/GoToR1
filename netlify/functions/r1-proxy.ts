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

    // Make request to RUCKUS One API
    const response = await fetch(targetUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    })

    const responseText = await response.text()
    let responseData

    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = responseText
    }

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
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
