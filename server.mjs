import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { transcriptFilename } from './public/transcript.js';
import { createAuth } from './auth.mjs';
import {readConfig,allowedHost} from './config.mjs';
import { openDb, filters, students, transcript, transcriptOrder, studentOrder, DB_PATH, CAMPUS, CAMPUS_SCOPE } from './data.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const config=readConfig();
const dbPath=config.dbPath;
const auth=createAuth(config.authPath,config.origins);
if(auth.needsSetup())console.log('Aktivasi super admin: buka /login dan gunakan kode dari '+auth.setupFile);
let db;
try {db=openDb(dbPath);} catch { console.error('Database belum tersedia. Jalankan npm run import terlebih dahulu.'); process.exit(1); }
const meta=JSON.parse(db.prepare('SELECT json FROM metadata').get().json);
const campusInfo={
  source:meta.source, imported:meta.imported, mode:meta.mode, warning:meta.warning, campus:CAMPUS,
  counts:{
    mahasiswa:db.prepare(`SELECT COUNT(*) AS n FROM mahasiswa m WHERE ${CAMPUS_SCOPE}`).get().n,
    detailperkuliahan:db.prepare(`SELECT COUNT(*) AS n FROM (${transcript} WHERE ${CAMPUS_SCOPE})`).get().n,
    jurusan:db.prepare("SELECT COUNT(*) AS n FROM jurusan WHERE id IN ('167','168')").get().n,
  },
  issues:{
    nilai_tanpa_matakuliah:db.prepare(`SELECT COUNT(*) AS n FROM (${transcript} WHERE ${CAMPUS_SCOPE}) WHERE matakuliah IS NULL`).get().n,
    nilai_dari_label:db.prepare(`SELECT COUNT(*) AS n FROM (${transcript} WHERE ${CAMPUS_SCOPE}) WHERE sumber_matakuliah='detailperkuliahan.nama'`).get().n,
  },
  prodi:db.prepare("SELECT j.id,j.nama,COUNT(m.id) AS jumlah FROM jurusan j LEFT JOIN mahasiswa m ON m.jurusan=j.id WHERE j.id IN ('167','168') GROUP BY j.id ORDER BY j.nama").all(),
  angkatan:db.prepare(`SELECT DISTINCT tahunangkatan FROM mahasiswa m WHERE ${CAMPUS_SCOPE} AND tahunangkatan IS NOT NULL ORDER BY tahunangkatan DESC`).all(),
};
let exporting=false;
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'");
  try {
    if (!allowedHost(req.headers.host,config.origins)) return json(res,403,{error:'Host tidak diizinkan.'});
    if(req.headers['sec-fetch-site']==='cross-site') return json(res,403,{error:'Akses lintas situs ditolak.'});
    const url=new URL(req.url,'http://localhost');
    if(await auth.handle(req,res,url,json))return;
    if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Metode tidak diizinkan.'});
    if(['/login','/login.js','/account.js','/style.css'].includes(url.pathname)&&req.method==='GET'){
      const file=url.pathname==='/login'?'login.html':url.pathname.slice(1);
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
      return res.end(fs.readFileSync(path.join(root,'public',file)));
    }
    const user=auth.session(req);
    if(!user){if(url.pathname==='/'){res.writeHead(302,{Location:'/login'});return res.end();}return json(res,401,{error:'Silakan login terlebih dahulu.'});}
    if(req.method!=='GET')return json(res,405,{error:'Metode tidak diizinkan.'});
    if(url.pathname==='/users'){
      if(user.role!=='superadmin')return json(res,403,{error:'Akses ditolak.'});
      res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync(path.join(root,'public','users.html')));
    }
    if(['/','/app.js','/transcript.js','/style.css'].includes(url.pathname)) {
      const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
      res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
      return res.end(fs.readFileSync(path.join(root,'public',file)));
    }
    if(url.pathname==='/api/info') return json(res,200,campusInfo);
    const f=filters(url.searchParams);
    if(url.pathname==='/api/mahasiswa') {
      const size=Number(url.searchParams.get('size')||25), requestedPage=Number(url.searchParams.get('page')||1);
      if(![25,50,100].includes(size)||!Number.isSafeInteger(requestedPage)||requestedPage<1) return json(res,400,{error:'Halaman tidak valid.'});
      const order=studentOrder(url.searchParams);
      const total=db.prepare('SELECT COUNT(*) AS n FROM mahasiswa m'+f.sql).get(...f.values).n;
      const pages=Math.max(1,Math.ceil(total/size)),page=Math.min(requestedPage,pages);
      // ponytail: OFFSET is sufficient for 2,290 campus students; use keyset pagination if the dataset grows substantially.
      const rows=db.prepare(students+f.sql+order+' LIMIT ? OFFSET ?').all(...f.values,size,(page-1)*size);
      return json(res,200,{rows,total,page,pages,size});
    }
    if(url.pathname==='/api/transkrip') {
      const id=url.searchParams.get('id');
      if(!id) return json(res,400,{error:'ID mahasiswa diperlukan.'});
      const student=db.prepare(students+f.sql).get(...f.values);
      if(!student) return json(res,404,{error:'Mahasiswa tidak ditemukan.'});
      return json(res,200,{student,rows:db.prepare(transcript+f.sql+transcriptOrder).all(...f.values)});
    }
    if(url.pathname==='/download') {
      if(!['transkrip','mahasiswa'].includes(url.searchParams.get('type')||'transkrip')) return json(res,400,{error:'Jenis ekspor tidak valid.'});
      let downloadName='stti-niit-itech-'+(url.searchParams.get('type')||'transkrip')+'.xlsx';
      if(url.searchParams.get('id')){
        const student=db.prepare(students+f.sql).get(...f.values);
        if(!student)return json(res,404,{error:'Mahasiswa tidak ditemukan.'});
        downloadName=transcriptFilename(student);
      }
      if(exporting) return json(res,409,{error:'Ekspor lain sedang diproses. Coba lagi setelah selesai.'});
      // ponytail: one export at a time for this local app; use a job queue for multiple operators.
      exporting=true;
      const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ecampus-'));
      const filename=path.join(directory,'transkrip.xlsx');
      const worker=spawn(process.execPath,[path.join(root,'export.mjs'),filename,url.searchParams.toString(),dbPath],{windowsHide:true,stdio:['ignore','ignore','pipe']});
      let error=''; worker.stderr.on('data',chunk=>{error=(error+chunk).slice(-2000);});
      const cancel=()=>{if(!res.writableEnded)worker.kill();};res.once('close',cancel);
      try {
        await new Promise((resolve,reject)=>{worker.once('error',reject);worker.once('exit',code=>code===0?resolve():reject(new Error(error||'Ekspor dibatalkan.')));});
        if(res.destroyed) return;
        const encodedName=encodeURIComponent(downloadName).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
        res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${downloadName.replace(/[^\x20-\x7e]/g,'_')}"; filename*=UTF-8''${encodedName}`,'Content-Length':fs.statSync(filename).size});
        await pipeline(fs.createReadStream(filename),res);
      } finally {res.off('close',cancel);exporting=false;fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
      return;
    }
    json(res,404,{error:'Halaman tidak ditemukan.'});
  } catch(error) {console.error(error.message);if(!res.headersSent&&!res.destroyed)json(res,error.status||400,{error:error.status?error.message:'Permintaan gagal. Periksa filter atau log aplikasi.'});else res.destroy();}
});
server.listen(config.port,config.host,()=>console.log(`Aplikasi: ${config.origins[0]||'http://localhost:'+server.address().port}`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
