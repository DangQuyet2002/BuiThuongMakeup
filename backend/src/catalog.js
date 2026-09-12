import { db } from '../db/database.js';

/* ============================================================
   Tiện ích
   ============================================================ */

// "Makeup dự tiệc" -> "makeup-du-tiec"
export function slugify(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function uniqueSlug(table, base, excludeId) {
  let slug = base || 'muc';
  let n = 1;
  const stmt = db.prepare(`SELECT id FROM "${table}" WHERE slug = ?`);
  for (;;) {
    const found = stmt.get(slug);
    if (!found || found.id === excludeId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

// features lưu trong DB dạng chuỗi JSON, trả ra ngoài dạng mảng
function parseFeatures(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
    } catch { /* dữ liệu cũ có thể là văn bản thuần, tách theo dòng */ }
    return v.split('\n').map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function toApi(row) {
  if (!row) return null;
  const out = { ...row };
  if ('features' in out) out.features = parseFeatures(out.features);
  if ('active' in out) out.active = !!out.active;
  if ('featured' in out) out.featured = !!out.featured;
  return out;
}

function text(v, max = 200) {
  return String(v ?? '').trim().slice(0, max);
}

function int(v, fallback = 0) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

/* ============================================================
   DỊCH VỤ (danh mục các loại makeup hiển thị)
   ============================================================ */

const SVC_SELECT = `SELECT id,name,slug,description,duration,price,featured,active,
                           tag,time_label,features,sort_order FROM services`;

export function listServices({ includeInactive = false } = {}) {
  const sql = `${SVC_SELECT} ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort_order, id`;
  return db.prepare(sql).all().map(toApi);
}

export function getService(id) {
  return toApi(db.prepare(`${SVC_SELECT} WHERE id = ?`).get(id));
}

export function createService(data) {
  const name = text(data.name, 120);
  if (!name) return { ok: false, error: 'Vui lòng nhập tên dịch vụ' };

  const price = int(data.price, -1);
  if (price < 0) return { ok: false, error: 'Giá tiền không hợp lệ' };

  const duration = int(data.duration, 60);
  if (duration < 15 || duration > 480) return { ok: false, error: 'Thời lượng phải từ 15 đến 480 phút' };

  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM services').get().m;

  const info = db.prepare(`
    INSERT INTO services (name, slug, description, duration, price, featured, active, tag, time_label, features, sort_order)
    VALUES (@name,@slug,@description,@duration,@price,@featured,1,@tag,@time_label,@features,@sort_order)
  `).run({
    name,
    slug: uniqueSlug('services', slugify(name)),
    description: text(data.description, 500) || null,
    duration,
    price,
    featured: data.featured ? 1 : 0,
    tag: text(data.tag, 60) || null,
    time_label: text(data.timeLabel ?? data.time_label, 80) || null,
    features: JSON.stringify(parseFeatures(data.features)),
    sort_order: max + 1,
  });

  return { ok: true, data: getService(info.lastInsertRowid) };
}

export function updateService(id, data) {
  const cur = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy dịch vụ' };

  const name = data.name !== undefined ? text(data.name, 120) : cur.name;
  if (!name) return { ok: false, error: 'Tên dịch vụ không được để trống' };

  let price = cur.price;
  if (data.price !== undefined) {
    price = int(data.price, -1);
    if (price < 0) return { ok: false, error: 'Giá tiền không hợp lệ' };
  }

  let duration = cur.duration;
  if (data.duration !== undefined) {
    duration = int(data.duration, 0);
    if (duration < 15 || duration > 480) return { ok: false, error: 'Thời lượng phải từ 15 đến 480 phút' };
  }

  const newSlug = name !== cur.name ? uniqueSlug('services', slugify(name), id) : cur.slug;

  db.prepare(`
    UPDATE services SET
      name=@name, slug=@slug, description=@description, duration=@duration,
      price=@price, featured=@featured, tag=@tag, time_label=@time_label, features=@features
    WHERE id=@id
  `).run({
    id,
    name,
    slug: newSlug,
    description: data.description !== undefined ? (text(data.description, 500) || null) : cur.description,
    duration,
    price,
    featured: data.featured !== undefined ? (data.featured ? 1 : 0) : cur.featured,
    tag: data.tag !== undefined ? (text(data.tag, 60) || null) : cur.tag,
    time_label: data.timeLabel !== undefined || data.time_label !== undefined
      ? (text(data.timeLabel ?? data.time_label, 80) || null)
      : cur.time_label,
    features: data.features !== undefined ? JSON.stringify(parseFeatures(data.features)) : cur.features,
  });

  return { ok: true, data: getService(id) };
}

export function setServiceActive(id, active) {
  const info = db.prepare('UPDATE services SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  return info.changes > 0;
}

export function deleteService(id) {
  const used = db.prepare('SELECT COUNT(*) c FROM bookings WHERE service_id = ?').get(id).c;
  if (used > 0) {
    return {
      ok: false,
      error: `Dịch vụ này đang gắn với ${used} đơn đặt lịch nên không xoá được. Hãy chuyển sang "Ẩn" để khách không thấy nữa.`,
    };
  }
  const info = db.prepare('DELETE FROM services WHERE id = ?').run(id);
  return info.changes > 0 ? { ok: true } : { ok: false, error: 'Không tìm thấy dịch vụ' };
}

/* ============================================================
   DỊCH VỤ KÈM (addons)
   ============================================================ */

const ADDON_SELECT = 'SELECT id,name,note,price,active,sort_order FROM addons';

export function listAddons({ includeInactive = false } = {}) {
  const sql = `${ADDON_SELECT} ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort_order, id`;
  return db.prepare(sql).all().map(toApi);
}

export function getAddon(id) {
  return toApi(db.prepare(`${ADDON_SELECT} WHERE id = ?`).get(id));
}

export function createAddon(data) {
  const name = text(data.name, 120);
  if (!name) return { ok: false, error: 'Vui lòng nhập tên dịch vụ kèm' };

  const price = int(data.price, -1);
  if (price < 0) return { ok: false, error: 'Giá tiền không hợp lệ' };

  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM addons').get().m;

  const info = db.prepare(`
    INSERT INTO addons (name, note, price, active, sort_order)
    VALUES (@name,@note,@price,1,@sort_order)
  `).run({ name, note: text(data.note, 200) || null, price, sort_order: max + 1 });

  return { ok: true, data: getAddon(info.lastInsertRowid) };
}

export function updateAddon(id, data) {
  const cur = db.prepare('SELECT * FROM addons WHERE id = ?').get(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy dịch vụ kèm' };

  const name = data.name !== undefined ? text(data.name, 120) : cur.name;
  if (!name) return { ok: false, error: 'Tên không được để trống' };

  let price = cur.price;
  if (data.price !== undefined) {
    price = int(data.price, -1);
    if (price < 0) return { ok: false, error: 'Giá tiền không hợp lệ' };
  }

  db.prepare('UPDATE addons SET name=?, note=?, price=? WHERE id=?').run(
    name,
    data.note !== undefined ? (text(data.note, 200) || null) : cur.note,
    price,
    id
  );

  return { ok: true, data: getAddon(id) };
}

export function setAddonActive(id, active) {
  return db.prepare('UPDATE addons SET active = ? WHERE id = ?').run(active ? 1 : 0, id).changes > 0;
}

export function deleteAddon(id) {
  const info = db.prepare('DELETE FROM addons WHERE id = ?').run(id);
  return info.changes > 0 ? { ok: true } : { ok: false, error: 'Không tìm thấy dịch vụ kèm' };
}

/* ============================================================
   COMBO
   ============================================================ */

const COMBO_SELECT = `SELECT id,name,slug,description,old_price,price,featured,active,
                             tag,features,sort_order FROM combos`;

export function listCombos({ includeInactive = false } = {}) {
  const sql = `${COMBO_SELECT} ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort_order, id`;
  return db.prepare(sql).all().map(toApi);
}

export function getCombo(id) {
  return toApi(db.prepare(`${COMBO_SELECT} WHERE id = ?`).get(id));
}

export function createCombo(data) {
  const name = text(data.name, 120);
  if (!name) return { ok: false, error: 'Vui lòng nhập tên combo' };

  const price = int(data.price, -1);
  if (price < 0) return { ok: false, error: 'Giá combo không hợp lệ' };

  let oldPrice = int(data.oldPrice ?? data.old_price, 0);
  if (oldPrice < price) oldPrice = price;

  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM combos').get().m;

  const info = db.prepare(`
    INSERT INTO combos (name, slug, description, old_price, price, featured, active, tag, features, sort_order)
    VALUES (@name,@slug,@description,@old_price,@price,@featured,1,@tag,@features,@sort_order)
  `).run({
    name,
    slug: uniqueSlug('combos', slugify(name)),
    description: text(data.description, 500) || null,
    old_price: oldPrice,
    price,
    featured: data.featured ? 1 : 0,
    tag: text(data.tag, 60) || null,
    features: JSON.stringify(parseFeatures(data.features)),
    sort_order: max + 1,
  });

  return { ok: true, data: getCombo(info.lastInsertRowid) };
}

export function updateCombo(id, data) {
  const cur = db.prepare('SELECT * FROM combos WHERE id = ?').get(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy combo' };

  const name = data.name !== undefined ? text(data.name, 120) : cur.name;
  if (!name) return { ok: false, error: 'Tên combo không được để trống' };

  let price = cur.price;
  if (data.price !== undefined) {
    price = int(data.price, -1);
    if (price < 0) return { ok: false, error: 'Giá combo không hợp lệ' };
  }

  let oldPrice = data.oldPrice !== undefined || data.old_price !== undefined
    ? int(data.oldPrice ?? data.old_price, price)
    : cur.old_price;
  if (oldPrice < price) oldPrice = price;

  const newSlug = name !== cur.name ? uniqueSlug('combos', slugify(name), id) : cur.slug;

  db.prepare(`
    UPDATE combos SET
      name=@name, slug=@slug, description=@description, old_price=@old_price,
      price=@price, featured=@featured, tag=@tag, features=@features
    WHERE id=@id
  `).run({
    id,
    name,
    slug: newSlug,
    description: data.description !== undefined ? (text(data.description, 500) || null) : cur.description,
    old_price: oldPrice,
    price,
    featured: data.featured !== undefined ? (data.featured ? 1 : 0) : cur.featured,
    tag: data.tag !== undefined ? (text(data.tag, 60) || null) : cur.tag,
    features: data.features !== undefined ? JSON.stringify(parseFeatures(data.features)) : cur.features,
  });

  return { ok: true, data: getCombo(id) };
}

export function setComboActive(id, active) {
  return db.prepare('UPDATE combos SET active = ? WHERE id = ?').run(active ? 1 : 0, id).changes > 0;
}

export function deleteCombo(id) {
  const info = db.prepare('DELETE FROM combos WHERE id = ?').run(id);
  return info.changes > 0 ? { ok: true } : { ok: false, error: 'Không tìm thấy combo' };
}

/* ============================================================
   CHUYÊN VIÊN (artists)
   ============================================================ */

const ART_SELECT = 'SELECT id,name,initials,specialty,years,active,sort_order FROM artists';

export function listArtists({ includeInactive = false } = {}) {
  const sql = `${ART_SELECT} ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort_order, years DESC, id`;
  return db.prepare(sql).all().map(toApi);
}

export function getArtist(id) {
  return toApi(db.prepare(`${ART_SELECT} WHERE id = ?`).get(id));
}

function initialsFrom(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 3) || 'CV';
}

export function createArtist(data) {
  const name = text(data.name, 80);
  if (!name) return { ok: false, error: 'Vui lòng nhập tên chuyên viên' };

  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM artists').get().m;

  const info = db.prepare(`
    INSERT INTO artists (name, initials, specialty, years, active, sort_order)
    VALUES (@name,@initials,@specialty,@years,1,@sort_order)
  `).run({
    name,
    initials: text(data.initials, 4).toUpperCase() || initialsFrom(name),
    specialty: text(data.specialty, 120) || null,
    years: Math.max(0, int(data.years, 0)),
    sort_order: max + 1,
  });

  return { ok: true, data: getArtist(info.lastInsertRowid) };
}

export function updateArtist(id, data) {
  const cur = db.prepare('SELECT * FROM artists WHERE id = ?').get(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy chuyên viên' };

  const name = data.name !== undefined ? text(data.name, 80) : cur.name;
  if (!name) return { ok: false, error: 'Tên chuyên viên không được để trống' };

  db.prepare('UPDATE artists SET name=?, initials=?, specialty=?, years=? WHERE id=?').run(
    name,
    data.initials !== undefined ? (text(data.initials, 4).toUpperCase() || initialsFrom(name)) : cur.initials,
    data.specialty !== undefined ? (text(data.specialty, 120) || null) : cur.specialty,
    data.years !== undefined ? Math.max(0, int(data.years, 0)) : cur.years,
    id
  );

  return { ok: true, data: getArtist(id) };
}

export function setArtistActive(id, active) {
  return db.prepare('UPDATE artists SET active = ? WHERE id = ?').run(active ? 1 : 0, id).changes > 0;
}

export function deleteArtist(id) {
  const used = db.prepare('SELECT COUNT(*) c FROM bookings WHERE artist_id = ?').get(id).c;
  if (used > 0) {
    return {
      ok: false,
      error: `Chuyên viên này đang gắn với ${used} đơn. Hãy chuyển sang "Ẩn" thay vì xoá.`,
    };
  }
  const info = db.prepare('DELETE FROM artists WHERE id = ?').run(id);
  return info.changes > 0 ? { ok: true } : { ok: false, error: 'Không tìm thấy chuyên viên' };
}

/* ============================================================
   SẮP XẾP LẠI THỨ TỰ
   ============================================================ */

const REORDERABLE = { services: 'services', addons: 'addons', combos: 'combos', artists: 'artists' };

export function reorder(kind, ids) {
  const table = REORDERABLE[kind];
  if (!table) return { ok: false, error: 'Loại không hợp lệ' };
  if (!Array.isArray(ids) || !ids.length) return { ok: false, error: 'Thiếu danh sách thứ tự' };

  const stmt = db.prepare(`UPDATE "${table}" SET sort_order = ? WHERE id = ?`);
  const run = db.transaction((list) => {
    list.forEach((id, i) => stmt.run(i + 1, Number(id)));
  });
  run(ids);

  return { ok: true, count: ids.length };
}

export { parseFeatures };
