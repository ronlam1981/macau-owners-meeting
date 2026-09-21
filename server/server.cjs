'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');const D=require('./domain.cjs');
const root=path.resolve(__dirname,'..');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function password(p,salt=crypto.randomBytes(16).toString('hex')){return salt+':'+crypto.scryptSync(p,salt,64).toString('hex');}
function matches(p,stored){const s=password(p,stored.split(':')[0]);return crypto.timingSafeEqual(Buffer.from(s),Buffer.from(stored));}
function createServer(dbPath=process.env.MEETING_DB||path.join(__dirname,'data','meetings.sqlite')){
 if(dbPath!==':memory:')fs.mkdirSync(path.dirname(dbPath),{recursive:true,mode:0o700});
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,meeting_id TEXT,active INTEGER DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS meetings(id TEXT PRIMARY KEY,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,meeting_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,at INTEGER NOT NULL,detail TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;
 CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;`);
 function addUser(username,pass,role,meetingId=null){D.text(username,100);D.need(typeof pass==='string'&&pass.length>=12&&pass.length<=200,'密碼須12至200字元');D.need(['admin','checkin','recorder','adjudicator','observer'].includes(role),'角色錯誤');const id=crypto.randomUUID();db.prepare('INSERT INTO users(id,username,password,role,meeting_id) VALUES (?,?,?,?,?)').run(id,username,password(pass),role,meetingId);return id;}
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
 function load(id){const row=db.prepare('SELECT state FROM meetings WHERE id=?').get(id);if(!row)throw Object.assign(new Error('會議不存在'),{status:404});return JSON.parse(row.state);}
 function auth(req){const token=(req.headers.authorization||'').replace(/^Bearer /,'');const actor=db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.active=1').get(hash(token),Date.now());if(!actor)throw Object.assign(new Error('請登入；登入可能已到期'),{status:401});return actor;}
 function allowed(actor,id){if(actor.role!=='admin'&&actor.meeting_id!==id)throw Object.assign(new Error('無權存取此會議'),{status:403});}
 function audit(m,a,action,detail){db.prepare('INSERT INTO audit(meeting_id,actor,action,at,detail) VALUES (?,?,?,?,?)').run(m,a,action,Date.now(),JSON.stringify(detail));}
 const origins=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean),failures=new Map();
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;let cors={};
  if(origin){const same=origin===`http://${req.headers.host}`||origin===`https://${req.headers.host}`;if(!same&&!origins.includes(origin)){res.writeHead(403);return res.end('Origin not allowed');}cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};}
  const headers={...cors,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
  const send=(code,data,type='application/json')=>{res.writeHead(code,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(type==='application/json'?JSON.stringify(data):data);};
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
  try{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/')){
    if(req.method!=='GET')return send(405,{error:'Method not allowed'});
    const files={'/':'multi.html','/multi.html':'multi.html','/multi.js':'multi.js','/multi.css':'multi.css','/meeting-core.js':'meeting-core.js'};const f=files[url.pathname];if(!f)return send(404,{error:'Not found'});
    return send(200,fs.readFileSync(path.join(root,f),'utf8'),f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');
   }
   if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed'});
   let b={};if(req.method==='POST'){
    D.need((req.headers['content-type']||'').startsWith('application/json'),'使用JSON格式');let body='';for await(const chunk of req){body+=chunk;D.need(Buffer.byteLength(body)<=12*1024*1024,'請求檔案過大');}try{b=JSON.parse(body||'{}');}catch{D.need(false,'JSON格式錯誤');}D.need(b&&typeof b==='object'&&!Array.isArray(b),'JSON格式錯誤');
   }
   if(url.pathname==='/api/health'&&req.method==='GET')return send(200,{service:'owners-meeting',version:3});
   if(url.pathname==='/api/login'&&req.method==='POST'){
    D.text(b.username,100);D.text(b.password,200);const key=req.socket.remoteAddress;const f=failures.get(key)||{count:0,until:Date.now()+15*60e3};if(f.until<Date.now()){f.count=0;f.until=Date.now()+15*60e3;}if(f.count>=10)return send(429,{error:'登入嘗試太多，15分鐘後重試'});
    const u=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(b.username);
    if(!u||!matches(b.password,u.password)){f.count++;failures.set(key,f);return send(401,{error:'帳戶或密碼不正確'});}failures.delete(key);
    const token=crypto.randomBytes(32).toString('base64url');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),u.id,Date.now()+8*3600e3);return send(200,{token,role:u.role,username:u.username});
   }
   const voterMatch=url.pathname.match(/^\/api\/voter\/([a-f0-9-]+)(?:\/(vote))?$/);
   if(voterMatch){
    const id=voterMatch[1];const answer=transaction(()=>{const m=load(id);const token=(req.headers.authorization||'').replace(/^Bearer /,'');const cred=m.credentials.find(c=>c.hash===hash(token)&&!c.revoked&&c.expires>Date.now());if(!cred)throw Object.assign(new Error('投票憑證失效'),{status:401});const actor={id:cred.id,role:'voter',unitId:cred.unitId};
     if(req.method==='POST'){D.need(voterMatch[2]==='vote','路徑錯誤');D.apply(m,actor,'vote',b);db.prepare('UPDATE meetings SET state=? WHERE id=?').run(JSON.stringify(m),id);audit(id,actor.id,'vote',{agendaId:b.agendaId,unitId:actor.unitId,choice:b.choice});}
     return D.view(m,actor);});return send(200,answer);
   }
   const actor=auth(req);
   if(url.pathname==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE hash=?').run(hash((req.headers.authorization||'').replace(/^Bearer /,'')));return send(200,{ok:true});}
   if(url.pathname==='/api/meetings'){
    if(req.method==='GET'){const rows=db.prepare('SELECT id,state FROM meetings').all();return send(200,rows.filter(r=>actor.role==='admin'||actor.meeting_id===r.id).map(r=>{const m=JSON.parse(r.state);return {id:m.id,name:m.name,mode:m.mode,closedAt:m.closedAt};}));}
    D.need(actor.role==='admin','只有管理員可建立會議');const m=D.create(b.backup,b.name);transaction(()=>{db.prepare('INSERT INTO meetings VALUES (?,?)').run(m.id,JSON.stringify(m));audit(m.id,actor.id,'create',{ruleVersion:require('../meeting-core.js').RULE_VERSION});});return send(201,{id:m.id});
   }
   const match=url.pathname.match(/^\/api\/meetings\/([a-f0-9-]+)(?:\/([a-z]+))?$/);if(!match)return send(404,{error:'Not found'});
   const [,id,action]=match;allowed(actor,id);
   if(req.method==='GET'){
    const m=load(id);
    if(action==='backup'){D.need(actor.role==='admin','只限管理員');return send(200,{format:'owners-collaboration',schemaVersion:1,ruleVersion:require('../meeting-core.js').RULE_VERSION,exportedAt:new Date().toISOString(),meeting:m,audit:db.prepare('SELECT * FROM audit WHERE meeting_id=? ORDER BY id').all(id)});}
    if(action==='audit'){D.need(['admin','adjudicator'].includes(actor.role),'只限管理員或裁定員');return send(200,db.prepare('SELECT id,actor,action,at,detail FROM audit WHERE meeting_id=? ORDER BY id DESC LIMIT 500').all(id));}
    if(action==='qr'){D.need(['admin','checkin'].includes(actor.role),'只限發票人員');const p=m.ballots.find(p=>p.id===url.searchParams.get('ballot')&&!p.voided);D.need(p,'選票失效');const qr=require('qrcode');return send(200,{svg:await qr.toString(p.id,{type:'svg',errorCorrectionLevel:'M',margin:4})});}
    D.need(!action,'路徑錯誤');return send(200,D.view(m,actor));
   }
   if(action==='users'){
    D.need(actor.role==='admin','只限管理員');load(id);D.need(b.role!=='admin','網頁只可建立工作人員');const uid=transaction(()=>{const uid=addUser(b.username,b.password,b.role,id);audit(id,actor.id,'create-user',{userId:uid,username:b.username,role:b.role});return uid;});return send(201,{id:uid});
   }
   const response=transaction(()=>{const m=load(id);D.need(Number.isSafeInteger(b.revision)&&b.revision===m.revision,'資料已更新，請重新整理後再操作');const result=D.apply(m,actor,action,b);db.prepare('UPDATE meetings SET state=? WHERE id=?').run(JSON.stringify(m),id);const detail={...b};delete detail.revision;audit(id,actor.id,action,detail);return {result,meeting:D.view(m,actor)};});return send(200,response);
  }catch(e){send(e.status||400,{error:e.code?.startsWith('SQLITE_CONSTRAINT')?'資料重複或違反資料庫限制':e.message||'操作失敗'});}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,db,addUser};
}
if(require.main===module){const app=createServer();if(process.argv[2]==='create-admin'){const p=process.env.ADMIN_PASSWORD;D.need(p,'請設定ADMIN_PASSWORD');app.addUser(process.argv[3]||'admin',p,'admin');console.log('管理員已建立');app.db.close();}else{app.server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log('Owners meeting backend listening on port '+(process.env.PORT||8787)));}}
module.exports={createServer};
