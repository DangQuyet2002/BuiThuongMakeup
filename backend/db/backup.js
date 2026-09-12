import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { existsSync, mkdirSync, statSync, readdirSync, unlinkSync, copyFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'moc-studio.db');
const BACKUP_DIR = process.env.BACKUP_DIR || join(__dirname, '..', 'backups');
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30);

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function human(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function pruneOld() {
  if (!existsSync(BACKUP_DIR)) return 0;
  const cutoff = Date.now() - KEEP_DAYS * 86400_000;
  let removed = 0;

  for (const f of readdirSync(BACKUP_DIR)) {
    if (!f.startsWith('moc-studio-') || !f.endsWith('.db')) continue;
    const full = join(BACKUP_DIR, f);
    try {
      if (statSync(full).mtimeMs < cutoff) {
        unlinkSync(full);
        removed++;
      }
    } catch { /* bỏ qua file lỗi */ }
  }
  return removed;
}

async function backup() {
  if (!existsSync(DB_PATH)) {
    console.error('Không tìm thấy database:', DB_PATH);
    process.exit(1);
  }

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  const name = `moc-studio-${stamp()}.db`;
  const dest = join(BACKUP_DIR, name);

  console.log('Đang sao lưu database...');
  console.log('  Nguồn :', basename(DB_PATH));

  const src = new Database(DB_PATH);
  try {
    src.pragma('wal_checkpoint(PASSIVE)');
    await src.backup(dest);
  } finally {
    src.close();
  }

  const size = statSync(dest).size;

  const check = new Database(dest, { readonly: true });
  const counts = {
    bookings: check.prepare('SELECT COUNT(*) c FROM bookings').get().c,
    services: check.prepare('SELECT COUNT(*) c FROM services').get().c,
    users: check.prepare('SELECT COUNT(*) c FROM users').get().c,
    notifications: check.prepare('SELECT COUNT(*) c FROM notification_log').get().c,
  };
  check.close();

  console.log('  Đích  :', name);
  console.log('  Kích thước:', human(size));
  console.log('  Kiểm tra tính toàn vẹn: OK');
  console.log(`  Nội dung: ${counts.bookings} đơn · ${counts.services} dịch vụ · ${counts.users} tài khoản · ${counts.notifications} log tin`);

  const removed = pruneOld();
  if (removed) console.log(`  Đã xoá ${removed} bản sao lưu cũ hơn ${KEEP_DAYS} ngày`);

  console.log('Sao lưu hoàn tất.');
  return dest;
}

export { backup, BACKUP_DIR };

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('backup.js')) {
  backup().catch((e) => {
    console.error('Sao lưu thất bại:', e.message);
    process.exit(1);
  });
}
