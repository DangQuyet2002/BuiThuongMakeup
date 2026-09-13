import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { basename, dirname, join } from 'path';
import { existsSync, writeFileSync } from 'fs';

import { initSchema } from './db/database.js';
import { pullFromSupabase, pushAllToSupabase } from './db/supabase-sync.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import { startReminderJob, stopReminderJob } from './src/reminder-job.js';
import { znsStatus } from './src/notify.js';
import { logger, requestLogger, errorLogger, LOG_PATHS } from './src/logger.js';
import { ensureInitialAdmin, authStatus } from './src/auth-middleware.js';
import { cleanupSessions } from './src/users.js';
import { rateLimitStats } from './src/rate-limit.js';
import { UPLOADS_DIR, uploadsStatus, getUploadFromCloud } from './src/uploads.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

initSchema();
await pullFromSupabase().catch(e => console.error('[Supabase] Initial sync failed:', e.message));

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(requestLogger);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    data: {
      service: 'Bùi Thương Makeup API',
      version: '1.2.0',
      time: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      zalo: znsStatus(),
      auth: authStatus(),
      rateLimit: rateLimitStats(),
      uploads: uploadsStatus(),
      logs: { dir: LOG_PATHS.dir, toFile: LOG_PATHS.toFile },
    },
  });
});

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Ảnh do quản trị viên tải lên (ưu tiên bộ nhớ đệm đĩa cục bộ)
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  index: false,
  dotfiles: 'deny',
}));

// Fallback: nếu đĩa bị xoá sau khi Render restart, tự động tải từ Supabase Cloud về và phục vụ ngay
app.get('/uploads/:filename', async (req, res, next) => {
  const filename = basename(req.params.filename);
  const cloudFile = await getUploadFromCloud(filename).catch(() => null);
  if (cloudFile && cloudFile.data) {
    try {
      const full = join(UPLOADS_DIR, filename);
      writeFileSync(full, cloudFile.data);
    } catch {}
    res.setHeader('Content-Type', cloudFile.mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.send(cloudFile.data);
  }
  next();
});

const publicDir = join(__dirname, '..');

// Trang HTML phải luôn được tải lại từ máy chủ: sửa giao diện xong mà trình duyệt
// còn dùng bản cũ trong bộ nhớ đệm thì người dùng vẫn thấy giao diện cũ.
// Các tài nguyên khác (ảnh, css, js) vẫn để trình duyệt đệm bình thường.
function noCacheHtml(res, path) {
  if (path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}

if (existsSync(join(publicDir, 'index.html'))) {
  app.use(express.static(publicDir, { index: 'index.html', setHeaders: noCacheHtml }));
}

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ ok: false, error: 'Endpoint không tồn tại' });
  }
  const index = join(publicDir, 'index.html');
  if (existsSync(index)) {
    // 404 trả về trang chủ — cũng là HTML nên phải chặn đệm tương tự
    noCacheHtml(res, 'index.html');
    return res.status(404).sendFile(index);
  }
  res.status(404).send('Không tìm thấy trang');
});

app.use(errorLogger);

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Dữ liệu gửi lên không phải JSON hợp lệ' });
  }
  res.status(500).json({ ok: false, error: 'Lỗi hệ thống, vui lòng thử lại sau' });
});

const server = app.listen(PORT, async () => {
  const zns = znsStatus();

  console.log('');
  console.log('  Bùi Thương Makeup API đang chạy');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Trang chủ   : http://localhost:${PORT}/`);
  console.log(`  → Quản trị    : http://localhost:${PORT}/admin.html`);
  console.log(`  → Kiểm tra    : http://localhost:${PORT}/api/health`);
  console.log('');

  await ensureInitialAdmin();

  if (zns.dryRun) {
    console.log('  Zalo ZNS      : CHẠY THỬ (không gửi tin thật)');
  } else if (zns.enabled) {
    console.log('  Zalo ZNS      : đã bật');
    console.log(`    template đơn mới : ${zns.hasBookingTemplate ? 'có' : 'THIẾU'}`);
    console.log(`    template nhắc hẹn: ${zns.hasReminderTemplate ? 'có' : 'THIẾU'}`);
    console.log(`    template đổi trạng thái: ${zns.hasStatusTemplate ? 'có' : 'THIẾU'}`);
  } else {
    console.log('  Zalo ZNS      : chưa cấu hình (tin nhắn sẽ được ghi log, không gửi)');
  }

  console.log(`  Ghi log       : ${LOG_PATHS.toFile ? LOG_PATHS.dir : 'chỉ ra màn hình'}`);
  console.log(`  Tài khoản     : ${authStatus().userCount} đang hoạt động`);
  console.log('');

  startReminderJob();

  // Dọn phiên hết hạn ngay khi khởi động, sau đó định kỳ 30 phút.
  const purged = cleanupSessions();
  if (purged) logger.info({ removed: purged }, 'dọn phiên hết hạn khi khởi động');

  const sessionCleaner = setInterval(() => {
    const n = cleanupSessions();
    if (n) logger.info({ removed: n }, 'dọn phiên hết hạn');
  }, 30 * 60_000);
  sessionCleaner.unref();

  // Tự động sao lưu dữ liệu lên Supabase Cloud định kỳ 20 giây
  const cloudSync = setInterval(() => {
    pushAllToSupabase().catch(e => logger.warn({ error: e.message }, '[Supabase] Sync error'));
  }, 20_000);
  cloudSync.unref();

  console.log('  Cloud Database: đã kết nối Supabase (Lưu trữ vĩnh viễn)');
  console.log('');
});

function shutdown(signal) {
  logger.info({ signal }, 'đang tắt server');
  stopReminderJob();
  server.close(() => {
    logger.info('server đã tắt an toàn');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: { message: String(reason) } }, 'promise bị từ chối không xử lý');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err: { message: err.message, stack: err.stack } }, 'lỗi không bắt được');
  shutdown('uncaughtException');
});
