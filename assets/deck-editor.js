/* ============================================================
   deck-editor.js｜HTML 簡報的視覺化編輯器

   用法：網址後面加 ?edit，例如 index.html?edit
   沒有 ?edit 時，這支只會載入「自訂進場動畫」的樣式，其餘什麼都不做，
   上台播放跟原本完全一樣。

   這支一定要放在簡報主程式 <script> 的前面：主程式會把標題拆成一個個字、
   把對話拆成打字機，編輯器要在拆之前留一份乾淨的原稿，存檔時才不會把拆字的結果存進去。
   ============================================================ */
(() => {
'use strict';
const ROOT = document.documentElement;
const ME = document.currentScript;
const HEAD0 = document.head.innerHTML;            // 編輯器還沒動 <head> 之前的樣子（備用的存檔方式會用到）

const addStyle = (css, id) => { const s = document.createElement('style'); s.id = id; s.textContent = css; document.head.appendChild(s); return s; };

/* ------------------------------------------------------------
   1. 自訂進場動畫：播放時也要用，所以不管有沒有 ?edit 都載入
   ------------------------------------------------------------ */
const ANIMS = [['', '原本的'], ['none', '不要動畫'], ['fade', '淡入'], ['up', '往上浮'], ['down', '往下落'], ['left', '從左邊滑入'], ['right', '從右邊滑入'], ['zoom', '放大'], ['pop', '彈出來'], ['blur', '模糊變清楚'], ['flip', '翻轉'], ['drop', '掉下來']];
const MOTION = { fade: 'ed-still', up: 'ed-up', down: 'ed-down', left: 'ed-left', right: 'ed-right', zoom: 'ed-zoom', pop: 'ed-pop', blur: 'ed-blur', flip: 'ed-flip', drop: 'ed-drop' };
const ANIM_LOCK = '.burst *, .ken *, .stampbox *, .chartwrap *, .ba *, [data-scroll] *, .suspense .line, .mark, .ring, .seal, .scan, .bignum';
const DLY = 'var(--adl, calc(var(--d, 0) * .13s + .15s))';
addStyle(`
@keyframes ed-o { from { opacity: 0; } }
@keyframes ed-still { from { transform: none; } }
@keyframes ed-up { from { transform: translateY(56px); } }
@keyframes ed-down { from { transform: translateY(-56px); } }
@keyframes ed-left { from { transform: translateX(-14vw); } }
@keyframes ed-right { from { transform: translateX(14vw); } }
@keyframes ed-zoom { from { transform: scale(.5); } }
@keyframes ed-pop { 0% { transform: scale(.3); } 60% { transform: scale(1.1); } 82% { transform: scale(.97); } 100% { transform: none; } }
@keyframes ed-blur { from { filter: blur(16px); transform: scale(1.12); } }
@keyframes ed-flip { from { transform: perspective(900px) rotateX(80deg); } }
@keyframes ed-drop { 0% { transform: translateY(-40vh); } 65% { transform: translateY(14px); } 85% { transform: translateY(-5px); } 100% { transform: none; } }
${Object.entries(MOTION).map(([k, v]) => `[data-anim="${k}"] { --ed-m: ${v}; }`).join('\n')}
.r[data-anim] { opacity: 1; transform: none; }
.kin[data-anim] .ch { opacity: 1 !important; transform: none !important; filter: none !important; animation: none !important; }
html:not(.calm):not(.qa) .slide.active [data-anim]:not([data-anim="none"]):not(.step),
html:not(.calm):not(.qa) .slide.active .step.on[data-anim]:not([data-anim="none"]) {
  animation: ed-o var(--adur, .8s) var(--ease, ease-out) ${DLY} both, var(--ed-m, ed-still) var(--adur, .8s) var(--ease, ease-out) ${DLY} both !important;
  animation-composition: replace, add !important;
}
[data-anim="none"]:not(.step) { animation: none !important; opacity: 1 !important; filter: none !important; }
.step[data-anim="none"] { transition: none !important; }
`, 'ed-play-css');

if (!new URLSearchParams(location.search).has('edit')) return;

/* ------------------------------------------------------------
   2. 留原稿：在主程式拆字之前，把投影片複製一份到看不見的文件裡
   ------------------------------------------------------------ */
const DECK = document.getElementById('deck');
if (!DECK) return;
const FILE = decodeURIComponent(location.pathname.split('/').pop() || 'index.html') || 'index.html';
const KEY = 'deck-editor:' + location.pathname;
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const BASE = hash(DECK.innerHTML);                // 檔案打開時投影片的樣子（判斷草稿、別人有沒有改過檔案）
let restored = false;
try { const r = sessionStorage.getItem(KEY + ':restore'); if (r) { sessionStorage.removeItem(KEY + ':restore'); DECK.innerHTML = r; restored = true; } } catch (e) {}
const BODY0 = document.body.innerHTML;
let EID = 0; const nid = () => 'e' + (++EID).toString(36);
DECK.setAttribute('data-eid', 'deck');
DECK.querySelectorAll('*').forEach(el => el.setAttribute('data-eid', nid()));
const SDOC = document.implementation.createHTMLDocument('src');   // 看不見的文件：圖片不會載入、程式不會跑
const SRC = SDOC.importNode(DECK, true); SDOC.body.appendChild(SRC);
const S = id => id === 'deck' ? SRC : SRC.querySelector(`[data-eid="${id}"]`);
const L = id => id === 'deck' ? DECK : DECK.querySelector(`[data-eid="${id}"]`);
const tagNew = root => root.querySelectorAll('*').forEach(el => { if (!el.hasAttribute('data-eid')) el.setAttribute('data-eid', nid()); });
const serialize = () => { const c = SRC.cloneNode(true); c.querySelectorAll('[data-eid]').forEach(e => e.removeAttribute('data-eid')); return c.innerHTML; };

let deck, TAIL = '', on = false, wasCalm = false, sel = null, selId = null, sameAll = false, editing = null, hov = null, dragging = false;
let dirHandle = null, diskHash = BASE;
const H = { undo: [], redo: [], saved: restored ? -1 : 0 };   // saved＝存檔當下那個動作的編號（0＝剛打開）
let VID = 0, saving = false;
const cur = () => H.undo.length ? H.undo[H.undo.length - 1].vid : 0;
const isDirty = () => cur() !== H.saved || !!editing || !!nudge;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

document.addEventListener('DOMContentLoaded', () => {
  try { init(); } catch (e) { console.error('[deck-editor]', e); alert('編輯器啟動失敗：' + e.message); }
});

function init() {
  deck = window.deck;
  if (!deck || !deck.slides) throw new Error('找不到簡報主程式（deck）');
  const box = document.createElement('div'); for (let n = ME.nextSibling; n; n = n.nextSibling) box.appendChild(n.cloneNode(true));
  TAIL = box.innerHTML.replace(/\s+$/, '\n');   // 主程式那段 <script>，存檔時原樣放回去（</body> 後面的空行會被瀏覽器算進來，去掉）
  buildUI(); bindEvents(); enterEdit(); checkDraft();
  if (restored) toast('已恢復上次沒存的修改，記得按 ⌘S 存檔');
}

/* ------------------------------------------------------------
   3. 動作紀錄：每個修改同時改「畫面」和「原稿」，都可以復原
   ------------------------------------------------------------ */
const slideOf = id => { const s = S(id); const sl = s && s.closest('.slide'); return sl ? sl.dataset.eid : null; };
const setAttr = (el, name, v) => { if (!el) return; v == null ? el.removeAttribute(name) : el.setAttribute(name, v); };
const setProp = (st, p, v) => { if (!st) return; v ? st.setProperty(p, v) : st.removeProperty(p); };

function cmdStyle(items, label) {
  flushNudge();
  const recs = [];
  for (const it of items) {
    const s = S(it.id); if (!s) continue;
    const r = { id: it.id, prop: it.prop, sBefore: s.getAttribute('style'), vBefore: s.style.getPropertyValue(it.prop) };
    setProp(s.style, it.prop, it.value); if (!s.style.length) s.removeAttribute('style');
    r.sAfter = s.getAttribute('style'); r.vAfter = it.value || ''; recs.push(r);
  }
  for (const r of [...recs].reverse()) setAttr(S(r.id), 'style', r.sBefore);
  return { label, slide: recs[0] && slideOf(recs[0].id),
    do() { for (const r of recs) { setAttr(S(r.id), 'style', r.sAfter); const l = L(r.id); if (l) setProp(l.style, r.prop, r.vAfter); } },
    undo() { for (const r of [...recs].reverse()) { setAttr(S(r.id), 'style', r.sBefore); const l = L(r.id); if (l) setProp(l.style, r.prop, r.vBefore); } } };
}
function cmdAttr(items, label) {
  flushNudge();
  const recs = items.filter(it => S(it.id)).map(it => ({ ...it, before: S(it.id).getAttribute(it.name) }));
  return { label, slide: recs[0] && slideOf(recs[0].id),
    do() { recs.forEach(r => { setAttr(S(r.id), r.name, r.value); setAttr(L(r.id), r.name, r.value); }); },
    undo() { [...recs].reverse().forEach(r => { setAttr(S(r.id), r.name, r.before); setAttr(L(r.id), r.name, r.before); }); } };
}
function setHTML(id, h) { const s = S(id); s.innerHTML = h; tagNew(s); const l = L(id); if (l) { l.innerHTML = s.innerHTML; prep(l); } }
function cmdHTML(id, before, after, label) { flushNudge(); return { label, slide: slideOf(id), do() { setHTML(id, after); }, undo() { setHTML(id, before); } }; }
function cmdRemove(id, label) {
  flushNudge();
  const s = S(id), l = L(id), sp = s.parentNode, sn = s.nextSibling, lp = l.parentNode, ln = l.nextSibling, isSlide = s.matches('.slide');
  const near = isSlide ? (s.nextElementSibling || s.previousElementSibling) : null;
  return { label, structural: isSlide, slide: isSlide ? (near && near.dataset.eid) : slideOf(id), slideUndo: isSlide ? id : slideOf(id),
    do() { s.remove(); l.remove(); }, undo() { reinsert(s, sp, sn, S, SDOC); reinsert(l, lp, ln, L, document); } };
}
/* 復原刪除：原本的位置還在就放回原位；中間被改過（父元素重建）就用編號找回來 */
function reinsert(node, par, next, look, doc) {
  let p = par; if (!doc.contains(p)) p = look(par.dataset.eid) || par;
  let n = next && next.parentNode === p ? next : null;
  if (!n && next) { let x = next; while (x && x.nodeType !== 1) x = x.nextSibling; const f = x && x.dataset && look(x.dataset.eid); n = f && f.parentNode === p ? f : null; }
  p.insertBefore(node, n);
}
const multi = (cmds, label) => ({ label, slide: cmds[0].slide, do() { cmds.forEach(c => c.do()); }, undo() { [...cmds].reverse().forEach(c => c.undo()); } });

/* 主程式拆字（標題逐字、對話打字機）：只能對乾淨的內容做一次 */
function prep(el) {
  const sp = window.splitInto; if (!sp) return;
  [...(el.matches('.kin') ? [el] : []), ...el.querySelectorAll('.kin')].forEach(k => sp(k, 'ch'));
  [...(el.matches('.msg .t, .autotype') ? [el] : []), ...el.querySelectorAll('.msg .t, .autotype')].forEach(t => sp(t, 'tc'));
}

function exec(cmd) {
  if (!cmd) return;
  flushNudge(); cmd.vid = ++VID; cmd.do(); H.undo.push(cmd); H.redo = [];
  if (H.undo.length > 300) H.undo.shift();
  after(cmd, false);
}
function undo() { endText(true); flushNudge(); const c = H.undo.pop(); if (!c) return toast('沒有可以復原的動作了'); c.undo(); H.redo.push(c); after(c, true); toast('已復原：' + c.label); }
function redo() { endText(true); const c = H.redo.pop(); if (!c) return toast('沒有可以重做的動作'); c.do(); H.undo.push(c); after(c, false); toast('已重做：' + c.label); }

function after(cmd, isUndo) {
  deck.slides = [...DECK.querySelectorAll('.slide')];
  deck.buildTimeline();
  const want = isUndo ? (cmd.slideUndo || cmd.slide) : cmd.slide;
  let i = deck.slides.findIndex(s => s.dataset.eid === want);
  if (i < 0) i = Math.min(deck.i, deck.slides.length - 1);
  if (cmd.structural) renderList();
  deck.show(i, true); markCurrent();
  sel = selId ? L(selId) : null;
  if (sel && !deck.slides[deck.i].contains(sel)) { sel = null; selId = null; }
  syncSelClass(); renderSide(); refreshTop();
  thumbSoon(deck.slides[i].dataset.eid);
  saveDraftSoon();
}

/* ------------------------------------------------------------
   4. 選取：點一下選「一整塊」，雙擊進去改字
   ------------------------------------------------------------ */
const FORMAT = new Set(['B', 'STRONG', 'I', 'EM', 'SMALL', 'MARK', 'CODE', 'SUP', 'SUB', 'U', 'S', 'BR', 'ABBR', 'Q', 'CITE', 'TIME', 'FONT']);
const REPLACED = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME', 'SELECT', 'BUTTON', 'INPUT', 'TEXTAREA']);
const curSlide = () => deck.slides[deck.i];

function pickObject(t) {
  const slide = curSlide();
  let el = t && (t.nodeType === 1 ? t : t.parentElement);
  if (el && el.closest('svg')) el = el.closest('svg');
  while (el && el !== slide && slide.contains(el)) {
    if (!el.dataset.eid || el.matches('.ch, .tc, .dots, .dots *')) { el = el.parentElement; continue; }
    if (REPLACED.has(el.tagName.toUpperCase())) break;
    const d = getComputedStyle(el).display;
    if (d === 'inline' || d === 'contents') { el = el.parentElement; continue; }
    break;
  }
  if (!el || el === slide || !slide.contains(el) || el.matches('.wrap, .notes')) return null;
  return el;
}
function isTextual(el) {
  if (!el || !el.dataset.eid || el.matches('img, video, canvas, svg, iframe, select, input, textarea, button, .notes, .wrap, .slide')) return false;
  if (el.querySelector('img, video, canvas, svg, iframe, select, input, textarea, button, .dots')) return false;
  if (!el.textContent.trim()) return false;
  for (const c of el.querySelectorAll('*')) {
    if (c.matches('.ch, .tc, br')) continue;
    const d = getComputedStyle(c).display;
    if (d !== 'none' && !d.startsWith('inline')) return false;
  }
  return true;
}
/* 滑鼠底下真正要改的那段字 */
function deepText(t, obj) {
  const slide = curSlide();
  let el = t && (t.nodeType === 1 ? t : t.parentElement);
  while (el && el !== slide && (!el.dataset.eid || el.matches('.ch, .tc') || (FORMAT.has(el.tagName) && !el.className))) el = el.parentElement;
  for (let x = el; x && x !== slide && slide.contains(x); x = x.parentElement) {
    if (isTextual(x)) return x;
    if (x === obj) break;
  }
  if (obj && obj.matches('.msg')) return obj.querySelector('.t');
  return obj && isTextual(obj) ? obj : null;
}

const NAMES = [['.msg', '對話泡泡'], ['[data-count], [data-roll]', '數字'], ['h1, h2, h3, h4, .kin', '標題'], ['img', '圖片'], ['.panel, .card, .node', '卡片'], ['li', '清單項目'], ['a, button', '按鈕'], ['.chip, .tag', '標籤'], ['.builder', '指令積木'], ['.chat', '對話區'], ['.ba', '前後對照'], ['p, .lead, .kicker, .small, .quote, blockquote, figcaption, .t, .gloss, .u, .who', '文字']];
const nameOf = el => { for (const [q, n] of NAMES) if (el.matches(q)) return n; return '區塊'; };

function select(el) {
  if (el && !el.dataset.eid) el = null;
  if (el !== sel) sameAll = false;
  sel = el; selId = el ? el.dataset.eid : null;
  syncSelClass(); renderSide();
}
function syncSelClass() { DECK.querySelectorAll('.ed-sel').forEach(e => e.classList.remove('ed-sel')); if (sel) sel.classList.add('ed-sel'); }
function chain(el) { const out = []; for (let x = el; x && !x.matches('.wrap, .slide'); x = x.parentElement) if (x.dataset.eid) out.unshift(x); return out; }

/* ------------------------------------------------------------
   5. 改字
   ------------------------------------------------------------ */
function startText(el, x, y) {
  if (!el || !el.dataset.eid) return;
  if (editing) endText(true);
  const id = el.dataset.eid, s = S(id);
  editing = { el, id, before: s.innerHTML };
  el.innerHTML = s.innerHTML;                      // 換回沒拆字的原稿，才好改
  el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); el.classList.add('ed-editing');
  el.focus({ preventScroll: true });
  const gs = getSelection(); gs.removeAllRanges();
  const r = x != null && document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
  if (r && el.contains(r.startContainer)) gs.addRange(r); else { const rr = document.createRange(); rr.selectNodeContents(el); gs.addRange(rr); }
  renderSide();
}
function endText(commit) {
  if (!editing) return;
  const { el, id, before } = editing; editing = null;
  el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); el.classList.remove('ed-editing');
  getSelection().removeAllRanges();
  const after = cleanHTML(el.innerHTML, before);
  if (commit !== false && after !== before) {
    const cmds = [cmdHTML(id, before, after, '修改文字')], s = S(id), txt = el.textContent;
    if (s.hasAttribute('data-count')) { const m = txt.replace(/,/g, '').match(/-?\d+/); if (m) cmds.push(cmdAttr([{ id, name: 'data-count', value: m[0] }])); }
    if (s.hasAttribute('data-roll')) { const m = txt.match(/(\d{1,2})[:：](\d{2})/); if (m) cmds.push(cmdAttr([{ id, name: 'data-roll', value: m[1].padStart(2, '0') + ':' + m[2] }])); }
    exec(cmds.length > 1 ? multi(cmds, '修改文字') : cmds[0]);
  } else { const l = L(id); if (l) { l.innerHTML = S(id).innerHTML; prep(l); } deck.show(deck.i, true); renderSide(); }
}
/* 瀏覽器改字時會塞進奇怪的標籤，只留文字、換行、粗體斜體和原本就有的標籤 */
function cleanHTML(html, before) {
  const box = document.createElement('div'); box.innerHTML = html;
  const KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'BR', 'U', 'SUB', 'SUP']);
  const walk = n => [...n.childNodes].forEach(c => {
    if (c.nodeType !== 1) return;
    walk(c);
    if (c.hasAttribute('data-eid')) { c.removeAttribute('contenteditable'); return; }
    if (c.tagName === 'DIV' || c.tagName === 'P') { const f = document.createDocumentFragment(); if (c.previousSibling) f.appendChild(document.createElement('br')); while (c.firstChild) f.appendChild(c.firstChild); c.replaceWith(f); return; }
    if (!KEEP.has(c.tagName)) { c.replaceWith(...[...c.childNodes]); return; }
    [...c.attributes].forEach(a => c.removeAttribute(a.name));
  });
  walk(box);
  if (!/<br>\s*$/.test(before)) while (box.lastChild && (box.lastChild.nodeName === 'BR' || (box.lastChild.nodeType === 3 && !box.lastChild.textContent.trim() && box.lastChild.previousSibling && box.lastChild.previousSibling.nodeName === 'BR'))) box.lastChild.remove();
  return box.innerHTML;
}

