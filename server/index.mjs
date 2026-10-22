import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from './database.mjs';
import {bootstrapAdmin,currentAccount,createSession,logout,hashPassword,verifyPassword,normalizeEmail,validEmail,validPassword} from './auth.mjs';
import {seed,snapshot,placeBet,adminAction,GameError} from '../lib/game.ts';
export async function makeApp(options={}){
 const production=options.production??process.env.NODE_ENV==='production';
 const origin=new URL(options.origin||process.env.APP_URL||process.env.RENDER_EXTERNAL_URL||'http://localhost:3000').origin;
 if(production&&!origin.startsWith('https://'))throw Error('Production requires HTTPS APP_URL or RENDER_EXTERNAL_URL.');
 const {sql,db}=openDatabase(options.databasePath||process.env.DATABASE_PATH||'./data/akaras.sqlite');
 await bootstrapAdmin(sql,options.adminEmail||process.env.ADMIN_EMAIL,options.adminPassword||process.env.ADMIN_PASSWORD);await seed(db);
 const dummyHash=await hashPassword(crypto.randomUUID());
 const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
 const limits=new Map();
 function limited(key,max,window=900000){const now=Date.now();if(limits.size>10000){for(const [k,v] of limits)if(v.until<now)limits.delete(k);if(limits.size>10000)return true;}let v=limits.get(key);if(!v||v.until<now){v={count:0,until:now+window};limits.set(key,v)}return ++v.count>max}
 function json(res,body,status=200,cookie){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(body))}
 async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw new GameError('JSON kérés szükséges.',415);let n=0,chunks=[];for await(const chunk of req){n+=chunk.length;if(n>16384)throw new GameError('Túl nagy kérés.',413);chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new GameError('Érvénytelen kérés.')}}
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/api/health'){sql.prepare('SELECT 1').get();return json(res,{ok:true})}
   if(req.method==='POST'&&req.headers.origin!==origin)throw new GameError('Érvénytelen kérési eredet.',403);
   const account=currentAccount(sql,req),identity=account?{userId:account.id,displayName:account.name}:null,isAdmin=account?.role==='admin';
   if(path==='/api/game'&&req.method==='GET')return json(res,await snapshot(db,identity,isAdmin));
   if(path==='/api/auth/register'&&req.method==='POST'){
    // On Render, the rightmost X-Forwarded-For entry is supplied by the edge proxy.
    const ip=production?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
    if(limited('register:'+ip,10,3600000))throw new GameError('Túl sok regisztráció. Próbáld később.',429);
    const b=await body(req),email=normalizeEmail(b?.email),name=typeof b?.name==='string'?b.name.trim():'';
    if(!validEmail(email)||!validPassword(b?.password)||name.length<2||name.length>40)throw new GameError('Adj meg érvényes e-mail-címet, 2–40 karakteres nevet és 12–128 karakteres jelszót.');
    if(sql.prepare('SELECT id FROM auth_accounts WHERE email=?').get(email))throw new GameError('Ezzel az e-mail-címmel nem hozható létre új fiók.',409);
    const id=crypto.randomUUID(),hash=await hashPassword(b.password);
    try{sql.prepare('INSERT INTO auth_accounts VALUES(?,?,?,?,?,?)').run(id,email,name,hash,'player',new Date().toISOString())}catch(e){if(String(e).includes('UNIQUE'))throw new GameError('Ezzel az e-mail-címmel nem hozható létre új fiók.',409);throw e}
    await snapshot(db,{userId:id,displayName:name},false);
    return json(res,{ok:true},201,createSession(sql,id,production));
   }
   if(path==='/api/auth/login'&&req.method==='POST'){
    const b=await body(req),email=normalizeEmail(b?.email);
    const ip=production?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
    if(limited('login-ip:'+ip,30)||limited('login-account:'+email,12))throw new GameError('Túl sok próbálkozás. Próbáld 15 perc múlva.',429);
    const a=sql.prepare('SELECT * FROM auth_accounts WHERE email=?').get(email);
    const ok=await verifyPassword(b?.password,a?.password_hash||dummyHash);
    if(!a||!ok)throw new GameError('Hibás e-mail-cím vagy jelszó.',401);
    // Rotate the existing session, if any.
    logout(sql,req,production);
    return json(res,{ok:true},200,createSession(sql,a.id,production));
   }
   if(path==='/api/auth/logout'&&req.method==='POST')return json(res,{ok:true},200,logout(sql,req,production));
   if(path==='/api/game'&&req.method==='POST'){
    if(!identity)throw new GameError('Előbb jelentkezz be.',401);
    if(limited('game:'+identity.userId,120,60000))throw new GameError('Túl sok kérés. Várj egy percet.',429);
    const b=await body(req);if(!b||typeof b!=='object')throw new GameError('Érvénytelen kérés.');
    if(b.action==='bet')await placeBet(db,identity,b);else await adminAction(db,identity,isAdmin,b);
    return json(res,await snapshot(db,identity,isAdmin));
   }
   if(path.startsWith('/api/'))throw new GameError('Nincs ilyen végpont.',404);
   if(!['GET','HEAD'].includes(req.method))throw new GameError('Nem támogatott művelet.',405);
   let file=resolve(root,'.'+decodeURIComponent(path));
   if(!file.startsWith(root+sep)&&file!==root)throw new GameError('Tiltott útvonal.',403);
   if(path==='/'||path==='/login')file=resolve(root,'index.html');
   try{if(!(await stat(file)).isFile())throw Error();}catch{throw new GameError('A fájl nem található.',404)}
   const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
   res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch(e){if(e instanceof GameError)return json(res,{error:e.message},e.status);console.error('Request failed:',e.message);json(res,{error:'Szerverhiba. Próbáld újra később.'},500)}
 });
 return {server,sql};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const app=await makeApp();const port=Number(process.env.PORT||3000);app.server.listen(port,'0.0.0.0',()=>console.log(`Akarás Gambling listening on port ${port}`));
 const stop=()=>app.server.close(()=>{app.sql.close();process.exit(0)});process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
