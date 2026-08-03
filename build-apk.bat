@echo off
echo ============================================
echo   Build APK - Minipivovar Zajic
echo ============================================
echo.

REM --- Nastaveni cest ---
set PROJECT_DIR=d:\stazene\zajic\project
set JAVA_HOME=C:\Users\vasil\java\jdk-21.0.6+7
set ANDROID_HOME=C:\Users\vasil\android-sdk
set PATH=%JAVA_HOME%\bin;%PATH%

echo [1/3] Build web app (npm run build)...
cd /d "%PROJECT_DIR%"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo CHYBA: npm run build selhalo!
    pause
    exit /b 1
)
echo OK - Web build dokoncen
echo.

echo [2/3] Sync do Android (npx cap sync)...
cd /d "%PROJECT_DIR%"
call npx cap sync android
if %ERRORLEVEL% neq 0 (
    echo CHYBA: npx cap sync selhalo!
    pause
    exit /b 1
)
echo OK - Sync dokoncen
echo.

echo [3/3] Build APK (gradlew assembleDebug)...
cd /d "%PROJECT_DIR%\android"
call gradlew.bat assembleDebug
if %ERRORLEVEL% neq 0 (
    echo CHYBA: Build APK selhal!
    pause
    exit /b 1
)
echo.
echo ============================================
echo   HOTOVO! APK byl uspesne vytvoren!
echo ============================================
echo.
echo APK soubor:
echo   %PROJECT_DIR%\android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo Zkopiruj APK do telefonu a otevri ho pro instalaci.
echo.
pause
