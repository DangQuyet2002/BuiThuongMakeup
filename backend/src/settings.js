import { db } from '../db/database.js';
import { removeUpload } from './uploads.js';

// Nội dung trang chủ do quản trị viên chỉnh (khác với dịch vụ/thư viện ảnh).
//
// Ảnh đầu trang (hero) là MỘT DANH SÁCH nhiều ảnh, trang chủ tự chuyển qua lại.
// Lưu trong `site_settings` dưới dạng:
//   hero_images     — các đường dẫn, phân tách bằng dấu phẩy, theo đúng thứ tự
//   hero_autoplay   — '1' hoặc '0'
//   hero_interval   — số giây mỗi ảnh (3–30)
//
// Bảng `site_settings` là khóa – giá trị nên thêm trường mới không phải đổi
// cấu trúc bảng. Khóa `hero_image` (số ít) chỉ còn dùng để đọc dữ liệu cũ.
export const FIELDS = {
  heroImages: {
    key: 'hero_images',
    label: 'Ảnh đầu trang',
    type: 'image-list',
  },
  heroAutoplay: {
    key: 'hero_autoplay',
    label: 'Tự chuyển ảnh',
    type: 'switch',
  },
  heroInterval: {
    key: 'hero_interval',
    label: 'Giây mỗi ảnh',
    type: 'number',
  },
};

const LEGACY_HERO_KEY = 'hero_image'; // dữ liệu cũ: chỉ một ảnh

export const MAX_HERO_IMAGES = 12;
export const INTERVAL_MIN = 3;
export const INTERVAL_MAX = 30;
export const INTERVAL_DEFAULT = 6;

function text(v, max = 300) {
  return String(v ?? '').trim().slice(0, max);
}

