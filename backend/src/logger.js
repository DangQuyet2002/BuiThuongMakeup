import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = process.env.LOG_DIR || join(__dirname, '..', 'logs');

const LEVEL = process.env.LOG_LEVEL || 'info';
const PRETTY = process.env.LOG_PRETTY === '1';
const TO_FILE = process.env.LOG_TO_FILE !== '0';

if (TO_FILE && !existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const targets = [];

if (PRETTY) {
  targets.push({
    target: 'pino/file',
    level: LEVEL,
    options: { destination: 1 },
  });
}

if (TO_FILE) {
  targets.push({
    target: 'pino-roll',
    level: LEVEL,
    options: {
      file: join(LOG_DIR, 'app.log'),
      frequency: 'daily',
      size: '10m',
      mkdir: true,
      limit: { count: 14 },
    },
  });

  targets.push({
    target: 'pino-roll',
    level: 'error',
    options: {
      file: join(LOG_DIR, 'error.log'),
      frequency: 'daily',
      size: '10m',
      mkdir: true,
      limit: { count: 30 },
    },
  });
}

if (!targets.length) {
  targets.push({ target: 'pino/file', level: LEVEL, options: { destination: 1 } });
}

export const logger = pino(
  {
    level: LEVEL,
    base: { service: 'moc-studio' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-admin-token"]',
        'req.headers.cookie',
        'password',
        'token',
        '*.password',
        '*.password_hash',
        '*.token',
      ],
      censor: '[đã ẩn]',
    },
  },
  pino.transport({ targets })
);

export function requestLogger(req, res, next) {
  const start = Date.now();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;

  res.on('finish', () => {
    const ms = Date.now() - start;
    const payload = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms,
      ip,
    };

    if (res.statusCode >= 500) logger.error(payload, 'request lỗi');
    else if (res.statusCode >= 400) logger.warn(payload, 'request bị từ chối');
    else logger.info(payload, 'request');
  });

  next();
}

export function errorLogger(err, req, res, next) {
  logger.error(
    {
      err: { message: err.message, stack: err.stack, type: err.type },
      url: req.originalUrl,
      method: req.method,
    },
    'lỗi xử lý request'
  );
  next(err);
}

export const LOG_PATHS = {
  dir: LOG_DIR,
  app: join(LOG_DIR, 'app.log'),
  error: join(LOG_DIR, 'error.log'),
  toFile: TO_FILE,
};
