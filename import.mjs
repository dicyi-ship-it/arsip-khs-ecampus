import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { columns, DB_PATH, parseCourseLabel, transcript } from './data.mjs';

export function decode(value) {
  if (value === '\\N') return null;
  return value.replace(/\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|[\s\S])/g, (_, v) => {
    if (/^[0-7]/.test(v)) return String.fromCharCode(parseInt(v,8));
    if (v[0] === 'x' && v.length > 1) return String.fromCharCode(parseInt(v.slice(1),16));
    return ({ b:'\b', f:'\f', n:'\n', r:'\r', t:'\t', v:'\v' })[v] ?? v;
  });
}
export async function importDump(source, destination = DB_PATH, mode = 'public') {
  if (!['public','audit'].includes(mode)) throw new Error('Mode impor tidak valid.');
  const info = fs.statSync(source);
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  if (fs.existsSync(destination)) throw new Error('Database sudah tersedia. Tutup aplikasi dan pindahkan database lama sebelum mengimpor ulang.');
  const temporary = destination + '.importing';
  const lock = fs.openSync(temporary, 'wx'); fs.closeSync(lock);
  const db = new DatabaseSync(temporary);
  const counts = Object.fromEntries(Object.keys(columns).map(t => [t,0]));
  const found = new Set();
  const input = fs.createReadStream(source, {highWaterMark:1024*1024});
  const lines = readline.createInterface({input, crlfDelay:Infinity});
  let active = null, statement, indexes, width, total = 0, last = 0, lineNo = 0, schema, revIndex, typeIndex, dateIndex;
  try {
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA cache_size=-32000; PRAGMA temp_store=FILE;');
    for (const [table, list] of Object.entries(columns)) {
      db.exec(`CREATE TABLE ${table} (${list.split(' ').map(c => `${c} TEXT${c==='id'?' PRIMARY KEY':''}`).join(',')}, sumber TEXT, revisi INTEGER, revtype INTEGER, waktu_audit TEXT, prioritas INTEGER${table==='detailperkuliahan'?', kode_snapshot TEXT, nama_snapshot TEXT, sks_snapshot TEXT':''})`);
    }
    db.exec('BEGIN');
    for await (const line of lines) {
      lineNo++;
      if (Date.now()-last > 3000) { console.log(`${(input.bytesRead/info.size*100).toFixed(1)}% | ${total.toLocaleString('id-ID')} baris akademik`); last=Date.now(); }
      if (active !== null) {
        if (line === '\\.') { active=null; continue; }
        if (!active) continue;
        const fields = line.split('\t');
        if (fields.length !== width) throw new Error(`Jumlah kolom tidak sesuai: ${active}, baris ${lineNo}`);
        const revision = mode==='audit' ? Number(fields[revIndex]) : 0;
        const revtype = mode==='audit' ? Number(fields[typeIndex]) : 0;
        if (!Number.isSafeInteger(revision) || ![0,1,2].includes(revtype)) throw new Error(`Revisi tidak valid pada baris ${lineNo}`);
        const values=indexes.map(i => i<0?null:decode(fields[i]));
        const snapshot=active==='detailperkuliahan'?parseCourseLabel(values[columns[active].split(' ').indexOf('nama')]):[];
        statement.run(...values,schema,revision,revtype,dateIndex<0?null:decode(fields[dateIndex]),schema==='new_audit'?2:1,...snapshot);
        counts[active]++; total++;
        if (total % 10000 === 0) db.exec('COMMIT; BEGIN');
      } else if (line.startsWith('COPY ')) {
        const match = /^COPY (public|audit|new_audit)\.(\w+) \(([^)]+)\) FROM stdin;$/.exec(line);
        active = '';
        const table=match?.[2].replace(/__audit$/,'');
        if (match && Object.hasOwn(columns,table) && (mode==='public'?match[1]==='public':match[1]!=='public'&&match[2].endsWith('__audit'))) {
          active=table; schema=match[1];
          if (found.has(schema+'.'+active)) throw new Error(`COPY ganda: ${schema}.${active}`);
          found.add(schema+'.'+active);
          const sourceColumns=match[3].split(', '); width=sourceColumns.length;
          indexes=columns[active].split(' ').map(c => sourceColumns.indexOf(c));
          revIndex=sourceColumns.indexOf('rev');typeIndex=sourceColumns.indexOf('revtype');dateIndex=sourceColumns.indexOf('tanggal_dirubah');
          const required=columns[active].split(' ').filter(c=>!['ipk','sksk'].includes(c));
          if (required.some(c=>!sourceColumns.includes(c)) || (mode==='audit'&&(revIndex<0||typeIndex<0))) throw new Error(`Struktur tabel ${active} berbeda dari dump eCampus ini.`);
          const names=[...columns[active].split(' '),'sumber','revisi','revtype','waktu_audit','prioritas'];
          if(active==='detailperkuliahan')names.push('kode_snapshot','nama_snapshot','sks_snapshot');
          const upsert=mode==='audit'?` ON CONFLICT(id) DO UPDATE SET ${names.slice(1).map(c=>`${c}=excluded.${c}`).join(',')}
            WHERE excluded.prioritas > ${active}.prioritas OR (excluded.prioritas=${active}.prioritas AND excluded.revisi > ${active}.revisi)`:'';
          statement=db.prepare(`INSERT INTO ${active} VALUES (${names.map(()=>'?').join(',')})`+upsert);
        }
      }
    }
    if (active !== null) throw new Error('Dump terpotong: COPY belum selesai.');
    if (Object.keys(columns).some(t=>![...found].some(s=>s.endsWith('.'+t)))) throw new Error('Dump tidak memuat semua tabel akademik yang diperlukan.');
    const deleted={};
    for (const table of Object.keys(columns)) {
      deleted[table]=db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE revtype=2`).get().n;
      db.exec(`DELETE FROM ${table} WHERE revtype=2`);
    }
    db.exec(`COMMIT;
      CREATE INDEX mahasiswa_nim ON mahasiswa(nim COLLATE NOCASE);
      CREATE INDEX mahasiswa_filter ON mahasiswa(jurusan,tahunangkatan,id);
      CREATE INDEX nilai_mahasiswa ON detailperkuliahan(mahasiswa,semester,id);
      ANALYZE;`);
    db.exec('CREATE TABLE metadata (json TEXT NOT NULL)');
    const rows=Object.fromEntries(Object.keys(columns).map(t=>[t,db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
    const issues={
      nilai_tanpa_mahasiswa:db.prepare('SELECT COUNT(*) AS n FROM detailperkuliahan a LEFT JOIN mahasiswa m ON m.id=a.mahasiswa WHERE m.id IS NULL').get().n,
      nilai_tanpa_matakuliah:db.prepare(`SELECT COUNT(*) AS n FROM (${transcript}) WHERE matakuliah IS NULL`).get().n,
      nilai_dari_label:db.prepare(`SELECT COUNT(*) AS n FROM (${transcript}) WHERE sumber_matakuliah='detailperkuliahan.nama'`).get().n,
    };
    const warning=mode==='audit'?'PERLU VERIFIKASI — Rekonstruksi riwayat audit, bukan transkrip resmi. new_audit diprioritaskan jika ID sama; audit lama dipakai jika ID tidak ada di new_audit. Revisi terbesar per sumber dipilih; revisi penghapusan dikeluarkan. Data dan relasi dapat tidak lengkap.':rows.mahasiswa===0?'Tabel utama mahasiswa kosong. Impor audit atau gunakan dump berisi data.':'';
    db.prepare('INSERT INTO metadata VALUES (?)').run(JSON.stringify({source:path.basename(source),bytes:info.size,imported:new Date().toISOString(),mode,warning,counts:rows,rawCounts:counts,deleted,issues}));
    db.close();
    fs.renameSync(temporary,destination);
    console.log('Impor selesai:', JSON.stringify(rows), JSON.stringify(issues));
    return rows;
  } catch (error) {
    try { db.close(); } catch {}
    fs.rmSync(temporary,{force:true});
    throw error;
  } finally { lines.close(); input.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  importDump(process.argv.slice(2).find(a=>!a.startsWith('--')) || 'data_ecampus_lengkap.sql',DB_PATH,process.argv.includes('--audit')?'audit':'public').catch(e => {console.error(e.message); process.exitCode=1;});
}
