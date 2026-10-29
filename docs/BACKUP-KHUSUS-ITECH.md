# Backup database khusus STTI NIIT ITECH

Jalankan dari folder proyek:

```powershell
node --env-file-if-exists=.env backup-itech.mjs
```

Script membaca database akademik dari `ECAMPUS_DB` pada `.env`, membuat snapshot dengan SQLite Backup API, lalu membatasi salinannya. Database sumber tidak diubah.

Hasil berada di folder unik `backups/itech-.../`:

- `stti-niit-itech.sqlite`: database akademik yang dapat digunakan aplikasi.
- `manifest.json`: waktu backup, jumlah data, SHA-256 file, dan hasil pemeriksaan.
- `COMPLETE.txt`: penanda bahwa backup telah selesai dan lolos pemeriksaan.

Mahasiswa dibatasi ke jurusan ID `167` dan `168`, sesuai pemetaan kampus yang digunakan aplikasi. Nilai hanya untuk mahasiswa tersebut; referensi jurusan, perkuliahan, dan mata kuliah dibatasi ke cakupan yang diperlukan. Referensi yang memang hilang pada sumber tetap dibiarkan hilang.

Script memeriksa integritas SQLite dan membandingkan hash seluruh hasil query transkrip sebelum/sesudah pembatasan. Kolom audit dan label mata kuliah dipertahankan. Halaman kosong SQLite dibersihkan menggunakan VACUUM setelah penghapusan agar data luar cakupan tidak tersisa di halaman bebas backup.

Backup ini tidak menyertakan `auth.sqlite`, password, sesi, atau `.env`. Untuk backup lengkap akun dan akademik lokal, gunakan `npm run backup` seperti biasa.

## Pemulihan

1. Pilih folder backup dengan `COMPLETE.txt`. Cocokkan hash SHA-256 file dengan nilai pada manifest menggunakan `Get-FileHash -Algorithm SHA256`.
2. Hentikan aplikasi dan pastikan tidak ada ekspor berjalan.
3. Cadangkan database akademik dan konfigurasi saat ini.
4. Salin `stti-niit-itech.sqlite` sebagai `data/ecampus.sqlite`, atau ke lokasi `ECAMPUS_DB` yang digunakan aplikasi. Jangan menimpa file tanpa mencadangkan database lama.
5. Pertahankan `data/auth.sqlite` agar akun yang ada tetap tersedia. Instalasi tanpa database akun memerlukan aktivasi super admin baru.
6. Jalankan `npm start`; periksa pencarian, transkrip, dan Excel.

## Penyimpanan di GitHub

Database berisi nama, NIM, dan nilai mahasiswa. Folder `backups` tetap diabaikan Git. Unggah data akademik hanya ke repository private dengan akses yang sesuai; dokumentasi dan script dapat disimpan di repository kode. Publikasi script ini tidak otomatis mengunggah database.
