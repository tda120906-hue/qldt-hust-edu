/* =========================================================
   CỔNG THÔNG TIN SINH VIÊN - PHẦN XỬ LÝ GIAO DIỆN
   Dữ liệu lấy từ server qua /api/data, admin sửa qua /api/admin/...
   ========================================================= */

let state = { data: null, role: null };

const TAB_NAMES = {
  hoctap: 'Học tập', doan: 'Đồ án', bieumau: 'Biểu mẫu', hocbong: 'Học bổng', hoctichhop: 'Học tích hợp',
  nckh: 'NCKH', traodoi: 'CT Trao đổi', hotro: 'Hỗ trợ', khaosat: 'Khảo sát'
};
const SUB_TAB_NAMES = { bangdiem: 'Bảng điểm cá nhân', tkb: 'Thời khóa biểu' };

// Thang điểm chữ của HUST: điểm học phần (hệ 10) → điểm chữ → điểm hệ 4
const GRADE_SCALE = [
  { min: 9.5, letter: 'A+', point: 4.0 },
  { min: 8.5, letter: 'A', point: 4.0 },
  { min: 8.0, letter: 'B+', point: 3.5 },
  { min: 7.0, letter: 'B', point: 3.0 },
  { min: 6.5, letter: 'C+', point: 2.5 },
  { min: 5.5, letter: 'C', point: 2.0 },
  { min: 5.0, letter: 'D+', point: 1.5 },
  { min: 4.0, letter: 'D', point: 1.0 },
  { min: 0, letter: 'F', point: 0 }
];
const LETTERS = GRADE_SCALE.map(g => g.letter);

// Cấu hình các mục admin được thêm / sửa / xoá
const COLLECTIONS = {
  timetable: {
    label: 'lớp học',
    fields: [
      { key: 'day', label: 'Thứ', type: 'select', options: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'] },
      { key: 'time', label: 'Thời gian', placeholder: '06:45 - 09:10' },
      { key: 'weeks', label: 'Tuần học', placeholder: '2-9,11-18' },
      { key: 'room', label: 'Phòng học', placeholder: 'D9-301' },
      { key: 'classId', label: 'Mã lớp', placeholder: '160123' },
      { key: 'code', label: 'Mã học phần', placeholder: 'CH3061' },
      { key: 'name', label: 'Tên học phần', required: true }
    ]
  },
  projects: {
    label: 'đồ án',
    fields: [
      { key: 'name', label: 'Tên đề tài', required: true },
      { key: 'type', label: 'Loại đồ án', type: 'select', options: ['Đồ án I', 'Đồ án II', 'Đồ án III', 'Đồ án tốt nghiệp', 'Thực tập kỹ thuật'] },
      { key: 'term', label: 'Học kỳ', placeholder: '20252' },
      { key: 'supervisor', label: 'Giảng viên hướng dẫn' },
      { key: 'status', label: 'Trạng thái', type: 'select', options: ['Đang thực hiện', 'Đã nộp', 'Đã bảo vệ'] },
      { key: 'score', label: 'Điểm', type: 'number' }
    ]
  },
  forms: {
    label: 'biểu mẫu',
    fields: [
      { key: 'title', label: 'Tên biểu mẫu', required: true },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
      { key: 'link', label: 'Đường dẫn tải về (không bắt buộc)', placeholder: 'https://...' }
    ]
  },
  scholarships: {
    label: 'học bổng',
    fields: [
      { key: 'name', label: 'Tên học bổng', required: true },
      { key: 'period', label: 'Thời gian đăng ký', placeholder: '01/11/2026 - 30/11/2026' },
      { key: 'quantity', label: 'Số lượng', type: 'number' }
    ]
  },
  surveys: {
    label: 'khảo sát',
    fields: [
      { key: 'title', label: 'Tên khảo sát', required: true },
      { key: 'period', label: 'Thời gian', placeholder: '01/11/2026 - 15/11/2026' },
      { key: 'status', label: 'Trạng thái', type: 'select', options: ['Đang mở', 'Đã đóng'] },
      { key: 'link', label: 'Đường dẫn khảo sát', placeholder: 'https://forms.gle/...' }
    ]
  }
};

/* ===================== TIỆN ÍCH ===================== */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.status === 401) {
    logout();
    throw new Error('Phiên đăng nhập đã hết hạn');
  }
  const data = await res.json();
  if (data.success === false) throw new Error(data.message);
  return data;
}

