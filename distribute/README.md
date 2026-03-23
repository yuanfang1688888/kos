# kos 分发平台

类似蒲公英的自托管 iOS/Android 应用分发系统。

## 功能

- 📤 上传 IPA/APK 文件
- 📱 自动生成下载页面和二维码
- 📊 下载统计和数据分析
- 🔗 短链接分享
- 🔐 JWT 登录认证
- 🌐 兼容蒲公英 API 格式
- 🐳 Docker 一键部署

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
cd distribute
docker compose up -d --build
```

访问 `http://localhost:3000/admin`，默认账号 `admin / admin123`

### 方式二：Node.js 直接运行

```bash
cd distribute
npm install
node server.js
```

### 方式三：一键部署脚本（Linux 服务器）

```bash
cd distribute
chmod +x deploy.sh
./deploy.sh
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 端口 | 3000 |
| HOST | 监听地址 | 0.0.0.0 |
| BASE_URL | 外部访问地址 | http://localhost:3000 |
| JWT_SECRET | JWT 密钥 | 随机 |
| ADMIN_USER | 管理员用户名 | admin |
| ADMIN_PASS | 管理员密码 | admin123 |

## API 接口

### 登录
```
POST /api/login
Body: { "username": "admin", "password": "admin123" }
```

### 上传应用
```
POST /api/apps/upload
Header: Authorization: Bearer <token>
Body: FormData { file, name, version, build_number, bundle_id, description, changelog }
```

### 应用列表
```
GET /api/apps?page=1&limit=20
Header: Authorization: Bearer <token>
```

### 开放 API（兼容蒲公英格式）
```
POST /api/open/upload
Body: FormData { file, _api_key }
```

## 目录结构

```
distribute/
├── server.js          # 后端服务
├── package.json       # 依赖
├── Dockerfile         # Docker 构建
├── docker-compose.yml # Docker 编排
├── deploy.sh          # 一键部署脚本
├── public/
│   ├── admin.html     # 管理后台
│   └── qrcodes/       # 二维码图片
├── uploads/           # 上传的文件
└── data.db            # SQLite 数据库
```