/* ------------------------------------------------------------
   6. 移動、縮放、方向鍵微調
   ------------------------------------------------------------ */
const parseT = v => { const m = String(v || '').match(/(-?[\d.]+)vw(?:\s+(-?[\d.]+)vh)?/); return m ? { x: +m[1], y: +(m[2] || 0) } : { x: 0, y: 0 }; };   // 瀏覽器會把「X 0」縮寫成「X」
const fmtT = (x, y) => (Math.abs(x) < 0.005 && Math.abs(y) < 0.005) ? null : `${x.toFixed(2)}vw ${y.toFixed(2)}vh`;
const kScale = () => parseFloat(ROOT.style.getPropertyValue('--ed-k')) || 1;

function startDrag(e, el, wasSelected, drill) {   // drill：選了外層、按在裡面的元件上，沒拖就改選裡面那個
  const id = el.dataset.eid, x0 = e.clientX, y0 = e.clientY, t0 = parseT(S(id).style.translate), k = kScale();
  const r0 = el.getBoundingClientRect(), st = curSlide().getBoundingClientRect();
  let moved = false;
  const mv = ev => {
    let dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true; dragging = true;
    const cx = r0.left + r0.width / 2 + dx, cy = r0.top + r0.height / 2 + dy, sx = st.left + st.width / 2, sy = st.top + st.height / 2;
    const gx = Math.abs(cx - sx) < 6, gy = Math.abs(cy - sy) < 6;
    if (gx) dx += sx - cx; if (gy) dy += sy - cy;
    guide('v', gx ? sx : null, st); guide('h', gy ? sy : null, st);
    const v = fmtT(t0.x + dx / k / innerWidth * 100, t0.y + dy / k / innerHeight * 100);
    el.style.translate = v || '';
  };
  const up = ev => {
    removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
    guide('v', null); guide('h', null); dragging = false;
    if (moved) exec(cmdStyle([{ id, prop: 'translate', value: el.style.translate || null }], '移動'));
    else if (drill) select(drill);
    else if (wasSelected) { const tt = deepText(ev.target, el); if (tt) startText(tt, ev.clientX, ev.clientY); }
  };
  addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
}
function startScale(e) {
  e.preventDefault(); e.stopPropagation();
  if (!sel) return;
  const el = sel, id = selId, r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const d0 = Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)), s0 = parseFloat(S(id).style.scale) || 1;
  let s = s0;
  const mv = ev => { s = Math.min(6, Math.max(0.2, s0 * Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0)); el.style.scale = s.toFixed(3); };
  const up = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); exec(cmdStyle([{ id, prop: 'scale', value: Math.abs(s - 1) < 0.005 ? null : s.toFixed(3) }], '縮放')); };
  addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
}
let nudge = null;
function doNudge(dx, dy) {
  if (!sel) return;
  if (!nudge || nudge.id !== selId) { flushNudge(); nudge = { id: selId, el: sel, t: parseT(S(selId).style.translate) }; }
  nudge.t.x += dx / innerWidth * 100; nudge.t.y += dy / innerHeight * 100;
  sel.style.translate = fmtT(nudge.t.x, nudge.t.y) || '';
  clearTimeout(nudge.timer); nudge.timer = setTimeout(flushNudge, 450);
}
function flushNudge() {
  if (!nudge) return; const n = nudge; nudge = null; clearTimeout(n.timer);
  const c = cmdStyle([{ id: n.id, prop: 'translate', value: n.el.style.translate || null }], '移動');
  c.vid = ++VID; c.do(); H.undo.push(c); H.redo = []; after(c, false);
}

