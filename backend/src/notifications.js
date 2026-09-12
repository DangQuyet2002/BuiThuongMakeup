import { db } from '../db/database.js';
import { sendZNS, znsStatus, toZaloPhone } from './notify.js';

export function logNotification(booking, type, result) {
  const status = result.ok ? (result.dryRun ? 'dry_run' : 'sent')
    : result.skipped ? 'skipped'
    : 'failed';

  const info = db.prepare(`
    INSERT INTO notification_log
      (booking_id, booking_code, type, phone, status, provider, message_id, error, detail, attempts, sent_at)
    VALUES
      (@booking_id, @booking_code, @type, @phone, @status, @provider, @message_id, @error, @detail, @attempts, @sent_at)
  `).run({
    booking_id: booking.id,
    booking_code: booking.code,
    type,
    phone: toZaloPhone(booking.phone),
    status,
    provider: result.provider || null,
    message_id: result.messageId || null,
    error: result.error || null,
    detail: result.detail || null,
    attempts: result.attempts || 1,
    sent_at: result.ok && !result.dryRun ? new Date().toISOString() : null,
  });

  return db.prepare('SELECT * FROM notification_log WHERE id = ?').get(info.lastInsertRowid);
}

export async function notifyBookingCreated(booking) {
  const result = await sendZNS('booking', booking);
  const log = logNotification(booking, 'booking', result);
  return { result, log };
}

export async function notifyStatusChanged(booking) {
  if (!['confirmed', 'done', 'cancelled'].includes(booking.status)) {
    return { result: { ok: false, skipped: true, detail: 'Trạng thái không cần thông báo' }, log: null };
  }
  const result = await sendZNS('status', { ...booking, addons: safeAddons(booking.addons) });
  const log = logNotification(booking, 'status', result);
  return { result, log };
}

export async function notifyReminder(booking) {
  const result = await sendZNS('reminder', { ...booking, addons: safeAddons(booking.addons) });
  const log = logNotification(booking, 'reminder', result);
  return { result, log };
}

export async function retryNotification(logId) {
  const log = db.prepare('SELECT * FROM notification_log WHERE id = ?').get(logId);
  if (!log) return { ok: false, error: 'Không tìm thấy bản ghi thông báo' };

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(log.booking_id);
  if (!booking) return { ok: false, error: 'Đơn không còn tồn tại' };

  return notifyByType(log.type, { ...booking, addons: safeAddons(booking.addons) });
}

async function notifyByType(type, booking) {
  if (type === 'booking') return notifyBookingCreated(booking);
  if (type === 'reminder') return notifyReminder(booking);
  if (type === 'status') return notifyStatusChanged(booking);
  return { result: { ok: false, error: 'Loại thông báo không hợp lệ' }, log: null };
}

export function listNotifications({ bookingId, status, type, limit = 100 } = {}) {
  const where = [];
  const params = {};
  if (bookingId) { where.push('booking_id = @bookingId'); params.bookingId = Number(bookingId); }
  if (status)    { where.push('status = @status');         params.status = status; }
  if (type)      { where.push('type = @type');             params.type = type; }
  params.limit = Math.min(Number(limit) || 100, 500);

  return db.prepare(`
    SELECT * FROM notification_log
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id DESC LIMIT @limit
  `).all(params);
}

export function notificationStats() {
  const rows = db.prepare('SELECT status, COUNT(*) c FROM notification_log GROUP BY status').all();
  const out = { sent: 0, failed: 0, skipped: 0, dry_run: 0, total: 0 };
  for (const r of rows) {
    out[r.status] = r.c;
    out.total += r.c;
  }
  return out;
}

export function findDueReminders(hoursAhead = 24) {
  const target = new Date(Date.now() + hoursAhead * 3600_000);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
  const timeStr = `${pad(target.getHours())}:${pad(target.getMinutes())}`;

  return db.prepare(`
    SELECT b.* FROM bookings b
    WHERE b.date = ?
      AND b.status IN ('pending','confirmed')
      AND b.time <= ?
      AND NOT EXISTS (
        SELECT 1 FROM notification_log n
        WHERE n.booking_id = b.id AND n.type = 'reminder' AND n.status IN ('sent','dry_run')
      )
    ORDER BY b.time ASC
  `).all(dateStr, timeStr).map((b) => ({ ...b, addons: safeAddons(b.addons) }));
}

function safeAddons(s) {
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s || '[]'); } catch { return []; }
}

export { znsStatus };
