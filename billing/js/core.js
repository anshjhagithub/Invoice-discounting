/* =====================================================================
   core.js — helpers, icons, persistence, audit, roles
   ===================================================================== */
const STORE_KEY = 'dice.billing.proto.v1';
const VAT_RATE_DEFAULT = 5;

/* ---------- numbers / dates / text ---------- */
const r2 = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const EPS = 0.004;
const sum = (arr, f) => r2(arr.reduce((s, x) => s + (Number(f(x)) || 0), 0));
const fmtNum = (n, d) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d ?? (Number.isInteger(+n) ? 0 : 2), maximumFractionDigits: 2 });
const money = n => `AED ${fmtNum(n)}`;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const pad = (n, w = 3) => String(n).padStart(w, '0');
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => isoDay(new Date());
const daysFromNow = n => isoDay(new Date(Date.now() + n * 864e5));
const nowISO = () => new Date().toISOString();
const fmtD = iso => { if (!iso) return '—'; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`; };
const fmtDT = iso => { if (!iso) return '—'; const d = new Date(iso); return `${fmtD(isoDay(d))}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0;

/* ---------- icons (stroke set, same approach as the Buyer portal) ---------- */
const P = {
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', plus:'<path d="M12 5v14M5 12h14"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>',
  check:'<path d="m5 12 5 5L20 7"/>', back:'<path d="M19 12H5m6-6-6 6 6 6"/>', chevDown:'<path d="m6 9 6 6 6-6"/>', chevUp:'<path d="m18 15-6-6-6 6"/>',
  chevLeft:'<path d="m15 18-6-6 6-6"/>', chevRight:'<path d="m9 18 6-6-6-6"/>', open:'<path d="M7 17 17 7M9 7h8v8"/>', dots:'<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  gauge:'<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>', doc:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>', truck:'<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  wallet:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h2M3 10h18"/>', checkSq:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  alert:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  up:'<path d="m12 19V5m-6 6 6-6 6 6"/>', down:'<path d="M12 5v14m-6-6 6 6 6-6"/>', trash:'<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
  reset:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', clip:'<path d="m21 11-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
  edit:'<path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 8 16l1.2-4z"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', store:'<path d="M4 7h16l-1 4H5zM5 11v9h14v-9M9 20v-5h6v5"/>', eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  user:'<circle cx="12" cy="7" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>', play:'<path d="m7 4 13 8-13 8z"/>', download:'<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>', filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', receipt:'<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
};
const icon = (n, s = 13, sw = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

/* ---------- roles & permissions (soft gating for the demo) ---------- */
const ROLES = {
  admin:    { name: 'Demo Admin',                     label: 'Demo Admin (all roles)' },
  buyer:    { name: 'Procurement Manager',            label: 'Buyer — Procurement Manager' },
  receiver: { name: 'Warehouse / Service Receiver',   label: 'Buyer — Receiver' },
  ap:       { name: 'AP Manager',                     label: 'Buyer — AP Manager' },
  supplier: { name: 'Supplier User (Gulf Industrial)', label: 'Supplier — Portal' },
};
const PERM = {
  'po.edit': ['buyer'], 'po.approve': ['buyer'], 'po.amend': ['buyer'],
  'grn.create': ['receiver'], 'grn.decide': ['receiver'], 'srn.create': ['receiver'], 'srn.decide': ['receiver'],
  'ms.submit': ['supplier'], 'ms.decide': ['buyer', 'receiver'], 'claim.create': ['supplier'], 'claim.decide': ['buyer'],
  'inv.create': ['supplier', 'ap'], 'inv.match': ['ap', 'supplier'], 'inv.approve': ['ap'], 'inv.post': ['ap'], 'inv.adjust': ['ap'], 'inv.cancel': ['ap', 'supplier'],
};
const can = k => !db || db.meta.role === 'admin' || (PERM[k] || []).includes(db.meta.role);
const whyNot = k => `Requires role: ${(PERM[k] || []).map(r => ROLES[r].name).join(' / ')} (switch role in the sidebar)`;
const actor = () => ROLES[db.meta.role].name;

/* ---------- persistence ---------- */
let db = null;
const hasLS = () => { try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; } };
let memStore = null;
function save() {
  try { const s = JSON.stringify(db); if (hasLS()) localStorage.setItem(STORE_KEY, s); else memStore = s; } catch (e) { memStore = JSON.stringify(db); }
}
function loadStored() {
  try { const s = hasLS() ? localStorage.getItem(STORE_KEY) : memStore; return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
const uid = p => `${p}${++db.seq.id}`;
function audit(poId, ref, text, kind = 'info') {
  db.audit.unshift({ id: uid('au'), at: nowISO(), by: actor(), poId, ref, text, kind });
}
