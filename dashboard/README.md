# AugurMS

MapleStory v83 private server with an **AI Game Master** that autonomously tunes the game world in real time.

**Live:** [augur-ms.fly.dev](https://augur-ms.fly.dev)

![Next.js 15](https://img.shields.io/badge/Next.js-15-black) ![React 19](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6) ![Claude Agent SDK](https://img.shields.io/badge/Claude-Agent%20SDK-orange) ![Fly.io](https://img.shields.io/badge/Fly.io-deployed-purple)

---

## What is AugurMS?

An augur was a Roman oracle who read signs to guide decisions. **AugurMS** is a MapleStory v83 server where an AI Game Master reads the pulse of the game — player activity, economy health, progression curves — and tunes the world accordingly.

- Classic v83 experience (4th job, PQs, bossing)
- AI-driven dynamic events, rate adjustments, and economy balancing
- Public registration, admin dashboard, and full server management

---

## Architecture

```
Public (Fly.io)                    Admin (Fly.io, auth-gated)
┌──────────────────┐               ┌──────────────────────────┐
│  Landing Page    │               │  Dashboard  │ Characters │
│  Registration    │               │  Items      │ Mobs       │
│  Server Status   │               │  Maps       │ Drops      │
└────────┬─────────┘               │  Config     │ Scripts    │
         │                         │  Game Master (AI)        │
         │                         └────────────┬─────────────┘
         │                                      │
         └──────────────┬───────────────────────┘
                        │
              ┌─────────┴─────────┐
              │  MySQL (Fly.io)   │
              │  augur-ms-db      │
              │  70+ tables       │
              └───────────────────┘
```

**Deploy:** Push to `main` → GitHub Actions → Fly.io (automatic)

---

## Features

### Public Pages
- **Landing page** — Server info, rates, status indicator, download link
- **Registration** — Create game accounts (bcrypt hashed, Java-compatible)
- **Login** — Admin authentication (JWT, httpOnly cookies)

### Admin Dashboard (auth required)
| Page | Description |
|------|-------------|
| **Dashboard** | Server overview with stat cards and quick actions |
| **Characters** | Browse, search, edit player stats, levels, jobs, inventory |
| **Items** | Full item database with category filtering and sprite previews |
| **Mobs** | Monster database with stats, boss flags, and linked drop tables |
| **Maps** | Map viewer with spawns, portals, footholds. Visual editor with Konva.js |
| **Drops** | Drop table editor — add, remove, inline-edit drop rates |
| **Config** | 450+ server settings: rates, feature flags, channels |
| **Scripts** | NPC, event, portal, quest script editor with CodeMirror |
| **Game Master** | AI-powered game management with streaming tool calls |

### AI Game Master
An autonomous AI agent with 40+ tools that can:
- Analyze economy health, player progression, and game balance
- Create dynamic events (boss invasions, bonus drops, treasure hunts)
- Manage drop tables, mob stats, shop prices, server rates
- Track goals across sessions and review past decisions
- Run on a schedule (1h–24h intervals) or on-demand

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Frontend | React 19, Tailwind CSS 4 |
| State | Zustand 5 |
| Auth | JWT (jose), bcrypt |
| Database | MySQL 8.4 (Fly.io) |
| AI | Claude Agent SDK |
| Hosting | Fly.io (IAD region) |
| CI/CD | GitHub Actions |

---

## Development

```bash
npm install
npm run dev
```

Dashboard reads DB config from `../Cosmic/config.yaml` by default. Override with `COSMIC_ROOT=/path/to/Cosmic`.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | prod | MySQL host |
| `DB_PASS` | prod | MySQL password |
| `DB_PORT` | prod | MySQL port (default 3306) |
| `JWT_SECRET` | prod | JWT signing secret |
| `ADMIN_USER` | prod | Admin username |
| `ADMIN_PASS_HASH` | prod | bcrypt hash of admin password |
| `COSMIC_ROOT` | dev | Path to Cosmic server |

All production secrets are managed via GitHub Secrets → Fly.io.

---

## Deployment

Merging to `main` triggers automatic deployment via GitHub Actions:

1. GitHub Actions reads secrets
2. Sets Fly.io secrets via `flyctl secrets set --stage`
3. Builds Docker image (multi-stage, standalone Next.js)
4. Deploys to Fly.io

### Manual deploy
```bash
fly deploy --remote-only
```

---

## License

Private project. Not licensed for redistribution.
