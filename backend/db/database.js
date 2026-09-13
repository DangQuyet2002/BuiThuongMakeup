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

  ensureInitialData();
}

export function ensureInitialData() {
  const count = db.prepare('SELECT COUNT(*) c FROM services').get().c;
  if (count > 0) return;

  const defaultServices = [
    {
      name: 'Makeup dự tiệc', slug: 'du-tiec', duration: 60, price: 650000, featured: 0,
      tag: null, time_label: '60 phút · 1 người',
      description: 'Trang điểm theo trang phục, giữ nét 8-10 tiếng, chỉnh tóc nhẹ.',
      features: ['Trang điểm theo trang phục', 'Sản phẩm chính hãng, an toàn da', 'Giữ nét từ 8–10 tiếng', 'Chỉnh tóc nhẹ'],
    },
    {
      name: 'Makeup cô dâu', slug: 'co-dau', duration: 90, price: 2500000, featured: 1,
      tag: 'Được chọn nhiều', time_label: '90 phút · có thử trước',
      description: 'Thử trước ngày cưới, 2 lần dặm trong ngày, làm tóc và phụ kiện.',
      features: ['Thử makeup trước ngày cưới', '2 lần đổi dặm trong ngày', 'Làm tóc + phụ kiện', 'Hỗ trợ tại studio hoặc tận nơi'],
    },
    {
      name: 'Chụp ảnh', slug: 'chup-anh', duration: 75, price: 800000, featured: 0,
      tag: null, time_label: '75 phút · 1 người',
      description: 'Tông makeup lên hình đẹp, phù hợp chụp studio hoặc ngoại cảnh.',
      features: ['Tông lên hình đẹp', 'Hợp studio lẫn ngoại cảnh', 'Chỉnh nét theo ánh sáng', 'Hỗ trợ đổi tông 1 lần'],
    },
    {
      name: 'Học makeup cá nhân', slug: 'hoc-makeup', duration: 120, price: 3200000, featured: 0,
      tag: null, time_label: '1 kèm 1 · 4 buổi',
      description: 'Lộ trình 1 kèm 1 trong 4 buổi, thực hành trên chính bạn.',
      features: ['Lộ trình riêng theo khuôn mặt', 'Thực hành trên chính bạn', 'Tư vấn sản phẩm phù hợp', 'Giáo trình mang về'],
    },
  ];

  const defaultAddons = [
    { name: 'Làm tóc', note: 'Uốn / tết / xịt giữ nếp', price: 150000 },
    { name: 'Mi giả', note: 'Loại mềm, dán tự nhiên', price: 80000 },
    { name: 'Đi tận nơi', note: 'Trong nội thành TP.HCM', price: 100000 },
    { name: 'Trang điểm nam', note: 'Tông tự nhiên, che khuyết điểm', price: 120000 },
  ];

  const defaultCombos = [
    {
      name: 'Combo Đôi', slug: 'doi', old_price: 1300000, price: 1170000, featured: 0,
      tag: null,
      description: '2 người makeup dự tiệc, làm tóc nhẹ cho cả hai.',
      features: ['2 người makeup dự tiệc', 'Làm tóc nhẹ cho cả hai', '1 chuyên viên phụ trách', 'Tiết kiệm so với đặt lẻ'],
    },
    {
      name: 'Combo Cô dâu trọn gói', slug: 'co-dau-tron-goi', old_price: 5400000, price: 4550000, featured: 1,
      tag: 'Tiết kiệm nhất',
      description: 'Cô dâu + mẹ + 2 phù dâu, thử trước, dặm lại cả ngày, hỗ trợ tận nơi.',
      features: ['Cô dâu + mẹ + 2 phù dâu', 'Thử makeup trước ngày cưới', 'Dặm lại trong suốt ngày cưới', 'Hỗ trợ tận nơi miễn phí nội thành'],
    },
    {
      name: 'Combo Nhóm bạn', slug: 'nhom-ban', old_price: 2600000, price: 2280000, featured: 0,
      tag: null,
      description: '4 người chụp ảnh hoặc dự tiệc, tông makeup đồng bộ.',
      features: ['4 người chụp ảnh / dự tiệc', 'Tông makeup đồng bộ', '1 chuyên viên phụ trách riêng'],
    },
  ];

  const defaultArtists = [
    { name: 'Ngọc Trâm', initials: 'NT', specialty: 'Cô dâu · tông Hàn Quốc', years: 9 },
    { name: 'Minh Thư',  initials: 'MT', specialty: 'Dự tiệc · tông Tây', years: 7 },
    { name: 'Hà My',     initials: 'HM', specialty: 'Chụp ảnh · tông tự nhiên', years: 5 },
    { name: 'Bảo Ngọc',  initials: 'BN', specialty: 'Học viên · makeup cơ bản', years: 4 },
  ];

  db.transaction(() => {
    const insSvc = db.prepare(`
      INSERT INTO services (name,slug,description,duration,price,featured,tag,time_label,features,sort_order)
      VALUES (@name,@slug,@description,@duration,@price,@featured,@tag,@time_label,@features,@sort_order)
    `);
    defaultServices.forEach((s, i) => insSvc.run({ ...s, features: JSON.stringify(s.features || []), sort_order: i + 1 }));

    const insAdd = db.prepare('INSERT INTO addons (name,note,price,sort_order) VALUES (@name,@note,@price,@sort_order)');
    defaultAddons.forEach((a, i) => insAdd.run({ ...a, sort_order: i + 1 }));

    const insCombo = db.prepare(`
      INSERT INTO combos (name,slug,description,old_price,price,featured,tag,features,sort_order)
      VALUES (@name,@slug,@description,@old_price,@price,@featured,@tag,@features,@sort_order)
    `);
    defaultCombos.forEach((c, i) => insCombo.run({ ...c, features: JSON.stringify(c.features || []), sort_order: i + 1 }));

    const insArt = db.prepare('INSERT INTO artists (name,initials,specialty,years,sort_order) VALUES (@name,@initials,@specialty,@years,@sort_order)');
    defaultArtists.forEach((a, i) => insArt.run({ ...a, sort_order: i + 1 }));

    const insSetting = db.prepare(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    insSetting.run('bank_id', 'MB');
    insSetting.run('bank_account', '0988776655');
    insSetting.run('bank_account_name', 'BUI THI THUONG');
    insSetting.run('deposit_type', 'fixed');
    insSetting.run('deposit_value', '200000');
    insSetting.run('zalo_phone', '0988776655');
  })();
}

initSchema();

