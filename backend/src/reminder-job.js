import { findDueReminders, notifyReminder, znsStatus } from './notifications.js';
import { notifyOwnerReminder } from './telegram.js';

const CHECK_INTERVAL_MS = Number(process.env.REMINDER_INTERVAL_MS || 15 * 60 * 1000);
const HOURS_AHEAD = Number(process.env.REMINDER_HOURS_AHEAD || 24);
const ENABLED = process.env.REMINDER_ENABLED !== '0';

let timer = null;
let lastRun = null;
let runs = 0;
let totalSent = 0;

async function runOnce() {
  const due = findDueReminders(HOURS_AHEAD);
  runs++;
  lastRun = new Date().toISOString();

  if (!due.length) return { checked: 0, sent: 0 };

  let sent = 0;
  for (const booking of due) {
    const { result } = await notifyReminder(booking);
    if (result.ok) sent++;
    const tag = result.ok ? (result.dryRun ? 'DRY-RUN' : 'ĐÃ GỬI') : 'THẤT BẠI';
    console.log(`  [nhắc hẹn] ${booking.code} · ${booking.phone} → ${tag}${result.error ? ' (' + result.error + ')' : ''}`);

    // Nhắc lịch trước 1 ngày về Telegram của chủ studio
    notifyOwnerReminder(booking).catch((err) => {
      console.error(`  [Telegram nhắc chủ] ${booking.code} lỗi:`, err.message);
    });
  }

  totalSent += sent;
  return { checked: due.length, sent };
}

export function startReminderJob() {
  if (!ENABLED) {
    console.log('  Nhắc hẹn tự động: đã tắt (REMINDER_ENABLED=0)');
    return;
  }

  const st = znsStatus();
  if (!st.enabled && !st.dryRun) {
    console.log('  Nhắc hẹn tự động: chờ cấu hình ZALO_ACCESS_TOKEN');
  }

  timer = setInterval(() => {
    runOnce().catch((e) => console.error('  [nhắc hẹn] lỗi:', e.message));
  }, CHECK_INTERVAL_MS);
  timer.unref();

  console.log(`  Nhắc hẹn tự động: mỗi ${Math.round(CHECK_INTERVAL_MS / 60000)} phút, trước ${HOURS_AHEAD} giờ`);
}

export function stopReminderJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function runReminderNow() {
  return runOnce();
}

export function reminderJobStats() {
  return {
    enabled: ENABLED,
    intervalMinutes: Math.round(CHECK_INTERVAL_MS / 60000),
    hoursAhead: HOURS_AHEAD,
    runs,
    totalSent,
    lastRun,
  };
}
