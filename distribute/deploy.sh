#!/bin/bash
# kos 分发平台 - 一键部署脚本
# 支持: Ubuntu / Debian / CentOS / macOS

set -e

echo "============================================"
echo "  🚀 kos 分发平台 - 一键部署"
echo "============================================"
echo ""

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 检查是否为 root
if [ "$EUID" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

# 配置变量
PORT=${PORT:-3000}
ADMIN_USER=${ADMIN_USER:-admin}
ADMIN_PASS=${ADMIN_PASS:-admin123}
INSTALL_DIR=${INSTALL_DIR:-/opt/kos-distribute}

echo "请选择部署方式:"
echo "  1) Docker 部署 (推荐)"
echo "  2) Node.js 直接部署"
read -p "请输入 (1 或 2): " DEPLOY_MODE

# ========== Docker 部署 ==========
deploy_docker() {
  info "检查 Docker..."
  if ! command -v docker &> /dev/null; then
    info "安装 Docker..."
    curl -fsSL https://get.docker.com | sh
    $SUDO systemctl start docker
    $SUDO systemctl enable docker
  fi

  if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    info "安装 Docker Compose..."
    $SUDO curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    $SUDO chmod +x /usr/local/bin/docker-compose
  fi

  info "创建部署目录..."
  $SUDO mkdir -p "$INSTALL_DIR"
  $SUDO cp -r . "$INSTALL_DIR/"
  cd "$INSTALL_DIR"

  # 获取服务器 IP
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  BASE_URL="http://${SERVER_IP}:${PORT}"

  # 生成 JWT Secret
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | head -c 64)

  # 更新 docker-compose.yml
  cat > docker-compose.yml << EOF
version: '3.8'
services:
  kos-distribute:
    build: .
    container_name: kos-distribute
    restart: always
    ports:
      - "${PORT}:3000"
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
      - ./qrcodes:/app/public/qrcodes
    environment:
      - PORT=3000
      - HOST=0.0.0.0
      - BASE_URL=${BASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - ADMIN_USER=${ADMIN_USER}
      - ADMIN_PASS=${ADMIN_PASS}
EOF

  info "构建并启动 Docker 容器..."
  $SUDO docker compose up -d --build 2>/dev/null || $SUDO docker-compose up -d --build

  echo ""
  echo "============================================"
  echo -e "  ${GREEN}✅ 部署成功！${NC}"
  echo "  管理后台: ${BASE_URL}/admin"
  echo "  账号: ${ADMIN_USER}"
  echo "  密码: ${ADMIN_PASS}"
  echo "============================================"
}

# ========== Node.js 直接部署 ==========
deploy_nodejs() {
  info "检查 Node.js..."
  if ! command -v node &> /dev/null; then
    info "安装 Node.js 18..."
    if command -v apt-get &> /dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_18.x | $SUDO bash -
      $SUDO apt-get install -y nodejs build-essential python3
    elif command -v yum &> /dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_18.x | $SUDO bash -
      $SUDO yum install -y nodejs gcc-c++ make python3
    elif command -v brew &> /dev/null; then
      brew install node@18
    else
      error "不支持的操作系统，请手动安装 Node.js 18"
    fi
  fi

  NODE_VER=$(node -v)
  info "Node.js 版本: ${NODE_VER}"

  info "创建部署目录..."
  $SUDO mkdir -p "$INSTALL_DIR"
  $SUDO cp -r . "$INSTALL_DIR/"
  cd "$INSTALL_DIR"

  info "安装依赖..."
  npm install --production

  # 获取服务器 IP
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  BASE_URL="http://${SERVER_IP}:${PORT}"
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | head -c 64)

  # 安装 PM2
  info "安装 PM2 进程管理..."
  $SUDO npm install -g pm2

  # 创建环境配置
  cat > .env << EOF
PORT=${PORT}
HOST=0.0.0.0
BASE_URL=${BASE_URL}
JWT_SECRET=${JWT_SECRET}
ADMIN_USER=${ADMIN_USER}
ADMIN_PASS=${ADMIN_PASS}
EOF

  # 启动
  info "启动服务..."
  pm2 delete kos-distribute 2>/dev/null || true
  PORT=$PORT HOST=0.0.0.0 BASE_URL=$BASE_URL JWT_SECRET=$JWT_SECRET ADMIN_USER=$ADMIN_USER ADMIN_PASS=$ADMIN_PASS pm2 start server.js --name kos-distribute
  pm2 save
  pm2 startup 2>/dev/null || true

  echo ""
  echo "============================================"
  echo -e "  ${GREEN}✅ 部署成功！${NC}"
  echo "  管理后台: ${BASE_URL}/admin"
  echo "  账号: ${ADMIN_USER}"
  echo "  密码: ${ADMIN_PASS}"
  echo ""
  echo "  PM2 管理命令:"
  echo "    pm2 status         # 查看状态"
  echo "    pm2 logs           # 查看日志"
  echo "    pm2 restart kos-distribute  # 重启"
  echo "============================================"
}

# 执行
case $DEPLOY_MODE in
  1) deploy_docker ;;
  2) deploy_nodejs ;;
  *) error "无效选择" ;;
esac
