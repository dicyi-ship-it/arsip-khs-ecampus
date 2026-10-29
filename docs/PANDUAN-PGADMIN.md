# Panduan lengkap pemulihan backup eCampus melalui pgAdmin

Panduan ini menjelaskan alur **backup PostgreSQL → Restore ke database percobaan → periksa isi → Backup format Plain → impor SQL ke aplikasi transkrip**. Ini adalah prosedur untuk mengulang pemulihan; software dan langkah yang dipakai pada proses historis belum terkonfirmasi.

## 1. Tentukan tujuan dan file yang dipakai

Jika hanya membutuhkan SQL untuk aplikasi, konversi langsung memakai `pg_restore --file` pada [panduan ekstrak backup](PANDUAN-EKSTRAK-BACKUP.md#5-jika-backup-berupa-arsip-postgresql) lebih singkat. Alur pgAdmin berikut berguna jika Anda juga ingin melihat tabel dan menjalankan query pada PostgreSQL.

Gunakan salinan backup asli yang berisi data. File `.backup` di folder Documents yang ditemukan saat pemeriksaan berukuran **0 byte**, sehingga tidak dapat digunakan. Ukuran backup awal sebelum menjadi SQL 4,36 GB belum diketahui.

Siapkan folder, misalnya `D:\Pemulihan-eCampus`, untuk menyimpan backup asli dan SQL hasil ekspor. Pastikan ruang disk cukup untuk database PostgreSQL, SQL hasil ekspor, SQLite aplikasi, dan file sementara sekaligus. Ukuran database setelah restore tidak harus sama dengan ukuran SQL.

## 2. Kenali tiga password yang berbeda

| Password | Digunakan untuk | Sumber |
| --- | --- | --- |
| Master password/login pgAdmin, jika diminta | Membuka pgAdmin atau penyimpanan kredensialnya | Ditentukan saat menyiapkan pgAdmin |
| Password role PostgreSQL, misalnya `postgres` | Menyambungkan pgAdmin ke server database | Ditentukan saat instalasi/oleh administrator PostgreSQL |
| Password aplikasi arsip transkrip | Login di `http://localhost:1500/login` | Ditentukan saat akun aplikasi dibuat |

Ketiganya tidak otomatis sama. Tidak ada password bawaan yang dapat disimpulkan dari proyek ini. Username aplikasi `arsip-ecampus@i-tech.ac.id` bukan username koneksi PostgreSQL.

## 3. Instal PostgreSQL dan pgAdmin

1. Unduh installer melalui [halaman resmi PostgreSQL untuk Windows](https://www.postgresql.org/download/windows/).
2. Jalankan installer. Pilih komponen **PostgreSQL Server**, **pgAdmin 4**, dan **Command Line Tools** jika pilihan tersebut tersedia.
3. Tentukan direktori instalasi dan direktori data pada disk yang cukup longgar.
4. Saat diminta password role `postgres`, tentukan dan simpan password tersebut.
5. Catat port server. Contoh panduan ini memakai **5432**; jika sudah dipakai instalasi lain, gunakan port aktual instalasi Anda.
6. Selesaikan instalasi. Stack Builder tidak diperlukan untuk menjalankan importer proyek ini.
7. Tekan `Win + R`, ketik `services.msc`, lalu periksa layanan PostgreSQL instalasi Anda. Pastikan statusnya **Running** sebelum mencoba koneksi lokal.

Gunakan versi server dan tool yang kompatibel dengan backup. Restore ke versi server yang lebih lama dari asal dump dapat gagal karena perbedaan fitur. Jika versi asal diketahui, gunakan versi yang sesuai atau versi lebih baru yang kompatibel.

## 4. Buka pgAdmin dan daftarkan koneksi server

1. Buka **pgAdmin 4** dari Start Menu.
2. Jika server lokal sudah tercantum pada panel kiri, klik untuk terhubung dan masukkan password PostgreSQL. Jika belum ada, klik kanan **Servers → Register → Server…**.
3. Pada tab **General**, isi **Name** dengan `PostgreSQL Lokal - Pemulihan eCampus`. Ini hanya nama tampilan.
4. Pada tab **Connection**, gunakan contoh berikut untuk instalasi lokal:

   | Kolom | Isi contoh |
   | --- | --- |
   | Host name/address | `localhost` |
   | Port | `5432`, atau port instalasi Anda |
   | Maintenance database | `postgres` |
   | Username | `postgres`, atau role yang diberikan administrator |
   | Password | Password role PostgreSQL Anda |

5. Klik **Save**. Jika berhasil, node server dapat diperluas dan menampilkan **Databases**.

Jika PostgreSQL berada di komputer lain, host dan kebijakan koneksi mengikuti server tersebut; jangan memakai `localhost` untuk menunjuk komputer lain. Struktur dialog koneksi dijelaskan pada [Server Dialog resmi](https://www.pgadmin.org/docs/pgadmin4/latest/server_dialog.html).

## 5. Atur Binary paths

pgAdmin menggunakan tool PostgreSQL untuk proses backup dan restore. Menginstal pgAdmin saja belum menjamin lokasi tool sudah benar.

1. Buka **File → Preferences**. Pada layout yang memakai tombol pengaturan, buka **Settings/Preferences**.
2. Cari **Paths → Binary paths**.
3. Isi direktori tool PostgreSQL pada baris versi yang sesuai, misalnya `C:\Program Files\PostgreSQL\18\bin`. Angka `18` adalah contoh; gunakan versi yang terpasang.
4. Pilih direktori `bin`, bukan nama file `pg_restore.exe`.
5. Pastikan direktori berisi `pg_restore.exe`, `pg_dump.exe`, dan `psql.exe`. Simpan perubahan. Jika ada tombol validasi, jalankan untuk memeriksa lokasi.

Lihat [Preferences resmi pgAdmin](https://www.pgadmin.org/docs/pgadmin4/latest/preferences.html). Nama dan susunan tab dapat berbeda antarversi; gunakan fungsi pencarian Preferences bila perlu.

## 6. Buat database kosong khusus pemulihan

1. Perluas server lokal → klik kanan **Databases → Create → Database…**.
2. Isi nama **Database** dengan `ecampus_pemulihan_20261029`. Jika nama sudah dipakai, pilih nama baru.
3. Isi **Owner** dengan role lokal yang digunakan, misalnya `postgres`.
4. Biarkan pengaturan lain mengikuti kebutuhan instalasi. Jika restore mengeluhkan locale, encoding, atau template, periksa persyaratan dump sebelum mencoba ulang.
5. Klik **Save**, lalu pastikan database baru muncul di panel kiri.

Seluruh langkah selanjutnya ditujukan ke database percobaan ini. Sebelum menekan Restore atau menjalankan query, periksa nama database yang dipilih. Lihat [Database Dialog resmi](https://www.pgadmin.org/docs/pgadmin4/latest/database_dialog.html).

## 7. Restore file backup

### 7.1 Buka dialog dan pilih file

Klik kanan `ecampus_pemulihan_20261029` → **Restore…**. Pilih format sesuai arsip dan isi **Filename** dengan lokasi backup. Jika file tidak terlihat di pemilih file, periksa filter ekstensi. Pada pgAdmin Server Mode, lokasi file merujuk lingkungan tempat pgAdmin berjalan; file komputer pengguna mungkin perlu diunggah terlebih dahulu.

### 7.2 Pengaturan untuk database percobaan kosong

| Pengaturan | Pilihan |
| --- | --- |
| Format | Custom/tar untuk arsip tersebut; Directory untuk backup direktori |
| Number of jobs | `1` untuk percobaan awal |
| Pre-data, Data, Post-data | Sertakan ketiganya; hindari pembatasan bagian |
| Only data / Only schema | No |
| Do not save: Owner / Privileges / Tablespaces | Yes untuk pemulihan lokal ini |
| Include CREATE DATABASE statement | No; database tujuan sudah dibuat |
| Clean before restore | No |
| Exit on error / Verbose messages | Yes |

Pengaturan pengecualian owner/privileges/tablespaces menyesuaikan salinan lokal; ini tidak mempertahankan seluruh pengaturan akses server asal.

### 7.3 Jalankan dan baca log

Klik **Restore**, lalu buka **Processes** atau detail proses. Tunggu sampai selesai dan baca log, termasuk pesan error pertama. Berhasil membuat sebagian tabel tidak berarti pemulihan lengkap. Jika gagal, perbaiki penyebabnya lalu ulangi pada database kosong baru agar hasil parsial tidak tercampur.

Panduan opsi dan proses: [Restore Dialog resmi pgAdmin](https://www.pgadmin.org/docs/pgadmin4/latest/restore_dialog.html).

### 7.4 Jika sumber sudah berupa SQL teks

Pada versi yang menyediakan **Format: Plain**, Restore menjalankan pemulihan SQL melalui `psql`. Pada versi lain, gunakan `psql` langsung. Untuk SQL beberapa GB, hindari memuat seluruhnya ke editor Query Tool. Contoh PowerShell pada database percobaan baru:

```powershell
$psqlExe = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
& $psqlExe -h localhost -p 5432 -U postgres -d ecampus_pemulihan_20261029 -v ON_ERROR_STOP=1 -f 'D:\Pemulihan-eCampus\data_ecampus_lengkap.sql'
if ($LASTEXITCODE -ne 0) { throw 'Pemulihan SQL gagal. Periksa log.' }
```

Ganti versi, port, role, dan lokasi file sesuai kondisi. Jangan memasukkan password ke teks perintah. SQL yang memuat owner, role, extension, atau pengaturan khusus server asal mungkin memerlukan penyesuaian sebelum berhasil dipulihkan. Untuk kebutuhan aplikasi saja, SQL yang sudah sesuai format importer dapat langsung diimpor tanpa tahap PostgreSQL ini.

## 8. Periksa database melalui Query Tool

1. Klik kanan database hasil restore → **Refresh**.
2. Perluas **Schemas**. Cari schema `public`, `audit`, dan `new_audit` jika tersedia.
3. Klik kanan database → **Query Tool**. Pastikan koneksi editor menunjuk database percobaan.
4. Jalankan query daftar tabel berikut dengan tombol Execute atau `F5`:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema IN ('public', 'audit', 'new_audit')
ORDER BY table_schema, table_name;
```

5. Gunakan hasil tersebut untuk memeriksa tabel yang ada. Contoh berikut hanya dijalankan jika nama tabelnya memang tersedia:

```sql
SELECT COUNT(*) AS jumlah_mahasiswa_public FROM public.mahasiswa;
SELECT COUNT(*) AS jumlah_riwayat_mahasiswa FROM new_audit.mahasiswa__audit;
SELECT COUNT(*) AS jumlah_riwayat_nilai FROM new_audit.detailperkuliahan__audit;
```

Jalankan satu per satu agar tabel yang tidak tersedia tidak menghalangi pemeriksaan lain. `COUNT(*)` pada tabel besar dapat memerlukan waktu.

Untuk melihat contoh isi tanpa mengambil semua baris:

```sql
SELECT * FROM new_audit.mahasiswa__audit LIMIT 10;
```

Pada dump proyek ini, lima tabel akademik utama `public` tercatat kosong sehingga importer menggunakan riwayat audit. Jumlah baris tabel audit dapat lebih besar daripada jumlah data akhir karena satu ID memiliki beberapa revisi. Jangan menganggap angka tersebut sebagai jumlah mahasiswa unik atau jumlah nilai final.

## 9. Ekspor hasil restore menjadi SQL untuk aplikasi

1. Klik kanan **nama database**, lalu **Backup…**. Jangan memilih hanya satu tabel: importer memerlukan beberapa tabel akademik.
2. Isi **Filename**, misalnya `D:\Pemulihan-eCampus\data_ecampus_dari_pgadmin.sql`. Gunakan nama baru.
3. Pilih **Format: Plain**, dan **Encoding: UTF8**.
4. Sertakan struktur dan data. Jangan membatasi hanya satu schema; data proyek memerlukan `audit` dan `new_audit` selain pemeriksaan `public`.
5. Pastikan **Use INSERT commands** dan **Use Column INSERTS** adalah **No**. Tujuannya menghasilkan blok `COPY` sesuai importer.
6. Untuk ekspor kerja lokal ini, kecualikan **Owner**, **Privileges**, dan **Tablespaces**. Hindari opsi pembuat/penghapus database.
7. Klik **Backup**, tunggu status selesai, lalu periksa log.

Lihat [Backup Dialog resmi pgAdmin](https://www.pgadmin.org/docs/pgadmin4/latest/backup_dialog.html). Ekstensi `.sql` saja tidak mengubah format: pilihan **Plain** yang menentukan output teks. Ukuran output dapat berbeda dari SQL historis 4,36 GB karena versi tool, isi, dan pilihan ekspor.

## 10. Periksa SQL lalu impor ke aplikasi

Periksa ukuran dan beberapa baris awal tanpa membuka seluruh file:

```powershell
Get-Item -LiteralPath 'D:\Pemulihan-eCampus\data_ecampus_dari_pgadmin.sql' | Select-Object Name, Length
Get-Content -LiteralPath 'D:\Pemulihan-eCampus\data_ecampus_dari_pgadmin.sql' -TotalCount 30
```

Jika `rg` tersedia, periksa contoh blok data:

```powershell
rg -m 5 '^COPY (public|audit|new_audit)\.' 'D:\Pemulihan-eCampus\data_ecampus_dari_pgadmin.sql'
```

Setelah memastikan semua tabel yang diperlukan tercakup, ikuti [langkah backup dan persiapan impor](PANDUAN-EKSTRAK-BACKUP.md#7-impor-ke-sqlite-aplikasi). Hentikan aplikasi dan pindahkan database akademik lama hanya setelah dicadangkan. Importer menolak menimpa database yang sudah ada.

```powershell
Set-Location 'C:\Users\Administrator\Documents\Pengecekan Data Transkip'
node import.mjs 'D:\Pemulihan-eCampus\data_ecampus_dari_pgadmin.sql' --audit
if ($LASTEXITCODE -ne 0) { throw 'Impor gagal. Baca pesan kesalahan sebelum melanjutkan.' }
npm start
```

Mode `--audit` berlaku untuk kondisi dump proyek ini. Struktur dump lain perlu diperiksa dahulu. Setelah impor berhasil, buka http://localhost:1500/login sesuai konfigurasi workspace, login dengan akun aplikasi, lalu periksa pencarian mahasiswa, transkrip, dan Excel. Database akun `data/auth.sqlite` tetap terpisah dari pemulihan PostgreSQL.

## 11. Penanganan masalah

| Gejala | Pemeriksaan/tindakan |
| --- | --- |
| Connection refused | Periksa service PostgreSQL, host, dan port; membuka pgAdmin tidak otomatis menjalankan server database |
| Password authentication failed | Gunakan password role PostgreSQL, bukan password aplikasi atau master password pgAdmin |
| `pg_restore` / `pg_dump` tidak ditemukan | Perbaiki Binary paths ke direktori `bin` yang berisi tool |
| Unsupported version in file header | Tool terlalu lama untuk membaca arsip; periksa versi tool dan backup |
| Role does not exist / owner error | Untuk salinan lokal, periksa pengecualian Owner dan Privileges; jangan membuat role asal tanpa menilai kebutuhannya |
| Tablespace tidak tersedia | Periksa pengecualian Tablespaces untuk pemulihan lokal |
| Extension tidak tersedia | Periksa extension yang dibutuhkan dan kompatibilitas server; jangan menyatakan restore lengkap jika masih error |
| Relation already exists / duplicate key | Database mungkin berisi hasil percobaan sebelumnya; ulangi pada database kosong baru |
| Process failed tetapi tabel muncul | Hasil dapat parsial; baca error pertama dan periksa seluruh log |
| Tabel kosong | Periksa apakah Data disertakan, schema benar, dan sumber memang berisi data |
| File SQL berisi INSERT | Ekspor ulang dengan opsi INSERT nonaktif agar sesuai importer |
| File backup tidak terlihat | Periksa ekstensi/filter, lokasi file, dan apakah pgAdmin berjalan lokal atau di server lain |
| SQL hasil ekspor berbeda ukuran | Periksa isi, opsi, dan log; kesamaan ukuran bukan syarat keberhasilan |

## 12. Checklist selesai

- Backup sumber memiliki isi dan salinan asli tetap tersedia.
- Restore dilakukan pada database percobaan yang dipilih dengan benar.
- Status proses dan log diperiksa tanpa error yang belum diselesaikan.
- Tabel/schema sumber diperiksa sebelum menentukan mode impor.
- SQL diekspor sebagai Plain, UTF8, dengan data berbentuk COPY.
- Database aplikasi lama telah dicadangkan sebelum impor ulang.
- Pencarian, transkrip, dan ekspor diperiksa setelah aplikasi dijalankan.

Dokumen ini merupakan panduan; penulisannya tidak menginstal PostgreSQL, menjalankan Restore, atau mengubah database. Label menu mengikuti dokumentasi pgAdmin dan dapat berbeda menurut versi yang dipasang.
