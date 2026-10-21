"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);
const publicDirectory = path.join(__dirname, "public");
const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);
const maxRequestBytes = 2048;
const sessionLifetimeMs = 30 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const demoEmail = process.env.DEMO_EMAIL?.trim().toLowerCase();
const demoPassword = process.env.DEMO_PASSWORD;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be an integer between 1 and 65535.");
  process.exit(1);
}

if (!demoEmail || !demoPassword || demoPassword.length < 12) {
  console.error("Set DEMO_EMAIL and a DEMO_PASSWORD of at least 12 characters. Use fabricated local-only values.");
  process.exit(1);
}

const passwordSalt = randomBytes(16);
const expectedPasswordHash = scryptSync(demoPassword, passwordSalt, 64);
const passwordBytes = Buffer.byteLength(demoPassword);

function send(response, statusCode, contentType, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "referrer-policy": "no-referrer",
    ...extraHeaders,
  });
  response.end(body);
}

function sendJson(response, statusCode, body, extraHeaders = {}) {
  send(response, statusCode, "application/json; charset=utf-8", JSON.stringify(body), extraHeaders);
}

async function readJson(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    const error = new Error("Expected a JSON request.");
    error.statusCode = 415;
    throw error;
  }

  const chunks = [];
  let requestBytes = 0;
  for await (const chunk of request) {
    requestBytes += chunk.length;
    if (requestBytes > maxRequestBytes) {
      const error = new Error("Request too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid request.");
    error.statusCode = 400;
    throw error;
  }
}

function requestIsSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function getClientKey(request) {
  return request.socket.remoteAddress || "local";
}

function getAttemptState(clientKey) {
  const now = Date.now();
  let state = loginAttempts.get(clientKey);
  if (!state || state.windowEndsAt <= now) {
    state = { failures: 0, windowEndsAt: now + 60_000, blockedUntil: 0 };
    loginAttempts.set(clientKey, state);
  }
  return state;
}

function getCookie(request, name) {
  const prefix = `${name}=`;
  const cookie = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : "";
}

function getSession(request) {
  const sessionId = getCookie(request, "demo_session");
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return { sessionId, session };
}

function pruneSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);

  if (request.method === "GET" && publicFiles.has(requestUrl.pathname)) {
    const [fileName, contentType] = publicFiles.get(requestUrl.pathname);
    fs.readFile(path.join(publicDirectory, fileName), (error, content) => {
      if (error) {
        send(response, 500, "text/plain; charset=utf-8", "Unable to load the demo.");
        return;
      }
      send(response, 200, contentType, content);
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/session") {
    const authenticated = getSession(request);
    if (!authenticated) {
      sendJson(response, 200, { authenticated: false });
      return;
    }
    sendJson(response, 200, { authenticated: true, email: authenticated.session.email });
    return;
  }

  if (request.method === "POST" && ["/api/login", "/api/logout"].includes(requestUrl.pathname)) {
    if (!requestIsSameOrigin(request)) {
      sendJson(response, 403, { message: "Request origin is not allowed." });
      return;
    }

    if (requestUrl.pathname === "/api/logout") {
      const authenticated = getSession(request);
      if (authenticated) {
        sessions.delete(authenticated.sessionId);
      }
      sendJson(response, 200, { message: "You are signed out." }, {
        "set-cookie": "demo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
      return;
    }

    const clientKey = getClientKey(request);
    const attemptState = getAttemptState(clientKey);
    if (attemptState.blockedUntil > Date.now()) {
      sendJson(response, 429, { message: "Too many attempts. Wait a minute and try again." });
      return;
    }

    let credentials;
    try {
      credentials = await readJson(request);
    } catch (error) {
      sendJson(response, error.statusCode || 400, { message: error.message });
      return;
    }

    if (typeof credentials.email !== "string" || typeof credentials.password !== "string"
      || credentials.email.length > 254 || credentials.password.length > 128) {
      sendJson(response, 400, { message: "Enter a valid email and password." });
      return;
    }

    const candidatePassword = Buffer.from(credentials.password);
    const passwordLengthMatches = candidatePassword.length === passwordBytes;
    const candidatePasswordHash = scryptSync(credentials.password, passwordSalt, 64);
    const passwordMatches = timingSafeEqual(candidatePasswordHash, expectedPasswordHash) && passwordLengthMatches;
    const emailMatches = credentials.email.trim().toLowerCase() === demoEmail;

    if (!emailMatches || !passwordMatches) {
      attemptState.failures += 1;
      if (attemptState.failures >= 5) {
        attemptState.blockedUntil = Date.now() + 60_000;
        attemptState.failures = 0;
      }
      sendJson(response, 401, { message: "Email or password is incorrect." });
      return;
    }

    loginAttempts.delete(clientKey);
    pruneSessions();
    if (sessions.size >= 128) {
      sendJson(response, 503, { message: "The local demo has reached its session limit." });
      return;
    }

    const sessionId = randomBytes(32).toString("base64url");
    sessions.set(sessionId, { email: demoEmail, expiresAt: Date.now() + sessionLifetimeMs });
    sendJson(response, 200, { email: demoEmail }, {
      "set-cookie": `demo_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetimeMs / 1000}`,
    });
    return;
  }

  sendJson(response, 404, { message: "Not found." });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch(() => {
    if (!response.headersSent) {
      sendJson(response, 500, { message: "The local demo could not complete the request." });
    }
  });
});

server.listen(port, host, () => {
  console.log(`Demo available at http://${host}:${port}`);
  console.log("Use fabricated local-only credentials from DEMO_EMAIL and DEMO_PASSWORD.");
});