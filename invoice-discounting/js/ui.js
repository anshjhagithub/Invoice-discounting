/* =====================================================================
   ui.js — router, shell, drawers (panels), modals, shared widgets, lists, sidebar
   ===================================================================== */
const ui = { r: { parts: [], q: {} }, f: null, fKey: '', lists: {}, listSig: {}, derive: null, after: null, lastPath: '', panel: null };
const ACT = {};          // data-act handlers
const ROUTES = {};       // first path segment -> render(route) => html
const HOOKS = {};        // data-hook handlers
const PER_PAGE = 10;
const $ = s => document.querySelector(s);

/* ---------- routing ---------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, ''), [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: Object.fromEntries(new URLSearchParams(qs || '')), path: path };
}
const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };
const qs = o => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); }); const s = p.toString(); return s ? '?' + s : ''; };

function render() {
  closeMenu();
  const r = parseHash();
  ui.r = r;
  const samePage = ui.lastPath === r.path;
  if (!samePage) { ui.f = null; ui.fKey = ''; closeOverlays(); }
  ui.lastPath = r.path; ui.derive = null; ui.after = null;
  const y = window.scrollY;
  const fn = ROUTES[r.parts[0] || 'avail'] || ROUTES.avail;
  let html;
  try { html = fn(r); } catch (e) { console.error(e); html = `<div class="page"><div class="alert err"><div><div class="at">Screen error</div>${esc(e.message)}</div></div></div>`; }
  $('#main').innerHTML = html; $('#main').classList.toggle('enter', !samePage);
  renderSidebar();
  if (ui.after) ui.after();
  if (ui.panel) redrawPanel(); else if (ui.derive) ui.derive();
  window.scrollTo(0, samePage ? y : 0);
}

/* ---------- form binding (state lives in ui.f; inputs carry data-f="path") ---------- */
function setPath(obj, path, val) {
  const k = path.split('.'); let o = obj;
  for (let i = 0; i < k.length - 1; i++) { if (o[k[i]] == null) o[k[i]] = {}; o = o[k[i]]; }
  o[k[k.length - 1]] = val;
}
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
function handleField(e, isChange) {
  const el = e.target.closest('[data-f]'); if (!el || !ui.f) return;
  const rr = el.hasAttribute('data-r'); if (rr && !isChange) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.t === 'num' && el.type !== 'checkbox') v = v === '' ? '' : Number(v);
  setPath(ui.f, el.dataset.f, v);
  if (el.dataset.hook && HOOKS[el.dataset.hook]) HOOKS[el.dataset.hook](el, v);
  if (rr) render(); else if (ui.derive) ui.derive();
}
document.addEventListener('input', e => {
  handleField(e, false);
  const lq = e.target.closest('[data-lq]');
  if (lq) { const st = ui.lists[lq.dataset.lq]; st.q = lq.value; st.page = 1; $('#lb-' + lq.dataset.lq).innerHTML = listBody(lq.dataset.lq); }
});
document.addEventListener('change', e => {
  const sa = e.target.closest('select[data-act]'); if (sa && ACT[sa.dataset.act]) ACT[sa.dataset.act](sa);
  handleField(e, true);
  const lf = e.target.closest('[data-lf]');
  if (lf) { const [key, name] = lf.dataset.lf.split(':'); ui.lists[key][name] = lf.value; ui.lists[key].page = 1; render(); }
  const at = e.target.closest('[data-attach]');
  if (at && ui.f) { const arr = getPath(ui.f, at.dataset.attach) || []; [...at.files].forEach(f => arr.push(f.name)); setPath(ui.f, at.dataset.attach, arr); render(); }
  const rs = e.target.closest('[data-role]');
  if (rs) { db.meta.role = rs.value; save(); toast(`Now acting as ${actor()}`); render(); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && el.tagName !== 'SELECT') { const fn = ACT[el.dataset.act]; if (fn) { if (el.tagName !== 'INPUT') e.preventDefault(); fn(el, e); } else console.warn('No ACT', el.dataset.act); }
  else if (!e.target.closest('.menu')) closeMenu();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); const m = document.querySelector('.overlay'); if (m) m.remove(); else closePanel(); } });

