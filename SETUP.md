# 🙌 Gratitude Bot — Complete Setup Guide

## What This Bot Does

- `/thanks @alice @bob for fixing the production bug 🚀` — sends animated gratitude to a #gratitude channel, deducts karma from sender
- `/gratitude-board` — shows the monthly leaderboard ranked by given + received
- `/my-karma` — check your karma balance and monthly stats
- **Monthly winner** gets the 👑 champion badge. Winner = highest combined (given + received) score.
- Everyone starts with **50 karma** per month. Karma resets on the 1st.

---

## Step 1 — Create Your Slack App

1. Go to **https://api.slack.com/apps** and click **"Create New App"**
2. Choose **"From scratch"**
3. Name it something like `Gratitude Bot` and pick your workspace
4. Click **Create App**

---

## Step 2 — Configure OAuth & Permissions

1. In your app's left sidebar → **OAuth & Permissions**
2. Scroll to **Scopes → Bot Token Scopes** and add:

   | Scope | Purpose |
   |-------|---------|
   | `chat:write` | Post messages |
   | `chat:write.public` | Post to channels without being a member |
   | `commands` | Receive slash commands |
   | `users:read` | Look up user info |

3. Scroll up → **Install to Workspace** → Allow
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`) — you'll need this later

---

## Step 3 — Get Your Signing Secret

1. Left sidebar → **Basic Information**
2. Scroll to **App Credentials**
3. Copy **Signing Secret** — keep this secret!

---

## Step 4 — Deploy to Vercel

### 4a. Push your code to GitHub

```bash
cd gratitude-bot
git init
git add .
git commit -m "Initial commit"
# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/gratitude-bot.git
git push -u origin main
```

### 4b. Create a Vercel project

1. Go to **https://vercel.com** → New Project
2. Import your GitHub repo
3. Click **Deploy** (it will fail — that's OK, we need to add env vars next)

### 4c. Add a Vercel KV database

1. In your Vercel project → **Storage** tab → **Create Database**
2. Choose **KV (Redis)**
3. Name it `gratitude-kv` → Create
4. Click **Connect to Project** — this auto-adds the KV env vars ✅

### 4d. Add remaining environment variables

In Vercel → Project → **Settings → Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `SLACK_BOT_TOKEN` | `xoxb-...` (from Step 2) |
| `SLACK_SIGNING_SECRET` | from Step 3 |
| `GRATITUDE_CHANNEL_ID` | Your #gratitude channel ID (see below) |
| `CRON_SECRET` | Run `openssl rand -hex 32` to generate |

**Finding your channel ID:**
- Open Slack → right-click your #gratitude channel → **View channel details**
- Scroll to the bottom — the ID looks like `C0XXXXXXXXX`

### 4e. Redeploy

```bash
vercel --prod
# Or just push a new commit to GitHub — Vercel auto-deploys
```

Your app URL will be something like: `https://gratitude-bot-xyz.vercel.app`

---

## Step 5 — Register Slash Commands

Back in **https://api.slack.com/apps** → your app:

1. Left sidebar → **Slash Commands** → **Create New Command**

Add all three:

### `/thanks`
- **Command:** `/thanks`
- **Request URL:** `https://YOUR-VERCEL-URL.vercel.app/api/slack`
- **Short Description:** Thank your teammates and give karma
- **Usage Hint:** `@person [and @others] for reason`

### `/gratitude-board`
- **Command:** `/gratitude-board`
- **Request URL:** `https://YOUR-VERCEL-URL.vercel.app/api/slack`
- **Short Description:** View the monthly gratitude leaderboard

### `/my-karma`
- **Command:** `/my-karma`
- **Request URL:** `https://YOUR-VERCEL-URL.vercel.app/api/slack`
- **Short Description:** Check your karma balance and stats

2. Click **Save** after each command

---

## Step 6 — Invite the Bot to Your Gratitude Channel

In Slack, go to your **#gratitude** channel and type:

```
/invite @Gratitude Bot
```

---

## Step 7 — Test It!

In any channel, try:
```
/thanks @your-colleague for being awesome! 🎉
```

Then check #gratitude — you should see an animated message with confetti! 🎊

Try:
```
/gratitude-board
/my-karma
```

---

## How the Scoring Works

| Action | Effect |
|--------|--------|
| Send `/thanks @alice` | Alice +1 received • You -1 balance • You +1 given |
| Send `/thanks @alice @bob` | Alice +1, Bob +1 • You -2 balance • You +2 given |
| **Leaderboard score** | `karma_given + karma_received` |
| **Winner** | Highest combined score at month end |
| **Reset** | 1st of each month at 9am UTC — everyone back to 50 karma |

**Why give to win?** The scoring rewards both generosity (given) and being valued (received). The champion is whoever creates the most gratitude culture — not just whoever received the most compliments.

---

## Karma Rules

- ✅ You can thank multiple people in one command
- ❌ You cannot thank yourself
- ❌ You cannot give if your balance is 0
- 💰 Each person thanked costs 1 karma from your balance
- 🔄 Balance resets to 50 on the 1st of each month
- 👑 Monthly winner keeps their champion badge until next month

---

## Troubleshooting

**Bot says "invalid signature"**
→ Double-check your `SLACK_SIGNING_SECRET` in Vercel env vars

**Bot doesn't post to #gratitude**
→ Make sure `GRATITUDE_CHANNEL_ID` is correct and you've invited the bot to the channel

**"not_in_channel" error**
→ Run `/invite @Gratitude Bot` in your #gratitude channel

**Commands not responding**
→ Check Vercel logs: `vercel logs --follow`

**KV errors**
→ Ensure Vercel KV is connected to your project in the Storage tab

---

## Monthly Cron Job

The monthly reset & winner announcement runs automatically on the **1st of each month at 9am UTC** via Vercel Cron (configured in `vercel.json`).

To trigger it manually for testing:
```bash
curl -X POST https://YOUR-VERCEL-URL.vercel.app/api/cron-monthly \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## File Structure

```
gratitude-bot/
├── api/
│   ├── slack.js          # Main slash command handler
│   └── cron-monthly.js   # Monthly winner + reset
├── lib/
│   ├── db.js             # Vercel KV database layer
│   ├── messages.js       # Slack Block Kit message builders
│   ├── slack-client.js   # Slack API calls
│   └── slack-verify.js   # Request signature verification
├── .env.example          # Environment variable template
├── package.json
└── vercel.json           # Cron schedule config
```
