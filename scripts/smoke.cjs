#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const PORT = Number(process.env.PORT || 18788);
const BASE = `http://127.0.0.1:${PORT}`;
const serverFile = path.join(__dirname, '..', 'team_chat_server.cjs');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch (_) {}
    await sleep(400);
  }
  return false;
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (e) {
    console.error(`❌ ${name} -> ${e.message}`);
    return false;
  }
}

(async () => {
  const child = spawn(process.execPath, [serverFile], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

  let code = 0;
  try {
    const ready = await waitForHealth();
    if (!ready) throw new Error('server health not ready within timeout');

    const results = [];

    results.push(await check('GET /api/health returns ok status', async () => {
      const res = await fetch(`${BASE}/api/health`);
      if (res.status !== 200) throw new Error(`status=${res.status}`);
      const json = await res.json();
      if (json.status !== 'ok') throw new Error(`status field=${json.status}`);
    }));

    results.push(await check('GET /api/agents returns JSON array', async () => {
      const res = await fetch(`${BASE}/api/agents`);
      if (res.status !== 200) throw new Error(`status=${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error('response is not array');
    }));

    results.push(await check('GET /api/agents/status returns agents object', async () => {
      const res = await fetch(`${BASE}/api/agents/status`);
      if (res.status !== 200) throw new Error(`status=${res.status}`);
      const json = await res.json();
      if (typeof json.agents !== 'object' || json.agents === null) throw new Error('missing agents object');
    }));

    results.push(await check('GET /api/system-metrics returns metrics payload', async () => {
      const res = await fetch(`${BASE}/api/system-metrics`);
      if (res.status !== 200) throw new Error(`status=${res.status}`);
      const json = await res.json();
      if (!json.memory || typeof json.memory !== 'object') throw new Error('missing memory object');
      if (!json.teamchat || typeof json.teamchat !== 'object') throw new Error('missing teamchat object');
    }));

    results.push(await check('GET / returns HTML', async () => {
      const res = await fetch(`${BASE}/`);
      if (res.status !== 200) throw new Error(`status=${res.status}`);
      const text = await res.text();
      if (!text.includes('<!DOCTYPE html>')) throw new Error('not html');
    }));

    results.push(await check('GET /assets/js/main.js returns JS', async () => {
      const res = await fetch(`${BASE}/assets/js/main.js`);
      if (res.status !== 200) throw new Error(`status=${res.status}`);
      const text = await res.text();
      if (!text.includes('class TeamChatApp') && !text.includes('init')) {
        throw new Error('unexpected js content');
      }
    }));

    if (results.some((r) => !r)) code = 1;
  } catch (e) {
    console.error(`❌ smoke test fatal -> ${e.message}`);
    code = 1;
  } finally {
    child.kill('SIGINT');
    await sleep(600);
    if (!child.killed) child.kill('SIGTERM');
  }

  process.exit(code);
})();
