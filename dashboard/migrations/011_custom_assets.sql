-- Custom Assets table
-- Hair / face .img files imported from higher MapleStory versions, injected
-- into Character.wz at publish time. The .img bytes themselves live in R2 under
-- the `assets/` prefix; this table is the index + metadata.

CREATE TABLE IF NOT EXISTS custom_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_type ENUM('hair', 'face') NOT NULL,
  in_game_id INT NOT NULL,
  name VARCHAR(255),
  source_version VARCHAR(50),
  file_key VARCHAR(500) NOT NULL,
  file_hash VARCHAR(64),
  file_size INT,
  preview_url VARCHAR(500),
  status ENUM('ready', 'published', 'rejected') NOT NULL DEFAULT 'ready',
  notes TEXT,
  uploaded_by VARCHAR(100),
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME,
  UNIQUE KEY uk_type_id (asset_type, in_game_id)
);
