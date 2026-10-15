#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Agents
mkdir -p /workspace/.cache/npm /workspace/.cache/electron
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
NODE_USE_ENV_PROXY=1 ELECTRON_GET_USE_PROXY=1 electron_config_cache=/workspace/.cache/electron XDG_CACHE_HOME=/workspace/.cache npm run setup:desktop
npm run build
npm test
