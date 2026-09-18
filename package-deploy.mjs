import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const release=path.join(root,'release');fs.mkdirSync(release,{recursive:true});
const directory=fs.mkdtempSync(path.join(release,'arsip-khs-intranet-'));
const files=['package.json','package-lock.json','server.mjs','auth.mjs','config.mjs','data.mjs','export.mjs','import.mjs','backup.mjs','package-deploy.mjs','test.mjs','Jalankan.bat','Install-Intranet.ps1','.env.example','README.md','DEPLOY-WINDOWS.md','AUDIT-MATAKULIAH.md','public'];
for(const file of files)fs.cpSync(path.join(root,file),path.join(directory,file),{recursive:true});
fs.cpSync(path.join(root,'node_modules'),path.join(directory,'node_modules'),{recursive:true});
fs.mkdirSync(path.join(directory,'data'));
const source=new DatabaseSync(path.join(root,'data','ecampus.sqlite'),{readOnly:true});
try{await backup(source,path.join(directory,'data','ecampus.sqlite'));}finally{source.close();}
const check=new DatabaseSync(path.join(directory,'data','ecampus.sqlite'),{readOnly:true});
try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database paket tidak valid.');}finally{check.close();}
// Accounts, sessions, setup token, local .env, SQL dump and Excel exports are never packaged.
const archive=directory+'.zip';
const result=spawnSync('tar',['-a','-cf',archive,'-C',directory,'.'],{stdio:'inherit'});
if(result.status!==0)throw new Error('Gagal membuat ZIP; folder paket tersedia di '+directory);
console.log('Paket Windows Server: '+archive);
