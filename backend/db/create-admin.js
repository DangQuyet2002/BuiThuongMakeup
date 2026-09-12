import { initSchema } from './database.js';
import { createUser, listUsers, countUsers } from '../src/users.js';
import { generatePassword } from '../src/auth.js';

initSchema();

const [username, role = 'staff', providedPassword] = process.argv.slice(2);

if (!username) {
  console.log('');
  console.log('  Tạo tài khoản quản trị');
  console.log('');
  console.log('  Cách dùng:');
  console.log('    npm run create-admin <tên-đăng-nhập> [vai-trò] [mật-khẩu]');
  console.log('');
  console.log('  Vai trò: owner (toàn quyền) · staff (đọc + sửa đơn) · viewer (chỉ đọc)');
  console.log('');
  console.log('  Ví dụ:');
  console.log('    npm run create-admin linh owner');
  console.log('    npm run create-admin mai staff MatKhau@123');
  console.log('');
  console.log(`  Hiện có ${countUsers()} tài khoản đang hoạt động.`);
  console.log('');
  process.exit(0);
}

const password = providedPassword || generatePassword(14);

const r = createUser({
  username,
  password,
  displayName: username,
  role: ['owner', 'staff', 'viewer'].includes(role) ? role : 'staff',
});

if (!r.ok) {
  console.error('');
  console.error('  Không tạo được tài khoản:', r.error);
  console.error('');
  process.exit(1);
}

console.log('');
console.log('  ┌─────────────────────────────────────────────┐');
console.log('  │  ĐÃ TẠO TÀI KHOẢN QUẢN TRỊ                  │');
console.log('  ├─────────────────────────────────────────────┤');
console.log(`  │  Tên đăng nhập : ${r.user.username.padEnd(27)}│`);
console.log(`  │  Mật khẩu      : ${password.padEnd(27)}│`);
console.log(`  │  Vai trò       : ${r.user.role.padEnd(27)}│`);
console.log('  └─────────────────────────────────────────────┘');
console.log('');
console.log('  Đăng nhập tại: http://localhost:3000/admin.html');
console.log('');

console.log('  Danh sách tài khoản hiện có:');
for (const u of listUsers()) {
  console.log(`    ${u.username.padEnd(20)} ${u.role.padEnd(8)} ${u.active ? 'hoạt động' : 'đã khoá'}`);
}
console.log('');
