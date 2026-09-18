import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export const DB_PATH = fileURLToPath(new URL('./data/ecampus.sqlite', import.meta.url));
export const CAMPUS = 'STTI NIIT ITECH';
// Verified in this dump: jurusan 167/168 -> fakultas 24 -> perguruan_tinggi 18.
// Jurusan 166 has no confirmed campus and must not be included by name alone.
export const CAMPUS_SCOPE = "m.jurusan IN ('167','168')";
// Only academic columns are copied; credentials and unrelated personal data are excluded.
export const columns = {
  mahasiswa: 'id nim nama tahunangkatan jurusan ipk sksk',
  jurusan: 'id nama kode',
  matakuliah: 'id kode nama sks',
  perkuliahan: 'id matakuliah tahun_ajaran semester',
  detailperkuliahan: 'id mahasiswa perkuliahan matakuliah_konversi semester tahunakademik nilai_huruf nilai_ip total_nilai persetujuan verify lulus nama ikuti_perkuliahan',
};
export function parseCourseLabel(label) {
  // Strict format observed in this dump. Keep unrecognized labels as raw evidence, never guess.
  const match=/^([^-\r\n]+)-([^\r\n]+)-(\d+(?:[.,]\d+)?)\s+sks$/i.exec(label?.trim() || '');
  if(!match || !match[1].trim() || !match[2].trim()) return [null,null,null];
  return [match[1].trim(),match[2].trim(),match[3].replace(',','.')];
}
export function openDb(path = DB_PATH) {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-16000; PRAGMA temp_store=FILE;');
  return db;
}
export const students = `SELECT m.id, m.nim, m.nama, m.tahunangkatan, j.nama AS prodi,
  m.ipk AS ipk_ecampus, m.sksk AS sks_ecampus, m.sumber, m.revisi, m.waktu_audit FROM mahasiswa m LEFT JOIN jurusan j ON j.id=m.jurusan`;
// Preserve the original view's precedence, then use the label on the same grade/revision.
const courseCode="COALESCE(NULLIF(k.kode,''),NULLIF(c.kode,''),a.kode_snapshot)";
const courseName="COALESCE(NULLIF(k.nama,''),NULLIF(c.nama,''),a.nama_snapshot)";
const courseSks="COALESCE(k.sks,c.sks,a.sks_snapshot)";
export const transcript = `SELECT a.mahasiswa AS id_mahasiswa, m.nim, m.nama, j.nama AS prodi, m.tahunangkatan,
  a.id AS id_nilai, a.semester, COALESCE(a.tahunakademik,p.tahun_ajaran) AS tahunakademik,
  ${courseCode} AS kode, ${courseName} AS matakuliah,
  ${courseSks} AS sks, a.nilai_huruf, a.total_nilai AS nilai_angka,
  a.nilai_ip AS bobot, CAST(${courseSks} AS REAL)*CAST(a.nilai_ip AS REAL) AS mutu,
  a.persetujuan, a.verify, a.lulus, a.sumber, a.revisi, a.waktu_audit,
  a.nama AS label_matakuliah, a.ikuti_perkuliahan,
  p.sumber AS sumber_perkuliahan,
  CASE WHEN NULLIF(k.nama,'') IS NOT NULL THEN k.sumber WHEN NULLIF(c.nama,'') IS NOT NULL THEN c.sumber
    WHEN a.nama_snapshot IS NOT NULL THEN 'detailperkuliahan.nama' END AS sumber_matakuliah,
  CASE WHEN m.id IS NULL THEN 'Referensi mahasiswa tidak ditemukan. ' ELSE '' END ||
  CASE WHEN ${courseName} IS NULL THEN 'Referensi mata kuliah tidak ditemukan'
    WHEN NULLIF(k.nama,'') IS NULL AND NULLIF(c.nama,'') IS NULL THEN 'Mata kuliah dari label riwayat nilai; perlu verifikasi' ELSE '' END AS catatan
  FROM detailperkuliahan a LEFT JOIN mahasiswa m ON a.mahasiswa=m.id
  LEFT JOIN jurusan j ON j.id=m.jurusan
  LEFT JOIN perkuliahan p ON p.id=a.perkuliahan
  LEFT JOIN matakuliah k ON k.id=p.matakuliah
  LEFT JOIN matakuliah c ON c.id=a.matakuliah_konversi`;

export function filters(params) {
  const where = [CAMPUS_SCOPE], values = [];
  const q = (params.get('q') || '').trim();
  if (q.length > 120) throw new Error('Pencarian maksimal 120 karakter.');
  if (q) {
    const escaped = q.replace(/[\\%_]/g, '\\$&');
    where.push("(m.nim LIKE ? ESCAPE '\\' OR m.nama LIKE ? ESCAPE '\\')");
    values.push(`${escaped}%`, `%${escaped}%`);
  }
  for (const [param, col] of [['angkatan','tahunangkatan'],['prodi','jurusan'],['id','id']]) {
    const value = params.get(param);
    if (value) {
      if (!/^\d{1,20}$/.test(value)) throw new Error(`Filter ${param} tidak valid.`);
      where.push(`m.${col}=?`); values.push(value);
    }
  }
  return { sql: where.length ? ' WHERE ' + where.join(' AND ') : '', values };
}

export function studentOrder(params) {
  const sort=params.get('sort') || 'nama', direction=params.get('direction') || 'asc';
  const fields={nama:'m.nama COLLATE NOCASE',nim:'m.nim COLLATE NOCASE',prodi:'j.nama COLLATE NOCASE',tahunangkatan:'CAST(m.tahunangkatan AS INTEGER)'};
  if(!Object.hasOwn(fields,sort)||!['asc','desc'].includes(direction)) throw new Error('Urutan tidak valid.');
  return ` ORDER BY ${fields[sort]} ${direction}, m.id ASC`;
}

export const transcriptOrder = ` ORDER BY m.id, (a.semester IS NULL OR a.semester=''), CAST(a.semester AS INTEGER), a.semester, COALESCE(a.tahunakademik,p.tahun_ajaran), ${courseCode}, a.id`;
