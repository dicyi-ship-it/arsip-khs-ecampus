# Panduan backup eCampus sampai aplikasi dapat digunakan

Panduan ini untuk Windows/PowerShell. Alurnya: **file backup → SQL teks → database SQLite aplikasi → halaman arsip dan Excel**. Pilih langkah sesuai format file; tidak semua file membutuhkan ekstraksi dan konversi sekaligus.

## 1. Apa yang diketahui dari proyek ini?

- Dump SQL yang tercatat bernama `data_ecampus_lengkap.sql`, berukuran **4.366.090.308 byte**, sekitar **4,36 GB** atau **4,07 GiB**.
- Ukuran file sebelum dikembangkan dan software yang dipakai pada proses awal **belum terkonfirmasi**. Panduan ini menjelaskan cara mengulang proses, bukan bukti riwayat software yang dahulu digunakan.
- File `Sekolah_Tinggi_Teknologi_Informasi_NIIT_tech_DB_13-02-2026.backup` yang ditemukan di folder Documents saat pemeriksaan berukuran **0 byte**. Salinan kosong tersebut tidak dapat dipulihkan; cari salinan backup asli yang berisi data.
- Database akademik hasil olahan berada di `data/ecampus.sqlite`. Database akun aplikasi berada terpisah di `data/auth.sqlite`.

Backup dapat kecil karena kompresi, sedangkan SQL teks jauh lebih besar karena berisi struktur dan data dalam bentuk teks. Perbedaan ukuran saja tidak membuktikan backup lengkap atau valid.

## 2. Siapkan file dan software

