# Deployment intranet — Windows Server

## Isi paket

- Aplikasi Node.js, folder `public`, dan dependensi `node_modules` untuk penggunaan offline.
- `data/ecampus.sqlite`: database akademik hasil audit, siap digunakan tanpa PostgreSQL/MySQL. Antarmuka dan ekspor dibatasi ke 2.290 mahasiswa ITECH, 68.456 nilai. File database masih menyimpan hasil impor gabungan; batasi akses file hanya untuk operator server.
- Akun berada di `data/auth.sqlite`, dibuat otomatis ketika server dijalankan. Akun lama, sesi, kode aktivasi, dump SQL 4 GB, dan Excel tidak disertakan.
- Database mata kuliah tetap hasil rekonstruksi perlu verifikasi; 72 baris belum mempunyai nama MK.

Paket ZIP berisi data mahasiswa. Pindahkan melalui media/jalur internal yang diizinkan; jangan unggah paket atau folder `data` ke GitHub.

## 1. Persiapan

Pasang Node.js **24 atau lebih baru** pada Windows Server (runtime tidak disertakan). Gunakan disk lokal NTFS, bukan shared folder SMB untuk database SQLite. Sediakan ruang tambahan untuk file ekspor sementara dan backup. Jalankan satu instance aplikasi.

Ekstrak ZIP ke folder baru, misalnya `C:\Apps\arsip-khs`. Jangan mengekstrak paket database di atas instalasi yang sudah berjalan. Dependensi disertakan, sehingga internet tidak diperlukan sesudah Node.js terpasang.

## 2. Konfigurasi

Ganti contoh IP dengan IP tetap server. Jalankan PowerShell di folder hasil ekstrak:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-Intranet.ps1 -PublicUrl "http://192.168.1.10:3000"
.\Jalankan.bat
```

Installer membuat `.env` dan menolak menimpa konfigurasi lama. HTTP langsung cocok untuk uji awal di LAN tepercaya, tetapi password dan data masih melintas tanpa enkripsi. Untuk penggunaan dengan data mahasiswa, gunakan HTTPS melalui IIS/reverse proxy dengan sertifikat yang dipercaya komputer klien.

Contoh HTTPS:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-Intranet.ps1 -PublicUrl "https://arsip.kampus.local"
```

Installer HTTPS mengikat Node ke `127.0.0.1:3000` dan mengaktifkan cookie Secure. Konfigurasikan IIS/reverse proxy untuk meneruskan ke `http://127.0.0.1:3000`, mempertahankan **Host asli dan Origin**, serta timeout minimal 300 detik untuk ekspor. Jangan meneruskan aplikasi dari subpath; gunakan root domain. Siapkan DNS/hosts klien untuk domain intranet tersebut. Proxy tidak dipasang otomatis oleh paket ini.

Konfigurasi manual `.env`:

```dotenv
HOST=0.0.0.0
PORT=3000
PUBLIC_ORIGINS=http://192.168.1.10:3000
COOKIE_SECURE=0
ECAMPUS_DB=./data/ecampus.sqlite
AUTH_DB=./data/auth.sqlite
```

`PUBLIC_ORIGINS` adalah daftar origin yang diizinkan, dipisahkan koma, tanpa garis miring akhir. Contoh: `http://192.168.1.10:3000,http://arsip.local:3000`. Gunakan URL tersebut saat membuka aplikasi; localhost tidak otomatis diizinkan jika tidak tercantum. Jangan mencampurkan HTTP dan HTTPS saat cookie Secure aktif.

## 3. Firewall dan autostart

Untuk HTTP langsung, jalankan sebagai Administrator dan sesuaikan port/subnet:

```powershell
New-NetFirewallRule -DisplayName 'Arsip KHS Intranet' -Direction Inbound -Protocol TCP -LocalPort 3000 -RemoteAddress LocalSubnet -Action Allow -Profile Domain,Private
```

Untuk HTTPS melalui IIS, buka port 443 sesuai aturan jaringan; tidak perlu membuka 3000 karena Node hanya terikat ke localhost. Jangan membuka port ke internet.