/* ------------------------------------------------------------
   7. 換圖片
   ------------------------------------------------------------ */
function readFile(file) { return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(file); }); }
async function shrink(file) {
  const url = await readFile(file);
  if (/svg|gif/.test(file.type)) return url;
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const max = 2400, big = Math.max(img.naturalWidth, img.naturalHeight);
    if (file.size < 700 * 1024 && big <= max) return url;
    const k = Math.min(1, max / big), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(file.type === 'image/png' ? 'image/webp' : 'image/jpeg', 0.86);
  } catch (e) { return url; }
}
async function replaceImage(img, file) {
  if (!img || img.tagName !== 'IMG') return toast('先點一張圖片，再換');
  if (!file || !file.type.startsWith('image/')) return toast('請選圖片檔（JPG、PNG、WebP）');
  toast('處理圖片中…');
  const url = await shrink(file), id = img.dataset.eid, items = [{ id, name: 'src', value: url }];
  if (S(id).hasAttribute('srcset')) items.push({ id, name: 'srcset', value: null });
  exec(cmdAttr(items, '換圖片'));
  toast('已換圖片。圖會一起存進 HTML 檔裡');
}

/* ------------------------------------------------------------
   8. 複製、刪除
   ------------------------------------------------------------ */
let DUP = 0;
function dupSlide() {
  endText(true);
  const sl = curSlide(), id = sl.dataset.eid, s = S(id), ns = s.cloneNode(true), suf = '-' + (++DUP) + Date.now().toString(36).slice(-3);
  [ns, ...ns.querySelectorAll('[data-eid]')].forEach(e => e.setAttribute('data-eid', nid()));
  const map = {};
  [ns, ...ns.querySelectorAll('[id]')].forEach(e => { if (e.id) { map[e.id] = e.id + suf; e.id = map[e.id]; } });
  ns.querySelectorAll('[data-add]').forEach(e => e.setAttribute('data-add', e.getAttribute('data-add').replace(/#([\w-]+)/, (m, x) => map[x] ? '#' + map[x] : m)));
  const nl = document.importNode(ns, true); prep(nl);
  const gS = SDOC.createTextNode('\n\n'), gL = document.createTextNode('\n\n');
  exec({ label: '複製這一頁', structural: true, slide: ns.dataset.eid, slideUndo: id,
    do() { s.after(gS, ns); sl.after(gL, nl); }, undo() { gS.remove(); ns.remove(); gL.remove(); nl.remove(); } });
  toast('已複製這一頁（第 ' + (deck.i + 1) + ' 頁）' + (ns.querySelector('[data-ba], [data-builder]') ? '。這頁的滑桿和複製按鈕要存檔、重新打開後才會動' : ''));
}
function delSlide() {
  endText(true);
  if (deck.slides.length <= 1) return toast('至少要留一頁');
  const n = deck.i + 1;
  select(null); exec(cmdRemove(curSlide().dataset.eid, '刪除第 ' + n + ' 頁'));
  toast('已刪除第 ' + n + ' 頁，按 ⌘Z 可以救回來');
}
const NEEDED = '[data-builder] button, [data-builder] .sentence, [data-builder] .rule, [data-scroll] img, [data-ba] > *';
function delEl() {
  if (!sel) return;
  if (sel.matches(NEEDED)) return toast('這是互動元件裡少不了的一塊，要刪請選外層，整個刪掉');
  const id = selId, nm = nameOf(sel);
  select(null); exec(cmdRemove(id, '刪除' + nm));
  toast('已刪除' + nm + '，按 ⌘Z 可以救回來');
}

/* ------------------------------------------------------------
   9. 存檔：選一次簡報資料夾，之後 ⌘S 直接蓋過 index.html
   ------------------------------------------------------------ */
function regionOf(text) {
  const m = text.match(/<main\b[^>]*\bid=["']?deck\b[^>]*>/i); if (!m) return null;
  const s = m.index + m[0].length, e = text.indexOf('</main>', s);
  return e < 0 ? null : { s, e };
}
const parsedHash = inner => { const t = document.createElement('template'); t.innerHTML = inner; return hash(t.innerHTML); };
function rebuild(inner) {
  const t = document.createElement('template'); t.innerHTML = HEAD0;
  t.content.querySelectorAll('[id^="ed-"]').forEach(e => e.remove());
  t.content.querySelectorAll('*').forEach(e => { if (e.tagName.includes('-') || /^(chrome|moz|safari-web)-extension:/.test(e.getAttribute('src') || e.getAttribute('href') || '')) e.remove(); });
  const b = document.createElement('template'); b.innerHTML = BODY0;
  [...b.content.children].forEach(e => { if (e.tagName.includes('-')) e.remove(); });
  const d = b.content.querySelector('#deck'); if (d) d.innerHTML = inner;
  return `<!DOCTYPE html>\n<html lang="${esc(ROOT.getAttribute('lang') || 'zh-TW')}">\n<head>${t.innerHTML}</head>\n<body>${b.innerHTML}${TAIL}</body>\n</html>\n`;
}
const buildFile = (inner, text) => { const r = text && regionOf(text); return r ? text.slice(0, r.s) + inner + text.slice(r.e) : rebuild(inner); };

async function save(pickAgain) {
  endText(true); flushNudge();
  if (saving) return toast('還在存上一次，等一下');
  const inner = serialize(), vid = cur();
  if (!window.showDirectoryPicker) return download(inner);
  saving = true;
  try {
    if (!dirHandle || pickAgain) {
      toast('請選「這份簡報所在的資料夾」（裡面有 index.html 和 assets）');
      dirHandle = await showDirectoryPicker({ id: 'deck-editor', mode: 'readwrite' });
    }
    if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('沒有拿到寫入權限');
    let hasAssets = true; try { await dirHandle.getDirectoryHandle('assets'); } catch (e) { hasAssets = false; }
    if (!hasAssets && !confirm(`「${dirHandle.name}」裡面沒有 assets 資料夾，存在這裡會看不到圖片。\n\n確定要存在這裡嗎？`)) { dirHandle = null; return; }
    let fh, text = '';
    try { fh = await dirHandle.getFileHandle(FILE); text = await (await fh.getFile()).text(); }
    catch (e) { if (!confirm(`「${dirHandle.name}」裡面沒有 ${FILE}，要新建一個嗎？`)) return; fh = await dirHandle.getFileHandle(FILE, { create: true }); }
    const r = text && regionOf(text);
    if (text && !r) { alert(`「${dirHandle.name}」裡的 ${FILE} 不是這份簡報，沒有存檔。\n請重新按存檔，選這份簡報所在的資料夾。`); dirHandle = null; return; }
    if (r && parsedHash(text.slice(r.s, r.e)) !== diskHash && !confirm(`${FILE} 在你編輯的這段時間被別人改過（可能是 Sonia、git pull 或 AI 改的）。\n\n按「確定」會用你現在的版本蓋過去；按「取消」先不存，可以先「下載一份」留著，再重新整理拿新版。`)) return;
    const out = buildFile(inner, text);
    const w = await fh.createWritable(); await w.write(out); await w.close();
    diskHash = hash(inner); H.saved = vid; if (cur() === vid) clearDraft(); else saveDraft(); refreshTop();
    toast(`已存檔：${dirHandle.name}/${FILE}`);
  } catch (e) {
    if (e && e.name === 'AbortError') return toast('沒有存檔');
    console.error(e); toast('存檔失敗（' + e.message + '），改成下載一份'); download(inner);
  } finally { saving = false; }
}
function download(inner) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rebuild(inner || serialize())], { type: 'text/html' }));
  a.download = FILE; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`已下載 ${FILE}。要放回簡報資料夾（跟 assets 同一層）蓋過舊檔，圖片才看得到`);
}
window.__edExport = () => buildFile(serialize(), null);   // 檢查用
window.__edSerialize = serialize;

