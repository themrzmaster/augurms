-- AI-generated items created by the GM cron.
-- The pipeline (POST /api/admin/items/generate) writes one row per attempt so
-- the GM can recall what it has made, critique it, and decide whether to
-- publish it into the live game.

CREATE TABLE IF NOT EXISTS gm_generated_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNIQUE COMMENT 'Matches custom_items.item_id once the row reaches ready/published status',
  session_id VARCHAR(36) COMMENT 'gm_sessions.id — which cron run produced this item',
  description TEXT NOT NULL COMMENT 'Original text prompt the GM generated the item from',
  name VARCHAR(255),
  item_type VARCHAR(32) NOT NULL DEFAULT 'weapon',
  weapon_type VARCHAR(32),
  concept_image_url TEXT COMMENT 'R2 URL of the Flux/Gemini-generated concept image',
  glb_url TEXT COMMENT 'R2 URL of the Tripo3D-generated GLB (or Tripo signed URL if R2 is not configured)',
  tripo_task_id VARCHAR(128),
  cost_usd DECIMAL(6,4) DEFAULT 0 COMMENT 'Best-effort spend tracking for Flux + Tripo',
  stats JSON,
  requirements JSON,
  status ENUM('pending','rendering','ready','published','failed','rejected') NOT NULL DEFAULT 'pending',
  error TEXT,
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_session (session_id),
  INDEX idx_created (created_at)
);
