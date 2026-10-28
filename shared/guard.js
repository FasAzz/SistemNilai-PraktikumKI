require('dotenv').config();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
// Dibandingkan lewat hash supaya panjangnya sama dan aman dari timing attack
const samaAman = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// jenis: 'user'    -> hanya access token user (JWT_SECRET)
//        'service' -> hanya token service (SERVICE_JWT_SECRET)
function guard(jenis) {
  const secret = jenis === 'service'
    ? process.env.SERVICE_JWT_SECRET
    : process.env.JWT_SECRET;

  return (req, res, next) => {
    // 1. Gateway secret: service tidak bisa diakses langsung
    const gs = req.get('X-Gateway-Secret');
    if (!gs || !samaAman(gs, process.env.GATEWAY_SECRET)) {
      return res.status(403).json({ error: 'Akses langsung ditolak: gateway secret tidak valid' });
    }

    // 2. Verifikasi ulang token (tanda tangan + masa berlaku)
    const auth = req.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token tidak ada' });

    try {
      req.subjek = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa' });
    }

    // 3. Pastikan role sesuai jenis token
    if (jenis === 'service' && req.subjek.role !== 'service') {
      return res.status(403).json({ error: 'Hanya token service yang diterima' });
    }
    if (jenis === 'user' && req.subjek.role === 'service') {
      return res.status(403).json({ error: 'Token service tidak boleh dipakai di endpoint ini' });
    }
    next();
  };
}

module.exports = { guard };