/* 草稿：只存在這台電腦的瀏覽器，用來救「忘了存就關掉」；播放時不會自動套用 */
let draftTimer = null;
function saveDraftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 700); }
function saveDraft() {
  if (cur() === H.saved) return clearDraft();
  try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), base: BASE, html: serialize() })); }
  catch (e) { if (!saveDraft.warned) { saveDraft.warned = true; toast('修改太大，沒辦法暫存在瀏覽器，記得常按 ⌘S 存檔'); } }
}
function clearDraft() { try { localStorage.removeItem(KEY); } catch (e) {} }
function checkDraft() {
  if (restored) return;
  let d = null; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!d || !d.html || d.html === serialize()) return;
  const when = new Date(d.t).toLocaleString('zh-TW', { hour12: false });
  const warn = d.base !== BASE ? '（這份草稿是在檔案被改過之前做的，恢復會蓋掉後來的修改）' : '';
  const b = $('#ed-banner');
  b.innerHTML = `<span>上次有沒存檔的修改（${esc(when)}）${warn}</span><button class="ed-btn pri" data-b="restore">恢復</button><button class="ed-btn line" data-b="drop">不要了</button>`;
  b.style.display = 'flex';
  b.onclick = e => {
    const k = e.target.dataset.b; if (!k) return;
    b.style.display = 'none';
    if (k === 'drop') { clearDraft(); toast('已丟掉草稿'); return; }
    if (cur() !== H.saved && !confirm('恢復草稿會丟掉你剛剛在這個分頁做的修改，確定嗎？')) { b.style.display = 'flex'; return; }
    try { sessionStorage.setItem(KEY + ':restore', d.html); } catch (err) { return toast('草稿太大，沒辦法恢復'); }
    H.saved = cur(); location.reload();
  };
}

/* ------------------------------------------------------------
   10. 畫面：上方工具列、左邊投影片、右邊格式
   ------------------------------------------------------------ */
function buildUI() {
  addStyle(UI_CSS, 'ed-ui-css');
  const wrap = document.createElement('div'); wrap.className = 'ed-root';
  wrap.innerHTML = `
<div id="ed-top" class="ed-ui">
  <span class="brand">編輯簡報</span>
  <button class="ed-btn" data-t="undo" title="復原（⌘Z）">↶ 復原</button>
  <button class="ed-btn" data-t="redo" title="重做（⇧⌘Z）">↷ 重做</button>
  <span class="sep"></span>
  <button class="ed-btn" data-t="dup" title="複製這一頁（⌘D）">複製這一頁</button>
  <button class="ed-btn danger" data-t="delslide">刪除這一頁</button>
  <span class="grow"></span>
  <span id="ed-dirty">已存檔</span>
  <button class="ed-btn pri" data-t="save" title="存檔（⌘S）">存檔 <kbd>⌘S</kbd></button>
  <button class="ed-btn line" data-t="download" title="另外下載一份 HTML">下載一份</button>
  <button class="ed-btn line" data-t="play" title="從這一頁開始播放（⌘Enter）">▶ 播放</button>
</div>
<div id="ed-left" class="ed-ui"><div id="ed-slides"></div></div>
<div id="ed-right" class="ed-ui"></div>
<div id="ed-frame" class="ed-ui"><span class="tag"></span><i class="hd nw"></i><i class="hd ne"></i><i class="hd sw"></i><i class="hd se"></i></div>
<div id="ed-hover"></div>
<i class="ed-guide" id="ed-gv"></i><i class="ed-guide" id="ed-gh"></i>
<div id="ed-banner" class="ed-ui"></div>
<div id="ed-toast" class="ed-ui"></div>
<button id="ed-back" class="ed-ui" type="button">✎ 回到編輯（E）</button>
<input id="ed-file" type="file" accept="image/*" hidden>`;
  document.body.appendChild(wrap);
}

function layout() {
  const W = innerWidth, Hh = innerHeight, Lw = 196, Rw = 320, T = 52, pad = 28;
  const aw = Math.max(200, W - Lw - Rw - pad * 2), ah = Math.max(150, Hh - T - pad * 2);
  const k = Math.min(aw / W, ah / Hh), x = Lw + pad + (aw - W * k) / 2, y = T + pad + (ah - Hh * k) / 2;
  ROOT.style.setProperty('--ed-k', k.toFixed(5)); ROOT.style.setProperty('--ed-x', x.toFixed(1) + 'px'); ROOT.style.setProperty('--ed-y', y.toFixed(1) + 'px');
  const left = $('#ed-left'); left.style.setProperty('--mk', (150 / W).toFixed(5)); left.style.setProperty('--ar', (Hh / W).toFixed(5));
}

function enterEdit() {
  on = true; wasCalm = ROOT.classList.contains('calm');
  if (deck.vt) { try { deck.vt.skipTransition(); } catch (e) {} deck.vt = null; }
  if (deck.job) { deck.job.finish(); deck.job = null; }
  ROOT.classList.remove('vt', 'ed-play'); ROOT.classList.add('calm', 'ed-on');
  layout(); deck.show(deck.i, true); renderList(); select(null); refreshTop(); loop();
}
function exitEdit() {
  endText(true); flushNudge(); select(null); on = false;
  ROOT.classList.remove('ed-on'); ROOT.classList.add('ed-play'); if (!wasCalm) ROOT.classList.remove('calm');
  const s = curSlide(); s.classList.remove('active'); void s.offsetWidth; deck.show(deck.i, false);
}
function goSlide(n) {
  if (n < 0 || n >= deck.slides.length) return;
  endText(true); flushNudge(); sel = null; selId = null; syncSelClass();
  deck.show(n, true); markCurrent(); renderSide();
}

