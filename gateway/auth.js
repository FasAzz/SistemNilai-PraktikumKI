require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../database/db');
const audit = require('./audit');

const router = express.Router();

const ACCESS_TTL = '10m';
const SERVICE_TTL = '5m';
const REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // 1 hari

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function buatAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function buatRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).run(userId, hashToken(token), Date.now() + REFRESH_TTL_MS);
  return token;
}

// POST /auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const deviceId = req.get('X-Device-ID');
  const endpoint = 'POST /auth/login';

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    audit.catat({ subjek: username, endpoint, device: deviceId, hasil: 'deny', alasan: 'Kredensial salah' });
    return res.status(401).json({ error: 'Kredensial salah' });
  }

  const dev = db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?')
    .get(user.id, deviceId || '');
  if (!dev) {
    audit.catat({ subjek: username, endpoint, device: deviceId, hasil: 'deny', alasan: 'Device tidak terdaftar' });
    return res.status(403).json({ error: 'Device tidak terdaftar' });
  }

  audit.catat({ subjek: username, endpoint, device: deviceId, hasil: 'allow', alasan: 'Login berhasil' });
  res.json({
    access_token: buatAccessToken(user),
    refresh_token: buatRefreshToken(user.id),
    token_type: 'Bearer',
    expires_in: 600
  });
});

// POST /auth/refresh
router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body || {};
  const endpoint = 'POST /auth/refresh';
  const row = refresh_token && db.prepare(
    'SELECT * FROM refresh_tokens WHERE token_hash = ?'
  ).get(hashToken(refresh_token));

  if (!row || row.revoked || row.expires_at < Date.now()) {
    audit.catat({ subjek: 'anonim', endpoint, hasil: 'deny', alasan: 'Refresh token tidak valid, dicabut, atau kedaluwarsa' });
    return res.status(401).json({ error: 'Refresh token tidak valid' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  audit.catat({ subjek: user.username, endpoint, hasil: 'allow', alasan: 'Access token baru diterbitkan' });
  res.json({ access_token: buatAccessToken(user), token_type: 'Bearer', expires_in: 600 });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  const { refresh_token } = req.body || {};
  const endpoint = 'POST /auth/logout';
  const row = refresh_token && db.prepare(
    'SELECT * FROM refresh_tokens WHERE token_hash = ?'
  ).get(hashToken(refresh_token));

  if (!row || row.revoked) {
    audit.catat({ subjek: 'anonim', endpoint, hasil: 'deny', alasan: 'Refresh token tidak valid' });
    return res.status(401).json({ error: 'Refresh token tidak valid' });
  }

  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(row.id);
  audit.catat({ subjek: String(row.user_id), endpoint, hasil: 'allow', alasan: 'Refresh token dicabut' });
  res.json({ message: 'Logout berhasil, refresh token dicabut' });
});

// POST /auth/service
router.post('/service', (req, res) => {
  const { client_id, client_secret } = req.body || {};
  const endpoint = 'POST /auth/service';

  const idOk = client_id === process.env.SERVICE_CLIENT_ID;
  const secretOk = typeof client_secret === 'string' &&
    client_secret.length === process.env.SERVICE_CLIENT_SECRET.length &&
    crypto.timingSafeEqual(Buffer.from(client_secret), Buffer.from(process.env.SERVICE_CLIENT_SECRET));

  if (!idOk || !secretOk) {
    audit.catat({ subjek: client_id, endpoint, hasil: 'deny', alasan: 'Client ID atau secret salah' });
    return res.status(401).json({ error: 'Client ID atau secret salah' });
  }

  const token = jwt.sign(
    { sub: client_id, role: 'service' },
    process.env.SERVICE_JWT_SECRET,
    { expiresIn: SERVICE_TTL }
  );
  audit.catat({ subjek: client_id, endpoint, hasil: 'allow', alasan: 'Token service diterbitkan' });
  res.json({ access_token: token, token_type: 'Bearer', expires_in: 300 });
});

module.exports = router;