const db = require('../database/db');

const insertLog = db.prepare(
  'INSERT INTO audit_log (waktu, subjek, endpoint, device, hasil, alasan) VALUES (?, ?, ?, ?, ?, ?)'
);

function catat({ subjek, endpoint, device, hasil, alasan }) {
  insertLog.run(
    new Date().toISOString(),
    subjek || 'anonim',
    endpoint,
    device || '-',
    hasil,
    alasan
  );
}

module.exports = { catat };