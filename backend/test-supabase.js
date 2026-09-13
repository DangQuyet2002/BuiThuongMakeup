import pg from 'pg';

const { Pool } = pg;

// Try with %40 (encoded @)
const url1 = 'postgresql://postgres.dkrvlkbyieihzywghlpo:%40Quyet23042002@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
// Try with direct Quyet23042002
const url2 = 'postgresql://postgres.dkrvlkbyieihzywghlpo:Quyet23042002@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
// Try direct 5432
const url3 = 'postgresql://postgres.dkrvlkbyieihzywghlpo:%40Quyet23042002@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function test(url, label) {
  console.log('Testing', label);
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  try {
    const res = await pool.query('SELECT NOW() as now, version() as ver');
    console.log('SUCCESS:', label, res.rows[0]);
    await pool.end();
    return true;
  } catch (err) {
    console.error('FAILED:', label, err.message);
    await pool.end();
    return false;
  }
}

async function run() {
  const ok1 = await test(url1, 'Pooler 6543 with %40');
  if (!ok1) {
    const ok2 = await test(url2, 'Pooler 6543 without @');
    if (!ok2) {
      await test(url3, 'Direct 5432 with %40');
    }
  }
}

run();
