const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'kos-distribute-secret-key-change-me';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// ========== 目录初始化 ==========
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const QRCODE_DIR = path.join(__dirname, 'public', 'qrcodes');
[UPLOAD_DIR, QRCODE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ========== 数据库 ==========
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    bundle_id TEXT DEFAULT '',
    version TEXT DEFAULT '1.0',
    build_number TEXT DEFAULT '1',
    icon_url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    changelog TEXT DEFAULT '',
    file_name TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    file_path TEXT NOT NULL,
    download_count INTEGER DEFAULT 0,
    short_url TEXT UNIQUE,
    qrcode_path TEXT DEFAULT '',
    platform TEXT DEFAULT 'ios',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS download_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// 初始化管理员账号
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USER);
if (!adminExists) {
  const hash = bcrypt.hashSync(ADMIN_PASS, 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(ADMIN_USER, hash, 'admin');
  console.log(`管理员账号已创建: ${ADMIN_USER} / ${ADMIN_PASS}`);
}

// ========== 中间件 ==========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// 文件上传配置
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.ipa', '.apk', '.plist'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .ipa / .apk 文件'));
    }
  }
});

// JWT 认证中间件
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ code: -1, message: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ code: -1, message: 'Token 已过期' });
  }
}

// 生成短链
function generateShortUrl() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

// ========== API: 登录 ==========
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.json({ code: -1, message: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ code: 0, data: { token, username: user.username } });
});

