CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'pending',
  last_checked DATETIME,
  response_time INTEGER,
  notifications_enabled BOOLEAN DEFAULT 1,
  last_notification_sent DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS monitor_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  response_time INTEGER,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  error_message TEXT,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN DEFAULT 0,
  error_message TEXT,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id)
);

-- For testing email content
CREATE TABLE IF NOT EXISTS email_content_test (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
