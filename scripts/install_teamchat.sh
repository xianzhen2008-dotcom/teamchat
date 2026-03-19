#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${TEAMCHAT_REPO_URL:-https://github.com/openclaw/teamchat.git}"
BRANCH="${TEAMCHAT_BRANCH:-main}"
INSTALL_DIR="${TEAMCHAT_DIR:-$HOME/teamchat}"
AUTO_START="${TEAMCHAT_AUTO_START:-false}"

log() { echo "[teamchat-install] $*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "ERROR: missing required command: $1"
    exit 1
  fi
}

log "Starting TeamChat one-click install"
require_cmd git
require_cmd node
require_cmd npm

if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Existing repository detected at $INSTALL_DIR, updating..."
  git -C "$INSTALL_DIR" fetch origin
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  if [[ -e "$INSTALL_DIR" && ! -d "$INSTALL_DIR/.git" ]]; then
    log "ERROR: $INSTALL_DIR exists but is not a git repo"
    exit 1
  fi
  log "Cloning repository from $REPO_URL to $INSTALL_DIR"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  log "Created .env from .env.example"
fi

log "Installing dependencies"
npm install

log "Building project"
npm run build

log "Running doctor checks"
npm run doctor

log "Running smoke checks"
npm run smoke

log "Install completed successfully"
log "Project directory: $INSTALL_DIR"
log "Start command: cd $INSTALL_DIR && npm start"

if [[ "$AUTO_START" == "true" ]]; then
  log "TEAMCHAT_AUTO_START=true detected, starting TeamChat..."
  exec npm start
fi
