import { schedule } from './fixtures.ts';
export class GameError extends Error { status: number; constructor(message:string,status=400){super(message);this.status=status;} }
type Identity = {userId:string;displayName:string};
export async function seed(db:D1Database){
 const q=[];
 for(const r of schedule){q.push(db.prepare("INSERT OR IGNORE INTO rounds(id,name,sequence,status,opened_at) VALUES(?,?,?,?,?)").bind(r.id,r.name,r.sequence,r.sequence===1?'open':'draft',r.sequence===1?new Date().toISOString():null));for(const m of r.matches)q.push(db.prepare('INSERT OR IGNORE INTO matches(id,round_id,a,b,odds_a,odds_b) VALUES(?,?,?,?,?,?)').bind(m.id,r.id,m.a,m.b,m.oddsA,m.oddsB));}
 await db.batch(q);
}
export async function syncUser(db:D1Database,u:Identity){
 const now=new Date().toISOString();
 await db.prepare("INSERT OR IGNORE INTO users(id,name,balance,joined_sequence,created_at) VALUES(?,?,5000,(SELECT COALESCE(MAX(sequence),1) FROM rounds WHERE status!='draft'),?)").bind(u.userId,u.displayName.slice(0,100),now).run();
 const eligible=await db.prepare("SELECT r.id FROM rounds r,users u WHERE u.id=? AND r.sequence>u.joined_sequence AND r.status!='draft' ORDER BY r.sequence").bind(u.userId).all<{id:string}>();
 if(eligible.results.length){const q=[];for(const r of eligible.results){q.push(db.prepare('INSERT OR IGNORE INTO rewards(id,user_id,round_id,amount,created_at) VALUES(?,?,?,5000,?)').bind(crypto.randomUUID(),u.userId,r.id,now));q.push(db.prepare('UPDATE users SET balance=balance+5000 WHERE id=? AND changes()=1').bind(u.userId));}await db.batch(q);}
}
export async function snapshot(db:D1Database,u:Identity|null,isAdmin:boolean){
 await seed(db);if(u)await syncUser(db,u);
 const [r,m,user,b,rewards]=await Promise.all([db.prepare('SELECT * FROM rounds ORDER BY sequence').all(),db.prepare('SELECT * FROM matches ORDER BY rowid').all(),u?db.prepare('SELECT name,balance,created_at FROM users WHERE id=?').bind(u.userId).first():null,u?db.prepare('SELECT id,round_id,selections,stake,payout,status,created_at FROM bets WHERE user_id=? ORDER BY created_at DESC').bind(u.userId).all():{results:[]},u?db.prepare('SELECT round_id,amount,created_at FROM rewards WHERE user_id=? ORDER BY created_at DESC').bind(u.userId).all():{results:[]}]);
 return {user:user?{...user,isAdmin}:null,rounds:r.results,matches:m.results,bets:b.results.map((b:any)=>({...b,selections:JSON.parse(b.selections)})),rewards:rewards.results};
}
export async function placeBet(db:D1Database,u:Identity,body:any){
 await syncUser(db,u);
 if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))throw new GameError('Érvénytelen szelvényazonosító.');
 const prev=await db.prepare('SELECT id,user_id FROM bets WHERE id=?').bind(body.id).first<any>();
 if(prev){if(prev.user_id!==u.userId)throw new GameError('Érvénytelen szelvényazonosító.');return;}
 if(!Number.isSafeInteger(body.stake)||body.stake<1||body.stake>10000000)throw new GameError('A tét 1 és 10 000 000 közötti egész kredit legyen.');
 if(!Array.isArray(body.selections)||body.selections.length<1||body.selections.length>16)throw new GameError('Válassz 1–16 mérkőzést.');
 const seen=new Set();const selections=[];let roundId:string|null=null;let numerator=BigInt(body.stake),denominator=1n;
 for(const s of body.selections){if(!s||typeof s.id!=='string'||!['a','b'].includes(s.side)||seen.has(s.id))throw new GameError('Érvénytelen vagy ismételt tipp.');seen.add(s.id);const m=await db.prepare('SELECT m.*,r.status AS round_status FROM matches m JOIN rounds r ON r.id=m.round_id WHERE m.id=?').bind(s.id).first<any>();if(!m||m.round_status!=='open'||m.winner)throw new GameError('A mérkőzésre már nem fogadhatsz.',409);if(roundId&&roundId!==m.round_id)throw new GameError('Egy szelvényen csak egy kör mérkőzései szerepelhetnek.');roundId=m.round_id;const odd=s.side==='a'?m.odds_a:m.odds_b;numerator*=BigInt(odd);denominator*=100n;selections.push({id:m.id,side:s.side,team:m[s.side],match:m.a+' – '+m.b,odd});}
 const payout=Number(numerator/denominator);if(!Number.isSafeInteger(payout)||payout>1000000000)throw new GameError('A maximális lehetséges kifizetés 1 milliárd kredit. Csökkentsd a tétet vagy a tippek számát.');
 const now=new Date().toISOString();
 await db.batch([
 db.prepare("INSERT OR IGNORE INTO bets(id,user_id,round_id,selections,stake,payout,status,created_at) SELECT ?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND balance>=?) AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND status='open')").bind(body.id,u.userId,roundId,JSON.stringify(selections),body.stake,payout,now,u.userId,body.stake,roundId),
 db.prepare('UPDATE users SET balance=balance-? WHERE id=? AND changes()=1').bind(body.stake,u.userId)
 ]);
 if(!await db.prepare('SELECT id FROM bets WHERE id=? AND user_id=?').bind(body.id,u.userId).first())throw new GameError('Nincs elég kredited, vagy közben lezárták a fogadást.',409);
}
export async function adminAction(db:D1Database,u:Identity,isAdmin:boolean,body:any){
 if(!isAdmin)throw new GameError('Ehhez adminjog szükséges.',403);
 if(body.action==='create-round'){
 const name=typeof body.name==='string'?body.name.trim():'';
 if(!name||name.length>60)throw new GameError('A kör neve 1–60 karakter legyen.');
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await db.batch([
 db.prepare("INSERT INTO rounds(id,name,sequence,status) SELECT ?,?,COALESCE(MAX(sequence),0)+1,'draft' FROM rounds").bind(id,name),
 db.prepare('INSERT INTO audit(id,actor,action,details,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),u.userId,body.action,JSON.stringify({roundId:id,name}),now)
 ]);return;
 }
 if(typeof body.roundId!=='string')throw new GameError('Hiányzó kör.');
 const r=await db.prepare('SELECT * FROM rounds WHERE id=?').bind(body.roundId).first<any>();if(!r)throw new GameError('Ismeretlen kör.',404);
 const now=new Date().toISOString();const q=[];
 if(body.action==='create-match'){
 if(r.status!=='draft')throw new GameError('Meccset csak még el nem indított körhöz adhatsz.',409);
 const a=typeof body.a==='string'?body.a.trim():'',b=typeof body.b==='string'?body.b.trim():'';
 if(!a||!b||a.length>40||b.length>40||a.toUpperCase()===b.toUpperCase())throw new GameError('Adj meg két különböző, legfeljebb 40 karakteres csapatnevet.');
 const parseOdds=(value:unknown)=>{const raw=String(value).replace(',','.');if(!/^\d{1,4}(\.\d{1,2})?$/.test(raw))throw new GameError('Az odds 1,01–1000 közötti szám legyen, legfeljebb két tizedessel.');const [whole,fraction='']=raw.split('.');const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(n<101||n>100000)throw new GameError('Az odds 1,01–1000 közötti szám legyen.');return n;};
 const oddsA=parseOdds(body.oddsA),oddsB=parseOdds(body.oddsB);
 q.push(db.prepare("INSERT INTO matches(id,round_id,a,b,odds_a,odds_b) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM rounds WHERE id=? AND status='draft') AND NOT EXISTS(SELECT 1 FROM matches WHERE round_id=? AND ((upper(a)=upper(?) AND upper(b)=upper(?)) OR (upper(a)=upper(?) AND upper(b)=upper(?))))").bind(crypto.randomUUID(),r.id,a,b,oddsA,oddsB,r.id,r.id,a,b,b,a));
 }else if(body.action==='delete-match'){
 if(r.status!=='draft')throw new GameError('Meccset csak még el nem indított körből törölhetsz.',409);
 if(typeof body.matchId!=='string')throw new GameError('Hiányzó mérkőzés.');
 q.push(db.prepare("DELETE FROM matches WHERE id=? AND round_id=? AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND status='draft')").bind(body.matchId,r.id,r.id));
 }else if(body.action==='lock'){
 if(r.status!=='open')throw new GameError('Csak nyitott kör zárolható.',409);
 q.push(db.prepare("UPDATE rounds SET status='locked' WHERE id=? AND status='open'").bind(r.id));
 }else if(body.action==='result'){
 if(r.status!=='locked')throw new GameError('Először zárold a fogadásokat.',409);
 if(typeof body.matchId!=='string'||!['a','b'].includes(body.winner))throw new GameError('Válassz győztest.');
 const m=await db.prepare('SELECT id FROM matches WHERE id=? AND round_id=?').bind(body.matchId,r.id).first();if(!m)throw new GameError('Ismeretlen mérkőzés.');
 const hasScores=body.scoreA!==null&&body.scoreA!==undefined&&body.scoreA!=='';
 const hasB=body.scoreB!==null&&body.scoreB!==undefined&&body.scoreB!=='';
 if(hasScores!==hasB)throw new GameError('Mindkét eredményt add meg, vagy hagyd üresen.');
 const a=hasScores?Number(body.scoreA):null,b=hasScores?Number(body.scoreB):null;
 if(a!==null&&b!==null&&(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>50||b>50||a===b||(body.winner==='a'?a<b:b<a)))throw new GameError('A pontszámnak egyeznie kell a kiválasztott győztessel.');
 q.push(db.prepare("UPDATE matches SET winner=?,score_a=?,score_b=? WHERE id=? AND round_id=? AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND status='locked')").bind(body.winner,a,b,body.matchId,r.id,r.id));
 }else if(body.action==='close'){
 if(r.status==='closed')return;if(r.status!=='locked')throw new GameError('Először zárold a fogadásokat.',409);
 const unfinished=await db.prepare('SELECT COUNT(*) AS n FROM matches WHERE round_id=? AND winner IS NULL').bind(r.id).first<any>();if(unfinished.n)throw new GameError('A lezáráshoz minden mérkőzés győztesét meg kell adni.');
 const win="NOT EXISTS(SELECT 1 FROM json_each(bets.selections) s LEFT JOIN matches m ON m.id=json_extract(s.value,'$.id') WHERE m.winner IS NULL OR m.winner != json_extract(s.value,'$.side'))";
 q.push(db.prepare("UPDATE rounds SET status='closed',closed_at=? WHERE id=? AND status='locked' AND NOT EXISTS(SELECT 1 FROM matches WHERE round_id=? AND winner IS NULL)").bind(now,r.id,r.id));
 q.push(db.prepare(`UPDATE users SET balance=balance+COALESCE((SELECT SUM(payout) FROM bets WHERE bets.user_id=users.id AND round_id=? AND status='pending' AND ${win}),0) WHERE EXISTS(SELECT 1 FROM rounds WHERE id=? AND status='closed')`).bind(r.id,r.id));
 q.push(db.prepare(`UPDATE bets SET status=CASE WHEN ${win} THEN 'won' ELSE 'lost' END WHERE round_id=? AND status='pending' AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND status='closed')`).bind(r.id,r.id));
 }else if(body.action==='open'){
 if(r.status!=='draft')throw new GameError('Ez a kör már elindult.',409);
 q.push(db.prepare("UPDATE rounds SET status='open',opened_at=? WHERE id=? AND status='draft' AND NOT EXISTS(SELECT 1 FROM rounds WHERE status IN ('open','locked')) AND NOT EXISTS(SELECT 1 FROM rounds WHERE sequence<? AND status!='closed') AND EXISTS(SELECT 1 FROM matches WHERE round_id=?)").bind(now,r.id,r.sequence,r.id));
 }else throw new GameError('Ismeretlen művelet.');
 q.push(db.prepare('INSERT INTO audit(id,actor,action,details,created_at) SELECT ?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),u.userId,body.action,JSON.stringify({roundId:r.id,matchId:body.matchId,winner:body.winner}),now));
 const result=await db.batch(q);if(result[0].meta.changes===0){if(body.action==='open')throw new GameError('Adj hozzá legalább egy meccset, és előbb zárd le a korábbi köröket.',409);if(body.action==='create-match')throw new GameError('Ez a párosítás már szerepel a körben, vagy a kör közben elindult.',409);if(body.action==='delete-match')throw new GameError('A meccs már nem törölhető.',409);}
}
