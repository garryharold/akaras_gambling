import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export function openDatabase(file){
 if(file!==':memory:')mkdirSync(dirname(resolve(file)),{recursive:true});
 const sql=new DatabaseSync(file);sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 sql.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
  if(sql.prepare('SELECT name FROM schema_migrations WHERE name=?').get(name))continue;
  sql.exec('BEGIN IMMEDIATE');try{sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));sql.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(name,new Date().toISOString());sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}
 }
 class Statement{constructor(query,args=[]){this.query=query;this.args=args}bind(...args){return new Statement(this.query,args)}run(){const r=sql.prepare(this.query).run(...this.args);return {meta:{changes:Number(r.changes)}}}first(){return sql.prepare(this.query).get(...this.args)||null}all(){return {results:sql.prepare(this.query).all(...this.args)}}}
 const db={prepare:q=>new Statement(q),batch:async qs=>{sql.exec('BEGIN IMMEDIATE');try{const out=qs.map(q=>q.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 return {sql,db};
}
