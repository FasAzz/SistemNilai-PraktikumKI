const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'sistem-nilai.db'));

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nama TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('mahasiswa','dosen','admin')),
    npm TEXT UNIQUE            -- hanya terisi untuk mahasiswa
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    device_id TEXT NOT NULL,
    UNIQUE (user_id, device_id)
  );

  CREATE TABLE IF NOT EXISTS kelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode TEXT NOT NULL,
    nama TEXT NOT NULL,
    dosen_id INTEGER NOT NULL REFERENCES users(id),
    finalisasi INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS nilai (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kelas_id INTEGER NOT NULL REFERENCES kelas(id),
    mahasiswa_id INTEGER NOT NULL REFERENCES users(id),
    nilai REAL,
    final INTEGER NOT NULL DEFAULT 0,
    UNIQUE (kelas_id, mahasiswa_id)
  );

  CREATE TABLE IF NOT EXISTS transkrip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npm TEXT NOT NULL,
    kelas_id INTEGER NOT NULL REFERENCES kelas(id),
    nilai REAL NOT NULL,
    UNIQUE (npm, kelas_id)
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    waktu TEXT NOT NULL,
    subjek TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    device TEXT,
    hasil TEXT NOT NULL CHECK (hasil IN ('allow','deny')),
    alasan TEXT NOT NULL
  );
`);

module.exports = db;