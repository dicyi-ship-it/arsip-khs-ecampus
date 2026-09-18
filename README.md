# Aplikasi data transkrip eCampus

Aplikasi dan seluruh unduhan sekarang khusus **STTI NIIT ITECH**: **2.290 mahasiswa** (733 Sistem Informasi dan 1.557 Teknik Informatika), **68.456 riwayat nilai**, dan **2 prodi**. Setelah audit ulang, **68.384 baris memiliki nama mata kuliah**, termasuk **46.317 baris yang dipulihkan dari label riwayat nilai**. Tersisa **72 baris tanpa nama mata kuliah**. Lihat [hasil audit mata kuliah](AUDIT-MATAKULIAH.md).

Pembatasan berlaku di server dan eksportir, termasuk akses langsung menggunakan ID mahasiswa. Dasarnya adalah prodi ID **167/168 → fakultas 24 (Sekolah Tinggi Teknologi Informasi NIIT, kode 033175) → perguruan tinggi 18** pada dump ini. Prodi ID 166 yang juga bernama Sistem Informasi tidak disertakan karena kampusnya belum teridentifikasi. Jika memakai dump kampus lain, pemetaan ID dalam `data.mjs` harus diverifikasi kembali.

Excel terbaru: `exports/stti-niit-itech-mahasiswa.xlsx` dan `exports/stti-niit-itech-transkrip.xlsx`. File ekspor lama dengan nama `seluruh-transkrip-perlu-verifikasi.xlsx` dan `daftar-mahasiswa-perlu-verifikasi.xlsx` masih merupakan hasil gabungan sebelum pembatasan kampus.

Aplikasi lokal Node.js 24+, SQLite bawaan Node.js, dan ExcelJS. Data dibaca dari dump PostgreSQL secara streaming; tidak perlu menginstal PostgreSQL atau memuat dump 4 GB ke RAM. File SQL asli tidak diubah.

## Menjalankan

Untuk Windows Server intranet, gunakan paket pada folder `release` dan ikuti [DEPLOY-WINDOWS.md](DEPLOY-WINDOWS.md). Paket mencakup database akademik dan dependensi. `npm run package` membangun ZIP baru; `npm run backup` membuat backup database akademik dan akun.

### Login dan super admin

1. Jalankan aplikasi lalu buka http://localhost:3000/login.
2. Pada penggunaan pertama, buka file lokal `data/setup-token.txt`. Salin kode tersebut ke formulir aktivasi, lalu buat username dan password super admin (minimal 12 karakter). Tidak ada password bawaan.
3. Setelah aktivasi, kode dihapus dan halaman kembali ke login. Masuk menggunakan akun yang baru dibuat.
4. Klik **Kelola pengguna** untuk menambahkan username, nama, dan password pengguna biasa. Pengguna dapat melihat seluruh arsip ITECH dan mengunduh Excel; hanya super admin dapat menambahkan akun. Belum ada pembatasan per mahasiswa.
5. Klik **Logout** untuk mengakhiri sesi. Sesi juga berakhir setelah delapan jam.

Password disimpan menggunakan scrypt dan salt acak. Sesi menggunakan cookie HttpOnly/SameSite serta token CSRF untuk perubahan data. Percobaan login dibatasi 10 kali per alamat dalam 15 menit. Akun dan sesi disimpan terpisah di `data/auth.sqlite`, sehingga tidak ikut terganti ketika database akademik diimpor ulang. Jangan mengunggah folder `data`, kode aktivasi, dump SQL, atau Excel ke GitHub.

