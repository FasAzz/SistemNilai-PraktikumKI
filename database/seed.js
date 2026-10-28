const bcrypt = require('bcryptjs');
const db = require('./db');

// Bersihkan data lama supaya seed bisa dijalankan berulang
db.exec(`
  DELETE FROM audit_log;
  DELETE FROM refresh_tokens;
  DELETE FROM transkrip;
  DELETE FROM nilai;
  DELETE FROM kelas;
  DELETE FROM devices;
  DELETE FROM users;
  DELETE FROM sqlite_sequence;
`);

const insertUser = db.prepare(
  'INSERT INTO users (username, password_hash, nama, role, nim) VALUES (?, ?, ?, ?, ?)'
);
const insertDevice = db.prepare(
  'INSERT INTO devices (user_id, device_id) VALUES (?, ?)'
);

function buatUser(username, password, nama, role, nim, deviceId) {
  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = insertUser.run(username, hash, nama, role, nim);
  insertDevice.run(lastInsertRowid, deviceId);
  return Number(lastInsertRowid);
}

// --- Users (1 admin, 2 dosen, 3 mahasiswa) ---
const admin  = buatUser('admin',  'admin123',  'Admin Prodi',    'admin',     null,         'DEV-ADMIN-01');
const dosen1 = buatUser('dosen1', 'dosen123',  'Dr. Budi',       'dosen',     null,         'DEV-DOSEN-01');
const dosen2 = buatUser('dosen2', 'dosen123',  'Dr. Siti',       'dosen',     null,         'DEV-DOSEN-02');
const mhs1   = buatUser('mhs1',   'mhs123',    'Andi Pratama',   'mahasiswa', '2210001',    'DEV-MHS-01');
const mhs2   = buatUser('mhs2',   'mhs123',    'Rina Lestari',   'mahasiswa', '2210002',    'DEV-MHS-02');
const mhs3   = buatUser('mhs3',   'mhs123',    'Dedi Kurniawan', 'mahasiswa', '2210003',    'DEV-MHS-03');

// --- Kelas (2 kelas, dosen berbeda) ---
const insertKelas = db.prepare(
  'INSERT INTO kelas (kode, nama, dosen_id) VALUES (?, ?, ?)'
);
const kelas1 = Number(insertKelas.run('KI-101', 'Keamanan Informasi', dosen1).lastInsertRowid);
const kelas2 = Number(insertKelas.run('JK-201', 'Jaringan Komputer', dosen2).lastInsertRowid);

// --- Nilai awal (belum final) ---
const insertNilai = db.prepare(
  'INSERT INTO nilai (kelas_id, mahasiswa_id, nilai) VALUES (?, ?, ?)'
);
[mhs1, mhs2, mhs3].forEach((m, i) => insertNilai.run(kelas1, m, 70 + i * 5));
[mhs1, mhs2, mhs3].forEach((m, i) => insertNilai.run(kelas2, m, 80 - i * 5));

console.log('Seed selesai.');
console.log('Akun (username / password / device ID):');
console.log('  admin  / admin123 / DEV-ADMIN-01');
console.log('  dosen1 / dosen123 / DEV-DOSEN-01  (mengampu KI-101)');
console.log('  dosen2 / dosen123 / DEV-DOSEN-02  (mengampu JK-201)');
console.log('  mhs1   / mhs123   / DEV-MHS-01    (NPM 2210001)');
console.log('  mhs2   / mhs123   / DEV-MHS-02    (NPM 2210002)');
console.log('  mhs3   / mhs123   / DEV-MHS-03    (NPM 2210003)');