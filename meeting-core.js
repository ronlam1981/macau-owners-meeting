/* Shared by the browser and node:test. See docs/voting-rules.md for scope. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeetingCore = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const SCHEMA_VERSION = 1;
  const RULE_VERSION = 'mo-14-2017-2026-09-20-v1';
  const SCALE = 1000000;
  const TOTAL = 100 * SCALE;
  const RULES = Object.freeze({
    general_15: { label: '一般決議', desc: '贊成超過出席份額一半，且佔總值至少15%（第29條第1款）' },
    special_25: { label: '特別決議', desc: '贊成超過出席份額一半，且佔總值至少25%（第29條第2款）' },
    special_50: { label: '總值過半數', desc: '贊成佔總值超過50%；包括修改規章（第29條第3款）' },
    special_66: { label: '更新工程', desc: '贊成佔總值至少三分之二（第29條第4款）；不含第30條會後程序' },
    chair_majority: { label: '選舉會議主席', desc: '贊成超過出席份額一半；規章另有規定須另行核對（第31條第1款）' },
    annual_majority: { label: '年度帳目／預算（有條件）', desc: '贊成超過出席份額一半；須確認召集書已明示第29條第5款條件' }
  });
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const fail = m => { throw new Error(m); };
  const obj = (v, name) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(name + '格式錯誤'); return v; };
  const str = (v, name, max = 2000) => { if (typeof v !== 'string' || v.length > max) fail(name + '格式錯誤'); return v; };
  const id = v => { if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(v) || ['__proto__','constructor','prototype'].includes(v)) fail('識別碼格式錯誤'); return v; };
  const bool = v => { if (typeof v !== 'boolean') fail('確認狀態格式錯誤'); return v; };
  const choice = (v, values) => { if (!values.includes(v)) fail('狀態或選項不受支援：' + String(v)); return v; };
  const time = v => { if (!Number.isSafeInteger(v) || v <= 0) fail('時間格式錯誤'); return v; };
  function weight(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 100 || Math.abs(v * SCALE - Math.round(v * SCALE)) > 0.00001) fail('份額必須大於0、不超過100，最多六位小數');
    return Math.round(v * SCALE);
  }
  const eligible = u => u.isConfirmed && u.status !== 'absent';
  const totalWeight = units => units.reduce((s, u) => s + weight(u.valuePercent), 0);
  function tally(units, agenda, votes) {
    if (!own(RULES, agenda.type)) fail('未知計票規則');
    let attendance = 0, yes = 0, no = 0, abstain = 0, unvoted = 0, count = 0;
    for (const u of units.filter(eligible)) {
      const w = weight(u.valuePercent); attendance += w; count++;
      const v = (votes[agenda.id] || {})[u.id];
      if (v === 'for') yes += w;
      else if (v === 'against') no += w;
      else if (v === 'abstain') abstain += w;
      else unvoted += w;
    }
    const majority = yes * 2 > attendance;
    let isPassed = false;
    if (agenda.type === 'general_15') isPassed = majority && yes >= 15 * SCALE;
    if (agenda.type === 'special_25') isPassed = majority && yes >= 25 * SCALE;
    if (agenda.type === 'special_50') isPassed = yes * 2 > TOTAL;
    if (agenda.type === 'special_66') isPassed = yes * 3 >= TOTAL * 2;
    if (agenda.type === 'chair_majority') isPassed = majority;
    if (agenda.type === 'annual_majority') isPassed = agenda.noticeConfirmed === true && majority;
    const display = n => (n / SCALE).toFixed(2);
    const status = agenda.status;
    const resultLabel = status === 'pending' || status === 'not_voted' ? '未表決' : status === 'voting' ? '投票中（非最終結果）' : isPassed ? '已達所選規則門檻' : '未達所選規則門檻';
    return { forPercent: display(yes), againstPercent: display(no), abstainPercent: display(abstain), unvotedPercent: display(unvoted), attendancePercent: display(attendance), confirmedCount: count, isPassed, resultLabel, status, rule: RULES[agenda.type] };
  }
  function validateUnits(raw) {
    if (!Array.isArray(raw) || raw.length > 20000) fail('名冊格式或筆數錯誤');
    const ids = new Set(), addresses = new Set();
    const units = raw.map(r => {
      obj(r, '單位'); const uid = id(r.id); if (ids.has(uid)) fail('單位識別碼重複'); ids.add(uid);
      const tower = str(r.tower, '座數', 200).trim(), unit = str(r.unit, '單位', 200).trim(), owner = str(r.owner, '業主', 500).trim();
      if (!unit || !owner) fail('單位及業主不可空白');
      const address = JSON.stringify([tower, unit]); if (addresses.has(address)) fail('同座單位重複：' + tower + ' ' + unit); addresses.add(address);
      weight(r.valuePercent);
      const p = obj(r.proxyNonOwner, '代理人');
      const u = { id: uid, tower, unit, owner, valuePercent: r.valuePercent, seqNo: str(r.seqNo, '簽到編號', 200), isPriorityProxy: bool(r.isPriorityProxy), status: choice(r.status, ['absent','present','proxy']), proxyType: choice(r.proxyType, ['none','owner','non_owner']), proxyToOwnerId: str(r.proxyToOwnerId, '代理單位', 100), proxyNonOwner: {name: str(p.name,'代理人姓名',500), idCard: str(p.idCard,'證件',100), phone: str(p.phone,'電話',100)}, isConfirmed: bool(r.isConfirmed), ownerIdCardLast4: str(r.ownerIdCardLast4,'四位碼',4) };
      if (u.isConfirmed && !/^\d{4}$/.test(u.ownerIdCardLast4)) fail('已確認單位缺少四位碼');
      if (u.status === 'absent' && u.isConfirmed) fail('缺席單位不能標為已確認');
      if (u.isConfirmed && u.status === 'proxy' && (u.proxyType === 'none' || (u.proxyType === 'non_owner' && (!p.name.trim() || !p.idCard.trim())))) fail('已確認代理資料不完整');
      return u;
    });
    for (const u of units.filter(u => u.isConfirmed && u.status === 'proxy' && u.proxyType === 'owner')) {
      const target = units.find(t => t.id === u.proxyToOwnerId);
      if (!target || target.id === u.id || target.status !== 'present' || !target.isConfirmed) fail('代理業主必須是已確認親身出席的其他單位');
    }
    if (totalWeight(units) > TOTAL) fail('名冊總份額超過100%');
    return units;
  }
  function validateState(input) {
    const s = obj(input, '會議');
    const m = obj(s.meetingInfo, '會議基本資料');
    const meetingInfo = { name: str(m.name,'會議名稱'), datetime: str(m.datetime,'會議時間'), location: str(m.location,'會議地點'), chair: str(m.chair || '', '主席姓名',500), recorder: str(m.recorder || '', '繕立者',500) };
    if (m.startedAt != null) meetingInfo.startedAt = time(m.startedAt);
    if (m.endedAt != null) meetingInfo.endedAt = time(m.endedAt);
    const meetingStatus = choice(s.meetingStatus, ['pending','started','ended']);
    const units = validateUnits(s.units);
    if (meetingStatus !== 'pending' && (totalWeight(units) !== TOTAL || !units.some(eligible))) fail('已開始會議須有完整100%名冊及確認出席單位');
    if (meetingStatus !== 'pending' && !meetingInfo.startedAt) fail('缺少會議開始時間');
    if (meetingStatus === 'ended' && (!meetingInfo.endedAt || meetingInfo.endedAt < meetingInfo.startedAt)) fail('缺少有效會議結束時間');
    if (meetingStatus !== 'ended' && meetingInfo.endedAt) fail('未結束會議不應有結束時間');
    if (meetingStatus === 'pending' && meetingInfo.startedAt) fail('待開始會議不應有開始時間');
    if (!Array.isArray(s.agendas) || s.agendas.length > 1000) fail('議程格式或筆數錯誤');
    const agendaIds = new Set();
    const agendas = s.agendas.map(r => {
      obj(r,'議程'); const aid = id(r.id); if (agendaIds.has(aid)) fail('議程識別碼重複'); agendaIds.add(aid);
      if (!own(RULES,r.type)) fail('未知計票規則');
      const a = { id: aid, title: str(r.title,'議程題目'), type: r.type, status: choice(r.status,['pending','voting','ended','not_voted']), noticeConfirmed: r.noticeConfirmed === true };
      if (!a.title.trim()) fail('議程題目不可空白');
      if (r.startTime != null) a.startTime = time(r.startTime);
      if (r.endTime != null) a.endTime = time(r.endTime);
      if (['voting','ended'].includes(a.status) && (!a.startTime || a.startTime < meetingInfo.startedAt)) fail('缺少有效議程開始時間');
      if (a.status === 'ended' && (!a.endTime || a.endTime < a.startTime)) fail('缺少有效議程結束時間');
      if (['pending','not_voted'].includes(a.status) && (a.startTime || a.endTime)) fail('未表決議程不應有投票時間');
      if (a.status === 'voting' && a.endTime) fail('投票中議程不應有結束時間');
      if (meetingStatus === 'ended' && a.endTime > meetingInfo.endedAt) fail('議程結束時間超出會議');
      if (meetingStatus === 'pending' && a.status !== 'pending') fail('未開始會議的議程狀態錯誤');
      if (meetingStatus === 'ended' && !['ended','not_voted'].includes(a.status)) fail('已結束會議仍有開放議程');
      if (meetingStatus !== 'ended' && a.status === 'not_voted') fail('未結束會議的議程狀態錯誤');
      if (a.type === 'annual_majority' && ['voting','ended'].includes(a.status) && !a.noticeConfirmed) fail('年度例外未確認召集書条件');
      return a;
    });
    const votes = {}; obj(s.votes,'投票');
    for (const [aid, ballot] of Object.entries(s.votes)) {
      const a = agendas.find(a => a.id === aid); if (!a) fail('投票指向不存在議程'); obj(ballot,'票據');
      votes[aid] = {};
      for (const [uid, v] of Object.entries(ballot)) {
        if (!['voting','ended'].includes(a.status)) fail('未表決議程含有投票');
        const u = units.find(u => u.id === uid); if (!u || !eligible(u)) fail('投票指向無資格單位');
        votes[aid][uid] = choice(v,['for','against','abstain']);
      }
    }
    return { meetingInfo, meetingStatus, units, agendas, votes };
  }
  function exportBackup(state, now = new Date().toISOString()) {
    return JSON.stringify({ format: 'macau-owners-meeting', schemaVersion: SCHEMA_VERSION, ruleVersion: RULE_VERSION, exportedAt: now, data: validateState(state) }, null, 2);
  }
  function importBackup(text) {
    if (typeof text !== 'string' || text.length > 10 * 1024 * 1024) fail('備份不能超過10MB');
    let b; try { b = JSON.parse(text.replace(/^\uFEFF/,'')); } catch { fail('不是有效的 JSON 備份'); }
    obj(b, '備份');
    if (b.format !== 'macau-owners-meeting' || b.schemaVersion !== SCHEMA_VERSION) fail('不是本系統支援的備份版本');
    if (b.ruleVersion !== RULE_VERSION) fail('備份計票規則版本不同，請先轉換，不會自動改算舊結果');
    if (typeof b.exportedAt !== 'string' || !Number.isFinite(Date.parse(b.exportedAt))) fail('備份日期錯誤');
    return validateState(b.data);
  }
  function finishMeeting(state, now = Date.now()) {
    if (state.meetingStatus !== 'started') fail('只有進行中的會議可結束');
    return validateState({ ...state, meetingStatus:'ended', meetingInfo:{...state.meetingInfo, endedAt:now}, agendas:state.agendas.map(a => a.status === 'voting' ? {...a,status:'ended',endTime:now} : a.status === 'pending' ? {...a,status:'not_voted'} : a) });
  }
  // Full quoted-field CSV parsing; no silent type fallback.
  function parseCSV(text) {
    const rows = []; let row = [], field = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/,'');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c; }
      else if (c === '"') { if (field || closed) fail('CSV 引號格式錯誤'); quoted = true; }
      else if (c === ',' || c === '\n' || c === '\r') { row.push(field.trim()); field = ''; closed = false; if (c !== ',') { if (row.some(Boolean)) rows.push(row); row = []; if (c === '\r' && text[i+1] === '\n') i++; } }
      else { if (closed && c.trim()) fail('CSV 引號後有額外字元'); if (!closed) field += c; }
    }
    if (quoted) fail('CSV 引號未關閉');
    row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
    if (rows.length < 2) fail('CSV 必須包含標題列及資料列');
    return rows.slice(1);
  }
  return { SCHEMA_VERSION, RULE_VERSION, RULES, SCALE, TOTAL, eligible, weight, totalWeight, tally, validateUnits, validateState, exportBackup, importBackup, finishMeeting, parseCSV };
});
