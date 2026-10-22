import {createInterface} from 'node:readline';
import {stdin,stdout} from 'node:process';
import {DatabaseSync} from 'node:sqlite';
import {hashPassword,validPassword,normalizeEmail} from './auth.mjs';
const email=normalizeEmail(process.argv[2]);if(!email)throw Error('Usage: npm run reset-password -- email@example.com');
const sql=new DatabaseSync(process.env.DATABASE_PATH||'./data/akaras.sqlite');
const user=sql.prepare('SELECT id FROM auth_accounts WHERE email=?').get(email);if(!user)throw Error('No such account.');
stdout.write('New password (input hidden): ');
let password='';
if(stdin.isTTY){stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');password=await new Promise((resolve,reject)=>{const handler=chunk=>{for(const c of chunk){if(c==='\u0003'){stdin.setRawMode(false);process.exit(130)}if(c==='\r'||c==='\n'){stdin.off('data',handler);stdin.setRawMode(false);stdin.pause();stdout.write('\n');resolve(password);return}if(c==='\u007f'){password=password.slice(0,-1)}else password+=c}};stdin.on('data',handler)})}else{const rl=createInterface({input:stdin});for await(const line of rl){password=line;rl.close();break}}
if(!validPassword(password))throw Error('Password must be 12–128 characters.');
const hash=await hashPassword(password);sql.exec('BEGIN IMMEDIATE');try{sql.prepare('UPDATE auth_accounts SET password_hash=? WHERE id=?').run(hash,user.id);sql.prepare('DELETE FROM sessions WHERE account_id=?').run(user.id);sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}sql.close();console.log('Password changed; existing sessions revoked.');
