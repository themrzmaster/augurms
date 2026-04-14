-- AugurMS Ban Judge Tables
-- AI agent that runs daily, reviews cheat_flags in context, writes verdicts.
-- Verdicts land in ban_verdicts for human review; nothing touches accounts.banned
-- automatically unless auto_apply_threshold is lowered below the verdict confidence.

CREATE TABLE IF NOT EXISTS ban_judge_schedule (
  id INT PRIMARY KEY DEFAULT 1,
  enabled TINYINT DEFAULT 0,
  model VARCHAR(100) DEFAULT 'anthropic/claude-sonnet-4.5',
  daily_hour_utc TINYINT DEFAULT 3,
  auto_apply_threshold TINYINT DEFAULT 101 COMMENT 'confidence 0-100 required to auto-apply a ban verdict; 101 = never',
  lookback_days INT DEFAULT 7 COMMENT 'how far back to pull newly unreviewed flags each run',
  last_run DATETIME,
  next_run DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO ban_judge_schedule (id, enabled, daily_hour_utc)
VALUES (1, 0, 3);

CREATE TABLE IF NOT EXISTS ban_judge_sessions (
  id VARCHAR(36) PRIMARY KEY,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  status VARCHAR(20) DEFAULT 'running',
  model VARCHAR(100),
  summary TEXT,
  accounts_reviewed INT DEFAULT 0,
  verdicts_count INT DEFAULT 0,
  full_log LONGTEXT,
  error TEXT,
  INDEX idx_started (started_at)
);

CREATE TABLE IF NOT EXISTS ban_verdicts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36),
  account_id INT NOT NULL,
  character_id INT,
  character_name VARCHAR(50),
  verdict ENUM('innocent','watch','warn','ban','escalate') NOT NULL,
  confidence TINYINT DEFAULT 0 COMMENT '0-100',
  reasoning TEXT,
  evidence_json JSON,
  flag_ids_considered JSON COMMENT 'cheat_flags ids the agent looked at for this verdict',
  applied TINYINT DEFAULT 0,
  applied_at DATETIME,
  applied_by VARCHAR(100),
  overturned_at DATETIME,
  overturned_by VARCHAR(100),
  overturned_reason TEXT,
  dismissed_at DATETIME,
  dismissed_by VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ban_judge_sessions(id) ON DELETE SET NULL,
  INDEX idx_account (account_id),
  INDEX idx_verdict (verdict),
  INDEX idx_applied (applied),
  INDEX idx_created (created_at)
);

CREATE TABLE IF NOT EXISTS ban_judge_memory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36),
  account_id INT NULL COMMENT 'optional: memory tied to a specific account',
  content TEXT NOT NULL,
  tags JSON COMMENT 'array of string tags e.g. ["watchlist","botting","ellinia"]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL COMMENT 'optional TTL so watchlist notes decay',
  FOREIGN KEY (session_id) REFERENCES ban_judge_sessions(id) ON DELETE SET NULL,
  INDEX idx_account (account_id),
  INDEX idx_created (created_at),
  INDEX idx_expires (expires_at)
);

-- Actions log (every tool call for audit) — mirrors gm_actions
CREATE TABLE IF NOT EXISTS ban_judge_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36),
  tool_name VARCHAR(100),
  tool_input TEXT,
  tool_result LONGTEXT,
  reasoning TEXT,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ban_judge_sessions(id) ON DELETE CASCADE,
  INDEX idx_session (session_id)
);
