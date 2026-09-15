import { Router } from 'express';
import { createHash } from 'crypto';
import {
  listBookings, updateStatus, updateDepositStatus,
  bookingStats, getBookingByCode, deleteBooking,
  createBooking, normalizePhone,
} from '../src/booking.js';
import { rateLimit } from '../src/rate-limit.js';
import {
  listNotifications, notificationStats, retryNotification,
  notifyStatusChanged, notifyReminder, znsStatus,
} from '../src/notifications.js';
import { reminderJobStats, runReminderNow } from '../src/reminder-job.js';
import {
  login, listUsers, createUser, setUserActive, changePassword,
  listSessions, revokeAllSessions, listAudit, can, ROLES,
} from '../src/users.js';
import {
  authenticate, requireRole, blockIfMustChangePassword, auditAction, authStatus,
} from '../src/auth-middleware.js';
import { hashPassword, generatePassword, verifyPassword } from '../src/auth.js';
import * as catalog from '../src/catalog.js';
import * as gallery from '../src/gallery.js';
import * as settings from '../src/settings.js';
import { upload, publicUrl, uploadsStatus, MAX_UPLOAD_MB, saveUploadToCloud } from '../src/uploads.js';
import { db } from '../db/database.js';
import { logger } from '../src/logger.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 8,
  name: 'admin-login',
  message: 'Sai thông tin đăng nhập quá nhiều lần. Vui lòng chờ 5 phút.',
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password, token } = req.body || {};

  if (!username && token) {
    const LEGACY = process.env.ADMIN_TOKEN || 'moc-admin-2026';
    if (token === LEGACY) {
      logger.warn({ ip: req.ip }, 'đăng nhập bằng mã chung cũ');
      return res.json({ ok: true, data: { token, legacy: true, user: { username: 'legacy', role: 'owner' } } });
    }
    return res.status(401).json({ ok: false, error: 'Mã quản trị không đúng' });
  }

  const r = login(username, password, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!r.ok) {
    logger.warn({ username, ip: req.ip }, 'đăng nhập thất bại');
    return res.status(401).json({ ok: false, error: r.error });
  }

  logger.info({ username: r.user.username, role: r.user.role }, 'đăng nhập thành công');
  res.json({
    ok: true,
    data: {
      token: r.token,
      expiresAt: r.expiresAt,
      user: r.user,
    },
  });
});

router.get('/auth-status', (req, res) => {
  const token = req.headers['authorization']?.slice(7) || req.headers['x-admin-token'];
  res.json({ ok: true, data: { ...authStatus(), hasToken: !!token } });
});

router.use(authenticate);

router.get('/me', (req, res) => {
  res.json({
    ok: true,
    data: {
      ...req.user,
      permissions: {
        read: can(req.user, 'read'),
        write: can(req.user, 'write'),
        admin: req.user.role === 'owner',
      },
      authMethod: req.authMethod,
    },
  });
});

router.post('/logout', blockIfMustChangePassword, (req, res) => {
  const token = req.headers['authorization']?.slice(7) || req.headers['x-admin-token'];
  if (token && !req.user?.legacy) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .run(createHash('sha256').update(token).digest('hex'));
  }
  res.json({ ok: true, message: 'Đã đăng xuất' });
});

router.post('/change-password', auditAction('doi_mat_khau'), (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (req.user.legacy) {
    return res.status(400).json({ ok: false, error: 'Đang dùng mã chung cũ, không đổi được mật khẩu' });
  }
  if (!currentPassword) {
    return res.status(400).json({ ok: false, error: 'Vui lòng nhập mật khẩu hiện tại' });
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    logger.warn({ username: req.user.username }, 'đổi mật khẩu: sai mật khẩu hiện tại');
    return res.status(400).json({ ok: false, error: 'Mật khẩu hiện tại không đúng' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ ok: false, error: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
  }

  const r = changePassword(req.user.id, newPassword);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });

  logger.info({ username: req.user.username }, 'đổi mật khẩu');
  res.json({ ok: true, message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' });
});

router.get('/stats', requireRole('read'), (req, res) => {
  res.json({ ok: true, data: bookingStats() });
});

router.get('/bookings', requireRole('read'), (req, res) => {
  const { date, status, phone, limit } = req.query;
  const rows = listBookings({ date, status, phone, limit });
  res.json({ ok: true, data: rows, count: rows.length });
});

router.get('/bookings/:code/detail', requireRole('read'), (req, res) => {
  const b = getBookingByCode(req.params.code);
  if (!b) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });
  const logs = listNotifications({ bookingId: b.id });
  res.json({ ok: true, data: { booking: b, notifications: logs } });
});