/* 左邊：縮圖 */
const SKY = { dusk: [[54, 63, 78], [77, 74, 85], [226, 150, 78]], night: [[11, 15, 22], [27, 33, 44], [62, 52, 60]], deep: [[4, 5, 8], [11, 13, 18], [24, 19, 24]], studio: [[16, 20, 28], [28, 35, 46], [38, 70, 72]], dawn: [[40, 50, 74], [124, 98, 112], [238, 168, 112]] };
const skyBg = n => { const c = SKY[n] || SKY.night; return `linear-gradient(rgb(${c[0]}), rgb(${c[1]}) 58%, rgb(${c[2]}))`; };
let io = null;
function renderList() {
  const box = $('#ed-slides'); box.innerHTML = '';
  if (io) io.disconnect();
  io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting && !en.target.drawn) drawThumb(en.target); }), { root: $('#ed-left'), rootMargin: '300px 0px' });
  let last = null;
  deck.slides.forEach((sl, i) => {
    const s = S(sl.dataset.eid), sec = s.getAttribute('data-sec') || '';
    if (sec !== last) { const h = document.createElement('div'); h.className = 'ed-sec'; h.textContent = sec; box.appendChild(h); last = sec; }
    const it = document.createElement('div'); it.className = 'ed-si'; it.dataset.i = i; it.dataset.id = sl.dataset.eid;
    const head = s.querySelector('h1, h2, h3, .quote, p'); it.title = (i + 1) + '．' + (head ? head.textContent.trim().slice(0, 40) : '');
    it.innerHTML = `<span class="ed-n">${i + 1}</span><div class="ed-thumb"></div>`;
    box.appendChild(it); io.observe(it);
  });
  markCurrent();
}
function drawThumb(it) {
  const s = S(it.dataset.id); if (!s) return;
  const c = document.importNode(s, true);
  [c, ...c.querySelectorAll('*')].forEach(e => { e.removeAttribute('id'); e.removeAttribute('data-eid'); });
  c.querySelectorAll('.notes').forEach(e => e.remove());
  c.querySelectorAll('.step').forEach(e => e.classList.add('on'));
  c.classList.add('active'); c.inert = true;
  const m = document.createElement('div'); m.className = 'ed-mini'; m.style.background = skyBg(s.getAttribute('data-sky')); m.appendChild(c);
  it.querySelector('.ed-thumb').replaceChildren(m); it.drawn = true;
}
const thumbWait = new Set(); let thumbTimer = null;
function thumbSoon(id) { thumbWait.add(id); clearTimeout(thumbTimer); thumbTimer = setTimeout(() => { thumbWait.forEach(x => { const it = document.querySelector(`.ed-si[data-id="${x}"]`); if (it && it.drawn) drawThumb(it); }); thumbWait.clear(); }, 300); }
function markCurrent() {
  document.querySelectorAll('.ed-si').forEach(it => it.classList.toggle('cur', +it.dataset.i === deck.i));
  const c = document.querySelector('.ed-si.cur'); if (c && on) c.scrollIntoView({ block: 'nearest' });
}

/* 上方：復原、存檔狀態 */
function refreshTop() {
  const dirty = cur() !== H.saved;
  const d = $('#ed-dirty'); d.textContent = dirty ? '● 還沒存檔' : '已存檔'; d.classList.toggle('on', dirty);
  $('#ed-top [data-t="undo"]').disabled = !H.undo.length; $('#ed-top [data-t="redo"]').disabled = !H.redo.length;
  document.title = (dirty ? '● ' : '') + document.title.replace(/^● /, '');
}

