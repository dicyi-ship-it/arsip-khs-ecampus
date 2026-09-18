import {transcriptColumns,semesterKey,semesterTitle,transcriptFilename} from './transcript.js';
import './account.js';
const $=id=>document.getElementById(id);
let query=new URLSearchParams(), page=1, pages=1, selected=null, loading=false;
let sort='nama', direction='asc', searchTimer, searchController, searchVersion=0, detailController;
const number=value=>value.toLocaleString('id-ID');
const status=message=>{$('status').textContent=message;};
async function api(url,signal){const response=await fetch(url,{signal});if(response.status===401)location.replace('/login');const body=await response.json();if(!response.ok)throw new Error(body.error);return body;}
function cell(row,value){const td=document.createElement('td');td.textContent=value??'—';row.append(td);return td;}
function empty(body,text,span){body.replaceChildren();const row=document.createElement('tr');const td=cell(row,text);td.colSpan=span;td.className='empty';body.append(row);}
function searchParams(){const params=new URLSearchParams(new FormData($('search')));params.set('sort',sort);params.set('direction',direction);return params;}
function pagination(){for(const id of ['first','prev'])$(id).disabled=loading||page<=1;for(const id of ['next','last'])$(id).disabled=loading||page>=pages;}
function highlight(td,value,term){
  const text=String(value??'—');const start=term?text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()):-1;
  if(start<0)return;
  const mark=document.createElement('mark');mark.textContent=text.slice(start,start+term.length);
  td.replaceChildren(document.createTextNode(text.slice(0,start)),mark,document.createTextNode(text.slice(start+term.length)));
}
function queueSearch(delay=0,resetPage=true){
  clearTimeout(searchTimer);searchController?.abort();searchVersion++;
  if(resetPage)page=1;
  query=searchParams();loading=true;pagination();
  $('studentTable').setAttribute('aria-busy','true');$('students').inert=true;
  $('searchState').textContent='Mencari…';
  searchTimer=setTimeout(()=>load(searchVersion),delay);
}
async function load(version){
  const controller=new AbortController();searchController=controller;
  try{
    const params=new URLSearchParams(query);params.set('page',page);
    const data=await api('/api/mahasiswa?'+params,controller.signal);
    if(version!==searchVersion)return;
    page=data.page;pages=data.pages;
    const fragment=document.createDocumentFragment(),term=(query.get('q')||'').trim();
    for(const s of data.rows){
      const row=document.createElement('tr');
      for(const key of ['nim','nama','prodi','tahunangkatan']){
        const td=cell(row,s[key]);
        if(key==='nim'||key==='nama')highlight(td,s[key],term);
        if(key==='prodi'){const badge=document.createElement('span');badge.className='prodi-badge'+(s.prodi==='Teknik Informatika'?' technical':'');badge.textContent=s.prodi??'—';td.replaceChildren(badge);}
      }
      const action=cell(row,'');const button=document.createElement('button');button.textContent='Lihat transkrip →';button.onclick=()=>showStudent(s.id);action.append(button);fragment.append(row);
    }
    $('students').replaceChildren(fragment);
    if(!data.rows.length)empty($('students'),'Tidak ada mahasiswa yang sesuai dengan pencarian.',5);
    $('resultCount').textContent=number(data.total);
    $('pageLabel').textContent=data.total?`${number((page-1)*data.size+1)}–${number((page-1)*data.size+data.rows.length)} dari ${number(data.total)} mahasiswa`:'Tidak ada hasil';
    $('pageNumber').textContent=`${page} / ${pages}`;
    $('searchState').textContent=`${number(data.total)} mahasiswa ditemukan`;
  }catch(e){if(e.name!=='AbortError'&&version===searchVersion){empty($('students'),'Pencarian gagal. Ketik ulang atau reset filter untuk mencoba lagi.',5);$('searchState').textContent=e.message;$('resultCount').textContent='—';$('pageLabel').textContent='Gagal memuat hasil';page=pages=1;}}
  finally{if(version===searchVersion){loading=false;pagination();$('studentTable').setAttribute('aria-busy','false');$('students').inert=false;}}
}
async function showStudent(id){
  detailController?.abort();const controller=new AbortController();detailController=controller;
  try{
    const {student:s,rows}=await api('/api/transkrip?id='+encodeURIComponent(id),controller.signal);selected=s;
    $('studentName').textContent=s.nama;$('studentInfo').textContent=`${s.nim} · ${s.prodi??'Prodi tidak ditemukan'} · Angkatan ${s.tahunangkatan??'—'} · ${rows.length} riwayat nilai · IPK tersimpan: ${s.ipk_ecampus??'tidak tersedia'}`;
    $('grades').replaceChildren();let group=null,groupIndex=-1;
    for(const g of rows){
      const key=semesterKey(g);
      if(key!==group){group=key;groupIndex++;const heading=document.createElement('tr');heading.className='semester-heading '+(groupIndex%2?'semester-alternate':'');const th=document.createElement('th');th.colSpan=transcriptColumns.length;th.scope='colgroup';th.textContent=semesterTitle(g);heading.append(th);$('grades').append(heading);}
      const row=document.createElement('tr');row.className='grade-row '+(groupIndex%2?'semester-alternate':'');
      for(const column of transcriptColumns)cell(row,g[column.key]);$('grades').append(row);
    }
    if(!rows.length)empty($('grades'),'Tidak ada riwayat nilai untuk mahasiswa ini dalam sumber data.',9);
    $('detail').hidden=false;$('detail').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }catch(e){if(e.name!=='AbortError')status(e.message);}
}
async function download(params,button,filename=`stti-niit-itech-${params.get('type')||'transkrip'}.xlsx`){
  const buttons=['exportAll','exportStudents','exportOne'].map($);buttons.forEach(b=>b.disabled=true);
  const original=button.textContent;button.textContent='Menyiapkan Excel…';status('Excel sedang disiapkan. Tunggu sampai unduhan selesai.');
  let file;
  try{
    if(window.showSaveFilePicker)file=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});
    const response=await fetch('/download?'+params);
    if(response.status===401)location.replace('/login');
    if(!response.ok){const body=await response.json();throw new Error(body.error);}
    if(file){await response.body.pipeTo(await file.createWritable());}
    else {
      // ponytail: legacy browsers buffer the XLSX; use Chrome/Edge for streaming to disk.
      const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    status('Excel selesai disiapkan. Periksa unduhan browser.');
  }catch(e){status(e.name==='AbortError'?'Unduhan dibatalkan.':e.message);}finally{buttons.forEach(b=>b.disabled=false);button.textContent=original;}
}
function syncControls(){
  for(const button of document.querySelectorAll('[data-prodi]'))button.setAttribute('aria-pressed',String(button.dataset.prodi===$('search').elements.prodi.value));
  for(const button of document.querySelectorAll('[data-sort]')){const active=button.dataset.sort===sort;button.parentElement.setAttribute('aria-sort',active?(direction==='asc'?'ascending':'descending'):'none');button.querySelector('span').textContent=active?(direction==='asc'?'↑':'↓'):'↕';}
}
$('search').onsubmit=e=>{e.preventDefault();queueSearch();};
$('search').elements.q.oninput=e=>{if(!e.isComposing)queueSearch(220);};
$('search').elements.q.oncompositionstart=()=>{clearTimeout(searchTimer);searchController?.abort();searchVersion++;};
$('search').elements.q.oncompositionend=()=>queueSearch(220);
$('search').onchange=e=>{if(e.target.tagName==='SELECT')queueSearch();};
$('search').onreset=()=>queueMicrotask(()=>{$('search').elements.prodi.value='';sort='nama';direction='asc';syncControls();queueSearch();});
$('categories').onclick=e=>{const button=e.target.closest('[data-prodi]');if(button){$('search').elements.prodi.value=button.dataset.prodi;syncControls();queueSearch();}};
for(const button of document.querySelectorAll('[data-sort]'))button.onclick=()=>{direction=sort===button.dataset.sort&&direction==='asc'?'desc':'asc';sort=button.dataset.sort;syncControls();queueSearch();};
$('next').onclick=()=>{if(page<pages&&!loading){page++;queueSearch(0,false);}};
$('prev').onclick=()=>{if(page>1&&!loading){page--;queueSearch(0,false);}};
$('first').onclick=()=>{page=1;queueSearch(0,false);};
$('last').onclick=()=>{page=pages;queueSearch(0,false);};
$('closeDetail').onclick=()=>{detailController?.abort();$('detail').hidden=true;};
$('exportAll').onclick=()=>download(new URLSearchParams({type:'transkrip'}),$('exportAll'));
$('exportStudents').onclick=()=>{const p=searchParams();p.set('type','mahasiswa');download(p,$('exportStudents'));};
$('exportOne').onclick=()=>{if(selected)download(new URLSearchParams({type:'transkrip',id:selected.id}),$('exportOne'),transcriptFilename(selected));};
async function init(){try{
  const info=await api('/api/info');
  for(const [id,key] of [['studentCount','mahasiswa'],['gradeCount','detailperkuliahan'],['programCount','jurusan']])$(id).textContent=info.counts[key].toLocaleString('id-ID');
  $('missingCount').textContent=(info.issues?.nilai_tanpa_matakuliah||0).toLocaleString('id-ID');
  if(info.warning){$('warning').hidden=false;$('warning').textContent=info.warning;}
  $('categoryAll').textContent=number(info.counts.mahasiswa);
  for(const p of info.prodi){const button=document.createElement('button');button.type='button';button.dataset.prodi=p.id;button.setAttribute('aria-pressed','false');button.append(document.createTextNode(p.nama+' '));const count=document.createElement('span');count.textContent=number(p.jumlah);button.append(count);$('categories').append(button);}
  for(const a of info.angkatan)$('search').elements.angkatan.add(new Option(a.tahunangkatan,a.tahunangkatan));
  $('source').textContent=`${info.campus} · Sumber: ${info.source} · Mode: ${info.mode} · Impor ${new Date(info.imported).toLocaleString('id-ID')} · ${number(info.issues?.nilai_dari_label||0)} nama mata kuliah dipulihkan dari label riwayat nilai`;
  queueSearch();
}catch(e){status(e.message);}}
init();
