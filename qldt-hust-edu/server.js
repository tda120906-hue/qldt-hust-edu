const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const SECRET = process.env.SESSION_SECRET || 'qldt-demo-secret';

// Các mục admin được phép thêm / sửa / xoá
const COLLECTIONS = ['terms', 'timetable', 'projects', 'forms', 'scholarships', 'surveys'];

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== ĐỌC / GHI DỮ LIỆU =====
function loadDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===== PHIÊN ĐĂNG NHẬP (token ký bằng HMAC, không mất khi server khởi động lại) =====
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString());
}

function requireLogin(req, res, next) {
  const user = verify((req.headers.authorization || '').replace('Bearer ', ''));
  if (!user) return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireLogin(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Bạn không có quyền quản trị' });
    next();
  });
}

// ===== ĐĂNG NHẬP =====
app.post('/api/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const user = loadDb().users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  if (!user) return res.json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu' });
  res.json({ success: true, role: user.role, token: sign({ username: user.username, role: user.role }) });
});

app.post('/api/change-password', requireLogin, (req, res) => {
  const { oldPassword = '', newPassword = '' } = req.body;
  const db = loadDb();
  const user = db.users.find(u => u.username === req.user.username);

  if (!user || user.password !== oldPassword) return res.json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
  if (user.role !== 'admin' && newPassword.length < 6) return res.json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  user.password = newPassword;
  saveDb(db);
  res.json({ success: true });
});

// ===== DỮ LIỆU CHO DASHBOARD =====
app.get('/api/data', requireLogin, (req, res) => {
  const { users, ...data } = loadDb();
  res.json({ ...data, role: req.user.role, username: req.user.username });
});

// Sinh viên bấm Đăng ký / Huỷ đăng ký học bổng
app.post('/api/scholarships/:id/register', requireLogin, (req, res) => {
  const db = loadDb();
  const item = db.scholarships.find(s => s.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy học bổng' });
  item.registered = !item.registered;
  saveDb(db);
  res.json({ success: true, registered: item.registered });
});

// ===== QUẢN TRỊ =====
app.put('/api/admin/profile', requireAdmin, (req, res) => {
  const db = loadDb();
  db.profile = { ...db.profile, ...req.body };
  saveDb(db);
  res.json({ success: true });
});

app.put('/api/admin/:collection', requireAdmin, (req, res) => {
  const { collection } = req.params;
  if (!COLLECTIONS.includes(collection)) return res.status(404).json({ success: false, message: 'Mục không tồn tại' });
  if (!Array.isArray(req.body)) return res.status(400).json({ success: false, message: 'Dữ liệu phải là danh sách' });
  const db = loadDb();
  db[collection] = req.body;
  saveDb(db);
  res.json({ success: true });
});

// Sao lưu và khôi phục toàn bộ dữ liệu
app.get('/api/admin/backup', requireAdmin, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="qldt-backup.json"');
  res.json(loadDb());
});

app.post('/api/admin/restore', requireAdmin, (req, res) => {
  const db = req.body;
  if (!db || !Array.isArray(db.users) || !db.profile || !COLLECTIONS.every(c => Array.isArray(db[c]))) {
    return res.status(400).json({ success: false, message: 'File sao lưu không hợp lệ' });
  }
  saveDb(db);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});
