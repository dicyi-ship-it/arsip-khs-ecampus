export const transcriptColumns = [
  {key:'semester',label:'Semester',width:12},
  {key:'tahunakademik',label:'Tahun akademik',width:19},
  {key:'kode',label:'Kode MK',width:18},
  {key:'matakuliah',label:'Mata kuliah',width:44},
  {key:'sks',label:'SKS',width:9,numeric:true},
  {key:'nilai_huruf',label:'Huruf',width:9},
  {key:'nilai_angka',label:'Angka',width:11,numeric:true},
  {key:'bobot',label:'Bobot',width:10,numeric:true},
  {key:'catatan',label:'Catatan',width:48},
];
export function semesterKey(row){return JSON.stringify([row.semester??'',row.tahunakademik??'']);}
export function semesterTitle(row){return `Semester ${row.semester||'belum tercatat'} · Tahun akademik ${row.tahunakademik||'belum tercatat'}`;}

export function transcriptFilename(student){
  const name=`${student.nim || 'Tanpa NIM'} - ${student.nama || 'Tanpa nama'}`
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,180).replace(/[. ]+$/g,'');
  return name+'.xlsx';
}
