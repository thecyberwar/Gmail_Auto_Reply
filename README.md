# Gmail Auto-Reply Backend

A **backend-only** Node.js service that automatically replies to every new email arriving in a Gmail inbox. No website, no UI — just a lightweight REST API to control the automation.

---

## ✨ Features

- **Automatic replies** — checks the inbox every 45 seconds (IMAP) and replies over SMTP
- **HTML email templates** — professional-looking replies rendered from `templates/*.html`
- **Thread-aware** — replies carry `In-Reply-To` / `References` so they land in the same Gmail conversation
- **Loop protection** — never replies to itself, to other auto-responders, or to mailing lists
- **Idempotent** — remembers processed messages (`data/state.json`), never replies twice
- **Starts clean** — old mails are ignored on first run; only *new* messages get a reply
- **REST API** — start / stop / inspect the loop, send test mails, all protected by an API key
- **Crash safe** — auto-reconnects on IMAP errors, atomic state writes, graceful shutdown
- **Fully commented** — every file has developer documentation in English

---

## 🧠 How it works

```
Gmail INBOX
     ^  IMAP poll (every POLL_INTERVAL_SECONDS)
     |
inboxLoop.js  ──── emits "email:new" ────>  hooks/onNewEmail.js
     |                                             |
data/state.json (dedupe)                services/autoReply.service.js
                                                   |         (filter + build)
                                                   v
                                     services/gmail.service.js ── SMTP ──> reply sent
```

---

## 📋 Requirements

