#!/usr/bin/env node
// Điền quyền lợi / nhãn / dòng thời gian cho dữ liệu đang có,
// lấy từ nội dung vốn viết cứng trong index.html trước đây.
//
// Chỉ điền khi ô còn trống — chạy lại nhiều lần vẫn an toàn,
// và KHÔNG ghi đè nếu bạn đã tự sửa trong trang quản trị.
//
//   node db/backfill-content.js

import { db, initSchema } from './database.js';

initSchema();

const SERVICE_CONTENT = {
  'du-tiec': {
    time_label: '60 phút · 1 người',
    features: ['Trang điểm theo trang phục', 'Sản phẩm chính hãng, an toàn da', 'Giữ nét từ 8–10 tiếng', 'Chỉnh tóc nhẹ'],
  },
  'co-dau': {
    tag: 'Được chọn nhiều',
    time_label: '90 phút · có thử trước',
    features: ['Thử makeup trước ngày cưới', '2 lần đổi dặm trong ngày', 'Làm tóc + phụ kiện', 'Hỗ trợ tại studio hoặc tận nơi'],
  },
  'chup-anh': {
    time_label: '75 phút · 1 người',
    features: ['Tông lên hình đẹp', 'Hợp studio lẫn ngoại cảnh', 'Chỉnh nét theo ánh sáng', 'Hỗ trợ đổi tông 1 lần'],
  },
  'hoc-makeup': {
    time_label: '1 kèm 1 · 4 buổi',
    features: ['Lộ trình riêng theo khuôn mặt', 'Thực hành trên chính bạn', 'Tư vấn sản phẩm phù hợp', 'Giáo trình mang về'],
  },
};

const COMBO_CONTENT = {
  'doi': {
    features: ['2 người makeup dự tiệc', 'Làm tóc nhẹ cho cả hai', '1 chuyên viên phụ trách', 'Tiết kiệm so với đặt lẻ'],
  },
  'co-dau-tron-goi': {
    tag: 'Tiết kiệm nhất',
    features: ['Cô dâu + mẹ + 2 phù dâu', 'Thử makeup trước ngày cưới', 'Dặm lại trong suốt ngày cưới', 'Hỗ trợ tận nơi miễn phí nội thành'],
  },
  'nhom-ban': {
    features: ['4 người chụp ảnh / dự tiệc', 'Tông makeup đồng bộ', '1 chuyên viên phụ trách riêng'],
  },
};

let filledSvc = 0;
let filledCombo = 0;

const tx = db.transaction(() => {
  // ---- dịch vụ ----
  const svcList = db.prepare('SELECT id, slug, tag, time_label, features, sort_order FROM services').all();
  const updSvc = db.prepare('UPDATE services SET tag=?, time_label=?, features=?, sort_order=? WHERE id=?');

  svcList.forEach((s, i) => {
    const c = SERVICE_CONTENT[s.slug];
    const tag = s.tag ?? c?.tag ?? null;
    const timeLabel = s.time_label ?? c?.time_label ?? null;
    const features = s.features ?? (c ? JSON.stringify(c.features) : null);
    const order = s.sort_order || i + 1;

    const changed = tag !== s.tag || timeLabel !== s.time_label || features !== s.features || order !== s.sort_order;
    if (changed) {
      updSvc.run(tag, timeLabel, features, order, s.id);
      filledSvc += 1;
    }
  });

  // ---- combo ----
  const comboList = db.prepare('SELECT id, slug, tag, features, sort_order FROM combos').all();
  const updCombo = db.prepare('UPDATE combos SET tag=?, features=?, sort_order=? WHERE id=?');

  comboList.forEach((c, i) => {
    const src = COMBO_CONTENT[c.slug];
    const tag = c.tag ?? src?.tag ?? null;
    const features = c.features ?? (src ? JSON.stringify(src.features) : null);
    const order = c.sort_order || i + 1;

    if (tag !== c.tag || features !== c.features || order !== c.sort_order) {
      updCombo.run(tag, features, order, c.id);
      filledCombo += 1;
    }
  });

  // ---- dịch vụ kèm và chuyên viên: chỉ cần đánh số thứ tự ----
  db.prepare('SELECT id FROM addons WHERE sort_order = 0').all()
    .forEach((a, i) => db.prepare('UPDATE addons SET sort_order = ? WHERE id = ?').run(i + 1, a.id));

  db.prepare('SELECT id FROM artists WHERE sort_order = 0').all()
    .forEach((a, i) => db.prepare('UPDATE artists SET sort_order = ? WHERE id = ?').run(i + 1, a.id));
});

tx();

console.log('');
console.log('Đã điền nội dung hiển thị:');
console.log(`  dịch vụ : ${filledSvc} dòng được cập nhật`);
console.log(`  combo   : ${filledCombo} dòng được cập nhật`);
console.log('');

const check = db.prepare('SELECT name, time_label, tag, features FROM services ORDER BY sort_order').all();
check.forEach((s) => {
  const n = (() => { try { return JSON.parse(s.features || '[]').length; } catch { return 0; } })();
  console.log(`  · ${s.name}`);
  console.log(`      thời gian: ${s.time_label || '(trống)'}   nhãn: ${s.tag || '(không)'}   quyền lợi: ${n} ý`);
});
console.log('');