/* ===================== ĐĂNG NHẬP / ĐĂNG XUẤT ===================== */

window.addEventListener('DOMContentLoaded', () => {
  // Nhấn Enter để đăng nhập
  ['username', 'password', 'adfs-username', 'adfs-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLogin(id.startsWith('adfs') ? 'adfs' : 'normal');
    });
  });
  document.addEventListener('click', () => document.getElementById('profile-dropdown').classList.remove('open'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal('form-modal'); closeModal('profile-modal'); }
  });

  if (localStorage.getItem('token')) loadDashboard();
});

function toggleFlip(isFlipped) {
  document.getElementById('login-container-wrapper').classList.toggle('flipped', isFlipped);
}

async function handleLogin(type) {
  const prefix = type === 'normal' ? '' : 'adfs-';
  const u = document.getElementById(prefix + 'username').value.trim();
  const p = document.getElementById(prefix + 'password').value;
  const errBox = document.getElementById(type === 'normal' ? 'error-msg' : 'adfs-error-msg');
  errBox.innerText = '';

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  });
  const data = await res.json();
  if (!data.success) {
    errBox.innerText = data.message;
    return;
  }
  localStorage.setItem('token', data.token);
  loadDashboard();
}

async function loadDashboard() {
  try {
    state.data = await api('GET', '/api/data');
  } catch (e) {
    return;
  }
  state.role = state.data.role;
  document.getElementById('login-container-wrapper').classList.add('hidden');
  document.getElementById('dashboard-section').classList.remove('hidden');
  document.getElementById('body-root').className = 'dashboard-bg' + (state.role === 'admin' ? ' is-admin' : '');
  renderAll();
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('isLoggedIn');
  location.reload();
}

/* ===================== ĐIỀU HƯỚNG ===================== */

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.tab === tabName));
  document.getElementById('tab-' + tabName).classList.remove('hidden');
  if (tabName === 'hoctap') {
    switchSubTab(document.querySelector('.sub-tab.active').dataset.sub);
  } else {
    setBreadcrumb(TAB_NAMES[tabName]);
  }
}

function switchSubTab(sub) {
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.toggle('active', t.dataset.sub === sub));
  Object.keys(SUB_TAB_NAMES).forEach(key => document.getElementById('sub-' + key).classList.toggle('hidden', key !== sub));
  setBreadcrumb('Học tập', SUB_TAB_NAMES[sub]);
}

function setBreadcrumb(tab, page) {
  document.getElementById('tab-breadcrumb').innerHTML = page
    ? `Trang chủ / ${esc(tab)} / <span>${esc(page)}</span>`
    : `Trang chủ / <span>${esc(tab)}</span>`;
}

function toggleProfileMenu(event) {
  event.stopPropagation();
  document.getElementById('profile-dropdown').classList.toggle('open');
}

/* ===================== TÍNH ĐIỂM ===================== */

// Điểm học phần = QT × (1 − trọng số CK) + CK × trọng số CK, làm tròn 1 chữ số
function courseResult(course) {
  const qt = course.scores.find(s => s.label === 'QT');
  const ck = course.scores.find(s => s.label === 'CK');
  let total = null;
  if (ck && qt) {
    const w = course.ckWeight ?? 0.7;
    // cộng thêm 1e-9 để 6.45 làm tròn thành 6.5 thay vì 6.4 do sai số số thực
    total = Math.round((qt.value * (1 - w) + ck.value * w) * 10 + 1e-9) / 10;
  } else if (ck) {
    total = ck.value;
  }

  let grade = null;
  if (course.letter) grade = GRADE_SCALE.find(g => g.letter === course.letter);
  else if (total !== null) grade = GRADE_SCALE.find(g => total >= g.min);
  return { total, letter: grade?.letter || '', point: grade ? grade.point : null };
}

