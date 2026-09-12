import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'moc-studio.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Thêm cột vào bảng cũ mà không làm mất dữ liệu.
// SQLite không có "ADD COLUMN IF NOT EXISTS" nên phải tự kiểm tra.
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition}`);
  }
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      slug        TEXT    NOT NULL UNIQUE,
      description TEXT,
      duration    INTEGER NOT NULL,
      price       INTEGER NOT NULL,
      featured    INTEGER NOT NULL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS addons (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT    NOT NULL,
      note     TEXT,
      price    INTEGER NOT NULL,
      active   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS combos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      slug        TEXT    NOT NULL UNIQUE,
      description TEXT,
      old_price   INTEGER NOT NULL,
      price       INTEGER NOT NULL,
      featured    INTEGER NOT NULL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS artists (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      initials  TEXT    NOT NULL,
      specialty TEXT,
      years     INTEGER NOT NULL DEFAULT 0,
      active    INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT    NOT NULL UNIQUE,
      service_id   INTEGER,
      service_name TEXT    NOT NULL,
      combo_name   TEXT,
      date         TEXT    NOT NULL,
      time         TEXT    NOT NULL,
      duration     INTEGER NOT NULL DEFAULT 60,
      artist_id    INTEGER,
      customer     TEXT    NOT NULL,
      phone        TEXT    NOT NULL,
      note         TEXT,
      addons       TEXT,
      total        INTEGER NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'pending',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (artist_id)  REFERENCES artists(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone);

    CREATE TABLE IF NOT EXISTS blocked_slots (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      date    TEXT NOT NULL,
      time    TEXT NOT NULL,
      reason  TEXT,
      UNIQUE(date, time)
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id  INTEGER NOT NULL,
      booking_code TEXT   NOT NULL,
      type        TEXT   NOT NULL,
      phone       TEXT   NOT NULL,
      status      TEXT   NOT NULL,
      provider    TEXT,
      message_id  TEXT,
      error       TEXT,
      detail      TEXT,
      attempts    INTEGER DEFAULT 1,
      created_at  TEXT   NOT NULL DEFAULT (datetime('now','localtime')),
      sent_at     TEXT,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notif_booking ON notification_log(booking_id);
    CREATE INDEX IF NOT EXISTS idx_notif_status ON notification_log(status);
    CREATE INDEX IF NOT EXISTS idx_notif_type ON notification_log(type);

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      display_name  TEXT,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'staff',
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      last_login    TEXT,
      must_change   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash  TEXT    NOT NULL UNIQUE,
      user_id     INTEGER NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      expires_at  TEXT    NOT NULL,
      last_seen   TEXT,
      ip          TEXT,
      user_agent  TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket_key  TEXT    PRIMARY KEY,
      count       INTEGER NOT NULL DEFAULT 0,
      reset_at    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ratelimit_reset ON rate_limits(reset_at);

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER,
      username    TEXT,
      action      TEXT NOT NULL,
      target      TEXT,
      detail      TEXT,
      ip          TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

    CREATE TABLE IF NOT EXISTS gallery (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      category    TEXT,
      -- Thư viện chỉ có một loại: so sánh trước/sau.
      -- image_path giữ lại cho tương thích dữ liệu cũ, không dùng nữa.
      kind        TEXT    NOT NULL DEFAULT 'compare',
      image_path  TEXT,
      before_image TEXT,
      after_image TEXT,
      alt_text    TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_gallery_sort ON gallery(sort_order);
    CREATE INDEX IF NOT EXISTS idx_gallery_active ON gallery(active);

    -- Nội dung trang chủ do quản trị viên chỉnh (ảnh đầu trang, ...).
    -- Lưu dạng khóa – giá trị để thêm trường mới không cần đổi cấu trúc bảng.
    CREATE TABLE IF NOT EXISTS site_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // ---- migration: bổ sung cột cho nội dung hiển thị trên landing page ----
  addColumnIfMissing('services', 'tag', 'TEXT');
  addColumnIfMissing('services', 'time_label', 'TEXT');
  addColumnIfMissing('services', 'features', 'TEXT');
  addColumnIfMissing('services', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');

  addColumnIfMissing('addons', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');

  addColumnIfMissing('combos', 'tag', 'TEXT');
  addColumnIfMissing('combos', 'features', 'TEXT');
  addColumnIfMissing('combos', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');

  addColumnIfMissing('artists', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');

  addColumnIfMissing('bookings', 'deposit_amount', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('bookings', 'deposit_status', "TEXT NOT NULL DEFAULT 'unpaid'");
}

initSchema();
