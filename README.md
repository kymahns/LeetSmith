# ⚔️ LeetSmith

**Forge your LeetCode solutions directly to GitHub — automatically.**

LeetSmith is a lightweight Chrome Extension (Manifest V3) that detects your accepted LeetCode submissions and commits them to a GitHub repository in real-time. No manual copy-pasting. No extra tools. Just solve, and LeetSmith handles the rest.

> Built as a robust, portfolio-ready alternative to LeetSync.

---

## ✨ Features

- **🔥 Auto-Sync** — Accepted submissions are automatically pushed to your GitHub repo with zero clicks.
- **📊 Forge Stats Dashboard** — Track your Easy (Copper), Medium (Steel), and Hard (Obsidian) problem counts with a thematic smithing UI.
- **🔥 Streak Tracker** — See your current LeetCode streak front and center.
- **📅 Daily Forge Reminder** — Get a motivational nudge if you haven't solved anything today.
- **🔔 Visual Sync Feedback** — The extension icon briefly changes to a flame (success) or a red X (failure) so you know sync status without opening the popup.
- **🛡️ Deduplication** — Prevents duplicate commits even if the "Accepted" state lingers on the page.
- **📝 Structured Commits** — Each sync creates two commits:
  - **Solution**: `Time: X ms (Y%) | Memory: Z MB (W%) - LeetSmith`
  - **README**: `Added README.md file for <Problem Name>`

---

## 📁 Repo Structure (per problem)

```
<problem-id>-<slug>/
├── solution.<ext>    # Your code with metadata header
└── README.md         # Problem description, difficulty, and link
```

---

## 🚀 Getting Started

### 1. Install the Extension
1. Clone this repo: `git clone https://github.com/kymahns/LeetSmith.git`
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked** and select the `LeetSmith` folder

### 2. Connect GitHub
1. Click the LeetSmith icon in your toolbar
2. Click **⛓️ Connect to GitHub** to authorize via OAuth
3. Enter your target repository URL (e.g., `https://github.com/you/leetcode`)
4. Click **Complete Setup**

### 3. Solve & Forge
Navigate to any LeetCode problem, submit an accepted solution, and watch LeetSmith automatically push it to your repo. 🔥

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome Manifest V3, Vanilla JS |
| LeetCode Data | GraphQL API (session-cookie auth) |
| GitHub Sync | REST API (OAuth / PAT) |
| Auth Backend | Vercel Serverless Function |
| Storage | `chrome.storage.local` |

---

## 🏗️ Architecture

```
manifest.json
src/
├── background.js           # Service worker: orchestrates sync
├── lib/
│   ├── githubApi.js         # GitHub REST API (commit files)
│   └── leetcodeApi.js       # LeetCode GraphQL (submissions, stats)
├── content/
│   └── leetcode.js          # DOM observer for "Accepted" detection
└── ui/
    ├── popup.html / popup.js  # Extension popup UI
    └── styles.css             # Forge-themed styling
assets/
├── logo2.png                # Default icon
├── logo_success.png         # Success state icon
└── logo_error.png           # Error state icon
```

---

## 🔒 Security

- GitHub tokens are stored in **isolated extension storage** — never exposed to web pages.
- Content scripts **cannot access** your GitHub PAT; only the background worker handles API calls.
- We recommend using a **fine-grained PAT** scoped to a single repository with "Contents: Read & Write" only.

---

## 📜 License

MIT — see [LICENSE](LICENSE) for details.

---

*Engineered with 🔥 by [kymahns](https://github.com/kymahns)*
