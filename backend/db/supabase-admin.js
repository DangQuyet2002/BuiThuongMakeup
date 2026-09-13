import { pool } from './supabase-init.js';
import { hashPassword } from '../src/auth.js';

async function seedAdmin() {
  const client = await pool.connect();
  try {
    const check = await client.query("SELECT COUNT(*) c FROM users WHERE username = 'admin'");
    if (parseInt(check.rows[0].c, 10) === 0) {
      console.log('Creating initial admin user in Supabase...');
      const password = process.env.ADMIN_PASSWORD || 'Admin@2026!Ok';
      const hash = hashPassword(password);
      await client.query(`
        INSERT INTO users (username, display_name, password_hash, role, active)
        VALUES ('admin', 'Chủ studio', $1, 'owner', 1)
      `, [hash]);
      console.log('✅ Admin user created in Supabase: admin / ' + password);
    } else {
      console.log('Admin user already exists in Supabase.');
    }
  } catch (err) {
    console.error('Error seeding admin in Supabase:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedAdmin();