router.post('/bookings', requireRole('write'), auditAction('tao_don_thu_cong'), async (req, res) => {
  const b = req.body || {};
  if (!b.date) return res.status(400).json({ ok: false, error: 'Vui lòng chọn ngày hẹn' });
  if (!b.time) return res.status(400).json({ ok: false, error: 'Vui lòng chọn giờ hẹn' });
  if (!b.customer || String(b.customer).trim().length < 2) return res.status(400).json({ ok: false, error: 'Vui lòng nhập họ tên khách hàng' });
  if (!b.phone) return res.status(400).json({ ok: false, error: 'Vui lòng nhập số điện thoại' });

  const booking = createBooking({
    service_id: b.serviceId ? Number(b.serviceId) : null,
    service_name: b.serviceName || 'Dịch vụ Makeup',
    combo_name: b.comboName || null,
    date: b.date,
    time: b.time,
    duration: Number(b.duration) || 60,
    artist_id: b.artistId ? Number(b.artistId) : null,
    customer: String(b.customer).trim(),
    phone: normalizePhone(b.phone),
    location_type: b.location_type || b.locationType || (b.address ? 'home' : 'studio'),
    address: b.address ? String(b.address).trim() : null,
    note: b.note ? String(b.note).trim() : null,
    addons: Array.isArray(b.addons) ? b.addons : [],
    total: Number(b.total) || 0,
    deposit_amount: Number(b.depositAmount) || 0,
    deposit_status: b.depositStatus || (Number(b.depositAmount) > 0 ? 'paid' : 'unpaid'),
    status: b.status || 'confirmed',
  });

  try {
    const { triggerSyncToSupabase } = await import('../db/supabase-sync.js');
    triggerSyncToSupabase();
  } catch {}

  res.status(201).json({
    ok: true,
    data: booking,
    message: `Đã tạo thành công lịch hẹn ${booking.code}`,
  });
});

router.patch('/bookings/:id/status', requireRole('write'), auditAction('doi_trang_thai'), async (req, res) => {
  const { status } = req.body || {};
  const updated = updateStatus(Number(req.params.id), status);
  if (!updated) {
    return res.status(400).json({ ok: false, error: 'Trạng thái hoặc đơn không hợp lệ' });
  }

  let notify = null;
  if (req.body.notify !== false) {
    try {
      const r = await notifyStatusChanged({
        ...updated,
        addons: parseAddons(updated.addons),
      });
      notify = r.result.ok
        ? { sent: true, dryRun: !!r.result.dryRun }
        : { sent: false, skipped: !!r.result.skipped, error: r.result.error };
    } catch (e) {
      logger.error({ err: { message: e.message } }, 'lỗi gửi thông báo đổi trạng thái');
      notify = { sent: false, error: e.message };
    }
  }

  res.json({ ok: true, data: updated, notification: notify });
});

router.patch('/bookings/:id/deposit', requireRole('write'), auditAction('xac_nhan_coc'), async (req, res) => {
  const { depositStatus } = req.body || {};
  const status = depositStatus || 'paid';
  const updated = updateDepositStatus(Number(req.params.id), status);
  if (!updated) {
    return res.status(400).json({ ok: false, error: 'Không tìm thấy đơn' });
  }

  let notify = null;
  if (status === 'paid' && req.body.notify !== false) {
    try {
      const r = await notifyStatusChanged({
        ...updated,
        addons: parseAddons(updated.addons),
      });
      notify = r.result.ok
        ? { sent: true, dryRun: !!r.result.dryRun }
        : { sent: false, skipped: !!r.result.skipped, error: r.result.error };
    } catch (e) {
      logger.error({ err: { message: e.message } }, 'lỗi gửi thông báo xác nhận cọc');
      notify = { sent: false, error: e.message };
    }
  }

  res.json({ ok: true, data: updated, notification: notify, message: status === 'paid' ? 'Đã xác nhận nhận cọc' : 'Đã cập nhật cọc' });
});

