/* =====================================================================
   id-ui.js — shared widgets for the invoice-discounting screens
   ===================================================================== */
const rq = (key, ctx, path) => isReqKey(key, ctx || { leadtyp: 'PGL', productcode: (ui.f && ui.f.productcode) || 'SID' }, path);
/* form field bound to ui.f with inline error (ui.errs) and the PSB field name beside the label */
const fx = (label, path, o = {}) => {
  const err = ui.errs && ui.errs[o.errPath || path], v = fv(path);
  const inner = o.opts ? `<select class="input" data-f="${path}" ${o.r ? 'data-r' : ''} ${o.dis ? 'disabled' : ''}>${o.blank != null ? `<option value="">${esc(o.blank)}</option>` : ''}${o.optsHtml || opt(o.opts, v)}</select>`
    : o.area ? `<textarea class="input" rows="2" style="height:auto;padding:10px 12px" data-f="${path}" placeholder="${esc(o.ph || '')}">${esc(v ?? '')}</textarea>`
    : `<input class="input ${o.num ? 'num' : ''}" ${o.type ? `type="${o.type}"` : ''} ${o.step ? `step="${o.step}"` : ''} ${o.min != null ? `min="${o.min}"` : ''} data-f="${path}" ${o.num ? 'data-t="num"' : ''} ${o.hook ? `data-hook="${o.hook}"` : ''} ${o.r ? 'data-r' : ''} value="${esc(v ?? '')}" placeholder="${esc(o.ph || '')}" ${o.dis ? 'disabled' : ''} ${o.max ? `maxlength="${o.max}"` : ''}>`;
  return `<div class="field ${err ? 'has-err' : ''} ${o.cls || ''}"><label>${esc(label)}${o.req ? ' <span class="req">*</span>' : ''}${o.api ? `<span class="tag-api">${o.api}</span>` : ''}${o.dice ? '<span class="tag-dice">DICE only</span>' : ''}</label>${inner}${err ? `<div class="ferr">${esc(err)}</div>` : ''}${o.hint ? `<div class="fhint">${o.hint}</div>` : ''}</div>`;
};
HOOKS.upper = (el, v) => { el.value = String(v).toUpperCase(); setPath(ui.f, el.dataset.f, el.value); };
const fmtLakh = l => { l = Number(l); return l >= 100 ? `₹${fmtNum(l / 100)} Cr` : `₹${fmtNum(l)} L`; };
const rupeeShort = r => r >= 1e7 ? `₹${fmtNum(r / 1e7)} Cr` : r >= 1e5 ? `₹${fmtNum(r / 1e5)} L` : money(r).replace('INR ', '₹');
const inr = n => '₹' + fmtNum(n);
const copyText = t => { try { navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { toast('Copy is not available in this browser', 'err'); } };
ACT.copy = el => copyText(el.dataset.t);

/* JSON viewer with light syntax colouring */
function jsonHtml(o) {
  if (o == null) return '<pre class="json" style="color:#9A9AA7">— no body (request timed out or nothing was sent) —</pre>';
  const s = JSON.stringify(o, null, 2).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<pre class="json">${s.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, m => /^"/.test(m) ? (/:$/.test(m) ? `<span class="k">${m}</span>` : `<span class="s">${m}</span>`) : /true|false|null/.test(m) ? `<span class="b">${m}</span>` : `<span class="n">${m}</span>`)}</pre>`;
}
const jsonBlock = (title, o, id) => `<details class="acc2" ${id ? 'open' : ''}><summary>${esc(title)}<span style="margin-left:auto"><button class="btn btn-ghost btn-xs" data-act="copy" data-t="${esc(JSON.stringify(o, null, 2))}">Copy</button></span></summary><div class="acc-body">${jsonHtml(o)}</div></details>`;

const pcBadge = s => `<span class="pc-badge pc-${s}">${icon(s === 'OPEN' ? 'check' : 'lock', 12, 2.2)}${({ OPEN: 'Payment open', FINANCING_HOLD: 'Payment on hold', LOCKED: 'Payment locked', CLOSED: 'Closed' })[s] || s}</span>`;
const provBanner = txt => `<div class="banner-prov">${icon('alert', 16)}<div><b>Provisional contract.</b> ${txt || TXN_PROVISIONAL + '. The request below is built only from the fields the PRD lists; nothing else is invented.'}</div></div>`;

/* eligibility checklist */
function checksHtml(checks) {
  return `<div class="checks">${checks.map(c => `<div class="check ${c.status}"><div class="ci">${icon(c.status === 'pass' ? 'check' : c.status === 'warn' ? 'alert' : 'x', 13, 2.6)}</div><div class="cl">${esc(c.label)}</div><div class="cd">${c.status === 'pass' ? '<span style="color:var(--success)">Passed</span>' : `${esc(c.reason)}${c.code ? ` <span class="mono" style="color:var(--muted)">[${c.code}]</span>` : ''}${c.status === 'warn' ? ' <b>(needs review)</b>' : ''}`}</div></div>`).join('')}</div>`;
}
const timelineHtml = (items, empty = 'No activity yet') => items.length ? `<ul class="tl">${items.map(a => `<li class="${a.kind || ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.by || '')}${a.by ? ' · ' : ''}${fmtDT(a.at)}</div></li>`).join('')}</ul>` : `<div class="hint">${empty}</div>`;
const histItems = h => (h || []).slice().reverse().map(x => ({ ...x, kind: /Exception|rejected|failed|Not funded|Paused|unknown|UNKNOWN/i.test(x.text) ? 'bad' : /accepted|Funded|funding confirmed|Settled|approved|Lead accepted|Active/i.test(x.text) ? 'ok' : '' }));
const sbLabel = (s, text) => `<span class="badge-s s-${COLOR[s] || 'gray'}">${esc(text || s)}</span>`;
const dlBase64 = (b64, name) => { try { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); const url = URL.createObjectURL(new Blob([a], { type: 'application/pdf' })), l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 500); } catch (e) { toast('Could not decode the document', 'err'); } };
ACT['dl-mou'] = el => { const prg = getPrg(el.dataset.prg), row = prg && lenderRow(prg, el.dataset.lender); if (row && row.program && row.program.mou) dlBase64(row.program.mou, `MOU-${row.psbProgramId}.pdf`); };

