import { db, initSchema } from './database.js';

initSchema();

const services = [
  {
    name: 'Makeup dự tiệc', slug: 'du-tiec', duration: 60, price: 650000, featured: 0,
    tag: null, time_label: '60 phút · 1 người',
    description: 'Trang điểm theo trang phục, giữ nét 8-10 tiếng, chỉnh tóc nhẹ.',
    features: ['Trang điểm theo trang phục', 'Sản phẩm chính hãng, an toàn da', 'Giữ nét từ 8–10 tiếng', 'Chỉnh tóc nhẹ'],
  },
  {
    name: 'Makeup cô dâu', slug: 'co-dau', duration: 90, price: 2500000, featured: 1,
    tag: 'Được chọn nhiều', time_label: '90 phút · có thử trước',
    description: 'Thử trước ngày cưới, 2 lần dặm trong ngày, làm tóc và phụ kiện.',
    features: ['Thử makeup trước ngày cưới', '2 lần đổi dặm trong ngày', 'Làm tóc + phụ kiện', 'Hỗ trợ tại studio hoặc tận nơi'],
  },
  {
    name: 'Chụp ảnh', slug: 'chup-anh', duration: 75, price: 800000, featured: 0,
    tag: null, time_label: '75 phút · 1 người',
    description: 'Tông makeup lên hình đẹp, phù hợp chụp studio hoặc ngoại cảnh.',
    features: ['Tông lên hình đẹp', 'Hợp studio lẫn ngoại cảnh', 'Chỉnh nét theo ánh sáng', 'Hỗ trợ đổi tông 1 lần'],
  },
  {
    name: 'Học makeup cá nhân', slug: 'hoc-makeup', duration: 120, price: 3200000, featured: 0,
    tag: null, time_label: '1 kèm 1 · 4 buổi',
    description: 'Lộ trình 1 kèm 1 trong 4 buổi, thực hành trên chính bạn.',
    features: ['Lộ trình riêng theo khuôn mặt', 'Thực hành trên chính bạn', 'Tư vấn sản phẩm phù hợp', 'Giáo trình mang về'],
  },
];

const addons = [
  { name: 'Làm tóc', note: 'Uốn / tết / xịt giữ nếp', price: 150000 },
  { name: 'Mi giả', note: 'Loại mềm, dán tự nhiên', price: 80000 },
  { name: 'Đi tận nơi', note: 'Trong nội thành TP.HCM', price: 100000 },
  { name: 'Trang điểm nam', note: 'Tông tự nhiên, che khuyết điểm', price: 120000 },
];

const combos = [
  {
    name: 'Combo Đôi', slug: 'doi', old_price: 1300000, price: 1170000, featured: 0,
    tag: null,
    description: '2 người makeup dự tiệc, làm tóc nhẹ cho cả hai.',
    features: ['2 người makeup dự tiệc', 'Làm tóc nhẹ cho cả hai', '1 chuyên viên phụ trách', 'Tiết kiệm so với đặt lẻ'],
  },
  {
    name: 'Combo Cô dâu trọn gói', slug: 'co-dau-tron-goi', old_price: 5400000, price: 4550000, featured: 1,
    tag: 'Tiết kiệm nhất',
    description: 'Cô dâu + mẹ + 2 phù dâu, thử trước, dặm lại cả ngày, hỗ trợ tận nơi.',
    features: ['Cô dâu + mẹ + 2 phù dâu', 'Thử makeup trước ngày cưới', 'Dặm lại trong suốt ngày cưới', 'Hỗ trợ tận nơi miễn phí nội thành'],
  },
  {
    name: 'Combo Nhóm bạn', slug: 'nhom-ban', old_price: 2600000, price: 2280000, featured: 0,
    tag: null,
    description: '4 người chụp ảnh hoặc dự tiệc, tông makeup đồng bộ.',
    features: ['4 người chụp ảnh / dự tiệc', 'Tông makeup đồng bộ', '1 chuyên viên phụ trách riêng'],
  },
];

