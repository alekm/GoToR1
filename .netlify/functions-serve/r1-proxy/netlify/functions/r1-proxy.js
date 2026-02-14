var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/r1-proxy.ts
var r1_proxy_exports = {};
__export(r1_proxy_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(r1_proxy_exports);
var API_HOSTS = {
  na: "https://api.ruckus.cloud",
  eu: "https://api.eu.ruckus.cloud",
  asia: "https://api.asia.ruckus.cloud"
};
var handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const { region, path, method = "GET", headers = {}, body: requestBody } = body;
    if (!region || !["na", "eu", "asia"].includes(region)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid region. Must be na, eu, or asia" })
      };
    }
    if (!path || typeof path !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Path is required" })
      };
    }
    const targetUrl = `${API_HOSTS[region]}${path}`;
    const requestHeaders = { ...headers };
    if (!requestHeaders["Content-Type"] && !requestHeaders["content-type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }
    if (path.includes("/oauth2/token")) {
      console.log("OAuth2 Request:", {
        url: targetUrl,
        method,
        headers: requestHeaders,
        bodyLength: requestBody?.length,
        bodyPreview: requestBody?.substring(0, 100)
      });
    }
    const response = await fetch(targetUrl, {
      method,
      headers: requestHeaders,
      body: requestBody
      // Already stringified by client
    });
    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }
    if (path.includes("/oauth2/token")) {
      console.log("OAuth2 Response:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData
      });
    }
    const responseHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, login-token, Login-Token",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Expose-Headers": "login-token, Login-Token"
      // Allow client to read these headers
    };
    const loginToken = response.headers.get("login-token") || response.headers.get("Login-Token");
    if (loginToken) {
      responseHeaders["login-token"] = loginToken;
    }
    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: JSON.stringify(responseData)
    };
  } catch (error) {
    console.error("R1 Proxy Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Proxy error",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=r1-proxy.js.map
