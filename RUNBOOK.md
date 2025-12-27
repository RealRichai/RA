# RealRiches Runbook

## What You Need Installed

Before starting, make sure you have these two programs on your Mac:

1. **Node.js** - Download from https://nodejs.org (choose the LTS version)
2. **pnpm** - After installing Node, open Terminal and run:
   ```
   npm install -g pnpm
   ```

To check if they're installed, run these commands (you should see version numbers):
```
node --version
pnpm --version
```

---

## How to Start the Servers

Open Terminal and run these commands one by one:

```
cd ~/Desktop/realriches-platform\ 3
pnpm -C apps/api dev
```

Open a **new Terminal tab** (Cmd + T), then run:

```
cd ~/Desktop/realriches-platform\ 3
pnpm -C apps/web dev
```

Wait until you see "Ready" in both tabs.

---

## URLs to Open

| What | URL |
|------|-----|
| Website | http://localhost:3001 |
| API Health | http://localhost:4000/health |
| Debug Page | http://localhost:3001/debug |

---

## How to Confirm Everything Is Working

1. Open http://localhost:3001 — you should see the RealRiches homepage
2. Open http://localhost:4000/health — you should see `{"ok":true,"service":"api","version":"2.0.0"}`
3. Open http://localhost:3001/debug — you should see "API Connected" in green

If all three work, you're good to go.

---

## How to Stop the Servers

1. Click the Terminal tab running the web server
2. Press **Ctrl + C**
3. Click the Terminal tab running the API server
4. Press **Ctrl + C**

---

## Common Fixes

**"Port 3000 is in use"**
- This is normal. The web server will automatically use port 3001 instead.

**Blank page or nothing loads**
- Make sure both servers show "Ready" in Terminal before opening URLs.
- Try refreshing the page (Cmd + R).

**"API Not Connected" on debug page**
- The API server isn't running. Go back and start it first (the `pnpm -C apps/api dev` command).

**Commands not working**
- Make sure you're in the right folder. Run `cd ~/Desktop/realriches-platform\ 3` first.

**Nothing works at all**
- Close all Terminal tabs and start fresh from the beginning.
