-- Activity metrics + player feedback
-- Run after 001_gm_tables.sql

-- Add active player metrics to gm_snapshots
ALTER TABLE gm_snapshots
  ADD COLUMN active_characters_24h INT DEFAULT 0 AFTER total_online,
  ADD COLUMN active_characters_7d INT DEFAULT 0 AFTER active_characters_24h,
  ADD COLUMN active_accounts_24h INT DEFAULT 0 AFTER active_characters_7d,
  ADD COLUMN active_accounts_7d INT DEFAULT 0 AFTER active_accounts_24h;

-- Player feedback table (for @feedback in-game command)
CREATE TABLE IF NOT EXISTS player_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  character_name VARCHAR(13) NOT NULL,
  character_id INT NOT NULL,
  account_id INT NOT NULL,
  rating ENUM('positive', 'negative', 'suggestion') NOT NULL,
  message TEXT NOT NULL,
  character_level INT DEFAULT 0,
  character_map INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_by_gm TINYINT DEFAULT 0,
  INDEX (created_at),
  INDEX (read_by_gm)
);
