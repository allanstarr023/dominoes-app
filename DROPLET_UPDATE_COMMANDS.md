# DigitalOcean Droplet Update Commands

Use this when the latest code has already been pushed to GitHub and you want to update the live DigitalOcean droplet.

## Server Details

- Droplet IP: `192.81.209.138`
- Domain: `dominoestt.com`
- App path: `/var/www/dominoes-app`
- App user: `dominoes`
- System service: `dominoes-app`
- GitHub branch: `main`
- GitHub remote: `origin`

## Manual Update Steps

From your local machine:

```bash
ssh root@192.81.209.138
```

On the droplet, update the app code as the `dominoes` user:

```bash
sudo -iu dominoes
cd /var/www/dominoes-app
git status
git fetch origin
git log --oneline HEAD..origin/main
git pull origin main
npm install
npm test
exit
```

Then restart and verify the live service as `root`:

```bash
systemctl restart dominoes-app
systemctl status dominoes-app --no-pager
curl http://127.0.0.1:3000/api/health
curl https://dominoestt.com/api/health
```

Expected health response:

```json
{"ok":true}
```

## Verify Latest Commit

Run this on the droplet:

```bash
sudo -iu dominoes
cd /var/www/dominoes-app
git log -1 --oneline
exit
```

The latest pushed commit at the time this file was created is:

```text
2802464 Add championship day scoring and analytics updates
```

## One-Command Script Option

Copy or run the script at:

```bash
scripts/update-droplet-from-git.sh
```

It must be run on the droplet as `root`:

```bash
cd /var/www/dominoes-app
bash scripts/update-droplet-from-git.sh
```

