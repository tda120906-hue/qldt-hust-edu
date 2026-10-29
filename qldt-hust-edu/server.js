const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const app = express();

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const SECRET = process.env.SESSION_SECRET || 'qldt-demo-secret';
// Có MONGODB_URI thì lưu vào MongoDB (không mất khi Render khởi động lại), không có thì lưu file JSON
const MONGODB_URI = process.env.MONGODB_URI;

// Các mục admin được phép thêm / sửa / xoá
const COLLECTIONS = ['terms', 'timetable', 'projects', 'forms', 'scholarships', 'surveys'];

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== ĐỌC / GHI DỮ LIỆU =====
// Toàn bộ dữ liệu là một object; với MongoDB nó nằm trong một document có _id = 'main'
let mongoStore = null;

function readSeed() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

async function connectMongo() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  mongoStore = client.db('qldt').collection('store');
  // Lần chạy đầu tiên: chép dữ liệu mẫu từ data/db.json vào MongoDB
  if (!(await mongoStore.findOne({ _id: 'main' }))) {
    await mongoStore.insertOne({ _id: 'main', data: readSeed() });
    console.log('Đã tạo dữ liệu ban đầu trong MongoDB từ data/db.json');
  }
}

async function loadDb() {
  if (!mongoStore) return readSeed();
  return (await mongoStore.findOne({ _id: 'main' })).data;
}

async function saveDb(db) {
  if (!mongoStore) return fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  await mongoStore.replaceOne({ _id: 'main' }, { _id: 'main', data: db });
}

// Express 4 không tự bắt lỗi của hàm async, bọc lại để lỗi trả về JSON
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

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
app.post('/api/login', wrap(async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const user = (await loadDb()).users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  if (!user) return res.json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu' });
  res.json({ success: true, role: user.role, token: sign({ username: user.username, role: user.role }) });
}));

app.post('/api/change-password', requireLogin, wrap(async (req, res) => {
  const { oldPassword = '', newPassword = '' } = req.body;
  const db = await loadDb();
  const user = db.users.find(u => u.username === req.user.username);

  if (!user || user.password !== oldPassword) return res.json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
  if (user.role !== 'admin' && newPassword.length < 6) return res.json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  user.password = newPassword;
  await saveDb(db);
  res.json({ success: true });
}));

// ===== DỮ LIỆU CHO DASHBOARD =====
app.get('/api/data', requireLogin, wrap(async (req, res) => {
  const { users, ...data } = await loadDb();
  res.json({ ...data, role: req.user.role, username: req.user.username });
}));

// Sinh viên bấm Đăng ký / Huỷ đăng ký học bổng
app.post('/api/scholarships/:id/register', requireLogin, wrap(async (req, res) => {
  const db = await loadDb();
  const item = db.scholarships.find(s => s.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy học bổng' });
  item.registered = !item.registered;
  await saveDb(db);
  res.json({ success: true, registered: item.registered });
}));

// ===== QUẢN TRỊ =====
app.put('/api/admin/profile', requireAdmin, wrap(async (req, res) => {
  const db = await loadDb();
  db.profile = { ...db.profile, ...req.body };
  await saveDb(db);
  res.json({ success: true });
}));

app.put('/api/admin/:collection', requireAdmin, wrap(async (req, res) => {
  const { collection } = req.params;
  if (!COLLECTIONS.includes(collection)) return res.status(404).json({ success: false, message: 'Mục không tồn tại' });
  if (!Array.isArray(req.body)) return res.status(400).json({ success: false, message: 'Dữ liệu phải là danh sách' });
  const db = await loadDb();
  db[collection] = req.body;
  await saveDb(db);
  res.json({ success: true });
}));

// Sao lưu và khôi phục toàn bộ dữ liệu
app.get('/api/admin/backup', requireAdmin, wrap(async (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="qldt-backup.json"');
  res.json(await loadDb());
}));

app.post('/api/admin/restore', requireAdmin, wrap(async (req, res) => {
  const db = req.body;
  if (!db || !Array.isArray(db.users) || !db.profile || !COLLECTIONS.every(c => Array.isArray(db[c]))) {
    return res.status(400).json({ success: false, message: 'File sao lưu không hợp lệ' });
  }
  await saveDb(db);
  res.json({ success: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Lỗi máy chủ, vui lòng thử lại' });
});

async function start() {
  if (MONGODB_URI) {
    await connectMongo();
    console.log('Đang lưu dữ liệu vào MongoDB');
  } else {
    console.log('Chưa có MONGODB_URI, đang lưu dữ liệu vào data/db.json');
  }
  app.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Không khởi động được server:', err);
  process.exit(1);
});
