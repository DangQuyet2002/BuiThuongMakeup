import { Router } from 'express';
import { db } from '../db/database.js';
import {
  getSlotList, isValidDate, isValidPhone, normalizePhone,
  isSlotFree, calcTotal, createBooking, genCode, todayStr,
  suggestArtists, WORK_HOURS, SLOT_MINUTES,
} from '../src/booking.js';
import { rateLimit } from '../src/rate-limit.js';
import { notifyBookingCreated } from '../src/notifications.js';
import * as catalog from '../src/catalog.js';
import { listGallery } from '../src/gallery.js';
import { getSettings } from '../src/settings.js';
import { triggerSyncToSupabase } from '../db/supabase-sync.js';

const router = Router();

const bookingLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  name: 'booking',
  message: 'Bạn đã gửi yêu cầu đặt lịch nhiều lần. Vui lòng chờ một phút rồi thử lại.',
});

const lookupLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  name: 'lookup',
  message: 'Bạn tra cứu quá nhiều lần. Vui lòng chờ một phút.',
});

const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  name: 'read',
  message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
});

router.get('/services', readLimiter, (req, res) => {
  // Chỉ trả về mục đang hiện (active = 1) và theo đúng thứ tự quản trị viên đã sắp
  const services = catalog.listServices();
  const addons = catalog.listAddons();
  const combos = catalog.listCombos();
  const artists = catalog.listArtists();
  const faqs = catalog.listFaqs();

  res.json({
    ok: true,
    data: {
      services,
      addons,
      combos,
      artists,
      faqs,
      workHours: WORK_HOURS,
      slotMinutes: SLOT_MINUTES,
    },
  });
});

// Câu hỏi thường gặp
router.get('/faqs', readLimiter, (req, res) => {
  res.json({ ok: true, data: catalog.listFaqs() });
});

// Thư viện ảnh cho trang chủ. Rỗng nghĩa là chưa tải ảnh nào lên —
// lúc đó trang chủ tự dùng hình minh hoạ có sẵn.
router.get('/gallery', readLimiter, (req, res) => {
  res.json({ ok: true, data: listGallery() });
});

// Nội dung trang chủ do quản trị viên chỉnh (ảnh đầu trang, thống kê, thông tin liên hệ).
router.get('/settings', readLimiter, (req, res) => {
  res.json({ ok: true, data: getSettings() });
});

router.get('/slots', readLimiter, (req, res) => {
  const { date, artistId } = req.query;

  if (!date) {
    return res.status(400).json({ ok: false, error: 'Thiếu tham số date (YYYY-MM-DD)' });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ ok: false, error: 'Ngày không hợp lệ (định dạng YYYY-MM-DD)' });
  }

  const aid = artistId ? Number(artistId) : null;
  const slots = getSlotList(date, aid);
  const free = slots.filter((s) => s.available).length;

  res.json({ ok: true, data: { date, artistId: aid, slots, free, total: slots.length } });
});

router.get('/artists', readLimiter, (req, res) => {
  const { date, time, duration } = req.query;
  const list = db.prepare('SELECT id,name,initials,specialty,years FROM artists WHERE active=1 ORDER BY years DESC').all();

  if (date && time && isValidDate(date)) {
    const dur = Number(duration) || 60;
    return res.json({
      ok: true,
      data: list.map((a) => ({ ...a, available: isSlotFree(date, time, dur, a.id) })),
    });
  }
  res.json({ ok: true, data: list });
});