| Requirement | Notes |
|---|---|
| **Node.js 18+** | <https://nodejs.org> (LTS) |
| **Gmail account** | the mailbox to monitor |
| **App Password** | Google Account → Security → **2-Step Verification ON** → [App passwords](https://myaccount.google.com/apppasswords) |
| **IMAP enabled** | enabled by default on Gmail |

---

## 🚀 Quick start

```bash
# 1. Get the code
git clone https://github.com/thecyberwar/Gmail_Auto_Reply.git
cd Gmail_Auto_Reply

# 2. Install dependencies
npm install

# 3. Configure
copy .env.example .env        # Windows
# cp .env.example .env        # macOS / Linux
# ...then edit .env with your Gmail + App Password + API key

# 4. Run
npm start
```

Expected output:

```
[INFO] Inbox loop STARTED — checking every 45 sec
[INFO] API listening -> http://localhost:3000
[INFO] IMAP connected: you@gmail.com
```

Verify:

```
http://localhost:3000/health
-> {"ok":true,"service":"gmail-auto-reply-backend", ...}
```

**Test it:** send an email to your monitored account from another address — you will receive the auto reply within ~45 seconds.

---

## ⚙️ Configuration (`.env`)

| Key | Required | Default | Description |
|---|---|---|---|
| `GMAIL_USER` | ✅ | — | Gmail address the bot monitors |
| `GMAIL_APP_PASSWORD` | ✅ | — | 16-char Google App Password (spaces are ignored) |
| `PORT` | | `3000` | HTTP API port |
| `API_KEY` | ✅ | — | Secret sent in the `x-api-key` header for all `/api/*` calls |
| `AUTO_START` | | `true` | Start the polling loop on boot |
| `POLL_INTERVAL_SECONDS` | | `45` | Inbox check interval |
| `START_FROM_NOW` | | `true` | Ignore pre-existing mails on first run |
| `REPLY_TO_SENDERS` | | *(empty)* | Comma-separated allowlist; empty = reply to everyone |
| `MAX_REPLIES_PER_POLL` | | `10` | Safety cap per poll cycle |
| `DRY_RUN` | | `false` | `true` = log replies without sending |
| `APP_NAME` | | `Auto Reply Bot` | Sender name shown in the reply |
| `AUTO_REPLY_SUBJECT` | | `Auto Reply` | Reply subject prefix |
| `AUTO_REPLY_MESSAGE` | | *(built-in)* | Reply body — **quotes required** for multi-line values |
| `AUTO_REPLY_TEMPLATE` | | `premiumReply` | Template file inside `templates/` (without `.html`) |

> ⚠️ **Never commit `.env`** — it contains credentials. It is already listed in `.gitignore`.

---

## 🔌 API reference

All `/api/*` endpoints require the header:

```
x-api-key: <API_KEY>
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness probe (no auth) |
| GET | `/api/automation/status` | Loop statistics (`running`, `polls`, `replied`, `lastError`, ...) |
| POST | `/api/automation/start` | Start the polling loop |
| POST | `/api/automation/stop` | Stop the polling loop |
| POST | `/api/mail/send` | Send an email: `{ "to", "subject", "text" }` |

### Examples

```bash
# Status
curl -H "x-api-key: YOUR_KEY" \
     http://localhost:3000/api/automation/status

# Stop the loop
curl -X POST -H "x-api-key: YOUR_KEY" \
     http://localhost:3000/api/automation/stop

# Send a test mail
curl -X POST -H "x-api-key: YOUR_KEY" \
     -H "Content-Type: application/json" \
     -d '{"to":"someone@example.com","subject":"Hello","text":"Test mail"}' \
     http://localhost:3000/api/mail/send
```

PowerShell:

```powershell
Invoke-RestMethod 'http://localhost:3000/api/automation/status' `
  -Headers @{'x-api-key'='YOUR_KEY'}
```

---

## 📁 Project structure

```
src/
├── index.js            entry point: config -> hooks -> API -> loop -> shutdown
├── app.js              Express app: middleware order, routes, error handler
├── config/             .env loading + validation (single source of truth)
├── api/routes/         /api/automation and /api/mail endpoints
├── middlewares/        API key auth + global error handler
├── controllers/        request handlers (thin, call services)
├── services/
│   ├── gmail.service.js       IMAP + SMTP (the only module talking to Gmail)
│   ├── autoReply.service.js   filters mail, builds the reply (loop guards)
│   └── template.service.js    renders HTML templates
├── hooks/              event bus + "email:new" listener (extension point)
├── loops/inboxLoop.js  polling loop + statistics
├── models/             data/state.json persistence (atomic writes)
├── validators/         request body validation
├── utils/              logger
└── errors/             AppError (HTTP-aware error type)
templates/              HTML reply templates ({{PLACEHOLDER}} syntax)
data/state.json         runtime state — auto-generated, git-ignored
```

---

## 🎨 Email templates

Templates live in `templates/` and use `{{PLACEHOLDER}}` tokens:

| Placeholder | Value |
|---|---|
| `{{SENDER_NAME}}` | original sender's display name |
| `{{SUBJECT}}` | original subject |
| `{{MESSAGE_HTML}}` | configured reply body (auto-escaped + paragraphs) |
| `{{APP_NAME}}` / `{{APP_INITIALS}}` | bot name / logo initials |
| `{{DATE}}` / `{{YEAR}}` | current date / year |

Create your own: add `templates/myTemplate.html`, then set `AUTO_REPLY_TEMPLATE=myTemplate`.

---

## 🔌 Extending

Register another listener for new mails in `src/hooks/onNewEmail.js`:

```js
const hooks = require('./index');

hooks.on('email:new', async (message) => {
  // message = parsed mail (mailparser): subject, from, text, headers, ...
});
```

`hooks.emit()` awaits every listener in order, so side effects (forwarding, labeling, storing) stay deterministic.

---

## 🐛 Troubleshooting

| Symptom | Fix |
|---|---|
| `InvalidLoginError` / auth failed | App Password is wrong — regenerate it at Google Account → Security → App passwords |
| `API_KEY is not configured on the server` | Add `API_KEY=` to `.env`, restart |
| No replies sent | `DRY_RUN=true` only logs — remove it from `.env` |
| Replies sent for old mails | Keep `START_FROM_NOW=true`, delete `data/state.json`, restart |
| `EADDRINUSE` | Another process owns `PORT` — stop it or change the port |
| Replies land in Spam | Sender reputation — for production use a domain/MARKING setup; test from a real person's account first |

---

## 🔒 Security notes

- `.env` is **git-ignored** — never commit credentials
- Rotate the **App Password** if the repository or machine is compromised
- Use a long random `API_KEY` (e.g. `openssl rand -hex 16`)
- The API exposes mail sending — do **not** expose it publicly without TLS and a strong key (put it behind a reverse proxy when deploying)

---

## 🌐 Deployment — run it 24/7 with HTTPS

On your own PC the backend only works while the computer is on and `npm start` is running. For a **always-on, HTTPS** installation, deploy it once — afterwards it runs by itself and can be controlled from any device via the API.

> **How HTTPS works:** platforms like Render/Railway terminate TLS for you, so your API is automatically available at `https://....onrender.com` — no certificate setup needed. For a custom domain you get free Let's Encrypt certificates as well.

### Where can it run?

| Platform | Free tier | HTTPS | Difficulty | Best for |
|---|---|---|---|---|
| **[Render](https://render.com)** | ✅ yes (web service) | ✅ automatic | 🟢 easiest | first deployment, personal bots |
| **[Railway](https://railway.app)** | ✅ trial credit | ✅ automatic | 🟢 easy | small always-on services |
| **[Fly.io](https://fly.io)** | ✅ small allowance | ✅ automatic | 🟡 medium (Docker) | low-latency global apps |
| **[Koyeb](https://koyeb.com)** | ✅ yes | ✅ automatic | 🟢 easy | simple Node services |
| **VPS (Oracle Cloud / AWS / Hetzner / DigitalOcean)** | ✅ Oracle always-free | ✅ with Nginx + Certbot | 🟡 medium | full control, true 24/7 |
| Own PC + `npm start` | ✅ | ❌ localhost only | 🟢 zero | local testing |

**Not suitable:** serverless platforms (**Vercel, Netlify, Cloudflare Workers**) — this backend needs a *long-running* process that polls IMAP on a timer; serverless functions freeze between requests. Traditional PHP/cPanel hosting also won't run it (it's Node.js, not PHP).

### Option A — Render (recommended, ~5 minutes)

1. **Push the code to GitHub** (see the Quick start above — `.env` is git-ignored, credentials stay local).
2. Go to <https://dashboard.render.com> → **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Settings:
   | Field | Value |
   |---|---|
   | Runtime | `Node` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance | `Free` |
5. Add the environment variables (same as `.env`):

   ```
   GMAIL_USER            = you@gmail.com
   GMAIL_APP_PASSWORD    = your-16-char-app-password
   API_KEY               = long-random-secret
   AUTO_START            = true
   POLL_INTERVAL_SECONDS = 45
   START_FROM_NOW        = true
   AUTO_REPLY_TEMPLATE   = premiumReply
   APP_NAME              = Auto Reply Bot
   ```

6. **Create Web Service** → wait for the build → open the given URL:

   ```
   https://your-app.onrender.com/health   ->   {"ok":true,...}
   ```

   That URL is your **HTTPS backend** — use it in API calls:

   ```bash
   curl -H "x-api-key: YOUR_KEY" https://your-app.onrender.com/api/automation/status
   ```

7. **Keep it awake (free tier):** Render's free instance sleeps after inactivity. Point a free monitor such as <https://uptimerobot.com> at `/health` every 5 minutes — it stays awake 24/7 within the free monthly hours.

### Option B — Railway

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo**.
2. Railway detects Node automatically — set the start command to `npm start`.
3. Add the same environment variables as above (tab *Variables*).
4. Settings → **Networking** → *Generate Domain* → you get `https://your-app.up.railway.app`.

### Option C — VPS (true always-on, full control)

```bash
# Ubuntu/Debian server
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
git clone https://github.com/thecyberwar/Gmail_Auto_Reply.git && cd Gmail_Auto_Reply
npm install
sudo npm install -g pm2
pm2 start src/index.js --name gmail-autoreply
pm2 save && pm2 startup        # restart on reboot

# HTTPS reverse proxy
sudo apt-get install -y nginx
# ...proxy_pass 127.0.0.1:3000 in the server block...
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com     # free Let's Encrypt certificate
```

### Deployment notes

- **`PORT` is read from the environment** — Render/Railway inject their own port automatically, no changes needed.
- **`data/state.json` on free hosts is temporary** (the disk resets on redeploy). That is safe: on the next boot the loop simply records a fresh baseline and continues — it never re-replies to old mails (`START_FROM_NOW=true`).
- **Secrets:** set every credential as a platform environment variable, never in the repository.
- **After deploying, update the API URL** in whatever client/script you use to call the backend.

---

## 📄 License

Free to use and modify for your own automation.
