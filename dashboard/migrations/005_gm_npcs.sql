-- Dynamic NPC system for the AI Game Master.
-- Each row defines a custom NPC behavior that the universal script (9977777.js) reads at runtime.
-- No server restart needed when changing config — script re-reads DB on each player interaction.

CREATE TABLE IF NOT EXISTS gm_npcs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  npc_id INT NOT NULL COMMENT 'NPC ID used on map (references plife/WZ)',
  name VARCHAR(100) NOT NULL COMMENT 'Display name shown in dialogue',
  type ENUM('exchange', 'dialogue', 'teleporter') NOT NULL,
  config JSON NOT NULL COMMENT 'Type-specific config (items, prices, dialogue, etc.)',
  enabled TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (npc_id)
);

-- Example configs by type:
--
-- exchange: {
--   "currency": "votepoints",        -- "votepoints" or "meso" or item ID (e.g. 4001126)
--   "currency_name": "Vote Points",
--   "greeting": "Welcome to the Vote Shop!",
--   "items": [
--     {"itemId": 2049100, "price": 3, "name": "Chaos Scroll", "quantity": 1},
--     {"itemId": 2340000, "price": 5, "name": "White Scroll", "quantity": 1}
--   ]
-- }
--
-- dialogue: {
--   "pages": ["First page of text.", "Second page."],
--   "style": "ok" | "next"
-- }
--
-- teleporter: {
--   "greeting": "Where would you like to go?",
--   "destinations": [
--     {"mapId": 100000000, "name": "Henesys", "cost": 0},
--     {"mapId": 101000000, "name": "Ellinia", "cost": 5000}
--   ]
-- }
