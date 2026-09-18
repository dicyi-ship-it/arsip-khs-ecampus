# Audit ulang mata kuliah STTI NIIT ITECH

## Temuan

Importer sebelumnya hanya membawa relasi `perkuliahan` dan `matakuliah_konversi`. Ternyata `detailperkuliahan.nama` menyimpan label lengkap mata kuliah, misalnya `03MKK004-MATEMATIKA DISKRIT-3 sks`. Kolom ini belum diimpor sehingga nama ditampilkan kosong ketika tabel relasi tidak tersedia.

Hasil pemeriksaan seluruh 68.456 revisi nilai ITECH yang dipilih:

| Sumber identitas mata kuliah | Jumlah baris |
| --- | ---: |
| Referensi master yang sudah tersedia | 22.067 |
| Dipulihkan dari label pada revisi nilai yang sama | 46.317 |
| Belum dapat diidentifikasi | 72 |
| Total | 68.456 |

Ada 68.384 label terstruktur dan semuanya dapat diurai. Pada baris yang juga memiliki referensi master konversi, kode dalam label tidak berbeda dari kode master. Ini pemeriksaan kode, bukan pengesahan transkrip resmi atau kelengkapan seluruh riwayat.

## Perbaikan

- Importer menyimpan `nama` asli dan `ikuti_perkuliahan`, serta hasil uraian kode, nama, dan SKS dari label.
- Label hanya dipakai sebagai sumber pengganti ketika kolom master tidak tersedia; prioritas perkuliahan dan konversi dipertahankan.
- Format yang tidak sesuai tidak ditebak. Sumber pemulihan, label asli, revisi, dan catatan perlu verifikasi tersedia di Excel dan API.
- Jumlah mahasiswa, seluruh nilai, semester, persetujuan, dan revisi dibandingkan dengan database sebelumnya: tidak berubah.
- Database sebelumnya disimpan sebagai `data/ecampus-sebelum-audit-matakuliah.sqlite`.

## Mengapa masih ada 72 baris kosong?

Baris tersebut tidak mempunyai `nama`, `perkuliahan`, maupun `matakuliah_konversi`. Ada `ikuti_perkuliahan`, tetapi targetnya tidak tersedia pada tabel perkuliahan yang berhasil direkonstruksi. Tidak dilakukan pencocokan berdasarkan kemiripan nama, semester, atau nilai.

`new_audit.perkuliahan__audit` serta tabel akademik utama `public` kosong. Referensi dari audit perkuliahan lama juga tidak cocok dengan kelas ITECH yang diperiksa. Data impor EPSBED (`TBKMK`, `TRNLM`, `TRNLP`) yang terisi menggunakan kode kampus `031011`, berbeda dari kode NIIT `033175`, sehingga tidak digunakan untuk mengisi mata kuliah ITECH.

Untuk melengkapi 72 baris tersebut diperlukan data kelas/perkuliahan yang sesuai atau transkrip pembanding. Angka 72 adalah baris nilai, bukan jumlah mahasiswa.

## Validasi

`npm test` mencakup label normal, nama berisi tanda hubung, SKS desimal/nol, label rusak, prioritas master, pergantian revisi, hasil Excel, dan API. Impor ulang dump asli menghasilkan 68.384 nama mata kuliah dari 68.456 baris ITECH. Hasil pemulihan tetap merupakan data audit yang perlu diverifikasi.
