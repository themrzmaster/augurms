-- Vote tracking table
-- Prevents double-crediting and tracks vote history

CREATE TABLE IF NOT EXISTS vote_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_name VARCHAR(13) NOT NULL,
  account_id INT,
  site VARCHAR(50) NOT NULL DEFAULT 'gtop100',
  voter_ip VARCHAR(45),
  voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (account_name, site, voted_at)
);
