'use strict';
const crypto = require('node:crypto');
const C = require('../meeting-core.js');
const uuid = () => crypto.randomUUID();
const need = (condition, message) => { if (!condition) throw Object.assign(new Error(message), {status:400}); };
const text = (v, max=2000) => {need(typeof v==='string' && v.trim().length>0 && v.length<=max,'必填文字缺漏或過長');return v.trim();};
const choices=['for','against','abstain','review'];
function create(backup, name) {
 const source=C.importBackup(backup);
 need(source.meetingStatus==='pending','只可匯入尚未開始的會議；舊場結果請留在單機版查閱');
 need(source.units.length && source.agendas.length,'先建立名冊及議程');
 return {id:uuid(), revision:0, createdAt:Date.now(), name:text(name||source.meetingInfo.name), mode:'C', authority:{}, source, ballots:[], credentials:[], snapshots:{}, closedAt:null};
}
function apply(m, actor, action, b) {
 const admin=actor.role==='admin', checkin=admin||actor.role==='checkin', recorder=actor.role==='recorder', adjudicator=admin||actor.role==='adjudicator';
 const permit=ok=>{need(ok,'此帳戶沒有執行此操作的權限');};
 const agenda=()=>{const a=m.source.agendas.find(a=>a.id===b.agendaId);need(a,'找不到議程');return a;};
 const pending=()=>need(m.source.meetingStatus==='pending','開始後已鎖定設定及名冊');
 const paper=()=>need(m.mode==='C','此操作只適用紙票模式');
 const ballot=()=>{paper();const p=m.ballots.find(p=>p.id===b.ballotId);need(p && !p.voided,'選票不存在或已註銷');const a=m.source.agendas.find(a=>a.id===p.agendaId);need(a.status==='voting','議程尚未開票或已截止');return p;};
 need(!m.closedAt,'會議已結束');
 let result={};
 if(action==='configure') {
  permit(admin);pending();need(['A','B','C'].includes(b.mode),'模式錯誤');
  m.mode=b.mode; m.authority={basis:b.basis==='regulation'?'regulation':'resolution',reference:String(b.reference||'').slice(0,2000),confirmed:b.confirmed===true,remoteReference:String(b.remoteReference||'').slice(0,2000),reviewer:String(b.reviewer||'').slice(0,200),remoteConfirmed:b.remoteConfirmed===true};
 } else if(action==='attendance') {
  permit(checkin);pending();const u=m.source.units.find(u=>u.id===b.unitId);need(u,'單位不存在');
  if(b.present){text(b.evidence);m.attendanceEvidence??={};m.attendanceEvidence[u.id]={reference:text(b.evidence),by:actor.id,at:Date.now()};u.status='present';u.isConfirmed=true;u.ownerIdCardLast4='0000';u.proxyType='none';}
  else {u.status='absent';u.isConfirmed=false;u.ownerIdCardLast4='';}
  C.validateState(m.source);
 } else if(action==='start') {
  permit(admin);pending();need(C.totalWeight(m.source.units)===C.TOTAL,'名冊總份額須為100%');need(m.source.units.some(C.eligible),'未確認任何出席');
  if(m.mode!=='C')need(m.authority.confirmed && m.authority.reference?.trim(),'須記錄電子投票的規章／已通過決議依據');
  if(m.mode==='B')need(m.authority.remoteConfirmed && m.authority.remoteReference?.trim() && m.authority.reviewer?.trim(),'遠端出席須另行核對並記錄依據及負責人');
  m.source.meetingStatus='started';m.source.meetingInfo.startedAt=Date.now();
 } else if(action==='open') {
  permit(admin);need(m.source.meetingStatus==='started','先開始會議');const a=agenda();need(a.status==='pending','議程已開放或已結束');need(!m.source.agendas.some(a=>a.status==='voting'),'請先結束目前議程');
  need(a.type!=='annual_majority'||a.noticeConfirmed,'年度例外尚未確認召集書');
  a.status='voting';a.startTime=Date.now();m.snapshots[a.id]=m.source.units.filter(C.eligible).map(u=>({...u}));
 } else if(action==='issue') {
  permit(checkin);paper();const a=agenda();need(a.status==='voting','先開放議程');
  const u=m.snapshots[a.id].find(u=>u.id===b.unitId);need(u,'單位未在本議程出席名單');
  need(!m.ballots.some(p=>p.agendaId===a.id&&p.unitId===u.id&&!p.voided),'已發票；補發請先註銷原票');
  const p={id:uuid(),agendaId:a.id,unitId:u.id,share:u.valuePercent,batch:text(b.batch,100),issuedAt:Date.now(),issuedBy:actor.id,entries:[],receivedAt:null,voided:false};m.ballots.push(p);result={ballotId:p.id};
 } else if(action==='receive') {
  permit(checkin||recorder);const p=ballot();need(!p.receivedAt,'已登記收回');p.receivedAt=Date.now();p.receivedBy=actor.id;
 } else if(action==='entry') {
  permit(recorder);const p=ballot();need(p.receivedAt,'先登記收回');need(!p.resolution,'已裁定');need(p.entries.length<2,'已完成兩次錄入');need(!p.entries.some(e=>e.by===actor.id),'同一帳戶不能錄入同票兩次');need(choices.includes(b.choice),'選項錯誤');
  p.entries.push({choice:b.choice,by:actor.id,at:Date.now()});
 } else if(action==='resolve') {
  permit(adjudicator);const p=ballot();need(p.receivedAt,'未收回選票不能裁定');need(p.entries.length===2 || p.entries.some(e=>e.choice==='review'),'請先完成錄入或標記待裁定');need([...choices.filter(c=>c!=='review'),'invalid'].includes(b.choice),'裁定選項錯誤');
  p.resolution={choice:b.choice,reason:text(b.reason),by:actor.id,at:Date.now()};
 } else if(action==='void') {
  permit(adjudicator);const p=ballot();p.voided=true;p.voidReason=text(b.reason);p.voidAt=Date.now();p.voidBy=actor.id;
 } else if(action==='credential') {
  permit(checkin);need(m.mode!=='C','紙票模式不發電子投票憑證');need(m.source.meetingStatus==='started','先開始會議');
  const u=m.source.units.find(u=>u.id===b.unitId&&C.eligible(u));need(u,'單位未確認出席');text(b.evidence);
  for(const c of m.credentials.filter(c=>c.unitId===u.id))c.revoked=true;
  const token=crypto.randomBytes(32).toString('base64url');const id=uuid();m.credentials.push({id,unitId:u.id,hash:crypto.createHash('sha256').update(token).digest('hex'),expires:Date.now()+8*3600e3,revoked:false,by:actor.id,evidence:text(b.evidence)});result={token,unitId:u.id};
 } else if(action==='vote') {
  permit(actor.role==='voter');need(m.mode!=='C','紙票模式不接受電子票');const a=agenda();need(a.status==='voting','投票已關閉');need(m.snapshots[a.id].some(u=>u.id===actor.unitId),'沒有此議程投票資格');need(['for','against','abstain'].includes(b.choice),'選項錯誤');
  m.source.votes[a.id]??={};m.source.votes[a.id][actor.unitId]=b.choice;
 } else if(action==='close') {
  permit(admin);const a=agenda();need(a.status==='voting','議程未開放');
  if(m.mode==='C') {
   need(!m.ballots.filter(p=>p.agendaId===a.id&&!p.voided&&p.receivedAt).some(p=>!finalChoice(p)),'仍有待覆核或待裁定的收回票');
   text(b.reason);m.closeNotes??={};m.closeNotes[a.id]=text(b.reason);
  }
  a.status='ended';a.endTime=Date.now();
 } else if(action==='finish') {
  permit(admin);need(m.source.meetingStatus==='started','會議未開始');need(!m.source.agendas.some(a=>a.status==='voting'),'請先結束目前議程');
  m.source=C.finishMeeting(m.source);m.closedAt=Date.now();
 } else need(false,'不支援的操作');
 m.revision++;return result;
}
function finalChoice(p){if(p.voided)return null;if(p.resolution)return p.resolution.choice;if(p.entries.length===2&&p.entries[0].choice===p.entries[1].choice&&p.entries[0].choice!=='review')return p.entries[0].choice;return null;}
function status(p){if(p.voided)return 'void';if(finalChoice(p))return finalChoice(p)==='invalid'?'invalid':'verified';if(!p.receivedAt)return 'issued';if(!p.entries.length)return 'received';if(p.entries.some(e=>e.choice==='review')||p.entries.length===2)return 'disputed';return 'reviewing';}
function results(m){return m.source.agendas.map(a=>{
 const units=m.snapshots[a.id]||m.source.units.filter(C.eligible);const votes={...m.source.votes};const papers=m.ballots.filter(p=>p.agendaId===a.id);
 if(m.mode==='C'){votes[a.id]={};for(const p of papers){const c=finalChoice(p);if(c&&c!=='invalid')votes[a.id][p.unitId]=c;}}
 const counts={issued:0,received:0,reviewing:0,disputed:0,verified:0,invalid:0,void:0};papers.forEach(p=>counts[status(p)]++);
 const tally=C.tally(units,a,votes);const invalid= papers.filter(p=>!p.voided&&finalChoice(p)==='invalid').reduce((s,p)=>s+C.weight(p.share),0)/C.SCALE;
 return {agendaId:a.id,...tally,invalidPercent:invalid.toFixed(2),unvotedPercent:(units.reduce((sum,u)=>sum+(!votes[a.id]?.[u.id]?C.weight(u.valuePercent):0),0)/C.SCALE-invalid).toFixed(2),counts,provisional:a.status!=='ended',closeNote:m.closeNotes?.[a.id]||''};
});}
function view(m,actor){
 const isAdmin=actor.role==='admin',judgement=isAdmin||actor.role==='adjudicator';
 const units=m.source.units.map(u=>({id:u.id,tower:u.tower,unit:u.unit,valuePercent:u.valuePercent,status:u.status,isConfirmed:u.isConfirmed,...(isAdmin||actor.role==='checkin'?{owner:u.owner}:{})}));
 if(actor.role==='voter')return {id:m.id,name:m.name,mode:m.mode,revision:m.revision,role:'voter',unit:units.find(u=>u.id===actor.unitId),agendas:m.source.agendas,myVotes:Object.fromEntries(Object.entries(m.source.votes).map(([k,v])=>[k,v[actor.unitId]||null])),closedAt:m.closedAt};
 return {id:m.id,name:m.name,mode:m.mode,authority:m.authority,revision:m.revision,role:actor.role,meetingStatus:m.source.meetingStatus,meetingInfo:m.source.meetingInfo,units,agendas:m.source.agendas,results:results(m),closedAt:m.closedAt,
 ballots:m.ballots.map(p=>({id:p.id,agendaId:p.agendaId,unitId:p.unitId,share:p.share,batch:p.batch,status:status(p),receivedAt:p.receivedAt,voided:p.voided,entryCount:p.entries.length,canEnter:actor.role==='recorder'&&p.entries.length<2&&!p.entries.some(e=>e.by===actor.id)&&!p.resolution&&!p.voided,...(judgement?{entries:p.entries,resolution:p.resolution,voidReason:p.voidReason}:{})}))};
}
module.exports={create,apply,view,results,finalChoice,status,need,text};
