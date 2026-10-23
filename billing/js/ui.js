/* =====================================================================
   ui.js — router, shell, overlays, shared widgets
   ===================================================================== */
const ui = { r: { parts: [], q: {} }, f: null, fKey: '', lists: {}, listSig: {}, derive: null, after: null, lastPath: '' };
const ACT = {};          // data-act handlers
const ROUTES = {};       // first path segment -> render(route) => html
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
  const r = parseHash(); const prev = ui.r;
  ui.r = r;
  const samePage = ui.lastPath === r.path;
  if (!samePage) { ui.f = null; ui.fKey = ''; closeOverlays(); }
  ui.lastPath = r.path; ui.derive = null; ui.after = null;
  const y = window.scrollY;
  const fn = ROUTES[r.parts[0] || 'dashboard'] || ROUTES.dashboard;
  let html;
  try { html = fn(r); } catch (e) { console.error(e); html = `<div class="content"><div class="alert err" style="margin-top:20px"><div><div class="at">Screen error</div>${esc(e.message)}</div></div></div>`; }
  $('#main').innerHTML = html;
  renderSidebar();
  if (ui.after) ui.after();
  if (ui.derive) ui.derive();
  window.scrollTo(0, samePage ? y : 0);
}

/* ---------- form binding ---------- */
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
const HOOKS = {};
document.addEventListener('input', e => {
  handleField(e, false);
  const lq = e.target.closest('[data-lq]');
  if (lq) { const st = ui.lists[lq.dataset.lq]; st.q = lq.value; st.page = 1; $('#lb-' + lq.dataset.lq).innerHTML = listBody(lq.dataset.lq); }
});
document.addEventListener('change', e => {
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
  if (el && !el.disabled) { const fn = ACT[el.dataset.act]; if (fn) { if (el.tagName !== 'INPUT') e.preventDefault(); fn(el, e); } else console.warn('No ACT', el.dataset.act); }
  else if (!e.target.closest('.menu')) closeMenu();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeOverlays(); closeMenu(); } });

/* ---------- result handling ---------- */
function done(r, after) {
  if (r.ok) { toast(r.msg); if (after) after(r); render(); return true; }
  const errs = r.errors || [r.msg];
  if (errs.length > 1 || String(errs[0]).length > 90) errorModal(errs.length > 1 && r.msg && r.msg !== errs[0] ? r.msg : 'Action blocked', errs); else toast(errs[0], 'err');
  return false;
}