// Học phần 0 tín chỉ (GDTC, GDQP) là học phần điều kiện, không tính vào GPA/CPA
function average(items) {
  const counted = items.filter(i => i.credits > 0 && i.result.point !== null);
  const credits = counted.reduce((sum, i) => sum + i.credits, 0);
  if (!credits) return null;
  return counted.reduce((sum, i) => sum + i.result.point * i.credits, 0) / credits;
}

function termStats(term) {
  const items = term.courses.map(c => ({ ...c, result: courseResult(c) }));
  return {
    registered: items.reduce((sum, i) => sum + i.credits, 0),
    passed: items.filter(i => i.result.point > 0).reduce((sum, i) => sum + i.credits, 0),
    gpa: average(items)
  };
}

// CPA: mỗi học phần chỉ lấy lần học có điểm cao nhất (học lại / học cải thiện)
function overallStats() {
  const best = {};
  state.data.terms.forEach(term => term.courses.forEach(c => {
    const item = { ...c, result: courseResult(c) };
    const prev = best[c.code];
    if (!prev || (item.result.point ?? -1) > (prev.result.point ?? -1)) best[c.code] = item;
  }));
  const items = Object.values(best);
  return {
    cpa: average(items),
    accumulated: items.filter(i => i.result.point > 0).reduce((sum, i) => sum + i.credits, 0)
  };
}

function fmt(num) {
  return num === null || num === undefined ? '-' : num.toFixed(2);
}

/* ===================== HIỂN THỊ ===================== */

function renderAll() {
  renderProfile();
  renderGrades();
  renderCollection('timetable');
  renderCollection('projects');
  renderCollection('forms');
  renderCollection('scholarships');
  renderCollection('surveys');
}

function renderProfile() {
  const p = state.data.profile;
  document.getElementById('student-title').textContent = `${p.name} - ${p.studentId}`;
  const rows = [
    ['Mã sinh viên', p.studentId], ['Họ và tên', p.name], ['Ngày sinh', p.dob], ['Giới tính', p.gender],
    ['Lớp học', p.className], ['Ngành học', p.major], ['Khóa học', p.course], ['Trạng thái sinh viên', p.status],
    ['Trường / Viện quản lý', p.school], ['Mức cảnh báo học tập', p.warningLevel]
  ];
  document.getElementById('profile-info-grid').innerHTML = rows.map(([label, value]) => `
    <div class="info-item">
      <label>${esc(label)}</label>
      <span${label === 'Trạng thái sinh viên' ? ' style="color: #2e7d32;"' : ''}>${esc(value)}</span>
    </div>`).join('');
}

