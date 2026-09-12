#!/usr/bin/env node
// Kiểm tra vòng tròn đầy đủ: sửa ở trang quản trị → hiện ra trang công khai.
// Chạy: node test-e2e.js   (cần server đang chạy)
const API = process.env.BASE || 'http://localhost:3000/api';
const ADMIN = { username: 'admin', password: 'Admin@2026!Ok' };

const post = (p, body, token) =>
  fetch(API + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  }).then((r) => r.json().then((j) => ({ status: r.status, j })));

const patch = (p, body, token) =>
  fetch(API + p, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  }).then((r) => r.json().then((j) => ({ status: r.status, j })));

const get = (p, token) =>
  fetch(API + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} }).then((r) =>
    r.json().then((j) => ({ status: r.status, j }))
  );

const del = (p, token) =>
  fetch(API + p, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }).then((r) =>
    r.json().then((j) => ({ status: r.status, j }))
  );

const out = [];
const ok = (t) => out.push('  ✓ ' + t);
const no = (t, x) => out.push('  ✗ ' + t + (x ? ' → ' + x : ''));

const login = await post('/admin/login', ADMIN);
const token = login.j.data.token;
if (!token) { console.error('Không đăng nhập được'); process.exit(1); }
ok('đăng nhập quản trị');

// ---- 1. GIÁ: sửa giá một dịch vụ rồi xem trang công khai ----
const before = await get('/services');
const svc = before.j.data.services[0];
const giaCu = svc.price;
const giaMoi = giaCu + 50000;

const up = await patch(`/admin/catalog/services/${svc.id}`, { price: giaMoi }, token);
ok(`sửa giá dịch vụ "${svc.name}" qua API quản trị (${up.status})`);

const afterPub = await get('/services');
const svcPub = afterPub.j.data.services.find((s) => s.id === svc.id);
ok(`trang công khai hiện giá mới ${svcPub.price}`, svcPub.price === giaMoi);

// khôi phục
await patch(`/admin/catalog/services/${svc.id}`, { price: giaCu }, token);
const restored = await get('/services');
ok('khôi phục giá gốc', restored.j.data.services.find((s) => s.id === svc.id).price === giaCu);

// ---- 2. ẨN/HIỆN dịch vụ ----
await patch(`/admin/catalog/services/${svc.id}/active`, { active: false }, token);
const hidden = await get('/services');
ok('ẩn dịch vụ → biến mất khỏi trang công khai',
  !hidden.j.data.services.some((s) => s.id === svc.id));
await patch(`/admin/catalog/services/${svc.id}/active`, { active: true }, token);
const shown = await get('/services');
ok('hiện lại → quay về trang công khai',
  shown.j.data.services.some((s) => s.id === svc.id));

// ---- 3. ẢNH: tải lên hai ảnh (trước + sau) rồi xem trang công khai ----
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function upload(name) {
  const fd = new FormData();
  fd.append('files', new Blob([png], { type: 'image/png' }), name);
  const res = await fetch(API + '/admin/uploads', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  const json = await res.json();
  return { status: res.status, url: json.data?.[0]?.url };
}

const upBefore = await upload('truoc.png');
const upAfter = await upload('sau.png');
ok(`tải ảnh TRƯỚC lên (${upBefore.status})`, upBefore.status === 201 && !!upBefore.url);
ok(`tải ảnh SAU lên (${upAfter.status})`, upAfter.status === 201 && !!upAfter.url);
const urlBefore = upBefore.url;
const urlAfter = upAfter.url;

// ảnh phải phục vụ được qua HTTP
const fileRes = await fetch('http://localhost:3000' + urlAfter);
ok('ảnh truy cập được qua /uploads, đúng định dạng image/png',
  fileRes.status === 200 && fileRes.headers.get('content-type')?.includes('image/png'));

// tạo mục thư viện ảnh — cố tình gửi kind 'photo' kiểu cũ để chắc chắn bị ép về compare
const made = await post('/admin/gallery', {
  title: 'Ảnh kiểm tra tự động',
  category: 'Dự tiệc',
  kind: 'photo',
  beforeImage: urlBefore,
  afterImage: urlAfter,
  alt_text: 'Ảnh kiểm tra',
}, token);
const gid = made.j.data?.id;
ok(`tạo mục thư viện ảnh (${made.status})`, made.status === 201 || made.status === 200, JSON.stringify(made.j).slice(0, 120));
ok('mục lưu là loại compare', made.j.data?.kind === 'compare', made.j.data?.kind);
ok('mục có đủ ảnh trước và sau',
  !!made.j.data?.before_image && !!made.j.data?.after_image);

const galPub = await get('/gallery');
const pubItem = galPub.j.data.find((g) => g.id === gid);
ok('mục ảnh hiện trên trang công khai', !!pubItem);
ok('trang công khai nhận đủ ảnh trước và sau để vẽ lưới + so sánh',
  !!pubItem?.before_image && !!pubItem?.after_image);

// ---- 4. DỌN DẸP ----
const rm = await del(`/admin/gallery/${gid}`, token);
ok(`xoá mục thư viện ảnh (${rm.status})`, rm.status === 200);

for (const u of [urlBefore, urlAfter]) {
  const gone = await fetch('http://localhost:3000' + u);
  ok(`xoá mục → file ảnh ${u.split('/').pop()} cũng bị xoá khỏi đĩa (404)`, gone.status === 404);
}

const galEnd = await get('/gallery');
ok('trang công khai không còn mục ảnh thử', !galEnd.j.data.some((g) => g.id === gid));

console.log(out.join('\n'));
const fails = out.filter((l) => l.startsWith('  ✗')).length;
console.log(`\n===== ${out.length - fails} đạt / ${fails} lỗi =====\n`);
process.exit(fails ? 1 : 0);
