#!/usr/bin/env node
// Xem nhanh database Bùi Thương Makeup từ dòng lệnh — không cần cài thêm gì.
//
//   npm run db                          → liệt kê các bảng + số dòng
//   npm run db -- users                 → xem 20 dòng đầu bảng users
//   npm run db -- bookings 5            → xem 5 dòng đầu bảng bookings
//   npm run db -- bookings --all        → xem tất cả
//   npm run db -- --schema users        → xem cấu trúc bảng
//   npm run db -- --sql "SELECT ..."    → chạy câu truy vấn tự do
//   npm run db -- --tables              → chỉ liệt kê tên bảng

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'moc-studio.db');

const args = process.argv.slice(2);

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  pink: '\x1b[38;5;175m', green: '\x1b[38;5;79m',
  yellow: '\x1b[38;5;222m', gray: '\x1b[38;5;245m', red: '\x1b[38;5;210m',
};

function die(msg) {
  console.error(`${C.red}Lỗi: ${msg}${C.reset}`);
  process.exit(1);
}

// Không in mật khẩu / token ra màn hình
const SECRET_COLS = /password|token|hash|secret/i;

function maskValue(col, val) {
  if (val === null || val === undefined) return null;
  if (SECRET_COLS.test(col)) return '•••••• (đã ẩn)';
  if (typeof val === 'string' && val.length > 60) return val.slice(0, 57) + '...';
  return val;
}

function cell(v) {
  if (v === null || v === undefined) return `${C.dim}NULL${C.reset}`;
  return String(v);
}

// Đếm ký tự hiển thị (bỏ qua mã màu ANSI)
function visLen(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '').length;
}

function pad(s, width) {
  const len = visLen(s);
  return s + ' '.repeat(Math.max(0, width - len));
}