function renderGrades() {
  const { terms, profile } = state.data;
  const overall = overallStats();
  const latest = terms[0] ? termStats(terms[0]) : { gpa: null };
  const gpa = profile.gpaOverride || fmt(latest.gpa);
  const cpa = profile.cpaOverride || fmt(overall.cpa);

  document.getElementById('stats-bar').innerHTML = `
    <div class="stat-box">GPA hệ 4: <b style="color: #d32f2f;">${esc(gpa)}</b></div>
    <div class="stat-box">CPA hệ 4: <b style="color: #d32f2f;">${esc(cpa)}</b></div>
    <div class="stat-box">TC tích lũy: <b>${overall.accumulated}</b></div>
    <div class="stat-box">Mức cảnh báo: <b>${esc(profile.warningLevel || '-')}</b></div>
    ${profile.gpaOverride || profile.cpaOverride ? `<div class="stat-box admin-only" style="color:#999;">GPA/CPA đang nhập tay. Tự tính: ${fmt(latest.gpa)} / ${fmt(overall.cpa)}</div>` : ''}`;

  if (!terms.length) {
    document.getElementById('terms-container').innerHTML = '<div class="empty-state">Chưa có dữ liệu bảng điểm</div>';
    return;
  }

  let index = 0;
  document.getElementById('terms-container').innerHTML = terms.map(term => {
    const stats = termStats(term);
    const rows = term.courses.map(c => {
      const r = courseResult(c);
      index += 1;
      const scoreText = c.scores.map(s => `• ${esc(s.label)}: ${esc(s.value)}${s.note ? ` (${esc(s.note)})` : ''}`).join('<br>');
      return `<tr>
        <td>${index}</td>
        <td><span class="interactive-text" onclick="showCourse('${term.id}','${c.id}')">${esc(c.code)}</span></td>
        <td><span class="interactive-text" onclick="showCourse('${term.id}','${c.id}')">${esc(c.name)}</span></td>
        <td style="text-align:center;">${c.credits}</td>
        <td class="detail-red">${scoreText}</td>
        <td style="text-align:center;">${r.total ?? '-'}</td>
        <td class="grade-letter ${r.point > 0 ? 'grade-pass' : 'grade-fail'}">${r.letter || '-'}</td>
        <td class="admin-only"><div class="admin-actions">
          <button class="btn-mini" onclick="editCourse('${term.id}','${c.id}')">Sửa</button>
          <button class="btn-mini danger" onclick="deleteCourse('${term.id}','${c.id}')">Xoá</button>
        </div></td>
      </tr>`;
    }).join('');

    return `<div class="table-card-wrapper" id="term-${term.id}">
      <div class="term-title" onclick="toggleTerm('${term.id}')">
        <span>${esc(term.name)}</span>
        <span class="term-meta">TC: ${stats.passed}/${stats.registered} · GPA kỳ: ${fmt(stats.gpa)}</span>
        <span class="term-arrow">▲</span>
      </div>
      <div class="admin-actions admin-only" style="padding: 10px 18px; border-bottom: 1px solid #e0e0e0;">
        <button class="btn-mini" onclick="addCourse('${term.id}')">+ Thêm môn</button>
        <button class="btn-mini" onclick="editTerm('${term.id}')">Đổi tên kỳ</button>
        <button class="btn-mini" onclick="moveTerm('${term.id}', -1)">↑ Lên</button>
        <button class="btn-mini" onclick="moveTerm('${term.id}', 1)">↓ Xuống</button>
        <button class="btn-mini danger" onclick="deleteTerm('${term.id}')">Xoá kỳ</button>
      </div>
      <div class="table-scroll">
        <table class="custom-table">
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th style="width: 110px;">MÃ HỌC PHẦN</th>
              <th style="width: 230px;">TÊN HỌC PHẦN</th>
              <th style="width: 70px; text-align: center;">SỐ TC</th>
              <th>ĐIỂM THÀNH PHẦN</th>
              <th style="width: 80px; text-align: center;">ĐIỂM HP</th>
              <th style="width: 80px; text-align: center;">ĐIỂM CHỮ</th>
              <th class="admin-only" style="width: 110px;">THAO TÁC</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8" style="text-align:center; color:#888;">Chưa có học phần</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

function toggleTerm(termId) {
  const card = document.getElementById('term-' + termId);
  card.classList.toggle('collapsed');
  card.querySelector('.term-arrow').textContent = card.classList.contains('collapsed') ? '▼' : '▲';
}

function adminButtons(name, id) {
  return `<div class="admin-actions admin-only">
    <button class="btn-mini" onclick="event.stopPropagation(); editItem('${name}','${id}')">Sửa</button>
    <button class="btn-mini danger" onclick="event.stopPropagation(); deleteItem('${name}','${id}')">Xoá</button>
  </div>`;
}

function table(headers, rows) {
  return `<div class="table-card-wrapper"><div class="table-scroll"><table class="custom-table">
    <thead><tr>${headers.map(h => `<th${h.admin ? ' class="admin-only"' : ''}>${h.label || h}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table></div></div>`;
}

const EMPTY_TEXT = {
  timetable: 'Chưa có lịch học trong học kỳ này',
  projects: '📑 Không có dữ liệu đồ án trong học kỳ này',
  forms: 'Chưa có biểu mẫu nào',
  scholarships: 'Hiện không có học bổng nào',
  surveys: 'Không có đợt khảo sát mới.'
};

function renderCollection(name) {
  const items = state.data[name];
  const container = document.getElementById(name + '-container');

  if (name === 'scholarships') {
    document.getElementById('scholarship-count').textContent = items.length ? `(${items.length})` : '';
  }
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${EMPTY_TEXT[name]}</div>`;
    return;
  }

  const ADMIN_COL = { label: 'THAO TÁC', admin: true };
  if (name === 'timetable') {
    const order = COLLECTIONS.timetable.fields[0].options;
    const sorted = [...items].sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day) || String(a.time).localeCompare(String(b.time)));
    container.innerHTML = table(['THỨ', 'THỜI GIAN', 'TUẦN HỌC', 'PHÒNG', 'MÃ LỚP', 'MÃ HP', 'TÊN HỌC PHẦN', ADMIN_COL],
      sorted.map(t => `<tr><td><b>${esc(t.day)}</b></td><td>${esc(t.time)}</td><td>${esc(t.weeks)}</td><td>${esc(t.room)}</td>
        <td>${esc(t.classId)}</td><td><span class="interactive-text">${esc(t.code)}</span></td><td>${esc(t.name)}</td>
        <td class="admin-only">${adminButtons(name, t.id)}</td></tr>`));
  } else if (name === 'projects') {
    container.innerHTML = table(['STT', 'TÊN ĐỀ TÀI', 'LOẠI', 'HỌC KỲ', 'GV HƯỚNG DẪN', 'TRẠNG THÁI', 'ĐIỂM', ADMIN_COL],
      items.map((p, i) => `<tr><td>${i + 1}</td><td><span class="interactive-text">${esc(p.name)}</span></td><td>${esc(p.type)}</td>
        <td>${esc(p.term)}</td><td>${esc(p.supervisor)}</td><td><span class="badge">${esc(p.status)}</span></td>
        <td style="text-align:center;">${esc(p.score ?? '-')}</td><td class="admin-only">${adminButtons(name, p.id)}</td></tr>`));
  } else if (name === 'forms') {
    container.innerHTML = `<div class="card-grid">${items.map(f => `
      <div class="form-card" onclick="requestForm('${f.id}')">
        <h4>${esc(f.title)}</h4><p>${esc(f.description)}</p>${adminButtons(name, f.id)}
      </div>`).join('')}</div>`;
  } else if (name === 'scholarships') {
    container.innerHTML = table(['STT', 'HỌC BỔNG', 'THỜI GIAN ĐĂNG KÝ', 'SL', 'HÀNH ĐỘNG', ADMIN_COL],
      items.map((s, i) => `<tr><td>${i + 1}</td><td><span class="interactive-text">${esc(s.name)}</span></td><td>${esc(s.period)}</td>
        <td>${esc(s.quantity)}</td>
        <td><button class="${s.registered ? 'btn-outline' : 'btn-red'}" onclick="toggleScholarship('${s.id}')">${s.registered ? 'Huỷ đăng ký' : 'Đăng ký'}</button></td>
        <td class="admin-only">${adminButtons(name, s.id)}</td></tr>`));
  } else if (name === 'surveys') {
    container.innerHTML = table(['STT', 'TÊN KHẢO SÁT', 'THỜI GIAN', 'TRẠNG THÁI', 'HÀNH ĐỘNG', ADMIN_COL],
      items.map((s, i) => {
        const open = s.status !== 'Đã đóng';
        return `<tr><td>${i + 1}</td><td><span class="interactive-text">${esc(s.title)}</span></td><td>${esc(s.period)}</td>
          <td><span class="badge${open ? '' : ' closed'}">${esc(s.status || 'Đang mở')}</span></td>
          <td>${open ? `<button class="btn-red" onclick="openSurvey('${s.id}')">Làm khảo sát</button>` : '-'}</td>
          <td class="admin-only">${adminButtons(name, s.id)}</td></tr>`;
      }));
  }
}

/* ===================== HÀNH ĐỘNG CỦA SINH VIÊN ===================== */

function showCourse(termId, courseId) {
  const term = state.data.terms.find(t => t.id === termId);
  const c = term.courses.find(x => x.id === courseId);
  const r = courseResult(c);
  const rows = [
    ['Mã học phần', c.code], ['Tên học phần', c.name], ['Học kỳ', term.name], ['Số tín chỉ', c.credits],
    ['Trọng số cuối kỳ', c.scores.some(s => s.label === 'QT') ? (c.ckWeight ?? 0.7) : '-'],
    ...c.scores.map(s => [`Điểm ${s.label}`, `${s.value}${s.note ? ` (${s.note})` : ''}`]),
    ['Điểm học phần', r.total ?? '-'], ['Điểm chữ', r.letter || '-'], ['Điểm hệ 4', r.point ?? '-'],
    ['Ghi chú', c.credits === 0 ? 'Học phần điều kiện, không tính vào GPA/CPA' : '']
  ];
  openModal('Chi tiết học phần', `<table class="detail-table">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>`,
    [{ label: 'Đóng', action: () => closeModal('form-modal') }]);
}

async function toggleScholarship(id) {
  try {
    const res = await api('POST', `/api/scholarships/${id}/register`);
    state.data.scholarships.find(s => s.id === id).registered = res.registered;
    renderCollection('scholarships');
    toast(res.registered ? 'Đăng ký thành công' : 'Đã huỷ đăng ký');
  } catch (e) {
    toast(e.message);
  }
}

function requestForm(id) {
  const form = state.data.forms.find(f => f.id === id);
  if (form.link) window.open(form.link, '_blank');
  else toast(`Đã gửi yêu cầu "${form.title}". Vui lòng chờ phòng Đào tạo xử lý.`);
}

function openSurvey(id) {
  const survey = state.data.surveys.find(s => s.id === id);
  if (survey.link) window.open(survey.link, '_blank');
  else toast('Khảo sát chưa có đường dẫn');
}

function openProfileModal() {
  document.getElementById('profile-modal').classList.remove('hidden');
}

function openChangePassword() {
  showForm('Đổi mật khẩu', [
    { key: 'oldPassword', label: 'Mật khẩu hiện tại', type: 'password' },
    { key: 'newPassword', label: 'Mật khẩu mới', type: 'password' },
    { key: 'confirm', label: 'Nhập lại mật khẩu mới', type: 'password' }
  ], {}, async values => {
    if (values.newPassword !== values.confirm) throw new Error('Mật khẩu nhập lại không khớp');
    await api('POST', '/api/change-password', values);
    toast('Đổi mật khẩu thành công');
  });
}

/* ===================== HỘP THOẠI DÙNG CHUNG ===================== */

function openModal(title, bodyHtml, buttons) {
  document.getElementById('form-modal-title').textContent = title;
  document.getElementById('form-modal-body').innerHTML = bodyHtml;
  const footer = document.getElementById('form-modal-footer');
  footer.innerHTML = '';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = b.primary ? 'btn-red' : 'btn-outline';
    btn.textContent = b.label;
    btn.onclick = b.action;
    footer.appendChild(btn);
  });
  document.getElementById('form-modal').classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Hiện form nhập liệu; onSave nhận object giá trị, ném lỗi để hiện thông báo
function showForm(title, fields, values, onSave) {
  const html = fields.map(f => {
    const v = values[f.key] ?? '';
    let input;
    if (f.type === 'select') {
      input = `<select id="f-${f.key}">${f.options.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o || '(tự tính)')}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="f-${f.key}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
    } else {
      input = `<input id="f-${f.key}" type="${f.type || 'text'}" step="any" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}">`;
    }
    return `<div class="form-group"><label>${esc(f.label)}${f.required ? ' *' : ''}</label>${input}${f.hint ? `<div class="form-hint">${esc(f.hint)}</div>` : ''}</div>`;
  }).join('') + '<div id="form-error" class="error-msg"></div>';

  openModal(title, html, [
    { label: 'Huỷ', action: () => closeModal('form-modal') },
    {
      label: 'Lưu', primary: true, action: async () => {
        const result = {};
        for (const f of fields) {
          const raw = document.getElementById('f-' + f.key).value;
          if (f.required && !raw.trim()) {
            document.getElementById('form-error').textContent = `Vui lòng nhập "${f.label}"`;
            return;
          }
          result[f.key] = f.type === 'number' ? (raw === '' ? null : Number(raw)) : raw.trim();
        }
        try {
          await onSave(result);
          closeModal('form-modal');
        } catch (e) {
          document.getElementById('form-error').textContent = e.message;
        }
      }
    }
  ]);
  const first = document.querySelector('#form-modal-body input, #form-modal-body select, #form-modal-body textarea');
  if (first) first.focus();
}

