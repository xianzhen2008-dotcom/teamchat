#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

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
for (const pattern of riskyPatterns) {
  try {
    const output = execFileSync('rg', [
      '-n',
      '--fixed-strings',
      pattern,
      '--glob', '!node_modules/**',
      '--glob', '!dist/**',
      '--glob', '!android/.gradle/**',
      '--glob', '!data/**',
      '.'
    ], { encoding: 'utf8' }).trim();
    if (output) {
      grepFailed = true;
      console.error(`Risky pattern found: ${pattern}`);
      console.error(output);
    }
  } catch (error) {
    if (error.status !== 1) throw error;
  }
}

if (grepFailed) {
  process.exit(1);
}

console.log('Open-source cleanliness check passed.');
