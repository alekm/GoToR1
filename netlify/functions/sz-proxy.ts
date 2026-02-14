/**
 * SmartZone API Proxy (Netlify Function)
 *
 * Proxies requests to SmartZone Controller to handle:
 * - CORS headers
 * - HTTPS with self-signed certificates
 * - Session cookie forwarding
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import https from 'https'

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Only allow GET, POST, PUT, PATCH, DELETE
  const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  if (!event.httpMethod || !allowedMethods.includes(event.httpMethod)) {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  // Get SmartZone connection details from query parameters
  const { host, port, path } = event.queryStringParameters || {}

  if (!host || !port || !path) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Missing required parameters: host, port, path',
      }),
    }
  }

  // Validate port is a number
  const portNumber = parseInt(port, 10)
  if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid port number' }),
    }
  }

  try {
    // Build SmartZone URL
    const szUrl = `https://${host}:${portNumber}${path}`

    // Prepare headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    // Forward cookies from client request (for session management)
    const clientCookies = event.headers['cookie'] || event.headers['Cookie']
    if (clientCookies) {
      requestHeaders['Cookie'] = clientCookies
    }

    // Convert custom X-Session-ID header to Cookie for SmartZone
    const sessionId = event.headers['x-session-id'] || event.headers['X-Session-ID']
    if (sessionId) {
      requestHeaders['Cookie'] = `JSESSIONID=${sessionId}`
    }

    // Use https.request instead of fetch to properly handle self-signed certs
    const response = await new Promise<{
      statusCode: number
      headers: Record<string, string | string[]>
      body: string
    }>((resolve, reject) => {
      const url = new URL(szUrl)
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: event.httpMethod,
        headers: requestHeaders,
        rejectUnauthorized: false, // Accept self-signed certificates
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers as Record<string, string | string[]>,
            body: data,
          })
        })
      })

      req.on('error', (err) => {
        reject(err)
      })

      // Send body if present
      if (event.body) {
        req.write(event.body)
      }

      req.end()
    })

    // Extract Set-Cookie header to forward to client
    const setCookieHeader = response.headers['set-cookie']
    const responseHeaders: Record<string, string> = {
      'Content-Type': (response.headers['content-type'] as string) || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
      'Access-Control-Allow-Credentials': 'true',
    }

    // For session endpoint, extract JSESSIONID and include in response body
    let responseBody = response.body
    if (path && path.includes('/session') && event.httpMethod === 'POST' && setCookieHeader) {
      const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
      const sessionMatch = cookieString.match(/JSESSIONID=([^;]+)/)
      if (sessionMatch) {
        // Inject session ID into response body
        try {
          const bodyData = JSON.parse(response.body || '{}')
          bodyData._sessionId = sessionMatch[1]
          responseBody = JSON.stringify(bodyData)
        } catch {
          // If body isn't JSON, create a new JSON response
          responseBody = JSON.stringify({ _sessionId: sessionMatch[1] })
        }
      }
    }

    if (setCookieHeader) {
      // Join multiple Set-Cookie headers
      responseHeaders['Set-Cookie'] = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(', ')
        : setCookieHeader
    }

    return {
      statusCode: response.statusCode,
      headers: responseHeaders,
      body: responseBody,
    }
  } catch (err) {
    console.error('SmartZone proxy error:', err)

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Proxy request failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      }),
    }
  }
}

export { handler }
