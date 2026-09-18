import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export function readConfig(env=process.env){
  const host=env.HOST||'127.0.0.1',port=Number(env.PORT||3000);
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT tidak valid.');
  const origins=(env.PUBLIC_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  for(const origin of origins){const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)throw new Error('PUBLIC_ORIGINS harus berupa origin tanpa path atau garis miring akhir.');}
  if(!['127.0.0.1','localhost','::1'].includes(host)&&!origins.length)throw new Error('PUBLIC_ORIGINS wajib diisi untuk akses intranet.');
  if(origins.some(o=>o.startsWith('https:'))&&env.COOKIE_SECURE!=='1')throw new Error('Gunakan COOKIE_SECURE=1 untuk HTTPS.');
  if(env.COOKIE_SECURE==='1'&&origins.some(o=>o.startsWith('http:')))throw new Error('COOKIE_SECURE=1 membutuhkan semua PUBLIC_ORIGINS memakai HTTPS.');
  return {host,port,origins,dbPath:path.resolve(root,env.ECAMPUS_DB||'data/ecampus.sqlite'),authPath:path.resolve(root,env.AUTH_DB||'data/auth.sqlite')};
}
export function allowedHost(host,origins){return origins.length?origins.some(o=>new URL(o).host===host):/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host||'');}
