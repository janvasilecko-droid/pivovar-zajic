@echo off
title Deploy PWA — zajic-pivovar
echo ============================================
echo   Deploy PWA na Cloudflare Pages
echo   https://zajic-pivovar.pages.dev
echo ============================================
echo.

set PROJECT_DIR=d:\stazene\zajic\project

echo [1/4] Zvysuji verzi...
cd /d "%PROJECT_DIR%"
node -e "
const fs = require('fs');
const path = require('path');
const f = path.join('%PROJECT_DIR%', 'src/lib/version.ts');
let c = fs.readFileSync(f, 'utf-8');
let v = c.match(/APP_VERSION\s*=\s*'([\d.]+)'/);
if (v) {
  let p = v[1].split('.').map(Number);
  p[p.length-1]++;
  let nv = p.join('.');
  let d = new Date();
  let ds = d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  c = c.replace(/APP_VERSION\s*=\s*'[\d.]+'/, \"APP_VERSION = '\"+nv+\"'\");
  c = c.replace(/APP_VERSION_DATE\s*=\s*'[^']*'/, \"APP_VERSION_DATE = '\"+ds+\"'\");
  fs.writeFileSync(f, c, 'utf-8');
  console.log('Verze: '+nv+' ('+ds+')');
  // version.json
  let iso = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  fs.writeFileSync(path.join('%PROJECT_DIR%', 'public/version.json'), JSON.stringify({version:nv,date:iso},null,2));
}
"
if %ERRORLEVEL% neq 0 (
    echo CHYBA: Zvyseni verze selhalo!
    pause
    exit /b 1
)
echo OK
echo.

echo [2/4] Build web app...
cd /d "%PROJECT_DIR%"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo CHYBA: Build selhal!
    pause
    exit /b 1
)
echo OK
echo.

echo [3/4] Deploy na Cloudflare Pages...
cd /d "%PROJECT_DIR%"
call npx wrangler pages deploy dist --project-name zajic-pivovar --branch main
if %ERRORLEVEL% neq 0 (
    echo CHYBA: Deploy selhal!
    pause
    exit /b 1
)
echo OK
echo.

echo [4/4] Hotovo!
echo.
echo ============================================
echo   HOTOVO! Aplikace je online:
echo   https://zajic-pivovar.pages.dev
echo ============================================
echo.
echo Zmeny se na telefonu projevi po refreshi (pripadne
echo po clear cache u PWA).
echo.
pause
