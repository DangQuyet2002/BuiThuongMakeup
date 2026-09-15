import pg from 'pg';

const { Pool } = pg;

export const SUPABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.dkrvlkbyieihzywghlpo:%40Quyet23042002@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

export const pool = new Pool({
  connectionString: SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function initSupabaseSchema() {
  const client = await pool.connect();
  try {
    console.log('Connecting to Supabase PostgreSQL...');
    await client.query('BEGIN');

    // 1. SERVICES
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        slug        VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        duration    INTEGER NOT NULL,
        price       INTEGER NOT NULL,
        featured    INTEGER NOT NULL DEFAULT 0,
        active      INTEGER NOT NULL DEFAULT 1,
        tag         VARCHAR(100),
        time_label  VARCHAR(100),
        features    TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );
    `);

    // 2. ADDONS
    await client.query(`
      CREATE TABLE IF NOT EXISTS addons (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        note       TEXT,
        price      INTEGER NOT NULL,
        active     INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);

    // 3. COMBOS
    await client.query(`
      CREATE TABLE IF NOT EXISTS combos (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        slug        VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        old_price   INTEGER NOT NULL,
        price       INTEGER NOT NULL,
        featured    INTEGER NOT NULL DEFAULT 0,
        active      INTEGER NOT NULL DEFAULT 1,
        tag         VARCHAR(100),
        features    TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );
    `);

    // 4. ARTISTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS artists (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        initials   VARCHAR(20) NOT NULL,
        specialty  TEXT,
        years      INTEGER NOT NULL DEFAULT 0,
        active     INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);

    // 5. BOOKINGS
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id             SERIAL PRIMARY KEY,
        code           VARCHAR(50) NOT NULL UNIQUE,
        service_id     INTEGER REFERENCES services(id) ON DELETE SET NULL,
        service_name   VARCHAR(255) NOT NULL,
        combo_name     VARCHAR(255),
        date           VARCHAR(20) NOT NULL,
        time           VARCHAR(20) NOT NULL,
        duration       INTEGER NOT NULL DEFAULT 60,
        artist_id      INTEGER REFERENCES artists(id) ON DELETE SET NULL,
        customer       VARCHAR(255) NOT NULL,
        phone          VARCHAR(50) NOT NULL,
        note           TEXT,
        addons         TEXT,
        total          INTEGER NOT NULL DEFAULT 0,
        deposit_amount INTEGER NOT NULL DEFAULT 0,
        deposit_status VARCHAR(50) NOT NULL DEFAULT 'unpaid',
        location_type  VARCHAR(50) NOT NULL DEFAULT 'studio',
        address        TEXT,
        status         VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS location_type VARCHAR(50) NOT NULL DEFAULT 'studio';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS address TEXT;
      CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
      CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
      CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone);
    `);

    // 6. BLOCKED SLOTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocked_slots (
        id     SERIAL PRIMARY KEY,
        date   VARCHAR(20) NOT NULL,
        time   VARCHAR(20) NOT NULL,
        reason TEXT,
        UNIQUE(date, time)
      );
    `);

    // 7. USERS
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(100) NOT NULL UNIQUE,
        display_name  VARCHAR(255),
        password_hash TEXT NOT NULL,
        role          VARCHAR(50) NOT NULL DEFAULT 'staff',
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login    TIMESTAMP,
        must_change   INTEGER NOT NULL DEFAULT 0
      );
    `);

    // 8. SESSIONS
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id         SERIAL PRIMARY KEY,
        token_hash VARCHAR(255) NOT NULL UNIQUE,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        last_seen  TIMESTAMP,
        ip         VARCHAR(100),
        user_agent TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `);

    // 9. RATE LIMITS
    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket_key VARCHAR(255) PRIMARY KEY,
        count      INTEGER NOT NULL DEFAULT 0,
        reset_at   BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ratelimit_reset ON rate_limits(reset_at);
    `);

    // 10. AUDIT LOG
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username   VARCHAR(100),
        action     VARCHAR(255) NOT NULL,
        target     TEXT,
        detail     TEXT,
        ip         VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    `);

    // 11. GALLERY
    await client.query(`
      CREATE TABLE IF NOT EXISTS gallery (
        id           SERIAL PRIMARY KEY,
        title        VARCHAR(255) NOT NULL,
        category     VARCHAR(100),
        kind         VARCHAR(50) NOT NULL DEFAULT 'compare',
        image_path   TEXT,
        before_image TEXT,
        after_image  TEXT,
        alt_text     TEXT,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        active       INTEGER NOT NULL DEFAULT 1,
        created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_gallery_sort ON gallery(sort_order);
      CREATE INDEX IF NOT EXISTS idx_gallery_active ON gallery(active);
    `);

    // 12. SITE SETTINGS
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key        VARCHAR(100) PRIMARY KEY,
        value      TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 13. FAQS
    await client.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id         SERIAL PRIMARY KEY,
        question   TEXT NOT NULL,
        answer     TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_faqs_sort ON faqs(sort_order);
    `);

    // 14. NOTIFICATION LOG
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id           SERIAL PRIMARY KEY,
        booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        booking_code VARCHAR(50) NOT NULL,
        type         VARCHAR(50) NOT NULL,
        phone        VARCHAR(50) NOT NULL,
        status       VARCHAR(50) NOT NULL,
        provider     VARCHAR(50),
        message_id   VARCHAR(255),
        error        TEXT,
        detail       TEXT,
        attempts     INTEGER DEFAULT 1,
        created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at      TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_notif_booking ON notification_log(booking_id);
    `);

    // SEED INITIAL DATA IF EMPTY
    const checkServices = await client.query('SELECT COUNT(*) c FROM services');
    if (parseInt(checkServices.rows[0].c, 10) === 0) {
      console.log('Seeding initial services, combos, addons, artists, faqs...');
      const defaultServices = [
        {
          name: 'Makeup dự tiệc', slug: 'du-tiec', duration: 60, price: 650000, featured: 0,
          tag: null, time_label: '60 phút · 1 người',
          description: 'Trang điểm theo trang phục, giữ nét 8-10 tiếng, chỉnh tóc nhẹ.',
          features: JSON.stringify(['Trang điểm theo trang phục', 'Sản phẩm chính hãng, an toàn da', 'Giữ nét từ 8–10 tiếng', 'Chỉnh tóc nhẹ']),
          sort_order: 1,
        },
        {
          name: 'Makeup cô dâu', slug: 'co-dau', duration: 90, price: 2500000, featured: 1,
          tag: 'Được chọn nhiều', time_label: '90 phút · có thử trước',
          description: 'Thử trước ngày cưới, 2 lần dặm trong ngày, làm tóc và phụ kiện.',
          features: JSON.stringify(['Thử makeup trước ngày cưới', '2 lần đổi dặm trong ngày', 'Làm tóc + phụ kiện', 'Hỗ trợ tại studio hoặc tận nơi']),
          sort_order: 2,
        },
        {
          name: 'Chụp ảnh', slug: 'chup-anh', duration: 75, price: 800000, featured: 0,
          tag: null, time_label: '75 phút · 1 người',
          description: 'Tông makeup lên hình đẹp, phù hợp chụp studio hoặc ngoại cảnh.',
          features: JSON.stringify(['Tông lên hình đẹp', 'Hợp studio lẫn ngoại cảnh', 'Chỉnh nét theo ánh sáng', 'Hỗ trợ đổi tông 1 lần']),
          sort_order: 3,
        },
        {
          name: 'Học makeup cá nhân', slug: 'hoc-makeup', duration: 120, price: 3200000, featured: 0,
          tag: null, time_label: '1 kèm 1 · 4 buổi',
          description: 'Lộ trình 1 kèm 1 trong 4 buổi, thực hành trên chính bạn.',
          features: JSON.stringify(['Lộ trình riêng theo khuôn mặt', 'Thực hành trên chính bạn', 'Tư vấn sản phẩm phù hợp', 'Giáo trình mang về']),
          sort_order: 4,
        },
      ];

      for (const s of defaultServices) {
        await client.query(`
          INSERT INTO services (name, slug, description, duration, price, featured, tag, time_label, features, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [s.name, s.slug, s.description, s.duration, s.price, s.featured, s.tag, s.time_label, s.features, s.sort_order]);
      }

      const defaultAddons = [
        { name: 'Làm tóc', note: 'Uốn / tết / xịt giữ nếp', price: 150000, sort_order: 1 },
        { name: 'Mi giả', note: 'Loại mềm, dán tự nhiên', price: 80000, sort_order: 2 },
        { name: 'Đi tận nơi', note: 'Trong nội thành TP.HCM', price: 100000, sort_order: 3 },
        { name: 'Trang điểm nam', note: 'Tông tự nhiên, che khuyết điểm', price: 120000, sort_order: 4 },
      ];
      for (const a of defaultAddons) {
        await client.query('INSERT INTO addons (name, note, price, sort_order) VALUES ($1, $2, $3, $4)', [a.name, a.note, a.price, a.sort_order]);
      }

      const defaultCombos = [
        {
          name: 'Combo Đôi', slug: 'doi', old_price: 1300000, price: 1170000, featured: 0,
          tag: null,
          description: '2 người makeup dự tiệc, làm tóc nhẹ cho cả hai.',
          features: JSON.stringify(['2 người makeup dự tiệc', 'Làm tóc nhẹ cho cả hai', '1 chuyên viên phụ trách', 'Tiết kiệm so với đặt lẻ']),
          sort_order: 1,
        },
        {
          name: 'Combo Cô dâu trọn gói', slug: 'co-dau-tron-goi', old_price: 5400000, price: 4550000, featured: 1,
          tag: 'Tiết kiệm nhất',
          description: 'Cô dâu + mẹ + 2 phù dâu, thử trước, dặm lại cả ngày, hỗ trợ tận nơi.',
          features: JSON.stringify(['Cô dâu + mẹ + 2 phù dâu', 'Thử makeup trước ngày cưới', 'Dặm lại trong suốt ngày cưới', 'Hỗ trợ tận nơi miễn phí nội thành']),
          sort_order: 2,
        },
        {
          name: 'Combo Nhóm bạn', slug: 'nhom-ban', old_price: 2600000, price: 2280000, featured: 0,
          tag: null,
          description: '4 người chụp ảnh hoặc dự tiệc, tông makeup đồng bộ.',
          features: JSON.stringify(['4 người chụp ảnh / dự tiệc', 'Tông makeup đồng bộ', '1 chuyên viên phụ trách riêng']),
          sort_order: 3,
        },
      ];
      for (const c of defaultCombos) {
        await client.query(`
          INSERT INTO combos (name, slug, description, old_price, price, featured, tag, features, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [c.name, c.slug, c.description, c.old_price, c.price, c.featured, c.tag, c.features, c.sort_order]);
      }

      const defaultArtists = [
        { name: 'Ngọc Trâm', initials: 'NT', specialty: 'Cô dâu · tông Hàn Quốc', years: 9, sort_order: 1 },
        { name: 'Minh Thư', initials: 'MT', specialty: 'Dự tiệc · tông Tây', years: 7, sort_order: 2 },
        { name: 'Hà My', initials: 'HM', specialty: 'Chụp ảnh · tông tự nhiên', years: 5, sort_order: 3 },
        { name: 'Bảo Ngọc', initials: 'BN', specialty: 'Học viên · makeup cơ bản', years: 4, sort_order: 4 },
      ];
      for (const ar of defaultArtists) {
        await client.query('INSERT INTO artists (name, initials, specialty, years, sort_order) VALUES ($1, $2, $3, $4, $5)', [ar.name, ar.initials, ar.specialty, ar.years, ar.sort_order]);
      }
    }

    const checkFaqs = await client.query('SELECT COUNT(*) c FROM faqs');
    if (parseInt(checkFaqs.rows[0].c, 10) === 0) {
      const defaultFaqs = [
        {
          question: 'Makeup giữ được bao lâu?',
          answer: 'Trung bình 8–10 tiếng tuỳ loại da và thời tiết. Với gói cô dâu, chuyên viên sẽ dặm lại trong ngày để đảm bảo luôn tươi tắn khi chụp ảnh.',
        },
        {
          question: 'Da mình dễ kích ứng thì sao?',
          answer: 'Bạn nên báo trước khi đặt lịch. Studio dùng sản phẩm chính hãng, có dòng dành riêng cho da nhạy cảm và luôn thử một vùng nhỏ trước khi trang điểm toàn mặt.',
        },
        {
          question: 'Có makeup tận nơi không?',
          answer: 'Có. Với gói cô dâu và các buổi tiệc sáng sớm, chuyên viên có thể đến tận nơi trong nội thành. Phụ phí di chuyển tuỳ khoảng cách, sẽ báo rõ trước khi xác nhận.',
        },
        {
          question: 'Đặt lịch trước bao lâu?',
          answer: 'Nên đặt trước 3–5 ngày. Với makeup cô dâu, bạn nên đặt trước 2–4 tuần để kịp buổi thử và trao đổi phong cách.',
        },
        {
          question: 'Huỷ lịch có mất phí không?',
          answer: 'Huỷ trước 24 giờ hoàn toàn miễn phí. Huỷ trong vòng 24 giờ sẽ tính 30% giá trị gói đã chọn.',
        },
      ];
      for (let i = 0; i < defaultFaqs.length; i++) {
        await client.query('INSERT INTO faqs (question, answer, sort_order, active) VALUES ($1, $2, $3, 1)', [defaultFaqs[i].question, defaultFaqs[i].answer, i + 1]);
      }
    }

    // Default Site Settings
    const defaultSettings = [
      ['bank_id', 'MB'],
      ['bank_account', '0988776655'],
      ['bank_account_name', 'BUI THI THUONG'],
      ['deposit_type', 'fixed'],
      ['deposit_value', '200000'],
      ['zalo_phone', '0988776655'],
      ['stat1_num', '1.200+'],
      ['stat1_label', 'Khách hàng'],
      ['stat2_num', '4.9/5'],
      ['stat2_label', 'Điểm đánh giá'],
      ['stat3_num', '8 năm'],
      ['stat3_label', 'Kinh nghiệm'],
      ['stat4_num', '12'],
      ['stat4_label', 'Chuyên viên makeup'],
      ['studio_address', '128 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP.HCM'],
      ['studio_hours_weekday', 'Thứ 2 – Thứ 7: 8:00 – 20:00'],
      ['studio_hours_sunday', 'Chủ nhật: 9:00 – 17:00'],
      ['studio_phone', '0912 345 678'],
      ['studio_email', 'hello@mocstudio.vn'],
      ['studio_map_note', 'Bản đồ studio · Quận 1, TP.HCM'],
    ];

    for (const [k, v] of defaultSettings) {
      await client.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO NOTHING
      `, [k, v]);
    }

    await client.query('COMMIT');
    console.log('✅ Supabase Schema Initialized & Seeded Successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing Supabase schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.includes('supabase-init.js')) {
  initSupabaseSchema().then(() => pool.end());
}
