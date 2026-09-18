import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {readConfig} from './config.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const config=readConfig();
const dir=fs.mkdtempSync(path.join(fs.mkdirSync(path.join(root,'backups'),{recursive:true})||path.join(root,'backups'),'backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'));
try{
  for(const [name,source] of [['ecampus.sqlite',config.dbPath],['auth.sqlite',config.authPath]]){
    if(!fs.existsSync(source)){if(name==='auth.sqlite')continue;throw new Error('Database akademik tidak ditemukan.');}
    const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,path.join(dir,name));}finally{db.close();}
    const copy=new DatabaseSync(path.join(dir,name));try{if(name==='auth.sqlite')copy.exec('DELETE FROM sessions; DELETE FROM attempts;');if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup tidak valid.');}finally{copy.close();}
  }
  fs.writeFileSync(path.join(dir,'COMPLETE.txt'),'Backup selesai. Sesi login tidak disertakan.\n');console.log('Backup selesai: '+dir);
}catch(error){console.error('Backup belum lengkap: '+dir+'\n'+error.message);process.exitCode=1;}