// Chỉ nhận đường dẫn do chính API tải ảnh sinh ra, hoặc link ảnh ngoài.
// Trả về null nếu giá trị không hợp lệ (để bên gọi quyết định báo lỗi hay xoá).
function safePath(v) {
  const s = text(v);
  if (!s) return null;
  if (s.startsWith('/uploads/')) return s;
  if (/^https?:\/\//i.test(s)) return s; // cho phép dán link ảnh ngoài
  return null;
}

function readRaw(key) {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function writeRaw(key, value) {
  db.prepare(`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, value);
}

function deleteRaw(key) {
  db.prepare('DELETE FROM site_settings WHERE key = ?').run(key);
}

// Chuỗi lưu trong DB -> mảng đường dẫn sạch (bỏ trùng, giữ thứ tự)
function parseList(raw) {
  if (!raw) return [];
  const out = [];
  for (const part of String(raw).split(',')) {
    const p = safePath(part);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

function readList() {
  return parseList(readRaw(FIELDS.heroImages.key));
}

// Chuyển đổi một lần: dữ liệu cũ `hero_image` (một ảnh) -> `hero_images`.
// Chỉ chạy khi khóa mới còn trống, không bao giờ ghi đè.
function migrateLegacyHero() {
  const legacy = safePath(readRaw(LEGACY_HERO_KEY));
  if (!legacy) return;
  if (readList().length) return;

  writeRaw(FIELDS.heroImages.key, legacy);
}

function readBool(key, fallback) {
  const v = readRaw(key);
  if (v === null || v === undefined || v === '') return fallback;
  return v === '1' || v === 'true';
}

function readInterval() {
  const n = Number(readRaw(FIELDS.heroInterval.key));
  if (!Number.isFinite(n) || n < INTERVAL_MIN || n > INTERVAL_MAX) return INTERVAL_DEFAULT;
  return Math.round(n);
}

// Một file có thể đồng thời được dùng ở thư viện ảnh và ảnh đầu trang.
// Chỉ xoá khỏi đĩa khi không còn bản ghi nào tham chiếu đến nó.
//
// Ảnh đầu trang nằm trong danh sách phân tách bằng dấu phẩy ở một dòng, nên
// phải tách ra rồi so từng phần tử — so cả chuỗi sẽ không khớp.
function removeIfUnused(path) {
  if (!path) return;

  const galleryRefs = db.prepare(`
    SELECT COUNT(*) c FROM gallery
    WHERE image_path = ? OR before_image = ? OR after_image = ?
  `).get(path, path, path).c;
  if (galleryRefs > 0) return;

  if (readList().includes(path)) return;

  removeUpload(path);
}

// Dữ liệu trả ra API:
// { heroImages: ['/uploads/...'], heroAutoplay: true, heroInterval: 6 }
export function getSettings() {
  migrateLegacyHero();

  const heroImages = readList();
  return {
    heroImages,
    // Trang chủ dùng trường này cho tiện; giữ luôn ảnh đầu tiên làm ảnh bìa.
    heroImage: heroImages[0] || null,
    heroCount: heroImages.length,
    heroAutoplay: heroImages.length > 1 ? readBool(FIELDS.heroAutoplay.key, true) : false,
    heroInterval: readInterval(),
  };
}

// Thay toàn bộ danh sách ảnh (dùng cho "đặt làm ảnh bìa" và sắp xếp lại).
// `paths` phải là mảng các đường dẫn hợp lệ.
function replaceList(paths, prev) {
  if (!paths.length) {
    deleteRaw(FIELDS.heroImages.key);
    return [];
  }
  writeRaw(FIELDS.heroImages.key, paths.join(','));
  return paths;
}

// `patch.heroImages`: mảng đường dẫn mới cần THÊM vào (không phải thay thế),
// trừ khi `replace: true` thì thay toàn bộ — dùng cho đặt ảnh bìa / sắp xếp.
export function updateSettings(data) {
  const patch = data && typeof data === 'object' ? data : {};
  const changed = [];
  const value = {};
  // File cần dọn — xoá SAU khi transaction đã chốt, để nếu transaction bị huỷ
  // thì ảnh vẫn còn trên đĩa (thừa rác còn hơn mất ảnh đang dùng).
  const toRemove = [];

  db.transaction(() => {
    const prev = readList();
    let next = prev;

    // ---- danh sách ảnh ----
    if (patch.heroImages !== undefined) {
      const raw = Array.isArray(patch.heroImages)
        ? patch.heroImages
        : [patch.heroImages];

      const clean = [];
      for (const item of raw) {
        if (item === null || item === '') continue;
        const p = safePath(item);
        if (!p) {
          const err = new Error('Đường dẫn ảnh không hợp lệ');
          err.field = 'heroImages';
          throw err;
        }
        if (!clean.includes(p)) clean.push(p);
      }

      if (clean.length > MAX_HERO_IMAGES) {
        const err = new Error(`Tối đa ${MAX_HERO_IMAGES} ảnh đầu trang`);
        err.field = 'heroImages';
        throw err;
      }

      // Mặc định là thêm vào; `replace: true` thì thay cả danh sách
      next = patch.replace === true ? clean : [...prev];
      if (patch.replace !== true) {
        for (const p of clean) if (!next.includes(p)) next.push(p);
      }

      if (next.length > MAX_HERO_IMAGES) {
        const err = new Error(`Tối đa ${MAX_HERO_IMAGES} ảnh đầu trang`);
        err.field = 'heroImages';
        throw err;
      }

      replaceList(next, prev);
      changed.push('heroImages');
      value.heroImages = next;
    }

    // Gỡ toàn bộ ảnh đầu trang
    if (patch.heroImages === null || patch.heroImages === '') {
      deleteRaw(FIELDS.heroImages.key);
      next = [];
      changed.push('heroImages');
      value.heroImages = [];
    }

    // ---- tự chuyển & thời gian ----
    if (patch.heroAutoplay !== undefined) {
      writeRaw(FIELDS.heroAutoplay.key, patch.heroAutoplay ? '1' : '0');
      changed.push('heroAutoplay');
    }

    if (patch.heroInterval !== undefined) {
      const n = Number(patch.heroInterval);
      if (!Number.isFinite(n) || n < INTERVAL_MIN || n > INTERVAL_MAX) {
        const err = new Error(`Thời gian chuyển ảnh phải từ ${INTERVAL_MIN} đến ${INTERVAL_MAX} giây`);
        err.field = 'heroInterval';
        throw err;
      }
      writeRaw(FIELDS.heroInterval.key, String(Math.round(n)));
      changed.push('heroInterval');
    }

    // Ảnh cũ không còn trong danh sách mới thì đánh dấu để dọn sau.
    for (const p of prev) {
      if (!next.includes(p)) toRemove.push(p);
    }
  })();

  toRemove.forEach(removeIfUnused);

  return { ok: true, changed, data: getSettings() };
}

// Xoá một ảnh khỏi danh sách đầu trang và dọn file nếu không còn ai dùng
export function removeHeroImage(path) {
  const target = safePath(path);
  if (!target) {
    const err = new Error('Đường dẫn ảnh không hợp lệ');
    err.field = 'heroImages';
    throw err;
  }

  db.transaction(() => {
    const prev = readList();
    const next = prev.filter((p) => p !== target);
    replaceList(next, prev);
  })();

  // Xoá file ra ngoài transaction — xem chú thích ở updateSettings()
  removeIfUnused(target);

  return { ok: true, data: getSettings() };
}

// Dùng khi khôi phục dữ liệu hoặc dọn dẹp: xoá hết và trả file về trạng thái sạch
export function clearSettings() {
  const prev = readList();
  const legacy = safePath(readRaw(LEGACY_HERO_KEY));

  db.transaction(() => {
    for (const f of Object.values(FIELDS)) deleteRaw(f.key);
    deleteRaw(LEGACY_HERO_KEY);
  })();

  for (const v of [...prev, legacy].filter(Boolean)) {
    // site_settings đã bị xoá nên chỉ còn thư viện ảnh có thể giữ file lại
    const galleryRefs = db.prepare(`
      SELECT COUNT(*) c FROM gallery
      WHERE image_path = ? OR before_image = ? OR after_image = ?
    `).get(v, v, v).c;
    if (galleryRefs === 0) removeUpload(v);
  }

  return { ok: true };
}
