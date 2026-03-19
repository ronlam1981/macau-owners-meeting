import { useState, useMemo, useRef, useCallback, useEffect } from "react";

const LAW='《第14/2017號法律》分層建築物共同部分的管理法律制度';
const DEFAULT_PW='1111';

const THRESHOLDS={
  general:    {label:'一般決議',  pct:'15%',law:`${LAW}第29條第1款`,fulltext:'贊成份額大於反對份額，且贊成份額不少於建築物總份額百分之十五',desc:'贊成>反對，且贊成份額≥15%',eg:'批准帳目、通過預算'},
  special:    {label:'特別決議',  pct:'25%',law:`${LAW}第29條第2款`,fulltext:'贊成份額大於反對份額，且贊成份額不少於建築物總份額百分之二十五',desc:'贊成>反對，且贊成份額≥25%',eg:'修改內部規章'},
  majority:   {label:'過半數決議',pct:'50%',law:`${LAW}第29條第3款`,fulltext:'贊成份額超過建築物總份額百分之五十',desc:'贊成份額>50%',eg:'更換管委會'},
  renovation: {label:'更新工程',  pct:'2/3',law:`${LAW}第29條第4款`,fulltext:'贊成份額不少於建築物總份額三分之二（66.67%）',desc:'贊成份額≥66.67%',eg:'外牆翻新'},
};
const PRESETS={
  first:{label:'第一次召開業主大會',agendas:[{title:'選舉大會主席',threshold:'majority'},{title:'宣佈業主大會正式成立',threshold:'general'},{title:'選舉管理委員會',threshold:'majority'},{title:'制定樓宇內部規章',threshold:'majority'},{title:'通過大廈管理年度預算',threshold:'general'}]},
  annual:{label:'法定年度業主大會',agendas:[{title:'選舉大會主席',threshold:'majority'},{title:'審議管理委員會年度工作報告',threshold:'general'},{title:'批准上年度管理帳目',threshold:'general'},{title:'批准本年度管理預算',threshold:'general'},{title:'其他事項',threshold:'general'}]},
};

