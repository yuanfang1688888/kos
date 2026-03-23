#!/bin/bash
# ============================================
# kos iOS 构建脚本
# 在 macOS 上运行: chmod +x build.sh && ./build.sh
# ============================================

set -e

PROJECT_NAME="kos"
SCHEME="kos"
CONFIGURATION="Release"
ARCHIVE_PATH="./build/${PROJECT_NAME}.xcarchive"
EXPORT_PATH="./build"
IPA_NAME="${PROJECT_NAME}.ipa"

echo "==========================================="
echo "  开始构建 ${PROJECT_NAME} iOS 应用"
echo "==========================================="

# 清理旧的构建产物
echo ">>> 清理旧构建..."
rm -rf ./build
mkdir -p ./build

# 构建 Archive
echo ">>> 正在 Archive..."
xcodebuild archive \
    -project ${PROJECT_NAME}.xcodeproj \
    -scheme ${SCHEME} \
    -configuration ${CONFIGURATION} \
    -archivePath "${ARCHIVE_PATH}" \
    -destination "generic/platform=iOS" \
    CODE_SIGN_IDENTITY="Apple Distribution" \
    -allowProvisioningUpdates \
    | tail -n 20

echo ">>> Archive 完成"

# 导出 IPA
echo ">>> 正在导出 IPA..."
xcodebuild -exportArchive \
    -archivePath "${ARCHIVE_PATH}" \
    -exportPath "${EXPORT_PATH}" \
    -exportOptionsPlist ExportOptions.plist \
    -allowProvisioningUpdates \
    | tail -n 10

echo ""
echo "==========================================="
echo "  构建完成!"
echo "  IPA 路径: ${EXPORT_PATH}/${IPA_NAME}"
echo "  文件大小: $(du -h "${EXPORT_PATH}/${IPA_NAME}" | cut -f1)"
echo "==========================================="
