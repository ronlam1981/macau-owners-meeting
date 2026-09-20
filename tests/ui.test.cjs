// DOM integration tests, not a substitute for real-browser print pagination.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { transformSync } = require('@babel/core');
const C = require('../meeting-core.js');
const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const jsx = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
const compiled = transformSync(jsx.replace('root.render(<MacauCondoMeeting />);','window.__root = root; root.render(<MacauCondoMeeting />);'),{presets:[require.resolve('@babel/preset-react')]}).code;
const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>', { url: 'https://test.invalid/macau-owners-meeting/', runScripts:'outside-only' });
global.window=dom.window; global.document=dom.window.document; global.navigator=dom.window.navigator; global.IS_REACT_ACT_ENVIRONMENT=true;
const React = require('react'); const ReactDOM = require('react-dom/client'); const {act}=React;
Object.assign(window,{React,ReactDOM,MeetingCore:C,alert:()=>{},confirm:()=>true});
const KEY='macau-owners-meeting:session:v1';
const unit=(id,p,confirmed=true)=>({id,tower:'A',unit:id,owner:id,valuePercent:p,seqNo:id,isPriorityProxy:false,status:confirmed?'present':'absent',proxyType:'none',proxyToOwnerId:'',proxyNonOwner:{name:'',idCard:'',phone:''},isConfirmed:confirmed,ownerIdCardLast4:confirmed?'1234':''});
const fixture=()=>({meetingInfo:{name:'DOM測試會議',datetime:'2026-09-20',location:'澳門',chair:'主席甲',recorder:'記錄乙',startedAt:100},meetingStatus:'started',units:[unit('U1',15),unit('U2',10),unit('U3',75,false)],agendas:[{id:'A1',title:'預算測試',type:'general_15',status:'voting',startTime:200},{id:'A2',title:'未開放事項',type:'general_15',status:'pending'}],votes:{A1:{U1:'for',U2:'abstain'}}});
async function mount(raw){if(window.__root)await act(()=>window.__root.unmount());window.sessionStorage.clear();if(raw)window.sessionStorage.setItem(KEY,raw);await act(()=>window.eval(compiled));}
function button(text){const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));assert.ok(b,'missing button '+text);return b;}
async function click(text){await act(()=>button(text).click());}
async function change(el,value){await act(()=>{const setter=Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype,'value').set;setter.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function upload(text){const el=document.querySelector('input[accept=".json,application/json"]');Object.defineProperty(el,'files',{configurable:true,value:[{name:'fixture.json',size:text.length,text:async()=>text}]});await act(async()=>el.dispatchEvent(new window.Event('change',{bubbles:true})));}

test('報告完整流程：結束、未表決、列印handler、刷新恢復',async()=>{
 await mount(C.exportBackup(fixture())); await click('管委會及工作人員入口');await click('大會控制');await click('結束會議並生成報告');
 const report=document.querySelector('#print-report-container');assert.ok(report);assert.match(report.textContent,/未表決/);assert.match(report.textContent,/主席甲/);assert.match(report.textContent,/未投/);
 let printed=0;window.print=()=>printed++;await click('列印/儲存PDF');assert.equal(printed,1);
 const saved=window.sessionStorage.getItem(KEY);assert.equal(C.importBackup(saved).meetingStatus,'ended');
 await mount(saved);await click('管委會及工作人員入口');await click('大會控制');await click('查看已結束會議報告');assert.match(document.querySelector('#print-report-container').textContent,/未開放事項/);
});
test('還原預覽、取消、確認；無效檔保留原資料',async()=>{
 await mount();await click('管委會及工作人員入口');const before=window.sessionStorage.getItem(KEY);
 await upload('broken JSON');assert.equal(window.sessionStorage.getItem(KEY),before);assert.match(document.body.textContent,/還原失敗/);
 await upload(C.exportBackup(fixture()));assert.match(document.body.textContent,/2項議程/);assert.equal(window.sessionStorage.getItem(KEY),before);
 await click('取消還原');assert.equal(window.sessionStorage.getItem(KEY),before);
 await upload(C.exportBackup(fixture()));await click('確認還原並取代目前資料');assert.equal(C.importBackup(window.sessionStorage.getItem(KEY)).meetingInfo.name,'DOM測試會議');
});
test('投票UI操作、改票、截止鎖定及新會議清空',async()=>{
 await mount(C.exportBackup(fixture()));
 const selects=[...document.querySelectorAll('select')];const sel=selects.find(s=>[...s.options].some(o=>o.value==='U1'));await change(sel,'U1');
 const pin=document.querySelector('input[maxlength="4"]');await change(pin,'1234');await click('登入大會');await click('反對');
 assert.equal(C.importBackup(window.sessionStorage.getItem(KEY)).votes.A1.U1,'against');await click('贊成');assert.equal(C.importBackup(window.sessionStorage.getItem(KEY)).votes.A1.U1,'for');
 await click('回首頁/登出');await click('管委會及工作人員入口');await click('大會控制');await click('停止計時並結束投票');
 await click('回首頁/登出');const sel2=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='U1'));await change(sel2,'U1');await change(document.querySelector('input[maxlength="4"]'),'1234');await click('登入大會');assert.equal(button('反對').disabled,true);
 await click('回首頁/登出');await click('管委會及工作人員入口');await click('清空並開始新會議');const cleared=C.importBackup(window.sessionStorage.getItem(KEY));assert.equal(cleared.units.length,0);assert.deepEqual(cleared.votes,{});assert.equal(cleared.meetingInfo.startedAt,undefined);
});
test('低於15%可開始；年度例外未確認不能開始',async()=>{
 const s=fixture();s.meetingStatus='pending';delete s.meetingInfo.startedAt;s.units=[unit('U1',10),unit('U2',90,false)];s.agendas=[{id:'A1',title:'年度預算',type:'annual_majority',status:'pending',noticeConfirmed:false}];s.votes={};
 await mount(C.exportBackup(s));await click('管委會及工作人員入口');await click('大會控制');let message='';window.alert=m=>message=m;await click('大會正式開始');assert.match(message,/召集書/);assert.equal(C.importBackup(window.sessionStorage.getItem(KEY)).meetingStatus,'pending');
 await click('議程設定');await act(()=>document.querySelector('input[type="checkbox"]').click());await click('大會控制');await click('大會正式開始');assert.equal(C.importBackup(window.sessionStorage.getItem(KEY)).meetingStatus,'started');
});
test('損壞暫存不被啟動覆蓋；仍可選有效檔還原',async()=>{
 await mount('broken session');assert.equal(window.sessionStorage.getItem(KEY),'broken session');assert.match(document.body.textContent,/暫存未能讀取/);await click('管委會及工作人員入口');await upload(C.exportBackup(fixture()));await click('確認還原並取代目前資料');assert.equal(C.importBackup(window.sessionStorage.getItem(KEY)).meetingStatus,'started');
});
test('匯出按鈕產生可完整還原JSON及下載檔名',async()=>{
 await mount(C.exportBackup(fixture()));await click('管委會及工作人員入口');
 let blob,filename;window.URL.createObjectURL=b=>{blob=b;return 'blob:test';};window.URL.revokeObjectURL=()=>{};
 const original=window.HTMLAnchorElement.prototype.click;window.HTMLAnchorElement.prototype.click=function(){filename=this.download;};
 await click('匯出完整 JSON 備份');window.HTMLAnchorElement.prototype.click=original;
 const text=await new Promise((resolve,reject)=>{const r=new window.FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsText(blob);});
 assert.match(filename,/^macau-meeting-.*\.json$/);assert.deepEqual(C.importBackup(text),C.validateState(fixture()));
});
test('cleanup',async()=>{await act(()=>window.__root.unmount());dom.window.close();});
