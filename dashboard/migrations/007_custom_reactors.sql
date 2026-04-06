-- Custom Reactors table
-- Stores user-created reactor definitions for the dashboard reactor builder.

CREATE TABLE IF NOT EXISTS custom_reactors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reactor_id INT NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  event_type INT NOT NULL DEFAULT 0,
  hits_to_break INT NOT NULL DEFAULT 3,
  animation_style VARCHAR(20) NOT NULL DEFAULT 'breakable',
  script_template VARCHAR(30) NOT NULL DEFAULT 'drop_items',
  idle_png_url VARCHAR(500),
  trigger_item_id INT,
  trigger_item_qty INT DEFAULT 1,
  timeout_ms INT,
  hit_delay INT DEFAULT 120,
  break_delay INT DEFAULT 150,
  published TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
