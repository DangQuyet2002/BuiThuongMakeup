import { db } from '../db/database.js';
import {
  hashPassword, verifyPassword, generateSessionToken,
  hashToken, passwordStrength,
} from './auth.js';

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);
const ROLES = ['owner', 'staff', 'viewer'];

export function createUser({ username, password, displayName, role = 'staff', mustChange = 0 }) {
  const name = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) {
    return { ok: false, error: 'Tên đăng nhập chỉ gồm chữ thường, số, dấu . _ - (3–32 ký tự)' };
  }
  if (!ROLES.includes(role)) {
    return { ok: false, error: 'Vai trò không hợp lệ' };
  }
  const strength = passwordStrength(password);
  if (!strength.ok) {
    return { ok: false, error: 'Mật khẩu yếu: ' + strength.problems.join(', ') };
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(name);
  if (exists) return { ok: false, error: 'Tên đăng nhập đã tồn tại' };

  const info = db.prepare(`
    INSERT INTO users (username, display_name, password_hash, role, must_change)
    VALUES (?,?,?,?,?)
  `).run(name, displayName || name, hashPassword(password), role, mustChange ? 1 : 0);

  return { ok: true, user: getUserById(info.lastInsertRowid) };
}

export function getUserById(id) {
  return db.prepare(
    'SELECT id,username,display_name,role,active,created_at,last_login,must_change FROM users WHERE id = ?'
  ).get(id) || null;
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim().toLowerCase()) || null;
}

export function listUsers() {
  return db.prepare(
    'SELECT id,username,display_name,role,active,created_at,last_login,must_change FROM users ORDER BY role, username'
  ).all();
}

export function countUsers() {
  return db.prepare('SELECT COUNT(*) c FROM users WHERE active = 1').get().c;
}

export function setUserActive(id, active) {
  const info = db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  return info.changes > 0;
}

export function changePassword(id, newPassword) {
  const strength = passwordStrength(newPassword);
  if (!strength.ok) {
    return { ok: false, error: 'Mật khẩu yếu: ' + strength.problems.join(', ') };
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?')
    .run(hashPassword(newPassword), id);
  revokeAllSessions(id);
  return { ok: true };
}

export function login(username, password, meta = {}) {
  const user = getUserByUsername(username);
  if (!user) return { ok: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng' };
  if (!user.active) return { ok: false, error: 'Tài khoản đã bị khoá' };

  if (!verifyPassword(password, user.password_hash)) {
    return { ok: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng' };
  }

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, last_seen, ip, user_agent)
    VALUES (?,?,?,?,?,?)
  `).run(
    hashToken(token),
    user.id,
    expiresAt.toISOString(),
    new Date().toISOString(),
    meta.ip || null,
    (meta.userAgent || '').slice(0, 200)
  );

  db.prepare("UPDATE users SET last_login = datetime('now','localtime') WHERE id = ?").run(user.id);

  return {
    ok: true,
    token,
    expiresAt: expiresAt.toISOString(),
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      mustChange: !!user.must_change,
    },
  };
}

export function resolveSession(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.id AS session_id, s.expires_at, s.user_id,
           u.username, u.display_name, u.role, u.active, u.must_change
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(hashToken(token));

  if (!row) return null;
  if (!row.active) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }

  db.prepare("UPDATE sessions SET last_seen = datetime('now','localtime') WHERE id = ?")
    .run(row.session_id);

  return {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChange: !!row.must_change,
  };
}

export function revokeSession(token) {
  const info = db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  return info.changes > 0;
}

export function revokeAllSessions(userId) {
  return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

export function cleanupSessions() {
  return db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run().changes;
}

export function listSessions(userId) {
  return db.prepare(`
    SELECT id, created_at, expires_at, last_seen, ip, user_agent
    FROM sessions WHERE user_id = ? ORDER BY last_seen DESC
  `).all(userId);
}

export function can(user, action) {
  if (!user) return false;
  if (user.role === 'owner') return true;
  if (user.role === 'viewer') return action === 'read';
  return ['read', 'write'].includes(action);
}

export function logAudit(user, action, target, detail, ip) {
  try {
    db.prepare(`
      INSERT INTO audit_log (user_id, username, action, target, detail, ip)
      VALUES (?,?,?,?,?,?)
    `).run(user?.id ?? null, user?.username ?? null, action, target ?? null, detail ?? null, ip ?? null);
  } catch { /* ghi log kiểm toán không được làm hỏng request */ }
}

export function listAudit({ limit = 100, action } = {}) {
  const where = action ? 'WHERE action = ?' : '';
  const params = action ? [action] : [];
  return db.prepare(`
    SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ?
  `).all(...params, Math.min(Number(limit) || 100, 500));
}

export { SESSION_TTL_HOURS, ROLES };
