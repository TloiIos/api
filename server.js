"use strict";
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
// Địa chỉ nguồn nằm CHỈ trên server (nên đặt bằng biến môi trường trên Render để không lộ trong mã). Trình duyệt người dùng không bao giờ thấy chúng.
const PRED = (process.env.PRED_BASE || 'https://because-shopper-explosion-disclaimers.trycloudflare.com').replace(/\/$/, '');
const HIS = (process.env.HIS_BASE || 'https://solo-relationship-calls-accuracy.trycloudflare.com').replace(/\/$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const BRAND = '@dongnetsun';

function sideOf(x) {
  const t = String(x || '').trim().toLowerCase();
  if (t === 'tài' || t === 'tai') return 'Tài';
  if (t === 'xỉu' || t === 'xiu') return 'Xỉu';
  if (t === 'bão' || t === 'bao') return 'Bão';
  return null;
}

// ===== Bộ nhận dạng vạn năng: tự tìm mảng phiên, phiên, xúc xắc, tổng, kết quả, giờ trong JSON bất kỳ =====
function findRecords(raw, d = 0) {
  if (Array.isArray(raw)) return raw.length && raw[0] && typeof raw[0] === 'object' ? raw : null;
  if (!raw || typeof raw !== 'object' || d > 3) return null;
  for (const k of ['list', 'data', 'history', 'items', 'results', 'result', 'rows', 'records', 'sessions', 'resultList', 'lich_su', 'lich_su_50', 'content']) {
    if (raw[k] !== undefined) { const r = findRecords(raw[k], d + 1); if (r) return r; }
  }
  for (const k of Object.keys(raw)) { const r = findRecords(raw[k], d + 1); if (r) return r; }
  const vals = Object.values(raw).filter(v => v && typeof v === 'object' && !Array.isArray(v));
  return vals.length >= 3 ? vals : null;
}
function genericNormalize(raw) {
  const arr = findRecords(raw);
  if (!arr) return [];
  const out = [], seen = new Set();
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const get = (...ks) => { for (const k of ks) if (it[k] !== undefined && it[k] !== null && it[k] !== '') return it[k]; return undefined; };
    const phRaw = get('phien', 'Phien', 'phiên', 'sid', 'SessionId', 'sessionId', 'session_id', 'session', 'issue', 'expect', 'gameNum', 'roundId', 'round', 'id', 'no', 'number');
    const ph = phRaw === undefined ? 0 : Number(String(phRaw).replace(/[^0-9]/g, ''));
    if (!ph || seen.has(ph)) continue;
    let dice;
    const dv = get('dices', 'dice', 'xuc_xac', 'xucxac', 'Dice', 'Dices', 'diceList', 'result_dice', 'points', Array.isArray(it.result) ? 'result' : '_');
    if (Array.isArray(dv) && dv.length >= 3) dice = dv.slice(0, 3).map(Number);
    else if (typeof dv === 'string') { const m = dv.match(/[1-6]/g); if (m && m.length >= 3) dice = m.slice(0, 3).map(Number); }
    if (!dice || dice.some(n => !(n >= 1 && n <= 6))) {
      const a = [get('d1', 'Xuc_xac_1', 'xuc_xac_1', 'dice1', 'Dice1', 'FirstDice', 'x1', 'point1', 'first_dice'),
                 get('d2', 'Xuc_xac_2', 'xuc_xac_2', 'dice2', 'Dice2', 'SecondDice', 'x2', 'point2', 'second_dice'),
                 get('d3', 'Xuc_xac_3', 'xuc_xac_3', 'dice3', 'Dice3', 'ThirdDice', 'x3', 'point3', 'third_dice')].map(Number);
      dice = a.every(n => n >= 1 && n <= 6) ? a : undefined;
    }
    let total = dice ? dice[0] + dice[1] + dice[2] : Number(get('tong', 'Tong', 'total', 'Total', 'sum', 'Sum', 'DiceSum', 'point', 'score', 'diem'));
    const label = get('ket_qua', 'Ket_qua', 'ketqua', 'result', 'Result', 'resultTruyenThong', 'kq', 'outcome', 'side');
    let sd = typeof label === 'string' ? sideOf(label) || ({ t: 'Tài', x: 'Xỉu' })[label.trim().toLowerCase()] : null;
    if (!sd && total >= 3 && total <= 18) sd = total >= 11 ? 'Tài' : 'Xỉu';
    if (!sd) continue;
    seen.add(ph);
    let tm = get('updatedAt', 'thoi_gian', 'time', 'createdAt', 'CreatedDate', 'created_at', 'timestamp', 'date', 'startTime');
    if (typeof tm === 'number' || /^\d{9,13}$/.test(String(tm || ''))) { const n = Number(tm); tm = new Date(n < 1e12 ? n * 1000 : n).toISOString(); }
    out.push({ "phiên": ph, "kết quả": sd, "updatedAt": tm || '', "dices": dice, "tong": total || undefined });
  }
  return out.sort((a, b) => b["phiên"] - a["phiên"]);
}


async function fetchJson(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'accept': 'application/json,text/plain,*/*', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0 Safari/537.36' }
    });
    if (!r.ok) throw new Error('upstream ' + r.status);
    return JSON.parse(await r.text());
  } finally { clearTimeout(timer); }
}

