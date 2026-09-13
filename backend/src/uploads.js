import multer from 'multer';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname, basename } from 'path';
import { getSupabasePool } from '../db/supabase-sync.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 5);

// Chỉ nhận ảnh. Không dựa vào phần mở rộng tên file do người dùng đặt.
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED[file.mimetype] || '.jpg';
    const stamp = Date.now().toString(36);
    const rand = randomBytes(4).toString('hex');
    cb(null, `anh-${stamp}-${rand}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (ALLOWED[file.mimetype]) return cb(null, true);
  const err = new Error('Chỉ nhận file ảnh JPG, PNG, WEBP hoặc GIF');
  err.code = 'INVALID_FILE_TYPE';
  cb(err);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 5 },
});

// Tên file -> đường dẫn công khai dùng được trong thẻ <img src>
export function publicUrl(filename) {
  if (!filename) return null;
  return '/uploads/' + filename;
}

/**
 * Lưu ảnh lên Supabase Cloud
 */
export async function saveUploadToCloud(filename, filePathOrBuffer, mimeType) {
  const p = getSupabasePool();
  if (!p) return;

  try {
    const client = await p.connect();
    try {
      let data;
      if (Buffer.isBuffer(filePathOrBuffer)) {
        data = filePathOrBuffer;
      } else if (existsSync(filePathOrBuffer)) {
        data = readFileSync(filePathOrBuffer);
      } else {
        return;
      }

      const mime = mimeType || (filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

      await client.query(`
        INSERT INTO uploaded_files (filename, mime_type, data, size)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (filename) DO UPDATE SET data = EXCLUDED.data, size = EXCLUDED.size
      `, [filename, mime, data, data.length]);
      logger.info({ filename, size: data.length }, '[Supabase Storage] Đã lưu ảnh lên Cloud');
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn({ error: err.message, filename }, '[Supabase Storage] Lỗi lưu ảnh lên Cloud');
  }
}

/**
 * Tải ảnh từ Supabase Cloud về nếu máy chủ bị restart mất cache đĩa
 */
export async function getUploadFromCloud(filename) {
  const p = getSupabasePool();
  if (!p) return null;

  try {
    const client = await p.connect();
    try {
      const res = await client.query('SELECT filename, mime_type, data FROM uploaded_files WHERE filename = $1', [filename]);
      if (res.rows.length === 0) return null;
      return res.rows[0];
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn({ error: err.message, filename }, '[Supabase Storage] Lỗi đọc ảnh từ Cloud');
    return null;
  }
}

/**
 * Xoá ảnh khỏi Supabase Cloud
 */
export async function deleteUploadFromCloud(filename) {
  const p = getSupabasePool();
  if (!p) return;

  try {
    const client = await p.connect();
    try {
      await client.query('DELETE FROM uploaded_files WHERE filename = $1', [filename]);
      logger.info({ filename }, '[Supabase Storage] Đã xoá ảnh trên Cloud');
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn({ error: err.message, filename }, '[Supabase Storage] Lỗi xoá ảnh trên Cloud');
  }
}

// Xoá file khỏi đĩa và đám mây
export function removeUpload(urlOrName) {
  if (!urlOrName) return false;

  let name = String(urlOrName);
  if (name.startsWith('/uploads/')) name = name.slice('/uploads/'.length);

  name = basename(name);
  if (!name) return false;

  // Xoá khỏi Supabase Cloud
  deleteUploadFromCloud(name).catch(() => {});

  const full = join(UPLOADS_DIR, name);
  if (!full.startsWith(UPLOADS_DIR)) return false;

  try {
    if (!existsSync(full)) return false;
    unlinkSync(full);
    return true;
  } catch (e) {
    console.warn(`  (cảnh báo) không xoá được ảnh ${name}: ${e.code || e.message}`);
    return false;
  }
}

export function uploadsStatus() {
  return {
    dir: UPLOADS_DIR,
    maxMb: MAX_UPLOAD_MB,
    accepted: Object.keys(ALLOWED),
  };
}