/* 右邊：格式面板 */
const FONTS = [['', '原本的'], ['var(--display)', '宙黑體（標題字）'], ['var(--body)', '黑體（內文字）'], ['var(--mono)', '等寬字'], ['system-ui, sans-serif', '系統字']];
const COLORS = [['var(--cream)', '#fff8ef', '米白'], ['#ffffff', '#ffffff', '白'], ['var(--orange)', '#e89d4f', '橘'], ['var(--orange-2)', '#ffd7ad', '淺橘'], ['var(--mint)', '#75c8c6', '薄荷綠'], ['var(--muted)', '#b3bcc9', '灰'], ['var(--red)', '#c4553a', '紅'], ['var(--ink)', '#0f141c', '深色']];
const SKIES = [['dusk', '黃昏'], ['night', '晚上'], ['deep', '深夜'], ['studio', '工作室'], ['dawn', '清晨']];
const TRANS = [['rise', '往上換頁'], ['iris', '圓形打開'], ['wipe', '從右邊擦過來'], ['zoom', '放大穿過去'], ['blinds', '拉開'], ['fade', '淡入淡出']];
const opt = (list, cur) => list.map(([v, n]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
const rgbHex = c => { const m = String(c).match(/\d+(\.\d+)?/g); if (!m) return '#ffffff'; return '#' + m.slice(0, 3).map(v => (+v | 0).toString(16).padStart(2, '0')).join(''); };
const sig = s => s.tagName + '|' + [...s.classList].sort().join('.');
const sameAs = id => { const s = S(id), g = sig(s); return [...SRC.querySelectorAll(s.tagName)].filter(x => sig(x) === g && !x.closest('.notes')).map(x => x.dataset.eid); };
const targets = () => sel ? (sameAll ? sameAs(selId) : [selId]) : [];
const animTargets = () => targets().filter(id => { const l = L(id); return !(l && l.matches(ANIM_LOCK)); });
const KEYS = `<div class="ed-keys"><kbd>點一下</kbd> 選取　<kbd>雙擊</kbd> 改字　<kbd>拖曳</kbd> 移動<br><kbd>方向鍵</kbd> 微調位置（加 <kbd>⇧</kbd> 走大步）<br><kbd>Delete</kbd> 刪除選取的元件　<kbd>Esc</kbd> 取消選取<br><kbd>⌘Z</kbd> 復原　<kbd>⇧⌘Z</kbd> 重做　<kbd>⌘D</kbd> 複製這一頁<br><kbd>⌘S</kbd> 存檔　<kbd>⌘Enter</kbd> 播放　沒選東西時 <kbd>←</kbd><kbd>→</kbd> 換頁</div>`;

function renderSide() {
  const R = $('#ed-right'); if (!R) return;
  R.innerHTML = sel ? sideEl() : sideSlide();
}
function sideSlide() {
  const sl = curSlide(), s = S(sl.dataset.eid), notes = s.querySelector('.notes');
  const lines = notes ? [...notes.querySelectorAll('li')].map(li => li.innerHTML.trim()).join('\n') : '';
  return `<p class="ed-h">第 ${deck.i + 1} 頁　<span class="ed-sub">共 ${deck.slides.length} 頁</span></p>
<p class="ed-sub">點投影片上的字、圖或卡片就能選取。</p>
<div class="ed-group"><b>這一頁</b>
  <div class="ed-row"><label>背景天空</label><div class="f"><select data-set="data-sky">${opt(SKIES, s.getAttribute('data-sky') || 'night')}</select></div></div>
  <div class="ed-row"><label>換頁效果</label><div class="f"><select data-set="data-trans">${opt(TRANS, s.getAttribute('data-trans') || 'rise')}</select></div></div>
  <div class="ed-row"><label>章節</label><div class="f"><input type="text" data-set="data-sec" value="${esc(s.getAttribute('data-sec'))}"></div></div>
  <div class="ed-row"><label>右上角字</label><div class="f"><input type="text" data-set="data-stamp" value="${esc(s.getAttribute('data-stamp'))}"></div></div>
  <div class="ed-actions"><button class="ed-btn line" data-act="dupslide">複製這一頁</button><button class="ed-btn line danger" data-act="delslide">刪除這一頁</button></div>
</div>
<div class="ed-group"><b>講者備註</b><p class="ed-note">一行一點，播放時按 N 看得到，觀眾看不到。</p>
  <textarea data-set="notes" ${notes ? '' : 'disabled'}>${esc(lines)}</textarea></div>
<div class="ed-group"><b>存檔</b><p class="ed-note">第一次按「存檔」要選這份簡報所在的資料夾（裡面有 index.html 和 assets），之後 ⌘S 就直接存。沒存檔就關掉的話，下次用同一個瀏覽器打開會問你要不要恢復。</p></div>
<div class="ed-group"><b>快捷鍵</b>${KEYS}</div>`;
}
function sideEl() {
  const el = sel, s = S(selId), cs = getComputedStyle(el), tt = deepText(null, el);
  const isImg = el.tagName === 'IMG', hasText = !isImg && el.textContent.trim();
  const crumbs = chain(el), n = sameAs(selId).length;
  let h = `<p class="ed-h">${nameOf(el)}</p><p class="ed-sub">${tt ? '雙擊或按 Enter 改字。拖曳可以移動。' : isImg ? '拖曳可以移動，四個角可以放大縮小。' : '拖曳可以移動，四個角可以放大縮小。'}</p>`;
  if (crumbs.length > 1) h += `<div class="ed-crumb">${crumbs.map(c => `<button data-act="pick" data-id="${c.dataset.eid}" class="${c === el ? 'cur' : ''}">${nameOf(c)}</button>`).join('')}</div>`;
  h += `<div class="ed-actions">${tt ? '<button class="ed-btn line" data-act="text">改文字</button>' : ''}${crumbs.length > 1 ? '<button class="ed-btn line" data-act="up">選外層</button>' : ''}<button class="ed-btn line danger" data-act="del">刪除</button></div>`;
  if (s.hasAttribute('data-count')) h += `<p class="ed-note">播放時這個數字會從 0 跑到 ${esc(s.getAttribute('data-count'))}。雙擊直接改數字就好。</p>`;
  if (s.hasAttribute('data-roll')) h += `<p class="ed-note">播放時時鐘會轉到 ${esc(s.getAttribute('data-roll'))}。雙擊直接改時間就好。</p>`;
  if (n > 1) h += `<label class="ed-check"><input type="checkbox" data-set="same" ${sameAll ? 'checked' : ''}><span>下面的字體、字級、顏色、對齊、動畫，一起套用到整份簡報同一類的元件（共 ${n} 個）</span></label>`;
  if (hasText) {
    const ff = s.style.getPropertyValue('font-family').trim(), col = s.style.getPropertyValue('color').trim(), al = s.style.getPropertyValue('text-align').trim();
    const px = Math.round(parseFloat(cs.fontSize));
    h += `<div class="ed-group"><b>文字</b>
  <div class="ed-row"><label>字體</label><div class="f"><select data-set="font-family">${opt(FONTS.some(f => f[0] === ff) ? FONTS : [...FONTS, [ff, '自訂']], ff)}</select></div></div>
  <div class="ed-row"><label>字級</label><div class="f"><input type="range" min="8" max="220" value="${px}" data-set="font-size" data-live="font-size"><input type="number" min="6" max="400" value="${px}" data-set="font-size"><span class="ed-sub">px</span></div></div>
  ${s.style.getPropertyValue('font-size') ? '<div class="ed-row"><label></label><div class="f"><button class="ed-btn line" data-act="reset" data-p="font-size">字級改回原本的</button></div></div>' : ''}
  <div class="ed-row"><label>顏色</label><div class="f ed-sw">${COLORS.map(([v, hex, nm]) => `<button title="${nm}" data-act="color" data-v="${esc(v)}" class="${col === v ? 'cur' : ''}" style="background:${hex}"></button>`).join('')}<input type="color" value="${rgbHex(cs.color)}" data-set="color" data-live="color" title="自己選顏色"><button title="改回原本的顏色" class="none ${col ? '' : 'cur'}" data-act="color" data-v=""></button></div></div>
  <div class="ed-row"><label>對齊</label><div class="f"><span class="ed-seg">${[['', '原本'], ['left', '靠左'], ['center', '置中'], ['right', '靠右']].map(([v, nm]) => `<button data-act="align" data-v="${v}" class="${al === v ? 'cur' : ''}">${nm}</button>`).join('')}</span></div></div>
</div>`;
  }
  if (isImg) h += `<div class="ed-group"><b>圖片</b><div class="ed-actions"><button class="ed-btn pri" data-act="img">換一張圖片…</button></div><p class="ed-note">也可以直接把電腦裡的圖片拖到這張圖上。新圖會存進 HTML 檔裡。</p></div>`;
  const t = parseT(s.style.translate), sc = parseFloat(s.style.scale) || 1, moved = !!(s.style.translate || s.style.scale);
  h += `<div class="ed-group"><b>位置和大小</b>
  <div class="ed-row"><label>左右</label><div class="f"><input type="number" step="0.5" value="${+t.x.toFixed(2)}" data-set="tx"><span class="ed-sub">畫面寬的 %</span></div></div>
  <div class="ed-row"><label>上下</label><div class="f"><input type="number" step="0.5" value="${+t.y.toFixed(2)}" data-set="ty"><span class="ed-sub">畫面高的 %</span></div></div>
  <div class="ed-row"><label>縮放</label><div class="f"><input type="number" step="5" min="20" max="600" value="${Math.round(sc * 100)}" data-set="sc"><span class="ed-sub">%</span></div></div>
  ${moved ? '<div class="ed-actions"><button class="ed-btn line" data-act="home">回到原本的位置和大小</button></div>' : ''}
</div>`;
  const an = s.getAttribute('data-anim') || '', dur = parseFloat(s.style.getPropertyValue('--adur')) || 0.8, dl = s.style.getPropertyValue('--adl').trim();
  h += `<div class="ed-group"><b>進場動畫</b>
  ${el.matches('.step') ? '<p class="ed-note">這個元件是按 → 才出現的步驟，動畫會在它出現的時候播。</p>' : '<p class="ed-note">換到這一頁的時候播。</p>'}
  ${el.matches(ANIM_LOCK) ? '<p class="ed-note">這個元件的動畫是特別設計的（爆炸圖、標註、蓋章、截圖推近這類），換掉會出問題，這裡先鎖住。</p>' : `<div class="ed-row"><label>效果</label><div class="f"><select data-set="anim">${opt(ANIMS, an)}</select></div></div>`}
  ${an && an !== 'none' && !el.matches(ANIM_LOCK) ? `<div class="ed-row"><label>多久</label><div class="f"><input type="range" min="0.2" max="3" step="0.1" value="${dur}" data-set="adur" data-live="--adur"><span class="ed-sub">${dur.toFixed(1)} 秒</span></div></div>
  <div class="ed-row"><label>等多久</label><div class="f"><input type="range" min="0" max="4" step="0.1" value="${dl ? parseFloat(dl) : 0}" data-set="adl"><span class="ed-sub">${dl ? parseFloat(dl).toFixed(1) + ' 秒' : '自動'}</span></div></div>
  <div class="ed-actions"><button class="ed-btn line" data-act="preview">▶ 預覽動畫</button></div>` : ''}
</div>`;
  return h;
}

const fmtSize = px => `min(${(px / innerWidth * 100).toFixed(3)}vw, ${(px / innerHeight * 100).toFixed(3)}vh)`;
function sideAct(act, b) {
  if (editing && act !== 'text') endText(true);
  const ids = targets();
  switch (act) {
    case 'pick': select(L(b.dataset.id)); break;
    case 'up': { const c = chain(sel); if (c.length > 1) select(c[c.length - 2]); break; }
    case 'text': { const tt = deepText(null, sel); if (tt) startText(tt); break; }
    case 'del': delEl(); break;
    case 'dupslide': dupSlide(); break;
    case 'delslide': delSlide(); break;
    case 'color': exec(cmdStyle(ids.map(id => ({ id, prop: 'color', value: b.dataset.v || null })), '換顏色')); break;
    case 'align': exec(cmdStyle(ids.map(id => ({ id, prop: 'text-align', value: b.dataset.v || null })), '換對齊')); break;
    case 'reset': exec(cmdStyle(ids.map(id => ({ id, prop: b.dataset.p, value: null })), '改回原本的')); break;
    case 'home': exec(cmdStyle([{ id: selId, prop: 'translate', value: null }, { id: selId, prop: 'scale', value: null }], '回到原位')); break;
    case 'img': $('#ed-file').click(); break;
    case 'preview': preview(ids); break;
  }
}
function sideSet(t) {
  if (editing) endText(true);
  const k = t.dataset.set, v = t.value, ids = targets();
  if (k === 'same') { sameAll = t.checked; renderSide(); return; }
  if (k === 'notes') {
    const nt = S(curSlide().dataset.eid).querySelector('.notes'); if (!nt) return;
    const html = v.split('\n').map(x => x.trim()).filter(Boolean).map(x => `\n    <li>${x}</li>`).join('') + '\n  ';
    if (html !== nt.innerHTML) exec(cmdHTML(nt.dataset.eid, nt.innerHTML, html, '改講者備註'));
    return;
  }
  if (/^data-/.test(k)) { exec(cmdAttr([{ id: curSlide().dataset.eid, name: k, value: v }], '改這一頁的設定')); if (k === 'data-sec') renderList(); return; }
  switch (k) {
    case 'font-family': exec(cmdStyle(ids.map(id => ({ id, prop: 'font-family', value: v || null })), '換字體')); break;
    case 'font-size': { const px = +v; if (px > 0) exec(cmdStyle(ids.map(id => ({ id, prop: 'font-size', value: fmtSize(px) })), '換字級')); break; }
    case 'color': exec(cmdStyle(ids.map(id => ({ id, prop: 'color', value: v })), '換顏色')); break;
    case 'tx': case 'ty': { const c = parseT(S(selId).style.translate); c[k === 'tx' ? 'x' : 'y'] = +v || 0; exec(cmdStyle([{ id: selId, prop: 'translate', value: fmtT(c.x, c.y) }], '移動')); break; }
    case 'sc': { const s = (+v || 100) / 100; exec(cmdStyle([{ id: selId, prop: 'scale', value: Math.abs(s - 1) < 0.005 ? null : s.toFixed(3) }], '縮放')); break; }
    case 'anim': exec(cmdAttr(animTargets().map(id => ({ id, name: 'data-anim', value: v || null })), '換動畫')); if (v && v !== 'none') setTimeout(() => preview(targets()), 60); break;
    case 'adur': exec(cmdStyle(ids.map(id => ({ id, prop: '--adur', value: (+v).toFixed(1) + 's' })), '改動畫長度')); setTimeout(() => preview(targets()), 60); break;
    case 'adl': exec(cmdStyle(ids.map(id => ({ id, prop: '--adl', value: (+v).toFixed(1) + 's' })), '改動畫等待')); break;
  }
}
function sideLive(t) {
  const p = t.dataset.live, v = t.value;
  const val = p === 'font-size' ? fmtSize(+v) : p === '--adur' ? (+v).toFixed(1) + 's' : v;
  targets().forEach(id => { const l = L(id); if (l) l.style.setProperty(p, val); });
  if (p === 'font-size') { const num = t.parentElement.querySelector('input[type=number]'); if (num) num.value = v; }
  if (p === '--adur') { const sp = t.parentElement.querySelector('.ed-sub'); if (sp) sp.textContent = (+v).toFixed(1) + ' 秒'; }
}
function preview(ids) {
  ids.forEach(id => {
    const el = L(id), s = S(id); if (!el || !s) return;
    const a = s.getAttribute('data-anim'); if (!a || a === 'none') return;
    const dur = parseFloat(s.style.getPropertyValue('--adur')) || 0.8;
    el.style.setProperty('animation', `ed-o ${dur}s var(--ease) 0s both, ${MOTION[a]} ${dur}s var(--ease) 0s both`, 'important');
    el.style.setProperty('animation-composition', 'replace, add', 'important');
    clearTimeout(el.edPrev); el.edPrev = setTimeout(() => { el.style.removeProperty('animation'); el.style.removeProperty('animation-composition'); }, dur * 1000 + 120);
  });
}

/* 選取框、滑過框、對齊線 */
function place(box, el) {
  if (!el || !el.isConnected) { box.style.display = 'none'; return; }
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) { box.style.display = 'none'; return; }
  box.style.display = 'block'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
}
function guide(dir, pos, st) {
  const g = $(dir === 'v' ? '#ed-gv' : '#ed-gh'); if (pos == null) { g.style.display = 'none'; return; }
  g.style.display = 'block';
  if (dir === 'v') Object.assign(g.style, { left: pos + 'px', top: st.top + 'px', width: '1px', height: st.height + 'px' });
  else Object.assign(g.style, { left: st.left + 'px', top: pos + 'px', width: st.width + 'px', height: '1px' });
}
function loop() {
  if (!on) return;
  requestAnimationFrame(loop);
  const f = $('#ed-frame'); place(f, editing ? editing.el : sel);
  f.classList.toggle('text', !!editing);
  const tag = f.querySelector('.tag'), label = editing ? '正在改字　Esc 結束' : sel ? nameOf(sel) + (deepText(null, sel) ? '　雙擊改字' : '') : '';
  if (tag.textContent !== label) tag.textContent = label;
  place($('#ed-hover'), !dragging && hov && hov !== sel && !editing ? hov : null);
}

function toast(msg) {
  const t = $('#ed-toast'); if (!t) return; t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ------------------------------------------------------------
   11. 事件：編輯時，滑鼠鍵盤都先給編輯器，簡報主程式收不到
   ------------------------------------------------------------ */
const isField = t => t && t.closest && !!t.closest('input, textarea, select, [contenteditable="true"]');
const inUI = t => t && t.closest && !!t.closest('.ed-ui');
function bindEvents() {
  addEventListener('resize', () => { if (on) layout(); });
  addEventListener('beforeunload', e => { if (editing) endText(true); flushNudge(); if (cur() !== H.saved) { saveDraft(); e.preventDefault(); e.returnValue = ''; } });

  $('#ed-top').addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    ({ undo, redo, dup: dupSlide, delslide: delSlide, save: () => save(false), download: () => { endText(true); flushNudge(); download(); }, play: exitEdit })[b.dataset.t]();
  });
  $('#ed-back').addEventListener('click', enterEdit);
  $('#ed-slides').addEventListener('click', e => { const it = e.target.closest('.ed-si'); if (it) goSlide(+it.dataset.i); });
  const R = $('#ed-right');
  R.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) sideAct(b.dataset.act, b); });
  R.addEventListener('input', e => { if (e.target.dataset.live) sideLive(e.target); });
  R.addEventListener('change', e => { if (e.target.dataset.set) sideSet(e.target); });
  document.querySelectorAll('#ed-frame .hd').forEach(h => h.addEventListener('pointerdown', startScale));
  $('#ed-file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) replaceImage(sel, f); });

  addEventListener('keydown', e => {
    const k = e.key, mod = e.metaKey || e.ctrlKey, lk = k.length === 1 ? k.toLowerCase() : k;
    if (!on) {
      if (lk === 'e' && !mod && !isField(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); enterEdit(); }
      return;
    }
    e.stopPropagation();
    if (mod && lk === 's') { e.preventDefault(); save(e.shiftKey); return; }
    if (editing) {
      if (k === 'Escape') { e.preventDefault(); endText(true); }
      else if (k === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
      return;
    }
    if (isField(e.target)) return;
    if (mod && lk === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && lk === 'y') { e.preventDefault(); redo(); return; }
    if (mod && lk === 'd') { e.preventDefault(); dupSlide(); return; }
    if ((mod && k === 'Enter') || k === 'F5') { e.preventDefault(); exitEdit(); return; }
    if (k === 'Escape') { e.preventDefault(); select(null); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); delEl(); return; }
    if ((k === 'Enter' || k === 'F2') && sel) { e.preventDefault(); const tt = deepText(null, sel); if (tt) startText(tt); return; }
    const step = e.shiftKey ? 10 : 1;
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      if (sel) doNudge(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0);
      else goSlide(deck.i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (k === 'PageDown') { e.preventDefault(); goSlide(deck.i + 1); }
    else if (k === 'PageUp') { e.preventDefault(); goSlide(deck.i - 1); }
    else if (k === 'Home') { e.preventDefault(); goSlide(0); }
    else if (k === 'End') { e.preventDefault(); goSlide(deck.slides.length - 1); }
  }, true);

  addEventListener('pointerdown', e => {
    if (!on || inUI(e.target)) return;
    if (editing && editing.el.contains(e.target)) { e.stopPropagation(); return; }
    if (editing) endText(true);
    flushNudge();
    e.stopPropagation();
    if (!e.target.closest || !e.target.closest('#deck')) { if (e.button === 0) select(null); return; }
    e.preventDefault();
    if (e.button !== 0) return;
    const obj = pickObject(e.target), was = sel;
    if (sel && obj && obj !== sel && sel.contains(obj)) { startDrag(e, sel, true, obj); return; }   // 已經選了外層：拖的是外層
    if (obj !== sel) select(obj);
    if (obj) startDrag(e, obj, was === obj);
  }, true);
  addEventListener('mousedown', e => { if (on && !inUI(e.target) && !(editing && editing.el.contains(e.target)) && e.target.closest && e.target.closest('#deck')) e.preventDefault(); }, true);
  ['click', 'dblclick', 'auxclick'].forEach(type => addEventListener(type, e => {
    if (!on || inUI(e.target)) return;
    e.stopPropagation();
    if (editing && editing.el.contains(e.target)) return;
    if (e.target.closest && e.target.closest('#deck')) {
      e.preventDefault();
      if (type === 'dblclick' && !editing && sel) { const tt = deepText(e.target, sel); if (tt) startText(tt, e.clientX, e.clientY); }
    }
  }, true));
  addEventListener('pointermove', e => { if (on && !dragging) hov = (!inUI(e.target) && e.target.closest && e.target.closest('#deck')) ? pickObject(e.target) : null; }, { capture: true, passive: true });
  let wlock = 0;
  addEventListener('wheel', e => {
    if (!on) return;
    e.stopPropagation();
    if (inUI(e.target) || !e.target.closest || !e.target.closest('#deck')) return;
    const now = Date.now(); if (now < wlock || Math.abs(e.deltaY) < 25) return; wlock = now + 380;
    goSlide(deck.i + (e.deltaY > 0 ? 1 : -1));
  }, { capture: true, passive: true });
  ['touchstart', 'touchend'].forEach(type => addEventListener(type, e => { if (on) e.stopPropagation(); }, { capture: true, passive: true }));
  addEventListener('paste', e => {
    if (!on || !editing || !editing.el.contains(e.target)) return;
    e.preventDefault();
    const lines = (e.clipboardData.getData('text/plain') || '').split(/\r?\n/);
    lines.forEach((ln, i) => { if (i) document.execCommand('insertLineBreak'); if (ln) document.execCommand('insertText', false, ln); });
  }, true);
  addEventListener('dragover', e => { if (on) e.preventDefault(); }, true);
  addEventListener('drop', e => {
    if (!on) return; e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f) return;
    const under = e.target.closest && e.target.closest('#deck') ? pickObject(e.target) : null;
    const img = under && under.tagName === 'IMG' ? under : (sel && sel.tagName === 'IMG' ? sel : null);
    if (!img) return toast('把圖片拖到要換掉的那張圖上');
    select(img); replaceImage(img, f);
  }, true);
}

