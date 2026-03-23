#!/bin/bash
# ============================================
# kos iOS 免签构建脚本
# 无需 Apple 开发者证书，构建未签名 IPA
# 配合 AltStore / Sideloadly / 爱思助手安装
# ============================================

set -e

PROJECT_NAME="kos"
SCHEME="kos"
BUILD_DIR="./DerivedData"
OUTPUT_DIR="./build"
BUILD_NUMBER=$(date +%Y%m%d%H%M)

echo "==========================================="
echo "  kos iOS 免签构建"
echo "  无需证书、无需付费开发者账号"
echo "==========================================="
echo ""

# 检查 xcodebuild
if ! command -v xcodebuild &> /dev/null; then
    echo "[错误] 未找到 xcodebuild，请先安装 Xcode"
    echo "       打开 App Store 搜索 Xcode 安装"
    exit 1
fi

# 清理
echo ">>> 清理旧构建..."
rm -rf "$BUILD_DIR" "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# 构建（跳过签名）
echo ">>> 正在构建 (免签模式)..."
xcodebuild build \
    -project ${PROJECT_NAME}.xcodeproj \
    -scheme ${SCHEME} \
    -configuration Release \
    -sdk iphoneos \
    -derivedDataPath "$BUILD_DIR" \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    CURRENT_PROJECT_VERSION=${BUILD_NUMBER} \
    -quiet

echo ">>> 构建完成"

# 查找 .app
APP_PATH=$(find "$BUILD_DIR" -name "*.app" -type d | head -1)
if [ -z "$APP_PATH" ]; then
    echo "[错误] 构建失败，未找到 .app"
    exit 1
fi

# 打包成 IPA
echo ">>> 正在打包 IPA..."
mkdir -p "$OUTPUT_DIR/Payload"
cp -r "$APP_PATH" "$OUTPUT_DIR/Payload/"

cd "$OUTPUT_DIR"
zip -r -q "${PROJECT_NAME}.ipa" Payload
rm -rf Payload
cd ..

IPA_FILE="$OUTPUT_DIR/${PROJECT_NAME}.ipa"
IPA_SIZE=$(du -h "$IPA_FILE" | cut -f1)

echo ""
echo "==========================================="
echo "  构建成功!"
echo "  IPA: $IPA_FILE"
echo "  大小: $IPA_SIZE"
echo "  版本: 1.0 ($BUILD_NUMBER)"
echo ""
echo "  安装方法 (选一种):"
echo ""
echo "  1. AltStore (推荐)"
echo "     下载: https://altstore.io"
echo "     电脑安装 AltServer → 手机安装 AltStore"
echo "     → 用 AltStore 打开 IPA 安装"
echo ""
echo "  2. Sideloadly"
echo "     下载: https://sideloadly.io"
echo "     连接手机 → 拖入 IPA → 输入 Apple ID → 安装"
echo ""
echo "  3. 爱思助手 / 牛蛙助手"
echo "     电脑安装爱思助手 → 连接手机 → 安装 IPA"
echo ""
echo "  4. TrollStore (免重签)"
echo "     如果手机已安装 TrollStore"
echo "     直接用 TrollStore 安装，永不过期"
echo "==========================================="