function formatTime(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

const T = [
  // [thương hiệu, loại, đuôi API, đường dẫn API dự đoán, đường dẫn API lịch sử]
  ['SUNWIN', 'TX', 'sunwintx', '/sunwintx', '/sunwin/api/tx/history'],
  ['SUNWIN', 'SICBO', 'sicbosunwin', '/sicbosunwin', '/sicbo/sunwin/his'],
  ['68GB', 'HŨ', '68gbbnxanh', '/68gbbnxanh', '/68tx/api/tx/history'],
  ['68GB', 'MD5', '68gbbnmd5', '/68gbbnmd5', '/68md5/api/md5/history'],
  ['789CLUB', 'TX', '789club', '/789club', '/789club/api/789/history'],
  ['789CLUB', 'SICBO', 'sicbo789club', '/sicbo789club', '/sicbo/789club/his'],
  ['B52', 'TX', 'b52tx', '/b52tx', '/b52/his/tx'],
  ['B52', 'MD5', 'b52md5', '/b52md5', '/b52/his/md5'],
  ['B52', 'SICBO', 'sicbob52', '/sicbob52', '/sicbo/b52/his'],
  ['HITCLUB', 'TX', 'hitclubtx', '/hitclubtx', '/hitclub/his/tx'],
  ['HITCLUB', 'MD5', 'hitclubmd5', '/hitclubmd5', '/hitclub/his/md5'],
  ['HITCLUB', 'SICBO', 'sicbohitclub', '/sicbohitclub', '/sicbo/hitclub/his'],
  ['HOT789', 'TX', 'hot789tx', '/hot789tx', '/hot789/api/tx/history'],
  ['HOT789', 'MD5', 'hot789md5', '/hot789md5', '/hot789/api/md5/history'],
  ['LC79', 'TX', 'lc79tx', '/lc79tx', '/lc79/his/tx'],
  ['LC79', 'MD5', 'lc79md5', '/lc79md5', '/lc79/his/md5'],
  ['MAX789', 'TX', 'max789tx', '/max789tx', '/max789/his/tx'],
  ['MAX789', 'MD5', 'max789md5', '/max789md5', '/max789/his/md5'],
  ['XOCDIA88', 'TX', 'xocdia88tx', '/xocdia88tx', '/xocdia88/api/tx/history'],
  ['XOCDIA88', 'MD5', 'xocdia88md5', '/xocdia88md5', '/xocdia88/api/md5/history'],
  ['BETVIP', 'TX', 'betviptx', '/betviptx', '/betvip/his/tx'],
  ['BETVIP', 'MD5', 'betvipmd5', '/betvipmd5', '/betvip/his/md5'],
  ['RIKVIP', 'TX', 'rikviptx', '/rikviptx', '/rikvip/his/tx'],
  ['RIKVIP', 'MD5', 'rikvipmd5', '/rikvipmd5', '/rikvip/his/md5'],
  ['RIKVIP', 'SICBO', 'sicborikvip', '/sicborikvip', '/sicbo/rikvip/his'],
  ['SUMCLUB', 'TX', 'sumclubtx', null, '/sumclub/his/tx'],
  ['SUMCLUB', 'MD5', 'sumclubmd5', null, '/sumclub/his/md5'],
  ['SUMCLUB', 'SICBO', 'sicbosumclub', '/sicbosumclub', null],
  ['LUCK8', 'TX', 'luck8tx', null, '/luck8/his/tx'],
  ['LUCK8', 'MD5', 'luck8md5', null, '/luck8/his/md5'],
  ['LUCKYWIN', 'SICBO', 'sicboluckywin', null, '/sicbo/luckywin/his']
];
const KIND_ORDER = ['TX', 'HŨ', 'MD5', 'SICBO'];
const G = {};
T.forEach((r, i) => {
  const id = i + 1;
  G[id] = { id, brand: r[0], kind: r[1], name: r[0] + ' ' + r[1], slug: r[2], pred: r[3] ? PRED + r[3] : null, his: r[4] ? HIS + r[4] : null,
    log: {}, selfRes: {}, hisRows: [], hisMap: {}, next: null, pOk: null, hOk: null, pAt: 0, hAt: 0, pErr: '', hErr: '' };
});

// ===== Đọc dự đoán từ API bên thứ ba: tự nhận dạng tên trường (không phân biệt hoa thường, dấu, gạch dưới) =====
const nk = k => String(k).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const numOf = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; };
function flat(raw, depth = 0) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) Object.assign(out, flat(v, depth + 1));
    else out[nk(k)] = v;
  }
  return out;
}
function sideFrom(v) {
  if (typeof v === 'number' && v >= 3 && v <= 18) return v >= 11 ? 'Tài' : 'Xỉu';
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return sideOf(t) || ({ t: 'Tài', x: 'Xỉu' })[t] || (/^\d{1,2}$/.test(t) && +t >= 3 && +t <= 18 ? (+t >= 11 ? 'Tài' : 'Xỉu') : null);
}
function parsePred(raw) {
  let r = raw;
  if (Array.isArray(r)) {
    let best = null, bv = -1;
    for (const it of r) { if (!it || typeof it !== 'object') continue; const f = flat(it), p = numOf(f.phien ?? f.sessionid ?? f.sid ?? f.id); if (p > bv) { bv = p; best = it; } }
    r = best || r[0];
  }
  if (typeof r === 'string') { const sd = sideFrom(r); return sd ? { side: sd } : null; }
  const f = flat(r);
  if (!Object.keys(f).length) return null;
  const pick = (...ks) => { for (const k of ks) if (f[k] !== undefined && f[k] !== null && f[k] !== '') return f[k]; };
  const side = sideFrom(pick('dudoan', 'prediction', 'predict', 'pred', 'dudoanketqua', 'ketquadudoan', 'goiy', 'tip', 'nextresult', 'dudoanphiensau', 'dudoantiep'));
  const last = numOf(pick('phien', 'sessionid', 'sid', 'session', 'issue', 'phientruoc', 'phientrc'));
  const nextX = numOf(pick('phiendudoan', 'phienhientai', 'phiennay', 'phientiep', 'nextphien', 'nextsession', 'phiensau'));
  const result = sideFrom(pick('ketqua', 'result', 'kq', 'ketquaphientruoc'));
  let dice = pick('xucxac', 'dice', 'dices');
  if (typeof dice === 'string') { const m = dice.match(/[1-6]/g); dice = m && m.length >= 3 ? m.slice(0, 3).map(Number) : undefined; }
  if (!Array.isArray(dice) || dice.length < 3) { const a = [pick('xucxac1', 'dice1', 'd1'), pick('xucxac2', 'dice2', 'd2'), pick('xucxac3', 'dice3', 'd3')].map(Number); dice = a.every(n => n >= 1 && n <= 6) ? a : undefined; }
  else dice = dice.slice(0, 3).map(Number);
  const next = nextX || (last && result ? last + 1 : last);
  let conf = pick('dotincay', 'tincay', 'confidence', 'conf', 'xacsuat', 'probability', 'percent', 'dochinhxac');
  if (typeof conf === 'number') conf = (conf <= 1 ? Math.round(conf * 1000) / 10 : conf) + '%';
  const pattern = pick('pattern', 'cau', 'loaicau', 'mau');
  if (!side && !result) return null;
  return { side, next, last: last || (nextX ? nextX - 1 : 0), result, dice, total: numOf(pick('tong', 'total', 'sum')) || undefined, conf: conf == null ? '' : String(conf), pattern: pattern == null ? '' : String(pattern) };
}

