-- Users and Invite Codes Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE, -- NULL for unused invite codes
    invite_code TEXT NOT NULL UNIQUE,
    remaining_quota INTEGER NOT NULL DEFAULT 0,
    registered_at TEXT,
    last_used_at TEXT,
    passkeys TEXT, -- JSON array
    password_hash TEXT,
    ai_config TEXT, -- JSON: user's own AI resources (encrypted)
    ms_token TEXT, -- JSON: MS Graph API tokens (encrypted)
    ics_subscription_token TEXT,
    user_prompt_config TEXT, -- JSON: fixed fields + free text
    data_source TEXT DEFAULT 'ms', -- 'ms' or 'd1'
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Calendar Events Table (for non-MS users)
CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY, -- UUID
    user_id INTEGER NOT NULL,
    subject TEXT,
    body_content TEXT,
    body_content_type TEXT DEFAULT 'text',
    start_datetime TEXT NOT NULL,
    start_timezone TEXT,
    end_datetime TEXT NOT NULL,
    end_timezone TEXT,
    location TEXT,
    is_all_day INTEGER DEFAULT 0,
    importance TEXT DEFAULT 'normal',
    sensitivity TEXT DEFAULT 'normal',
    is_cancelled INTEGER DEFAULT 0,
    is_reminder_on INTEGER DEFAULT 1,
    reminder_minutes_before INTEGER DEFAULT 15,
    recurrence TEXT, -- JSON for recurrence pattern
    attendees TEXT, -- JSON array
    categories TEXT, -- JSON array
    created_datetime TEXT DEFAULT CURRENT_TIMESTAMP,
    last_modified_datetime TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_calendar_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_invite ON users(invite_code);