router.delete('/bookings/:id', requireRole('write'), auditAction('xoa_don'), async (req, res) => {
  const deleted = deleteBooking(Number(req.params.id));
  if (!deleted) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });

  try {
    const { triggerSyncToSupabase } = await import('../db/supabase-sync.js');
    triggerSyncToSupabase();
  } catch {
    // ignore
  }

  res.json({ ok: true, data: deleted, message: `Đã xoá vĩnh viễn đơn ${deleted.code}` });
});

router.get('/notifications', requireRole('read'), (req, res) => {
  const { bookingId, status, type, limit } = req.query;
  const rows = listNotifications({ bookingId, status, type, limit });
  res.json({ ok: true, data: rows, count: rows.length });
});

router.get('/notifications/stats', requireRole('read'), (req, res) => {
  res.json({
    ok: true,
    data: {
      logs: notificationStats(),
      zalo: znsStatus(),
      reminder: reminderJobStats(),
    },
  });
});

router.post('/notifications/:id/retry', requireRole('write'), auditAction('gui_lai_tin'), async (req, res) => {
  const r = await retryNotification(Number(req.params.id));
  if (!r.log && !r.result?.ok) {
    return res.status(400).json({ ok: false, error: r.result?.error || r.error || 'Gửi lại thất bại' });
  }
  res.json({
    ok: true,
    data: r.log,
    result: r.result.ok ? { sent: true, dryRun: !!r.result.dryRun } : { sent: false, error: r.result.error },
  });
});

router.post('/reminders/run', requireRole('write'), auditAction('chay_nhac_hen'), async (req, res) => {
  const r = await runReminderNow();
  res.json({ ok: true, data: r, message: `Đã kiểm tra ${r.checked} đơn, gửi thành công ${r.sent}` });
});

router.get('/reminders/preview', requireRole('read'), async (req, res) => {
  const m = await import('../src/notifications.js');
  const due = m.findDueReminders(Number(req.query.hours) || 24);
  res.json({ ok: true, data: due, count: due.length });
});

router.get('/telegram/status', requireRole('read'), async (req, res) => {
  const { getTelegramConfig } = await import('../src/telegram.js');
  res.json({ ok: true, data: getTelegramConfig() });
});

router.post('/telegram/test', requireRole('write'), auditAction('thu_telegram'), async (req, res) => {
  const { token, chatId } = req.body || {};
  const { testTelegram, registerTelegramWebhook } = await import('../src/telegram.js');
  const result = await testTelegram(token, chatId);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error || 'Gửi tin nhắn Telegram thất bại' });
  }
  // Tự động đăng ký Webhook để nhận tin nhắn 2 chiều khi chủ chat với Bot
  registerTelegramWebhook(token).catch(() => {});
  res.json({ ok: true, message: 'Đã gửi tin nhắn thử nghiệm thành công về Telegram của bạn!' });
});

router.post('/users', requireRole('admin'), auditAction('tao_tai_khoan'), (req, res) => {
  const { username, password, displayName, role } = req.body || {};
  const pw = password || generatePassword(14);

  const r = createUser({
    username,
    password: pw,
    displayName,
    role: ROLES.includes(role) ? role : 'staff',
  });

  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });

  logger.info({ by: req.user.username, created: r.user.username, role: r.user.role }, 'tạo tài khoản');

  res.status(201).json({
    ok: true,
    data: { user: r.user, generatedPassword: password ? null : pw },
    message: password ? 'Đã tạo tài khoản' : `Đã tạo tài khoản. Mật khẩu tự sinh: ${pw}`,
  });
});

router.get('/users', requireRole('admin'), (req, res) => {
  res.json({ ok: true, data: listUsers() });
});

