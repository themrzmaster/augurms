-- AugurMS GM Tables
-- These tables are used by the dashboard's Game Master AI system.
-- They are NOT managed by Cosmic's Liquibase — run manually or via dashboard startup.

CREATE TABLE IF NOT EXISTS gm_sessions (
  id VARCHAR(36) PRIMARY KEY,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  trigger_type VARCHAR(50),
  prompt TEXT,
  summary TEXT,
  status VARCHAR(20) DEFAULT 'running',
  changes_made INT DEFAULT 0,
  full_log LONGTEXT
);

CREATE TABLE IF NOT EXISTS gm_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36),
  tool_name VARCHAR(100),
  tool_input TEXT,
  tool_result TEXT,
  reasoning TEXT,
  category VARCHAR(50),
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES gm_sessions(id)
);

CREATE TABLE IF NOT EXISTS gm_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  goal TEXT NOT NULL,
  target_metric VARCHAR(100),
  target_value DECIMAL(10,2),
  current_value DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_checked DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gm_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_accounts INT DEFAULT 0,
  total_characters INT DEFAULT 0,
  total_online INT DEFAULT 0,
  avg_level DECIMAL(10,2) DEFAULT 0,
  total_meso BIGINT DEFAULT 0,
  total_drop_entries INT DEFAULT 0,
  total_shop_items INT DEFAULT 0,
  top_maps TEXT,
  top_mobs TEXT,
  economy_health VARCHAR(20),
  notes TEXT,
  avg_meso_per_player BIGINT DEFAULT 0,
  storage_meso BIGINT DEFAULT 0,
  total_items INT DEFAULT 0,
  max_level INT DEFAULT 0,
  level_distribution TEXT,
  job_distribution TEXT,
  new_accounts_7d INT DEFAULT 0,
  boss_kills_today INT DEFAULT 0,
  exp_rate INT DEFAULT 1,
  meso_rate INT DEFAULT 1,
  drop_rate INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gm_schedule (
  id INT PRIMARY KEY DEFAULT 1,
  enabled TINYINT DEFAULT 0,
  interval_hours INT DEFAULT 6,
  prompt TEXT,
  last_run DATETIME,
  next_run DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default schedule row
INSERT IGNORE INTO gm_schedule (id, enabled, interval_hours, prompt)
VALUES (1, 0, 6, 'Review server health and make adjustments as needed.');

-- Persistent reactor spawns (loaded by game server on map init, like plife for mobs/NPCs)
CREATE TABLE IF NOT EXISTS preactor (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  world INT NOT NULL DEFAULT 0,
  map INT NOT NULL,
  rid INT NOT NULL COMMENT 'Reactor template ID from Reactor.wz',
  x INT NOT NULL DEFAULT 0,
  y INT NOT NULL DEFAULT 0,
  f INT NOT NULL DEFAULT 0 COMMENT 'Facing direction',
  reactor_time INT NOT NULL DEFAULT -1 COMMENT 'Respawn delay in seconds (-1 = no respawn)',
  name VARCHAR(100) DEFAULT '',
  INDEX (map, world)
);
