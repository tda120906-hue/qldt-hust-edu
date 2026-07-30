const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Kiểm tra thông tin đăng nhập chuẩn
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'anh.td2410807@sis.hust.edu.vn' && password === '12092006da') {
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
});

app.listen(3000, () => {
  console.log('Server đang chạy tại: http://localhost:3000');
});