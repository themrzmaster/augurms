# Cosmic Dashboard

Admin panel and AI Game Master for **Cosmic** — a MapleStory v83 private server built on HeavenMS.

Manage characters, items, mobs, maps, drop tables, scripts, server config, and let an AI autonomously tune and run events for your game.

![Next.js 15](https://img.shields.io/badge/Next.js-15-black) ![React 19](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6) ![Claude Agent SDK](https://img.shields.io/badge/Claude-Agent%20SDK-orange)

---

## Features

### Dashboard Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Server overview with stat cards and quick actions |
| **Characters** | Browse, search, and edit player stats, levels, jobs, inventory |
| **Items** | Full item database with category filtering and sprite previews |
| **Mobs** | Monster database with stats, boss flags, and linked drop tables |
| **Maps** | Map viewer with spawns, portals, footholds. Visual editor with Konva.js |
| **Drops** | Drop table editor — add, remove, and **inline-edit** drop rates and quantities |
| **Config** | 450+ server settings: rates, feature flags, login, channels, all editable |
| **Scripts** | NPC, event, portal, quest, map, and reactor script editor with CodeMirror |
| **Game Master** | AI-powered game management with streaming tool calls and reasoning |

### AI Game Master

The Game Master is an autonomous AI agent that can analyze your game, create events, balance the economy, and manage content — all through natural language.

**How it works:**
1. You type a prompt (or the AI runs on a schedule)
2. The AI receives a system prompt with game design principles, balance targets, and guardrails
3. It calls 40+ tools to read game state, analyze trends, and take actions
4. Every tool call, reasoning step, and result streams live to the dashboard
5. All sessions, actions, and decisions are persisted to the database

**What the AI can do:**
- Analyze economy health (meso circulation, inflation tracking, item saturation)
- Monitor player progression (level distribution, job balance, EXP curves)
- Create dynamic events (spawn boss invasions, add bonus drops, treasure hunts)
- Manage drop tables, mob stats, shop prices, server rates
- Set server announcements
- Track goals across sessions ("reduce meso inflation to <5%/day")
- Review its own history to see if past changes had the intended effect

**Philosophy — content over numbers:**
The AI is designed as a **game director**, not an optimizer. It prioritizes creating events and engaging content over tweaking rates. Rate and stat changes are rare and conservative. The AI checks trends across multiple snapshots before intervening, and doing nothing is always a valid choice.

**Autonomous mode:**
- Toggle auto-tuning from the dashboard (1h to 24h intervals)
- External cron hits `GET /api/gm/cron/check` to trigger scheduled runs
- Circuit breaker: 3 consecutive errors disable auto-tuning
- Concurrent run protection: only one session at a time

**Persistent memory (Butler's Notebook pattern):**
- `gm_snapshots` — periodic game state captures with trend deltas
- `gm_actions` — every write action with reasoning and category
- `gm_sessions` — full session logs with prompt, summary, status
- `gm_goals` — persistent objectives tracked across sessions

The AI sees its last 5 snapshots, recent actions, active goals, and session history injected into its system prompt every run — so it picks up where it left off.

### 40+ API Tools

The AI has access to these tools via the Claude Agent SDK with in-process MCP:

| Category | Tools |
|----------|-------|
| **Analytics** | Game analytics (economy, progression, activity, health) |
| **Characters** | Search, get, update stats, give items |
| **Mobs** | Search, get, update stats, batch update (up to 50) |
| **Items** | Search, get details |
| **Drops** | Get drop table, add/remove drops, batch update (up to 100 ops) |
| **Maps** | Search, get map data, add/remove spawns |
| **Shops** | Get items, add/update/remove shop inventory |
| **Rates** | Get/update server rates (EXP, meso, drop, boss, quest) |
| **Config** | Get full config, update by dot-path |
| **Events** | Create events (mob spawns + bonus drops), list, cleanup |
| **Server** | Status, logs, announcements |
| **Memory** | Take snapshots, get trends, view history, manage goals |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Next.js 15 App Router              │
│                                                 │
│  Pages (React 19)    API Routes    GM Engine    │
│  ├─ /dashboard       ├─ /api/characters         │
│  ├─ /characters      ├─ /api/mobs               │
│  ├─ /items           ├─ /api/items               │
│  ├─ /mobs            ├─ /api/maps                │
│  ├─ /maps            ├─ /api/drops               │
│  ├─ /drops           ├─ /api/config              │
│  ├─ /config          ├─ /api/scripts             │
│  ├─ /scripts         ├─ /api/gm/*                │
│  └─ /gamemaster      └─ /api/analytics           │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │ GM Engine (Claude Agent SDK)            │    │
│  │  ├─ In-process MCP server (40+ tools)   │    │
│  │  ├─ System prompt + historical context  │    │
│  │  ├─ Session/action persistence          │    │
│  │  └─ SSE streaming to frontend           │    │
│  └─────────────────────────────────────────┘    │
└─────────────┬───────────────────────────────────┘
              │
    ┌─────────┴─────────┐         ┌──────────────┐
    │   MySQL (cosmic)  │         │  WZ XML Files │
    │   Port 3307       │         │  Game content │
    │   via Docker      │         │  Mob/Map data │
    └───────────────────┘         └──────────────┘
```

**Key design decisions:**
- **Claude Agent SDK** — Uses Claude Code auth (no API key costs). The AI runs as an in-process MCP server, not a separate subprocess.
- **SSE streaming** — Tool calls, thinking, and text stream live to the browser as they happen.
- **WZ XML parsing** — Mob stats and map data are read/written directly from game content files using regex-based XML parsing.
- **No ORM** — Direct MySQL queries via `mysql2/promise` for full control over the game database.

---

## Prerequisites

- **Node.js 18+**
- **Cosmic / HeavenMS** server installation (the actual MapleStory server)
- **Docker** with the Cosmic MySQL container running on port 3307
- **Claude Code** installed (for the AI Game Master — uses Claude Code subscription auth)

---

## Setup

```bash
# Clone and install
cd cosmic-dashboard
npm install

# The dashboard reads DB config from your Cosmic server's config.yaml
# Default path: ../Cosmic/config.yaml (sibling directory)
# Override with: export COSMIC_ROOT=/path/to/Cosmic

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `COSMIC_ROOT` | `../Cosmic` | Path to your Cosmic server installation |
| `DB_HOST` | From config.yaml | MySQL host override |
| `COSMIC_DASHBOARD_URL` | `http://localhost:3000` | Base URL for internal API calls |

### AI Game Master Requirements

The Game Master AI uses the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), which runs through Claude Code's authentication — no separate API key or token costs needed.

**Required:**
1. **Claude Code** installed and authenticated on the machine running the dashboard
   ```bash
   # Install Claude Code CLI
   npm install -g @anthropic-ai/claude-code

   # Authenticate (opens browser)
   claude login
   ```
2. **Active Claude subscription** (Pro, Team, or Enterprise) on the authenticated account — the Agent SDK uses your Claude Code subscription quota, not pay-per-token API billing
3. **`@anthropic-ai/claude-agent-sdk`** installed (already in `package.json`)

**How it authenticates:**
The Claude Agent SDK detects the Claude Code session on your machine automatically. No API keys, no `.env` secrets, no Anthropic console setup. If `claude login` works, the Game Master works.

**Important note:**
The AI engine sets `CLAUDECODE: ""` in its subprocess environment to avoid a nested session detection error. This is handled automatically in `engine.ts` — no manual configuration needed.

**Without Claude Code:**
If you don't have Claude Code installed, the dashboard still works fully — all pages, APIs, config editing, drop tables, etc. Only the `/gamemaster` page (AI features) requires Claude Code auth.

### GM Memory Tables

To create the tables the AI Game Master needs for persistent memory, run this against your Cosmic MySQL database:

```bash
docker exec cosmic-db-1 mysql -uroot cosmic -e "
CREATE TABLE IF NOT EXISTS gm_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  taken_at DATETIME DEFAULT NOW(),
  total_meso BIGINT, avg_meso_per_player BIGINT, storage_meso BIGINT,
  total_items INT, total_characters INT, avg_level FLOAT, max_level INT,
  level_distribution JSON, job_distribution JSON,
  total_accounts INT, new_accounts_7d INT, boss_kills_today JSON,
  exp_rate INT, meso_rate INT, drop_rate INT
);
CREATE TABLE IF NOT EXISTS gm_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36), executed_at DATETIME DEFAULT NOW(),
  tool_name VARCHAR(100), tool_input JSON, tool_result JSON,
  reasoning TEXT,
  category ENUM('rates','mobs','drops','spawns','shops','events','config','other') DEFAULT 'other'
);
CREATE TABLE IF NOT EXISTS gm_sessions (
  id VARCHAR(36) PRIMARY KEY,
  started_at DATETIME, completed_at DATETIME,
  trigger_type ENUM('manual','scheduled','alert') DEFAULT 'manual',
  prompt TEXT, summary TEXT,
  status ENUM('running','complete','error') DEFAULT 'running',
  changes_made INT DEFAULT 0, full_log JSON
);
CREATE TABLE IF NOT EXISTS gm_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME DEFAULT NOW(),
  goal TEXT, target_metric VARCHAR(100),
  target_value FLOAT, current_value FLOAT,
  status ENUM('active','achieved','abandoned') DEFAULT 'active',
  last_checked DATETIME
);
CREATE TABLE IF NOT EXISTS gm_schedule (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT FALSE,
  interval_hours INT DEFAULT 4,
  last_run DATETIME, next_run DATETIME,
  updated_at DATETIME DEFAULT NOW()
);
INSERT IGNORE INTO gm_schedule (id) VALUES (1);
"
```

### Database

The dashboard connects to the `cosmic` MySQL database that ships with the Cosmic server. No migrations needed for base functionality — the game tables already exist.

For the AI Game Master's persistent memory, 5 tables are created automatically:
- `gm_snapshots`, `gm_actions`, `gm_sessions`, `gm_goals`, `gm_schedule`

### Auto-tuning (optional)

To enable the autonomous GM loop, add a cron job that pings the check endpoint:

```bash
# Every 5 minutes, check if it's time for the GM to run
*/5 * * * * curl -s http://localhost:3000/api/gm/cron/check > /dev/null
```

Then toggle auto-tuning ON from the Game Master page and set your preferred interval.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Frontend | React 19, Tailwind CSS 4 |
| State | Zustand 5 |
| Canvas | Konva.js + react-konva (map editor) |
| Code Editor | CodeMirror (script editor) |
| Database | MySQL 2 (via Docker, port 3307) |
| AI | Claude Agent SDK (Anthropic) |
| Config | YAML parsing (game server config) |
| Sprites | maplestory.io public API (v83) |

---

## Project Structure

```
cosmic-dashboard/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analytics/        # Game analytics (economy, progression, health)
│   │   │   ├── characters/       # Character CRUD + inventory
│   │   │   ├── config/           # Server config read/write
│   │   │   ├── drops/            # Drop table CRUD
│   │   │   ├── gm/              # Game Master system
│   │   │   │   ├── ai/          #   Streaming AI endpoint
│   │   │   │   ├── announce/    #   Server announcements
│   │   │   │   ├── cron/        #   Autonomous loop + check
│   │   │   │   ├── drops-batch/ #   Bulk drop operations
│   │   │   │   ├── event/       #   Dynamic event system
│   │   │   │   ├── goals/       #   Persistent goal tracking
│   │   │   │   ├── history/     #   Session/action history
│   │   │   │   ├── mob-batch/   #   Bulk mob updates
│   │   │   │   ├── rates/       #   Server rate management
│   │   │   │   ├── schedule/    #   Auto-tuning config
│   │   │   │   ├── shops/       #   NPC shop management
│   │   │   │   ├── snapshot/    #   Game state snapshots
│   │   │   │   └── trends/      #   Trend analysis
│   │   │   ├── items/           # Item database
│   │   │   ├── maps/            # Map data + spawn management
│   │   │   ├── mobs/            # Mob database
│   │   │   ├── scripts/         # Script file management
│   │   │   └── server/          # Server status, logs, restart
│   │   ├── characters/          # Character pages
│   │   ├── config/              # Config page
│   │   ├── drops/               # Drop table editor page
│   │   ├── gamemaster/          # AI Game Master page
│   │   ├── items/               # Item pages
│   │   ├── maps/                # Map viewer/editor pages
│   │   ├── mobs/                # Mob pages
│   │   └── scripts/             # Script editor page
│   ├── components/
│   │   ├── map-editor/          # Konva.js map editor suite
│   │   ├── Card.tsx
│   │   ├── ScriptEditor.tsx
│   │   ├── SearchInput.tsx
│   │   ├── ServerControls.tsx
│   │   ├── Sidebar.tsx
│   │   └── SpriteImage.tsx
│   └── lib/
│       ├── cosmic.ts            # Paths, sprites, WZ parsing, job names
│       ├── db.ts                # MySQL connection pool
│       └── gamemaster/
│           ├── engine.ts        # AI engine (tools, prompt, persistence)
│           └── types.ts         # GM type definitions
├── mcp-server/                  # Standalone MCP server (alternative integration)
├── package.json
├── next.config.ts
├── tsconfig.json
└── postcss.config.mjs
```

---

## API Reference

### Analytics
- `GET /api/analytics?section=all|economy|progression|activity|health`

### Characters
- `GET /api/characters?q=name` — Search characters
- `GET /api/characters/[id]` — Character details
- `PUT /api/characters/[id]` — Update stats
- `POST /api/characters/[id]/inventory` — Give item

### Mobs
- `GET /api/mobs?q=name` — Search mobs
- `GET /api/mobs/[id]` — Mob stats
- `PUT /api/mobs/[id]` — Update mob stats
- `PUT /api/gm/mob-batch` — Batch update (max 50)

### Items
- `GET /api/items?q=name&category=equip|consume|etc|cash`
- `GET /api/items/[id]`

### Drops
- `GET /api/drops/[mobId]` — Drop table
- `POST /api/drops/[mobId]` — Add drop
- `PUT /api/drops/[mobId]` — Update drop (chance, quantities)
- `DELETE /api/drops/[mobId]` — Remove drop
- `PUT /api/gm/drops-batch` — Bulk operations (max 100)

### Maps
- `GET /api/maps?q=name`
- `GET /api/maps/[id]` — Map data (spawns, portals, footholds)
- `POST /api/maps/[id]/spawns` — Add spawn
- `DELETE /api/maps/[id]/spawns` — Remove spawn

### Server
- `GET /api/server` — Status
- `POST /api/server` — Restart
- `GET /api/server/logs?lines=100&service=maplestory|db`

### Config
- `GET /api/config` — Full server config
- `PUT /api/config` — Update by dot-path (`{ path: "server.EXP_RATE", value: 5 }`)

### Game Master
- `POST /api/gm/ai` — Stream an AI session (SSE)
- `GET/PUT /api/gm/rates` — Server rates
- `GET/POST/PUT/DELETE /api/gm/shops/[shopId]/items` — Shop management
- `POST /api/gm/announce` — Set server message
- `GET/POST/DELETE /api/gm/event` — Event management
- `GET/POST /api/gm/snapshot` — Game state snapshots
- `GET /api/gm/history` — Past sessions and actions
- `GET/POST/PUT /api/gm/goals` — Goal tracking
- `GET /api/gm/trends?hours=48` — Trend analysis
- `GET/PUT /api/gm/schedule` — Auto-tuning config
- `POST /api/gm/cron` — Trigger autonomous run
- `GET /api/gm/cron/check` — Cron check (for external scheduler)

---

## License

Private project. Not licensed for redistribution.