const artists = [
  { name: 'Ngọc Trâm', initials: 'NT', specialty: 'Cô dâu · tông Hàn Quốc', years: 9 },
  { name: 'Minh Thư',  initials: 'MT', specialty: 'Dự tiệc · tông Tây', years: 7 },
  { name: 'Hà My',     initials: 'HM', specialty: 'Chụp ảnh · tông tự nhiên', years: 5 },
  { name: 'Bảo Ngọc',  initials: 'BN', specialty: 'Học viên · makeup cơ bản', years: 4 },
];

const blockSample = [
  { date: '2026-09-14', time: '10:00', reason: 'Đã có lịch cô dâu' },
  { date: '2026-09-14', time: '15:00', reason: 'Nghỉ giữa ca' },
  { date: '2026-09-15', time: '09:00', reason: 'Họp nhóm' },
];

const tx = db.transaction(() => {
  db.exec('DELETE FROM notification_log; DELETE FROM bookings; DELETE FROM services; DELETE FROM addons; DELETE FROM combos; DELETE FROM artists; DELETE FROM blocked_slots;');

  const insSvc = db.prepare(`
    INSERT INTO services (name,slug,description,duration,price,featured,tag,time_label,features,sort_order)
    VALUES (@name,@slug,@description,@duration,@price,@featured,@tag,@time_label,@features,@sort_order)
  `);
  services.forEach((s, i) => insSvc.run({
    ...s,
    features: JSON.stringify(s.features || []),
    sort_order: i + 1,
  }));

  const insAdd = db.prepare('INSERT INTO addons (name,note,price,sort_order) VALUES (@name,@note,@price,@sort_order)');
  addons.forEach((a, i) => insAdd.run({ ...a, sort_order: i + 1 }));

  const insCombo = db.prepare(`
    INSERT INTO combos (name,slug,description,old_price,price,featured,tag,features,sort_order)
    VALUES (@name,@slug,@description,@old_price,@price,@featured,@tag,@features,@sort_order)
  `);
  combos.forEach((c, i) => insCombo.run({
    ...c,
    features: JSON.stringify(c.features || []),
    sort_order: i + 1,
  }));

  const insArt = db.prepare('INSERT INTO artists (name,initials,specialty,years,sort_order) VALUES (@name,@initials,@specialty,@years,@sort_order)');
  artists.forEach((a, i) => insArt.run({ ...a, sort_order: i + 1 }));

  const insBlock = db.prepare('INSERT OR IGNORE INTO blocked_slots (date,time,reason) VALUES (@date,@time,@reason)');
  blockSample.forEach((b) => insBlock.run(b));

  const insSetting = db.prepare(`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  insSetting.run('bank_id', 'MB');
  insSetting.run('bank_account', '0988776655');
  insSetting.run('bank_account_name', 'BUI THI THUONG');
  insSetting.run('deposit_type', 'fixed');
  insSetting.run('deposit_value', '200000');
  insSetting.run('zalo_phone', '0988776655');

  db.prepare(`
    INSERT INTO bookings (code, service_name, date, time, duration, customer, phone, total, deposit_amount, deposit_status, status)
    VALUES ('MC2026090101', 'Makeup dự tiệc', '2026-09-20', '09:00', 60, 'Nguyễn Thuỳ Linh', '0912345678', 650000, 200000, 'unpaid', 'pending')
  `).run();
});

tx();

console.log('Seed xong:');
console.log('  services :', db.prepare('SELECT COUNT(*) c FROM services').get().c);
console.log('  addons   :', db.prepare('SELECT COUNT(*) c FROM addons').get().c);
console.log('  combos   :', db.prepare('SELECT COUNT(*) c FROM combos').get().c);
console.log('  artists  :', db.prepare('SELECT COUNT(*) c FROM artists').get().c);
console.log('  blocked  :', db.prepare('SELECT COUNT(*) c FROM blocked_slots').get().c);
console.log('  bookings :', db.prepare('SELECT COUNT(*) c FROM bookings').get().c);
console.log('  gallery  :', db.prepare('SELECT COUNT(*) c FROM gallery').get().c);