Aplikasi secara default lokal (`127.0.0.1`). Untuk intranet, konfigurasi `HOST`, `PORT`, dan `PUBLIC_ORIGINS` melalui `.env`; lihat panduan deployment untuk HTTPS dan `COOKIE_SECURE=1`. [Referensi keamanan sesi OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) dan [Node.js crypto](https://nodejs.org/api/crypto.html).

Klik dua kali **Jalankan.bat**, lalu buka http://localhost:3000. Atau jalankan:

```powershell
npm start
```

Dependensi dan database hasil rekonstruksi sudah disiapkan dalam workspace ini. Untuk instalasi baru: `npm install`, lalu impor seperti di bawah.

## Penggunaan

- Cari nama atau awalan NIM secara otomatis saat mengetik (jeda 220 ms). Pilih kategori prodi dan angkatan untuk langsung menyaring hasil. Klik judul kolom untuk mengurutkan naik/turun; tersedia pilihan 25, 50, atau 100 baris per halaman.
- **Lihat transkrip** menampilkan semua riwayat nilai mahasiswa.
- **Excel mahasiswa ini** mengunduh transkrip satu mahasiswa.
- Tabel dan Excel transkrip memiliki sembilan kolom yang sama, dikelompokkan berdasarkan semester secara numerik lalu tahun akademik. Judul dan warna bergantian membedakan kelompok; semester yang belum tercatat ditempatkan di akhir. Excel seluruh transkrip juga memisahkan identitas setiap mahasiswa.
- Sheet **Audit** tetap memuat kolom sumber, revisi, label asli, dan data teknis lengkap. Sheet utama **mahasiswa** mengikuti empat kolom daftar mahasiswa di aplikasi; kolom aksi tidak diekspor.
- **Excel seluruh transkrip ITECH** mengunduh seluruh riwayat nilai mahasiswa ITECH. Nilai tanpa referensi mahasiswa dikecualikan karena kampusnya tidak dapat dipastikan.
- **Excel hasil pencarian** mengekspor seluruh mahasiswa sesuai filter dan urutan aktif, bukan hanya halaman yang sedang terlihat.
- Gunakan Chrome/Edge untuk menyimpan unduhan langsung ke disk. Browser lain menampung file Excel di memori sebelum diunduh.

## Sumber data dan batas rekonstruksi

Dump `data_ecampus_lengkap.sql` berukuran 4.366.090.308 byte. Lima tabel akademik utama di schema `public` kosong. Atas pilihan pengguna, aplikasi memakai rekonstruksi audit dengan label **PERLU VERIFIKASI**.

Hasil impor mentah sebelum pembatasan kampus: **3.767 mahasiswa**, **83.251 riwayat nilai**, **18 jurusan**, **2.497 mata kuliah**, dan **469 perkuliahan**. Ada **49.782 nilai tanpa referensi mata kuliah** serta **25 nilai tanpa referensi mahasiswa**. Angka ini mencakup kampus lain; aplikasi dan ekspor hanya menampilkan bagian ITECH sebagaimana dijelaskan di atas. Database impor tetap disimpan utuh.

Aturan rekonstruksi:

1. Pilih revisi numerik terbesar per ID dalam setiap sumber audit.
2. Jika ID terdapat pada kedua sumber, prioritaskan `new_audit`; gunakan `audit` untuk ID yang tidak terdapat pada `new_audit`. Ini asumsi rekonstruksi berdasarkan periode data yang diamati: audit lama 2019, audit baru 2020–2026. Bukan bukti bahwa seluruh riwayat lengkap. Nomor revisi lintas schema tidak dibandingkan.
3. Revisi terakhir dengan `revtype=2` dianggap penghapusan dan dikeluarkan; tidak dihidupkan kembali dari audit lama.
4. Sumber, revisi, dan waktu audit disertakan dalam hasil. Tabel `revinfo` kosong; waktu audit adalah `tanggal_dirubah`, bukan waktu commit revisi.
5. `new_audit.perkuliahan__audit` kosong. Referensi perkuliahan yang tersedia hanya berasal dari audit lama; referensi yang hilang tidak ditebak.

Penggabungan mata kuliah mengikuti prioritas view `epsbed.v_nilai_mahasiswa` dalam dump: mata kuliah perkuliahan lebih dahulu, kemudian mata kuliah konversi. Jika referensi tidak tersedia, aplikasi membaca kode, nama, dan SKS dari `detailperkuliahan.nama` pada revisi nilai yang sama, dengan format ketat `KODE-NAMA-SKS sks`. Label asli dan sumber pemulihan disertakan dalam Excel. Label yang tidak dikenali tidak ditebak. Nilai kosong tetap kosong; semua pengulangan, status persetujuan, dan status verifikasi dipertahankan. Tidak memilih nilai terbaik atau menghitung IPK resmi karena aturan akademik belum tersedia. IPK yang ditampilkan hanya kolom `mahasiswa.ipk` jika tersedia. Hasil perlu dicocokkan dengan database utama atau transkrip resmi.

## Impor ulang

Tutup aplikasi. Pindahkan `data/ecampus.sqlite` ke nama cadangan terlebih dahulu; importer menolak menimpa database yang sudah ada.

```powershell
# Rekonstruksi audit dari dump ini
node import.mjs data_ecampus_lengkap.sql --audit

# Untuk dump lain yang tabel public-nya berisi data
node import.mjs "D:\backup\ecampus.sql"
```

Importer hanya mengambil lima tabel akademik dan kolom yang dipakai aplikasi, tidak mengeksekusi SQL dump. Format yang didukung adalah `COPY ... FROM stdin` teks PostgreSQL seperti dump ini. Impor memakai transaksi per 10.000 baris dan file sementara; hanya hasil lengkap dipindahkan menjadi database aplikasi. Jika proses dimatikan paksa, hapus file `.importing` milik proses yang sudah berhenti sebelum mencoba lagi.

Ekspor dibuat oleh proses terpisah, satu ekspor pada satu waktu, dan ditulis ke file sementara sebelum diunduh. Sheet dipecah setelah satu juta baris. Siapkan ruang disk untuk database dan file Excel sementara. Aplikasi hanya mendengarkan `127.0.0.1`; gunakan secara lokal, tidak untuk server publik tanpa autentikasi.

## Pemeriksaan

```powershell
npm test
```

Uji menggunakan data sintetis: parsing COPY, nilai NULL/escape, mata kuliah konversi, referensi hilang, urutan revisi dan penghapusan audit, keamanan parameter, NIM dengan nol awal, teks mirip formula Excel, pemecahan sheet, API dan unduhan.

Referensi implementasi: [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [PostgreSQL COPY](https://www.postgresql.org/docs/16/sql-copy.html), [ExcelJS](https://github.com/exceljs/exceljs), [arti revtype pada Hibernate Envers](https://docs.hibernate.org/orm/5.2/userguide/html_single/chapters/envers/Envers.html).