/* ---------- result handling ---------- */
function done(r, after) {
  if (r.ok) { toast(r.msg); if (after) after(r); render(); return true; }
  const errs = r.errors || [r.msg];
  if (errs.length > 1 || String(errs[0]).length > 90) errorModal(errs.length > 1 && r.msg && r.msg !== errs[0] ? r.msg : 'Action blocked', errs); else toast(errs[0], 'err');
  return false;
}

/* ---------- overlays: toast / modal ---------- */
function toast(msg, kind) {
  const t = document.createElement('div'); t.className = 'toast' + (kind === 'err' ? ' err' : '');
  t.innerHTML = icon(kind === 'err' ? 'alert' : 'check', 16, 2.2) + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 5200 : 2800);
}
function closeOverlays() { document.querySelectorAll('.overlay').forEach(n => n.remove()); closePanel(); }
function openModal({ title, html = '', submitLabel = 'Save', onSubmit, cls = '', danger = false, hideFoot = false, cancelLabel = 'Cancel' }) {
  closeMenu();
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<form class="modal ${cls}" novalidate>
    <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-close>${icon('x', 18)}</button></div>
    <div class="modal-body">${html}</div>
    ${hideFoot ? '' : `<div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>${cancelLabel}</button>${onSubmit ? `<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(submitLabel)}</button>` : ''}</div>`}
  </form>`;
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', e => { ov._down = e.target === ov; });
  ov.addEventListener('click', e => { if ((e.target === ov && ov._down) || e.target.closest('[data-close]')) ov.remove(); });
  const form = ov.querySelector('form');
  form.addEventListener('submit', e => {
    e.preventDefault(); if (!onSubmit) return;
    const vals = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll('input[type=checkbox]').forEach(c => { vals[c.name] = c.checked; });
    if (onSubmit(vals, form) !== false) ov.remove();
  });
  setTimeout(() => form.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
  return ov;
}
const fld = (label, name, { type = 'text', value = '', ph = '', opts, rows, step, hint, req } = {}) => `<div class="field"><label>${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label>${
  opts ? `<select class="input" name="${name}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`
  : rows ? `<textarea class="input" name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(value)}</textarea>`
  : `<input class="input" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" ${step ? `step="${step}"` : ''}>`}${hint ? `<div class="fhint">${hint}</div>` : ''}</div>`;
function reasonModal({ title, label, btn = 'Confirm', danger = true, ph = '', onSubmit, extra = '', optional = false }) {
  openModal({ title, submitLabel: btn, danger, html: `${extra}${fld(label, 'reason', { rows: 3, ph, req: !optional })}`, onSubmit: v => { if (!optional && !String(v.reason || '').trim()) { toast(`${label} is required`, 'err'); return false; } return onSubmit(v.reason.trim()); } });
}
function confirmBox({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  openModal({ title, submitLabel: confirmLabel, danger, html: `<p>${message}</p>`, onSubmit: () => { onConfirm(); } });
}
function errorModal(title, errors) {
  openModal({ title, hideFoot: false, submitLabel: '', cancelLabel: 'Close', html: `<div class="alert err" style="margin-top:0"><div><ul style="margin:0;padding-left:18px">${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div></div>` });
  document.querySelector('.overlay .modal-foot .btn-primary')?.remove();
}

/* ---------- panels (right-hand drawers, like Create PO / GRN / Submit Invoice in DICE) ---------- */
/* openPanel({ key, title, sub, wide, init?, body(), foot?, derive? })
   body()/foot() are re-evaluated on every render, so a panel always shows live data. */
function openPanel(p) {
  closeOverlays();
  ui.f = p.init ? p.init() : null; ui.fKey = 'panel:' + p.key; ui.panel = p;
  const ov = document.createElement('div'); ov.className = 'drawer-ov';
  const d = document.createElement('aside'); d.className = 'panel' + (p.wide ? ' wide' : p.mid ? ' mid' : '');
  d.innerHTML = p.bare ? '<div class="panel-body"></div>' : `<div class="panel-head"><button class="x-btn" data-act="panel-close" title="Close">${icon('x', 22, 2)}</button><div><h2></h2><div class="sub"></div></div></div><div class="panel-body"></div><div class="panel-foot"></div>`;
  document.body.append(ov, d); ov.onclick = closePanel;
  redrawPanel();
}
function redrawPanel() {
  const p = ui.panel, d = $('.panel'); if (!p || !d) return;
  const body = d.querySelector('.panel-body'), sc = body.scrollTop, sc2 = [...body.querySelectorAll('.fm,.pv')].map(n => n.scrollTop);
  const val = x => typeof x === 'function' ? x() : x;
  let html;
  try { html = p.body(); } catch (e) { console.error(e); html = `<div class="alert err"><div><div class="at">Panel error</div>${esc(e.message)}</div></div>`; }
  if (!p.bare) { d.querySelector('h2').textContent = val(p.title) || ''; d.querySelector('.sub').innerHTML = val(p.sub) || ''; d.querySelector('.panel-foot').innerHTML = p.foot ? p.foot() : ''; }
  body.innerHTML = html;
  body.scrollTop = sc; [...body.querySelectorAll('.fm,.pv')].forEach((n, i) => { n.scrollTop = sc2[i] || 0; });
  ui.derive = p.derive || null; if (ui.derive) ui.derive();
}
function closePanel() {
  document.querySelectorAll('.drawer-ov,.panel').forEach(n => n.remove());
  if (ui.panel && ui.fKey.startsWith('panel:')) { ui.f = null; ui.fKey = ''; }
  ui.panel = null; ui.derive = null;
}
ACT['panel-close'] = () => closePanel();

let menuEl = null, menuBtn = null;
function closeMenu() { menuEl?.remove(); menuEl = null; menuBtn = null; }
function openMenu(btn, items) {
  if (menuBtn === btn) return closeMenu(); closeMenu(); menuBtn = btn;
  menuEl = document.createElement('div'); menuEl.className = 'menu';
  menuEl.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>${it.icon ? icon(it.icon, 15) : ''}${esc(it.label)}</button>`).join('');
  document.body.appendChild(menuEl);
  const r = btn.getBoundingClientRect(), w = menuEl.offsetWidth, h = menuEl.offsetHeight;
  let top = r.bottom + 4, left = r.right - w; if (top + h > innerHeight - 8) top = r.top - h - 4; if (left < 8) left = 8;
  menuEl.style.top = top + 'px'; menuEl.style.left = left + 'px';
  menuEl.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { const it = items[+b.dataset.i]; closeMenu(); it.run(); } });
}