/* ===================== QUẢN TRỊ: CÁC MỤC CHUNG ===================== */

async function saveCollection(name) {
  await api('PUT', `/api/admin/${name}`, state.data[name]);
  if (name === 'terms') renderGrades();
  else renderCollection(name);
}

function addItem(name) {
  const cfg = COLLECTIONS[name];
  showForm(`Thêm ${cfg.label}`, cfg.fields, {}, async values => {
    state.data[name].push({ id: newId(name[0]), ...values });
    await saveCollection(name);
    toast(`Đã thêm ${cfg.label}`);
  });
}

function editItem(name, id) {
  const cfg = COLLECTIONS[name];
  const item = state.data[name].find(x => x.id === id);
  showForm(`Sửa ${cfg.label}`, cfg.fields, item, async values => {
    Object.assign(item, values);
    await saveCollection(name);
    toast('Đã lưu thay đổi');
  });
}

async function deleteItem(name, id) {
  if (!confirm(`Xoá ${COLLECTIONS[name].label} này?`)) return;
  state.data[name] = state.data[name].filter(x => x.id !== id);
  try {
    await saveCollection(name);
    toast('Đã xoá');
  } catch (e) {
    toast(e.message);
  }
}

/* ===================== QUẢN TRỊ: BẢNG ĐIỂM ===================== */

