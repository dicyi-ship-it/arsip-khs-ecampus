import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync, backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readConfig} from './config.mjs';
import {transcript, CAMPUS_SCOPE, CAMPUS} from './data.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const directory=path.join(root,'backups');
fs.mkdirSync(directory,{recursive:true});
const folder=fs.mkdtempSync(path.join(directory,'itech-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'));
const filename=path.join(folder,'stti-niit-itech.sqlite');
const source=new DatabaseSync(readConfig().dbPath,{readOnly:true});
try {await backup(source,filename);} finally {source.close();}
const db=new DatabaseSync(filename);
const digest=sql=>{
  const hash=createHash('sha256');
  for(const row of db.prepare(sql).iterate())hash.update(JSON.stringify(row)+'\n');
  return hash.digest('hex');
};
try {
  const before=digest(`${transcript} WHERE ${CAMPUS_SCOPE} ORDER BY a.id`);
  const originalMeta=JSON.parse(db.prepare('SELECT json FROM metadata').get().json);
  db.exec(`PRAGMA secure_delete=ON; BEGIN IMMEDIATE;
    DELETE FROM mahasiswa WHERE jurusan IS NULL OR jurusan NOT IN ('167','168');
    DELETE FROM detailperkuliahan WHERE NOT EXISTS (SELECT 1 FROM mahasiswa m WHERE m.id=detailperkuliahan.mahasiswa);
    DELETE FROM jurusan WHERE id NOT IN ('167','168');
    DELETE FROM perkuliahan WHERE NOT EXISTS (SELECT 1 FROM detailperkuliahan a WHERE a.perkuliahan=perkuliahan.id OR a.ikuti_perkuliahan=perkuliahan.id);
    DELETE FROM matakuliah WHERE NOT EXISTS (SELECT 1 FROM perkuliahan p WHERE p.matakuliah=matakuliah.id)
      AND NOT EXISTS (SELECT 1 FROM detailperkuliahan a WHERE a.matakuliah_konversi=matakuliah.id);
    COMMIT; VACUUM; ANALYZE;`);
  const counts=Object.fromEntries(['mahasiswa','detailperkuliahan','jurusan','perkuliahan','matakuliah'].map(table=>[table,db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n]));
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Integritas backup gagal.');
  if(db.prepare("SELECT COUNT(*) n FROM mahasiswa WHERE jurusan IS NULL OR jurusan NOT IN ('167','168')").get().n)throw new Error('Mahasiswa luar cakupan ditemukan.');
  if(before!==digest(`${transcript} WHERE ${CAMPUS_SCOPE} ORDER BY a.id`))throw new Error('Isi transkrip berubah setelah pembatasan.');
  const issues={
    nilai_tanpa_matakuliah:db.prepare(`SELECT COUNT(*) n FROM (${transcript} WHERE ${CAMPUS_SCOPE}) WHERE matakuliah IS NULL`).get().n,
    nilai_dari_label:db.prepare(`SELECT COUNT(*) n FROM (${transcript} WHERE ${CAMPUS_SCOPE}) WHERE sumber_matakuliah='detailperkuliahan.nama'`).get().n,
  };
  const metadata={source:originalMeta.source,imported:originalMeta.imported,mode:originalMeta.mode,warning:originalMeta.warning,campus:CAMPUS,scope:{jurusan:['167','168']},backedUp:new Date().toISOString(),counts,issues};
  db.prepare('UPDATE metadata SET json=?').run(JSON.stringify(metadata));
  db.close();
  const sha256=createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({...metadata,file:path.basename(filename),bytes:fs.statSync(filename).size,sha256,verification:{integrity:'ok',transcriptUnchanged:true,transcriptSha256:before}},null,2)+'\n');
  fs.writeFileSync(path.join(folder,'COMPLETE.txt'),'Backup akademik khusus STTI NIIT ITECH selesai dan terverifikasi. Tidak menyertakan akun atau sesi login.\n');
  console.log(JSON.stringify({folder,counts,issues,sha256},null,2));
} catch(error) {
  try {db.close();} catch {}
  console.error('Backup belum lengkap: '+folder+'\n'+error.message);
  process.exitCode=1;
}
