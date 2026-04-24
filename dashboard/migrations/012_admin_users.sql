-- Admin Users table
-- DB-backed dashboard logins. The env-var admin (ADMIN_USER + ADMIN_PASS_HASH)
-- continues to work as a bootstrap fallback so the dashboard is never locked
-- out if the table is empty or unreachable.

CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'admin',
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);
