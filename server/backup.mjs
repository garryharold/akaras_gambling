import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const source=process.env.DATABASE_PATH||'./data/akaras.sqlite';
const target=resolve(process.argv[2]||`./backups/akaras-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
mkdirSync(dirname(target),{recursive:true});
const sql=new DatabaseSync(source);sql.prepare('VACUUM INTO ?').run(target);sql.close();console.log('Backup created:',target);
