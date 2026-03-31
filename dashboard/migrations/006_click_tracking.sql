-- Click tracking for banner/referral links
-- Run after 005_gm_npcs.sql

CREATE TABLE IF NOT EXISTS click_tracking (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ref VARCHAR(64) NOT NULL,          -- source tag, e.g. "ragezone", "gtop100"
  ip VARCHAR(45) DEFAULT NULL,       -- visitor IP (v4 or v6)
  user_agent VARCHAR(512) DEFAULT NULL,
  clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ref (ref),
  INDEX idx_clicked_at (clicked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