router.post('/bookings', bookingLimiter, async (req, res) => {
  const b = req.body || {};

  const errors = [];
  if (!b.date || !isValidDate(b.date)) errors.push('Ngày không hợp lệ');
  else if (b.date < todayStr()) errors.push('Không thể đặt lịch cho ngày đã qua');
  if (!b.time || !/^([01]\d|2[0-3]):(00|30)$/.test(b.time)) errors.push('Giờ không hợp lệ');
  if (!b.customer || String(b.customer).trim().length < 2) errors.push('Họ tên quá ngắn');
  if (!b.phone || !isValidPhone(b.phone)) errors.push('Số điện thoại không hợp lệ');
  if (!b.serviceId && !b.comboId) errors.push('Chưa chọn dịch vụ');

  if (errors.length) {
    return res.status(400).json({ ok: false, error: errors[0], errors });
  }

  const addonIds = Array.isArray(b.addonIds) ? b.addonIds.map(Number).filter(Boolean) : [];
  const comboId = b.comboId ? Number(b.comboId) : null;
  const serviceId = b.serviceId ? Number(b.serviceId) : null;

  const calc = calcTotal(serviceId, addonIds, comboId);
  if (!calc) {
    return res.status(400).json({ ok: false, error: 'Dịch vụ hoặc combo không tồn tại' });
  }

  const artistId = b.artistId ? Number(b.artistId) : null;

  if (!isSlotFree(b.date, b.time, calc.duration, artistId)) {
    return res.status(409).json({
      ok: false,
      error: 'Khung giờ này vừa được đặt hoặc không còn trống. Vui lòng chọn giờ khác.',
      code: 'SLOT_TAKEN',
    });
  }

  const settings = getSettings();
  let depositAmount = 0;
  if (settings.depositType === 'percent') {
    depositAmount = Math.round((calc.total * (settings.depositValue || 30)) / 100 / 1000) * 1000;
  } else {
    depositAmount = Math.min(calc.total, settings.depositValue || 200000);
  }

  const booking = createBooking({
    service_id: serviceId,
    service_name: calc.serviceName,
    combo_name: comboId ? calc.serviceName : null,
    date: b.date,
    time: b.time,
    duration: calc.duration,
    artist_id: artistId,
    customer: String(b.customer).trim(),
    phone: normalizePhone(b.phone),
    note: b.note ? String(b.note).trim().slice(0, 500) : null,
    addons: calc.addons,
    total: calc.total,
    deposit_amount: depositAmount,
  });

  // Tự động đẩy lên Supabase Cloud để lưu trữ vĩnh viễn
  triggerSyncToSupabase();

  const bankId = settings.bankId || 'MB';
  const bankAccount = settings.bankAccount || '';
  const bankAccountName = settings.bankAccountName || '';
  const transferContent = `${booking.code} ${booking.phone}`;
  const qrUrl = bankAccount
    ? `https://img.vietqr.io/image/${bankId}-${bankAccount}-compact2.png?amount=${depositAmount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(bankAccountName)}`
    : null;

  let notify;
  try {
    notify = await notifyBookingCreated({ ...booking, addons: calc.addons, deposit_amount: depositAmount });
  } catch (e) {
    console.error('Lỗi gửi thông báo:', e.message);
    notify = { result: { ok: false, error: e.message }, log: null };
  }

  const notifyInfo = notify.result.ok
    ? { sent: true, dryRun: !!notify.result.dryRun }
    : { sent: false, skipped: !!notify.result.skipped, error: notify.result.error };

  res.status(201).json({
    ok: true,
    data: {
      ...booking,
      addons: calc.addons,
      notification: notifyInfo,
      payment: {
        bank_id: bankId,
        bank_account: bankAccount,
        bank_account_name: bankAccountName,
        transfer_content: transferContent,
        deposit_amount: depositAmount,
        qr_url: qrUrl,
        zalo_phone: settings.zaloPhone || '0912345678',
      },
      message: `Đặt lịch thành công. Mã đơn ${booking.code}. Bùi Thương sẽ liên hệ qua Zalo trong 15 phút.`,
    },
  });
});

router.get('/bookings/lookup', lookupLimiter, (req, res) => {
  const { code, phone } = req.query;
  if (!code && !phone) {
    return res.status(400).json({ ok: false, error: 'Cần truyền code hoặc phone' });
  }

  let rows = [];
  if (code) {
    rows = db.prepare('SELECT * FROM bookings WHERE code = ?').all(String(code).trim());
  } else {
    rows = db.prepare('SELECT * FROM bookings WHERE phone = ? ORDER BY date DESC').all(normalizePhone(phone));
  }

  if (!rows.length) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy lịch đặt nào' });
  }

  res.json({
    ok: true,
    data: rows.map((r) => ({
      ...r,
      addons: (() => { try { return JSON.parse(r.addons || '[]'); } catch { return []; } })(),
      phone: r.phone.replace(/(\d{4})\d{3}(\d{3})/, '$1***$2'),
    })),
  });
});

router.post('/hold', readLimiter, (req, res) => {
  const { date, time, duration } = req.body || {};
  if (!isValidDate(date) || !/^([01]\d|2[0-3]):(00|30)$/.test(time || '')) {
    return res.status(400).json({ ok: false, error: 'Ngày hoặc giờ không hợp lệ' });
  }
  const free = isSlotFree(date, time, Number(duration) || 60, null);
  res.json({ ok: true, data: { date, time, available: free, holdSeconds: free ? 600 : 0 } });
});

export default router;
