require('dotenv').config();
const express = require('express');
const db = require('../database/db');
const { guard } = require('../shared/guard');

const app = express();
app.use(express.json());

// GET /transkrip/:npm : mahasiswa hanya npm sendiri, admin semua
app.get('/transkrip/:npm', guard('user'), (req, res) => {
  const { sub, role } = req.subjek;
  const npm = req.params.npm;

  if (role === 'mahasiswa') {
    const u = db.prepare('SELECT npm FROM users WHERE id = ?').get(Number(sub));
    if (!u || u.npm !== npm) {
      return res.status(403).json({ error: 'Hanya boleh melihat transkrip sendiri' });
    }
  } else if (role !== 'admin') {
    return res.status(403).json({ error: 'Role tidak boleh mengakses transkrip' });
  }

  const rows = db.prepare(
    `SELECT k.kode, k.nama AS kelas, t.nilai
     FROM transkrip t JOIN kelas k ON k.id = t.kelas_id
     WHERE t.npm = ?`
  ).all(npm);
  res.json({ npm, transkrip: rows });
});

// POST /transkrip/sinkron : hanya token service
app.post('/transkrip/sinkron', guard('service'), (req, res) => {
  const { kelas_id, data } = req.body || {};
  if (!Number.isInteger(kelas_id) || !Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'Body harus berisi kelas_id (integer) dan data (array)' });
  }
  if (!data.every((d) => typeof d.npm === 'string' && typeof d.nilai === 'number')) {
    return res.status(400).json({ error: 'Setiap item data harus punya npm (string) dan nilai (angka)' });
  }

  const upsert = db.prepare(
    `INSERT INTO transkrip (npm, kelas_id, nilai) VALUES (?, ?, ?)
     ON CONFLICT(npm, kelas_id) DO UPDATE SET nilai = excluded.nilai`
  );

  try {
    db.exec('BEGIN');
    data.forEach((d) => upsert.run(d.npm, kelas_id, d.nilai));
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    return res.status(400).json({ error: 'Gagal menyimpan transkrip', detail: e.message });
  }
  res.json({ message: 'Transkrip disinkronkan', kelas_id, jumlah: data.length });
});

app.listen(process.env.PORT_TRANSKRIP, () => {
  console.log(`Service Transkrip berjalan di port ${process.env.PORT_TRANSKRIP}`);
});