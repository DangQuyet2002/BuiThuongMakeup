import multer from 'multer';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname, basename } from 'path';

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

// Xoá file khỏi đĩa. Chỉ cho phép xoá trong thư mục uploads để tránh ghi đè file hệ thống.
// Trả về true nếu file đã được xoá, false nếu không tìm thấy hoặc không xoá được.
export function removeUpload(urlOrName) {
  if (!urlOrName) return false;

  let name = String(urlOrName);
  if (name.startsWith('/uploads/')) name = name.slice('/uploads/'.length);

  // Chặn đường dẫn kiểu ../../
  name = basename(name);
  if (!name) return false;

  const full = join(UPLOADS_DIR, name);
  if (!full.startsWith(UPLOADS_DIR)) return false;

  try {
    if (!existsSync(full)) return false;
    unlinkSync(full);
    return true;
  } catch (e) {
    // Không xoá được file không được làm hỏng request, nhưng phải báo ra log
    // để không âm thầm để lại rác trên đĩa.
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