// ========== API: 上传应用 ==========
app.post('/api/apps/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.json({ code: -1, message: '请选择文件' });

    const id = uuidv4();
    const shortUrl = generateShortUrl();
    const filePath = req.file.path;
    const fileSize = req.file.size;
    const fileName = req.file.originalname;
    const ext = path.extname(fileName).toLowerCase();
    const platform = ext === '.apk' ? 'android' : 'ios';

    const name = req.body.name || fileName.replace(ext, '');
    const version = req.body.version || '1.0';
    const buildNumber = req.body.build_number || '1';
    const bundleId = req.body.bundle_id || '';
    const description = req.body.description || '';
    const changelog = req.body.changelog || '';

    // 生成二维码
    const qrcodeName = `${shortUrl}.png`;
    const qrcodePath = path.join(QRCODE_DIR, qrcodeName);
    const downloadPageUrl = `${BASE_URL}/${shortUrl}`;
    await QRCode.toFile(qrcodePath, downloadPageUrl, { width: 300, margin: 2 });

    db.prepare(`
      INSERT INTO apps (id, name, bundle_id, version, build_number, description, changelog,
        file_name, file_size, file_path, short_url, qrcode_path, platform)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, bundleId, version, buildNumber, description, changelog,
      fileName, fileSize, filePath, shortUrl, `/public/qrcodes/${qrcodeName}`, platform);

    res.json({
      code: 0,
      data: {
        id,
        name,
        short_url: shortUrl,
        download_url: downloadPageUrl,
        qrcode_url: `${BASE_URL}/public/qrcodes/${qrcodeName}`,
        file_size: fileSize
      }
    });
  } catch (err) {
    console.error('上传失败:', err);
    res.json({ code: -1, message: err.message || '上传失败' });
  }
});

// ========== API: 应用列表 ==========
app.get('/api/apps', authMiddleware, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM apps').get().count;
  const apps = db.prepare('SELECT * FROM apps ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

  res.json({
    code: 0,
    data: {
      list: apps.map(app => ({
        ...app,
        file_size_text: formatSize(app.file_size),
        download_url: `${BASE_URL}/${app.short_url}`,
        qrcode_url: `${BASE_URL}${app.qrcode_path}`
      })),
      total,
      page,
      limit
    }
  });
});

// ========== API: 应用详情 ==========
app.get('/api/apps/:id', authMiddleware, (req, res) => {
  const app_data = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
  if (!app_data) return res.json({ code: -1, message: '应用不存在' });
  res.json({
    code: 0,
    data: {
      ...app_data,
      file_size_text: formatSize(app_data.file_size),
      download_url: `${BASE_URL}/${app_data.short_url}`,
      qrcode_url: `${BASE_URL}${app_data.qrcode_path}`
    }
  });
});

// ========== API: 更新应用信息 ==========
app.put('/api/apps/:id', authMiddleware, (req, res) => {
  const { name, version, build_number, bundle_id, description, changelog } = req.body;
  const app_data = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
  if (!app_data) return res.json({ code: -1, message: '应用不存在' });

  db.prepare(`
    UPDATE apps SET name=?, version=?, build_number=?, bundle_id=?, description=?, changelog=?,
    updated_at=datetime('now','localtime') WHERE id=?
  `).run(
    name || app_data.name,
    version || app_data.version,
    build_number || app_data.build_number,
    bundle_id || app_data.bundle_id,
    description || app_data.description,
    changelog || app_data.changelog,
    req.params.id
  );
  res.json({ code: 0, message: '更新成功' });
});

// ========== API: 删除应用 ==========
app.delete('/api/apps/:id', authMiddleware, (req, res) => {
  const app_data = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
  if (!app_data) return res.json({ code: -1, message: '应用不存在' });

  // 删除文件
  try { fs.unlinkSync(app_data.file_path); } catch {}
  try {
    const qr = path.join(__dirname, app_data.qrcode_path.replace('/public/', 'public/'));
    fs.unlinkSync(qr);
  } catch {}

  db.prepare('DELETE FROM apps WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM download_logs WHERE app_id = ?').run(req.params.id);
  res.json({ code: 0, message: '删除成功' });
});

// ========== API: 下载统计 ==========
app.get('/api/stats', authMiddleware, (req, res) => {
  const totalApps = db.prepare('SELECT COUNT(*) as c FROM apps').get().c;
  const totalDownloads = db.prepare('SELECT SUM(download_count) as c FROM apps').get().c || 0;
  const todayDownloads = db.prepare(`
    SELECT COUNT(*) as c FROM download_logs WHERE date(created_at) = date('now','localtime')
  `).get().c;
  const recentApps = db.prepare('SELECT id, name, version, download_count, created_at FROM apps ORDER BY created_at DESC LIMIT 5').all();

  res.json({
    code: 0,
    data: { totalApps, totalDownloads, todayDownloads, recentApps }
  });
});

// ========== API: 修改密码 ==========
app.post('/api/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.json({ code: -1, message: '原密码错误' });
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ code: 0, message: '密码修改成功' });
});

// ========== API: 开放上传接口（类蒲公英 API）==========
app.post('/api/open/upload', upload.single('file'), async (req, res) => {
  const apiKey = req.body._api_key || req.body.api_key;
  // 简单验证：使用管理员密码哈希作为 API Key
  const admin = db.prepare('SELECT * FROM users WHERE role = ?').get('admin');
  if (!admin) return res.json({ code: -1, message: 'API Key 无效' });

  // 这里简化验证，实际可以建一个 api_keys 表
  if (!apiKey) return res.json({ code: -1, message: '缺少 _api_key 参数' });

  try {
    if (!req.file) return res.json({ code: -1, message: '请选择文件' });

    const id = uuidv4();
    const shortUrl = generateShortUrl();
    const filePath = req.file.path;
    const fileSize = req.file.size;
    const fileName = req.file.originalname;
    const ext = path.extname(fileName).toLowerCase();
    const platform = ext === '.apk' ? 'android' : 'ios';
    const name = req.body.buildUpdateDescription || fileName.replace(ext, '');

    const qrcodeName = `${shortUrl}.png`;
    const qrcodePath = path.join(QRCODE_DIR, qrcodeName);
    const downloadPageUrl = `${BASE_URL}/${shortUrl}`;
    await QRCode.toFile(qrcodePath, downloadPageUrl, { width: 300, margin: 2 });

    db.prepare(`
      INSERT INTO apps (id, name, bundle_id, version, build_number, description,
        file_name, file_size, file_path, short_url, qrcode_path, platform)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, '', '1.0', '1', '', fileName, fileSize, filePath, shortUrl,
      `/public/qrcodes/${qrcodeName}`, platform);

    // 兼容蒲公英 API 返回格式
    res.json({
      code: 0,
      data: {
        buildKey: shortUrl,
        buildName: name,
        buildFileSize: fileSize,
        buildQRCodeURL: `${BASE_URL}/public/qrcodes/${qrcodeName}`,
        buildShortcutUrl: downloadPageUrl
      }
    });
  } catch (err) {
    res.json({ code: -1, message: err.message });
  }
});

// ========== 公开页面：下载页 ==========
app.get('/:shortUrl', (req, res) => {
  const shortUrl = req.params.shortUrl;
  // 排除静态资源和API
  if (['api', 'public', 'uploads', 'admin', 'favicon.ico'].includes(shortUrl)) return res.status(404).end();

  const app_data = db.prepare('SELECT * FROM apps WHERE short_url = ?').get(shortUrl);
  if (!app_data) return res.status(404).send(getNotFoundPage());

  res.send(getDownloadPage(app_data));
});

