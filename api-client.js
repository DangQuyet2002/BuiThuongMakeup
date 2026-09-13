const API_BASE = window.MOC_API_BASE || '/api';

let backendOnline = false;

async function request(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);

  try {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      ...options,
    });
    clearTimeout(timer);

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const err = new Error(json?.error || `Lỗi ${res.status}`);
      err.status = res.status;
      err.code = json?.code;
      throw err;
    }
    backendOnline = true;
    return json;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw new Error('Máy chủ phản hồi quá chậm, vui lòng thử lại');
    }
    if (e instanceof TypeError) {
      backendOnline = false;
      throw new Error('OFFLINE');
    }
    throw e;
  }
}

export const MocAPI = {
  isOnline: () => backendOnline,

  async ping() {
    try {
      await request('/health');
      return true;
    } catch {
      return false;
    }
  },

  async getCatalog() {
    // Lấy danh mục, thư viện ảnh và nội dung trang chủ song song.
    // Hai phần sau lỗi cũng không làm hỏng cả trang.
    const [cat, gal, cfg] = await Promise.all([
      request('/services'),
      request('/gallery').catch(() => ({ data: [] })),
      request('/settings').catch(() => ({ data: {} })),
    ]);
    return { ...cat.data, gallery: gal?.data || [], settings: cfg?.data || {} };
  },

  async getSettings() {
    const r = await request('/settings');
    return r.data;
  },

  async getGallery() {
    const r = await request('/gallery');
    return r.data;
  },

  async getSlots(date, artistId) {
    const q = new URLSearchParams({ date });
    if (artistId) q.set('artistId', artistId);
    const r = await request(`/slots?${q}`);
    return r.data;
  },

  async getArtists(date, time, duration) {
    const q = new URLSearchParams();
    if (date) q.set('date', date);
    if (time) q.set('time', time);
    if (duration) q.set('duration', duration);
    const r = await request(`/artists?${q}`);
    return r.data;
  },

  async createBooking(payload) {
    const r = await request('/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return r.data;
  },

  async lookup(code) {
    const r = await request(`/bookings/lookup?code=${encodeURIComponent(code)}`);
    return r.data;
  },
};

export const FALLBACK = {
  services: [
    { id: 1, name: 'Makeup dự tiệc', duration: 60, price: 650000, featured: 0, tag: null,
      time_label: '60 phút · 1 người',
      description: 'Trang điểm theo trang phục, giữ nét 8-10 tiếng.',
      features: ['Trang điểm theo trang phục', 'Sản phẩm chính hãng, an toàn da', 'Giữ nét từ 8–10 tiếng', 'Chỉnh tóc nhẹ'] },
    { id: 2, name: 'Makeup cô dâu', duration: 90, price: 2500000, featured: 1, tag: 'Được chọn nhiều',
      time_label: '90 phút · có thử trước',
      description: 'Thử trước ngày cưới, dặm lại cả ngày.',
      features: ['Thử makeup trước ngày cưới', '2 lần đổi dặm trong ngày', 'Làm tóc + phụ kiện', 'Hỗ trợ tại studio hoặc tận nơi'] },
    { id: 3, name: 'Chụp ảnh', duration: 75, price: 800000, featured: 0, tag: null,
      time_label: '75 phút · 1 người',
      description: 'Tông lên hình đẹp, hợp studio lẫn ngoại cảnh.',
      features: ['Tông lên hình đẹp', 'Hợp studio lẫn ngoại cảnh', 'Chỉnh nét theo ánh sáng', 'Hỗ trợ đổi tông 1 lần'] },
    { id: 4, name: 'Học makeup cá nhân', duration: 120, price: 3200000, featured: 0, tag: null,
      time_label: '1 kèm 1 · 4 buổi',
      description: 'Lộ trình 1 kèm 1 trong 4 buổi.',
      features: ['Lộ trình riêng theo khuôn mặt', 'Thực hành trên chính bạn', 'Tư vấn sản phẩm phù hợp', 'Giáo trình mang về'] },
  ],
  addons: [
    { id: 1, name: 'Làm tóc', note: 'Uốn / tết / xịt giữ nếp', price: 150000 },
    { id: 2, name: 'Mi giả', note: 'Loại mềm, dán tự nhiên', price: 80000 },
    { id: 3, name: 'Đi tận nơi', note: 'Trong nội thành TP.HCM', price: 100000 },
    { id: 4, name: 'Trang điểm nam', note: 'Tông tự nhiên', price: 120000 },
  ],
  combos: [
    { id: 1, name: 'Combo Đôi', old_price: 1300000, price: 1170000, featured: 0, tag: null,
      description: '2 người makeup dự tiệc.',
      features: ['2 người makeup dự tiệc', 'Làm tóc nhẹ cho cả hai', '1 chuyên viên phụ trách', 'Tiết kiệm so với đặt lẻ'] },
    { id: 2, name: 'Combo Cô dâu trọn gói', old_price: 5400000, price: 4550000, featured: 1, tag: 'Tiết kiệm nhất',
      description: 'Cô dâu + mẹ + 2 phù dâu.',
      features: ['Cô dâu + mẹ + 2 phù dâu', 'Thử makeup trước ngày cưới', 'Dặm lại trong suốt ngày cưới', 'Hỗ trợ tận nơi miễn phí nội thành'] },
    { id: 3, name: 'Combo Nhóm bạn', old_price: 2600000, price: 2280000, featured: 0, tag: null,
      description: '4 người, tông đồng bộ.',
      features: ['4 người chụp ảnh / dự tiệc', 'Tông makeup đồng bộ', '1 chuyên viên phụ trách riêng'] },
  ],
  artists: [
    { id: 1, name: 'Ngọc Trâm', initials: 'NT', specialty: 'Cô dâu · tông Hàn Quốc', years: 9 },
    { id: 2, name: 'Minh Thư', initials: 'MT', specialty: 'Dự tiệc · tông Tây', years: 7 },
    { id: 3, name: 'Hà My', initials: 'HM', specialty: 'Chụp ảnh · tông tự nhiên', years: 5 },
  ],
  faqs: [
    { id: 1, question: 'Makeup giữ được bao lâu?', answer: 'Trung bình 8–10 tiếng tuỳ loại da và thời tiết. Với gói cô dâu, chuyên viên sẽ dặm lại trong ngày để đảm bảo luôn tươi tắn khi chụp ảnh.' },
    { id: 2, question: 'Da mình dễ kích ứng thì sao?', answer: 'Bạn nên báo trước khi đặt lịch. Studio dùng sản phẩm chính hãng, có dòng dành riêng cho da nhạy cảm và luôn thử một vùng nhỏ trước khi trang điểm toàn mặt.' },
    { id: 3, question: 'Có makeup tận nơi không?', answer: 'Có. Với gói cô dâu và các buổi tiệc sáng sớm, chuyên viên có thể đến tận nơi trong nội thành. Phụ phí di chuyển tuỳ khoảng cách, sẽ báo rõ trước khi xác nhận.' },
    { id: 4, question: 'Đặt lịch trước bao lâu?', answer: 'Nên đặt trước 3–5 ngày. Với makeup cô dâu, bạn nên đặt trước 2–4 tuần để kịp buổi thử và trao đổi phong cách.' },
    { id: 5, question: 'Huỷ lịch có mất phí không?', answer: 'Huỷ trước 24 giờ hoàn toàn miễn phí. Huỷ trong vòng 24 giờ sẽ tính 30% giá trị gói đã chọn.' },
  ],
  gallery: [],
  // Nội dung trang chủ do quản trị viên chỉnh. Trống = dùng hình minh hoạ có sẵn.
  settings: {},
};

export function localSlots(date) {
  const d = new Date(date + 'T00:00:00');
  const wd = d.getDay();
  const start = wd === 0 ? 9 : 8;
  const end = wd === 0 ? 17 : 20;

  let seed = 0;
  for (let i = 0; i < date.length; i++) seed = (seed * 31 + date.charCodeAt(i)) % 9973;

  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const nowMin = today.getHours() * 60 + today.getMinutes();

  const slots = [];
  for (let h = start; h < end; h++) {
    const time = pad(h) + ':00';
    const rnd = (seed + h * 37) % 100;
    let available = wd === 0 ? rnd >= 45 : rnd >= 30;
    if (date < todayStr) available = false;
    if (date === todayStr && h * 60 <= nowMin) available = false;
    slots.push({ time, available });
  }
  return slots;
}
