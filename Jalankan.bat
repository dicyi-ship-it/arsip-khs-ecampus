@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Jalankan npm install terlebih dahulu.
  pause
  exit /b 1
)
if not exist data\ecampus.sqlite (
  echo Database belum tersedia. Baca README.md untuk impor.
  pause
  exit /b 1
)
echo Buka http://localhost:3000 di browser setelah aplikasi siap.
node --env-file-if-exists=.env server.mjs
pause
