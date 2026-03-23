@echo off
chcp 65001 >nul
echo ============================================
echo   kos iOS 全自动构建 - 一键初始化脚本
echo   在 Windows 上运行，配置 GitHub 自动构建
echo ============================================
echo.

:: 检查 git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未安装 Git，请先安装: https://git-scm.com
    pause
    exit /b 1
)

:: 检查 gh CLI
where gh >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 未安装 GitHub CLI，将使用手动方式
    echo         安装地址: https://cli.github.com
    set USE_GH=0
) else (
    set USE_GH=1
)

echo.
echo ========== 第一步：准备 Apple 开发者证书 ==========
echo.
echo 请确保你已有以下文件：
echo   1. Distribution 证书 (.p12 文件)
echo   2. Ad-Hoc Provisioning Profile (.mobileprovision 文件)
echo.
echo 如果没有，请先到 https://developer.apple.com 创建
echo.

set /p P12_PATH="请输入 .p12 证书文件路径: "
set /p P12_PASS="请输入证书密码: "
set /p PP_PATH="请输入 .mobileprovision 文件路径: "
set /p TEAM_ID="请输入 Apple Team ID: "
set /p PGYER_KEY="请输入蒲公英 API Key (可选，直接回车跳过): "

echo.
echo ========== 第二步：Base64 编码证书 ==========
echo.

:: Base64 编码证书
certutil -encode "%P12_PATH%" "%TEMP%\p12_b64.txt" >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 证书文件不存在或无法读取: %P12_PATH%
    pause
    exit /b 1
)
:: 去掉 certutil 的头尾标记
powershell -Command "(Get-Content '%TEMP%\p12_b64.txt' | Select-Object -Skip 1 | Select-Object -SkipLast 1) -join '' | Set-Content '%TEMP%\p12_clean.txt' -NoNewline"
set /p P12_B64=<"%TEMP%\p12_clean.txt"
echo [OK] 证书已编码

:: Base64 编码描述文件
certutil -encode "%PP_PATH%" "%TEMP%\pp_b64.txt" >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 描述文件不存在: %PP_PATH%
    pause
    exit /b 1
)
powershell -Command "(Get-Content '%TEMP%\pp_b64.txt' | Select-Object -Skip 1 | Select-Object -SkipLast 1) -join '' | Set-Content '%TEMP%\pp_clean.txt' -NoNewline"
set /p PP_B64=<"%TEMP%\pp_clean.txt"
echo [OK] 描述文件已编码

echo.
echo ========== 第三步：配置项目 ==========
echo.

:: 更新 ExportOptions.plist 中的 Team ID
powershell -Command "(Get-Content 'ExportOptions.plist') -replace 'YOUR_TEAM_ID', '%TEAM_ID%' | Set-Content 'ExportOptions.plist'"
echo [OK] ExportOptions.plist 已更新

echo.
echo ========== 第四步：初始化 Git 仓库 ==========
echo.

if not exist ".git" (
    git init
    echo [OK] Git 仓库已初始化
) else (
    echo [OK] Git 仓库已存在
)

git add -A
git commit -m "初始化 kos iOS 项目" 2>nul

echo.
set /p REPO_URL="请输入 GitHub 仓库地址 (例如 https://github.com/user/kos): "

git remote remove origin 2>nul
git remote add origin %REPO_URL%

echo.
echo ========== 第五步：配置 GitHub Secrets ==========
echo.

if "%USE_GH%"=="1" (
    echo 正在使用 GitHub CLI 配置 Secrets...
    
    powershell -Command "Get-Content '%TEMP%\p12_clean.txt' -Raw | gh secret set P12_BASE64"
    gh secret set P12_PASSWORD --body "%P12_PASS%"
    powershell -Command "Get-Content '%TEMP%\pp_clean.txt' -Raw | gh secret set PROVISION_PROFILE_BASE64"
    gh secret set KEYCHAIN_PASSWORD --body "temp_keychain_pass_123"
    
    if not "%PGYER_KEY%"=="" (
        gh secret set PGYER_API_KEY --body "%PGYER_KEY%"
        echo [OK] 蒲公英 API Key 已配置
    )
    
    echo [OK] 所有 Secrets 已自动配置
) else (
    echo.
    echo [手动配置] 请到 GitHub 仓库 → Settings → Secrets and variables → Actions
    echo 添加以下 Secrets：
    echo.
    echo   P12_BASE64            = (证书 base64，已保存到 %TEMP%\p12_clean.txt)
    echo   P12_PASSWORD           = %P12_PASS%
    echo   PROVISION_PROFILE_BASE64 = (描述文件 base64，已保存到 %TEMP%\pp_clean.txt)
    echo   KEYCHAIN_PASSWORD      = temp_keychain_pass_123
    if not "%PGYER_KEY%"=="" (
        echo   PGYER_API_KEY          = %PGYER_KEY%
    )
    echo.
)

echo.
echo ========== 第六步：推送触发自动构建 ==========
echo.

set /p PUSH_NOW="是否立即推送到 GitHub 触发构建? (Y/N): "
if /i "%PUSH_NOW%"=="Y" (
    git branch -M main
    git push -u origin main
    echo.
    echo [OK] 代码已推送! GitHub Actions 将自动开始构建
    echo      查看进度: %REPO_URL%/actions
) else (
    echo.
    echo 稍后手动推送: git push -u origin main
)

echo.
echo ============================================
echo   初始化完成!
echo.
echo   自动流程: git push → 自动构建 → 自动签名
echo            → 导出 IPA → 上传蒲公英 → 获得下载链接
echo.
echo   后续每次修改代码只需:
echo     git add -A ^&^& git commit -m "更新" ^&^& git push
echo   即可全自动完成构建和分发
echo ============================================
echo.

:: 清理临时文件
del "%TEMP%\p12_b64.txt" "%TEMP%\p12_clean.txt" "%TEMP%\pp_b64.txt" "%TEMP%\pp_clean.txt" 2>nul

pause
