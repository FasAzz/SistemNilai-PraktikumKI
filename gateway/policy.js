const db = require('../database/db');

const izinkan = (alasan, target) => ({ allow: true, alasan, target });
const tolak = (alasan) => ({ allow: false, alasan });

function jamAksesOk(now = new Date()) {
  const mulai = Number(process.env.JAM_MULAI ?? 7);
  const selesai = Number(process.env.JAM_SELESAI ?? 21);
  const jam = now.getHours() + now.getMinutes() / 60;
  return jam >= mulai && jam < selesai;
}

// Tabel kebijakan (sesuai Tabel 3 di soal). Semua yang tidak terdaftar = DENY.
const aturan = [
  {
    method: 'GET', re: /^\/nilai\/?$/, target: 'nilai',
    cek: (s) =>
      ['mahasiswa', 'dosen'].includes(s.role)
        ? izinkan('Role mahasiswa/dosen boleh melihat nilai (data difilter oleh service)')
        : tolak(`Role ${s.role} tidak boleh mengakses /nilai`)
  },
  {
    method: 'PUT', re: /^\/nilai\/(\d+)\/?$/, target: 'nilai',
    cek: (s, m) => {
      if (s.role !== 'dosen') return tolak('Hanya dosen yang boleh mengubah nilai');
      const row = db.prepare(
        'SELECT n.final, k.dosen_id FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?'
      ).get(Number(m[1]));
      if (!row) return tolak('Data nilai tidak ditemukan');
      if (row.dosen_id !== Number(s.sub)) return tolak('Bukan dosen pengampu kelas ini');
      if (row.final) return tolak('Nilai sudah final, tidak boleh diubah');
      if (!jamAksesOk()) return tolak('Di luar jam akses perubahan nilai');
      return izinkan('Dosen pengampu, nilai belum final, dalam jam akses');
    }
  },
  {
    method: 'POST', re: /^\/kelas\/(\d+)\/finalisasi\/?$/, target: 'nilai',
    cek: (s, m) => {
      if (s.role !== 'dosen') return tolak('Hanya dosen yang boleh memfinalisasi nilai');
      const kelas = db.prepare('SELECT dosen_id FROM kelas WHERE id = ?').get(Number(m[1]));
      if (!kelas) return tolak('Kelas tidak ditemukan');
      if (kelas.dosen_id !== Number(s.sub)) return tolak('Bukan dosen pengampu kelas ini');
      if (!jamAksesOk()) return tolak('Di luar jam akses finalisasi nilai');
      return izinkan('Dosen pengampu dan dalam jam akses');
    }
  },
  {
    method: 'GET', re: /^\/transkrip\/([^/]+)\/?$/, target: 'transkrip',
    cek: (s, m) => {
      if (s.role === 'admin') return izinkan('Admin boleh melihat semua transkrip');
      if (s.role === 'mahasiswa') {
        const u = db.prepare('SELECT npm FROM users WHERE id = ?').get(Number(s.sub));
        return u && u.npm === m[1]
          ? izinkan('Mahasiswa mengakses transkrip miliknya sendiri')
          : tolak('Mahasiswa hanya boleh melihat transkrip miliknya sendiri');
      }
      return tolak(`Role ${s.role} tidak boleh mengakses transkrip`);
    }
  },
  {
    method: 'POST', re: /^\/transkrip\/sinkron\/?$/, target: 'transkrip',
    cek: (s) =>
      s.role === 'service'
        ? izinkan('Token service valid')
        : tolak('Endpoint sinkron hanya untuk token service')
  }
];

function putuskan({ method, path, subjek, deviceId }) {
  const rule = aturan.find((r) => r.method === method && r.re.test(path));
  if (!rule) return tolak('Tidak ada kebijakan untuk endpoint ini (default deny)');

  // Verifikasi konteks: device terdaftar (hanya untuk user, bukan service)
  if (subjek.role !== 'service') {
    const dev = db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?')
      .get(Number(subjek.sub), deviceId || '');
    if (!dev) return tolak('Device tidak terdaftar untuk user ini');
  }

  const hasil = rule.cek(subjek, path.match(rule.re));
  if (hasil.allow) hasil.target = rule.target;
  return hasil;
}

module.exports = { putuskan };