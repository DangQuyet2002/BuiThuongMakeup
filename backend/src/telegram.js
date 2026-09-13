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

/**
 * Tự động đăng ký Webhook với máy chủ Telegram để nhận tin nhắn 2 chiều
 */
export async function registerTelegramWebhook(token, domain = null) {
  if (!token) return { ok: false };
  const host = domain || process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://buithuongmakeup.onrender.com';
  const webhookUrl = `${host.replace(/\/+$/, '')}/api/telegram/webhook`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const json = await res.json().catch(() => null);
    return { ok: json?.ok, description: json?.description, webhookUrl };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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

/**
 * Gửi tin nhắn Telegram kèm bàn phím nút bấm
 */
export async function sendTelegramWithKeyboard(text, keyboard = null, customChatId = null) {
  const cfg = getTelegramConfig();
  if (!cfg.token) return { ok: false, error: 'Chưa cấu hình Telegram Bot Token' };

  const chatId = customChatId || cfg.chatId;
  if (!chatId) return { ok: false, error: 'Chưa có Chat ID' };

  const endpoint = `https://api.telegram.org/bot${cfg.token}/sendMessage`;

  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (keyboard) {
    body.reply_markup = {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return { ok: false, error: json?.description || `HTTP ${res.status}` };
    return { ok: true, messageId: json.result?.message_id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Xử lý tin nhắn từ chủ tiệm gửi tới Bot Telegram
 */
export async function handleTelegramUpdate(update) {
  if (!update || !update.message) return { ok: true, handled: false };

  const msg = update.message;
  const chatId = msg.chat?.id;
  const rawText = (msg.text || '').trim();

  if (!chatId || !rawText) return { ok: true, handled: false };

  const textLower = rawText.toLowerCase();
  const cfg = getTelegramConfig();

  // Nút bàn phím cố định dưới màn hình chat
  const defaultKeyboard = [
    [{ text: '📅 Lịch hôm nay' }, { text: '⏰ Lịch ngày mai' }],
    [{ text: '📋 Đơn sắp tới' }, { text: '💰 Thống kê đơn' }],
  ];

  // 1. LỆNH CHÀO MỪNG / MENU
  if (textLower === '/start' || textLower === '/help' || textLower === 'menu' || textLower === 'trợ giúp') {
    const welcomeMsg = [
      `👋 <b>Chào mừng bạn đến với Trợ lý Bùi Thương Makeup!</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `Tôi là Bot hỗ trợ quản lý lịch đặt makeup tự động.`,
      `Chat ID của bạn: <code>${chatId}</code>`,
      ``,
      `👉 <b>Bạn có thể bấm vào các nút bên dưới hoặc gõ lệnh:</b>`,
      `• <b>Lịch hôm nay</b> (hoặc <code>/today</code>) — Xem các lịch make trong ngày`,
      `• <b>Lịch ngày mai</b> (hoặc <code>/tomorrow</code>) — Xem trước lịch ngày mai`,
      `• <b>Đơn sắp tới</b> (hoặc <code>/upcoming</code>) — Danh sách đơn 7 ngày tới`,
      `• <b>Thống kê đơn</b> (hoặc <code>/stats</code>) — Tổng số đơn & doanh thu`,
      `• <code>/tim &lt;SĐT hoặc tên&gt;</code> — Tìm kiếm đơn của khách`,
      `━━━━━━━━━━━━━━━━━━`,
      `💡 <i>Hệ thống luôn thông báo ngay khi có khách đặt đơn mới!</i>`,
    ].join('\n');

    await sendTelegramWithKeyboard(welcomeMsg, defaultKeyboard, chatId);
    return { ok: true, handled: true };
  }

  // Cần import db từ database
  const { db } = await import('../db/database.js');
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // 2. XEM LỊCH HÔM NAY
  if (textLower === '/today' || textLower.includes('lịch hôm nay') || textLower === 'hôm nay' || textLower === 'hom nay') {
    const rows = db.prepare(`
      SELECT * FROM bookings
      WHERE date = ? AND status != 'cancelled'
      ORDER BY time ASC
    `).all(today);

    if (!rows.length) {
      await sendTelegramWithKeyboard(
        `📅 <b>LỊCH HÔM NAY (${formatVnDate(today)}):</b>\n━━━━━━━━━━━━━━━━━━\n✨ Hôm nay chưa có lịch trang điểm nào.`,
        defaultKeyboard,
        chatId
      );
      return { ok: true, handled: true };
    }

    const items = rows.map((b, i) => {
      const dep = b.deposit_status === 'paid' ? '✅ Đã cọc' : '⏳ Chưa cọc';
      const stMap = { pending: 'Chờ duyệt', confirmed: 'Đã xác nhận', done: 'Hoàn thành' };
      return [
        `<b>${i + 1}. Lúc ${escapeHtml(b.time)}</b> — <b>${escapeHtml(b.customer)}</b>`,
        `   📞 SĐT: <a href="tel:${escapeHtml(b.phone)}">${escapeHtml(b.phone)}</a>`,
        `   💄 Gói: ${escapeHtml(b.service_name)} (${b.duration || 60}p)`,
        `   💰 Tiền: ${vnd(b.total)} (${dep}) · Trạng thái: <i>${stMap[b.status] || b.status}</i>`,
        b.note ? `   📝 Ghi chú: <i>"${escapeHtml(b.note)}"</i>` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const reply = [
      `📅 <b>LỊCH MAKEUP HÔM NAY (${formatVnDate(today)})</b>`,
      `Tổng cộng: <b>${rows.length} đơn</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      items,
    ].join('\n');

    await sendTelegramWithKeyboard(reply, defaultKeyboard, chatId);
    return { ok: true, handled: true };
  }

  // 3. XEM LỊCH NGÀY MAI
  if (textLower === '/tomorrow' || textLower.includes('lịch ngày mai') || textLower === 'ngày mai' || textLower === 'ngay mai') {
    const tom = new Date(Date.now() + 24 * 3600_000);
    const tomorrowStr = `${tom.getFullYear()}-${pad(tom.getMonth() + 1)}-${pad(tom.getDate())}`;

    const rows = db.prepare(`
      SELECT * FROM bookings
      WHERE date = ? AND status != 'cancelled'
      ORDER BY time ASC
    `).all(tomorrowStr);

    if (!rows.length) {
      await sendTelegramWithKeyboard(
        `⏰ <b>LỊCH NGÀY MAI (${formatVnDate(tomorrowStr)}):</b>\n━━━━━━━━━━━━━━━━━━\n✨ Ngày mai hiện chưa có lịch đặt nào.`,
        defaultKeyboard,
        chatId
      );
      return { ok: true, handled: true };
    }

    const items = rows.map((b, i) => {
      const dep = b.deposit_status === 'paid' ? '✅ Đã cọc' : '⏳ Chưa cọc';
      return [
        `<b>${i + 1}. Lúc ${escapeHtml(b.time)}</b> — <b>${escapeHtml(b.customer)}</b>`,
        `   📞 SĐT: <a href="tel:${escapeHtml(b.phone)}">${escapeHtml(b.phone)}</a>`,
        `   💄 Gói: ${escapeHtml(b.service_name)}`,
        `   💰 Tổng: ${vnd(b.total)} (${dep})`,
        b.note ? `   📝 Ghi chú: <i>"${escapeHtml(b.note)}"</i>` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const reply = [
      `⏰ <b>LỊCH MAKEUP NGÀY MAI (${formatVnDate(tomorrowStr)})</b>`,
      `Tổng cộng: <b>${rows.length} đơn</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      items,
      `━━━━━━━━━━━━━━━━━━`,
      `💡 <i>Nhớ kiểm tra đồ nghề và gọi xác nhận với khách nhé!</i>`,
    ].join('\n');

    await sendTelegramWithKeyboard(reply, defaultKeyboard, chatId);
    return { ok: true, handled: true };
  }

  // 4. XEM CÁC ĐƠN SẮP TỚI (7 NGÀY)
  if (textLower === '/upcoming' || textLower.includes('đơn sắp tới') || textLower === 'sắp tới' || textLower === 'sap toi') {
    const rows = db.prepare(`
      SELECT * FROM bookings
      WHERE date >= ? AND status IN ('pending', 'confirmed')
      ORDER BY date ASC, time ASC
      LIMIT 10
    `).all(today);

    if (!rows.length) {
      await sendTelegramWithKeyboard(
        `📋 <b>DANH SÁCH ĐƠN SẮP TỚI:</b>\n━━━━━━━━━━━━━━━━━━\n✨ Không có đơn nào sắp tới trong 7 ngày tới.`,
        defaultKeyboard,
        chatId
      );
      return { ok: true, handled: true };
    }

    const items = rows.map((b, i) => {
      return `<b>${i + 1}. ${formatVnDate(b.date)} lúc ${escapeHtml(b.time)}</b>\n   👤 ${escapeHtml(b.customer)} (<a href="tel:${escapeHtml(b.phone)}">${escapeHtml(b.phone)}</a>)\n   💄 ${escapeHtml(b.service_name)} · ${vnd(b.total)}`;
    }).join('\n\n');

    const reply = [
      `📋 <b>DANH SÁCH ĐƠN SẮP TỚI (Tối đa 10 đơn)</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      items,
    ].join('\n');

    await sendTelegramWithKeyboard(reply, defaultKeyboard, chatId);
    return { ok: true, handled: true };
  }

  // 5. THỐNG KÊ DOANH THU & ĐƠN HÀNG
  if (textLower === '/stats' || textLower.includes('thống kê') || textLower === 'doanh thu') {
    const totalRow = db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending, SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) confirmed, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done, SUM(CASE WHEN status!='cancelled' THEN total ELSE 0 END) revenue FROM bookings").get();

    const reply = [
      `📊 <b>THỐNG KÊ HOẠT ĐỘNG STUDIO</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `📋 <b>Tổng số đơn:</b> <b>${totalRow.total || 0}</b> đơn`,
      `⏳ <b>Chờ xác nhận:</b> ${totalRow.pending || 0} đơn`,
      `✅ <b>Đã xác nhận:</b> ${totalRow.confirmed || 0} đơn`,
      `🎉 <b>Đã hoàn thành:</b> ${totalRow.done || 0} đơn`,
      `💰 <b>Doanh thu dự kiến:</b> <b>${vnd(totalRow.revenue || 0)}</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `⏰ <i>Cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}</i>`,
    ].join('\n');

    await sendTelegramWithKeyboard(reply, defaultKeyboard, chatId);
    return { ok: true, handled: true };
  }

  // 6. TÌM KIẾM THEO TÊN / SĐT / MÃ ĐƠN
  if (textLower.startsWith('/tim ') || textLower.startsWith('tìm ')) {
    const query = rawText.replace(/^\/(tim|tìm)\s+/i, '').trim();
    if (!query) {
      await sendTelegramWithKeyboard('Vui lòng nhập từ khoá tìm kiếm, ví dụ: <code>/tim 0988123456</code> hoặc <code>/tim Thu Trang</code>', defaultKeyboard, chatId);
      return { ok: true, handled: true };
    }

    const rows = db.prepare(`
      SELECT * FROM bookings
      WHERE code LIKE ? OR customer LIKE ? OR phone LIKE ?
      ORDER BY id DESC LIMIT 5
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);

    if (!rows.length) {
      await sendTelegramWithKeyboard(`🔍 Không tìm thấy đơn nào khớp với từ khoá "<b>${escapeHtml(query)}</b>".`, defaultKeyboard, chatId);
      return { ok: true, handled: true };
    }

    const items = rows.map((b, i) => [
      `<b>${i + 1}. [${escapeHtml(b.code)}] ${escapeHtml(b.customer)}</b>`,
      `   📞 SĐT: <a href="tel:${escapeHtml(b.phone)}">${escapeHtml(b.phone)}</a>`,
      `   📅 Ngày: ${formatVnDate(b.date)} lúc <b>${escapeHtml(b.time)}</b>`,
      `   💄 Dịch vụ: ${escapeHtml(b.service_name)} · ${vnd(b.total)}`,
      `   📌 Trạng thái: <i>${b.status}</i> (${b.deposit_status === 'paid' ? 'Đã cọc' : 'Chưa cọc'})`,
    ].join('\n')).join('\n\n');

    await sendTelegramWithKeyboard(`🔍 <b>KẾT QUẢ TÌM KIẾM ("${escapeHtml(query)}"):</b>\n━━━━━━━━━━━━━━━━━━\n${items}`, defaultKeyboard, chatId);
    return { ok: true, handled: true };
  }

  // Mặc định: Gợi ý các nút bấm
  await sendTelegramWithKeyboard(
    `Xin chào! Tôi chưa hiểu lệnh "<b>${escapeHtml(rawText)}</b>".\n\n👉 Bạn hãy bấm vào một trong các nút bên dưới để xem lịch nhé!`,
    defaultKeyboard,
    chatId
  );
  return { ok: true, handled: true };
}

