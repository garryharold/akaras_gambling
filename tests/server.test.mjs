import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeApp} from '../server/index.mjs';
const origin='http://localhost:3000';
test('Render authentication, account isolation, admin authorization, restart persistence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'akaras-test-'));const options={databasePath:join(dir,'game.sqlite'),origin,adminEmail:'admin@example.test',adminPassword:'test-admin-password-only',production:false};
 let app=await makeApp(options);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));let base='http://127.0.0.1:'+app.server.address().port;
 async function request(path,body,cookie,headers={}){const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0]}}
 try{
  assert.equal((await request('/api/health')).status,200);
  assert.equal((await request('/api/game')).data.matches.length,8);
  assert.equal((await request('/api/game',{action:'lock',roundId:'round-0-0'})).status,401);
  assert.equal((await request('/api/auth/register',{name:'Tester',email:'tester@example.test',password:'test-player-password-only'},null,{Origin:'https://evil.test'})).status,403);
  const player=await request('/api/auth/register',{name:'Tester',email:'tester@example.test',password:'test-player-password-only',role:'admin'});assert.equal(player.status,201);assert.ok(player.cookie);
  let s=await request('/api/game',null,player.cookie);assert.equal(s.data.user.balance,5000);assert.equal(s.data.user.isAdmin,false);
  assert.equal((await request('/api/game',{action:'lock',roundId:'round-0-0'},player.cookie)).status,403);
  assert.equal((await request('/api/game',null,null,{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'admin@example.test'})).data.user,null);
  const b={action:'bet',id:crypto.randomUUID(),stake:500,selections:[{id:'r00-geng-ig',side:'a'}]};assert.equal((await request('/api/game',b,player.cookie)).data.user.balance,4500);
  assert.equal((await request('/api/game',b,player.cookie)).data.user.balance,4500);
  const second=await request('/api/auth/register',{name:'Other',email:'other@example.test',password:'test-player-password-only'});assert.equal((await request('/api/game',null,second.cookie)).data.bets.length,0);
  const bad=await request('/api/auth/login',{email:'admin@example.test',password:'wrong'});assert.equal(bad.status,401);
  const admin=await request('/api/auth/login',{email:'admin@example.test',password:'test-admin-password-only'});assert.equal(admin.status,200);assert.equal((await request('/api/game',null,admin.cookie)).data.user.isAdmin,true);
  assert.equal((await request('/api/game',{action:'lock',roundId:'round-0-0'},admin.cookie)).status,200);
  assert.equal((await request('/api/game',{...b,id:crypto.randomUUID()},player.cookie)).status,409);
  const state=(await request('/api/game',null,admin.cookie)).data;
  for(const m of state.matches)assert.equal((await request('/api/game',{action:'result',roundId:'round-0-0',matchId:m.id,winner:'a'},admin.cookie)).status,200);
  assert.equal((await request('/api/game',{action:'close',roundId:'round-0-0'},admin.cookie)).status,200);
  assert.equal((await request('/api/game',null,player.cookie)).data.user.balance,5150);
  await new Promise(r=>app.server.close(r));app.sql.close();
  app=await makeApp(options);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;
  s=await request('/api/game',null,player.cookie);assert.equal(s.data.user.balance,5150);assert.equal(s.data.bets[0].status,'won');
  assert.equal((await request('/api/auth/logout',{},player.cookie)).status,200);assert.equal((await request('/api/game',null,player.cookie)).data.user,null);
 }finally{await new Promise(r=>app.server.close(r));app.sql.close();rmSync(dir,{recursive:true,force:true})}
});