const LAWS_COMPLETE=[
  {art:'第1條',title:'標的及範圍',fulltext:'本法律訂定分層建築物共同部分的管理法律制度。分層建築物的管理，包括一切旨在促進及規範分層建築物共同部分的使用、收益、安全、保存及改良的行為。',category:'一般規定'},
  {art:'第3條',title:'分層建築物各機關',fulltext:'在簡單管理制度下，設有一個決議機關，稱為分層建築物所有人大會，以及一個執行機關，稱為管理機關。',category:'一般規定'},
  {art:'第4條',title:'分層建築物所有人的權利',fulltext:'分層建築物所有人有以下權利：（一）參與分層建築物所有人大會的會議及投票；（二）在本法律規定的情況下召集分層建築物所有人大會會議；（三）向管理機關提出建議、訴求或投訴；（四）就管理機關的行為向分層建築物所有人大會提出申訴；（五）提起司法訴訟。',category:'業主權利義務'},
  {art:'第5條',title:'分層建築物所有人的義務',fulltext:'分層建築物所有人有以下義務：（一）遵守分層所有權制度的規定及有關樓宇及其設施的建造、保存、使用及安全方面的法例；（二）遵守分層建築物的規章；（三）遵守分層建築物各機關在其職權範圍內所作的決定；（四）繳付分層建築物的負擔。',category:'業主權利義務'},
  {art:'第7條',title:'分層建築物的負擔',fulltext:'分層建築物的負擔是指為分層建築物共同部分的使用、收益、安全、保存及改良所需的開支、為支付屬共同利益的服務所需的開支。包括清潔、保安、管理、保險及各項設施的保養等開支。',category:'財務與負擔'},
  {art:'第8條',title:'分層建築物負擔的分擔及繳付',fulltext:'除分層所有權的設定憑證另有規定外，分層建築物的負擔由全體分層建築物所有人按其獨立單位在分層建築物總值中所占的百分比或千分比攤分。負擔應定期支付，最遲於每月十日向管理機關支付。',category:'財務與負擔'},
  {art:'第10條',title:'共同儲備基金',fulltext:'必須設立分層建築物的共同儲備基金，以承擔非預見性的開支，為避免共同部分的滅失、損毀或損壞所需的開支，以及進行共同部分的保存及修補工作而產生的必要開支。供款金額相當於定期給付數額的十分之一。',category:'財務與負擔'},
  {art:'第14條',title:'更新工程',fulltext:'在分層建築物共同部分進行更新工程，須經分層建築物所有人大會許可方可進行，有關許可須按第29條第4款規定通過的決議作出。更新工程是指導致更改建築線條或外觀的工程，涉及更改結構部分的工程，或更改共同部分用途的工程。',category:'工程管理'},
  {art:'第17條',title:'保險',fulltext:'為建築物投保火險屬強制性，不論獨立單位或共同部分均須投保。火險的保險金額不得低於主管當局所定出的金額。就每一單位的投保應由有關分層建築物所有人進行，就共同部分的投保則應由分層建築物所有人大會指定的人進行。',category:'工程管理'},
  {art:'第20條',title:'分層建築物的規章',fulltext:'有十個以上獨立單位的分層建築物，應具備一份分層建築物的規章，以規範共同部分的使用、收益、安全、保存及改良。規章由分層建築物所有人大會通過，修改亦需大會決議。分層建築物所有人、第三人及獨立單位的任何占有人或持有人，均受規章約束。',category:'組織管理'},
  {art:'第22條',title:'分層建築物所有人大會的職權',fulltext:'分層建築物所有人大會尤其具職權就以下事宜作出決議：（一）組成管理機關；（二）管理機關成員的報酬；（三）選舉及罷免管理機關成員；（四）通過上年度的帳目；（五）通過本年度的預算；（六）通過分層建築物的規章；（七）許可進行更新工程；（八）投保火險及其他保險。',category:'大會職權'},
  {art:'第23條',title:'召集會議',fulltext:'如分層建築物所有人大會尚未舉行第一次會議，則只要出現下列任一情況，實際管理分層建築物的自然人或法人必須召集該會議：（一）分層建築物的半數獨立單位已移轉；（二）分層建築物的百分之三十的獨立單位已被占用；（三）自樓宇使用准照發出之日起十八個月後。',category:'大會程序'},
  {art:'第24條',title:'召集書',fulltext:'分層建築物所有人大會召集書應於舉行會議前，在樓宇入口的大堂連續張貼二十日。召集書必須載有以下事項：（一）舉行會議的日期、時間及地點；（二）會議議程；（三）接收代理文書的地址。',category:'大會程序'},
  {art:'第26條',title:'代理',fulltext:'分層建築物所有人可由受權人或另一分層建築物所有人代理。受權人需具備經公證認定被代理人簽名的函件；另一業主代理需具備被代理人簽名的函件並出示身份證明文件副本。代理文件應在會議開始前送交召集人。',category:'大會程序'},
  {art:'第27條',title:'委託投票之限制',fulltext:'非業主代理人最多可代表兩名業主；業主代理人則不設此限制。',category:'大會程序'},
  {art:'第28條',title:'投票',fulltext:'每一分層建築物所有人在分層建築物所有人大會上按其獨立單位在分層建築物總值中所占的百分比或千分比擁有相應的票數。投票是透過選票指出意向而作出。',category:'大會程序'},
  {art:'第29條',title:'法定份額與決議門檻',fulltext:'一般決議：贊成份額大於反對份額，且贊成份額不少於總份額15%。特別決議：贊成份額大於反對份額，且贊成份額不少於總份額25%。過半數決議：贊成份額超過總份額50%。更新工程：贊成份額不少於總份額2/3（66.67%）。',category:'決議程序'},
  {art:'第31條',title:'決議之效力',fulltext:'業主大會依法定程序通過之決議，對所有業主均具約束力，包括缺席或反對之業主。決議應記錄於會議紀錄冊內，並由管理委員會主席及秘書簽署。',category:'決議程序'},
  {art:'第32條',title:'會議紀錄',fulltext:'業主大會每次會議均須製作會議紀錄，內容須包括出席業主名單、討論事項、投票結果及通過之決議。會議紀錄須於大會後30日內完成，並由管理委員會主席簽署確認。',category:'大會程序'},
  {art:'第38條',title:'管理機關組成及報酬',fulltext:'管理機關可由一名或多名成員組成；屬多於一百個獨立單位的分層建築物，須由至少三名成員組成。屬分層建築物所有人及適用第6條規定的用益權人及預約取得人，方可成為管理機關成員。管理機關成員的報酬按分層建築物所有人大會的決議的規定及條件支付。',category:'管理機構'},
  {art:'第39條',title:'選舉及罷免',fulltext:'管理機關成員由分層建築物所有人大會選出。必須具備合理理由，方可按第29條第2款規定經分層建築物所有人大會議決罷免管理機關成員。合理理由包括：嚴重或重複地違反其職責，執行有關職務時因職務而犯罪，或欠缺執行職務的能力。',category:'管理機構'},
  {art:'第40條',title:'任期',fulltext:'管理機關成員的任期不可超過三年，且須透過分層建築物所有人大會的另一決議方可續任。管理機關應在任期屆滿前至少三個月，召集分層建築物所有人大會會議，以便選出管理機關成員。',category:'管理機構'},
  {art:'第43條',title:'管理機關職務',fulltext:'管理機關的職務包括：召集分層建築物所有人大會會議；編製及提交上年度的帳目及本年度的預算；收取各項收入及作出各項開支；要求每一分層建築物所有人支付應付的負擔；投保及續保有關保險；監督共有物的使用；執行分層建築物所有人大會的決議。',category:'管理機構'},
  {art:'第47條',title:'管理機關成員的義務',fulltext:'管理機關成員應謹慎及善意地執行職務，其所作出的行為應符合分層建築物所有人的利益。管理機關成員必須創設條件使分層建築物所有人在有需要時能與其聯絡，並平等及公平對待分層建築物所有人。',category:'管理機構'},
  {art:'第49條',title:'與商業企業主訂立的合同',fulltext:'為協助管理機關成員執行其職務，分層建築物所有人大會可議決聘請提供分層建築物管理服務的商業企業主。合同須以書面方式訂立，應列明提供服務者的識別資料、合同期間、合同的標的、服務的回報及支付條件。',category:'管理機構'},
];

const STAGE_META={
  idle:    {label:'待開始',    badge:'gray',  next:'intro',  nextBtn:'▶ 開始介紹'},
  intro:   {label:'介紹中',    badge:'blue',  next:'voting', nextBtn:'🗳 開始投票'},
  voting:  {label:'投票進行中',badge:'green', next:'closed', nextBtn:'🔒 截止投票'},
  closed:  {label:'投票截止',  badge:'amber', next:'results',nextBtn:'📊 公佈結果'},
  results: {label:'結果已公佈',badge:'purple',next:null,     nextBtn:null},
};
const STAGE_BTN={idle:'bg-blue-600 hover:bg-blue-700',intro:'bg-green-600 hover:bg-green-700',voting:'bg-red-600 hover:bg-red-700',closed:'bg-purple-600 hover:bg-purple-700'};

