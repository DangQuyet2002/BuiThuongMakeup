import { db } from '../db/database.js';

export const WORK_HOURS = {
  0: { start: 0,  end: 24 },   // Chủ nhật
  1: { start: 0,  end: 24 },   // Thứ 2
  2: { start: 0,  end: 24 },   // Thứ 3
  3: { start: 0,  end: 24 },   // Thứ 4
  4: { start: 0,  end: 24 },   // Thứ 5
  5: { start: 0,  end: 24 },   // Thứ 6
  6: { start: 0,  end: 24 },   // Thứ 7
};

export const SLOT_MINUTES = 60;
export const HOLD_MINUTES = 10;

function pad(n) {
  return String(n).padStart(2, '0');
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowStr() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return false;
  return s === `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidTime(s) {
  return /^([01]\d|2[0-3]):(00|30)$/.test(s);
}

export function generateSlots(date) {
  const hours = WORK_HOURS[new Date(date + 'T00:00:00').getDay()];
  const list = [];
  for (let h = hours.start; h < hours.end; h++) {
    list.push(`${pad(h)}:00`);
  }
  return list;
}

export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length === 11) return '0' + digits.slice(2);
  return digits;
}

export function isValidPhone(raw) {
  const d = normalizePhone(raw);
  return /^0\d{9}$/.test(d);
}

export function genCode() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const row = db.prepare(
    "SELECT COUNT(*) c FROM bookings WHERE code LIKE ?"
  ).get(`MC${ymd}%`);
  return `MC${ymd}${pad(row.c + 1)}`;
}

export function getBookedSlots(date) {
  const rows = db.prepare(
    "SELECT time, duration FROM bookings WHERE date = ? AND status IN ('pending','confirmed')"
  ).all(date);

  const taken = new Set();
  for (const r of rows) {
    const startH = parseInt(r.time.slice(0, 2), 10);
    const span = Math.max(1, Math.ceil(r.duration / SLOT_MINUTES));
    for (let i = 0; i < span; i++) taken.add(pad(startH + i) + ':00');
  }

  const blocked = db.prepare('SELECT time FROM blocked_slots WHERE date = ?').all(date);
  for (const b of blocked) taken.add(b.time);

  return taken;
}

export function getSlotList(date, artistId) {
  const all = generateSlots(date);
  const taken = artistId ? getTakenForArtist(date, artistId) : getBookedSlots(date);
  const isToday = date === todayStr();
  const now = nowStr();

  return all.map((time) => {
    let available = !taken.has(time);
    if (available && isToday && time <= now) available = false;
    return { time, available };
  });
}

function getTakenForArtist(date, artistId) {
  const rows = db.prepare(
    "SELECT time, duration FROM bookings WHERE date = ? AND artist_id = ? AND status IN ('pending','confirmed')"
  ).all(date, artistId);
  const taken = new Set();
  for (const r of rows) {
    const startH = parseInt(r.time.slice(0, 2), 10);
    const span = Math.max(1, Math.ceil(r.duration / SLOT_MINUTES));
    for (let i = 0; i < span; i++) taken.add(pad(startH + i) + ':00');
  }
  return taken;
}

export function isSlotFree(date, time, duration, artistId) {
  if (!isValidDate(date) || !isValidTime(time)) return false;

  if (date < todayStr()) return false;

  const slots = generateSlots(date);
  if (!slots.includes(time)) return false;

  const isToday = date === todayStr();
  if (isToday && time <= nowStr()) return false;

  const span = Math.max(1, Math.ceil(duration / SLOT_MINUTES));
  const startH = parseInt(time.slice(0, 2), 10);
  const needed = [];
  for (let i = 0; i < span; i++) needed.push(pad(startH + i) + ':00');

  const hours = WORK_HOURS[new Date(date + 'T00:00:00').getDay()];
  for (const t of needed) {
    const h = parseInt(t.slice(0, 2), 10);
    if (h < hours.start || h >= hours.end) return false;
  }

  const taken = artistId ? getTakenForArtist(date, artistId) : getBookedSlots(date);
  const blocked = db.prepare('SELECT time FROM blocked_slots WHERE date = ?').all(date);
  for (const b of blocked) taken.add(b.time);

  return needed.every((t) => !taken.has(t));
}

export function suggestArtists(date, time, duration) {
  const artists = db.prepare('SELECT id,name,initials,specialty,years FROM artists WHERE active = 1 ORDER BY years DESC').all();
  return artists.map((a) => ({
    ...a,
    available: isSlotFree(date, time, duration, a.id),
  }));
}

export function calcTotal(serviceId, addonIds, comboId) {
  let total = 0;
  let serviceName = null;
  let duration = 60;

  if (comboId) {
    const combo = db.prepare('SELECT * FROM combos WHERE id = ? AND active = 1').get(comboId);
    if (!combo) return null;
    total = combo.price;
    serviceName = combo.name;
    duration = 120;
  } else if (serviceId) {
    const svc = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(serviceId);
    if (!svc) return null;
    total = svc.price;
    serviceName = svc.name;
    duration = svc.duration;
  } else {
    return null;
  }

  const chosen = [];
  if (addonIds && addonIds.length) {
    const stmt = db.prepare('SELECT * FROM addons WHERE id = ? AND active = 1');
    for (const id of addonIds) {
      const a = stmt.get(id);
      if (a) {
        total += a.price;
        chosen.push({ id: a.id, name: a.name, price: a.price });
      }
    }
  }

  return { total, serviceName, duration, addons: chosen };
}

export function createBooking(data) {
  const code = genCode();
  const info = db.prepare(`
    INSERT INTO bookings
      (code,service_id,service_name,combo_name,date,time,duration,artist_id,
       customer,phone,note,addons,total,deposit_amount,deposit_status,status)
    VALUES
      (@code,@service_id,@service_name,@combo_name,@date,@time,@duration,@artist_id,
       @customer,@phone,@note,@addons,@total,@deposit_amount,'unpaid','pending')
  `).run({
    code,
    service_id: data.service_id ?? data.serviceId ?? null,
    service_name: data.service_name || data.serviceName || 'Dịch vụ Makeup',
    combo_name: data.combo_name ?? data.comboName ?? null,
    date: data.date,
    time: data.time,
    duration: data.duration,
    artist_id: data.artist_id ?? data.artistId ?? null,
    customer: data.customer,
    phone: data.phone,
    note: data.note ?? null,
    addons: JSON.stringify(data.addons || []),
    total: data.total,
    deposit_amount: Number(data.deposit_amount ?? data.depositAmount) || 0,
  });

  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(info.lastInsertRowid);
}

export function listBookings({ date, status, phone, limit = 200 } = {}) {
  const where = [];
  const params = {};
  if (date)   { where.push('date = @date');     params.date = date; }
  if (status) { where.push('status = @status'); params.status = status; }
  if (phone)  { where.push('phone = @phone');   params.phone = normalizePhone(phone); }

  const sql = `SELECT * FROM bookings
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY date DESC, time DESC LIMIT @limit`;
  params.limit = Math.min(Number(limit) || 200, 1000);

  const rows = db.prepare(sql).all(params);
  return rows.map((r) => ({ ...r, addons: safeParse(r.addons) }));
}

export function getBookingByCode(code) {
  const r = db.prepare('SELECT * FROM bookings WHERE code = ?').get(code);
  if (!r) return null;
  return { ...r, addons: safeParse(r.addons) };
}

export function updateStatus(id, status) {
  const allowed = ['pending', 'confirmed', 'done', 'cancelled'];
  if (!allowed.includes(status)) return null;
  const info = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
  if (!info.changes) return null;
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
}

export function updateDepositStatus(id, depositStatus) {
  const allowed = ['unpaid', 'paid'];
  if (!allowed.includes(depositStatus)) return null;
  if (depositStatus === 'paid') {
    db.prepare("UPDATE bookings SET deposit_status = 'paid', status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END WHERE id = ?").run(id);
  } else {
    db.prepare("UPDATE bookings SET deposit_status = ? WHERE id = ?").run(depositStatus, id);
  }
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
}

export function deleteBooking(id) {
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!existing) return null;

  db.transaction(() => {
    db.prepare('DELETE FROM notification_log WHERE booking_id = ?').run(id);
    db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
  })();

  return existing;
}

export function bookingStats() {
  const total = db.prepare('SELECT COUNT(*) c FROM bookings').get().c;
  const pending = db.prepare("SELECT COUNT(*) c FROM bookings WHERE status='pending'").get().c;
  const confirmed = db.prepare("SELECT COUNT(*) c FROM bookings WHERE status='confirmed'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) s FROM bookings WHERE status IN ('confirmed','done')").get().s;
  const upcoming = db.prepare("SELECT COUNT(*) c FROM bookings WHERE date >= ? AND status IN ('pending','confirmed')").get(todayStr()).c;
  return { total, pending, confirmed, revenue, upcoming };
}

function safeParse(s) {
  try { return JSON.parse(s || '[]'); } catch { return []; }
}
