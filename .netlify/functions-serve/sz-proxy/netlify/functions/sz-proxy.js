var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/sz-proxy.ts
var sz_proxy_exports = {};
__export(sz_proxy_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(sz_proxy_exports);
var import_https = __toESM(require("https"));
var handler = async (event, context) => {
  const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  if (!event.httpMethod || !allowedMethods.includes(event.httpMethod)) {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }
  const { host, port, path } = event.queryStringParameters || {};
  if (!host || !port || !path) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required parameters: host, port, path"
      })
    };
  }
  const portNumber = parseInt(port, 10);
  if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid port number" })
    };
  }
  try {
    const szUrl = `https://${host}:${portNumber}${path}`;
    const requestHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    const clientCookies = event.headers["cookie"] || event.headers["Cookie"];
    if (clientCookies) {
      requestHeaders["Cookie"] = clientCookies;
    }
    const sessionId = event.headers["x-session-id"] || event.headers["X-Session-ID"];
    if (sessionId) {
      requestHeaders["Cookie"] = `JSESSIONID=${sessionId}`;
    }
    const response = await new Promise((resolve, reject) => {
      const url = new URL(szUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: event.httpMethod,
        headers: requestHeaders,
        rejectUnauthorized: false
        // Accept self-signed certificates
      };
      const req = import_https.default.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: data
          });
        });
      });
      req.on("error", (err) => {
        reject(err);
      });
      if (event.body) {
        req.write(event.body);
      }
      req.end();
    });
    const setCookieHeader = response.headers["set-cookie"];
    const responseHeaders = {
      "Content-Type": response.headers["content-type"] || "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
      "Access-Control-Allow-Credentials": "true"
    };
    let responseBody = response.body;
    if (path && path.includes("/session") && event.httpMethod === "POST" && setCookieHeader) {
      const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
      const sessionMatch = cookieString.match(/JSESSIONID=([^;]+)/);
      if (sessionMatch) {
        try {
          const bodyData = JSON.parse(response.body || "{}");
          bodyData._sessionId = sessionMatch[1];
          responseBody = JSON.stringify(bodyData);
        } catch {
          responseBody = JSON.stringify({ _sessionId: sessionMatch[1] });
        }
      }
    }
    if (setCookieHeader) {
      responseHeaders["Set-Cookie"] = Array.isArray(setCookieHeader) ? setCookieHeader.join(", ") : setCookieHeader;
    }
    return {
      statusCode: response.statusCode,
      headers: responseHeaders,
      body: responseBody
    };
  } catch (err) {
    console.error("SmartZone proxy error:", err);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "Proxy request failed",
        message: err instanceof Error ? err.message : "Unknown error"
      })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=sz-proxy.js.map
