@echo off
title Watch + Auto Deploy — zajic-pivovar
echo ============================================
echo   Watch + Auto Deploy na Cloudflare Pages
echo   https://zajic-pivovar.pages.dev
echo ============================================
echo.
echo Sleduji zmeny v src/ a public/...
echo Pri kazde zmene se automaticky:
echo   1. Zvysi verze
echo   2. Spusti npm run build
echo   3. Deploy na Cloudflare Pages
echo.
echo Stiskni Ctrl+C pro zastaveni.
echo.

cd /d "d:\stazene\zajic\project"
node watch-deploy.mjs
pause
