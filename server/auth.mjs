import {scrypt,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export const normalizeEmail=e=>typeof e==='string'?e.trim().toLowerCase():'';
export const validEmail=e=>e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const validPassword=p=>typeof p==='string'&&p.length>=12&&p.length<=128;
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const hash=await derive(password,salt,64);return salt+':'+hash.toString('hex')}
export async function verifyPassword(password,stored){if(typeof password!=='string'||password.length>128)return false;const [salt,hash]=stored.split(':');const actual=await derive(password,salt,64);const expected=Buffer.from(hash,'hex');return expected.length===actual.length&&timingSafeEqual(expected,actual)}
const digest=t=>createHash('sha256').update(t).digest('hex');
export function createSession(sql,accountId,secure){const token=randomBytes(32).toString('hex');sql.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),accountId,Date.now()+7*86400000);return `akaras_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${secure?'; Secure':''}`}
function sessionToken(req){const pair=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('akaras_session='));const token=pair?.slice('akaras_session='.length);return /^[a-f0-9]{64}$/.test(token||'')?token:null}
export function currentAccount(sql,req){const token=sessionToken(req);if(!token)return null;return sql.prepare('SELECT a.id,a.name,a.role FROM auth_accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token),Date.now())||null}
export function logout(sql,req,secure){const token=sessionToken(req);if(token)sql.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));return `akaras_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`}
export async function bootstrapAdmin(sql,email,password){email=normalizeEmail(email);if(!validEmail(email))throw Error('Set ADMIN_EMAIL to your admin email.');const existing=sql.prepare('SELECT id,role FROM auth_accounts WHERE email=?').get(email);if(existing){if(existing.role!=='admin')throw Error('ADMIN_EMAIL belongs to a player. Use the existing admin account or an unused email.');return;}
 if(!validPassword(password))throw Error('Set ADMIN_PASSWORD to a unique 12–128 character password for initial admin setup.');
 sql.prepare('INSERT INTO auth_accounts VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),email,'Admin',await hashPassword(password),'admin',new Date().toISOString());
}
