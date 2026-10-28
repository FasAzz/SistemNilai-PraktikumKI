require('dotenv').config();
const express = require('express');
const db = require('../database/db');
const { guard } = require('../shared/guard');

const app = express();
app.use(express.json());
app.use(guard('user'));

// GET /nilai : mahasiswa hanya miliknya, dosen hanya kelas yang diampu
app.get('/nilai', (req, res) => {
  const { sub, role } = req.subjek;
  let rows;
  if (role === 'mahasiswa') {
    rows = db.prepare(
      `SELECT n.id, k.kode, k.nama AS kelas, n.nilai, n.final
       FROM nilai n JOIN kelas k ON k.id = n.kelas_id
       WHERE n.mahasiswa_id = ?`
    ).all(Number(sub));
  } else if (role === 'dosen') {
    rows = db.prepare(
      `SELECT n.id, k.kode, k.nama AS kelas, u.npm, u.nama AS mahasiswa, n.nilai, n.final
       FROM nilai n
       JOIN kelas k ON k.id = n.kelas_id
       JOIN users u ON u.id = n.mahasiswa_id
       WHERE k.dosen_id = ?`
    ).all(Number(sub));
  } else {
    return res.status(403).json({ error: 'Role tidak boleh mengakses nilai' });
  }
  res.json(rows);
});

// PUT /nilai/:id : ubah nilai (dosen pengampu, belum final)
app.put('/nilai/:id', (req, res) => {
  const { sub, role } = req.subjek;
  if (role !== 'dosen') return res.status(403).json({ error: 'Hanya dosen' });

  const nilai = req.body && req.body.nilai;
  if (typeof nilai !== 'number' || nilai < 0 || nilai > 100) {
    return res.status(400).json({ error: 'Field "nilai" harus angka 0-100' });
  }

  const row = db.prepare(
    `SELECT n.id, n.final, k.dosen_id
     FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?`
  ).get(Number(req.params.id));

  if (!row) return res.status(404).json({ error: 'Data nilai tidak ditemukan' });
  if (row.dosen_id !== Number(sub)) return res.status(403).json({ error: 'Bukan dosen pengampu kelas ini' });
  if (row.final) return res.status(409).json({ error: 'Nilai sudah final' });

  db.prepare('UPDATE nilai SET nilai = ? WHERE id = ?').run(nilai, row.id);
  res.json({ message: 'Nilai diperbarui', id: row.id, nilai });
});

// POST /kelas/:id/finalisasi : finalisasi lalu sinkron ke transkrip LEWAT GATEWAY
app.post('/kelas/:id/finalisasi', async (req, res) => {
  const { sub, role } = req.subjek;
  if (role !== 'dosen') return res.status(403).json({ error: 'Hanya dosen' });

  const kelasId = Number(req.params.id);
  const kelas = db.prepare('SELECT * FROM kelas WHERE id = ?').get(kelasId);
  if (!kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  if (kelas.dosen_id !== Number(sub)) return res.status(403).json({ error: 'Bukan dosen pengampu kelas ini' });
  if (kelas.finalisasi) return res.status(409).json({ error: 'Kelas sudah difinalisasi' });

  const rows = db.prepare(
    `SELECT u.npm, n.nilai
     FROM nilai n JOIN users u ON u.id = n.mahasiswa_id
     WHERE n.kelas_id = ?`
  ).all(kelasId);
  if (rows.some((r) => r.nilai === null)) {
    return res.status(400).json({ error: 'Masih ada nilai yang kosong' });
  }

  try {
    const gw = `http://127.0.0.1:${process.env.PORT_GATEWAY}`;

    // a. Ambil token service (client ID + secret)
    const tk = await fetch(`${gw}/auth/service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SERVICE_CLIENT_ID,
        client_secret: process.env.SERVICE_CLIENT_SECRET
      })
    });
    if (!tk.ok) throw new Error(`Gagal mendapat token service (HTTP ${tk.status})`);
    const { access_token } = await tk.json();

    // b. Panggil sinkron transkrip lewat gateway
    const sync = await fetch(`${gw}/transkrip/sinkron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access_token}`
      },
      body: JSON.stringify({
        kelas_id: kelasId,
        data: rows.map((r) => ({ npm: r.npm, nilai: r.nilai }))
      })
    });
    if (!sync.ok) throw new Error(`Sinkron transkrip ditolak (HTTP ${sync.status})`);
  } catch (e) {
    return res.status(502).json({ error: 'Sinkron gagal, finalisasi dibatalkan', detail: e.message });
  }

  // c. Sinkron sukses -> tandai final
  db.exec('BEGIN');
  db.prepare('UPDATE nilai SET final = 1 WHERE kelas_id = ?').run(kelasId);
  db.prepare('UPDATE kelas SET finalisasi = 1 WHERE id = ?').run(kelasId);
  db.exec('COMMIT');

  res.json({ message: 'Kelas difinalisasi dan nilai dikirim ke transkrip', kelas_id: kelasId, jumlah: rows.length });
});

app.listen(process.env.PORT_NILAI, () => {
  console.log(`Service Nilai berjalan di port ${process.env.PORT_NILAI}`);
});