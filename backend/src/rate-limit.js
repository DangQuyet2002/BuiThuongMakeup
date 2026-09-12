import { db } from '../db/database.js';

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60_000;

function cleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  try {
    db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(now);
  } catch { /* dọn dẹp lỗi không ảnh hưởng request */ }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

const incrStmt = () => db.prepare(`
  INSERT INTO rate_limits (bucket_key, count, reset_at)
  VALUES (?, 1, ?)
  ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1
  RETURNING count, reset_at
`);

export function rateLimit({ windowMs = 60_000, max = 10, name = 'default', message } = {}) {
  return function (req, res, next) {
    const key = `${name}:${clientIp(req)}`;
    const now = Date.now();

    cleanupIfNeeded();

    let row;
    try {
      const existing = db.prepare('SELECT count, reset_at FROM rate_limits WHERE bucket_key = ?').get(key);

      if (!existing || existing.reset_at < now) {
        db.prepare(`
          INSERT INTO rate_limits (bucket_key, count, reset_at) VALUES (?,1,?)
          ON CONFLICT(bucket_key) DO UPDATE SET count = 1, reset_at = excluded.reset_at
        `).run(key, now + windowMs);
        row = { count: 1, reset_at: now + windowMs };
      } else {
        row = incrStmt().get(key, now + windowMs);
      }
    } catch (e) {
      console.error('Rate limit lỗi, cho qua request:', e.message);
      return next();
    }

    const remaining = Math.max(0, max - row.count);
    const resetSec = Math.max(0, Math.ceil((row.reset_at - now) / 1000));

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(row.reset_at / 1000));

    if (row.count > max) {
      res.setHeader('Retry-After', resetSec);
      return res.status(429).json({
        ok: false,
        error: message || `Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${resetSec} giây.`,
        code: 'RATE_LIMITED',
        retryAfter: resetSec,
      });
    }
    next();
  };
}

export function rateLimitStats() {
  const now = Date.now();
  const active = db.prepare('SELECT COUNT(*) c FROM rate_limits WHERE reset_at > ?').get(now).c;
  const total = db.prepare('SELECT COUNT(*) c FROM rate_limits').get().c;
  return { activeBuckets: active, totalBuckets: total };
}

export function resetRateLimits() {
  return db.prepare('DELETE FROM rate_limits').run().changes;
}