/* ---------- overlays ---------- */
function toast(msg, kind) {
  const t = document.createElement('div'); t.className = 'toast' + (kind === 'err' ? ' err' : '');
  t.innerHTML = icon(kind === 'err' ? 'alert' : 'check', 14, 2.2) + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 5200 : 2800);
}
function closeOverlays() { document.querySelectorAll('.overlay,.drawer,.drawer-ov').forEach(n => n.remove()); }
function openModal({ title, html = '', submitLabel = 'Save', onSubmit, cls = '', danger = false, hideFoot = false, cancelLabel = 'Cancel' }) {
  closeMenu();
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<form class="modal ${cls}" novalidate>
    <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="kebab x" data-close>${icon('x', 14)}</button></div>
    <div class="modal-body">${html}</div>
    ${hideFoot ? '' : `<div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>${cancelLabel}</button>${onSubmit ? `<button type="submit" class="btn ${danger ? 'btn-danger-soft' : 'btn-primary'}">${esc(submitLabel)}</button>` : ''}</div>`}
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
const fld = (label, name, { type = 'text', value = '', ph = '', opts, rows, step, hint, req } = {}) => `<div class="field"><label>${esc(label)}${req ? ' *' : ''}</label>${
  opts ? `<select class="input white" name="${name}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`
  : rows ? `<textarea class="input white" name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(value)}</textarea>`
  : `<input class="input white" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" ${step ? `step="${step}"` : ''}>`}${hint ? `<div class="fhint">${hint}</div>` : ''}</div>`;
function reasonModal({ title, label, btn = 'Confirm', danger = true, ph = '', onSubmit, extra = '', optional = false }) {
  openModal({ title, submitLabel: btn, danger, html: `${extra}${fld(label, 'reason', { rows: 3, ph, req: !optional })}`, onSubmit: v => { if (!optional && !String(v.reason || '').trim()) { toast(`${label} is required`, 'err'); return false; } return onSubmit(v.reason.trim()); } });
}
function confirmBox({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  openModal({ title, submitLabel: confirmLabel, danger, html: `<p style="margin:0;line-height:1.55;font-size:12px;color:#44444C">${message}</p>`, onSubmit: () => { onConfirm(); } });
}
function errorModal(title, errors) {
  openModal({ title, hideFoot: false, submitLabel: '', cancelLabel: 'Close', html: `<div class="alert err" style="margin-top:0"><div><ul style="margin:0;padding-left:16px">${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div></div>` });
  document.querySelector('.overlay .modal-foot .btn-primary')?.remove();
}
function openDrawer(title, html, wide) {
  closeOverlays();
  const ov = document.createElement('div'); ov.className = 'drawer-ov';
  const d = document.createElement('aside'); d.className = 'drawer' + (wide ? ' wide' : '');
  d.innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><button class="kebab x" data-close>${icon('x', 14)}</button></div><div class="modal-body">${html}</div>`;
  document.body.append(ov, d);
  ov.onclick = closeOverlays; d.querySelector('[data-close]').onclick = closeOverlays;
}
let menuEl = null, menuBtn = null;
function closeMenu() { menuEl?.remove(); menuEl = null; menuBtn = null; }
function openMenu(btn, items) {
  if (menuBtn === btn) return closeMenu(); closeMenu(); menuBtn = btn;
  menuEl = document.createElement('div'); menuEl.className = 'menu menu-wide';
  menuEl.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon, 12) : ''}${esc(it.label)}</button>`).join('');
  document.body.appendChild(menuEl);
  const r = btn.getBoundingClientRect(), w = menuEl.offsetWidth, h = menuEl.offsetHeight;
  let top = r.bottom + 4, left = r.right - w; if (top + h > innerHeight - 8) top = r.top - h - 4; if (left < 8) left = 8;
  menuEl.style.top = top + 'px'; menuEl.style.left = left + 'px';
  menuEl.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { const it = items[+b.dataset.i]; closeMenu(); it.run(); } });
}

/* ---------- small renderers ---------- */
const COLOR = {
  Approved: 'green', Accepted: 'green', Paid: 'green', Certified: 'green', Eligible: 'green', Matched: 'green', Passed: 'green', Final: 'green', Active: 'green',
  Posted: 'blue', Submitted: 'blue', 'Submitted for Acceptance': 'blue', 'Pending Matching': 'blue', 'Partially Passed': 'amber',
  'Pending Approval': 'amber', 'Pending Inspection': 'amber', 'Pending Acceptance': 'amber', 'Partially Accepted': 'amber', 'More Info Requested': 'amber', 'Partially Matched': 'amber', 'Partially Invoiced': 'amber', Pending: 'amber', 'Awaiting payment': 'amber', Amendment: 'amber',
  Draft: 'gray', Cancelled: 'gray', Closed: 'gray', 'Not Eligible': 'gray', 'Not started': 'gray', 'Not posted to AP': 'gray', 'n/a': 'gray', Released: 'gray',
  Rejected: 'red', 'Matching Failed': 'red', Blocked: 'red', Failed: 'red', Reversed: 'red', Invoiced: 'purple', Reserved: 'amber', Committed: 'green',
};
const sb = s => `<span class="badge-s s-${COLOR[s] || 'gray'}">${esc(s)}</span>`;
const mb = m => `<span class="m-badge m-${String(m).toLowerCase()}">${esc(m)}</span>`;
const poMethodBadge = po => mb(po.billingMethod) + (poCertified(po) ? ' <span class="badge-s s-gray" style="margin-left:2px">Certified</span>' : '');
const link = (hash, label, cls = 'link') => `<a class="${cls}" href="${hash}" style="text-decoration:none">${esc(label)}</a>`;
const poLink = po => link(`#/po/${po.id}`, po.number);
const invLink = i => link(`#/invoice/${i.id}`, invRef(i));
const actBtn = (act, label, { cls = 'btn-outline btn-sm', data = {}, icn, dis, title } = {}) => `<button class="btn ${cls}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} ${dis ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${icn ? icon(icn, 12) : ''}${esc(label)}</button>`;
const gbtn = (perm, act, label, o = {}) => can(perm) ? actBtn(act, label, o) : actBtn(act, label, { ...o, dis: true, title: whyNot(perm) });
const emptyRow = (cols, msg) => `<tr><td colspan="${cols}" class="empty">${esc(msg)}</td></tr>`;
const alertBox = (kind, title, body) => `<div class="alert ${kind}">${icon(kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'alert', 15)}<div>${title ? `<div class="at">${esc(title)}</div>` : ''}${body}</div></div>`;
const errList = errs => `<ul>${errs.map(e => `<li>${esc(typeof e === 'string' ? e : e.msg)}</li>`).join('')}</ul>`;
const kv = (k, v) => `<div><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
const strip = items => `<div class="strip">${items.map(([k, v, s, cls]) => `<div class="${cls || ''}"><div class="k">${esc(k)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}</div>`;
const attachChips = (arr, path) => (arr || []).map((f, i) => `<span class="attach">${icon('clip', 11)}${esc(f)}${path ? `<button type="button" data-act="rm-attach" data-path="${path}" data-i="${i}" title="Remove">${icon('x', 10, 2.4)}</button>` : ''}</span>`).join('');
const attachBox = (path, arr, label = 'Attach files') => `<div>${attachChips(arr, path)}<button type="button" class="btn btn-outline btn-sm" data-act="pick-file">${icon('plus', 11)}${label}</button><input type="file" multiple hidden data-attach="${path}"> <button type="button" class="btn btn-ghost btn-sm" data-act="add-sample" data-path="${path}">Add sample file</button></div>`;
ACT['pick-file'] = el => el.nextElementSibling.click();
ACT['rm-attach'] = el => { const arr = getPath(ui.f, el.dataset.path); arr.splice(+el.dataset.i, 1); render(); };
ACT['add-sample'] = el => { const arr = getPath(ui.f, el.dataset.path) || []; arr.push(`sample-document-${arr.length + 1}.pdf`); setPath(ui.f, el.dataset.path, arr); render(); };
const opt = (items, sel) => items.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const supOpts = () => db.suppliers.map(s => [s.id, `${s.name} (${s.code})`]);

function pageHead({ title, crumbs = [], right = '', sub = '' }) {
  return `<div class="page-head">
    <button class="back-btn" data-act="back" title="Back">${icon('back', 13, 2)}</button>
    <div class="head-title"><h1 class="page-title">${esc(title)} ${sub}</h1>
      <div class="crumbs"><a href="#/dashboard">DICE</a>${crumbs.map(([l, h]) => `/${h ? `<a href="${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`}`).join('')}</div></div>
    <div class="head-right">${right}</div></div>`;
}
ACT.back = () => history.length > 1 ? history.back() : go('#/dashboard');
const tabsHtml = (tabs, cur, base) => `<div class="tabs scroll">${tabs.map(([k, l, n]) => `<button class="tab ${cur === k ? 'active' : ''}" data-act="tab" data-base="${base}" data-k="${k}">${esc(l)}${n != null ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div>`;
ACT.tab = el => go(`${el.dataset.base}?tab=${el.dataset.k}`);

/* ---------- generic list (filters, search, pagination) ---------- */
const LISTS = {};
function listState(key, q, defaults) {
  const sig = JSON.stringify(q || {});
  if (!ui.lists[key] || ui.listSig[key] !== sig) { ui.lists[key] = { q: '', page: 1, ...defaults, ...(q || {}) }; ui.listSig[key] = sig; }
  return ui.lists[key];
}
function listHtml(key, cfg) {
  LISTS[key] = cfg; const st = listState(key, ui.r.q, cfg.defaults);
  const filt = (cfg.filters || []).map(f => {
    const val = st[f.name] ?? '';
    const o = f.options(); if (val && !o.some(x => String(Array.isArray(x) ? x[0] : x) === String(val))) o.push([val, val.replace(/,/g, ', ')]);
    return `<select class="input" data-lf="${key}:${f.name}" title="${esc(f.label)}"><option value="">${esc(f.label)}: All</option>${opt(o, val)}</select>`;
  }).join('');
  const dates = cfg.dates ? `<input class="input" type="date" data-lf="${key}:from" value="${esc(st.from || '')}" title="From date"><input class="input" type="date" data-lf="${key}:to" value="${esc(st.to || '')}" title="To date">` : '';
  const chips = (cfg.filters || []).filter(f => st[f.name]).map(f => `<span class="fchip">${esc(f.label)}: ${esc(String(st[f.name]).replace(/,/g, ', '))}<button data-act="lclear" data-key="${key}" data-name="${f.name}">${icon('x', 10, 2.4)}</button></span>`).join('');
  return `<div class="filters"><div class="search">${icon('search', 12)}<input class="input" data-lq="${key}" placeholder="${esc(cfg.searchPh || 'Search…')}" value="${esc(st.q)}"></div>${filt}${dates}${chips}<span class="spacer"></span>${cfg.right || ''}</div>
    ${cfg.pills ? cfg.pills(st) : ''}<div id="lb-${key}">${listBody(key)}</div>`;
}
function listBody(key) {
  const cfg = LISTS[key], st = ui.lists[key];
  const all = cfg.rows().filter(r => cfg.match(r, st));
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE)); if (st.page > pages) st.page = pages;
  const start = (st.page - 1) * PER_PAGE, rows = all.slice(start, start + PER_PAGE);
  const nums = Array.from({ length: pages }, (_, i) => i + 1);
  return `<div class="tbl-wrap"><table class="grid compact"><thead><tr>${cfg.cols.map(c => `<th class="${c.startsWith('>') ? 'right' : ''}">${esc(c.replace(/^>/, ''))}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(cfg.row).join('') : emptyRow(cfg.cols.length, cfg.empty || 'No records match the current filters.')}</tbody></table></div>
    <div class="pager"><div class="pages"><button data-act="lpage" data-key="${key}" data-page="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}>${icon('chevLeft', 11, 2)}</button>${nums.map(n => `<button class="${n === st.page ? 'active' : ''}" data-act="lpage" data-key="${key}" data-page="${n}">${n}</button>`).join('')}<button data-act="lpage" data-key="${key}" data-page="${st.page + 1}" ${st.page >= pages ? 'disabled' : ''}>${icon('chevRight', 11, 2)}</button></div>
    <div class="info">${all.length ? `Showing ${start + 1}–${start + rows.length} of ${all.length}` : 'No items'}</div></div>`;
}
ACT.lpage = el => { ui.lists[el.dataset.key].page = +el.dataset.page; $('#lb-' + el.dataset.key).innerHTML = listBody(el.dataset.key); };
ACT.lclear = el => { ui.lists[el.dataset.key][el.dataset.name] = ''; ui.lists[el.dataset.key].page = 1; render(); };
const matchText = (st, ...vals) => !st.q || vals.join(' ').toLowerCase().includes(st.q.toLowerCase());
const matchIn = (st, name, val) => !st[name] || String(st[name]).split(',').includes(String(val));
const matchDate = (st, iso) => (!st.from || iso >= st.from) && (!st.to || iso <= st.to);

/* ---------- sidebar ---------- */
const NAV = [
  { label: 'Dashboard', icon: 'gauge', hash: '#/dashboard', key: 'dashboard' },
  { label: 'Purchase Orders', icon: 'doc', hash: '#/pos', key: 'pos', also: ['po'] },
  { label: 'Goods Receipts (GRN)', icon: 'box', hash: '#/grns', key: 'grns', also: ['grn'] },
  { label: 'Service Receipts (SRN)', icon: 'truck', hash: '#/srns', key: 'srns', also: ['srn'] },
  { label: 'Supplier Invoices', icon: 'receipt', hash: '#/invoices', key: 'invoices', also: ['invoice'] },
  { label: 'Invoice Matching', icon: 'checkSq', hash: '#/matching', key: 'matching' },
  { label: 'Approvals', icon: 'flag', hash: '#/approvals', key: 'approvals', badge: true },
  { label: 'Accounts Payable', icon: 'wallet', hash: '#/ap', key: 'ap' },
  { label: 'Billing Schedules', icon: 'layers', key: 'schedules', group: true, also: ['milestones', 'milestone', 'claims', 'claim'], children: [['Overview', '#/schedules', 'schedules'], ['Milestones', '#/milestones', 'milestones'], ['Progress Claims', '#/claims', 'claims']] },
];
const approvalCount = () => db.invoices.filter(i => i.status === 'Pending Approval').length + db.pos.filter(p => p.status === 'Pending Approval').length
  + db.grns.filter(g => ['Submitted', 'Pending Inspection'].includes(g.status)).length + db.srns.filter(s => s.status === 'Pending Acceptance').length
  + db.milestones.filter(m => m.status === 'Submitted for Acceptance').length + db.claims.filter(c => c.status === 'Submitted').length;
function renderSidebar() {
  const root = ui.r.parts[0] || 'dashboard';
  $('#sidebar').innerHTML = `
    <div class="brand"><div class="brand-logo">D</div><div class="brand-name">DICE Manufacturing LLC</div><div class="brand-mail">Procure-to-Pay · Billing prototype</div></div>
    <div class="role-box"><label>Acting as</label><select data-role>${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${db.meta.role === k ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
    <div class="nav-section">Billing &amp; Procurement</div>
    ${NAV.map(n => {
      const active = root === n.key || (n.also || []).includes(root);
      if (n.group) return `<div class="nav-group ${active ? 'open active' : ''}"><div class="nav-item" data-act="go" data-hash="#/schedules">${icon(n.icon)}<span>${n.label}</span><span class="chev">${icon(active ? 'chevUp' : 'chevDown', 11, 2)}</span></div>
        ${active ? `<div class="nav-sub">${n.children.map(([l, h, k]) => `<div class="nav-item ${root === k || (k === 'milestones' && root === 'milestone') || (k === 'claims' && root === 'claim') ? 'active' : ''}" data-act="go" data-hash="${h}">${l}</div>`).join('')}</div>` : ''}</div>`;
      const cnt = n.badge ? approvalCount() : 0;
      return `<div class="nav-item ${active ? 'active' : ''}" data-act="go" data-hash="${n.hash}">${icon(n.icon)}<span>${n.label}</span>${cnt ? `<span class="nbadge">${cnt}</span>` : ''}</div>`;
    }).join('')}
    <div class="nav-section">Demo</div>
    <div class="nav-item" data-act="demo-open">${icon('play')}<span>Scenarios &amp; reset</span></div>
    <div class="demo-note">Prototype data is stored in this browser. Posting, payment and notifications are simulated — no ERP, bank or e-mail is contacted.</div>`;
}
ACT.go = el => go(el.dataset.hash);

/* ---------- demo / scenarios ---------- */
const SCENARIOS = [
  ['default', 'Seeded demo (recommended start)', 'PO-2026-1042 is Approved with Progressive billing and GRN-001/002/003 already accepted (77 of 100 units eligible). PO-2026-1043 carries the approved M1/M2/M3 milestone schedule, PO-2026-1044 is the Standard-billing regression PO, PO-2026-1051/1052 are the service (SRN) POs and PO-2026-1060 uses certified work progress.'],
  ['A', 'Scenario A — start from a draft PO-2026-1042', 'PO-2026-1042 is a Draft with no receipts. Set Billing Method to Progressive, approve it, create GRN-001/002/003, then invoice 30 units of GRN-001 and 20 units of GRN-002, and try to re-invoice GRN-001.'],
  ['B', 'Scenario B — milestone billing from a draft PO-2026-1042', 'PO-2026-1042 is a Draft using Milestone billing with M1 20% / M2 50% / M3 30% pre-populated. Finalize and approve the schedule, submit &amp; approve M1, invoice AED 20,000 and attempt a second invoice against M1.'],
];
ACT['demo-open'] = () => openModal({ title: 'Demo data & scenarios', cls: 'wide', hideFoot: true, html: `
  <p class="hint" style="margin-top:0">Choose a starting point. This replaces all data stored in this browser for the prototype.</p>
  ${SCENARIOS.map(([k, t, d]) => `<div class="scn"><div class="t">${t}</div><div class="d">${d}</div><button class="btn btn-primary btn-sm" data-act="demo-load" data-k="${k}">${icon('reset', 12)}${k === 'default' ? 'Reset Demo Data' : 'Load this scenario'}</button></div>`).join('')}
  <div class="scn"><div class="t">Scenario C & D</div><div class="d">C — use PO-2026-1044 (Standard): invoice the accepted GRN-001 (AED 24,000). D — PO-2026-1051 (service progressive, SRN-001 accepted AED 25,000) and PO-2026-1052 (milestone service PO: M1 approved but its SRN is still pending → invoice blocked until the SRN is accepted). Both are included in the seeded demo.</div></div>`});
ACT['demo-load'] = el => { closeOverlays(); seedDb(el.dataset.k); toast(el.dataset.k === 'default' ? 'Demo data reset to the seeded scenarios' : `Scenario ${el.dataset.k} loaded`); go('#/pos'); render(); };
