import { getSettings } from './settings.js';
import { formatVnDate, vnd } from './notify.js';

export function getTelegramConfig() {
  const settings = getSettings();
  const token = (settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || '').trim();
  const enabled = settings.telegramEnabled !== false && Boolean(token && chatId);

  return {
    enabled,
    token,
    chatId,
    configured: Boolean(token && chatId),
  };
}

export async function sendTelegram(text, customConfig = null) {
  const cfg = customConfig || getTelegramConfig();
  if (!cfg.token || !cfg.chatId) {
    return { ok: false, error: 'Chưa cấu hình Telegram Bot Token hoặc Chat ID' };
  }

  const endpoint = `https://api.telegram.org/bot${cfg.token}/sendMessage`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      const err = json?.description || `HTTP ${res.status}`;
      return { ok: false, error: err };
    }

    return { ok: true, messageId: json.result?.message_id };
  } catch (e) {
    return { ok: false, error: e.message || 'Không thể kết nối máy chủ Telegram' };
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeAddons(addons) {
  if (Array.isArray(addons)) return addons;
  if (typeof addons === 'string') {
    try {
      const parsed = JSON.parse(addons);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

/**
 * Thông báo tức thì khi có khách đặt lịch mới
 */
export async function notifyOwnerBookingCreated(booking) {
  const cfg = getTelegramConfig();
  if (!cfg.enabled) return { ok: false, skipped: true };

  const addons = safeAddons(booking.addons);
  const addonText = addons.length ? addons.map(a => escapeHtml(a.name)).join(', ') : 'Không có';
  const depStatus = booking.deposit_status === 'paid' ? '✅ Đã nhận cọc' : '⏳ Chưa thanh toán cọc';

  const msg = [
    `🎉 <b>CÓ ĐƠN ĐẶT LỊCH MỚI!</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `📋 <b>Mã đơn:</b> <code>${escapeHtml(booking.code)}</code>`,
    `👤 <b>Khách hàng:</b> ${escapeHtml(booking.customer)}`,
    `📞 <b>Điện thoại:</b> <a href="tel:${escapeHtml(booking.phone)}">${escapeHtml(booking.phone)}</a>`,
    `💄 <b>Dịch vụ:</b> ${escapeHtml(booking.service_name)}`,
    `📅 <b>Ngày hẹn:</b> ${formatVnDate(booking.date)}`,
    `⏰ <b>Giờ hẹn:</b> <b>${escapeHtml(booking.time)}</b> (${booking.duration || 60} phút)`,
    booking.artist_name ? `🎨 <b>Chuyên viên:</b> ${escapeHtml(booking.artist_name)}` : '',
    addons.length ? `✨ <b>Dịch vụ kèm:</b> ${addonText}` : '',
    `💰 <b>Tạm tính:</b> ${vnd(booking.total)}`,
    `💳 <b>Tiền cọc:</b> ${vnd(booking.deposit_amount || 0)} (${depStatus})`,
    booking.note ? `📝 <b>Ghi chú:</b> <i>"${escapeHtml(booking.note)}"</i>` : '',
    `━━━━━━━━━━━━━━━━━━`,
    `⏰ <i>${new Date().toLocaleTimeString('vi-VN')} · Bùi Thương Makeup</i>`,
  ].filter(Boolean).join('\n');

  return sendTelegram(msg, cfg);
}

/**
 * Nhắc lịch hẹn trước 1 ngày (24h) cho chủ studio
 */
export async function notifyOwnerReminder(booking) {
  const cfg = getTelegramConfig();
  if (!cfg.enabled) return { ok: false, skipped: true };

  const addons = safeAddons(booking.addons);
  const addonText = addons.length ? ` (+${addons.map(a => a.name).join(', ')})` : '';

  const msg = [
    `⏰ <b>NHẮC LỊCH MAKEUP NGÀY MAI!</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `📋 <b>Mã đơn:</b> <code>${escapeHtml(booking.code)}</code>`,
    `👤 <b>Khách hàng:</b> <b>${escapeHtml(booking.customer)}</b>`,
    `📞 <b>Số điện thoại:</b> <a href="tel:${escapeHtml(booking.phone)}">${escapeHtml(booking.phone)}</a>`,
    `💄 <b>Gói:</b> ${escapeHtml(booking.service_name)}${escapeHtml(addonText)}`,
    `⏰ <b>Giờ hẹn:</b> <b>${escapeHtml(booking.time)}</b> — ${formatVnDate(booking.date)}`,
    booking.artist_name ? `🎨 <b>Chuyên viên:</b> ${escapeHtml(booking.artist_name)}` : '',
    `💰 <b>Tổng tiền:</b> ${vnd(booking.total)} (Cọc: ${vnd(booking.deposit_amount || 0)})`,
    booking.note ? `📝 <b>Ghi chú:</b> <i>"${escapeHtml(booking.note)}"</i>` : '',
    `━━━━━━━━━━━━━━━━━━`,
    `💡 <i>Hãy liên hệ trước với khách để chuẩn bị chu đáo nhé!</i>`,
  ].filter(Boolean).join('\n');

  return sendTelegram(msg, cfg);
}

/**
 * Gửi tin nhắn kiểm tra kết nối Telegram
 */
export async function testTelegram(token, chatId) {
  const cfg = {
    token: (token || '').trim(),
    chatId: (chatId || '').trim(),
    enabled: true,
  };

  const testMsg = [
    `✅ <b>KẾT NỐI TELEGRAM THÀNH CÔNG!</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `Hệ thống thông báo &amp; nhắc lịch <b>Bùi Thương Makeup</b> đã kết nối thành công với điện thoại của bạn.`,
    ``,
    `🔔 <b>Các tính năng đã kích hoạt:</b>`,
    `1. Thông báo ngay lập tức khi có khách đặt lịch mới.`,
    `2. Nhắc lịch hẹn trước 1 ngày (24 tiếng) để chuẩn bị.`,
    `━━━━━━━━━━━━━━━━━━`,
    `⏰ <i>${new Date().toLocaleTimeString('vi-VN')} · Sẵn sàng hoạt động 24/7</i>`,
  ].join('\n');

  return sendTelegram(testMsg, cfg);
}
