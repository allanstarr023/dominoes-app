# Dominoes App Git and DigitalOcean Deployment Guide

This guide documents the normal workflow for committing local changes to GitHub and updating the DigitalOcean droplet with the latest GitHub commit.

## Current Production Details

- GitHub repo: `https://github.com/allanstarr023/dominoes-app.git`
- Main branch: `main`
- DigitalOcean droplet IP: `192.81.209.138`
- Droplet OS: Ubuntu 24.04 LTS x64
- App user on droplet: `dominoes`
- App path on droplet: `/var/www/dominoes-app`
- Node service: `dominoes-app.service`
- App port: `3000`
- Public health check: `http://192.81.209.138/api/health`

Check the latest commit before each deployment:

```bash
git log -1 --oneline
```

## Commit Local Changes to GitHub

Run these commands from the local project folder:

```powershell
cd C:\wamp64\www\dominoes-app
git status --short
npm.cmd test
git add .
git commit -m "Describe the update"
git push origin main
```

After pushing, verify the local branch is synced:

```powershell
git status --branch --short
git log -1 --oneline
```

Expected clean state:

```text
## main...origin/main
```

## Update the DigitalOcean Droplet

SSH into the droplet:

```bash
ssh root@192.81.209.138
```

Switch to the app user and enter the app directory:

```bash
sudo -iu dominoes
cd /var/www/dominoes-app
```

Fetch and pull the latest commit:

```bash
git fetch origin
git status --short
git pull --ff-only origin main
git log -1 --oneline
```

Install dependencies only if `package.json` or `package-lock.json` changed:

```bash
npm ci
```

Run the test suite:

```bash
npm test
```

Exit back to root:

```bash
exit
```

Restart the app service:

```bash
systemctl restart dominoes-app
systemctl status dominoes-app --no-pager
```

Verify the app locally on the droplet:

```bash
curl http://127.0.0.1:3000/api/health
```

Verify the app publicly:

```bash
curl http://192.81.209.138/api/health
```

Expected health response:

```json
{"ok":true}
```

## Quick Update Command Sequence

Use this when you only need to pull the latest code and restart:

```bash
ssh root@192.81.209.138
sudo -iu dominoes
cd /var/www/dominoes-app
git pull --ff-only origin main
npm test
exit
systemctl restart dominoes-app
systemctl status dominoes-app --no-pager
curl http://127.0.0.1:3000/api/health
curl http://192.81.209.138/api/health
```

## If Git Pull Fails

If `git pull --ff-only origin main` fails because the droplet has local changes, inspect first:

```bash
git status --short
git diff
```

Do not run destructive commands such as `git reset --hard` unless you are sure the droplet has no important local-only changes.

If the repo asks for GitHub credentials, configure either:

- a GitHub deploy key on the droplet, or
- a fine-grained GitHub token with read access to the repo.

## Service Commands

Useful systemd commands:

```bash
systemctl status dominoes-app --no-pager
systemctl restart dominoes-app
journalctl -u dominoes-app --no-pager -n 100
```

Useful app checks:

```bash
curl http://127.0.0.1:3000/api/health
curl http://192.81.209.138/api/health
```
