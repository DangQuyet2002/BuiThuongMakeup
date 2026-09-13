import { resolveSession, can, logAudit, createUser, countUsers } from './users.js';
import { logger } from './logger.js';
import { db } from '../db/database.js';

const LEGACY_TOKEN = process.env.ADMIN_TOKEN || 'moc-admin-2026';

function extractToken(req) {
  const header = req.headers['authorization'];
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.headers['x-admin-token'] || req.query.token || null;
}

export function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Cần đăng nhập quản trị', code: 'NO_TOKEN' });
  }

  const sessionUser = resolveSession(token);
  if (sessionUser) {
    req.user = sessionUser;
    req.authMethod = 'session';
    return next();
  }

  if (token === LEGACY_TOKEN) {
    req.user = { id: null, username: 'legacy', displayName: 'Mã chung', role: 'owner', legacy: true };
    req.authMethod = 'legacy';
    return next();
  }

  return res.status(401).json({ ok: false, error: 'Phiên đăng nhập đã hết hạn', code: 'SESSION_EXPIRED' });
}

export function requireRole(action) {
  return function (req, res, next) {
    if (!can(req.user, action)) {
      logAudit(req.user, 'bi_tu_choi', req.originalUrl, `thiếu quyền ${action}`, req.ip);
      return res.status(403).json({
        ok: false,
        error: 'Bạn không có quyền thực hiện thao tác này',
        code: 'FORBIDDEN',
      });
    }
    next();
  };
}

export function blockIfMustChangePassword(req, res, next) {
  if (req.user?.mustChange) {
    return res.status(403).json({
      ok: false,
      error: 'Bạn cần đổi mật khẩu trước khi tiếp tục',
      code: 'MUST_CHANGE_PASSWORD',
    });
  }
  next();
}

export async function ensureInitialAdmin() {
  if (countUsers() > 0) return;

  const envUser = process.env.ADMIN_USERNAME;
  const envPass = process.env.ADMIN_PASSWORD;

  const username = envUser || 'admin';
  const password = envPass || 'Admin@2026!Ok';
  const generated = !envPass;

  const r = createUser({
    username,
    password,
    displayName: 'Chủ studio',
    role: 'owner',
    mustChange: 0,
  });

  if (!r.ok) {
    logger.warn({ error: r.error }, 'không tạo được tài khoản quản trị đầu tiên');
    return;
  }

  logger.info({ username }, 'đã tạo tài khoản quản trị đầu tiên');

  if (generated) {
    console.log('');
    console.log('  ┌─────────────────────────────────────────────┐');
    console.log('  │  TÀI KHOẢN QUẢN TRỊ ĐẦU TIÊN                │');
    console.log('  ├─────────────────────────────────────────────┤');
    console.log(`  │  Tên đăng nhập : ${username.padEnd(27)}│`);
    console.log(`  │  Mật khẩu      : ${password.padEnd(27)}│`);
    console.log('  ├─────────────────────────────────────────────┤');
    console.log('  │  Hãy đổi mật khẩu ngay sau khi đăng nhập!   │');
    console.log('  └─────────────────────────────────────────────┘');
    console.log('');
  }
}

export function auditAction(action) {
  return function (req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode < 400) {
        logAudit(req.user, action, req.originalUrl, describeBody(body), req.ip);
      }
      return originalJson(body);
    };
    next();
  };
}

function describeBody(body) {
  try {
    if (!body || typeof body !== 'object') return null;
    if (body.data?.code) return `đơn ${body.data.code}`;
    if (body.data?.status) return `trạng thái → ${body.data.status}`;
    if (body.message) return body.message;
    return null;
  } catch {
    return null;
  }
}

export function authStatus() {
  const users = db.prepare('SELECT COUNT(*) c FROM users WHERE active = 1').get().c;
  const sessions = db.prepare("SELECT COUNT(*) c FROM sessions WHERE expires_at > datetime('now')").get().c;
  return {
    userCount: users,
    activeSessions: sessions,
    legacyTokenEnabled: !!process.env.ADMIN_TOKEN,
  };
}