/* Sandbox controls shared by the programme page and the Integration console (progress PSBXchange's side of a lead) */
ui.sim = ui.sim || { drop: false, duplicate: false, badSig: false };
function simOptsHtml() { return `<div style="margin-top:6px"><label class="chk"><input type="checkbox" data-act="sim-opt" data-k="drop" ${ui.sim.drop ? 'checked' : ''}> Drop the callback (test a missed callback)</label><label class="chk"><input type="checkbox" data-act="sim-opt" data-k="duplicate" ${ui.sim.duplicate ? 'checked' : ''}> Deliver it twice</label><label class="chk"><input type="checkbox" data-act="sim-opt" data-k="badSig" ${ui.sim.badSig ? 'checked' : ''}> Bad signature</label></div>`; }
ACT['sim-opt'] = el => { ui.sim[el.dataset.k] = el.checked; };
const simOpts = () => ({ drop: ui.sim.drop, duplicate: ui.sim.duplicate, badSignature: ui.sim.badSig });
function psbControlsHtml(prg) {
  if (!prg.psb.psbPlatformId) return '';
  const lead = db.psb.leads[prg.psb.psbPlatformId]; if (!lead) return '';
  return `<div class="sim-card"><div class="st">Sandbox · PSBXchange side of this lead</div><div class="small-note">After the lead is created everything happens on the PSB Platform (matching, offers, customer decisions, activation) — none of it has an API for the sourcing partner except status. Use these buttons to play PSBXchange and watch DICE react.</div>
    ${Object.entries(lead.lenders).map(([lid, ls]) => `<div style="margin-top:12px"><b>${esc(lenderName(lid))}</b> <span class="small-note">PSB says: ${esc(ls.stage)} · ${esc(ls.status)}</span><div class="btns">${nextPsbStatuses(ls.status).length ? nextPsbStatuses(ls.status).map(t => gbtn('ops.sim', 'psb-adv', `→ ${t}`, { cls: 'btn-outline btn-xs', data: { psb: lead.id, lender: lid, to: t } })).join('') : '<span class="small-note">No further PSB transitions</span>'}</div></div>`).join('')}
    ${simOptsHtml()}</div>`;
}
ACT['psb-adv'] = el => { const r = psbAdvance(el.dataset.psb, el.dataset.lender, el.dataset.to, simOpts()); save(); if (r.ok) toast(`${r.msg} · callback ${r.delivery}`, r.delivery === 'rejected' ? 'err' : undefined); else toast(r.msg, 'err'); render(); };

/* paginated list helper for already-built row arrays is the repo's listHtml(); this wraps its common options */
const lcols = (...c) => c;
