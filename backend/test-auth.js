#!/usr/bin/env node
// Bộ kiểm thử nhanh cho backend Bùi Thương Makeup v1.2.0
// Chạy: node test-auth.js   (hoặc: npm test)
//
// LƯU Ý: bộ kiểm thử tự xoá tài khoản thử (tên bắt đầu bằng "test") ở cuối.
// Nó cần 3 tài khoản cố định: admin (owner), linh (staff), mai (viewer).
// Nếu bị chặn vì rate limit, xoá bộ đếm bằng:
//   node -e "import('./db/database.js').then(({db})=>db.prepare('DELETE FROM rate_limits').run())"
import { execSync } from 'child_process';

const BASE = process.env.BASE || 'http://localhost:3000/api';
let pass = 0, fail = 0;
const results = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name}${extra ? '  → ' + extra : ''}`); }
}

async function req(path, { method = 'GET', body, token, headers = {} } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

function section(t) { results.push(`\n${t}`); }

const ADMIN = { u: 'admin', p: 'Admin@2026!Ok' };
const STAFF = { u: 'linh', p: 'Staff@2026' };
const VIEWER = { u: 'mai', p: 'View@2026' };

async function login(cred) {
  const r = await req('/admin/login', { method: 'POST', body: { username: cred.u, password: cred.p } });
  return r.json?.data?.token || null;
}

(async () => {
  console.log('\n========== KIỂM THỬ BACKEND BÙI THƯƠNG MAKEUP ==========\n');

  // ---------- 0. Dọn trạng thái cũ để kết quả tất định ----------
  // Bộ đếm rate limit nằm trong database và tồn tại giữa các lần chạy.
  // Nếu không xoá trước, lần chạy đầu sau một hồi hoạt động sẽ bị 429
  // ngay ở bước đăng nhập và cho ra kết quả sai lệch.
  try {
    const { db } = await import('./db/database.js');
    const { createUser, getUserByUsername } = await import('./src/users.js');
    const { hashPassword } = await import('./src/auth.js');
    db.prepare('DELETE FROM rate_limits').run();
    db.prepare('DELETE FROM users WHERE username LIKE \'test%\'').run();
    db.prepare('DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)').run();
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hashPassword('Admin@2026!Ok'), 'admin');
    if (!getUserByUsername('linh')) {
      createUser({ username: 'linh', password: 'Staff@2026', displayName: 'Linh Staff', role: 'staff' });
    } else {
      db.prepare('UPDATE users SET password_hash = ?, active = 1 WHERE username = ?').run(hashPassword('Staff@2026'), 'linh');
    }
    if (!getUserByUsername('mai')) {
      createUser({ username: 'mai', password: 'View@2026', displayName: 'Mai Viewer', role: 'viewer' });
    } else {
      db.prepare('UPDATE users SET password_hash = ?, active = 1 WHERE username = ?').run(hashPassword('View@2026'), 'mai');
    }
  } catch (e) {
    console.warn('  (cảnh báo) không dọn được trạng thái cũ:', e.message);
  }

  // ---------- 1. Đăng nhập ----------
  section('1. ĐĂNG NHẬP');
  const aTok = await login(ADMIN);
  const sTok = await login(STAFF);
  const vTok = await login(VIEWER);
  check('admin (owner) đăng nhập được', !!aTok);
  check('linh (staff) đăng nhập được', !!sTok);
  check('mai (viewer) đăng nhập được', !!vTok);

  const bad = await req('/admin/login', { method: 'POST', body: { username: 'admin', password: 'sai-mat-khau' } });
  check('sai mật khẩu → 401', bad.status === 401, 'status=' + bad.status);

  const noUser = await req('/admin/login', { method: 'POST', body: { username: 'khong-ton-tai', password: 'Xyz@12345' } });
  check('tài khoản không tồn tại → 401', noUser.status === 401, 'status=' + noUser.status);

  const noTok = await req('/admin/stats');
  check('không có token → 401 + NO_TOKEN', noTok.status === 401 && noTok.json?.code === 'NO_TOKEN');

  const badTok = await req('/admin/stats', { token: 'deadbeef'.repeat(8) });
  check('token giả → 401 + SESSION_EXPIRED', badTok.status === 401 && badTok.json?.code === 'SESSION_EXPIRED');

  // ---------- 2. Phiên & /me ----------
  section('2. PHIÊN ĐĂNG NHẬP & THÔNG TIN NGƯỜI DÙNG');
  const me = await req('/admin/me', { token: aTok });
  check('GET /me với token hợp lệ → 200', me.status === 200);
  check('/me trả về role owner', me.json?.data?.role === 'owner', me.json?.data?.role);
  check('/me có permissions.admin = true', me.json?.data?.permissions?.admin === true);
  check('/me có displayName', !!me.json?.data?.displayName, JSON.stringify(me.json?.data));

  const meV = await req('/admin/me', { token: vTok });
  check('/me viewer: permissions.write = false', meV.json?.data?.permissions?.write === false);
  check('/me viewer: permissions.admin = false', meV.json?.data?.permissions?.admin === false);

  // ---------- 3. Header Rate-Limit ----------
  section('3. RATE LIMIT — HEADER CHUẨN');
  const rl = await req('/services');
  check('có header X-RateLimit-Limit', !!rl.headers.get('x-ratelimit-limit'), rl.headers.get('x-ratelimit-limit'));
  check('có header X-RateLimit-Remaining', rl.headers.get('x-ratelimit-remaining') !== null);
  check('có header X-RateLimit-Reset', !!rl.headers.get('x-ratelimit-reset'));

  // ---------- 4. Phân quyền ----------
  section('4. PHÂN QUYỀN (RBAC)');

  const vStats = await req('/admin/stats', { token: vTok });
  check('viewer ĐỌC stats → 200', vStats.status === 200, 'status=' + vStats.status);

  const vBook = await req('/admin/bookings', { token: vTok });
  check('viewer ĐỌC danh sách đơn → 200', vBook.status === 200, 'status=' + vBook.status);

  const firstId = vBook.json?.data?.[0]?.id;
  check('có ít nhất 1 đơn để thử ghi', !!firstId);

  const vWrite = await req(`/admin/bookings/${firstId}/status`, {
    method: 'PATCH', token: vTok, body: { status: 'confirmed' },
  });
  check('viewer GHI (đổi trạng thái) → 403', vWrite.status === 403, 'status=' + vWrite.status);
  check('403 có code FORBIDDEN', vWrite.json?.code === 'FORBIDDEN');

  const vUsers = await req('/admin/users', { token: vTok });
  check('viewer vào trang tài khoản → 403', vUsers.status === 403, 'status=' + vUsers.status);

  const sBook = await req('/admin/bookings', { token: sTok });
  check('staff ĐỌC danh sách đơn → 200', sBook.status === 200, 'status=' + sBook.status);

  const sUsers = await req('/admin/users', { token: sTok });
  check('staff vào trang tài khoản → 403', sUsers.status === 403, 'status=' + sUsers.status);

  const sAudit = await req('/admin/audit', { token: sTok });
  check('staff xem nhật ký → 403', sAudit.status === 403, 'status=' + sAudit.status);

  const aUsers = await req('/admin/users', { token: aTok });
  check('owner vào trang tài khoản → 200', aUsers.status === 200, 'status=' + aUsers.status);

  const aAudit = await req('/admin/audit', { token: aTok });
  check('owner xem nhật ký → 200', aAudit.status === 200, 'status=' + aAudit.status);

  // ---------- 5. Ghi dữ liệu với staff ----------
  section('5. STAFF GHI DỮ LIỆU');
  const sWrite = await req(`/admin/bookings/${firstId}/status`, {
    method: 'PATCH', token: sTok, body: { status: 'confirmed', notify: false },
  });
  check('staff ĐỔI TRẠNG THÁI → 200', sWrite.status === 200, 'status=' + sWrite.status + ' ' + (sWrite.json?.error || ''));

  // trả lại trạng thái cũ
  await req(`/admin/bookings/${firstId}/status`, {
    method: 'PATCH', token: aTok, body: { status: 'pending', notify: false },
  });

  // ---------- 6. Đổi mật khẩu ----------
  section('6. ĐỔI MẬT KHẨU');
  const cpWrong = await req('/admin/change-password', {
    method: 'POST', token: vTok, body: { currentPassword: 'sai-hoan-toan', newPassword: 'Moi@2026abc' },
  });
  check('sai mật khẩu hiện tại → 400', cpWrong.status === 400, 'status=' + cpWrong.status);

  const cpWeak = await req('/admin/change-password', {
    method: 'POST', token: vTok, body: { currentPassword: VIEWER.p, newPassword: 'abc' },
  });
  check('mật khẩu mới quá yếu → 400', cpWeak.status === 400, 'status=' + cpWeak.status);

  const cpSame = await req('/admin/change-password', {
    method: 'POST', token: vTok, body: { currentPassword: VIEWER.p, newPassword: VIEWER.p },
  });
  check('mật khẩu mới trùng mật khẩu cũ → 400', cpSame.status === 400, 'status=' + cpSame.status);

  // ---------- 7. Quản lý tài khoản ----------
  section('7. QUẢN LÝ TÀI KHOẢN (owner)');
  const tmpName = 'test' + Date.now().toString().slice(-6);
  const created = await req('/admin/users', {
    method: 'POST', token: aTok,
    body: { username: tmpName, displayName: 'Tài khoản thử', role: 'staff' },
  });
  check('tạo tài khoản (tự sinh mật khẩu) → 201', created.status === 201, 'status=' + created.status + ' ' + (created.json?.error || ''));
  check('trả về mật khẩu tự sinh', !!created.json?.data?.generatedPassword);

  const newPw = created.json?.data?.generatedPassword;
  const newTok = newPw ? (await req('/admin/login', { method: 'POST', body: { username: tmpName, password: newPw } })).json?.data?.token : null;
  check('tài khoản mới đăng nhập được bằng mật khẩu tự sinh', !!newTok);

  const dupUser = await req('/admin/users', {
    method: 'POST', token: aTok, body: { username: tmpName, role: 'staff' },
  });
  check('tạo trùng tên đăng nhập → 400', dupUser.status === 400, 'status=' + dupUser.status);

  const badUser = await req('/admin/users', {
    method: 'POST', token: aTok, body: { username: 'AB', role: 'staff' },
  });
  check('tên đăng nhập không hợp lệ → 400', badUser.status === 400, 'status=' + badUser.status);

  const newId = created.json?.data?.user?.id;
  let reset = null;
  if (newId) {
    const myself = await req('/admin/me', { token: aTok });
    const selfLock = await req(`/admin/users/${myself.json.data.id}/active`, {
      method: 'PATCH', token: aTok, body: { active: false },
    });
    check('owner không tự khoá được chính mình → 400', selfLock.status === 400, 'status=' + selfLock.status);

    const locked = await req(`/admin/users/${newId}/active`, {
      method: 'PATCH', token: aTok, body: { active: false },
    });
    check('khoá tài khoản → 200', locked.status === 200, 'status=' + locked.status);

    const lockedLogin = await req('/admin/login', { method: 'POST', body: { username: tmpName, password: newPw } });
    check('tài khoản bị khoá không đăng nhập được → 401', lockedLogin.status === 401, 'status=' + lockedLogin.status);

    const opened = await req(`/admin/users/${newId}/active`, {
      method: 'PATCH', token: aTok, body: { active: true },
    });
    check('mở khoá tài khoản → 200', opened.status === 200, 'status=' + opened.status);

    reset = await req(`/admin/users/${newId}/reset-password`, { method: 'POST', token: aTok });
    check('đặt lại mật khẩu → 200 + mật khẩu mới', reset.status === 200 && !!reset.json?.data?.newPassword, 'status=' + reset.status);

    const afterReset = await req('/admin/login', { method: 'POST', body: { username: tmpName, password: reset.json.data.newPassword } });
    check('đăng nhập bằng mật khẩu vừa đặt lại', !!afterReset.json?.data?.token);

    const kick = await req(`/admin/users/${newId}/sessions`, { method: 'DELETE', token: aTok });
    check('đăng xuất mọi thiết bị → 200', kick.status === 200, 'status=' + kick.status);

    const kickedTok = afterReset.json?.data?.token;
    const afterKick = await req('/admin/me', { token: kickedTok });
    check('token cũ bị vô hiệu sau khi đăng xuất mọi thiết bị → 401', afterKick.status === 401, 'status=' + afterKick.status);

    // dọn dẹp: khoá tài khoản thử
    await req(`/admin/users/${newId}/active`, { method: 'PATCH', token: aTok, body: { active: false } });
  }

  // ---------- 8. Nhật ký kiểm toán ----------
  section('8. NHẬT KÝ THAO TÁC');
  await new Promise(r => setTimeout(r, 300));
  const audit = await req('/admin/audit?limit=100', { token: aTok });
  const actions = (audit.json?.data || []).map(x => x.action);
  check('nhật ký có bản ghi', audit.json?.data?.length > 0, 'số bản ghi=' + audit.json?.data?.length);
  check('ghi lại hành động đổi trạng thái', actions.includes('doi_trang_thai'), actions.join(','));
  check('ghi lại hành động tạo tài khoản', actions.includes('tao_tai_khoan'));
  check('ghi lại hành động đặt lại mật khẩu', actions.includes('dat_lai_mat_khau'));
  check('ghi lại hành động đăng xuất thiết bị', actions.includes('dang_xuat_moi_thiet_bi'));
  check('ghi lại hành vi bị từ chối (thiếu quyền)', actions.includes('bi_tu_choi'));

  // ---------- 9. Đăng xuất ----------
  section('9. ĐĂNG XUẤT');
  const tmpTok2 = (await req('/admin/login', { method: 'POST', body: { username: tmpName, password: reset?.json?.data?.newPassword || newPw } })).json?.data?.token;
  if (tmpTok2) {
    const lo = await req('/admin/logout', { method: 'POST', token: tmpTok2 });
    check('đăng xuất → 200', lo.status === 200, 'status=' + lo.status);
    const after = await req('/admin/me', { token: tmpTok2 });
    check('token không dùng được sau khi đăng xuất → 401', after.status === 401, 'status=' + after.status);
  }

  // ---------- 10. Rate limit đăng nhập ----------
  section('10. RATE LIMIT ĐĂNG NHẬP (8 lần / 5 phút)');
  let last = null;
  for (let i = 0; i < 12; i++) {
    last = await req('/admin/login', { method: 'POST', body: { username: 'admin', password: 'sai-lan-' + i } });
    if (last.status === 429) break;
  }
  check('login rate limit chặn sau 8 lần → 429', last?.status === 429, 'status=' + last?.status);
  check('429 có header Retry-After', !!last?.headers?.get('retry-after'), last?.headers?.get('retry-after'));
  check('429 có code RATE_LIMITED', last?.json?.code === 'RATE_LIMITED', last?.json?.code);

  // ---------- dọn dẹp ----------
  section('DỌN DẸP');
  try {
    const { db } = await import('./db/database.js');
    const del = db.prepare("DELETE FROM users WHERE username LIKE 'test%'").run();
    db.prepare('DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)').run();
    db.prepare('DELETE FROM rate_limits').run();
    check(`đã xoá ${del.changes} tài khoản thử + reset rate limit`, true);
  } catch (e) {
    check('dọn dẹp', false, e.message);
  }

  // ---------- kết quả ----------
  console.log(results.join('\n'));
  console.log(`\n========== KẾT QUẢ: ${pass} đạt / ${fail} lỗi ==========\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('\nLỖI CHẠY KIỂM THỬ:', e.message, e.stack);
  process.exit(1);
});
