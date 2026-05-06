#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');

const forbiddenTracked = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)data\//,
  /(^|\/)uploads\//,
  /(^|\/)logs\//,
  /(^|\/)message_logs\//,
  /(^|\/)history_backups\//,
  /(^|\/)core_backups\//,
  /(^|\/)exports\//,
  /(^|\/)output\//,
  /\.db(?:-|$)/,
  /\.sqlite3?$/,
  /\.log$/,
  /\.bak$/,
  /team_chat_history.*\.json$/,
  /team_chat_password\.json$/,
  /team_chat_sessions\.json$/,
  /notification_history\.json$/
];

const riskyPatterns = [
  ['/Users/', 'wusiwei'].join(''),
  ['teamchat', '.qzz', '.io'].join(''),
  ['qzz', '.io'].join(''),
  ['qyapi.weixin.qq.com', '/cgi-bin/webhook/send?key='].join(''),
  ['App', 'Secret'].join(''),
  ['BEGIN ', 'PRIVATE KEY'].join(''),
  ['xianzhen2008', '@gmail.com'].join('')
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const tracked = git(['ls-files']).split('\n').filter(Boolean);
const badTracked = tracked.filter((file) => forbiddenTracked.some((pattern) => pattern.test(file)));

if (badTracked.length) {
  console.error('Forbidden runtime/private files are tracked:');
  badTracked.forEach((file) => console.error(` - ${file}`));
  process.exit(1);
}

let grepFailed = false;
const scanExcludes = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)android\/\.gradle\//,
  /(^|\/)data\//,
  /(^|\/)package-lock\.json$/
];

function readTextIfSafe(file) {
  try {
    const data = fs.readFileSync(file);
    if (data.includes(0)) return null;
    return data.toString('utf8');
  } catch {
    return null;
  }
}

for (const pattern of riskyPatterns) {
  for (const file of tracked) {
    if (scanExcludes.some((exclude) => exclude.test(file))) continue;
    const text = readTextIfSafe(file);
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(pattern)) {
      grepFailed = true;
      console.error(`Risky pattern found: ${pattern}`);
        console.error(`${file}:${index + 1}:${line}`);
      }
    });
    }
}

if (grepFailed) {
  process.exit(1);
}

console.log('Open-source cleanliness check passed.');
