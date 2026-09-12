import { db } from '../db/database.js';
import { removeUpload } from './uploads.js';

const SELECT = `SELECT id,title,category,kind,image_path,before_image,after_image,
                       alt_text,sort_order,active,created_at FROM gallery`;

function toApi(row) {
  if (!row) return null;
  return { ...row, active: !!row.active };
}

function text(v, max = 200) {
  return String(v ?? '').trim().slice(0, max);
}

// Mọi mục trong thư viện đều là ảnh so sánh trước/sau, nên chỉ những mục
// có ĐỦ cả hai ảnh mới hiển thị được. includeIncomplete dành cho trang quản trị
// để vẫn thấy và sửa được dữ liệu cũ chưa đủ ảnh.
export function listGallery({ includeInactive = false, includeIncomplete = false } = {}) {
  const where = [];
  if (!includeInactive) where.push('active = 1');
  if (!includeIncomplete) where.push('before_image IS NOT NULL', 'after_image IS NOT NULL');

  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY sort_order, id`;
  return db.prepare(sql).all().map(toApi);
}

export function getGalleryItem(id) {
  return toApi(db.prepare(`${SELECT} WHERE id = ?`).get(id));
}

// Chỉ nhận đường dẫn nội bộ do chính API tải ảnh sinh ra
function safePath(v) {
  const s = text(v, 300);
  if (!s) return null;
  if (s.startsWith('/uploads/')) return s;
  if (/^https?:\/\//i.test(s)) return s; // cho phép dán link ảnh ngoài
  return null;
}

function validate(data, current = {}) {
  const title = data.title !== undefined ? text(data.title, 120) : (current.title || '');
  if (!title) return { ok: false, error: 'Vui lòng nhập tiêu đề ảnh' };

  const before = data.beforeImage !== undefined || data.before_image !== undefined
    ? safePath(data.beforeImage ?? data.before_image)
    : current.before_image;

  const after = data.afterImage !== undefined || data.after_image !== undefined
    ? safePath(data.afterImage ?? data.after_image)
    : current.after_image;

  if (!before) return { ok: false, error: 'Cần có ảnh TRƯỚC (tải lên hoặc dán link)' };
  if (!after) return { ok: false, error: 'Cần có ảnh SAU (tải lên hoặc dán link)' };

  return {
    ok: true,
    value: {
      title,
      // Thư viện chỉ có một loại duy nhất: ảnh so sánh trước/sau.
      kind: 'compare',
      category: data.category !== undefined ? (text(data.category, 60) || null) : (current.category || null),
      // Cột image_path không dùng nữa, giữ lại cho tương thích dữ liệu cũ.
      image_path: null,
      before_image: before,
      after_image: after,
      alt_text: data.altText !== undefined || data.alt_text !== undefined
        ? (text(data.altText ?? data.alt_text, 200) || null)
        : (current.alt_text || null),
    },
  };
}

// Một file ảnh có thể bị nhiều mục cùng trỏ tới (ví dụ khi dán cùng một đường dẫn
// vào hai mục). Chỉ xoá file khi không còn mục nào dùng nữa, tránh làm hỏng ảnh
// của mục khác.
function removeIfUnused(path) {
  if (!path) return;
  const { c } = db
    .prepare(`SELECT COUNT(*) c FROM gallery
              WHERE image_path = ? OR before_image = ? OR after_image = ?`)
    .get(path, path, path);
  if (c === 0) removeUpload(path);
}

export function createGalleryItem(data) {
  const v = validate(data);
  if (!v.ok) return v;

  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM gallery').get().m;

  const info = db.prepare(`
    INSERT INTO gallery (title, category, kind, image_path, before_image, after_image, alt_text, sort_order, active)
    VALUES (@title,@category,@kind,@image_path,@before_image,@after_image,@alt_text,@sort_order,1)
  `).run({ ...v.value, sort_order: max + 1 });

  return { ok: true, data: getGalleryItem(info.lastInsertRowid) };
}

export function updateGalleryItem(id, data) {
  const cur = db.prepare('SELECT * FROM gallery WHERE id = ?').get(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy ảnh' };

  const v = validate(data, cur);
  if (!v.ok) return v;

  db.prepare(`
    UPDATE gallery SET
      title=@title, category=@category, kind=@kind,
      image_path=@image_path, before_image=@before_image, after_image=@after_image,
      alt_text=@alt_text
    WHERE id=@id
  `).run({ ...v.value, id });

  // Cập nhật xong mới dọn file cũ, để không xoá nhầm file mà mục khác vẫn dùng
  const oldPaths = [cur.image_path, cur.before_image, cur.after_image].filter(Boolean);
  const newPaths = [v.value.image_path, v.value.before_image, v.value.after_image].filter(Boolean);
  for (const p of oldPaths) {
    if (!newPaths.includes(p)) removeIfUnused(p);
  }

  return { ok: true, data: getGalleryItem(id) };
}

export function setGalleryActive(id, active) {
  return db.prepare('UPDATE gallery SET active = ? WHERE id = ?').run(active ? 1 : 0, id).changes > 0;
}

export function deleteGalleryItem(id) {
  const cur = db.prepare('SELECT * FROM gallery WHERE id = ?').get(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy ảnh' };

  db.prepare('DELETE FROM gallery WHERE id = ?').run(id);

  for (const p of [cur.image_path, cur.before_image, cur.after_image]) {
    removeIfUnused(p);
  }

  return { ok: true };
}

export function reorderGallery(ids) {
  if (!Array.isArray(ids) || !ids.length) return { ok: false, error: 'Thiếu danh sách thứ tự' };

  const stmt = db.prepare('UPDATE gallery SET sort_order = ? WHERE id = ?');
  db.transaction((list) => {
    list.forEach((id, i) => stmt.run(i + 1, Number(id)));
  })(ids);

  return { ok: true, count: ids.length };
}

export function galleryStats() {
  const total = db.prepare('SELECT COUNT(*) c FROM gallery').get().c;
  const active = db.prepare('SELECT COUNT(*) c FROM gallery WHERE active = 1').get().c;
  // Mục cũ chưa đủ ảnh trước/sau (dữ liệu trước khi đổi sang so sánh)
  const incomplete = db
    .prepare('SELECT COUNT(*) c FROM gallery WHERE before_image IS NULL OR after_image IS NULL')
    .get().c;
  return { total, active, hidden: total - active, incomplete };
}