function printTable(rows, columns) {
  if (!rows.length) {
    console.log(`${C.gray}(không có dòng nào)${C.reset}`);
    return;
  }

  const cols = columns || Object.keys(rows[0]);

  const widths = {};
  for (const c of cols) {
    let w = c.length;
    for (const r of rows) w = Math.max(w, visLen(cell(maskValue(c, r[c]))));
    widths[c] = Math.min(w, 34);
  }

  const line = (l, m, r) =>
    l + cols.map((c) => '─'.repeat(widths[c] + 2)).join(m) + r;

  console.log(C.gray + line('┌', '┬', '┐') + C.reset);
  console.log(
    C.gray + '│' + C.reset +
    cols.map((c) => ' ' + C.bold + C.pink + pad(c, widths[c]) + C.reset + ' ').join(C.gray + '│' + C.reset) +
    C.gray + '│' + C.reset
  );
  console.log(C.gray + line('├', '┼', '┤') + C.reset);

  for (const r of rows) {
    const parts = cols.map((c) => {
      let s = cell(maskValue(c, r[c]));
      if (visLen(s) > widths[c]) {
        const raw = String(s).replace(/\x1b\[[0-9;]*m/g, '');
        s = raw.slice(0, widths[c] - 1) + '…';
      }
      return ' ' + pad(s, widths[c]) + ' ';
    });
    console.log(C.gray + '│' + C.reset + parts.join(C.gray + '│' + C.reset) + C.gray + '│' + C.reset);
  }

  console.log(C.gray + line('└', '┴', '┘') + C.reset);
  console.log(`${C.gray}${rows.length} dòng${C.reset}`);
}

function main() {
  let db;
  try {
    db = new Database(DB_PATH);
  } catch (e) {
    die(`không mở được database tại ${DB_PATH}\n     ${e.message}`);
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);

  // ---- không có tham số: liệt kê bảng ----
  if (!args.length || args[0] === '--tables') {
    console.log('');
    console.log(`  ${C.bold}${C.pink}Bùi Thương Makeup — Database${C.reset}  ${C.gray}${DB_PATH}${C.reset}`);
    console.log(`  ${C.gray}${(db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true }) / 1024).toFixed(0)} KB · ${tables.length} bảng${C.reset}`);
    console.log('');

    const rows = tables.map((t) => {
      const n = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
      const cols = db.prepare(`PRAGMA table_info("${t}")`).all().length;
      return { 'Bảng': t, 'Số dòng': n, 'Số cột': cols };
    });

    printTable(rows, ['Bảng', 'Số dòng', 'Số cột']);

    console.log('');
    console.log(`  ${C.gray}Xem dữ liệu :${C.reset} npm run db -- ${C.yellow}<tên-bảng>${C.reset} ${C.gray}[số-dòng]${C.reset}`);
    console.log(`  ${C.gray}Xem cấu trúc:${C.reset} npm run db -- --schema ${C.yellow}<tên-bảng>${C.reset}`);
    console.log(`  ${C.gray}Truy vấn tự do:${C.reset} npm run db -- --sql ${C.yellow}"SELECT ..."${C.reset}`);
    console.log('');
    db.close();
    return;
  }

  // ---- --schema <bảng> ----
  if (args[0] === '--schema') {
    const t = args[1];
    if (!t) die('cần tên bảng, ví dụ: npm run db -- --schema bookings');
    if (!tables.includes(t)) die(`không có bảng "${t}". Các bảng: ${tables.join(', ')}`);

    const cols = db.prepare(`PRAGMA table_info("${t}")`).all();
    const fks = db.prepare(`PRAGMA foreign_key_list("${t}")`).all();
    const idx = db.prepare(`PRAGMA index_list("${t}")`).all();

    console.log('');
    console.log(`  ${C.bold}${C.pink}Bảng ${t}${C.reset}`);
    console.log('');
    printTable(
      cols.map((c) => ({
        'Cột': c.name,
        'Kiểu': c.type || '—',
        'NULL': c.notnull ? 'không' : 'có',
        'Khóa': c.pk ? 'PK' : '',
        'Mặc định': c.dflt_value ?? '—',
      })),
      ['Cột', 'Kiểu', 'NULL', 'Khóa', 'Mặc định']
    );

    if (fks.length) {
      console.log('');
      console.log(`  ${C.bold}Khóa ngoại${C.reset}`);
      printTable(
        fks.map((f) => ({ 'Cột': f.from, 'Trỏ tới': `${f.table}.${f.to}`, 'Khi xoá': f.on_delete })),
        ['Cột', 'Trỏ tới', 'Khi xoá']
      );
    }

    if (idx.length) {
      console.log('');
      console.log(`  ${C.bold}Chỉ mục${C.reset}`);
      printTable(
        idx.map((i) => ({
          'Tên': i.name,
          'Duy nhất': i.unique ? 'có' : '',
          'Cột': db.prepare(`PRAGMA index_info("${i.name}")`).all().map((c) => c.name).join(', '),
        })),
        ['Tên', 'Duy nhất', 'Cột']
      );
    }

    console.log('');
    db.close();
    return;
  }

  // ---- --sql "..." ----
  if (args[0] === '--sql') {
    const sql = args.slice(1).join(' ');
    if (!sql) die('cần câu truy vấn, ví dụ: npm run db -- --sql "SELECT * FROM bookings"');

    try {
      const isSelect = /^\s*(select|pragma|with)/i.test(sql);
      if (isSelect) {
        const rows = db.prepare(sql).all();
        console.log('');
        printTable(rows);
        console.log('');
      } else {
        const info = db.prepare(sql).run();
        console.log(`\n  ${C.green}Đã thực thi.${C.reset} Số dòng thay đổi: ${info.changes}\n`);
      }
    } catch (e) {
      die(e.message);
    }
    db.close();
    return;
  }

  // ---- <bảng> [số dòng | --all] ----
  const t = args[0];
  if (!tables.includes(t)) {
    die(`không có bảng "${t}"\n     Các bảng hiện có: ${tables.join(', ')}`);
  }

  const all = args.includes('--all');
  const limit = all ? -1 : (Number(args[1]) || 20);

  const total = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
  const sql = limit > 0 ? `SELECT * FROM "${t}" LIMIT ?` : `SELECT * FROM "${t}"`;
  const rows = limit > 0 ? db.prepare(sql).all(limit) : db.prepare(sql).all();

  console.log('');
  console.log(`  ${C.bold}${C.pink}Bảng ${t}${C.reset}  ${C.gray}${total} dòng tổng cộng${limit > 0 && total > limit ? ` · hiện ${limit} dòng đầu` : ''}${C.reset}`);
  console.log('');
  printTable(rows);
  if (limit > 0 && total > limit) {
    console.log(`  ${C.gray}Xem tiếp: npm run db -- ${t} ${limit * 2}   hoặc   --all${C.reset}`);
  }
  console.log('');

  db.close();
}

main();