1. Simpan salinan backup asli; kerjakan pada salinannya.
2. Siapkan folder kerja, misalnya `D:\Pemulihan-eCampus`. Sediakan ruang kosong untuk backup, SQL hasil konversi, SQLite, dan file sementara. Untuk SQL sebesar 4,36 GB, alokasikan ruang beberapa kali ukuran SQL; kebutuhan tepat bergantung pada isi backup.
3. Aktifkan **File name extensions / Ekstensi nama file** di File Explorer agar ekstensi terlihat.
4. Jika berupa ZIP/RAR/7Z/GZ, gunakan **7-Zip** dari [situs resmi 7-Zip](https://www.7-zip.org/). Untuk ZIP, fitur **Extract All** Windows juga dapat dipakai.
5. Jika berupa arsip PostgreSQL, siapkan **pg_restore**, yang tersedia bersama perangkat PostgreSQL. Gunakan versi yang dapat membaca format backup tersebut; versi terlalu lama dapat menolak backup lebih baru. Unduh dari [situs resmi PostgreSQL](https://www.postgresql.org/download/windows/).
6. Untuk aplikasi ini, siapkan **Node.js 24+** dan dependensi proyek. Lihat [README](../README.md).

Konversi arsip menjadi SQL menggunakan `pg_restore` tidak memerlukan server PostgreSQL aktif. pgAdmin juga dapat memulihkan backup ke server PostgreSQL, tetapi untuk alur aplikasi ini cukup menghasilkan file SQL menggunakan `pg_restore`.

## 3. Periksa file awal

Di PowerShell, sesuaikan lokasi file berikut dengan salinan asli yang benar:

```powershell
$backupFile = 'D:\Pemulihan-eCampus\ecampus.backup'
Get-Item -LiteralPath $backupFile | Select-Object Name, Length, LastWriteTime
```

Jika `Length` adalah `0`, hentikan proses dan cari salinan yang benar. Mengganti ekstensi atau mengekstraknya tidak akan memulihkan isinya.

| Isi/format file | Langkah berikutnya |
| --- | --- |
| ZIP, RAR, 7Z, atau GZ | Ekstrak dahulu, lalu periksa file hasilnya |
| Arsip PostgreSQL custom/tar/directory | Gunakan `pg_restore` untuk menghasilkan SQL |
| SQL teks dengan perintah seperti `CREATE TABLE` dan `COPY ... FROM stdin;` | Langsung periksa dan impor SQL |
| Ekstensi `.backup` tetapi format tidak diketahui | Coba pemeriksaan `pg_restore --list`; ekstensi saja tidak menentukan format |

## 4. Jika backup berupa arsip kompresi

1. Klik kanan file → **7-Zip** → **Open archive** untuk memeriksa isi.
2. Pilih **Extract**, kemudian tentukan folder baru, misalnya `D:\Pemulihan-eCampus\hasil-ekstrak`.
3. Tunggu sampai selesai. Jika muncul CRC error, unexpected end, atau permintaan volume berikutnya, selesaikan masalah arsip dahulu. Untuk arsip terbagi, seluruh bagian harus tersedia.
4. Periksa hasilnya. Jika sudah berupa SQL teks, lanjut ke langkah 6. Jika berupa arsip PostgreSQL, lanjut ke langkah 5. Arsip `.tar.gz` dapat membutuhkan dua tahap ekstraksi.

WinRAR/7-Zip digunakan untuk lapisan arsip kompresi. Arsip PostgreSQL custom memerlukan `pg_restore` untuk menghasilkan SQL yang dapat dibaca importer aplikasi.

## 5. Jika backup berupa arsip PostgreSQL

Untuk langkah melalui antarmuka pgAdmin, baca [Panduan lengkap pgAdmin](PANDUAN-PGADMIN.md): instalasi, koneksi, database kosong, Restore, pemeriksaan tabel, dan ekspor Plain SQL.

### 5.1 Temukan pg_restore

Cari file `pg_restore.exe` pada folder instalasi PostgreSQL, biasanya `C:\Program Files\PostgreSQL\<versi>\bin`. Contoh di bawah menggunakan folder versi 18; ganti sesuai instalasi Anda.

```powershell
$pgRestore = 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe'
$backupFile = 'D:\Pemulihan-eCampus\ecampus.backup'
$sqlFile = 'D:\Pemulihan-eCampus\data_ecampus_lengkap.sql'
& $pgRestore --version
```

### 5.2 Periksa daftar isi backup

```powershell
& $pgRestore --list $backupFile
if ($LASTEXITCODE -ne 0) { throw 'Backup belum dapat dibaca. Periksa pesan kesalahan sebelum melanjutkan.' }
```

Daftar isi menunjukkan arsip dikenali, tetapi belum menjamin seluruh data dapat dibaca. Jika pesan menyebut file adalah text format dump, file tersebut sudah berupa SQL teks: lanjut ke langkah 6. Jika muncul `unsupported version`, gunakan versi `pg_restore` yang mendukung arsip itu. Jika file terpotong atau kosong, cari salinan lengkap.

### 5.3 Konversi menjadi SQL teks

Pastikan nama output belum ada agar hasil sebelumnya tidak tertimpa:

```powershell
if (Test-Path -LiteralPath $sqlFile) { throw 'File output sudah ada. Pilih nama output lain.' }
& $pgRestore --verbose --no-owner --no-privileges --file $sqlFile $backupFile
if ($LASTEXITCODE -ne 0) { throw 'Konversi gagal. Jangan impor SQL parsial; periksa pesan kesalahan.' }
Get-Item -LiteralPath $sqlFile | Select-Object Name, Length
```

Tanpa opsi `--dbname`, `pg_restore` menulis skrip ke file. Gunakan `--file` agar output ditulis langsung oleh tool; hindari mengalirkan SQL melalui `>` di Windows PowerShell karena encoding dapat berubah. Jangan gunakan `--inserts`: importer proyek mengharuskan format `COPY ... FROM stdin` teks.

## 6. Periksa SQL sebelum impor

Untuk membaca awal file besar tanpa membuka seluruhnya:

```powershell
Get-Content -LiteralPath 'D:\Pemulihan-eCampus\data_ecampus_lengkap.sql' -TotalCount 30
```

File harus berupa SQL teks, bukan data biner. Jika `rg` tersedia, cari contoh blok data:

```powershell
rg -m 5 '^COPY (public|audit|new_audit)\.' 'D:\Pemulihan-eCampus\data_ecampus_lengkap.sql'
```

Importer proyek membaca blok `COPY schema.tabel (...) FROM stdin;` beserta baris datanya. SQL dengan data berbentuk `INSERT`, atau struktur tabel yang berbeda, memerlukan penyesuaian. Jangan menjalankan file SQL pada server produksi untuk kebutuhan aplikasi ini; importer membaca teksnya tanpa mengeksekusi perintah SQL dump.

## 7. Impor ke SQLite aplikasi

1. Buka PowerShell pada folder proyek:

   ```powershell
   Set-Location 'C:\Users\Administrator\Documents\Pengecekan Data Transkip'
   node --version
   npm install
   ```

2. Jika database aplikasi sudah ada, cadangkan dahulu menggunakan `npm run backup`. Perintah ini memerlukan database akademik yang tersedia dan konfigurasi yang benar. Hasil lengkap ditandai `COMPLETE.txt` pada folder `backups`. Lalu hentikan aplikasi dan pastikan ekspor sudah berhenti.
3. Importer menolak menimpa `data/ecampus.sqlite`. Untuk impor ulang, setelah backup berhasil dan aplikasi dihentikan, pindahkan database akademik lama ke nama cadangan yang belum ada:

   ```powershell
   $oldDatabase = '.\data\ecampus.sqlite'
   $savedDatabase = '.\data\ecampus-sebelum-impor-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sqlite'
   if (Test-Path -LiteralPath $oldDatabase) {
       Move-Item -LiteralPath $oldDatabase -Destination $savedDatabase -ErrorAction Stop
   }
   ```

   Pertahankan `data/auth.sqlite` agar akun aplikasi tetap tersedia. Contoh ini mengikuti lokasi database standar proyek; jika konfigurasi lokasi diubah, periksa lokasi aktual sebelum memindahkan file. Importer CLI memakai lokasi bawaan proyek, sedangkan server/backup membaca lokasi dari `.env`.

4. Untuk dump eCampus yang tercatat di proyek ini, gunakan mode audit:

   ```powershell
   node import.mjs 'D:\Pemulihan-eCampus\data_ecampus_lengkap.sql' --audit
   if ($LASTEXITCODE -ne 0) { throw 'Impor gagal. Periksa pesan kesalahan sebelum menjalankan aplikasi.' }
   ```

5. Tunggu proses selesai. Importer membaca file secara streaming, memakai file sementara `data/ecampus.sqlite.importing`, lalu memindahkan hasil lengkap menjadi `data/ecampus.sqlite`. Jangan mengganti nama file sementara menjadi database final secara manual.

Untuk dump lain yang tabel akademik `public` berisi data dan strukturnya sesuai, perintahnya tanpa `--audit`. Tentukan mode berdasarkan isi dump; mode audit dipilih untuk dump ini karena lima tabel akademik utama `public` kosong.

## 8. Bagaimana data audit direkonstruksi?

1. Pilih revisi numerik terakhir tiap ID dalam setiap sumber audit.
2. Prioritaskan `new_audit`; gunakan `audit` jika ID tidak tersedia di `new_audit`.
3. Keluarkan data yang revisi terakhirnya memiliki `revtype=2` (penghapusan).
4. Simpan informasi sumber dan revisi untuk pemeriksaan.
5. Ambil nama mata kuliah dari referensi yang tersedia atau label riwayat nilai dengan format yang dikenali. Data yang tidak dapat dipastikan tetap kosong.

Database impor menyimpan hasil rekonstruksi; pembatasan STTI NIIT ITECH diterapkan aplikasi dan eksportir. Untuk dump yang sama, catatan proyek menyebut **2.290 mahasiswa**, **68.456 riwayat nilai**, dan **72 baris tanpa nama mata kuliah** dalam cakupan ITECH. Hasil tetap perlu verifikasi terhadap transkrip resmi. Lihat [audit mata kuliah](../AUDIT-MATAKULIAH.md).

## 9. Jalankan dan periksa aplikasi

```powershell
npm start
```

Dengan `.env` workspace saat ini, buka http://localhost:1500/login pada server atau http://192.168.88.123:1500/login dari jaringan yang sama. Jika alamat/port berubah, ikuti `.env` yang digunakan.

1. Login menggunakan akun aplikasi. Username aktif yang ditemukan: `arsip-ecampus@i-tech.ac.id`. Password asli tidak dapat dibaca dari hash dan tidak diperoleh dari proses ekstraksi data akademik.
2. Jika instalasi baru belum memiliki akun, baca `data/setup-token.txt`, lalu buat super admin melalui halaman login. Rincian ada di [README](../README.md#login-dan-super-admin).
3. Cari beberapa mahasiswa yang diketahui, buka transkrip, dan cocokkan data dengan sumber resmi.
4. Unduh Excel satu mahasiswa dan periksa hasilnya.
5. Jika hasil telah diverifikasi, buat backup aplikasi dengan `npm run backup`.

## 10. Masalah umum

| Masalah | Tindakan |
| --- | --- |
| File awal 0 byte | Ambil ulang backup asli; file tidak memiliki isi |
| File kecil menjadi SQL beberapa GB | Dapat terjadi akibat kompresi; tetap periksa keberhasilan konversi dan isi data |
| `pg_restore` tidak ditemukan | Gunakan lokasi lengkap `pg_restore.exe` yang terpasang |
| `unsupported version` | Gunakan `pg_restore` yang mendukung format versi backup |
| CRC error / file terpotong | Cari salinan lengkap; periksa seluruh bagian arsip |
| `Database sudah tersedia` | Backup, hentikan aplikasi, lalu pindahkan database akademik lama sebelum impor |
| File `.importing` tertinggal | Pastikan proses impor lama sudah berhenti; pindahkan file sementara tersebut ke nama lain sebelum mengulang |
| Tabel akademik yang diperlukan tidak ditemukan | Periksa kelengkapan dump, mode impor, dan kesesuaian struktur tabel |
| Login gagal setelah impor | Periksa `auth.sqlite` dan kredensial akun; impor akademik tidak mengatur password aplikasi |

## 11. Backup aplikasi dan pemulihannya

Backup aplikasi berbeda dari backup PostgreSQL awal. `npm run backup` menghasilkan folder berisi SQLite, bukan arsip PostgreSQL yang memerlukan `pg_restore`.

Untuk restore: hentikan aplikasi, cadangkan folder `data` dan `.env` saat ini, lalu salin `ecampus.sqlite` dan `auth.sqlite` dari backup lengkap ke lokasi yang diatur di `.env`. Jalankan aplikasi dan verifikasi login, pencarian, serta ekspor. Sesi login tidak ikut dipertahankan sehingga pengguna perlu masuk kembali. Detail ada di [DEPLOY-WINDOWS.md](../DEPLOY-WINDOWS.md#6-restore--update).

## Referensi

- [Dokumentasi resmi PostgreSQL: pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html) — membaca daftar isi arsip dan menulis SQL menggunakan `--file` tanpa koneksi database.
- [Situs resmi 7-Zip](https://www.7-zip.org/) — perangkat untuk membuka arsip kompresi.
- [README proyek](../README.md) — cara menjalankan, login, impor, dan batas rekonstruksi.

Perintah di panduan ini adalah petunjuk untuk dijalankan pada salinan backup yang valid. Penulisan panduan ini tidak menjalankan ekstraksi, konversi, atau impor ulang database.
