require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const authRouter = require('./auth');
const policy = require('./policy');
const audit = require('./audit');

const app = express();
app.use(express.json());

// 1. Endpoint /auth/* ditangani gateway sendiri (PE/PA)
app.use('/auth', authRouter);

// 2. Verifikasi token: token user ATAU token service (secret berbeda)
function verifikasiToken(token) {
  try { return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); } catch {}
  try { return jwt.verify(token, process.env.SERVICE_JWT_SECRET, { algorithms: ['HS256'] }); } catch {}
  return null;
}

// 3. Proxy ke service, dengan menambahkan X-Gateway-Secret
function buatProxy(port) {
  return createProxyMiddleware({
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('X-Gateway-Secret', process.env.GATEWAY_SECRET);
        fixRequestBody(proxyReq, req); // body JSON sudah dibaca express.json()
      },
      error: (err, req, res) => {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Service tidak dapat dihubungi' }));
      }
    }
  });
}
const proxyNilai = buatProxy(process.env.PORT_NILAI);
const proxyTranskrip = buatProxy(process.env.PORT_TRANSKRIP);

// 4. PEP: periksa SETIAP request sebelum diteruskan
app.use((req, res, next) => {
  const endpoint = `${req.method} ${req.path}`;
  const deviceId = req.get('X-Device-ID');
  const auth = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const subjek = token && verifikasiToken(token);

  if (!subjek) {
    audit.catat({ subjek: 'anonim', endpoint, device: deviceId, hasil: 'deny',
      alasan: 'Token tidak ada, tidak valid, atau kedaluwarsa' });
    return res.status(401).json({ error: 'Token tidak ada, tidak valid, atau kedaluwarsa' });
  }

  const keputusan = policy.putuskan({ method: req.method, path: req.path, subjek, deviceId });
  audit.catat({
    subjek: subjek.username || subjek.sub,
    endpoint,
    device: deviceId,
    hasil: keputusan.allow ? 'allow' : 'deny',
    alasan: keputusan.alasan
  });

  if (!keputusan.allow) return res.status(403).json({ error: keputusan.alasan });
  req.target = keputusan.target;
  next();
});

// 5. Teruskan ke service tujuan
app.use((req, res, next) =>
  req.target === 'nilai' ? proxyNilai(req, res, next) : proxyTranskrip(req, res, next)
);

app.listen(process.env.PORT_GATEWAY, () => {
  console.log(`Gateway berjalan di port ${process.env.PORT_GATEWAY}`);
});