import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const derive=promisify(scrypt), token=()=>randomBytes(32).toString('hex');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createAuth(filename,origins=[]){
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('superadmin','user')),active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
  const setupFile=path.join(path.dirname(filename),'setup-token.txt');
  const needsSetup=()=>db.prepare('SELECT COUNT(*) n FROM users').get().n===0;
  if(needsSetup()&&!fs.existsSync(setupFile))fs.writeFileSync(setupFile,token(),{mode:0o600});
  function throttle(key){
    const now=Date.now();db.prepare('DELETE FROM attempts WHERE expires<?').run(now);
    const row=db.prepare('SELECT count FROM attempts WHERE key=?').get(key);
    if(row?.count>=10)throw fail('Terlalu banyak percobaan. Coba kembali setelah 15 menit.',429);
    db.prepare('INSERT INTO attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+15*60*1000);
  }
  function session(req){
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const value=/(?:^|;\s*)ecampus_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
    return value?db.prepare('SELECT u.id,u.username,u.name,u.role,s.csrf,s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND u.active=1').get(hash(value)):null;
  }
  async function credentials(body){
    const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
    const name=typeof body.name==='string'?body.name.trim():'';
    if(!/^[a-z0-9._-]{3,50}$/.test(username))throw fail('Username 3–50 karakter: huruf, angka, titik, garis bawah atau tanda hubung.');
    if(!name||name.length>100)throw fail('Nama wajib diisi, maksimal 100 karakter.');
    if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw fail('Password harus 12–128 karakter.');
    const salt=token(),password=(await derive(body.password,salt,64)).toString('hex');
    return {username,name,salt,password};
  }
  async function addUser(body,role='user'){
    const user=await credentials(body);
    try{return db.prepare('INSERT INTO users(username,name,password,salt,role) VALUES (?,?,?,?,?)').run(user.username,user.name,user.password,user.salt,role).lastInsertRowid;}
    catch(e){if(e.code?.includes('CONSTRAINT')||e.message.includes('UNIQUE'))throw fail('Username sudah digunakan.',409);throw e;}
  }
  const cookie=(value,maxAge)=>`ecampus_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.COOKIE_SECURE==='1'?'; Secure':''}`;
  async function body(req){
    if(!req.headers['content-type']?.startsWith('application/json'))throw fail('Gunakan JSON.',415);
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)throw fail('Permintaan terlalu besar.',413);}
    let result;try{result=JSON.parse(text);}catch{throw fail('JSON tidak valid.');}
    if(!result||Array.isArray(result)||typeof result!=='object')throw fail('Data tidak valid.');return result;
  }
  async function handle(req,res,url,send){
    const current=session(req);
    if(req.method==='POST'){
      const origin=req.headers.origin;
      if(origins.length?!origins.includes(origin):origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)throw fail('Origin tidak valid.',403);
    }
    if(url.pathname==='/api/auth/status'&&req.method==='GET'){send(res,200,{setup:needsSetup(),user:current?{id:current.id,username:current.username,name:current.name,role:current.role}:null,csrf:current?.csrf});return true;}
    if(url.pathname==='/api/auth/setup'&&req.method==='POST'){
      throttle('setup:'+req.socket.remoteAddress);
      if(!needsSetup())throw fail('Super admin sudah dibuat.',409);
      const input=await body(req);const expected=fs.readFileSync(setupFile,'utf8').trim();
      if(typeof input.token!=='string'||!timingSafeEqual(Buffer.from(hash(input.token)),Buffer.from(hash(expected))))throw fail('Kode aktivasi tidak valid.',403);
      const user=await credentials(input);
      // Recheck after asynchronous password hashing to prevent concurrent bootstrap requests.
      db.exec('BEGIN IMMEDIATE');try{if(!needsSetup())throw fail('Super admin sudah dibuat.',409);db.prepare('INSERT INTO users(username,name,password,salt,role) VALUES (?,?,?,?,?)').run(user.username,user.name,user.password,user.salt,'superadmin');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
      fs.rmSync(setupFile,{force:true});send(res,201,{ok:true});return true;
    }
    if(url.pathname==='/api/auth/login'&&req.method==='POST'){
      throttle('login:'+req.socket.remoteAddress);
      const input=await body(req);if(typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>50||input.password.length>128)throw fail('Username atau password salah.',401);
      const user=db.prepare('SELECT * FROM users WHERE username=?').get(input.username.trim().toLowerCase());
      const actual=await derive(input.password,user?.salt||'nonexistent-user',64);
      if(!user||!timingSafeEqual(actual,Buffer.from(user.password,'hex'))||!user.active)throw fail('Username atau password salah.',401);
      const value=token();db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(value),user.id,token(),Date.now()+8*60*60*1000);
      res.setHeader('Set-Cookie',cookie(value,8*60*60));send(res,200,{ok:true});return true;
    }
    if(!current)return false;
    if(req.method==='POST'&&req.headers['x-csrf-token']!==current.csrf)throw fail('Sesi formulir tidak valid. Muat ulang halaman.',403);
    if(url.pathname==='/api/auth/logout'&&req.method==='POST'){
      db.prepare('DELETE FROM sessions WHERE token=?').run(current.token);res.setHeader('Set-Cookie',cookie('',0));send(res,200,{ok:true});return true;
    }
    if(url.pathname==='/api/users'){
      if(current.role!=='superadmin')throw fail('Hanya super admin yang dapat mengelola pengguna.',403);
      if(req.method==='GET'){send(res,200,{users:db.prepare('SELECT id,username,name,role,active FROM users ORDER BY username').all()});return true;}
      if(req.method==='POST'){const input=await body(req);if(input.role&&input.role!=='user')throw fail('Akun baru hanya dapat berperan pengguna biasa.');await addUser(input);send(res,201,{ok:true});return true;}
    }
    return false;
  }
  return {session,handle,needsSetup,setupFile};
}
