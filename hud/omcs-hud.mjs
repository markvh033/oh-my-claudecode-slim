#!/usr/bin/env node
/**
 * omcs-hud.mjs — Status line for oh-my-claudecode-slim
 *
 * Output: 5h:22% | wk:2% | session:10m | ctx:5%
 *
 * Data sources:
 *   - Context %: stdin JSON from Claude Code
 *   - 5h / weekly limits: api.anthropic.com/api/oauth/usage
 *   - Session time: local state file keyed by transcript path
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import https from 'https';

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const HUD_DIR    = join(CONFIG_DIR, 'hud');
const CACHE_FILE = join(HUD_DIR, 'omcs-usage-cache.json');
const SESSION_FILE = join(HUD_DIR, 'omcs-session.json');
const CACHE_TTL  = 60_000; // 1 minute

const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

// ── Stdin ─────────────────────────────────────────────────────────────────────

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  try {
    for await (const chunk of process.stdin) chunks.push(chunk);
    return JSON.parse(chunks.join(''));
  } catch { return null; }
}

function getContextPct(stdin) {
  const native = stdin?.context_window?.used_percentage;
  if (typeof native === 'number' && !isNaN(native)) {
    return Math.round(Math.min(100, Math.max(0, native)));
  }
  const size = stdin?.context_window?.context_window_size;
  const u    = stdin?.context_window?.current_usage;
  if (!size || !u) return 0;
  const tokens = (u.input_tokens ?? 0)
    + (u.cache_creation_input_tokens ?? 0)
    + (u.cache_read_input_tokens ?? 0);
  return Math.min(100, Math.round((tokens / size) * 100));
}

// ── Session time ──────────────────────────────────────────────────────────────

function getSessionMinutes(transcriptPath) {
  if (!transcriptPath) return null;
  try {
    let sessions = {};
    if (existsSync(SESSION_FILE)) {
      sessions = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
    }
    if (!sessions[transcriptPath]) {
      sessions[transcriptPath] = Date.now();
      mkdirSync(HUD_DIR, { recursive: true });
      writeFileSync(SESSION_FILE, JSON.stringify(sessions));
    }
    return Math.floor((Date.now() - sessions[transcriptPath]) / 60_000);
  } catch { return null; }
}

function fmtMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`;
}

// ── Credentials ───────────────────────────────────────────────────────────────

function readCredentials() {
  if (process.platform === 'darwin') {
    try {
      const raw = execFileSync(
        'security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString().trim();
      const creds = JSON.parse(raw);
      if (creds.accessToken) return { ...creds, source: 'keychain' };
    } catch { /* fall through */ }
  }

  const credFile = join(CONFIG_DIR, '.credentials.json');
  if (existsSync(credFile)) {
    try {
      const data = JSON.parse(readFileSync(credFile, 'utf8'));
      const creds = data.claudeAiOauth ?? data;
      if (creds.accessToken) return { ...creds, source: 'file' };
    } catch { /* fall through */ }
  }

  return null;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      { hostname, path, method: 'POST', timeout: 8000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: chunks.join('') }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(data);
    req.end();
  });
}

function httpsGet(hostname, path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', timeout: 8000,
        headers: { Authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01' } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: chunks.join('') }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshAccessToken(creds) {
  if (!creds.refreshToken) return null;
  try {
    const res = await httpsPost('platform.claude.com', '/v1/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: OAUTH_CLIENT_ID,
    });
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    if (!data.access_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || creds.refreshToken,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };
  } catch { return null; }
}

// ── Usage API ─────────────────────────────────────────────────────────────────

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const c = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    if (Date.now() - c.timestamp < CACHE_TTL) return c.data;
  } catch { /* fall through */ }
  return null;
}

function writeCache(data) {
  try {
    mkdirSync(HUD_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), data }));
  } catch { /* best-effort */ }
}

async function fetchUsage() {
  const cached = readCache();
  if (cached) return cached;

  let creds = readCredentials();
  if (!creds) return null;

  if (creds.expiresAt && Date.now() >= creds.expiresAt - 30_000) {
    const refreshed = await refreshAccessToken(creds);
    if (refreshed) creds = { ...creds, ...refreshed };
  }

  try {
    const res = await httpsGet('api.anthropic.com', '/api/oauth/usage', creds.accessToken);
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    writeCache(data);
    return data;
  } catch { return null; }
}

// ── Render ────────────────────────────────────────────────────────────────────

function fmtPct(utilization) {
  if (typeof utilization !== 'number') return null;
  return `${Math.round(utilization * 100)}%`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const stdin = await readStdin();
  if (!stdin) { console.log(''); return; }

  const [usage, ctxPct, sessionMins] = await Promise.all([
    fetchUsage(),
    Promise.resolve(getContextPct(stdin)),
    Promise.resolve(getSessionMinutes(stdin.transcript_path)),
  ]);

  const fiveHourPct  = fmtPct(usage?.five_hour?.utilization);
  const weeklyPct    = fmtPct(usage?.seven_day?.utilization);

  const parts = [];
  if (fiveHourPct) parts.push(`5h:${fiveHourPct}`);
  if (weeklyPct)   parts.push(`wk:${weeklyPct}`);
  if (sessionMins !== null) parts.push(`session:${fmtMinutes(sessionMins)}`);
  parts.push(`ctx:${ctxPct}%`);

  console.log(parts.join(' | '));
}

main().catch(() => console.log(''));