Gunakan Windows **Task Scheduler** agar aplikasi otomatis berjalan:

1. Buat task `Arsip KHS eCampus`, trigger **At startup**, delay 30 detik.
2. Jalankan menggunakan akun layanan Windows khusus, **Run whether user is logged on or not**. Akun perlu Read/Execute pada aplikasi dan Modify pada folder `data`, `backups`, serta folder TEMP akun tersebut.
3. Program: `C:\Program Files\nodejs\node.exe`.
4. Arguments: `--env-file=.env server.mjs`.
5. Start in: `C:\Apps\arsip-khs` (sesuaikan lokasi).
6. Aktifkan restart jika gagal, misalnya setiap 1 menit. Matikan batas durasi task. Pilih **Do not start a new instance**.
7. Tutup proses uji `Jalankan.bat` sebelum memulai task agar port tidak bentrok.

Batasi ACL folder `data`, `backups`, dan paket ZIP ke akun layanan dan administrator. SQLite tidak membutuhkan service database terpisah.

## 4. Aktivasi akun

Buka URL intranet `/login`. Pada server, baca `data/setup-token.txt`, lalu isi kode tersebut untuk membuat super admin. Password minimal 12 karakter. Kode dihapus setelah aktivasi. Login, pilih **Kelola pengguna**, dan tambahkan akun operator. Tidak ada akun/password bawaan.

Percobaan login dibatasi per alamat koneksi. Jika menggunakan reverse proxy, alamat koneksi bisa sama untuk seluruh klien sehingga pembatasan berlaku bersama. Aplikasi tidak mempercayai `X-Forwarded-For` dari klien. Bila operator banyak, atur rate limiting per klien di proxy dan evaluasi kebijakan aplikasi.

## 5. Backup

Dari folder aplikasi:

```powershell
npm.cmd run backup
```

Atau, untuk task backup harian, jalankan `node.exe --env-file=.env backup.mjs` dengan Start in folder aplikasi. Hasil ada di `backups\backup-...`. Backup memakai SQLite Online Backup API dan memeriksa integritas. Hanya folder dengan `COMPLETE.txt` yang dianggap selesai. Akun dan password hash dipertahankan, tetapi sesi login dan pembatasan percobaan dibuang sehingga pengguna login kembali setelah restore.

Salin backup selesai ke lokasi internal terpisah yang aksesnya dibatasi. Backup kedua database dilakukan berurutan; jangan melakukan penggantian database akademik selama backup. Folder backup baru tidak menimpa backup sebelumnya.

## 6. Restore / update

1. Hentikan task aplikasi dan pastikan tidak ada ekspor yang berjalan.
2. Cadangkan folder `data` dan `.env` yang ada; jangan hapus sebelum restore diverifikasi.
3. Salin `ecampus.sqlite` dan `auth.sqlite` dari backup lengkap ke lokasi yang ditetapkan `.env`. Jika backup belum mempunyai `auth.sqlite`, aktivasi super admin diperlukan lagi.
4. Jalankan task. Cek login, pencarian mahasiswa, dan ekspor satu mahasiswa. Pengguna harus login kembali.

Untuk update kode, pertahankan `.env`, `data`, dan `backups`. Salin hanya file kode/dependensi dari paket baru, **jangan timpa database dengan database bawaan paket**. Jika ingin mengganti data akademik, lakukan sebagai proses terpisah setelah backup.

## Pengujian dan keterbatasan

`npm.cmd test` menggunakan database sintetis di folder sementara dan tidak mengubah database produksi. Konfigurasi origin/host, login, CSRF, peran pengguna, transkrip, dan Excel diperiksa. Paket diuji lokal, tetapi instalasi Task Scheduler, IIS, sertifikat, firewall, dan koneksi antar komputer harus diverifikasi di Windows Server tujuan.

Referensi: [Node SQLite backup](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Node environment files](https://github.com/nodejs/node/blob/main/doc/api/environment_variables.md).