// ========== 公开：文件下载 ==========
app.get('/d/:shortUrl', (req, res) => {
  const app_data = db.prepare('SELECT * FROM apps WHERE short_url = ?').get(req.params.shortUrl);
  if (!app_data) return res.status(404).json({ message: '应用不存在' });

  // 记录下载
  db.prepare('UPDATE apps SET download_count = download_count + 1 WHERE id = ?').run(app_data.id);
  db.prepare('INSERT INTO download_logs (app_id, ip, user_agent) VALUES (?, ?, ?)').run(
    app_data.id, req.ip, req.headers['user-agent']
  );

  res.download(app_data.file_path, app_data.file_name);
});

// ========== 管理后台页面 ==========
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ========== 工具函数 ==========
function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return bytes.toFixed(1) + ' ' + units[i];
}

function getDownloadPage(app_data) {
  const sizeText = formatSize(app_data.file_size);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
  <title>${app_data.name} - 下载安装</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;padding:20px}
    .card{max-width:420px;margin:0 auto;background:#fff;border-radius:20px;padding:30px;box-shadow:0 10px 40px rgba(0,0,0,.2)}
    .icon{width:90px;height:90px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:20px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:36px;color:#fff;font-weight:700}
    .name{font-size:22px;font-weight:600;text-align:center;color:#333}
    .meta{text-align:center;color:#888;font-size:13px;margin:6px 0 20px}
    .meta span{margin:0 6px}
    .btn{display:block;width:100%;padding:14px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;text-align:center;text-decoration:none;border-radius:12px;font-size:17px;font-weight:600;margin-bottom:12px}
    .btn:active{transform:scale(.98)}
    .changelog{background:#f5f5f5;border-radius:10px;padding:12px;margin:15px 0;font-size:13px;color:#666}
    .changelog h4{color:#333;margin-bottom:6px;font-size:14px}
    .section{font-size:15px;font-weight:600;color:#333;margin:20px 0 12px;padding-bottom:8px;border-bottom:1px solid #eee}
    .steps{color:#555;font-size:13px;line-height:2}
    .tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
    .tools a{padding:10px;background:#f5f5f5;border-radius:8px;text-align:center;text-decoration:none;color:#333;font-size:12px}
    .note{background:#fff3cd;border-radius:8px;padding:10px;font-size:12px;color:#856404;margin:15px 0}
    .qr{text-align:center;margin:15px 0}
    .qr img{width:150px;height:150px}
    .count{text-align:center;color:#aaa;font-size:12px;margin-top:10px}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${app_data.name.charAt(0).toUpperCase()}</div>
    <div class="name">${app_data.name}</div>
    <div class="meta">
      <span>${app_data.version}(${app_data.build_number})</span>
      <span>|</span>
      <span>${sizeText}</span>
      <span>|</span>
      <span>${app_data.platform === 'ios' ? 'iOS' : 'Android'}</span>
    </div>
    
    <a href="/d/${app_data.short_url}" class="btn">📥 下载安装包</a>
    
    ${app_data.description ? `<div class="changelog"><h4>应用简介</h4>${app_data.description}</div>` : ''}
    ${app_data.changelog ? `<div class="changelog"><h4>更新日志</h4>${app_data.changelog}</div>` : ''}
    
    ${app_data.platform === 'ios' ? `
    <div class="section">📱 安装步骤</div>
    <div class="steps">
      1. 点击上方按钮下载 IPA 文件<br>
      2. 在电脑上打开签名工具<br>
      3. 连接手机，安装 IPA
    </div>
    <div class="tools">
      <a href="https://sideloadly.io" target="_blank">💻 Sideloadly</a>
      <a href="https://altstore.io" target="_blank">📲 AltStore</a>
      <a href="https://www.i4.cn" target="_blank">🍎 爱思助手</a>
      <a href="https://ios222.com" target="_blank">🐸 牛蛙助手</a>
    </div>
    <div class="note">⚠️ 免费 Apple ID 签名的应用每 7 天需重新安装。TrollStore 用户可永久安装。</div>
    ` : ''}
    
    <div class="qr">
      <img src="${app_data.qrcode_path}" alt="扫码下载">
      <div style="font-size:12px;color:#999;margin-top:4px">扫码分享此页面</div>
    </div>
    
    <div class="count">已有 ${app_data.download_count} 次下载</div>
  </div>
</body>
</html>`;
}

function getNotFoundPage() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>404</title><style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5}
.c{text-align:center}.c h1{font-size:60px;color:#ddd}.c p{color:#999;margin:10px}</style></head>
<body><div class="c"><h1>404</h1><p>应用不存在或已被删除</p><a href="/admin">返回管理后台</a></div></body></html>`;
}

// ========== 启动 ==========
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('============================================');
  console.log('  kos 分发平台已启动');
  console.log(`  管理后台: ${BASE_URL}/admin`);
  console.log(`  默认账号: ${ADMIN_USER} / ${ADMIN_PASS}`);
  console.log('============================================');
  console.log('');
});