const TERM_FIELDS = [{ key: 'name', label: 'Tên học kỳ', required: true, placeholder: 'Học kỳ 1 - Năm học 2026-2027' }];

const COURSE_FIELDS = [
  { key: 'code', label: 'Mã học phần', required: true, placeholder: 'CH3061' },
  { key: 'name', label: 'Tên học phần', required: true, placeholder: 'Hóa lý II' },
  { key: 'credits', label: 'Số tín chỉ', type: 'number', hint: 'Nhập 0 cho học phần điều kiện (GDTC, GDQP)' },
  { key: 'ckWeight', label: 'Trọng số điểm cuối kỳ', type: 'number', hint: 'Ví dụ 0.7 nghĩa là QT 30%, CK 70%' },
  { key: 'letter', label: 'Điểm chữ (để trống để tự tính)', type: 'select', options: ['', ...LETTERS] },
  {
    key: 'scores', label: 'Điểm thành phần (mỗi dòng một điểm)', type: 'textarea',
    placeholder: 'QT: 7 (Đã gửi Ban ĐT)\nCK: 6.5 (Đã gửi Ban ĐT)\nTN/TH: 8',
    hint: 'Dạng "Tên: điểm (ghi chú)". Ghi chú trong ngoặc có thể bỏ trống.'
  }
];

