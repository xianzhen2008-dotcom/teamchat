#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[bootstrap] TeamChat open-source bootstrap"

if ! command -v node >/dev/null 2>&1; then
  echo "[bootstrap] ERROR: node is not installed"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[bootstrap] ERROR: npm is not installed"
  exit 1
fi

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "[bootstrap] created .env from .env.example"
  fi
fi

echo "[bootstrap] installing dependencies"
npm install

echo "[bootstrap] build check"
npm run build

echo "[bootstrap] runtime doctor"
npm run doctor

echo "[bootstrap] done. Start with: npm start"
