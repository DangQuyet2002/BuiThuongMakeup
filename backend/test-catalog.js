#!/usr/bin/env node
// Kiểm thử quản lý nội dung: dịch vụ, giá, combo, chuyên viên, thư viện ảnh.
// Chạy: node test-catalog.js   (cần server đang chạy)

const BASE = process.env.BASE || 'http://localhost:3000/api';
let pass = 0, fail = 0;
const results = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name}${extra ? '  → ' + extra : ''}`); }
}
function section(t) { results.push(`\n${t}`); }

async function req(path, { method = 'GET', body, token, raw } = {}) {
  const opts = { method, headers: {} };
  if (token) opts.headers.Authorization = 'Bearer ' + token;
  if (raw) { opts.body = raw; }
  else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(BASE + path, opts);
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
}

const ADMIN = { u: 'admin', p: 'Admin@2026!Ok' };
const STAFF = { u: 'linh', p: 'Staff@2026' };
const VIEWER = { u: 'mai', p: 'View@2026' };

async function login(c) {
  const r = await req('/admin/login', { method: 'POST', body: { username: c.u, password: c.p } });
  return r.json?.data?.token || null;
}

// Ảnh PNG 1x1 hợp lệ
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function uploadImage(token, name = 'test.png', type = 'image/png', buf = PNG) {
  const fd = new FormData();
  fd.append('files', new Blob([buf], { type }), name);
  const res = await fetch(BASE + '/admin/uploads', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

(async () => {
  console.log('\n========== KIỂM THỬ QUẢN LÝ NỘI DUNG ==========\n');

  // Bộ đếm rate limit nằm trong database và tồn tại giữa các lần chạy.
  // Xoá trước để kết quả tất định, không phụ thuộc lần chạy trước.
  try {
    const { db } = await import('./db/database.js');
    db.prepare('DELETE FROM rate_limits').run();
  } catch (e) {
    console.warn('  (cảnh báo) không dọn được rate limit:', e.message);
  }

  const aTok = await login(ADMIN);
  const sTok = await login(STAFF);
  const vTok = await login(VIEWER);
  if (!aTok) { console.error('Không đăng nhập được admin.'); process.exit(1); }

  // ---------- 1. Đọc nội dung ----------
  section('1. ĐỌC NỘI DUNG HIỂN THỊ');
  const cat = await req('/admin/catalog', { token: aTok });
  check('GET /admin/catalog → 200', cat.status === 200, 'status=' + cat.status);
  check('có services', Array.isArray(cat.json?.data?.services));
  check('có addons', Array.isArray(cat.json?.data?.addons));
  check('có combos', Array.isArray(cat.json?.data?.combos));
  check('có artists', Array.isArray(cat.json?.data?.artists));
  check('có gallery', Array.isArray(cat.json?.data?.gallery));
  check('có galleryStats', !!cat.json?.data?.galleryStats);
  check('services có trường features dạng mảng',
    Array.isArray(cat.json?.data?.services?.[0]?.features),
    JSON.stringify(cat.json?.data?.services?.[0]?.features));

  // ---------- 2. Dịch vụ: thêm / sửa giá / ẩn / xoá ----------
  section('2. QUẢN LÝ DỊCH VỤ VÀ GIÁ');

  const created = await req('/admin/catalog/services', {
    method: 'POST', token: aTok,
    body: {
      name: 'Makeup thử nghiệm',
      description: 'Gói dùng để kiểm thử',
      price: 1234000,
      duration: 45,
      tag: 'Mới',
      timeLabel: '45 phút · 1 người',
      features: ['Tính năng một', 'Tính năng hai'],
    },
  });
  check('thêm dịch vụ → 201', created.status === 201, 'status=' + created.status + ' ' + (created.json?.error || ''));
  const svcId = created.json?.data?.id;
  check('trả về id dịch vụ mới', !!svcId);
  check('giá lưu đúng', created.json?.data?.price === 1234000, String(created.json?.data?.price));
  check('features trả về dạng mảng', Array.isArray(created.json?.data?.features));
  check('tự sinh slug', created.json?.data?.slug === 'makeup-thu-nghiem', created.json?.data?.slug);
  check('có sort_order', typeof created.json?.data?.sort_order === 'number');

  const badPrice = await req('/admin/catalog/services', {
    method: 'POST', token: aTok, body: { name: 'Sai giá', price: -5 },
  });
  check('giá âm → 400', badPrice.status === 400, 'status=' + badPrice.status);

  const noName = await req('/admin/catalog/services', {
    method: 'POST', token: aTok, body: { price: 100000 },
  });
  check('thiếu tên → 400', noName.status === 400, 'status=' + noName.status);

  const badDur = await req('/admin/catalog/services', {
    method: 'POST', token: aTok, body: { name: 'Sai giờ', price: 100000, duration: 5 },
  });
  check('thời lượng quá ngắn → 400', badDur.status === 400, 'status=' + badDur.status);

  const upd = await req(`/admin/catalog/services/${svcId}`, {
    method: 'PATCH', token: aTok, body: { price: 999000, tag: 'Đã sửa' },
  });
  check('sửa giá dịch vụ → 200', upd.status === 200, 'status=' + upd.status + ' ' + (upd.json?.error || ''));
  check('giá mới đã lưu', upd.json?.data?.price === 999000, String(upd.json?.data?.price));
  check('tag mới đã lưu', upd.json?.data?.tag === 'Đã sửa', upd.json?.data?.tag);

  const hidden = await req(`/admin/catalog/services/${svcId}/active`, {
    method: 'PATCH', token: aTok, body: { active: false },
  });
  check('ẩn dịch vụ → 200', hidden.status === 200, 'status=' + hidden.status);

  const pubAfterHide = await req('/services');
  check('dịch vụ đã ẩn KHÔNG còn trong API công khai',
    !pubAfterHide.json?.data?.services?.some((s) => s.id === svcId));

  const adminStillSees = await req('/admin/catalog', { token: aTok });
  check('admin vẫn thấy dịch vụ đã ẩn',
    adminStillSees.json?.data?.services?.some((s) => s.id === svcId));

  await req(`/admin/catalog/services/${svcId}/active`, { method: 'PATCH', token: aTok, body: { active: true } });

  // ---------- 3. Phân quyền ----------
  section('3. PHÂN QUYỀN');

  const vRead = await req('/admin/catalog', { token: vTok });
  check('viewer ĐỌC nội dung → 200', vRead.status === 200, 'status=' + vRead.status);

  const vWrite = await req('/admin/catalog/services', {
    method: 'POST', token: vTok, body: { name: 'Viewer thử', price: 1000 },
  });
  check('viewer THÊM dịch vụ → 403', vWrite.status === 403, 'status=' + vWrite.status);

  const vUpd = await req(`/admin/catalog/services/${svcId}`, {
    method: 'PATCH', token: vTok, body: { price: 1 },
  });
  check('viewer SỬA giá → 403', vUpd.status === 403, 'status=' + vUpd.status);

  const vDel = await req(`/admin/catalog/services/${svcId}`, { method: 'DELETE', token: vTok });
  check('viewer XOÁ dịch vụ → 403', vDel.status === 403, 'status=' + vDel.status);

  const sWrite = await req('/admin/catalog/addons', {
    method: 'POST', token: sTok, body: { name: 'Phụ kiện thử', price: 55000 },
  });
  check('staff THÊM dịch vụ kèm → 201', sWrite.status === 201, 'status=' + sWrite.status + ' ' + (sWrite.json?.error || ''));
  const addonId = sWrite.json?.data?.id;

  const sDel = await req(`/admin/catalog/addons/${addonId}`, { method: 'DELETE', token: sTok });
  check('staff XOÁ → 403 (chỉ chủ studio)', sDel.status === 403, 'status=' + sDel.status);

  // ---------- 4. Combo và chuyên viên ----------
  section('4. COMBO VÀ CHUYÊN VIÊN');

  const combo = await req('/admin/catalog/combos', {
    method: 'POST', token: aTok,
    body: { name: 'Combo thử', price: 900000, oldPrice: 1200000, description: 'Mô tả thử', features: ['A', 'B'] },
  });
  check('thêm combo → 201', combo.status === 201, 'status=' + combo.status + ' ' + (combo.json?.error || ''));
  check('giá gốc >= giá bán', combo.json?.data?.old_price >= combo.json?.data?.price);
  const comboId = combo.json?.data?.id;

  const comboBad = await req('/admin/catalog/combos', {
    method: 'POST', token: aTok, body: { name: 'Combo lỗi', price: 500000, oldPrice: 100000 },
  });
  check('giá gốc nhỏ hơn giá bán được tự nâng bằng giá bán',
    comboBad.json?.data?.old_price === 500000, String(comboBad.json?.data?.old_price));

  const artist = await req('/admin/catalog/artists', {
    method: 'POST', token: aTok, body: { name: 'Nguyễn Thị Thử', specialty: 'Tự nhiên', years: 4 },
  });
  check('thêm chuyên viên → 201', artist.status === 201, 'status=' + artist.status + ' ' + (artist.json?.error || ''));
  check('tự sinh chữ viết tắt', !!artist.json?.data?.initials, artist.json?.data?.initials);
  const artistId = artist.json?.data?.id;

  // ---------- 5. Sắp xếp ----------
  section('5. SẮP XẾP THỨ TỰ');
  const catNow = await req('/admin/catalog', { token: aTok });
  const allSvcs = catNow.json?.data?.services || [];
  const baseIds = allSvcs.map((s) => s.id).slice(0, 4);
  const shuffled = [baseIds[2], baseIds[0], baseIds[1], baseIds[3]].filter(Boolean);

  const reorder = await req('/admin/catalog/services/reorder', {
    method: 'POST', token: aTok, body: { ids: shuffled },
  });
  check('lưu thứ tự → 200', reorder.status === 200, 'status=' + reorder.status);

  const after = await req('/admin/catalog', { token: aTok });
  const order = after.json?.data?.services?.filter((s) => baseIds.includes(s.id)).map((s) => s.id);
  check('thứ tự được áp dụng đúng', JSON.stringify(order) === JSON.stringify(shuffled), JSON.stringify(order));
  await req('/admin/catalog/services/reorder', { method: 'POST', token: aTok, body: { ids: baseIds } });

  // ---------- 5b. Câu hỏi thường gặp (FAQ) & Cài đặt ----------
  section('5b. FAQ & CÀI ĐẶT TRANG CHỦ');
  const newFaq = await req('/admin/catalog/faqs', {
    method: 'POST', token: aTok,
    body: { question: 'Câu hỏi kiểm thử?', answer: 'Câu trả lời kiểm thử' },
  });
  check('thêm FAQ → 201', newFaq.status === 201, 'status=' + newFaq.status);
  const faqId = newFaq.json?.data?.id;

  const updFaq = await req(`/admin/catalog/faqs/${faqId}`, {
    method: 'PATCH', token: aTok,
    body: { question: 'Câu hỏi đã sửa?', answer: 'Câu trả lời đã sửa' },
  });
  check('sửa FAQ → 200', updFaq.status === 200, 'status=' + updFaq.status);
  check('nội dung FAQ đã cập nhật', updFaq.json?.data?.question === 'Câu hỏi đã sửa?');

  const pubFaqs = await req('/faqs');
  check('API công khai /faqs trả về danh sách', Array.isArray(pubFaqs.json?.data) && pubFaqs.json?.data.some((f) => f.id === faqId));

  const setSettings = await req('/admin/settings', {
    method: 'PATCH', token: aTok,
    body: {
      stat1Num: '2.500+',
      stat1Label: 'Khách hàng thân thiết',
      studioAddress: '999 Đường Test, Quận 1, TP.HCM',
    },
  });
  check('lưu cài đặt trang chủ → 200', setSettings.status === 200, 'status=' + setSettings.status);
  check('thống kê mới đã lưu', setSettings.json?.data?.stat1Num === '2.500+');
  check('địa chỉ mới đã lưu', setSettings.json?.data?.studioAddress === '999 Đường Test, Quận 1, TP.HCM');

  const delFaq = await req(`/admin/catalog/faqs/${faqId}`, { method: 'DELETE', token: aTok });
  check('xoá FAQ → 200', delFaq.status === 200, 'status=' + delFaq.status);

  // ---------- 6. Tải ảnh ----------
  section('6. TẢI ẢNH LÊN');

  const up = await uploadImage(aTok);
  check('tải ảnh PNG → 201', up.status === 201, 'status=' + up.status + ' ' + (up.json?.error || ''));
  check('trả về đường dẫn /uploads/', String(up.json?.data?.[0]?.url || '').startsWith('/uploads/'), up.json?.data?.[0]?.url);
  const imgUrl = up.json?.data?.[0]?.url;

  const upBad = await uploadImage(aTok, 'doc.txt', 'text/plain', Buffer.from('không phải ảnh'));
  check('file không phải ảnh → 400', upBad.status === 400, 'status=' + upBad.status);
  check('báo đúng lỗi loại file', /ảnh/i.test(upBad.json?.error || ''), upBad.json?.error);

  const upViewer = await uploadImage(vTok);
  check('viewer tải ảnh → 403', upViewer.status === 403, 'status=' + upViewer.status);

  if (imgUrl) {
    const fetched = await fetch('http://localhost:3000' + imgUrl);
    check('ảnh truy cập được qua /uploads', fetched.status === 200, 'status=' + fetched.status);
  }

  // ---------- 7. Thư viện ảnh — mọi mục đều là so sánh trước/sau ----------
  section('7. THƯ VIỆN ẢNH (SO SÁNH TRƯỚC/SAU)');

  const up2 = await uploadImage(aTok, 'after.png');
  const img2 = up2.json?.data?.[0]?.url;

  const g1 = await req('/admin/gallery', {
    method: 'POST', token: aTok,
    body: { title: 'Ảnh thử', category: 'Tự nhiên', beforeImage: imgUrl, afterImage: img2, altText: 'Mô tả ảnh' },
  });
  check('thêm ảnh trước/sau → 201', g1.status === 201, 'status=' + g1.status + ' ' + (g1.json?.error || ''));
  check('lưu đúng danh mục', g1.json?.data?.category === 'Tự nhiên', g1.json?.data?.category);
  check('luôn được lưu là loại compare', g1.json?.data?.kind === 'compare', g1.json?.data?.kind);
  check('lưu đủ cả ảnh trước và ảnh sau',
    !!g1.json?.data?.before_image && !!g1.json?.data?.after_image);
  const gid1 = g1.json?.data?.id;

  // Gửi kind 'photo' kiểu cũ cũng phải bị ép về compare
  const gForce = await req('/admin/gallery', {
    method: 'POST', token: aTok,
    body: { title: 'Ép kiểu', kind: 'photo', beforeImage: imgUrl, afterImage: img2 },
  });
  check('gửi kind=photo vẫn thành compare', gForce.json?.data?.kind === 'compare', gForce.json?.data?.kind);
  const gidForce = gForce.json?.data?.id;

  const gNoTitle = await req('/admin/gallery', {
    method: 'POST', token: aTok, body: { beforeImage: imgUrl, afterImage: img2 },
  });
  check('thiếu tiêu đề → 400', gNoTitle.status === 400, 'status=' + gNoTitle.status);

  const gNoBefore = await req('/admin/gallery', {
    method: 'POST', token: aTok, body: { title: 'Thiếu ảnh trước', afterImage: img2 },
  });
  check('thiếu ảnh TRƯỚC → 400', gNoBefore.status === 400, 'status=' + gNoBefore.status);

  const gNoAfter = await req('/admin/gallery', {
    method: 'POST', token: aTok, body: { title: 'Thiếu ảnh sau', beforeImage: imgUrl },
  });
  check('thiếu ảnh SAU → 400', gNoAfter.status === 400, 'status=' + gNoAfter.status);

  const gBadPath = await req('/admin/gallery', {
    method: 'POST', token: aTok,
    body: { title: 'Đường dẫn lạ', beforeImage: '../../etc/passwd', afterImage: img2 },
  });
  check('chặn đường dẫn không hợp lệ → 400', gBadPath.status === 400, 'status=' + gBadPath.status);

  const g2 = await req('/admin/gallery', {
    method: 'POST', token: aTok,
    body: { title: 'So sánh thử 2', beforeImage: imgUrl, afterImage: img2 },
  });
  check('thêm ảnh so sánh thứ hai → 201', g2.status === 201, 'status=' + g2.status);
  const gid2 = g2.json?.data?.id;

  // ẩn ảnh
  const gHide = await req(`/admin/gallery/${gid1}/active`, {
    method: 'PATCH', token: aTok, body: { active: false },
  });
  check('ẩn ảnh → 200', gHide.status === 200, 'status=' + gHide.status);

  const pubGal = await req('/gallery');
  check('API công khai trả thư viện ảnh', Array.isArray(pubGal.json?.data));
  check('ảnh đã ẩn không hiện công khai',
    !pubGal.json?.data?.some((g) => g.id === gid1));
  check('ảnh đang hiện vẫn xuất hiện công khai',
    pubGal.json?.data?.some((g) => g.id === gid2));
  check('mọi mục công khai đều có đủ ảnh trước và sau',
    (pubGal.json?.data || []).every((g) => g.before_image && g.after_image));

  // ---------- 8. Dọn dẹp ----------
  section('8. DỌN DẸP');

  const delSvc = await req(`/admin/catalog/services/${svcId}`, { method: 'DELETE', token: aTok });
  check('xoá dịch vụ thử → 200', delSvc.status === 200, 'status=' + delSvc.status + ' ' + (delSvc.json?.error || ''));

  const delCombo = await req(`/admin/catalog/combos/${comboId}`, { method: 'DELETE', token: aTok });
  check('xoá combo thử → 200', delCombo.status === 200, 'status=' + delCombo.status);

  const delArtist = await req(`/admin/catalog/artists/${artistId}`, { method: 'DELETE', token: aTok });
  check('xoá chuyên viên thử → 200', delArtist.status === 200, 'status=' + delArtist.status);

  const delAddon = await req(`/admin/catalog/addons/${addonId}`, { method: 'DELETE', token: aTok });
  check('xoá dịch vụ kèm thử → 200', delAddon.status === 200, 'status=' + delAddon.status);

  const delG1 = await req(`/admin/gallery/${gid1}`, { method: 'DELETE', token: aTok });
  check('xoá ảnh thử → 200', delG1.status === 200, 'status=' + delG1.status);

  // gid2 và gidForce vẫn đang dùng chung imgUrl → file phải được giữ lại
  const sharedStill = await fetch('http://localhost:3000' + imgUrl);
  check('xoá 1 trong các mục dùng chung ảnh → file vẫn còn',
    sharedStill.status === 200, 'status=' + sharedStill.status);

  const delG2 = await req(`/admin/gallery/${gid2}`, { method: 'DELETE', token: aTok });
  check('xoá ảnh so sánh → 200', delG2.status === 200, 'status=' + delG2.status);

  if (gidForce) {
    const delGF = await req(`/admin/gallery/${gidForce}`, { method: 'DELETE', token: aTok });
    check('xoá ảnh ép kiểu thử → 200', delGF.status === 200, 'status=' + delGF.status);
  }

  if (imgUrl) {
    const gone = await fetch('http://localhost:3000' + imgUrl);
    check('xoá mục cuối cùng dùng ảnh thì file trên đĩa mới bị xoá',
      gone.status === 404, 'status=' + gone.status);
  }

  // dịch vụ đang có đơn không xoá được
  const firstSvcId = baseIds[0];
  if (firstSvcId) {
    try {
      const { db } = await import('./db/database.js');
      const hasBooking = db.prepare('SELECT id FROM bookings WHERE service_id = ?').get(firstSvcId);
      if (!hasBooking) {
        db.prepare(`
          INSERT INTO bookings (code, service_id, service_name, date, time, duration, customer, phone, total)
          VALUES ('BT-TEST-DEL', ?, 'Test Service', '2026-12-31', '10:00', 60, 'Khách Thử', '0912345678', 100000)
        `).run(firstSvcId);
      }
    } catch {}
    const usedSvc = await req(`/admin/catalog/services/${firstSvcId}`, { method: 'DELETE', token: aTok });
    check('không xoá được dịch vụ đang có đơn → 400', usedSvc.status === 400, 'status=' + usedSvc.status);
    check('gợi ý chuyển sang Ẩn', /ẩn/i.test(usedSvc.json?.error || ''), usedSvc.json?.error);
    try {
      const { db } = await import('./db/database.js');
      db.prepare("DELETE FROM bookings WHERE code = 'BT-TEST-DEL'").run();
    } catch {}
  }

  const finalCat = await req('/admin/catalog', { token: aTok });
  check('dữ liệu gốc còn nguyên 4 dịch vụ',
    finalCat.json?.data?.services?.filter((s) => s.active).length === 4,
    String(finalCat.json?.data?.services?.filter((s) => s.active).length));

  console.log(results.join('\n'));
  console.log(`\n========== KẾT QUẢ: ${pass} đạt / ${fail} lỗi ==========\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nLỖI CHẠY KIỂM THỬ:', e.message, '\n', e.stack);
  process.exit(1);
});