const mkId=()=>Math.random().toString(36).slice(2,9);
const fmtNow=()=>new Date().toLocaleString('zh-TW',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const initSD=()=>({stage:'idle',introAt:null,votingAt:null,closedAt:null,resultsAt:null,notes:''});

const INIT_UNITS=[
  {id:'1A',owner:'陳大文',share:10.00},{id:'1B',owner:'李小華',share:9.50},
  {id:'2A',owner:'張美玲',share:10.00},{id:'2B',owner:'黃偉明',share:9.50},
  {id:'3A',owner:'劉志強',share:10.00},{id:'3B',owner:'吳麗珍',share:9.50},
  {id:'4A',owner:'鄭國雄',share:10.00},{id:'4B',owner:'林翠芳',share:9.50},
  {id:'5A',owner:'何建國',share:11.00},{id:'5B',owner:'梁淑儀',share:11.00},
].map(u=>({...u,status:'absent',proxyType:null,proxyToOwnerId:null,password:DEFAULT_PW,verified:false,ballotType:'online'}));

// ── UI ──
const Badge=({children,color='gray'})=>{
  const c={blue:'bg-blue-100 text-blue-800',green:'bg-green-100 text-green-800',red:'bg-red-100 text-red-700',yellow:'bg-yellow-100 text-yellow-800',gray:'bg-slate-100 text-slate-600',purple:'bg-purple-100 text-purple-800',amber:'bg-amber-100 text-amber-800',orange:'bg-orange-100 text-orange-700'};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c[color]||c.gray}`}>{children}</span>;
};
const Bar=({pct,color='blue'})=>{
  const c={blue:'bg-blue-500',green:'bg-green-500',red:'bg-red-400',yellow:'bg-yellow-400',slate:'bg-slate-400'};
  return <div className="w-full bg-slate-100 rounded-full h-2"><div className={`${c[color]} h-2 rounded-full transition-all duration-500`} style={{width:`${Math.min(100,Math.max(0,pct))}%`}}/></div>;
};
const Spinner=()=><div className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>;
const MeetingMeta=({meeting,light=false})=>{
  const s=light?'text-slate-400':'text-slate-500';
  const parts=[];
  if(meeting.date)parts.push(`📅 ${meeting.date}`);
  if(meeting.time)parts.push(`🕐 ${meeting.time}`);
  if(meeting.location)parts.push(`📍 ${meeting.location}`);
  if(!parts.length)return null;
  return <p className={`text-xs mt-0.5 ${s}`}>{parts.join('　·　')}</p>;
};

const calcResult=(a,confirmedUnits,votes,totalShare)=>{
  const av=votes[a.id]||{};let yes=0,no=0,abs=0;
  confirmedUnits.forEach(u=>{const v=av[u.id];if(v==='yes')yes+=u.share;else if(v==='no')no+=u.share;else if(v==='abs')abs+=u.share;});
  const yp=totalShare>0?yes/totalShare*100:0,np=totalShare>0?no/totalShare*100:0,ap=totalShare>0?abs/totalShare*100:0;
  let passed=false;
  if(a.threshold==='general')passed=yes>no&&yp>=15;
  if(a.threshold==='special')passed=yes>no&&yp>=25;
  if(a.threshold==='majority')passed=yp>50;
  if(a.threshold==='renovation')passed=yp>=66.67;
  return{yp,np,ap,passed};
};

// ── Law Browser ──
const LawBrowser=({onBack,backLabel='← 返回'})=>{
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState('');
  const categories=useMemo(()=>[...new Set(LAWS_COMPLETE.map(l=>l.category))],[]);
  const filtered=useMemo(()=>{
    let result=LAWS_COMPLETE;
    if(category)result=result.filter(l=>l.category===category);
    if(search)result=result.filter(l=>l.art.includes(search)||l.title.includes(search)||l.fulltext.includes(search));
    return result;
  },[category,search]);

  return(
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-800 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-300 hover:text-white text-sm">{backLabel}</button>
        <span className="font-semibold">{LAW} — 法律檢索</span>
      </div>
      <div className="max-w-3xl mx-auto p-5">
        <div className="mb-5 flex gap-3 flex-col">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索文章或關鍵字..." className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500"/>
          <div className="flex flex-wrap gap-2">
            <button onClick={()=>setCategory('')} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${category===''?'bg-blue-600 text-white':'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>全部分類</button>
            {categories.map(cat=>(
              <button key={cat} onClick={()=>setCategory(cat)} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${category===cat?'bg-blue-600 text-white':'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>{cat}</button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          {filtered.map(law=>(
            <div key={law.art} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-bold text-slate-800">{law.art} {law.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5"><Badge color="blue">{law.category}</Badge></div>
                </div>
              </div>
              <p className="text-slate-700 text-sm leading-relaxed">{law.fulltext}</p>
            </div>
          ))}
          {filtered.length===0&&<div className="text-center text-slate-500 py-8">未找到相關條文</div>}
        </div>
      </div>
    </div>
  );
};

// ── Law View ──
const LawView=({onBack,backLabel='← 返回'})=>{
  const [tab,setTab]=useState('thresholds');
  return(
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-800 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-300 hover:text-white text-sm">{backLabel}</button>
        <span className="font-semibold">{LAW} 法律參考</span>
      </div>
      <div className="bg-white border-b border-slate-200 px-4">
        <div className="flex">
          {[{id:'thresholds',label:'決議門檻'},{id:'browser',label:'完整法律檢索'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab===t.id?'border-blue-600 text-blue-600':'border-transparent text-slate-500 hover:text-slate-700'}`}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="max-w-2xl mx-auto p-5">
        {tab==='thresholds'&&<div className="space-y-4">
          {Object.entries(THRESHOLDS).map(([k,v])=>(
            <div key={k} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="font-bold text-slate-800 mb-2">{v.label} ({v.pct})</div>
              <div className="text-xs text-slate-600 mb-2">{v.law}</div>
              <p className="text-sm text-slate-700 mb-2">{v.fulltext}</p>
              <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded"><strong>簡述：</strong> {v.desc}</div>
              <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded mt-2"><strong>例子：</strong> {v.eg}</div>
            </div>
          ))}
        </div>}
        {tab==='browser'&&<div><LawBrowser onBack={()=>setTab('thresholds')} backLabel='← 返回決議門檻'/></div>}
      </div>
    </div>
  );
};

