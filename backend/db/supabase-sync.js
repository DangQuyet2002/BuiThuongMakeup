import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { db } from './database.js';
import { logger } from '../src/logger.js';
import { UPLOADS_DIR } from '../src/uploads.js';

const { Pool } = pg;

export const SUPABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || 'postgresql://postgres.dkrvlkbyieihzywghlpo:%40Quyet23042002@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

let pool = null;

export function getSupabasePool() {
  if (!pool && SUPABASE_URL) {
    pool = new Pool({
      connectionString: SUPABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });
    pool.on('error', (err) => {
      logger.warn({ error: err.message }, '[Supabase] Pool error, will retry on next query');
    });
  }
  return pool;
}

/**
 * Kéo dữ liệu từ Supabase về SQLite khi khởi động server
 */
export async function pullFromSupabase() {
  const p = getSupabasePool();
  if (!p) return;

  try {
    const client = await p.connect();
    try {
      console.log('[Supabase] Đang đồng bộ dữ liệu từ Cloud về máy chủ...');
      db.pragma('foreign_keys = OFF');

      // 1. SERVICES
      const services = await client.query('SELECT * FROM services ORDER BY sort_order, id');
      if (services.rows.length > 0) {
        db.transaction(() => {
          db.prepare('DELETE FROM services').run();
          const ins = db.prepare(`
            INSERT INTO services (id, name, slug, description, duration, price, featured, active, tag, time_label, features, sort_order)
            VALUES (@id, @name, @slug, @description, @duration, @price, @featured, @active, @tag, @time_label, @features, @sort_order)
          `);
          services.rows.forEach(r => ins.run({
            ...r,
            features: typeof r.features === 'string' ? r.features : JSON.stringify(r.features || []),
          }));
        })();
      }

      // 2. ADDONS
      const addons = await client.query('SELECT * FROM addons ORDER BY sort_order, id');
      if (addons.rows.length > 0) {
        db.transaction(() => {
          db.prepare('DELETE FROM addons').run();
          const ins = db.prepare('INSERT INTO addons (id, name, note, price, active, sort_order) VALUES (@id, @name, @note, @price, @active, @sort_order)');
          addons.rows.forEach(r => ins.run(r));
        })();
      }

      // 3. COMBOS
      const combos = await client.query('SELECT * FROM combos ORDER BY sort_order, id');
      if (combos.rows.length > 0) {
        db.transaction(() => {
          db.prepare('DELETE FROM combos').run();
          const ins = db.prepare(`
            INSERT INTO combos (id, name, slug, description, old_price, price, featured, active, tag, features, sort_order)
            VALUES (@id, @name, @slug, @description, @old_price, @price, @featured, @active, @tag, @features, @sort_order)
          `);
          combos.rows.forEach(r => ins.run({
            ...r,
            features: typeof r.features === 'string' ? r.features : JSON.stringify(r.features || []),
          }));
        })();
      }

      // 4. ARTISTS
      const artists = await client.query('SELECT * FROM artists ORDER BY sort_order, id');
      if (artists.rows.length > 0) {
        db.transaction(() => {
          db.prepare('DELETE FROM artists').run();
          const ins = db.prepare('INSERT INTO artists (id, name, initials, specialty, years, active, sort_order) VALUES (@id, @name, @initials, @specialty, @years, @active, @sort_order)');
          artists.rows.forEach(r => ins.run(r));
        })();
      }

      // 5. FAQS
      const faqs = await client.query('SELECT * FROM faqs ORDER BY sort_order, id');
      if (faqs.rows.length > 0) {
        db.transaction(() => {
          db.prepare('DELETE FROM faqs').run();
          const ins = db.prepare('INSERT INTO faqs (id, question, answer, sort_order, active) VALUES (@id, @question, @answer, @sort_order, @active)');
          faqs.rows.forEach(r => ins.run(r));
        })();
      }

      // 6. SITE SETTINGS
      const settings = await client.query('SELECT * FROM site_settings');
      if (settings.rows.length > 0) {
        db.transaction(() => {
          const ins = db.prepare(`
            INSERT INTO site_settings (key, value, updated_at)
            VALUES (@key, @value, @updated_at)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
          `);
          settings.rows.forEach(r => ins.run({
            key: r.key,
            value: r.value,
            updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
          }));
        })();
      }

      // 7. USERS
      const users = await client.query('SELECT * FROM users');
      if (users.rows.length > 0) {
        db.transaction(() => {
          db.prepare('DELETE FROM users').run();
          const ins = db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, last_login, must_change)
            VALUES (@id, @username, @display_name, @password_hash, @role, @active, @created_at, @last_login, @must_change)
          `);
          users.rows.forEach(r => ins.run({
            ...r,
            created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
            last_login: r.last_login ? new Date(r.last_login).toISOString() : null,
          }));
        })();
      }

      // 8. BOOKINGS
      const bookings = await client.query('SELECT * FROM bookings ORDER BY id');
      if (bookings.rows.length > 0) {
        db.transaction(() => {
          const ins = db.prepare(`
            INSERT INTO bookings (id, code, service_id, service_name, combo_name, date, time, duration, artist_id, customer, phone, note, addons, total, deposit_amount, deposit_status, status, created_at)
            VALUES (@id, @code, @service_id, @service_name, @combo_name, @date, @time, @duration, @artist_id, @customer, @phone, @note, @addons, @total, @deposit_amount, @deposit_status, @status, @created_at)
            ON CONFLICT(code) DO UPDATE SET
              status = excluded.status,
              deposit_status = excluded.deposit_status,
              deposit_amount = excluded.deposit_amount,
              total = excluded.total,
              note = excluded.note
          `);
          bookings.rows.forEach(r => ins.run({
            ...r,
            created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          }));
        })();
      }

      // 9. GALLERY
      const gallery = await client.query('SELECT * FROM gallery ORDER BY sort_order, id');
      if (gallery.rows.length > 0) {
        db.transaction(() => {
          db.prepare('DELETE FROM gallery').run();
          const ins = db.prepare(`
            INSERT INTO gallery (id, title, category, kind, image_path, before_image, after_image, alt_text, sort_order, active, created_at)
            VALUES (@id, @title, @category, @kind, @image_path, @before_image, @after_image, @alt_text, @sort_order, @active, @created_at)
          `);
          gallery.rows.forEach(r => ins.run({
            ...r,
            created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          }));
        })();
      }

      // 10. UPLOADED FILES (khôi phục ảnh đĩa từ Cloud)
      try {
        const files = await client.query('SELECT filename, data FROM uploaded_files');
        if (files.rows.length > 0) {
          for (const f of files.rows) {
            if (f.data) {
              const full = join(UPLOADS_DIR, f.filename);
              if (!existsSync(full)) {
                writeFileSync(full, f.data);
              }
            }
          }
        }
      } catch (fErr) {
        logger.warn({ error: fErr.message }, '[Supabase] Không thể khôi phục ảnh từ Cloud');
      }

      db.pragma('foreign_keys = ON');

      console.log(`[Supabase] ✅ Đồng bộ thành công! (${bookings.rows.length} đơn, ${services.rows.length} dịch vụ, ${users.rows.length} tài khoản)`);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Supabase] ⚠️ Không thể tải dữ liệu từ Cloud:', err.message);
  }
}

/**
 * Đẩy toàn bộ dữ liệu hiện tại lên Supabase Cloud để lưu vĩnh viễn
 */
export async function pushAllToSupabase() {
  const p = getSupabasePool();
  if (!p) return;

  try {
    const client = await p.connect();
    try {
      await client.query('BEGIN');

      // 1. SERVICES
      const services = db.prepare('SELECT * FROM services').all();
      if (services.length > 0) {
        await client.query('DELETE FROM services WHERE NOT (id = ANY($1::int[]))', [services.map(s => s.id)]);
      } else {
        await client.query('DELETE FROM services');
      }
      for (const s of services) {
        await client.query(`
          INSERT INTO services (id, name, slug, description, duration, price, featured, active, tag, time_label, features, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            name = excluded.name,
            slug = excluded.slug,
            description = excluded.description,
            duration = excluded.duration,
            price = excluded.price,
            featured = excluded.featured,
            active = excluded.active,
            tag = excluded.tag,
            time_label = excluded.time_label,
            features = excluded.features,
            sort_order = excluded.sort_order
        `, [s.id, s.name, s.slug, s.description, s.duration, s.price, s.featured, s.active, s.tag, s.time_label, s.features, s.sort_order]);
      }

      // 2. ADDONS
      const addons = db.prepare('SELECT * FROM addons').all();
      if (addons.length > 0) {
        await client.query('DELETE FROM addons WHERE NOT (id = ANY($1::int[]))', [addons.map(a => a.id)]);
      } else {
        await client.query('DELETE FROM addons');
      }
      for (const a of addons) {
        await client.query(`
          INSERT INTO addons (id, name, note, price, active, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            name = excluded.name,
            note = excluded.note,
            price = excluded.price,
            active = excluded.active,
            sort_order = excluded.sort_order
        `, [a.id, a.name, a.note, a.price, a.active, a.sort_order]);
      }

      // 3. COMBOS
      const combos = db.prepare('SELECT * FROM combos').all();
      if (combos.length > 0) {
        await client.query('DELETE FROM combos WHERE NOT (id = ANY($1::int[]))', [combos.map(c => c.id)]);
      } else {
        await client.query('DELETE FROM combos');
      }
      for (const c of combos) {
        await client.query(`
          INSERT INTO combos (id, name, slug, description, old_price, price, featured, active, tag, features, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            name = excluded.name,
            slug = excluded.slug,
            description = excluded.description,
            old_price = excluded.old_price,
            price = excluded.price,
            featured = excluded.featured,
            active = excluded.active,
            tag = excluded.tag,
            features = excluded.features,
            sort_order = excluded.sort_order
        `, [c.id, c.name, c.slug, c.description, c.old_price, c.price, c.featured, c.active, c.tag, c.features, c.sort_order]);
      }

      // 4. ARTISTS
      const artists = db.prepare('SELECT * FROM artists').all();
      if (artists.length > 0) {
        await client.query('DELETE FROM artists WHERE NOT (id = ANY($1::int[]))', [artists.map(ar => ar.id)]);
      } else {
        await client.query('DELETE FROM artists');
      }
      for (const ar of artists) {
        await client.query(`
          INSERT INTO artists (id, name, initials, specialty, years, active, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = excluded.name,
            initials = excluded.initials,
            specialty = excluded.specialty,
            years = excluded.years,
            active = excluded.active,
            sort_order = excluded.sort_order
        `, [ar.id, ar.name, ar.initials, ar.specialty, ar.years, ar.active, ar.sort_order]);
      }

      // 5. FAQS
      const faqs = db.prepare('SELECT * FROM faqs').all();
      if (faqs.length > 0) {
        await client.query('DELETE FROM faqs WHERE NOT (id = ANY($1::int[]))', [faqs.map(f => f.id)]);
      } else {
        await client.query('DELETE FROM faqs');
      }
      for (const f of faqs) {
        await client.query(`
          INSERT INTO faqs (id, question, answer, sort_order, active)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            question = excluded.question,
            answer = excluded.answer,
            sort_order = excluded.sort_order,
            active = excluded.active
        `, [f.id, f.question, f.answer, f.sort_order, f.active]);
      }

      // 6. SITE SETTINGS
      const settings = db.prepare('SELECT * FROM site_settings').all();
      for (const st of settings) {
        await client.query(`
          INSERT INTO site_settings (key, value, updated_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        `, [st.key, st.value]);
      }

      // 7. USERS
      const users = db.prepare('SELECT * FROM users').all();
      if (users.length > 0) {
        await client.query('DELETE FROM users WHERE NOT (id = ANY($1::int[]))', [users.map(u => u.id)]);
      }
      for (const u of users) {
        await client.query(`
          INSERT INTO users (id, username, display_name, password_hash, role, active, must_change)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            username = excluded.username,
            display_name = excluded.display_name,
            password_hash = excluded.password_hash,
            role = excluded.role,
            active = excluded.active,
            must_change = excluded.must_change
        `, [u.id, u.username, u.display_name, u.password_hash, u.role, u.active, u.must_change]);
      }

      // 8. BOOKINGS
      const bookings = db.prepare('SELECT * FROM bookings').all();
      for (const b of bookings) {
        await client.query(`
          INSERT INTO bookings (id, code, service_id, service_name, combo_name, date, time, duration, artist_id, customer, phone, note, addons, total, deposit_amount, deposit_status, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (code) DO UPDATE SET
            status = excluded.status,
            deposit_status = excluded.deposit_status,
            deposit_amount = excluded.deposit_amount,
            total = excluded.total,
            note = excluded.note
        `, [b.id, b.code, b.service_id, b.service_name, b.combo_name, b.date, b.time, b.duration, b.artist_id, b.customer, b.phone, b.note, b.addons, b.total, b.deposit_amount, b.deposit_status, b.status]);
      }

      // 9. GALLERY
      const gallery = db.prepare('SELECT * FROM gallery').all();
      if (gallery.length > 0) {
        await client.query('DELETE FROM gallery WHERE NOT (id = ANY($1::int[]))', [gallery.map(g => g.id)]);
      } else {
        await client.query('DELETE FROM gallery');
      }
      for (const g of gallery) {
        await client.query(`
          INSERT INTO gallery (id, title, category, kind, image_path, before_image, after_image, alt_text, sort_order, active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            title = excluded.title,
            category = excluded.category,
            kind = excluded.kind,
            image_path = excluded.image_path,
            before_image = excluded.before_image,
            after_image = excluded.after_image,
            alt_text = excluded.alt_text,
            sort_order = excluded.sort_order,
            active = excluded.active
        `, [g.id, g.title, g.category, g.kind, g.image_path, g.before_image, g.after_image, g.alt_text, g.sort_order, g.active]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn({ error: err.message }, '[Supabase] Background sync failed, will retry');
  }
}

/**
 * Hook đồng bộ tức thì sau khi có thay đổi quan trọng
 */
export function triggerSyncToSupabase() {
  setImmediate(() => {
    pushAllToSupabase().catch(e => {
      logger.warn({ error: e.message }, '[Supabase] Immediate sync error');
    });
  });
}
