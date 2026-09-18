import ExcelJS from 'exceljs';
import { setImmediate } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { openDb, filters, students, transcript, transcriptOrder, studentOrder, DB_PATH, CAMPUS } from './data.mjs';
import {transcriptColumns,semesterKey,semesterTitle} from './public/transcript.js';

export async function writeExcel(destination, params, dbPath = DB_PATH, sheetLimit = 1000000) {
  if(!Number.isInteger(sheetLimit)||sheetLimit<1||sheetLimit>1000000)throw new Error('Batas sheet tidak valid.');
  const db = openDb(dbPath);
  try {
    const meta = JSON.parse(db.prepare('SELECT json FROM metadata').get().json);
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({filename:destination,useStyles:true,useSharedStrings:false});
    const notes = workbook.addWorksheet('Informasi');
    notes.columns=[{width:22},{width:110}];
    for (const row of [
      ['Ekspor data akademik eCampus'], ['Sumber', meta.source], ['Diimpor',meta.imported],
      ['Kampus',CAMPUS], ['Cakupan','Hanya mahasiswa prodi ID 167 (Sistem Informasi) dan 168 (Teknik Informatika). Identitas kampus yang belum jelas dikecualikan.'],
      ['Mode',meta.mode || 'public'],
      ['Catatan',meta.warning || 'Data tabel utama'],
      ['Aturan','Seluruh riwayat nilai disertakan, termasuk pengulangan, kosong, dan belum disetujui.'],
      ['Tampilan','Sheet transkrip mengikuti tabel aplikasi: dikelompokkan per mahasiswa, semester numerik, lalu tahun akademik. Warna bergantian membedakan kelompok. Sheet Audit menyimpan seluruh kolom teknis.'],
      ['Mata kuliah','Jika referensi master hilang, kode, nama, dan SKS dibaca dari label pada revisi nilai yang sama. Label asli dan sumber disertakan; tetap perlu verifikasi.'],
      ['IPK','IPK pada daftar mahasiswa berasal dari kolom mahasiswa.ipk; bukan hasil hitung ulang.'],
      ['Filter',params.toString()], ['Dibuat',new Date().toISOString()],
    ]) notes.addRow(row).commit();
    notes.commit();
    const f = filters(params);
    const type = params.get('type') || 'transkrip';
    const query = type === 'mahasiswa' ? students : transcript;
    const headings = type === 'mahasiswa'
      ? ['id','nim','nama','tahunangkatan','prodi','ipk_ecampus','sks_ecampus','sumber','revisi','waktu_audit']
      : ['id_mahasiswa','nim','nama','prodi','tahunangkatan','id_nilai','semester','tahunakademik','kode','matakuliah','sks','nilai_huruf','nilai_angka','bobot','mutu','persetujuan','verify','lulus','sumber','revisi','waktu_audit','sumber_perkuliahan','sumber_matakuliah','label_matakuliah','ikuti_perkuliahan','catatan'];
    const numeric = new Set(['sks','nilai_angka','bobot','mutu','ipk_ecampus','sks_ecampus']);
    let sheet, display, count=0, part=0,displayPart=0,displayCount=0,displayRows=0,studentId=null,group=null,groupIndex=-1;
    const visibleColumns=type==='mahasiswa'?
      [{key:'nim',label:'NIM',width:20},{key:'nama',label:'Nama mahasiswa',width:38},{key:'prodi',label:'Program studi',width:28},{key:'tahunangkatan',label:'Angkatan',width:13}]:transcriptColumns;
    const fill=color=>({type:'pattern',pattern:'solid',fgColor:{argb:color}});
    function banner(text,color='FF123E57',ink='FFFFFFFF'){
      const n=++displayRows;display.mergeCells(n,1,n,visibleColumns.length);
      const row=display.getRow(n);row.getCell(1).value=text;row.fill=fill(color);row.font={name:'Calibri',size:11,bold:true,color:{argb:ink}};row.alignment={vertical:'middle',wrapText:true};row.height=32;row.commit();
    }
    function headers(){const row=display.addRow(visibleColumns.map(c=>c.label));displayRows++;row.fill=fill('FF123E57');row.font={bold:true,color:{argb:'FFFFFFFF'}};row.height=24;row.commit();}
    function newDisplay(){
      if(display)display.commit();
      display=workbook.addWorksheet(`${type}-${++displayPart}`,{views:[{state:'frozen',ySplit:type==='mahasiswa'?1:3}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}});
      display.columns=visibleColumns.map(c=>({key:c.key,width:c.width}));displayCount=0;displayRows=0;studentId=null;group=null;groupIndex=-1;
      if(type==='mahasiswa'){headers();display.autoFilter={from:'A1',to:'D1'};}
      else {banner('TRANSKRIP · '+CAMPUS);banner('PERLU VERIFIKASI · Riwayat nilai termasuk pengulangan; bukan transkrip resmi.','FFFFF3D6','FF76581D');display.addRow([]).commit();displayRows++;}
    }
    for (const row of db.prepare(query+f.sql+(type==='mahasiswa'?studentOrder(params):transcriptOrder)).iterate(...f.values)) {
      // Reserve space for student/semester headings before reaching Excel's physical row limit.
      if(!display||displayCount>=sheetLimit||displayRows>1048568)newDisplay();
      if(type!=='mahasiswa'){
        if(studentId!==row.id_mahasiswa){
          studentId=row.id_mahasiswa;group=null;groupIndex=-1;
          banner(`${row.nim??'—'} · ${row.nama??'—'}`);
          banner(`${row.prodi??'—'} · Angkatan ${row.tahunangkatan??'—'}`,'FFF2F6F8','FF536E7C');
        }
        if(group!==semesterKey(row)){group=semesterKey(row);groupIndex++;banner(semesterTitle(row),groupIndex%2?'FFE9EEFB':'FFE4F3EE',groupIndex%2?'FF405B96':'FF176B5E');headers();}
      }
      const displayRow=display.addRow(visibleColumns.map(c=>{
        const value=row[c.key];return c.numeric&&value!==null&&value!==''&&Number.isFinite(Number(value))?Number(value):value??'—';
      }));
      displayRow.fill=fill(type==='mahasiswa'?(count%2?'FFF5F9FA':'FFFFFFFF'):(groupIndex%2?'FFFAFBFF':'FFFBFEFC'));
      displayRow.font={name:'Calibri',size:11,color:{argb:'FF173849'}};
      displayRow.alignment={vertical:'middle',wrapText:true};displayRow.height=type==='mahasiswa'?30:46;
      displayRow.eachCell(cell=>{cell.border={bottom:{style:'hair',color:{argb:'FFDCE5EA'}}};});displayRow.commit();displayCount++;displayRows++;
      if (count % sheetLimit === 0) {
        if (sheet) sheet.commit();
        sheet=workbook.addWorksheet(`Audit-${++part}`,{views:[{state:'frozen',ySplit:1}]});
        sheet.columns=headings.map(key=>({header:key,key,width:key==='nama'||key==='matakuliah'||key==='catatan'?38:20}));
        sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
        sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF123E57'}};
        sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:headings.length}};
        sheet.getRow(1).commit();
      }
      const values=headings.map(key=> {
        const value=row[key];
        return numeric.has(key) && value!==null && value!=='' && Number.isFinite(Number(value)) ? Number(value) : value;
      });
      sheet.addRow(values).commit(); count++;
      if (count%250===0) await setImmediate();
    }
    if(!display){newDisplay();if(type!=='mahasiswa'){const s=params.get('id')?db.prepare(students+f.sql).get(...f.values):null;if(s)banner(`${s.nim} · ${s.nama}`);headers();}banner('Tidak ada data yang sesuai.','FFF2F6F8','FF536E7C');}
    display.commit();
    if (sheet) sheet.commit();
    await workbook.commit();
    return count;
  } finally { db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeExcel(process.argv[2],new URLSearchParams(process.argv[3] || ''), process.argv[4] || DB_PATH)
    .then(count=>console.log(`${count} baris diekspor`)).catch(e=>{console.error(e.message);process.exitCode=1;});
}
