import pg from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres.dkrvlkbyieihzywghlpo:%40Quyet23042002@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function pushToStorageObjects() {
  const client = await pool.connect();
  try {
    // 1. Ensure bucket uploads is public
    await client.query(`
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('uploads', 'uploads', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
      ON CONFLICT (id) DO UPDATE SET public = true;
    `);
    console.log('✅ Bucket "uploads" đã sẵn sàng trên Supabase Storage!');

    // 2. Sync files into storage.objects
    const files = fs.readdirSync('./uploads');
    let count = 0;
    for (const f of files) {
      const full = path.join('./uploads', f);
      if (fs.statSync(full).isFile()) {
        const mime = f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        const stat = fs.statSync(full);
        
        await client.query(`
          INSERT INTO storage.objects (bucket_id, name, owner, metadata, version)
          VALUES ('uploads', $1, NULL, jsonb_build_object('size', $2::bigint, 'mimetype', $3::text), '1')
          ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
        `, [f, stat.size, mime]);
        count++;
      }
    }
    
    const objs = await client.query("SELECT count(*) c FROM storage.objects WHERE bucket_id = 'uploads'");
    console.log(`✅ Đã đồng bộ ${objs.rows[0].c} file vào Supabase Storage Bucket (uploads)!`);
  } finally {
    client.release();
    await pool.end();
  }
}

pushToStorageObjects().catch(console.error);