/* ------------------------------------------------------------
   12. 編輯器自己的樣式（只在 ?edit 時載入，不會存進檔案）
   ------------------------------------------------------------ */
const UI_CSS = `
html.ed-on, html.ed-on body { background: #121418 !important; }
html.ed-on #sky, html.ed-on .vignette, html.ed-on .deck { transform: translate(var(--ed-x, 0px), var(--ed-y, 0px)) scale(var(--ed-k, 1)) !important; transform-origin: 0 0 !important; }
html.ed-on #sky { box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 18px 60px rgba(0,0,0,.6); }
html.ed-on .grain, html.ed-on .hud, html.ed-on .notes-panel { display: none !important; }
html.ed-on .deck, html.ed-on .deck * { user-select: none; -webkit-user-select: none; }
html.ed-on .deck img { -webkit-user-drag: none; }
html.ed-on .deck .ed-sel { cursor: move; }
html.ed-on .deck .ed-editing, html.ed-on .deck .ed-editing * { user-select: text !important; -webkit-user-select: text !important; cursor: text !important; }
html.ed-on .deck .ed-editing { outline: none; caret-color: currentColor; }
.ed-ui { font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif; color: #e7e9ec; letter-spacing: 0; text-align: left; }
.ed-ui *, .ed-ui *::before, .ed-ui *::after { box-sizing: border-box; }
.ed-ui button, .ed-ui select, .ed-ui input, .ed-ui textarea { font: inherit; color: inherit; }
#ed-top { position: fixed; z-index: 2147483000; left: 0; right: 0; top: 0; height: 52px; display: flex; align-items: center; gap: 4px; padding: 0 10px 0 16px; background: #1c1f25; border-bottom: 1px solid #2b3038; }
#ed-top .brand { font-weight: 600; margin-right: 12px; white-space: nowrap; }
#ed-top .sep { width: 1px; height: 22px; background: #2f343c; margin: 0 6px; }
#ed-top .grow { flex: 1; }
.ed-btn { height: 32px; padding: 0 11px; border-radius: 7px; border: 1px solid transparent; background: transparent; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.ed-btn:hover { background: #2a2f37; }
.ed-btn:disabled { opacity: .35; cursor: default; background: transparent; }
.ed-btn.pri { background: #e89d4f; color: #1a1208; font-weight: 600; }
.ed-btn.pri:hover { background: #f0ac63; }
.ed-btn.line { border-color: #3a404a; }
.ed-btn.danger:hover { background: #4a2323; color: #ffb4a6; }
.ed-btn kbd { font: 11px/1 ui-monospace, Menlo, monospace; opacity: .6; }
#ed-dirty { font-size: 12px; color: #8b949e; margin-right: 8px; white-space: nowrap; }
#ed-dirty.on { color: #ffcf96; }
#ed-left { position: fixed; z-index: 2147483000; left: 0; top: 52px; bottom: 0; width: 196px; overflow-y: auto; background: #181b20; border-right: 1px solid #2b3038; padding: 6px 10px 40px 6px; }
.ed-sec { font-size: 11px; color: #8b949e; margin: 14px 0 6px 24px; letter-spacing: .04em; }
.ed-si { display: flex; gap: 6px; align-items: flex-start; margin: 0 0 8px; cursor: pointer; }
.ed-n { width: 18px; text-align: right; font-size: 11px; color: #8b949e; padding-top: 2px; flex: none; }
.ed-thumb { position: relative; width: 150px; height: calc(150px * var(--ar, .5625)); overflow: hidden; border-radius: 4px; outline: 1px solid #2f343c; background: #0f141c; flex: none; }
.ed-si:hover .ed-thumb { outline-color: #5b636f; }
.ed-si.cur .ed-thumb { outline: 2px solid #e89d4f; }
.ed-si.cur .ed-n { color: #e89d4f; font-weight: 600; }
.ed-mini { position: absolute; left: 0; top: 0; width: 100vw; height: 100vh; transform: scale(var(--mk, .1)); transform-origin: 0 0; pointer-events: none; overflow: hidden; }
.ed-mini .slide { position: relative !important; inset: auto !important; visibility: visible !important; opacity: 1 !important; }
#ed-right { position: fixed; z-index: 2147483000; right: 0; top: 52px; bottom: 0; width: 320px; overflow-y: auto; background: #181b20; border-left: 1px solid #2b3038; padding: 16px 16px 60px; }
.ed-h { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
.ed-sub { font-size: 12px; color: #8b949e; margin: 0 0 12px; font-weight: 400; }
.ed-row .ed-sub { margin: 0; white-space: nowrap; }
.ed-crumb { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 12px; }
.ed-crumb button { font-size: 11px; padding: 2px 8px; border-radius: 10px; border: 1px solid #343a43; background: #20242b; cursor: pointer; }
.ed-crumb button + button::before { content: none; }
.ed-crumb button.cur { border-color: #5ab4ff; color: #9fd0ff; }
.ed-group { border-top: 1px solid #262a31; padding: 12px 0 4px; }
.ed-group > b { display: block; font-size: 12px; color: #aab2bc; font-weight: 600; margin: 0 0 9px; letter-spacing: .03em; }
.ed-row { display: flex; align-items: center; gap: 8px; margin: 0 0 9px; }
.ed-row > label { width: 58px; flex: none; color: #aab2bc; font-size: 12px; }
.ed-row > .f { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; }
.ed-ui select, .ed-ui input[type=text], .ed-ui input[type=number], .ed-ui textarea { width: 100%; background: #0f1115; border: 1px solid #343a43; border-radius: 6px; padding: 5px 8px; outline: none; }
.ed-ui select:focus, .ed-ui input:focus, .ed-ui textarea:focus { border-color: #e89d4f; }
.ed-ui input[type=number] { width: 76px; flex: none; }
.ed-ui input[type=range] { flex: 1; min-width: 0; accent-color: #e89d4f; }
.ed-ui input[type=color] { width: 28px; height: 24px; padding: 0; border: 1px solid #343a43; border-radius: 5px; background: none; cursor: pointer; }
.ed-ui textarea { min-height: 140px; resize: vertical; line-height: 1.6; }
.ed-sw { flex-wrap: wrap; }
.ed-sw button { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #2b3038; cursor: pointer; padding: 0; flex: none; }
.ed-sw button.cur { border-color: #fff; }
.ed-sw button.none { background: repeating-linear-gradient(45deg, #2c3138 0 4px, #4a515b 4px 8px); }
.ed-seg { display: inline-flex; border: 1px solid #343a43; border-radius: 6px; overflow: hidden; }
.ed-seg button { border: 0; background: transparent; padding: 4px 10px; cursor: pointer; }
.ed-seg button.cur { background: #3a404a; }
.ed-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.ed-note { font-size: 12px; color: #8b949e; margin: 0 0 9px; line-height: 1.6; }
.ed-check { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: #c9d1d9; margin: 2px 0 12px; cursor: pointer; line-height: 1.55; }
.ed-check input { margin-top: 2px; accent-color: #e89d4f; }
.ed-keys { font-size: 12px; color: #8b949e; line-height: 2; }
.ed-keys kbd { font: 11px/1 ui-monospace, Menlo, monospace; background: #262a31; border: 1px solid #343a43; border-bottom-width: 2px; border-radius: 4px; padding: 2px 5px; color: #c9d1d9; }
#ed-frame { position: fixed; z-index: 2147482000; pointer-events: none; border: 1.5px solid #5ab4ff; box-shadow: 0 0 0 1px rgba(0,0,0,.45); display: none; }
#ed-frame .hd { position: absolute; width: 11px; height: 11px; background: #fff; border: 1.5px solid #5ab4ff; border-radius: 2px; pointer-events: auto; }
#ed-frame .nw { left: -6px; top: -6px; cursor: nwse-resize; } #ed-frame .ne { right: -6px; top: -6px; cursor: nesw-resize; }
#ed-frame .sw { left: -6px; bottom: -6px; cursor: nesw-resize; } #ed-frame .se { right: -6px; bottom: -6px; cursor: nwse-resize; }
#ed-frame.text .hd { display: none; }
#ed-frame.text { border-color: #e89d4f; }
#ed-frame .tag { position: absolute; left: -1.5px; bottom: 100%; margin-bottom: 5px; background: #5ab4ff; color: #04121f; font: 600 11px/19px -apple-system, "PingFang TC", sans-serif; padding: 0 7px; border-radius: 4px; white-space: nowrap; }
#ed-frame.text .tag { background: #e89d4f; color: #1a1208; }
#ed-frame .tag:empty { display: none; }
#ed-hover { position: fixed; z-index: 2147481999; pointer-events: none; outline: 1px dashed rgba(90,180,255,.85); display: none; }
.ed-guide { position: fixed; z-index: 2147482001; pointer-events: none; background: #ff4fa3; display: none; }
#ed-toast { position: fixed; z-index: 2147483600; left: 50%; bottom: 26px; transform: translateX(-50%); display: none; background: #2a2f37; border: 1px solid #3a404a; padding: 9px 16px; border-radius: 9px; box-shadow: 0 10px 30px rgba(0,0,0,.45); pointer-events: none; max-width: 70vw; text-align: center; }
#ed-toast.show { display: block; }
#ed-banner { position: fixed; z-index: 2147483500; left: 50%; top: 64px; transform: translateX(-50%); background: #3a2a14; border: 1px solid #8a5a22; color: #ffe2bd; border-radius: 10px; padding: 8px 10px 8px 14px; display: none; gap: 10px; align-items: center; box-shadow: 0 10px 30px rgba(0,0,0,.45); max-width: 80vw; }
#ed-back { position: fixed; z-index: 2147483000; left: 14px; bottom: 14px; display: none; height: 34px; padding: 0 14px; border-radius: 17px; border: 1px solid rgba(255,255,255,.18); background: rgba(20,23,28,.72); color: #fff; cursor: pointer; opacity: .45; }
#ed-back:hover { opacity: 1; }
html.ed-play #ed-back { display: inline-flex; align-items: center; }
html:not(.ed-on) #ed-top, html:not(.ed-on) #ed-left, html:not(.ed-on) #ed-right, html:not(.ed-on) #ed-frame, html:not(.ed-on) #ed-hover, html:not(.ed-on) .ed-guide { display: none !important; }
`;
})();