router.patch('/users/:id/active', requireRole('admin'), auditAction('khoa_tai_khoan'), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ ok: false, error: 'Không thể tự khoá tài khoản của mình' });
  }
  const ok = setUserActive(id, !!req.body?.active);
  if (!ok) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });
  res.json({ ok: true, message: req.body?.active ? 'Đã mở khoá tài khoản' : 'Đã khoá tài khoản' });
});

router.post('/users/:id/reset-password', requireRole('admin'), auditAction('dat_lai_mat_khau'), (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT id,username FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản' });

  const pw = req.body?.newPassword || generatePassword(14);

  db.prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?')
    .run(hashPassword(pw), id);
  revokeAllSessions(id);

  logger.warn({ by: req.user.username, target: user.username }, 'đặt lại mật khẩu');

  res.json({
    ok: true,
    data: { username: user.username, newPassword: pw },
    message: `Đã đặt lại mật khẩu cho ${user.username}. Người dùng cần đổi khi đăng nhập.`,
  });
});

router.get('/users/:id/sessions', requireRole('admin'), (req, res) => {
  res.json({ ok: true, data: listSessions(Number(req.params.id)) });
});

router.delete('/users/:id/sessions', requireRole('admin'), auditAction('dang_xuat_moi_thiet_bi'), (req, res) => {
  const n = revokeAllSessions(Number(req.params.id));
  res.json({ ok: true, message: `Đã đăng xuất ${n} thiết bị` });
});

router.get('/audit', requireRole('admin'), (req, res) => {
  const rows = listAudit({ limit: req.query.limit, action: req.query.action });
  res.json({ ok: true, data: rows, count: rows.length });
});

/* ============================================================
   TẢI ẢNH LÊN
   ============================================================ */

function handleUpload(req, res, next) {
  upload.array('files', 5)(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ ok: false, error: `Ảnh quá lớn. Tối đa ${MAX_UPLOAD_MB}MB mỗi ảnh.` });
    }
    if (err.code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ ok: false, error: 'Tối đa 5 ảnh mỗi lần tải lên' });
    }
    // Sai tên trường trong form: multer báo LIMIT_UNEXPECTED_FILE.
    // Trước đây gộp chung với LIMIT_FILE_COUNT nên báo nhầm thành "quá số ảnh".
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        ok: false,
        error: "Tên trường ảnh không đúng. Dùng trường tên 'files' cho mỗi ảnh.",
      });
    }
    logger.error({ err: { message: err.message } }, 'lỗi tải ảnh lên');
    return res.status(400).json({ ok: false, error: 'Không tải được ảnh lên' });
  });
}

router.get('/uploads/status', requireRole('read'), (req, res) => {
  res.json({ ok: true, data: uploadsStatus() });
});

router.post('/uploads', requireRole('write'), auditAction('tai_anh_len'), handleUpload, (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ ok: false, error: 'Chưa chọn ảnh nào' });
  }

  // Tự động đẩy lên Supabase Cloud để lưu trữ vĩnh viễn
  for (const f of files) {
    saveUploadToCloud(f.filename, f.path, f.mimetype).catch(() => {});
  }

  const data = files.map((f) => ({
    filename: f.filename,
    url: publicUrl(f.filename),
    size: f.size,
    type: f.mimetype,
  }));

  logger.info({ by: req.user.username, count: data.length }, 'tải ảnh lên');

  res.status(201).json({
    ok: true,
    data,
    message: `Đã tải lên ${data.length} ảnh`,
  });
});

/* ============================================================
   QUẢN LÝ DỊCH VỤ · GIÁ · COMBO · CHUYÊN VIÊN
   ============================================================ */

