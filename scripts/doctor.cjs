#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = process.cwd();
const openclawHome = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (e) {
    checks.push({ name, ok: false, error: e.message });
  }
}

check('node version >=18', () => {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) throw new Error(`current: ${process.versions.node}`);
});

check('required runtime modules resolvable', () => {
  ['axios', 'http-proxy', 'ws', 'better-sqlite3', 'imap'].forEach((m) => require.resolve(m));
});

check('.env.example exists', () => {
  const p = path.join(root, '.env.example');
  if (!fs.existsSync(p)) throw new Error('missing .env.example');
});

check('openclaw home exists', () => {
  if (!fs.existsSync(openclawHome)) throw new Error(`missing ${openclawHome}`);
});

const fail = checks.filter((c) => !c.ok);
checks.forEach((c) => {
  const icon = c.ok ? '✅' : '❌';
  console.log(`${icon} ${c.name}${c.ok ? '' : ` -> ${c.error}`}`);
});

if (fail.length) process.exit(1);