function scoresToText(scores) {
  return scores.map(s => `${s.label}: ${s.value}${s.note ? ` (${s.note})` : ''}`).join('\n');
}

function textToScores(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const m = line.match(/^•?\s*([^:]+):\s*([\d.,]+)\s*(?:\((.*)\))?$/);
    if (!m) throw new Error(`Không đọc được dòng điểm: "${line}"`);
    const value = Number(m[2].replace(',', '.'));
    if (value < 0 || value > 10) throw new Error(`Điểm phải từ 0 đến 10: "${line}"`);
    return { label: m[1].trim().toUpperCase(), value, note: (m[3] || '').trim() };
  });
}

function findTerm(termId) {
  return state.data.terms.find(t => t.id === termId);
}

function addTerm() {
  showForm('Thêm học kỳ', TERM_FIELDS, {}, async values => {
    // Học kỳ mới nhất đứng đầu, giống web thật
    state.data.terms.unshift({ id: newId('t'), name: values.name, courses: [] });
    await saveCollection('terms');
    toast('Đã thêm học kỳ');
  });
}

function editTerm(termId) {
  const term = findTerm(termId);
  showForm('Đổi tên học kỳ', TERM_FIELDS, term, async values => {
    term.name = values.name;
    await saveCollection('terms');
  });
}