const CATALOG_OPS = {
  services: {
    label: 'dịch vụ',
    list: () => catalog.listServices({ includeInactive: true }),
    create: catalog.createService,
    update: catalog.updateService,
    setActive: catalog.setServiceActive,
    remove: catalog.deleteService,
  },
  addons: {
    label: 'dịch vụ kèm',
    list: () => catalog.listAddons({ includeInactive: true }),
    create: catalog.createAddon,
    update: catalog.updateAddon,
    setActive: catalog.setAddonActive,
    remove: catalog.deleteAddon,
  },
  combos: {
    label: 'combo',
    list: () => catalog.listCombos({ includeInactive: true }),
    create: catalog.createCombo,
    update: catalog.updateCombo,
    setActive: catalog.setComboActive,
    remove: catalog.deleteCombo,
  },
  artists: {
    label: 'chuyên viên',
    list: () => catalog.listArtists({ includeInactive: true }),
    create: catalog.createArtist,
    update: catalog.updateArtist,
    setActive: catalog.setArtistActive,
    remove: catalog.deleteArtist,
  },
  faqs: {
    label: 'câu hỏi thường gặp',
    list: () => catalog.listFaqs({ includeInactive: true }),
    create: catalog.createFaq,
    update: catalog.updateFaq,
    setActive: catalog.setFaqActive,
    remove: catalog.deleteFaq,
  },
};

function resolveKind(req, res) {
  const ops = CATALOG_OPS[req.params.kind];
  if (!ops) {
    res.status(400).json({ ok: false, error: 'Loại nội dung không hợp lệ' });
    return null;
  }
  return ops;
}

// Toàn bộ nội dung hiển thị trên landing page, kể cả mục đang ẩn
router.get('/catalog', requireRole('read'), (req, res) => {
  res.json({
    ok: true,
    data: {
      services: CATALOG_OPS.services.list(),
      addons: CATALOG_OPS.addons.list(),
      combos: CATALOG_OPS.combos.list(),
      artists: CATALOG_OPS.artists.list(),
      faqs: CATALOG_OPS.faqs.list(),
      gallery: gallery.listGallery({ includeInactive: true, includeIncomplete: true }),
      galleryStats: gallery.galleryStats(),
    },
  });
});

router.post('/catalog/:kind/reorder', requireRole('write'), auditAction('sap_xep_noi_dung'), (req, res) => {
  const ops = resolveKind(req, res);
  if (!ops) return;

  const r = catalog.reorder(req.params.kind, req.body?.ids);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });

  res.json({ ok: true, message: `Đã lưu thứ tự ${ops.label}` });
});

router.post('/catalog/:kind', requireRole('write'), auditAction('them_noi_dung'), (req, res) => {
  const ops = resolveKind(req, res);
  if (!ops) return;

  const r = ops.create(req.body || {});
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });

  logger.info({ by: req.user.username, kind: req.params.kind, name: r.data.name }, 'thêm nội dung');
  res.status(201).json({ ok: true, data: r.data, message: `Đã thêm ${ops.label}` });
});

router.patch('/catalog/:kind/:id/active', requireRole('write'), auditAction('an_hien_noi_dung'), (req, res) => {
  const ops = resolveKind(req, res);
  if (!ops) return;

  const active = !!req.body?.active;
  const ok = ops.setActive(Number(req.params.id), active);
  if (!ok) return res.status(404).json({ ok: false, error: `Không tìm thấy ${ops.label}` });

  res.json({ ok: true, message: active ? `Đã hiện ${ops.label}` : `Đã ẩn ${ops.label}` });
});

router.patch('/catalog/:kind/:id', requireRole('write'), auditAction('sua_noi_dung'), (req, res) => {
  const ops = resolveKind(req, res);
  if (!ops) return;

  const r = ops.update(Number(req.params.id), req.body || {});
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });

  res.json({ ok: true, data: r.data, message: `Đã lưu ${ops.label}` });
});

router.delete('/catalog/:kind/:id', requireRole('admin'), auditAction('xoa_noi_dung'), (req, res) => {
  const ops = resolveKind(req, res);
  if (!ops) return;

  const r = ops.remove(Number(req.params.id));
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });

  res.json({ ok: true, message: `Đã xoá ${ops.label}` });
});

/* ============================================================
   THƯ VIỆN ẢNH
   ============================================================ */

router.get('/gallery', requireRole('read'), (req, res) => {
  res.json({
    ok: true,
    data: gallery.listGallery({ includeInactive: true, includeIncomplete: true }),
    stats: gallery.galleryStats(),
  });
});