export default function App(){
  const [view,setView]=useState('home');
  const [subView,setSubView]=useState(null);
  const [adminTab,setAdminTab]=useState('roster');
  const [meeting,setMeeting]=useState({title:'',date:'',time:'',location:'',notes:''});
  const [units,setUnits]=useState(INIT_UNITS);
  const [newU,setNewU]=useState({id:'',owner:'',share:''});
  const [newA,setNewA]=useState({title:'',threshold:'general'});
  const [agendas,setAgendas]=useState([]);
  const [presetAgendas,setPresetAgendas]=useState([]);
  const [presetSelection,setPresetSelection]=useState({});
  const [agendaStages,setAS]=useState({});
  const [votes,setVotes]=useState({});
  const [adminPw,setAdminPw]=useState('');
  const [loginId,setLoginId]=useState('');
  const [loginPw,setLoginPw]=useState('');
  const [loginErr,setLoginErr]=useState('');
  const [status,setStatus]=useState('pending');
  const [clock,setClock]=useState(fmtNow());
  const csvRef=useRef(null);

  useEffect(()=>{const ti=setInterval(()=>setClock(fmtNow()),1000);return()=>clearInterval(ti);},[]);

  const clockStr=clock.slice(11,19);
  const confirmedUnits=units.filter(u=>u.verified);
  const totalShare=units.reduce((s,u)=>s+u.share,0);
  const confShare=confirmedUnits.reduce((s,u)=>s+u.share,0);
  const confPct=totalShare>0?confShare/totalShare*100:0;
  const quorum=confPct>=15;

  const adminLogin=()=>{if(adminPw==='0000'){setView('admin');setAdminPw('');}else alert('密碼錯誤');};
  const userLogin=()=>{const u=units.find(x=>x.id===loginId.trim().toUpperCase());if(!u){setLoginErr('單位不存在');return;}if(u.password!==loginPw){setLoginErr('密碼錯誤');return;}setView('user');setLoginId('');setLoginPw('');};

  const updateNotes=(id,notes)=>setAS(p=>({...p,[id]:{...(p[id]||initSD()),notes}}));

  const addUnit=()=>{const id=newU.id.trim().toUpperCase();if(!id||!newU.owner.trim()||!newU.share)return;if(units.find(u=>u.id===id))return alert('單位編號已存在');setUnits(p=>[...p,{id,owner:newU.owner.trim(),share:parseFloat(newU.share),status:'absent',proxyType:null,proxyToOwnerId:null,password:DEFAULT_PW,verified:false,ballotType:'online'}]);setNewU({id:'',owner:'',share:''});};
  const addAgenda=()=>{if(!newA.title.trim())return;const id=mkId();setAgendas(p=>[...p,{id,title:newA.title.trim(),threshold:newA.threshold}]);setAS(p=>({...p,[id]:initSD()}));setNewA({title:'',threshold:'general'});};
  const loadPreset=(type)=>{
    const nag=PRESETS[type].agendas.map(a=>({id:mkId(),...a}));
    setPresetAgendas(nag);
    const sel={};nag.forEach(a=>{sel[a.id]=true;});
    setPresetSelection(sel);
  };
  const importCSV=(e)=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{const imp=[];ev.target.result.split('\n').slice(1).forEach(l=>{const[id,owner,share]=l.split(',').map(s=>s.trim());if(id&&owner&&share&&!units.find(u=>u.id===id.toUpperCase()))imp.push({id:id.toUpperCase(),owner,share:parseFloat(share),status:'absent',proxyType:null,proxyToOwnerId:null,password:DEFAULT_PW,verified:false,ballotType:'online'});});setUnits(p=>[...p,...imp]);alert(`已成功匯入 ${imp.length} 個單位`);};r.readAsText(file);e.target.value='';};

  const canStart=quorum&&agendas.length>0&&meeting.title.trim()&&meeting.date.trim()&&meeting.time.trim()&&meeting.location.trim();
  const startBlockReason=()=>{if(!meeting.title.trim())return'請先填寫大會全稱';if(!meeting.date.trim())return'請先填寫召開日期';if(!meeting.time.trim())return'請先填寫召開時間';if(!meeting.location.trim())return'請先填寫會議地點';if(agendas.length===0)return'請先設定議程';if(!quorum)return`出席份額${confPct.toFixed(1)}%未達15%`;return null;};

  const exportResultPDF=()=>{const w=window.open('','_blank');w.document.write(buildPDF(meeting,agendas,agendaStages,votes,confirmedUnits,totalShare));w.document.close();};
  const exportResultCSV=()=>{let rows='議案,單位,業主姓名,份額(%),投票\n';agendas.forEach(a=>confirmedUnits.forEach(u=>{const v=(votes[a.id]||{})[u.id]||'—';rows+=`"${a.title}",${u.id},"${u.owner}",${u.share.toFixed(2)},${v==='yes'?'贊成':v==='no'?'反對':v==='abs'?'棄權':'未投票'}\n`;}));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+rows],{type:'text/csv'}));a.download='投票記錄.csv';a.click();};

  const ADMIN_TABS=[{id:'roster',label:'📋 業主名冊'},{id:'attendance',label:'✅ 出席登記'},{id:'agenda',label:'📄 議程管理'},{id:'control',label:'🔔 會議控制'},{id:'export',label:'📤 匯出'},{id:'law',label:'📖 法律參考'},...(status==='ended'?[{id:'summary',label:'🏁 大會總結',hl:true}]:[])];
  const OWNER_TABS=[{id:'vote',label:'🗳 投票'},{id:'export',label:'📊 結果匯出'},{id:'law',label:'📖 法律參考'}];

  // ════ SHARED LAW VIEW ════
  if(view==='law_page')return <LawView onBack={()=>setView('home')}/>;

  // ════ HOME ════
  if(view==='home')return(
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white text-xl">業</div>
            <div><div className="text-white font-bold text-lg">澳門業主大會管理與投票系統</div><div className="text-slate-400 text-xs">依據{LAW.split('《')[1].split('》')[0]}設計</div></div>
          </div>
          <div className="text-right hidden md:block"><div className="text-green-400 font-mono text-sm">{clockStr}</div><div className="text-slate-500 text-xs">系統時間</div></div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <h2 className="text-white text-2xl font-bold">{meeting.title}</h2>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {meeting.date&&meeting.time&&<span className="text-slate-300 text-sm">📅 {meeting.date}　🕐 {meeting.time}</span>}
              {meeting.location&&<span className="text-slate-300 text-sm">📍 {meeting.location}</span>}
            </div>
            {meeting.notes&&<p className="text-slate-400 text-xs mt-1">備註：{meeting.notes}</p>}
            <p className="text-slate-500 text-sm mt-3">請選擇您的身份登入</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-1"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm">⚙</div><span className="text-white font-semibold">管理委員會</span></div>
              <p className="text-slate-400 text-xs mb-4">業主名冊、出席登記、議程控制及匯出</p>
              <input type="password" placeholder="管理員密碼" value={adminPw} onChange={e=>setAdminPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&adminLogin()} className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-blue-400"/>
              <button onClick={adminLogin} className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium transition-colors">管理員登入</button>
              <p className="text-slate-500 text-xs text-center mt-2">預設密碼：0000</p>
            </div>
            <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-1"><div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-sm">👤</div><span className="text-white font-semibold">業主 / 授權代理人</span></div>
              <p className="text-slate-400 text-xs mb-4">親身出席業主或授權代理人，均以單位號碼登入</p>
              {(()=>{
                const eligible=units.filter(u=>u.verified&&u.status!=='absent');
                const filtered=loginId.trim()===''?eligible:eligible.filter(u=>u.id.toUpperCase().includes(loginId.trim().toUpperCase())||u.owner.includes(loginId.trim()));
                const exact=eligible.find(u=>u.id===loginId.trim().toUpperCase());
                return(<>
                  <div className="relative mb-2">
                    <input type="text" placeholder="輸入單位號碼（如：1A）" value={loginId} onChange={e=>{setLoginId(e.target.value);setLoginErr('');}}
                      className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400" autoComplete="off"/>
                    {loginId.length>0&&!exact&&filtered.length>0&&(
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-slate-700 border border-slate-500 rounded-xl overflow-hidden shadow-xl max-h-40 overflow-y-auto">
                        {filtered.map(u=>(
                          <button key={u.id} onClick={()=>setLoginId(u.id)}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-600 text-left transition-colors">
                            <span className="font-mono font-bold text-emerald-400 w-10 shrink-0">{u.id}</span>
                            <span className="text-white text-sm flex-1 truncate">{u.owner}</span>
                            <span className="text-slate-400 text-xs shrink-0">{u.share.toFixed(1)}%</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {eligible.length===0&&<p className="text-amber-400 text-xs mt-1">尚無已核實業主，請聯絡管委會。</p>}
                  </div>
                  <input type="password" placeholder="登入密碼（預設：1111）" value={loginPw} onChange={e=>setLoginPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&userLogin()}
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-400"/>
                  {loginErr&&<p className="text-red-400 text-xs mb-2">{loginErr}</p>}
                  <button onClick={userLogin} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium transition-colors">登入</button>
                  <p className="text-slate-500 text-xs text-center mt-2">非業主代理人亦使用所代理之單位號碼登入</p>
                </>);
              })()}
            </div>
          </div>
          <div className="flex justify-center">
            <button onClick={()=>setView('law_page')} className="text-slate-400 hover:text-slate-200 text-sm underline">📖 法律條文參考</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ════ ADMIN ════
  if(view==='admin'){
    if(subView==='law')return <LawView onBack={()=>setSubView(null)} backLabel='← 返回後台'/>;
    return(
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">業</div>
          <div><span className="font-semibold text-sm">{meeting.title} — 管委會後台</span><MeetingMeta meeting={meeting} light/></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-green-400 font-mono text-xs bg-slate-900 px-2.5 py-1 rounded-lg">🕐 {clockStr}</div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${quorum?'bg-green-600':'bg-amber-500'}`}>出席 {confPct.toFixed(1)}% {quorum?'✅':'⚠️'}</span>
          <span className={`text-xs px-2.5 py-1 rounded-full ${status==='pending'?'bg-slate-600':status==='started'?'bg-green-600':'bg-red-700'}`}>{status==='pending'?'待開會':status==='started'?'● 進行中':'已結束'}</span>
          <button onClick={()=>setSubView('law')} className="text-slate-300 hover:text-white text-xs border border-slate-600 px-2 py-1 rounded">📖 法律</button>
          <button onClick={()=>setView('home')} className="text-slate-300 hover:text-white text-xs border border-slate-600 px-2 py-1 rounded">← 首頁</button>
        </div>
      </div>
      <div className="bg-white border-b border-slate-200 px-2 overflow-x-auto">
        <div className="flex min-w-max">{ADMIN_TABS.map(t=>(<button key={t.id} onClick={()=>setAdminTab(t.id)} className={`px-4 py-3 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${adminTab===t.id?'border-blue-600 text-blue-600':'border-transparent text-slate-500 hover:text-slate-700'} ${t.hl?'text-green-600 font-semibold':''}`}>{t.label}</button>))}</div>
      </div>
      <div className="p-4 max-w-5xl mx-auto">

        {/* ROSTER */}
        {adminTab==='roster'&&<div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-slate-800">業主名冊管理</h2>
            <div className="flex gap-2 items-center">
              <input ref={csvRef} type="file" accept=".csv" onChange={importCSV} className="hidden"/>
              <button onClick={()=>csvRef.current.click()} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg">📥 CSV 匯入</button>
              <button onClick={()=>{const blob=new Blob(['\uFEFF單位號碼,業主姓名,份額(%)\n'+units.map(u=>`${u.id},${u.owner},${u.share.toFixed(2)}`).join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='業主名冊.csv';a.click();}} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg">📤 CSV 匯出</button>
              <span className="text-slate-400 text-xs">{units.length} 單位｜{totalShare.toFixed(2)}%</span>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-amber-800 text-xs">CSV 格式：<code className="bg-amber-100 px-1 rounded">單位號碼, 業主姓名, 份額(%)</code>　｜　預設密碼：<strong>{DEFAULT_PW}</strong></div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3">
            <p className="text-blue-700 font-medium text-xs mb-2">新增單位</p>
            <div className="flex gap-2 flex-wrap">
              <input value={newU.id} onChange={e=>setNewU(p=>({...p,id:e.target.value}))} placeholder="單位號碼" className="border border-slate-300 rounded px-3 py-1.5 text-sm w-24"/>
              <input value={newU.owner} onChange={e=>setNewU(p=>({...p,owner:e.target.value}))} placeholder="業主姓名" className="border border-slate-300 rounded px-3 py-1.5 text-sm flex-1 min-w-32"/>
              <input value={newU.share} onChange={e=>setNewU(p=>({...p,share:e.target.value}))} type="number" step="0.01" placeholder="份額(%)" className="border border-slate-300 rounded px-3 py-1.5 text-sm w-28"/>
              <button onClick={addUnit} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">新增</button>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide"><tr><th className="text-left px-4 py-2.5">單位</th><th className="text-left px-4 py-2.5">業主</th><th className="text-right px-4 py-2.5">份額</th><th className="text-center px-4 py-2.5">狀態</th><th className="text-center px-4 py-2.5">核驗</th><th className="text-center px-4 py-2.5">操作</th></tr></thead>
              <tbody>{units.map((u,i)=>(<tr key={u.id} className={`border-b border-slate-100 ${i%2===0?'':'bg-slate-50/40'}`}><td className="px-4 py-2.5 font-mono font-bold text-slate-800">{u.id}</td><td className="px-4 py-2.5 text-slate-700">{u.owner}</td><td className="px-4 py-2.5 text-right text-slate-500">{u.share.toFixed(2)}%</td><td className="px-4 py-2.5 text-center">{u.status==='absent'?<Badge>缺席</Badge>:u.status==='present'?<Badge color="green">親身</Badge>:u.proxyType==='owner'?<Badge color="blue">→{u.proxyToOwnerId}</Badge>:<Badge color="purple">非業主代理</Badge>}</td><td className="px-4 py-2.5 text-center">{u.verified?'✅':'—'}</td><td className="px-4 py-2.5 text-center"><button onClick={()=>setUnits(p=>p.filter(x=>x.id!==u.id))} className="text-red-400 hover:text-red-600 text-xs">刪除</button></td></tr>))}</tbody>
            </table>
          </div>
        </div>}

        {/* ATTENDANCE */}
        {adminTab==='attendance'&&<div>
          <h2 className="font-semibold text-slate-800 mb-3">出席身份登記</h2>
          <div className="space-y-3">{units.map(u=>(
            <div key={u.id} className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-1">
                  <div className="font-mono font-bold text-blue-600 w-10">{u.id}</div>
                  <div className="flex-1 min-w-0"><div className="font-medium text-slate-800">{u.owner}</div><div className="text-xs text-slate-500">{u.share.toFixed(2)}%</div></div>
                </div>
                <select value={u.status} onChange={e=>setUnits(p=>p.map(x=>x.id===u.id?{...x,status:e.target.value}:x))} className="border border-slate-300 rounded px-3 py-1.5 text-sm">
                  <option value="absent">缺席</option>
                  <option value="present">親身出席</option>
                  <option value="proxy_owner">業主代理</option>
                  <option value="proxy_other">非業主代理</option>
                </select>
                {(u.status==='proxy_owner'||u.status==='proxy_other')&&(
                  <select value={u.proxyToOwnerId||''} onChange={e=>setUnits(p=>p.map(x=>x.id===u.id?{...x,proxyToOwnerId:e.target.value}:x))} className="border border-slate-300 rounded px-3 py-1.5 text-sm">
                    <option value="">代理給...</option>
                    {units.filter(x=>x.id!==u.id).map(x=><option key={x.id} value={x.id}>{x.id} - {x.owner}</option>)}
                  </select>
                )}
                <button onClick={()=>setUnits(p=>p.map(x=>x.id===u.id?{...x,verified:!x.verified}:x))} className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${u.verified?'bg-green-600 text-white':'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>{u.verified?'✅ 已核驗':'核驗'}</button>
              </div>
            </div>
          ))}</div>
        </div>}

        {/* AGENDA */}
        {adminTab==='agenda'&&<div>
          <h2 className="font-semibold text-slate-800 mb-3">議程管理</h2>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <p className="text-blue-700 font-medium text-xs mb-3">快速載入預設議程</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(PRESETS).map(([k,p])=>(
                <button key={k} onClick={()=>loadPreset(k)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">{p.label}</button>
              ))}
            </div>
            {presetAgendas.length>0&&(
              <div className="mt-4 pt-4 border-t border-blue-300">
                <p className="text-blue-700 font-medium text-xs mb-2">選擇要加入的議程（可取消勾選）</p>
                <div className="space-y-2">
                  {presetAgendas.map(a=>(
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={presetSelection[a.id]||false} onChange={e=>setPresetSelection(p=>({...p,[a.id]:e.target.checked}))} className="w-4 h-4"/>
                      <span className="text-sm text-slate-700">{a.title} <span className="text-xs text-slate-500">({THRESHOLDS[a.threshold].label})</span></span>
                    </label>
                  ))}
                </div>
                <button onClick={()=>{const sel=Object.entries(presetSelection).filter(([,v])=>v).map(([id])=>presetAgendas.find(a=>a.id===id)).filter(Boolean);setAgendas(p=>[...p,...sel]);setPresetAgendas([]);setPresetSelection({});}} className="mt-3 bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">確認加入選中議程</button>
              </div>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
            <p className="text-slate-700 font-medium text-xs mb-2">新增單項議程</p>
            <div className="flex gap-2 flex-wrap">
              <input value={newA.title} onChange={e=>setNewA(p=>({...p,title:e.target.value}))} placeholder="議程名稱" className="border border-slate-300 rounded px-3 py-1.5 text-sm flex-1 min-w-40"/>
              <select value={newA.threshold} onChange={e=>setNewA(p=>({...p,threshold:e.target.value}))} className="border border-slate-300 rounded px-3 py-1.5 text-sm">
                {Object.entries(THRESHOLDS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              <button onClick={addAgenda} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">新增</button>
            </div>
          </div>
          {agendas.length>0&&(
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-700 text-sm">當前議程列表</h3>
              {agendas.map((a,i)=>(
                <div key={a.id} className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-medium text-slate-800">{i+1}. {a.title}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{THRESHOLDS[a.threshold].law} — {THRESHOLDS[a.threshold].desc}</div>
                    </div>
                    <button onClick={()=>setAgendas(p=>p.filter(x=>x.id!==a.id))} className="text-red-400 hover:text-red-600 text-sm">刪除</button>
                  </div>
                  <textarea value={agendaStages[a.id]?.notes||''} onChange={e=>updateNotes(a.id,e.target.value)} placeholder="備註..." className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-400"/>
                </div>
              ))}
            </div>
          )}
        </div>}

        {/* CONTROL */}
        {adminTab==='control'&&<div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <label className="text-xs text-slate-600 font-medium">大會全稱</label>
              <input value={meeting.title} onChange={e=>setMeeting(p=>({...p,title:e.target.value}))} className="w-full border border-slate-300 rounded mt-1 px-3 py-2 text-sm outline-none focus:border-blue-400"/>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <label className="text-xs text-slate-600 font-medium">召開日期</label>
              <input value={meeting.date} onChange={e=>setMeeting(p=>({...p,date:e.target.value}))} type="date" className="w-full border border-slate-300 rounded mt-1 px-3 py-2 text-sm outline-none focus:border-blue-400"/>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <label className="text-xs text-slate-600 font-medium">召開時間</label>
              <input value={meeting.time} onChange={e=>setMeeting(p=>({...p,time:e.target.value}))} type="time" className="w-full border border-slate-300 rounded mt-1 px-3 py-2 text-sm outline-none focus:border-blue-400"/>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <label className="text-xs text-slate-600 font-medium">會議地點</label>
              <input value={meeting.location} onChange={e=>setMeeting(p=>({...p,location:e.target.value}))} className="w-full border border-slate-300 rounded mt-1 px-3 py-2 text-sm outline-none focus:border-blue-400"/>
            </div>
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-lg p-4">
              <label className="text-xs text-slate-600 font-medium">備註</label>
              <textarea value={meeting.notes} onChange={e=>setMeeting(p=>({...p,notes:e.target.value}))} className="w-full border border-slate-300 rounded mt-1 px-3 py-2 text-sm outline-none focus:border-blue-400" rows="2"/>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-slate-800">會議狀態</span>
              <select value={status} onChange={e=>setStatus(e.target.value)} className="border border-slate-300 rounded px-3 py-1.5 text-sm">
                <option value="pending">待開會</option>
                <option value="started">進行中</option>
                <option value="ended">已結束</option>
              </select>
            </div>
          </div>
          <div className={`p-4 rounded-lg ${canStart?'bg-green-50 border border-green-300':'bg-red-50 border border-red-300'}`}>
            {startBlockReason()?<div className="text-sm text-red-700"><strong>⚠️ 無法開始會議</strong><p className="mt-1">{startBlockReason()}</p></div>:<div className="text-sm text-green-700"><strong>✅ 可開始會議</strong></div>}
          </div>
        </div>}

        {/* EXPORT */}
        {adminTab==='export'&&<div>
          <div className="space-y-3">
            <button onClick={exportResultCSV} className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium">📥 匯出為 CSV</button>
            <button onClick={exportResultPDF} className="w-full bg-red-600 text-white px-4 py-2.5 rounded-lg hover:bg-red-700 text-sm font-medium">📄 匯出為 PDF</button>
          </div>
        </div>}

        {/* LAW */}
        {adminTab==='law'&&<LawView onBack={()=>setAdminTab('roster')} backLabel='← 返回議程'/>}
      </div>
    </div>
    );
  }

  // ════ USER ════
  const currentUser=units.find(u=>u.id===loginId.trim().toUpperCase());
  if(view==='user'){
    if(subView==='law')return <LawView onBack={()=>setSubView(null)} backLabel='← 返回投票'/>;
    return(
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2"><div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center font-bold text-sm">👤</div><div><span className="font-semibold text-sm">{currentUser?.owner} ({currentUser?.id}) — 投票介面</span><MeetingMeta meeting={meeting} light/></div></div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-green-400 font-mono text-xs bg-slate-900 px-2.5 py-1 rounded-lg">🕐 {clockStr}</div>
          <button onClick={()=>setSubView('law')} className="text-slate-300 hover:text-white text-xs border border-slate-600 px-2 py-1 rounded">📖 法律</button>
          <button onClick={()=>{setView('home');setLoginId('');setLoginPw('');}} className="text-slate-300 hover:text-white text-xs border border-slate-600 px-2 py-1 rounded">← 登出</button>
        </div>
      </div>
      <div className="bg-white border-b border-slate-200 px-2 overflow-x-auto">
        <div className="flex min-w-max">{OWNER_TABS.map(t=>(<button key={t.id} onClick={()=>setSubView(t.id==='vote'?null:t.id)} className={`px-4 py-3 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${(t.id==='vote'?subView===null:subView===t.id)?'border-emerald-600 text-emerald-600':'border-transparent text-slate-500 hover:text-slate-700'}`}>{t.label}</button>))}</div>
      </div>
      <div className="p-4 max-w-2xl mx-auto">
        {!subView&&<div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-800 text-sm">
            <strong>⚠️ 投票須知</strong>：您的投票將被記錄。每項議案可選擇贊成、反對或棄權。投票結果將根據《第14/2017號法律》相關條文進行統計。
          </div>
          {agendas.map((a,i)=>{
            const res=calcResult(a,confirmedUnits,[votes[a.id]||{}][0]?votes[a.id]||{}:{},totalShare);
            return(
            <div key={a.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-slate-800">{i+1}. {a.title}</div>
                  <div className="text-xs text-slate-600 mt-1">{THRESHOLDS[a.threshold].law}</div>
                </div>
              </div>
              <div className="flex gap-2 mb-3">
                {['yes','no','abs'].map(v=>(
                  <button key={v} onClick={()=>setVotes(p=>({...p,[a.id]:{...(p[a.id]||{}),current_user:v}}))} className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${(votes[a.id]?.currentUser)===v?'bg-blue-600 text-white':'border border-slate-300 text-slate-700 hover:border-blue-400'}`}>
                    {v==='yes'?'✅ 贊成':v==='no'?'❌ 反對':'⚪ 棄權'}
                  </button>
                ))}
              </div>
              {updateNotes&&<textarea placeholder="投票說明（可選）..." className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-400" rows="2"/>}
            </div>
            );
          })}
        </div>}
        {subView==='export'&&<div className="space-y-3"><button onClick={exportResultCSV} className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium">📥 匯出投票記錄</button></div>}
        {subView==='law'&&<LawView onBack={()=>setSubView(null)} backLabel='← 返回投票'/>}
      </div>
    </div>
    );
  }
}

function buildPDF(meeting,agendas,agendaStages,votes,confirmedUnits,totalShare){
  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>業主大會記錄</title><style>body{font-family:Arial,sans-serif;margin:20px;color:#333}h1{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin:15px 0}.result{padding:10px;background:#f0f9ff;border:1px solid #bfdbfe;margin:10px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#e0e7ff}</style></head><body>`;
  html+=`<h1>澳門業主大會會議記錄</h1>`;
  html+=`<div><strong>大會全稱：</strong>${meeting.title}</div>`;
  html+=`<div><strong>召開日期：</strong>${meeting.date} ${meeting.time}</div>`;
  html+=`<div><strong>會議地點：</strong>${meeting.location}</div>`;
  html+=`<h2>投票結果統計</h2>`;
  html+=`<table><thead><tr><th>議案</th><th>贊成</th><th>反對</th><th>棄權</th><th>結果</th></tr></thead><tbody>`;
  agendas.forEach(a=>{const r=calcResult(a,confirmedUnits,votes[a.id]||{},totalShare);html+=`<tr><td>${a.title}</td><td>${r.yp.toFixed(1)}%</td><td>${r.np.toFixed(1)}%</td><td>${r.ap.toFixed(1)}%</td><td>${r.passed?'✅ 通過':'❌ 未通過'}</td></tr>`;});
  html+=`</tbody></table><hr><div style="font-size:12px;color:#666;margin-top:20px;">根據《第14/2017號法律》生成 · ${new Date().toLocaleString('zh-TW')}</div></body></html>`;
  return html;
}