// ===== Ghi nhận dự đoán TRƯỚC khi có kết quả rồi đối chiếu với lịch sử =====
const LOG_FILE = path.join('/tmp', 'dn_log.json');
try {
  if (fs.existsSync(LOG_FILE)) {
    const saved = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    for (const id in saved) if (G[id] && G[id].name === saved[id].n) G[id].log = saved[id].log || {};
  }
} catch (e) {}
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { const o = {}; for (const id in G) o[id] = { n: G[id].name, log: G[id].log }; fs.writeFileSync(LOG_FILE, JSON.stringify(o)); } catch (e) {}
  }, 2000);
}
function trim(obj, keep) { Object.keys(obj).map(Number).sort((a, b) => b - a).slice(keep).forEach(k => delete obj[k]); }
function recordPred(g, p) {
  if (!p.side || !p.next || g.log[p.next]) return;                       // chỉ giữ dự đoán ĐẦU TIÊN của mỗi phiên
  if (g.hisMap[p.next] || g.selfRes[p.next]) return;                      // phiên đã có kết quả thì không ghi (tránh nhìn trước)
  g.log[p.next] = { s: p.side, c: p.conf || '', p: p.pattern || '', t: Date.now() };
  trim(g.log, 400); save();
}
function resolve(g) {
  let changed = false;
  for (const ph in g.log) {
    const e = g.log[ph];
    if (e.ok !== undefined) continue;
    const r = g.hisMap[ph] || (g.selfRes[ph] && g.selfRes[ph].r);
    if (!r) continue;
    e.r = r; e.ok = (r === 'Tài' || r === 'Xỉu') ? e.s === r : null; changed = true;
  }
  if (changed) save();
}
async function pollPred(g) {
  if (!g.pred) return;
  try {
    const p = parsePred(await fetchJson(g.pred, 15000));
    if (!p) throw new Error('format');
    g.pOk = true; g.pAt = Date.now(); g.pErr = '';
    if (p.last && p.result) { g.selfRes[p.last] = { r: p.result, dice: p.dice, total: p.total, ts: Date.now() }; trim(g.selfRes, 120); }
    if (p.side && p.next) { g.next = { phien: p.next, side: p.side, conf: p.conf, pattern: p.pattern, at: Date.now() }; recordPred(g, p); }
    else g.next = null;
    resolve(g);
  } catch (e) { g.pOk = false; g.pErr = String(e && e.message || e); }
}
async function pollHis(g) {
  if (!g.his) return;
  try {
    const rows = genericNormalize(await fetchJson(g.his, 20000));
    if (!rows.length) throw new Error('empty');
    g.hisRows = rows.slice(0, 120);
    g.hisMap = {}; for (const r of g.hisRows) g.hisMap[r["phiên"]] = r["kết quả"];
    g.hOk = true; g.hAt = Date.now(); g.hErr = '';
    resolve(g);
  } catch (e) { g.hOk = false; g.hErr = String(e && e.message || e); }
}
const online = g => (g.pred ? g.pOk : g.hOk);
function statsOf(g) { let n = 0, w = 0; for (const ph in g.log) { const e = g.log[ph]; if (typeof e.ok === 'boolean') { n++; if (e.ok) w++; } } return { n, w }; }
function rowsOf(g) {
  let src;
  if (g.hisRows.length) src = g.hisRows.slice(0, 50).map(it => { const d = Array.isArray(it.dices) && it.dices.length === 3 ? it.dices : []; return { phien: it["phiên"], result: it["kết quả"], dice: d, total: d.length ? d[0] + d[1] + d[2] : (it.tong || ''), time: formatTime(it.updatedAt) }; });
  else src = Object.keys(g.selfRes).map(Number).sort((a, b) => b - a).slice(0, 50).map(ph => { const s = g.selfRes[ph], d = s.dice || []; return { phien: ph, result: s.r, dice: d, total: d.length ? d[0] + d[1] + d[2] : (s.total || ''), time: formatTime(new Date(s.ts).toISOString()) }; });
  return src.map(r => { const e = g.log[r.phien]; return { ...r, prediction: e ? e.s : null, isCorrect: e && typeof e.ok === 'boolean' ? e.ok : null, conf: e ? e.c : '' }; });
}
function viewOf(g) {
  const nx = g.next;
  return { game: g.name, brand: g.brand, kind: g.kind, hasPred: !!g.pred,
    next: nx ? { phien: nx.phien, prediction: nx.side, conf: nx.conf, pattern: nx.pattern, fresh: Date.now() - g.pAt < 90000 } : null,
    stats: statsOf(g), rows: rowsOf(g) };
}