router.post('/gallery/reorder', requireRole('write'), auditAction('sap_xep_anh'), (req, res) => {
  const r = gallery.reorderGallery(req.body?.ids);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  res.json({ ok: true, message: 'Đã lưu thứ tự ảnh' });
});

router.post('/gallery', requireRole('write'), auditAction('them_anh'), (req, res) => {
  const r = gallery.createGalleryItem(req.body || {});
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });

  logger.info({ by: req.user.username, title: r.data.title }, 'thêm ảnh vào thư viện');
  res.status(201).json({ ok: true, data: r.data, message: 'Đã thêm ảnh' });
});

router.patch('/gallery/:id/active', requireRole('write'), auditAction('an_hien_anh'), (req, res) => {
  const active = !!req.body?.active;
  const ok = gallery.setGalleryActive(Number(req.params.id), active);
  if (!ok) return res.status(404).json({ ok: false, error: 'Không tìm thấy ảnh' });
  res.json({ ok: true, message: active ? 'Đã hiện ảnh' : 'Đã ẩn ảnh' });
});

router.patch('/gallery/:id', requireRole('write'), auditAction('sua_anh'), (req, res) => {
  const r = gallery.updateGalleryItem(Number(req.params.id), req.body || {});
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  res.json({ ok: true, data: r.data, message: 'Đã lưu ảnh' });
});

router.delete('/gallery/:id', requireRole('write'), auditAction('xoa_anh'), (req, res) => {
  const r = gallery.deleteGalleryItem(Number(req.params.id));
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  res.json({ ok: true, message: 'Đã xoá ảnh' });
});

/* ===== nội dung trang chủ (ảnh đầu trang) ===== */

router.get('/settings', requireRole('read'), (req, res) => {
  res.json({ ok: true, data: settings.getSettings(), fields: settings.FIELDS });
});

router.patch('/settings', requireRole('write'), auditAction('sua_trang_chu'), (req, res) => {
  let r;
  try {
    r = settings.updateSettings(req.body || {});
  } catch (e) {
    // Lỗi do đường dẫn ảnh không hợp lệ — báo đúng trường để giao diện chỉ ra
    return res.status(400).json({ ok: false, error: e.message, field: e.field });
  }

  logger.info({ by: req.user.username, changed: r.changed }, 'cập nhật nội dung trang chủ');

  res.json({ ok: true, data: r.data, message: settingsMessage(r) });
});

// Xoá một ảnh khỏi danh sách ảnh đầu trang (không ảnh hưởng các ảnh còn lại)
router.delete('/settings/hero/:name', requireRole('write'), auditAction('sua_trang_chu'), (req, res) => {
  let r;
  try {
    r = settings.removeHeroImage('/uploads/' + req.params.name);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message, field: e.field });
  }

  logger.info({ by: req.user.username, removed: req.params.name }, 'gỡ một ảnh đầu trang');

  res.json({ ok: true, data: r.data, message: 'Đã gỡ ảnh khỏi đầu trang' });
});

// Thông báo gửi về giao diện — nói rõ vừa thay đổi điều gì
function settingsMessage(r) {
  if (!r.changed.length) return 'Không có thay đổi nào';

  const hasBank = r.changed.some((c) => ['bankId', 'bankAccount', 'bankAccountName', 'depositType', 'depositValue', 'zaloPhone'].includes(c));
  if (hasBank && !r.changed.includes('heroImages')) {
    return 'Đã lưu cấu hình thanh toán & tiền cọc';
  }

  const onlyToggle = r.changed.every((c) => c !== 'heroImages');
  if (onlyToggle) return 'Đã lưu thiết lập';

  const n = r.data.heroCount || 0;
  if (n === 0) return 'Đã gỡ hết ảnh đầu trang';
  return n === 1 ? 'Đã lưu ảnh đầu trang' : `Đã lưu ${n} ảnh đầu trang`;
}

function parseAddons(s) {
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s || '[]'); } catch { return []; }
}

export default router;