async function moveTerm(termId, step) {
  const terms = state.data.terms;
  const i = terms.findIndex(t => t.id === termId);
  const j = i + step;
  if (j < 0 || j >= terms.length) return;
  [terms[i], terms[j]] = [terms[j], terms[i]];
  await saveCollection('terms');
}

async function deleteTerm(termId) {
  const term = findTerm(termId);
  if (!confirm(`Xoá "${term.name}" và toàn bộ ${term.courses.length} học phần trong kỳ?`)) return;
  state.data.terms = state.data.terms.filter(t => t.id !== termId);
  await saveCollection('terms');
  toast('Đã xoá học kỳ');
}

function courseForm(title, term, course) {
  const values = course
    ? { ...course, scores: scoresToText(course.scores) }
    : { credits: 3, ckWeight: 0.7, letter: '', scores: 'QT: \nCK: ' };
  showForm(title, COURSE_FIELDS, values, async v => {
    const data = {
      code: v.code.toUpperCase(), name: v.name, credits: v.credits ?? 0,
      ckWeight: v.ckWeight ?? 0.7, letter: v.letter, scores: textToScores(v.scores)
    };
    if (data.ckWeight < 0 || data.ckWeight > 1) throw new Error('Trọng số cuối kỳ phải từ 0 đến 1');
    if (course) Object.assign(course, data);
    else term.courses.push({ id: newId('c'), ...data });
    await saveCollection('terms');
    toast(course ? 'Đã lưu học phần' : 'Đã thêm học phần');
  });
}

function addCourse(termId) {
  courseForm('Thêm học phần', findTerm(termId), null);
}

function editCourse(termId, courseId) {
  const term = findTerm(termId);
  courseForm('Sửa học phần', term, term.courses.find(c => c.id === courseId));
}

async function deleteCourse(termId, courseId) {
  const term = findTerm(termId);
  const course = term.courses.find(c => c.id === courseId);
  if (!confirm(`Xoá học phần ${course.code} - ${course.name}?`)) return;
  term.courses = term.courses.filter(c => c.id !== courseId);
  await saveCollection('terms');
  toast('Đã xoá học phần');
}

/* ===================== QUẢN TRỊ: THÔNG TIN SV, SAO LƯU ===================== */

function editProfile() {
  const fields = [
    { key: 'studentId', label: 'Mã sinh viên' }, { key: 'name', label: 'Họ và tên' },
    { key: 'dob', label: 'Ngày sinh' }, { key: 'gender', label: 'Giới tính', type: 'select', options: ['Nam', 'Nữ'] },
    { key: 'className', label: 'Lớp học' }, { key: 'major', label: 'Ngành học' }, { key: 'course', label: 'Khóa học' },
    { key: 'status', label: 'Trạng thái sinh viên' }, { key: 'school', label: 'Trường / Viện quản lý' },
    { key: 'warningLevel', label: 'Mức cảnh báo học tập' },
    { key: 'gpaOverride', label: 'GPA hiển thị (để trống để tự tính)' },
    { key: 'cpaOverride', label: 'CPA hiển thị (để trống để tự tính)' }
  ];
  showForm('Sửa thông tin sinh viên', fields, state.data.profile, async values => {
    await api('PUT', '/api/admin/profile', values);
    state.data.profile = { ...state.data.profile, ...values };
    renderProfile();
    renderGrades();
    toast('Đã lưu thông tin sinh viên');
  });
}

async function downloadBackup() {
  const res = await fetch('/api/admin/backup', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `qldt-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function restoreBackup(input) {
  const file = input.files[0];
  input.value = '';
  if (!file || !confirm('Khôi phục sẽ thay toàn bộ dữ liệu hiện tại bằng dữ liệu trong file. Tiếp tục?')) return;
  try {
    await api('POST', '/api/admin/restore', JSON.parse(await file.text()));
    toast('Đã khôi phục dữ liệu');
    loadDashboard();
  } catch (e) {
    toast('Khôi phục thất bại: ' + e.message);
  }
}
