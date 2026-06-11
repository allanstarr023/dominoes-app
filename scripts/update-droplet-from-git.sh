#!/usr/bin/env bash
set -euo pipefail

APP_USER="dominoes"
APP_DIR="/var/www/dominoes-app"
SERVICE_NAME="dominoes-app"
DOMAIN_HEALTH_URL="https://dominoestt.com/api/health"
LOCAL_HEALTH_URL="http://127.0.0.1:3000/api/health"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root on the DigitalOcean droplet."
  echo "Example: sudo bash scripts/update-droplet-from-git.sh"
  exit 1
fi

echo "Updating repository as ${APP_USER}..."
sudo -iu "${APP_USER}" bash <<APP_USER_COMMANDS
set -euo pipefail
cd "${APP_DIR}"
git status
git fetch origin
git log --oneline HEAD..origin/main
git pull origin main
npm install
npm test
APP_USER_COMMANDS

echo "Restarting ${SERVICE_NAME}..."
systemctl restart "${SERVICE_NAME}"
systemctl status "${SERVICE_NAME}" --no-pager

echo "Checking local health..."
curl "${LOCAL_HEALTH_URL}"
echo

echo "Checking domain health..."
curl "${DOMAIN_HEALTH_URL}"
echo

echo "Latest deployed commit:"
sudo -iu "${APP_USER}" bash <<APP_USER_COMMANDS
set -euo pipefail
cd "${APP_DIR}"
git log -1 --oneline
APP_USER_COMMANDS