/* ---------- small renderers ---------- */
const COLOR = {
  'Not Uploaded': 'gray',
  Approved: 'green', Accepted: 'green', Paid: 'green', Certified: 'green', Eligible: 'green', Matched: 'green', Passed: 'green', Completed: 'green',
  Posted: 'blue', Submitted: 'blue', 'Pending Matching': 'blue', 'In Progress': 'blue', 'Submitted for Approval': 'blue', 'Under Review': 'amber', 'Partially Invoiced': 'purple', None: 'gray',
  'Info Requested': 'amber', 'Pending Approval': 'amber', 'Pending Inspection': 'amber', 'Pending Acceptance': 'amber', 'Partially Accepted': 'amber', 'Partially Matched': 'amber', Pending: 'amber', 'Awaiting payment': 'amber',
  Draft: 'gray', Cancelled: 'gray', Closed: 'gray', 'Not Eligible': 'gray', 'Not started': 'gray', 'Not posted to AP': 'gray',
  Requested: 'amber', 'Guarantee pending': 'amber', 'Invoice raised': 'blue', 'Partly recovered': 'purple', Recovered: 'green', Refunded: 'gray', Verified: 'green', Uploaded: 'amber', Expired: 'red', Incomplete: 'amber',
  'Under review': 'blue', 'Offer available': 'purple', Funded: 'green', 'Settlement pending': 'amber', Settled: 'green', 'Not funded': 'gray', Exception: 'red', Active: 'green', 'In Active': 'gray', 'Action required': 'amber', Onboarding: 'blue', 'Not enabled': 'gray', Suspended: 'red',
  'Pending Internal Approval': 'amber', 'Rejected Internally': 'red', 'Needs Correction': 'red', 'Submission Uncertain': 'amber', 'Draft at PSB': 'amber', 'Onboarding pending': 'amber', Paused: 'amber', 'Offers Awaited': 'amber', 'Offers Submitted': 'purple', 'Offer Accepted': 'green', 'Offer Expired': 'red', 'Offer Rejected': 'red', 'Lender Rejected': 'red', 'Customer Rejected': 'red', 'Match Found': 'blue', 'Match Selected': 'blue', 'No Match Found': 'gray', OPEN: 'green', FINANCING_HOLD: 'amber', LOCKED: 'red', CLOSED: 'gray',
  Met: 'green', Waiting: 'amber', Rejected: 'red', 'Matching Failed': 'red', Blocked: 'red', Failed: 'red', Reversed: 'red', Invoiced: 'purple', Reserved: 'amber', Committed: 'green',
};
const sb = s => `<span class="badge-s s-${COLOR[s] || 'gray'}">${esc(s)}</span>`;
/* ---- BILLING (commented out) ----
const mb = m => `<span class="m-badge m-${String(m).toLowerCase()}">${esc(m)}</span>`;
const typeBadge = po => `<span class="t-badge ${po.type === 'Services' ? 't-services' : ''}">${esc(po.type)}</span>`;
const poMethodBadge = po => mb(po.billingMethod) + (poCertified(po) ? ' <span class="badge-s s-gray" style="margin-left:4px">Certified</span>' : '');
const stagePill = po => { const s = poStage(po); return `<span class="pill ${s.tone === 'green' ? '' : s.tone}">${esc(s.short)}</span>`; };
---- */
const link = (hash, label, cls = 'link') => `<a class="${cls}" href="${hash}">${esc(label)}</a>`;
/* BILLING (commented out): const poLink = po => link(`#/po/${po.id}`, po.number); */
const invLink = i => link(`#/id/inv/${i.id}`, invRef(i));
const actBtn = (act, label, { cls = 'btn-outline btn-sm', data = {}, icn, dis, title } = {}) => `<button class="btn ${cls}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} ${dis ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${icn ? icon(icn, 15) : ''}${esc(label)}</button>`;
const gbtn = (perm, act, label, o = {}) => can(perm) ? actBtn(act, label, o) : actBtn(act, label, { ...o, dis: true, title: whyNot(perm) });
const viewBtn = (hash, label = 'View') => `<button class="btn-view" data-act="go" data-hash="${hash}">${icon('open', 12, 2)}${label}</button>`;
const emptyRow = (cols, msg) => `<tr><td colspan="${cols}" class="empty">${esc(msg)}</td></tr>`;
const alertBox = (kind, title, body) => `<div class="alert ${kind}">${icon(kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'alert', 18)}<div>${title ? `<div class="at">${esc(title)}</div>` : ''}${body}</div></div>`;
const errList = errs => `<ul>${errs.map(e => `<li>${esc(typeof e === 'string' ? e : e.msg)}</li>`).join('')}</ul>`;
const kv = (k, v) => `<div><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
const strip = items => `<div class="strip">${items.map(([k, v, s, cls]) => `<div class="${cls || ''}"><div class="k">${esc(k)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}</div>`;
const noteBox = (cls, ic, html) => `<div class="note ${cls}"><div class="ic">${icon(ic, 15)}</div><div>${html}</div></div>`;
const attachChips = (arr, path) => (arr || []).map((f, i) => `<span class="attach">${icon('clip', 13)}${esc(f)}${path ? `<button type="button" data-act="rm-attach" data-path="${path}" data-i="${i}" title="Remove">${icon('x', 12, 2.4)}</button>` : ''}</span>`).join('');
const attachBox = (path, arr) => `<div class="dash-wrap">${attachChips(arr, path)}<button type="button" class="dash-add" data-act="pick-file" title="Attach a file">${icon('clip', 20)}</button><input type="file" multiple hidden data-attach="${path}"><button type="button" class="link" data-act="add-sample" data-path="${path}" style="font-size:12px">Add sample file</button></div>`;
ACT['pick-file'] = el => el.nextElementSibling.click();
ACT['rm-attach'] = el => { const arr = getPath(ui.f, el.dataset.path); arr.splice(+el.dataset.i, 1); render(); };
ACT['add-sample'] = el => { const arr = getPath(ui.f, el.dataset.path) || []; arr.push(`sample-document-${arr.length + 1}.pdf`); setPath(ui.f, el.dataset.path, arr); render(); };
const opt = (items, sel) => items.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const supOpts = () => db.vendors.map(s => [s.id, s.name]);
/* BILLING (commented out): const officeOpts = () => OFFICES.map(o => [o.id, o.name]); */

/* form-field builders bound to ui.f */
const fv = path => getPath(ui.f, path);
const F = {
  text: (label, path, o = {}) => `<div class="field ${o.cls || ''}"><label>${esc(label)}${o.req ? ' <span class="req">*</span>' : ''}</label><input class="input ${o.num ? 'num' : ''}" ${o.type ? `type="${o.type}"` : ''} ${o.step ? `step="${o.step}" min="0"` : ''} data-f="${path}" ${o.num ? 'data-t="num"' : ''} ${o.r ? 'data-r' : ''} value="${esc(fv(path) ?? '')}" placeholder="${esc(o.ph || '')}" ${o.dis ? 'disabled' : ''}>${o.hint ? `<div class="fhint">${o.hint}</div>` : ''}</div>`,
  area: (label, path, o = {}) => `<div class="field ${o.cls || ''}"><label>${esc(label)}</label><textarea class="input" rows="${o.rows || 2}" data-f="${path}" placeholder="${esc(o.ph || '')}">${esc(fv(path) ?? '')}</textarea></div>`,
  select: (label, path, options, o = {}) => `<div class="field ${o.cls || ''}"><label>${esc(label)}${o.req ? ' <span class="req">*</span>' : ''}</label><select class="input" data-f="${path}" ${o.r ? 'data-r' : ''} ${o.hook ? `data-hook="${o.hook}"` : ''} ${o.dis ? 'disabled' : ''}>${o.blank ? `<option value="">${esc(o.blank)}</option>` : ''}${opt(options, fv(path))}</select>${o.hint ? `<div class="fhint">${o.hint}</div>` : ''}</div>`,
  ro: (label, html, o = {}) => `<div class="field ${o.cls || ''}"><label>${esc(label)}</label><div class="ro">${html}</div></div>`,
};

/* ---------- page header ---------- */
function pageHead({ title, tags = '', right = '', back = true, crumb = '' }) {
  return `<div class="ph">${back ? `<button class="back" data-act="back" title="Back">${icon('back', 18, 2)}</button>` : ''}<h1>${esc(title)}</h1><div class="tags">${tags}</div><div class="right">${right}</div></div>${crumb ? `<div class="crumb">${crumb}</div>` : ''}`;
}
ACT.back = () => history.length > 1 ? history.back() : go('#/avail');
const tabsHtml = (tabs, cur, base) => `<div class="tabs">${tabs.map(([k, l, n]) => `<button class="tab ${cur === k ? 'active' : ''}" data-act="tab" data-base="${base}" data-k="${k}">${esc(l)}${n != null ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
ACT.tab = el => go(`${el.dataset.base}?tab=${el.dataset.k}`);

/* ---------- generic list (tabs, search, filters, pagination) ---------- */
const LISTS = {};
function listState(key, q, defaults) {
  const sig = JSON.stringify(q || {});
  if (!ui.lists[key] || ui.listSig[key] !== sig) { ui.lists[key] = { q: '', page: 1, ...defaults, ...(q || {}) }; ui.listSig[key] = sig; }
  return ui.lists[key];
}
const listRows = (key) => { const cfg = LISTS[key], st = ui.lists[key], tab = cfg.tabs && cfg.tabs.find(t => t[0] === st.tab); return cfg.rows().filter(r => (!tab || tab[2](r)) && cfg.match(r, st)); };
function listHtml(key, cfg) {
  LISTS[key] = cfg; const { tab: _pageTab, ...listQ } = ui.r.q; const st = listState(key, listQ, { tab: cfg.tabs ? cfg.tabs[0][0] : '', ...cfg.defaults });
  const tabs = cfg.tabs ? `<div class="tabs">${cfg.tabs.map(([k, l, fn]) => `<button class="tab ${st.tab === k ? 'active' : ''}" data-act="ltab" data-key="${key}" data-k="${k}">${esc(l)}</button>`).join('')}</div>` : '';
  const filt = (cfg.filters || []).map(f => `<select class="input sm" data-lf="${key}:${f.name}" title="${esc(f.label)}"><option value="">${esc(f.label)}: All</option>${opt(f.options(), st[f.name] ?? '')}</select>`).join('');
  const dates = cfg.dates ? `<input type="date" class="input sm" style="width:150px" data-lf="${key}:from" value="${esc(st.from || '')}" title="From date"><input type="date" class="input sm" style="width:150px" data-lf="${key}:to" value="${esc(st.to || '')}" title="To date">` : '';
  const active = st.q || (cfg.filters || []).some(f => st[f.name]) || st.from || st.to;
  const open = st.showFilter || active;
  const all = listRows(key);
  return `${tabs}<div class="toolbar"><button class="tool ${open ? 'on' : ''}" data-act="lfilter" data-key="${key}">${icon('filter', 16)}<b>Filter</b></button><div class="tool count" id="lc-${key}">${all.length} ${esc(cfg.noun || 'records')}</div><div class="tool">${icon('list', 16)}List View</div><button class="tool" data-act="lcsv" data-key="${key}">${icon('download', 16)}Download Csv</button><button class="tool" data-act="stub" data-name="Upload Csv">${icon('upload', 16)}Upload Csv</button><button class="tool" data-act="stub" data-name="Manage Table View">${icon('gear', 16)}Manage Table View</button><span class="spacer"></span>${cfg.right || ''}</div>
    ${open ? `<div class="filterbar"><div class="search">${icon('search', 15)}<input data-lq="${key}" placeholder="${esc(cfg.searchPh || 'Search…')}" value="${esc(st.q)}"></div>${filt}${dates}${active ? `<button class="btn btn-ghost btn-sm" data-act="lclear" data-key="${key}">Clear</button>` : ''}</div>` : ''}
    ${cfg.above ? `<div class="subbar">${cfg.above}</div>` : '<div style="height:14px"></div>'}<div id="lb-${key}">${listBody(key)}</div>`;
}
ACT.lfilter = el => { const st = ui.lists[el.dataset.key]; st.showFilter = !st.showFilter; if (!st.showFilter) { st.q = ''; (LISTS[el.dataset.key].filters || []).forEach(f => { st[f.name] = ''; }); st.from = st.to = ''; } render(); };
ACT.lclear = el => { const st = ui.lists[el.dataset.key]; st.q = ''; (LISTS[el.dataset.key].filters || []).forEach(f => { st[f.name] = ''; }); st.from = st.to = ''; st.page = 1; render(); };
ACT.lcsv = el => {
  const cfg = LISTS[el.dataset.key], t = document.createElement('table'); t.innerHTML = `<tbody>${listRows(el.dataset.key).map(cfg.row).join('')}</tbody>`;
  const q = v => `"${String(v).replace(/\s+/g, ' ').trim().replace(/"/g, '""')}"`, heads = cfg.cols.filter(c => c !== '').map(c => c.replace(/^>/, ''));
  const rows = [...t.rows].map(tr => [...tr.cells].slice(0, heads.length).map(c => q(c.textContent)).join(','));
  const url = URL.createObjectURL(new Blob([[heads.map(q).join(','), ...rows].join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = `${el.dataset.key}-${todayISO()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500);
  toast(`Downloaded ${rows.length} row(s)`);
};
ACT.ltab = el => { const st = ui.lists[el.dataset.key]; st.tab = el.dataset.k; st.page = 1; render(); };
function listBody(key) {
  const cfg = LISTS[key], st = ui.lists[key];
  const all = listRows(key);
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE)); if (st.page > pages) st.page = pages;
  const start = (st.page - 1) * PER_PAGE, rows = all.slice(start, start + PER_PAGE);
  const nums = Array.from({ length: pages }, (_, i) => i + 1);
  const lc = document.getElementById('lc-' + key); if (lc) lc.textContent = `${all.length} ${cfg.noun || 'records'}`;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cfg.cols.map(c => `<th class="${c.startsWith('>') ? 'right' : ''}">${esc(c.replace(/^>/, ''))}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(cfg.row).join('') : emptyRow(cfg.cols.length, cfg.empty || 'No records match the current filters.')}</tbody></table></div>
    <div class="pager"><div class="info">${all.length ? `Showing ${start + 1}–${start + rows.length} of ${all.length}` : 'No items'}</div><div class="pages"><button data-act="lpage" data-key="${key}" data-page="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}>${icon('chevLeft', 14, 2)}</button>${nums.map(n => `<button class="${n === st.page ? 'active' : ''}" data-act="lpage" data-key="${key}" data-page="${n}">${n}</button>`).join('')}<button data-act="lpage" data-key="${key}" data-page="${st.page + 1}" ${st.page >= pages ? 'disabled' : ''}>${icon('chevRight', 14, 2)}</button></div></div>`;
}
ACT.lpage = el => { ui.lists[el.dataset.key].page = +el.dataset.page; $('#lb-' + el.dataset.key).innerHTML = listBody(el.dataset.key); };
const matchText = (st, ...vals) => !st.q || vals.join(' ').toLowerCase().includes(st.q.toLowerCase());
const matchIn = (st, name, val) => !st[name] || String(st[name]).split(',').includes(String(val));
const matchDate = (st, iso) => (!st.from || iso >= st.from) && (!st.to || iso <= st.to);

/* ---------- sidebar ---------- */
const S = (label, icon) => ({ label, icon, stub: true });   // DICE menu entries that are outside this prototype
/* BILLING (commented out) — the Progressive & Milestone Billing menu of the original prototype:
   { label: 'Billing Overview', icon: 'grid', hash: '#/overview', key: 'overview' },
   { label: 'Approvals', icon: 'checkSq', hash: '#/approvals', key: 'approvals', badge: true },
   { label: 'Invoice Management', icon: 'receipt', hash: '#/invoices', key: 'invoices', also: ['invoice'] },
   { label: 'Procurement', icon: 'user', key: 'procurement', group: true, children: [...Purchase Order '#/pos', Receipts (GRN / SRN) '#/receipts'...] },
   { label: 'Account Payables', icon: 'wallet', hash: '#/ap', key: 'ap' },                                                                                  */
const NAV = [
  { sec: 'Invoice Discounting' },
  { label: 'Avail Financing', icon: 'dollar', hash: '#/avail', key: 'avail', badge: true },
  { label: 'Invoice Discounting', icon: 'receipt', hash: '#/id', key: 'id', also: ['id'] },
  { label: 'Integration Console', icon: 'sliders', hash: '#/integration', key: 'integration', also: ['integration'] },
  S('Card Expenses', 'receipt'), S('Accounting & GL', 'wallet'), S('Report & Audit', 'doc'),
  { sec: 'Travel & Expenses' }, S('Expenses', 'receipt'), S('Advances', 'dollar'),
  { sec: 'AP & Procurement' },
  S('Approvals', 'checkSq'), S('Vendor Management', 'user'), S('Product & Stock', 'dollar'), S('Stock & Transfer', 'dollar'),
  S('Invoice Management', 'receipt'), S('Proforma Invoice', 'doc'), S('Procurement', 'user'),
  S('Contract Management', 'doc'), S('Vendor Advance', 'dollar'), S('ASN', 'dollar'), S('Credit Note', 'wallet'), S('Debit Note', 'wallet'),
  { sec: 'Treasury & Finances' }, S('Expense Vouchers', 'wallet'), S('Account Payables', 'wallet'),
  S('Taxation Approval', 'wallet'), S('GSTHOLD Payments', 'wallet'),
  S('Travel Bookings', 'truck'), S('Booking Requisition', 'doc'), S('Employee Settlements', 'user'), S('Vendor Settlements', 'wallet'),
];
const approvalCount = () => db.programmes.filter(p => p.dstatus === PRG_STATUS.PENDING).length + db.requests.filter(r => r.status === FIN.EXCEPTION).length;
function renderSidebar() {
  const root = ui.r.parts[0] || 'avail';
  document.querySelector('.app').classList.toggle('sb-collapsed', !!ui.sbCollapsed);
  const supplierPick = db.meta.role === 'supplier' ? `<label style="margin-top:8px">Vendor</label><select data-vendor>${db.vendors.map(v => `<option value="${v.id}" ${db.meta.vendorId === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>` : '';
  $('#sidebar').innerHTML = `
    <button class="sb-toggle" data-act="sb-toggle" title="${ui.sbCollapsed ? 'Expand' : 'Collapse'} menu">${icon(ui.sbCollapsed ? 'chevRight' : 'chevLeft', 15, 2)}</button>
    <div class="brand"><div class="brand-logo">D</div><div class="bt"><div class="brand-name">dice</div><div class="brand-sub">Invoice Discounting prototype</div></div></div>
    ${NAV.map(n => {
      if (n.sec) return `<div class="nav-section">${n.sec}</div>`;
      if (n.stub) return `<div class="nav-item stub" data-act="stub" data-name="${esc(n.label)}">${icon(n.icon, 20, 1.5)}<span>${esc(n.label)}</span></div>`;
      const active = root === n.key || (n.also || []).includes(root), cnt = n.badge ? approvalCount() : 0;
      return `<div class="nav-item ${active ? 'active' : ''}" data-act="go" data-hash="${n.hash}">${icon(n.icon, 20, 1.5)}<span>${n.label}</span>${cnt ? `<span class="nbadge">${cnt}</span>` : ''}</div>`;
    }).join('')}
    <div class="demo-box"><label>Acting as</label><select data-role>${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${db.meta.role === k ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select>${supplierPick}
      <div class="nav-item" data-act="demo-open">${icon('reset', 17)}<span>Scenarios &amp; reset</span></div>
      <div class="demo-note">Prototype data is kept in this browser. PSBXchange, lender and payment behaviour is simulated.</div></div>`;
}
ACT['sb-toggle'] = () => { ui.sbCollapsed = !ui.sbCollapsed; renderSidebar(); };
ACT.stub = el => toast(`${el.dataset.name} is part of the wider DICE portal — not included in this invoice-discounting prototype`);
ACT.go = el => go(el.dataset.hash);
document.addEventListener('change', e => { const v = e.target.closest('[data-vendor]'); if (v) { db.meta.vendorId = v.value; save(); toast(`Acting as ${getVendor(v.value).name}`); render(); } });

/* ---------- demo / scenarios (SCENARIOS is defined in id-seed.js) ---------- */
ACT['demo-open'] = () => openModal({ title: 'Demo data & scenarios', cls: 'wide', hideFoot: true, html: `
  <p style="margin-bottom:14px">Choose a starting point. This replaces all data stored in this browser for the prototype.</p>
  ${SCENARIOS.map(([k, t, d]) => `<div class="scn"><div class="t">${t}</div><div class="d">${d}</div><button class="btn btn-primary btn-sm" data-act="demo-load" data-k="${k}">${icon('reset', 14)}${k === 'default' ? 'Reset demo data' : 'Load this scenario'}</button></div>`).join('')}`});
ACT['demo-load'] = el => { closeOverlays(); seedDb(el.dataset.k); save(); toast(el.dataset.k === 'default' ? 'Demo data reset to the seeded scenarios' : `Scenario ${el.dataset.k} loaded`); go('#/avail'); render(); };

/* when the current "Acting as" role cannot do the next step, say so and offer a one-click switch */
const rolesFor = perm => (PERM[perm] || []);
function roleBanner(perm, what) {
  if (can(perm)) return '';
  const r = rolesFor(perm)[0]; if (!r) return '';
  const names = rolesFor(perm).map(k => ROLES[k].name).join(' or ');
  return `<div class="alert warn" style="align-items:center"><div style="flex:1"><b>You are acting as ${esc(actor())}.</b> ${esc(what)} needs <b>${esc(names)}</b>.</div><button class="btn btn-outline btn-xs" data-act="role-switch" data-role="${r}">Switch to ${esc(ROLES[r].name)}</button></div>`;
}
ACT['role-switch'] = el => { db.meta.role = el.dataset.role; save(); toast(`Now acting as ${actor()}`); render(); };
