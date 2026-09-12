const ZNS_ENDPOINT = 'https://business.openapi.zalo.me/message/template';

export const ZNS_CONFIG = {
  enabled: !!process.env.ZALO_ACCESS_TOKEN,
  token: process.env.ZALO_ACCESS_TOKEN || '',
  templateBooking: process.env.ZALO_TEMPLATE_BOOKING || '',
  templateReminder: process.env.ZALO_TEMPLATE_REMINDER || '',
  templateStatus: process.env.ZALO_TEMPLATE_STATUS || '',
  maxRetries: Number(process.env.ZNS_MAX_RETRIES || 3),
  dryRun: process.env.ZNS_DRY_RUN === '1',
};

export function formatVnDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const thu = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][d.getDay()];
  return `${thu}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function vnd(n) {
  return Number(n || 0).toLocaleString('vi-VN') + 'đ';
}

export function toZaloPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) return '84' + d.slice(1);
  if (d.startsWith('84')) return d;
  return d;
}

function addonList(addons) {
  if (Array.isArray(addons)) return addons;
  if (typeof addons === 'string') {
    try {
      const parsed = JSON.parse(addons);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

function buildTemplateData(type, booking) {
  const addonNames = addonList(booking.addons).map((a) => a.name).join(', ');

  if (type === 'booking') {
    return {
      ma_don: booking.code,
      dich_vu: booking.service_name,
      ngay_hen: formatVnDate(booking.date),
      gio_hen: booking.time,
      khach_hang: booking.customer,
      tam_tinh: vnd(booking.total),
      dich_vu_kem: addonNames || 'Không có',
    };
  }

  if (type === 'reminder') {
    return {
      ma_don: booking.code,
      dich_vu: booking.service_name,
      ngay_hen: formatVnDate(booking.date),
      gio_hen: booking.time,
      khach_hang: booking.customer,
    };
  }

  if (type === 'status') {
    const label = { confirmed: 'đã được xác nhận', done: 'đã hoàn thành', cancelled: 'đã bị huỷ' }[booking.status] || booking.status;
    return {
      ma_don: booking.code,
      dich_vu: booking.service_name,
      ngay_hen: formatVnDate(booking.date),
      gio_hen: booking.time,
      trang_thai: label,
      khach_hang: booking.customer,
    };
  }

  return {};
}

function templateFor(type) {
  if (type === 'booking') return ZNS_CONFIG.templateBooking;
  if (type === 'reminder') return ZNS_CONFIG.templateReminder;
  if (type === 'status') return ZNS_CONFIG.templateStatus;
  return '';
}

async function callZalo(phone, templateId, templateData) {
  const res = await fetch(ZNS_ENDPOINT + '?phone=' + encodeURIComponent(phone), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      access_token: ZNS_CONFIG.token,
    },
    body: JSON.stringify({ phone, template_id: templateId, template_data: templateData }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    return { ok: false, error: json?.message || `HTTP ${res.status}`, raw: json };
  }
  if (json?.error && json.error !== 0) {
    const msg = json.message || `Mã lỗi Zalo ${json.error}`;
    const retryable = [108, 109, 111, 112].includes(json.error);
    return { ok: false, error: msg, code: json.error, retryable, raw: json };
  }
  return { ok: true, messageId: json?.data?.message_id || null, raw: json };
}

export async function sendZNS(type, booking) {
  const phone = toZaloPhone(booking.phone);
  const templateId = templateFor(type);
  const templateData = buildTemplateData(type, booking);

  if (ZNS_CONFIG.dryRun) {
    return {
      ok: true,
      dryRun: true,
      provider: 'dry-run',
      messageId: 'DRYRUN-' + Date.now(),
      detail: '[CHẠY THỬ] Sẽ gửi ' + type + ' tới ' + phone,
      templateData,
    };
  }

  if (!ZNS_CONFIG.enabled) {
    return {
      ok: false,
      skipped: true,
      provider: 'none',
      error: 'CHUA_CAU_HINH',
      detail: 'Chưa cấu hình ZALO_ACCESS_TOKEN — tin nhắn không được gửi',
      templateData,
    };
  }

  if (!templateId) {
    return {
      ok: false,
      skipped: true,
      provider: 'zalo',
      error: 'THIEU_TEMPLATE',
      detail: `Chưa cấu hình template cho loại "${type}"`,
      templateData,
    };
  }

  let last = null;
  for (let attempt = 1; attempt <= ZNS_CONFIG.maxRetries; attempt++) {
    try {
      const r = await callZalo(phone, templateId, templateData);
      if (r.ok) {
        return { ...r, provider: 'zalo', attempts: attempt };
      }
      last = r;
      if (r.retryable === false) break;
    } catch (e) {
      last = { ok: false, error: e.message };
    }
    if (attempt < ZNS_CONFIG.maxRetries) {
      await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }

  return {
    ok: false,
    provider: 'zalo',
    error: last?.error || 'Gửi thất bại',
    code: last?.code,
    attempts: ZNS_CONFIG.maxRetries,
    templateData,
  };
}

export function znsStatus() {
  return {
    enabled: ZNS_CONFIG.enabled,
    dryRun: ZNS_CONFIG.dryRun,
    hasBookingTemplate: !!ZNS_CONFIG.templateBooking,
    hasReminderTemplate: !!ZNS_CONFIG.templateReminder,
    hasStatusTemplate: !!ZNS_CONFIG.templateStatus,
  };
}