// ===== Bảo mật: header, giới hạn tần suất, không để lộ nguồn =====
const INDEX_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000">
<title>dongnetsun</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--r:12px;--f:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
:root{--bg:#000;--s1:#0d0d0d;--s2:#171717;--bd:#262626;--tx:#fafafa;--mu:#8c8c8c;--tai:#7ab0ff;--xiu:#ff7a7a;--ok:#4cc38a;--no:#f0605d;--bao:#d9b44a}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;font-family:var(--f)}
[hidden]{display:none!important}
html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{background:var(--bg);color:var(--tx);font-size:13px;line-height:1.45;font-variant-numeric:tabular-nums;padding-bottom:calc(72px + env(safe-area-inset-bottom));user-select:none;-webkit-user-select:none}
button{font:inherit;color:inherit}
.hdr{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--bd);padding:calc(10px + env(safe-area-inset-top)) 16px 0}
.brand{display:flex;align-items:center;justify-content:space-between;height:30px}
.brand b{font-size:16px;font-weight:700;letter-spacing:-.02em}
.brand span{font-size:11px;color:var(--mu);display:flex;align-items:center}
.live{width:6px;height:6px;border-radius:50%;background:var(--ok);margin-right:6px}
.tabs{display:flex;gap:22px;overflow-x:auto;scrollbar-width:none;margin:4px -16px 0;padding:0 16px}
.tabs::-webkit-scrollbar,.sub::-webkit-scrollbar{display:none}
.tab{flex:none;padding:11px 0 10px;border:0;background:none;color:var(--mu);font-size:13px;font-weight:600;border-bottom:2px solid transparent;cursor:pointer}
.tab.on{color:var(--tx);border-bottom-color:var(--tx)}
.tab.off:after{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--no);margin-left:6px;vertical-align:2px}
.sub{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:10px 0}
.chip{flex:none;padding:6px 13px;border-radius:99px;border:1px solid var(--bd);background:none;color:var(--mu);font-size:12px;font-weight:600;cursor:pointer}
.chip.on{background:var(--tx);color:var(--bg);border-color:var(--tx)}
.chip.off:after{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--no);margin-left:6px;vertical-align:1px}
.wrap{max-width:640px;margin:0 auto;padding:16px}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);margin-bottom:12px;animation:fi .25s ease-out}
@keyframes fi{from{opacity:0}}
.k{display:flex;justify-content:space-between;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--mu)}
.pred{padding:18px}
.pv{display:flex;align-items:baseline;justify-content:space-between;margin-top:10px}
.pw{font-size:44px;font-weight:700;letter-spacing:-.03em;line-height:1}
.md{font-size:12px;font-weight:600;color:var(--mu)}
.tai{color:var(--tai)}.xiu{color:var(--xiu)}.bao{color:var(--bao)}.ok{color:var(--ok)}.no{color:var(--no)}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px;padding-top:14px;border-top:1px solid var(--bd)}
.kv span{display:block;font-size:11px;color:var(--mu)}
.kv b{display:block;font-size:16px;font-weight:600;margin-top:2px}
.kv small{display:block;font-size:11px;color:var(--mu);margin-top:1px}
.mk{margin-top:16px}
.mkh{display:flex;justify-content:space-between;font-size:11px;color:var(--mu);margin-bottom:6px}
.mkh b{font-weight:600}
.mkb{display:flex;height:4px;border-radius:4px;overflow:hidden;background:var(--s2)}
.mkb i{display:block;height:100%}.mkb .t{background:var(--tai)}.mkb .x{background:var(--xiu)}
.alg{margin-top:16px}
.vt{display:grid;grid-template-columns:1fr 64px 96px;gap:8px;padding:8px 0;border-top:1px solid var(--bd);font-size:12px;font-weight:600}
.vt b{font-weight:700}
.vt span:last-child{text-align:right;color:var(--mu);font-weight:400}
.meta{margin-top:12px;font-size:12px;color:var(--mu)}
.res{display:flex;align-items:center;justify-content:space-between;padding:16px 18px}
.tot{font-size:30px;font-weight:700;letter-spacing:-.02em;margin-top:6px;line-height:1.1}
.tot span{font-size:16px;font-weight:600;margin-left:8px}
.ds{display:inline-flex;gap:5px}
.d{width:22px;height:22px;border-radius:6px;background:#f4f4f5;border:1px solid rgba(0,0,0,.18);display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:3px}
.d i{width:3.6px;height:3.6px;border-radius:50%;place-self:center}
.d i.on{background:#18181b}.d.o i.on{background:#d92d20;width:5px;height:5px}
.res .d{width:38px;height:38px;border-radius:9px;padding:5px}
.res .d i{width:6.5px;height:6.5px}.res .d.o i.on{width:9px;height:9px}
.chart{padding:16px 18px}
.sp{width:100%;height:56px;display:block;margin:10px 0 8px}
.seg{display:flex;gap:4px;margin:4px 0 10px}
.seg button{padding:6px 13px;border-radius:99px;border:1px solid var(--bd);background:none;color:var(--mu);font-size:12px;font-weight:600;cursor:pointer}
.seg button.on{background:var(--s2);color:var(--tx);border-color:var(--mu)}
.list{overflow:hidden}
.row{display:grid;grid-template-columns:1.2fr 1.15fr .95fr .95fr 34px;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--bd);font-weight:600}
.row:last-child{border-bottom:0}
.row.hd{padding:10px 16px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--mu);background:var(--s2)}
.row b{font-weight:600}
.row small{display:block;font-size:11px;font-weight:400;color:var(--mu);margin-top:1px}
.row u{text-decoration:none;font-size:9px;font-weight:700;letter-spacing:.05em;color:var(--mu);border:1px solid var(--bd);border-radius:4px;padding:0 4px}
.row>div:last-child{text-align:right;font-size:19px;line-height:1}
.dc small{margin-top:3px}
.note{padding:4px 2px 0;font-size:11px;color:var(--mu);line-height:1.6}
.msg{padding:48px 12px;text-align:center;color:var(--mu);font-weight:500}
.sk{height:110px;border-radius:var(--r);background:var(--s1);border:1px solid var(--bd);margin-bottom:12px;animation:pl 1.4s ease-in-out infinite}
@keyframes pl{50%{opacity:.5}}
.foot{max-width:640px;margin:0 auto;padding:4px 18px 24px;font-size:11px;color:var(--mu);line-height:1.6}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;background:var(--bg);border-top:1px solid var(--bd);padding-bottom:env(safe-area-inset-bottom)}
.bar button{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 0 9px;border:0;background:none;color:var(--mu);font-size:11px;font-weight:600;cursor:pointer}
.bar button:active{color:var(--tx)}
.bar svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;display:none;align-items:flex-end;justify-content:center}
.ov.on{display:flex}
.sheet{width:100%;max-width:560px;max-height:84vh;overflow-y:auto;padding:18px 16px calc(18px + env(safe-area-inset-bottom));border-radius:16px 16px 0 0;background:var(--s1);border:1px solid var(--bd);border-bottom:0;animation:sl .22s ease-out}
@keyframes sl{from{transform:translateY(24px);opacity:0}}
.sheet h3{font-size:15px;font-weight:700;margin-bottom:14px}
.sheet h4{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--mu);margin:16px 0 8px}
.btn{width:100%;margin-top:16px;padding:12px;border-radius:10px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-weight:600;font-size:13px;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.gt{padding:12px 6px;border-radius:10px;border:1px solid var(--bd);background:none;font-size:12px;font-weight:600;cursor:pointer}
.gt.cur{border-color:var(--tx);background:var(--s2)}
#gq{width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);font-size:16px;outline:0;user-select:text;-webkit-user-select:text}
.lb{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:12px 0;border-bottom:1px solid var(--bd)}
.lbn{font-size:13px;font-weight:600}.lbn small{display:block;font-size:11px;font-weight:400;color:var(--mu);margin-top:2px}
.lbr{text-align:right;font-size:16px;font-weight:700}.lbr small{display:block;font-size:11px;font-weight:400;color:var(--mu)}
.lbb{grid-column:1/-1;position:relative;height:4px;border-radius:4px;background:var(--s2);margin-top:6px}
.lbb i{display:block;height:100%;border-radius:4px;background:var(--tx)}
.lbb u{position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--mu)}
.sum{text-align:center;padding:6px 0 14px}.sum b{display:block;font-size:34px;font-weight:700;letter-spacing:-.02em;margin-top:4px}
.bg{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bt{padding:12px;cursor:pointer;margin:0}
.bh{display:flex;justify-content:space-between;align-items:baseline;font-size:13px}
.bh small{font-size:10px;color:var(--mu)}
.bpm{display:grid;grid-auto-flow:column;grid-template-rows:repeat(6,10px);grid-auto-columns:10px;gap:2px;margin:10px 0 8px;padding:5px;border-radius:6px;background:#f1ede2;justify-content:start;min-height:82px;overflow:hidden}
.bpm i,.bp i{border-radius:50%;display:block}
.bpm .P,.bp .P,.b3 .P{background:#2f6fe0}.bpm .B,.bp .B,.b3 .B{background:#d93a3a}.bpm .T,.bp .T,.b3 .T{background:#1f9d5b}
.b3{display:flex;height:4px;border-radius:4px;overflow:hidden;background:var(--s2)}
.b3 i{display:block;height:100%}
.bf{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-top:9px;font-size:12px;font-weight:600}
.bf small{font-size:10px;color:var(--mu);font-weight:400;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdx.P{color:var(--tai)}.pdx.B{color:var(--xiu)}.pdx.none{color:var(--mu);font-weight:500}
.bp,.br{display:grid;grid-template-rows:repeat(6,20px);grid-auto-columns:20px;gap:3px;overflow-x:auto;padding:8px;border-radius:8px;background:#f1ede2}
.bp{grid-auto-flow:column}
.bp i{width:20px;height:20px;color:#fff;font-style:normal;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center}
.ring{width:18px;height:18px;border-radius:50%;border:3px solid;position:relative;font-style:normal;font-size:8px;font-weight:700;color:#1f9d5b;display:flex;align-items:center;justify-content:center}
.ring.P{border-color:#2f6fe0}.ring.B{border-color:#d93a3a}
.ring.tie:after{content:"";position:absolute;left:-3px;right:-3px;top:50%;height:2px;margin-top:-1px;background:#1f9d5b;transform:rotate(-45deg)}
.hist{font-size:16px;line-height:1.55;letter-spacing:2px;word-break:break-all;display:block}
.pl{display:inline-block;padding:3px 11px;border-radius:99px;font-size:12px;font-weight:700;background:var(--s2);border:1px solid var(--bd)}
@supports(background:color-mix(in srgb,red 10%,blue)){.pl.tai{background:color-mix(in srgb,var(--tai) 16%,transparent);border-color:color-mix(in srgb,var(--tai) 40%,transparent)}.pl.xiu{background:color-mix(in srgb,var(--xiu) 16%,transparent);border-color:color-mix(in srgb,var(--xiu) 40%,transparent)}.pl.bao{background:color-mix(in srgb,var(--bao) 16%,transparent)}}
.chk{margin-top:10px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pred.pt{border-left:3px solid var(--tai)}.pred.px{border-left:3px solid var(--xiu)}
.d{width:24px;height:24px}.d i{width:4px;height:4px}.d.o i.on{width:5.5px;height:5.5px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body oncontextmenu="return false">
<header class="hdr">
  <div class="brand"><b>dongnetsun</b><span><i class="live"></i><em id="gs" style="font-style:normal">Đang kết nối</em></span></div>
  <nav class="tabs" id="tabs"></nav>
  <div class="sub" id="sub" hidden></div>
</header>
<main class="wrap" id="main"><div class="sk"></div><div class="sk" style="height:84px"></div><div class="sk" style="height:200px"></div></main>
<footer class="foot">Dự đoán lấy từ nguồn bên thứ ba, hệ thống chỉ ghi nhận và đối chiếu với kết quả thật. Mỗi phiên là ngẫu nhiên, không có cách đoán chắc thắng; hãy nhìn tỉ lệ đúng thực tế thay vì độ tin cậy do nguồn tự báo.</footer>
<nav class="bar">
  <button id="dg"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>Game</button>
  <button id="ds2"><svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>Xếp hạng</button>
</nav>
<div class="ov" id="ovg"><div class="sheet"><h3>Chọn game</h3><input id="gq" placeholder="Tìm game (vd: luck8, md5, sicbo)" autocomplete="off"><div id="gl"></div><button class="btn" id="gc">Đóng</button></div></div>
<div class="ov" id="ovs"><div class="sheet"><h3>Xếp hạng LIVE</h3><div id="sb"></div><button class="btn" id="sc">Đóng</button></div></div>
<div class="ov" id="ovb"><div class="sheet"><h3 id="bth"></h3><div id="btb"></div><button class="btn" id="bc">Đóng</button></div></div>
<script>
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const LS={g:(k,d)=>{try{return localStorage.getItem(k)||d}catch(e){return d}},s:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
const BN={P:'Con',B:'Cái',T:'Hòa'},SIG={M:'Mạnh',V:'Vừa',Y:'Yếu'};
let cur=LS.g('dn_game','1'),timer=null,busy=false,lastKey='',lastD=null,flt='all',bacF='all',games=[],bac=[],bacLive={n:0,w:0};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const pl=v=>v?\`<span class="pl \${cls(v)}">\${esc(v)}</span>\`:'—';
const cls=v=>v==='Tài'?'tai':v==='Xỉu'?'xiu':v==='Bão'?'bao':'';
function chips(){
  const m={},o=[];games.forEach(g=>{const b=g.brand||g.name;if(!m[b]){m[b]={name:b,list:[]};o.push(m[b])}m[b].list.push(g)});
  const cg=games.find(g=>String(g.id)===cur),cb=cur==='bac'?'bac':(cg?(cg.brand||cg.name):'');
  $('#tabs').innerHTML=o.map(b=>\`<button class="tab\${b.name===cb?' on':''}\${b.list.every(g=>g.online===false)?' off':''}" data-b="\${esc(b.name)}">\${esc(b.name)}</button>\`).join('')+\`<button class="tab\${cur==='bac'?' on':''}" data-id="bac">Baccarat</button>\`;
  const B=m[cb],sub=B&&B.list.length>1?B.list.map(g=>\`<button class="chip\${String(g.id)===cur?' on':''}\${g.online===false?' off':''}" data-id="\${g.id}">\${esc(g.kind||g.name)}</button>\`).join(''):'';
  $('#sub').innerHTML=sub;$('#sub').hidden=!sub;
  $$('.tab,.chip').forEach(b=>b.onclick=()=>{const id=b.dataset.id;if(id)return pick(id);const L=m[b.dataset.b].list,want=LS.g('dn_b_'+b.dataset.b,'');pick((L.find(g=>String(g.id)===want)||L[0]).id)});
}
function loadGames(){fetch('/api/games').then(r=>r.json()).then(l=>{if(Array.isArray(l)&&l.length){games=l;chips()}}).catch(()=>{})}
const skel=()=>{$('#main').innerHTML='<div class="sk"></div><div class="sk" style="height:84px"></div><div class="sk" style="height:200px"></div>'};
function pick(id){cur=String(id);LS.s('dn_game',cur);const g=games.find(x=>String(x.id)===cur);if(g)LS.s('dn_b_'+(g.brand||g.name),cur);lastKey='';chips();$('#gs').textContent='Đang tải';skel();const t=document.querySelector('.tab.on');if(t&&t.scrollIntoView)t.scrollIntoView({inline:'center',block:'nearest'});load();clearInterval(timer);timer=setInterval(load,8000)}
const stamp=()=>{$('#gs').textContent='Cập nhật '+new Date().toLocaleTimeString('vi-VN')};
function fail(){lastKey='';$('#gs').textContent='Bảo trì';$('#main').innerHTML='<div class="msg">Game đang bảo trì hoặc chưa có dữ liệu.<br><small>Tự thử lại sau 8 giây.</small></div>'}
function load(){if(busy)return;busy=true;
  const p=cur==='bac'?fetch('/api/baccarat').then(r=>{if(!r.ok)throw 0;return r.json()}).then(d=>{if(!d||!d.tables||!d.tables.length)throw 0;bac=d.tables;bacLive=d.live||{n:0,w:0};const k=JSON.stringify(bac.map(t=>[t.ket_qua,t.du_doan,t.live_n]))+bacF;if(k!==lastKey){lastKey=k;drawBac()}stamp()})
  :fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiId:+cur})}).then(r=>{if(!r.ok)throw 0;return r.json()}).then(d=>{if(!d||((!d.rows||!d.rows.length)&&!d.next))throw 0;const k=JSON.stringify([d.next,d.stats,(d.rows||[]).slice(0,8)])+flt;if(k!==lastKey){lastKey=k;draw(d)}stamp()});
  p.catch(fail).then(()=>{busy=false})}
function die(n){const P={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}[n]||[];let h=\`<b class="d\${n===1?' o':''}">\`;for(let i=0;i<9;i++)h+=\`<i\${P.indexOf(i)>-1?' class="on"':''}></i>\`;return h+'</b>'}
const dice=a=>Array.isArray(a)&&a.length===3?\`<span class="ds">\${a.map(die).join('')}</span>\`:'—';
function spark(a){const W=200,H=50,n=a.length,d=a.map((v,i)=>\`\${i?'L':'M'}\${(n>1?i*W/(n-1):0).toFixed(1)} \${(H-v*H/100).toFixed(1)}\`).join(' ');
  return \`<svg class="sp" viewBox="0 0 \${W} \${H}" preserveAspectRatio="none"><line x1="0" x2="\${W}" y1="\${H/2}" y2="\${H/2}" stroke-dasharray="3 3" stroke-width="1" vector-effect="non-scaling-stroke" style="stroke:var(--mu);opacity:.6"/><path d="\${d} L\${W} \${H} L0 \${H} Z" style="fill:var(--tx);opacity:.07"/><path d="\${d}" fill="none" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" style="stroke:var(--tx)"/></svg>\`}
function patName(ps){const r=ps.map(x=>x.result).filter(v=>v==='Tài'||v==='Xỉu').slice(0,14),n=r.length;if(n<4)return '';
  let a=1;while(a<n&&r[a]!==r[a-1])a++;if(a>=4)return '1-1 ×'+a;
  if(n>=6&&r[0]===r[1]&&r[2]===r[3]&&r[4]===r[5]&&r[0]!==r[2]&&r[2]!==r[4])return '2-2';
  if(n>=6&&r[0]===r[1]&&r[1]===r[2]&&r[3]===r[4]&&r[4]===r[5]&&r[0]!==r[3])return '3-3';
  const m=Math.min(10,n),t=r.slice(0,m).filter(v=>v==='Tài').length;
  if(t>=Math.ceil(m*.7))return \`nghiêng Tài \${t}/\${m}\`;if(m-t>=Math.ceil(m*.7))return \`nghiêng Xỉu \${m-t}/\${m}\`;return ''}
function draw(d){
  lastD=d;const rows=d.rows||[],st=d.stats||{},nx=d.next,g=games.find(x=>String(x.id)===cur);
  const n=st.n||0,w=st.w||0,pc=n?Math.round(w*100/n):null,sv=rows[0]?rows[0].result:'';
  let sk=0;for(let i=0;i<rows.length&&rows[i].result===sv;i++)sk++;
  const lvNew=rows.filter(r=>typeof r.isCorrect==='boolean');let ls=0;for(const r of lvNew){if(r.isCorrect!==lvNew[0].isCorrect)break;ls++}
  let h='';
  if(nx)h+=\`<section class="card pred \${nx.prediction==='Tài'?'pt':nx.prediction==='Xỉu'?'px':''}"><div class="k"><span>\${g?esc(g.brand+' · '+g.kind):'Dự đoán'}</span><span>Phiên #\${esc(nx.phien)}</span></div>
<div class="pv"><div class="pw \${cls(nx.prediction)}">\${esc(nx.prediction)}</div><div class="md">\${nx.fresh?'Theo API dự đoán':'Dữ liệu đã cũ'}</div></div>
<div class="kv"><div><span>Tỉ lệ đúng</span><b>\${pc===null?'—':pc+'%'}</b><small>\${n?w+'/'+n+' phiên':'đang thu thập'}</small></div><div><span>Độ tin cậy API</span><b>\${nx.conf?esc(nx.conf):'—'}</b></div><div><span>Chuỗi</span><b class="\${cls(sv)}">\${esc(sv||'—')} ×\${sk}</b></div></div>
\${(nx.pattern||ls>=2)?\`<div class="meta">\${esc([nx.pattern,ls>=2&&(lvNew[0].isCorrect?'✅ Đúng':'❌ Sai')+' liên tiếp ×'+ls].filter(Boolean).join(' · '))}</div>\`:''}</section>\`;
  else h+=\`<section class="card pred"><div class="k"><span>\${g?esc(g.brand+' · '+g.kind):'Dự đoán'}</span><span></span></div><div class="msg" style="padding:26px 0 10px">\${d.hasPred?'Chưa nhận được dự đoán từ API.':'Game này chưa có API dự đoán, chỉ hiển thị lịch sử.'}</div></section>\`;
  if(rows[0])h+=\`<section class="card res"><div><div class="k">Kết quả vừa ra · #\${esc(rows[0].phien)}</div><div class="tot">\${esc(rows[0].total||'—')}<span class="\${cls(rows[0].result)}">\${esc(rows[0].result)}</span></div>\${rows[0].prediction?\`<div class="chk">Dự đoán \${pl(rows[0].prediction)} \${rows[0].isCorrect===true?'✅ Đúng':rows[0].isCorrect===false?'❌ Sai':''}</div>\`:''}</div>\${dice(rows[0].dice)}</section>\`;
  const lv=lvNew.slice().reverse();let cw=0;const cum=lv.map((r,i)=>{if(r.isCorrect)cw++;return cw*100/(i+1)});
  if(lv.length)h+=\`<section class="card chart"><div class="k"><span>Đúng/sai gần đây</span><span>✅ \${cw} · ❌ \${lv.length-cw}</span></div>\${cum.length>=4?spark(cum):'<div style="height:10px"></div>'}<div class="hist">\${lv.slice(-30).map(r=>r.isCorrect?'✅':'❌').join('')}</div></section>\`;
  h+=\`<div class="seg" id="seg">\${[['all','Tất cả'],['pred','Có dự đoán'],['wrong','❌ Sai']].map(x=>\`<button data-f="\${x[0]}" class="\${flt===x[0]?'on':''}">\${x[1]}</button>\`).join('')}</div><section class="card list"><div class="row hd"><span>Phiên</span><span>Xúc xắc</span><span>Dự đoán</span><span>Kết quả</span><span style="text-align:right">Đ/S</span></div>\`;
  rows.forEach(r=>{if((flt==='pred'&&!r.prediction)||(flt==='wrong'&&r.isCorrect!==false))return;
    h+=\`<div class="row"><div><b>#\${esc(r.phien)}</b><small>\${esc(r.time||'')}</small></div><div class="dc">\${dice(r.dice)}<small>\${esc(r.total||'')}</small></div><div>\${pl(r.prediction)}</div><div>\${pl(r.result)}</div><div>\${r.isCorrect===true?'✅':r.isCorrect===false?'❌':''}</div></div>\`});
  $('#main').innerHTML=h+'</section><p class="note">✅ dự đoán đúng · ❌ dự đoán sai. Tỉ lệ đúng chỉ tính các dự đoán đã được ghi nhận TRƯỚC khi có kết quả, kể từ lúc hệ thống bắt đầu theo dõi. Dòng "—" nghĩa là hệ thống chưa kịp ghi dự đoán cho phiên đó.</p>';
  $$('#seg button').forEach(b=>b.onclick=()=>{flt=b.dataset.f;lastKey='';draw(lastD)});
}
const bar3=t=>{const n=t.con+t.cai+t.hoa||1;return \`<div class="b3"><i class="P" style="width:\${t.con*100/n}%"></i><i class="B" style="width:\${t.cai*100/n}%"></i><i class="T" style="width:\${t.hoa*100/n}%"></i></div>\`};
const miniPlate=r=>{const s=Math.max(0,(Math.floor((r.length-1)/6)-10)*6);return r.slice(s).split('').map(c=>\`<i class="\${c}"></i>\`).join('')};
const pdTxt=t=>t.du_doan?\`<span class="pdx \${t.du_doan}">Dự đoán: \${BN[t.du_doan]}</span>\`:'<span class="pdx none">Chưa có dự đoán</span>';
function bigRoad(r){const occ={},beads=[];let col=0,row=0,sc=0,last=null,lb=null;
  for(let i=0;i<r.length;i++){const c=r.charAt(i);
    if(c==='T'){if(lb)lb.t++;continue}
    if(c===last){if(row<5&&!occ[col+','+(row+1)])row++;else col++}
    else{if(last!==null){sc++;while(occ[sc+',0'])sc++}col=sc;row=0}
    occ[col+','+row]=1;lb={c,col,row,t:0};beads.push(lb);last=c}
  return \`<div class="br" id="brr">\${beads.map(b=>\`<i class="ring \${b.c}\${b.t?' tie':''}" style="grid-row:\${b.row+1};grid-column:\${b.col+1}">\${b.t>1?b.t:''}</i>\`).join('')}</div>\`}
function drawBac(){
  const np=bac.filter(t=>t.du_doan).length;
  let h=\`<div class="seg"><button data-f="all" class="\${bacF==='all'?'on':''}">Tất cả (\${bac.length})</button><button data-f="pred" class="\${bacF==='pred'?'on':''}">Có dự đoán (\${np})</button></div>\`+(bacLive.n?\`<p class="note" style="padding:0 2px 10px">LIVE: \${bacLive.w}/\${bacLive.n} · \${Math.round(bacLive.w*100/bacLive.n)}%</p>\`:'')+'<div class="bg">';
  bac.forEach((t,i)=>{if(bacF==='pred'&&!t.du_doan)return;h+=\`<div class="card bt" data-i="\${i}"><div class="bh"><b>Bàn \${esc(t.ban)}</b><small>\${esc(t.phien)} ván · \${esc(t.time)}</small></div><div class="bpm">\${miniPlate(t.ket_qua)}</div>\${bar3(t)}<div class="bf">\${pdTxt(t)}<small>\${esc(t.cau||'')}\${t.live_n?' · '+t.live_w+'/'+t.live_n:''}</small></div></div>\`});
  $('#main').innerHTML=h+'</div><p class="note" style="padding-top:12px">Chạm vào bàn để xem bảng châu lộ và đại lộ. Dự đoán lấy theo cầu của API.</p>';
  $$('.bt').forEach(b=>b.onclick=()=>openBac(+b.dataset.i));
  $$('.seg button').forEach(b=>b.onclick=()=>{bacF=b.dataset.f;lastKey='';drawBac()});
  if($('#ovb').classList.contains('on')&&openBac.i!==undefined)openBac(openBac.i);
}
function openBac(i){const t=bac[i];if(!t)return;openBac.i=i;const c=t.chuoi;$('#bth').textContent=\`Bàn \${t.ban} · \${t.phien} ván\`;
  $('#btb').innerHTML=\`<div class="k"><span>Dự đoán theo cầu API</span><span>\${c?'Chuỗi '+BN[c.side]+' ×'+c.len:''}</span></div><div style="font-size:28px;font-weight:700;margin:8px 0 2px" class="\${t.du_doan==='P'?'tai':t.du_doan==='B'?'xiu':''}">\${t.du_doan?BN[t.du_doan]:'—'}</div><div class="hs" style="color:var(--mu);font-size:12px">\${esc(t.cau||'Chưa có cầu')}\${t.live_n?' · LIVE '+t.live_w+'/'+t.live_n:''}</div>
<div class="kv"><div><span>Con</span><b class="tai">\${t.con}</b></div><div><span>Cái</span><b class="xiu">\${t.cai}</b></div><div><span>Hòa</span><b class="ok">\${t.hoa}</b></div></div>\${bar3(t)}
<h4>Bảng châu lộ</h4><div class="bp" id="bpp">\${t.ket_qua.split('').map(x=>\`<i class="\${x}">\${x}</i>\`).join('')}</div><h4>Đại lộ</h4>\${bigRoad(t.ket_qua)}\`;
  $('#ovb').classList.add('on');['#bpp','#brr'].forEach(q=>{const e=$(q);if(e)e.scrollLeft=e.scrollWidth})}
function renderGames(q){q=(q||'').toLowerCase();const m={},o=[];games.forEach(g=>{const b=g.brand||g.name;if(!m[b]){m[b]={name:b,list:[]};o.push(m[b])}m[b].list.push(g)});let h='';
  o.forEach(b=>{const L=b.list.filter(g=>!q||(b.name+' '+g.kind+' '+g.name).toLowerCase().indexOf(q)>-1);if(!L.length)return;h+=\`<h4>\${esc(b.name)}</h4><div class="grid">\${L.map(g=>\`<button class="gt\${String(g.id)===cur?' cur':''}" data-id="\${g.id}">\${esc(g.kind)}\${g.online===false?' <span class="no">●</span>':''}</button>\`).join('')}</div>\`});
  if(!q||'baccarat sảnh'.indexOf(q)>-1)h+=\`<h4>Baccarat</h4><div class="grid"><button class="gt\${cur==='bac'?' cur':''}" data-id="bac">Sảnh</button></div>\`;
  $('#gl').innerHTML=h||'<div class="msg">Không tìm thấy game</div>';
  $$('.gt').forEach(b=>b.onclick=()=>{$('#ovg').classList.remove('on');pick(b.dataset.id)})}
const openGames=()=>{$('#gq').value='';renderGames('');$('#ovg').classList.add('on')};
const pc2=a=>a[0]?Math.round(a[1]*100/a[0])+'% ('+a[0]+')':'—';
function drawStats(d){const g=d.games.filter(x=>x.n>0).sort((a,b)=>b.n-a.n),t=d.total;
  let h=\`<div class="sum"><div class="k" style="justify-content:center">Tổng tất cả game</div><b>\${t.n?Math.round(t.w*100/t.n)+'%':'—'}</b><div style="color:var(--mu);font-size:12px;margin-top:2px">✅ \${t.w} đúng · ❌ \${t.n-t.w} sai</div></div>\`;
  h+=g.length?g.map(x=>{const p=Math.round(x.w*100/x.n);return \`<div class="lb"><div class="lbn">\${esc(x.brand+' · '+x.kind)}<small>✅ \${x.w} · ❌ \${x.n-x.w}</small></div><div class="lbr">\${p}%<small>\${x.w}/\${x.n}</small></div><div class="lbb"><i style="width:\${p}%"></i><u></u></div></div>\`}).join(''):'<div class="msg">Chưa có dự đoán nào được chấm.<br><small>Để hệ thống chạy một lúc rồi quay lại.</small></div>';
  $('#sb').innerHTML=h+'<p class="note" style="padding-top:12px">Vạch giữa = 50% (đoán mò). Chỉ tính dự đoán ghi nhận trước khi có kết quả.</p>'}
function openStats(){$('#sb').innerHTML='<div class="msg">Đang tải...</div>';$('#ovs').classList.add('on');fetch('/api/stats').then(r=>r.json()).then(drawStats).catch(()=>{$('#sb').innerHTML='<div class="msg">Chưa tải được dữ liệu.</div>'})}
const closeOn=(ov,btn)=>{$(btn).onclick=()=>{$(ov).classList.remove('on');if(ov==='#ovb')openBac.i=undefined};$(ov).onclick=e=>{if(e.target===$(ov)){$(ov).classList.remove('on');if(ov==='#ovb')openBac.i=undefined}}};
closeOn('#ovg','#gc');closeOn('#ovs','#sc');closeOn('#ovb','#bc');
$('#dg').onclick=openGames;$('#ds2').onclick=openStats;
$('#gq').oninput=function(){renderGames(this.value)};
chips();loadGames();pick(cur);
</script>
</body>
</html>
`;
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.ALLOW_ORIGIN) res.setHeader('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN);
  next();
});
const hits = new Map();
app.use((req, res, next) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now - h.t > 60000) { h = { t: now, n: 0 }; hits.set(ip, h); }
  if (++h.n > 240) return res.status(429).json({ error: 'too many requests' });
  next();
});
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > 120000) hits.delete(k); }, 60000).unref();
app.use(express.json({ limit: '10kb' }));

const sendUI = (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.type('html').send(INDEX_HTML); };
app.get('/', sendUI);
app.get('/index.html', sendUI);

let bacCache = null;
const bacTrack = {};
// Dự đoán lấy theo trường "cau" của API: dính/bệt/nghiêng + Con/Cái => theo bên đó; "cầu đơn" => cầu 1-1 (đảo bên cuối)
function bacPred(cau, r) {
  const c = String(cau || '').toLowerCase();
  const side = /con/.test(c) ? 'P' : /cái|cai/.test(c) ? 'B' : null;
  if (side && /(dính|dinh|bệt|bet|nghiêng|nghieng)/.test(c)) return side;
  if (/đơn|don/.test(c)) { const nt = r.replace(/T/g, ''); const l = nt[nt.length - 1]; return l ? (l === 'P' ? 'B' : 'P') : null; }
  return null;
}
async function getBaccarat() {
  if (bacCache && Date.now() - bacCache.ts < 8000) return bacCache.data;
  const raw = await fetchJson('https://bcf-ayt4.onrender.com/sexy/all', 20000);
  if (!Array.isArray(raw)) throw new Error('bad baccarat data');
  const cnt = (r, c) => (r.match(new RegExp(c, 'g')) || []).length;
  let tn = 0, tw = 0;
  const data = raw.map(t => {
    const r = String(t.ket_qua || '').toUpperCase().replace(/[^PBT]/g, '');
    const pred = bacPred(t.cau, r);
    const tr = bacTrack[t.ban] || (bacTrack[t.ban] = { len: r.length, pred: null, n: 0, w: 0 });
    // chấm đúng/sai thật: so dự đoán của lần quét trước với ván mới ra (bỏ qua Hòa)
    if (tr.pred && r.length > tr.len && r.length - tr.len <= 3) { const c = r[tr.len]; if (c !== 'T') { tr.n++; if (c === tr.pred) tr.w++; } }
    tr.len = r.length; tr.pred = pred;
    tn += tr.n; tw += tr.w;
    let len = 0; for (let i = r.length - 1; i >= 0 && r[i] === r[r.length - 1]; i--) len++;
    return { ban: String(t.ban), cau: t.cau || '', phien: t.phien, time: t.time || '', ket_qua: r, con: cnt(r, 'P'), cai: cnt(r, 'B'), hoa: cnt(r, 'T'), chuoi: r ? { side: r[r.length - 1], len } : null, du_doan: pred, live_n: tr.n, live_w: tr.w };
  });
  const key = b => (/^\d+$/.test(b.ban) ? [0, Number(b.ban)] : [1, Number(b.ban.replace(/\D/g, '')) || 0]);
  data.sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1]; });
  bacCache = { data, ts: Date.now(), live: { n: tn, w: tw } };
  return data;
}
app.get('/api/baccarat', async (req, res) => {
  try { const tables = await getBaccarat(); res.json({ id: '@dongnetsun', tables, live: bacCache.live }); }
  catch (e) { if (bacCache) return res.json({ id: '@dongnetsun', tables: bacCache.data, live: bacCache.live, stale: true }); res.status(503).json({ error: 'no data' }); }
});


const list = () => {
  const bo = b => { const i = BRAND_ORDER.indexOf(b); return i < 0 ? 99 : i; };
  const rank = k => { const i = KIND_ORDER.indexOf(k); return i < 0 ? 99 : i; };
  return Object.values(G).sort((a, b) => bo(a.brand) - bo(b.brand) || rank(a.kind) - rank(b.kind) || a.id - b.id);
};
const BRAND_ORDER = ['SUNWIN', '68GB', '789CLUB', 'B52', 'HITCLUB', 'HOT789', 'LC79', 'MAX789', 'XOCDIA88', 'BETVIP', 'RIKVIP', 'SUMCLUB', 'LUCK8', 'LUCKYWIN'];
app.get('/api/games', (req, res) => res.json(list().map(g => ({ id: g.id, name: g.name, brand: g.brand, kind: g.kind, hasPred: !!g.pred, online: online(g) }))));
app.get('/api/stats', (req, res) => {
  const games = list().map(g => ({ id: g.id, name: g.name, brand: g.brand, kind: g.kind, ...statsOf(g) }));
  res.json({ id: BRAND, total: games.reduce((a, g) => ({ n: a.n + g.n, w: a.w + g.w }), { n: 0, w: 0 }), games });
});
app.post('/api/data', (req, res) => {
  const g = G[Number((req.body || {}).apiId || (req.body || {}).id)];
  if (!g) return res.status(400).json({ error: 'bad id' });
  res.json(viewOf(g));
});
// API công khai gọn theo đuôi từng game: không bao giờ trả nguyên dữ liệu nguồn (nên không lộ tên chủ cũ hay địa chỉ nguồn)
Object.values(G).forEach(g => {
  app.get('/' + g.slug, (req, res) => {
    const v = viewOf(g), s = v.stats, last = v.rows[0] || null;
    if (!v.next && !last) return res.status(503).json({ error: 'no data' });
    res.json({
      id: BRAND, game: g.name,
      phien_truoc: last ? last.phien : null, xuc_xac: last ? last.dice : null, ket_qua: last ? last.result : null,
      phien_hien_tai: v.next ? v.next.phien : null, du_doan: v.next ? v.next.prediction : null, do_tin_cay_api: v.next && v.next.conf ? v.next.conf : null,
      ti_le_dung_thuc_te: s.n ? (s.w * 100 / s.n).toFixed(1) + '% (' + s.w + '/' + s.n + ')' : 'đang thu thập'
    });
  });
});
// Chẩn đoán dành riêng cho chủ (cần ADMIN_KEY): xem mẫu dữ liệu thô của nguồn để chỉnh bộ đọc. Tắt hẳn nếu không đặt ADMIN_KEY.
app.get('/api/debug', async (req, res) => {
  const k = String(req.query.key || '');
  const ok = ADMIN_KEY && k.length === ADMIN_KEY.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(ADMIN_KEY));
  if (!ok) return res.status(404).json({ error: 'not found' });
  const g = G[Number(req.query.id)];
  if (!g) return res.status(400).json({ error: 'bad id' });
  const url = req.query.kind === 'his' ? g.his : g.pred;
  if (!url) return res.json({ note: 'game này không có nguồn loại này' });
  try { res.type('text').send(JSON.stringify(await fetchJson(url, 15000)).slice(0, 2500)); } catch (e) { res.status(502).json({ error: String(e && e.message || e) }); }
});
app.get('/health', (req, res) => res.json({ ok: true, games: Object.keys(G).length }));
app.use((req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, next) => res.status(500).json({ error: 'server error' }));

const loopPred = () => Object.values(G).forEach((g, i) => setTimeout(() => pollPred(g), i * 200));
const loopHis = () => Object.values(G).forEach((g, i) => setTimeout(() => pollHis(g), i * 250));
setInterval(loopPred, Number(process.env.POLL_MS) || 10000);
setInterval(loopHis, Number(process.env.HIS_MS) || 30000);
loopPred(); loopHis();
process.on('unhandledRejection', e => console.log('unhandledRejection', e && e.message));
process.on('uncaughtException', e => console.log('uncaughtException', e && e.message));
app.listen(PORT, '0.0.0.0', () => console.log(BRAND + ' đang chạy ở cổng ' + PORT));
