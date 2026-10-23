/* =====================================================================
   screens-dash.js — dashboard (all numbers derived from the records)
   ===================================================================== */
const SUBMITTED_SET = ['Submitted', 'Pending Matching', 'Matching Failed', 'Pending Approval', 'Approved', 'Posted', 'Paid'];
function dashMetrics(f) {
  const pos = db.pos.filter(p => (!f.method || p.billingMethod === f.method) && (!f.supplier || p.supplierId === f.supplier) && (!f.poStatus || p.status === f.poStatus));
  const ids = new Set(pos.map(p => p.id));
  const invs = db.invoices.filter(i => ids.has(i.poId) && (!f.invStatus || i.status === f.invStatus) && (!f.from || i.date >= f.from) && (!f.to || i.date <= f.to));
  const appr = pos.filter(p => p.status === 'Approved');
  const sums = appr.map(p => ({ p, s: poSummary(p) }));
  return {
    pos, invs, appr,
    poValue: sum(appr, poNet), accepted: sum(sums, x => x.s.accepted), remaining: sum(sums, x => x.s.remaining),
    submitted: sum(invs.filter(i => SUBMITTED_SET.includes(i.status)), i => i.net), approved: sum(invs.filter(i => APPROVED.includes(i.status)), i => i.net), paid: sum(invs.filter(i => i.status === 'Paid'), i => i.net),
    pendRcpt: db.grns.filter(g => ids.has(g.poId) && ['Submitted', 'Pending Inspection'].includes(g.status)).length + db.srns.filter(s => ids.has(s.poId) && s.status === 'Pending Acceptance').length,
    pendMs: db.milestones.filter(m => ids.has(m.poId) && m.status === 'Submitted for Acceptance').length,
    blocked: invs.filter(i => i.status === 'Matching Failed').length, pendInv: invs.filter(i => i.status === 'Pending Approval').length,
  };
}
ROUTES.dashboard = r => {
  const st = listState('dash', {}, { method: '', supplier: '', poStatus: '', invStatus: '', from: '', to: '' });
  const m = dashMetrics(st);
  const common = qs({ method: st.method, supplier: st.supplier }), dates = qs({ method: st.method, supplier: st.supplier, from: st.from, to: st.to });
  const tile = (k, v, s, href, cls = '') => `<button class="tile click ${cls}" data-act="go" data-hash="${href}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></button>`;
  const sel = (name, label, options) => `<select class="input" data-lf="dash:${name}" title="${label}"><option value="">${label}: All</option>${opt(options, st[name])}</select>`;
  const maxV = m.poValue || 1, fr = (label, v, color) => `<div class="fr"><div>${label}</div><div class="fb"><span style="width:${pct(v, maxV).toFixed(1)}%;background:${color}"></span></div><div class="num strong">${money(v)}</div></div>`;
  const methods = ['Standard', 'Progressive', 'Milestone'].map(k => { const ps = m.appr.filter(p => p.billingMethod === k), ss = ps.map(poSummary); return { k, n: ps.length, v: sum(ps, poNet), acc: sum(ss, s => s.accepted), inv: sum(ss, s => s.invoiced), rem: sum(ss, s => s.remaining) }; });
  const attn = [
    m.blocked ? `<div class="row" style="padding:5px 0">${sb('Matching Failed')}<span>${m.blocked} invoice(s) blocked by matching</span><span class="spacer"></span><a class="link" href="#/invoices?status=Matching+Failed">Review</a></div>` : '',
    m.pendInv ? `<div class="row" style="padding:5px 0">${sb('Pending Approval')}<span>${m.pendInv} invoice(s) awaiting AP approval</span><span class="spacer"></span><a class="link" href="#/approvals?tab=invoices">Approve</a></div>` : '',
    m.pendRcpt ? `<div class="row" style="padding:5px 0">${sb('Pending Acceptance')}<span>${m.pendRcpt} receipt(s) awaiting acceptance</span><span class="spacer"></span><a class="link" href="#/approvals?tab=receipts">Review</a></div>` : '',
    m.pendMs ? `<div class="row" style="padding:5px 0">${sb('Submitted for Acceptance')}<span>${m.pendMs} milestone(s) awaiting approval</span><span class="spacer"></span><a class="link" href="#/approvals?tab=milestones">Review</a></div>` : '',
    db.claims.filter(c => c.status === 'Submitted').length ? `<div class="row" style="padding:5px 0">${sb('Submitted')}<span>${db.claims.filter(c => c.status === 'Submitted').length} progress claim(s) awaiting certification</span><span class="spacer"></span><a class="link" href="#/approvals?tab=claims">Certify</a></div>` : '',
    db.pos.filter(p => p.status === 'Pending Approval').length ? `<div class="row" style="padding:5px 0">${sb('Pending Approval')}<span>${db.pos.filter(p => p.status === 'Pending Approval').length} PO(s) awaiting approval</span><span class="spacer"></span><a class="link" href="#/approvals?tab=pos">Approve</a></div>` : '',
  ].filter(Boolean).join('') || '<div class="hint">Nothing needs attention.</div>';
  return `<div>${pageHead({ title: 'Dashboard', crumbs: [['Dashboard']], right: actBtn('demo-open', 'Scenarios & reset', { icn: 'reset' }) })}
  <div class="content">
   <div class="filters">${sel('method', 'Billing method', ['Standard', 'Progressive', 'Milestone'])}${sel('supplier', 'Supplier', supOpts())}${sel('poStatus', 'PO status', ['Draft', 'Pending Approval', 'Approved', 'Rejected'])}${sel('invStatus', 'Invoice status', INV_STATUSES)}
     <input class="input" type="date" data-lf="dash:from" value="${esc(st.from)}" title="Invoice date from"><input class="input" type="date" data-lf="dash:to" value="${esc(st.to)}" title="Invoice date to">
     ${Object.values({ a: st.method, b: st.supplier, c: st.poStatus, d: st.invStatus, e: st.from, f: st.to }).some(Boolean) ? actBtn('dash-clear', 'Clear filters', { cls: 'btn-ghost btn-sm' }) : ''}<span class="spacer"></span><span class="hint">Click any metric to open the filtered list</span></div>
   <div class="tiles">
    ${tile('Approved PO value', money(m.poValue), `${m.appr.length} approved PO(s)`, '#/pos' + qs({ status: 'Approved', method: st.method, supplier: st.supplier }))}
    ${tile('Accepted receipt value', money(m.accepted), 'GRN / SRN / milestones / certified', '#/grns' + qs({ status: 'Accepted,Partially Accepted' }))}
    ${tile('Invoice value submitted', money(m.submitted), 'net, excl. drafts / rejected', '#/invoices' + qs({ status: SUBMITTED_SET.join(','), method: st.method, supplier: st.supplier, from: st.from, to: st.to }))}
    ${tile('Approved invoice value', money(m.approved), 'approved · posted · paid', '#/invoices' + qs({ status: 'Approved,Posted,Paid', method: st.method, supplier: st.supplier, from: st.from, to: st.to }), 'g')}
    ${tile('Paid value', money(m.paid), 'demo payments only', '#/invoices' + qs({ status: 'Paid', method: st.method, supplier: st.supplier, from: st.from, to: st.to }), 'g')}
    ${tile('Pending receipt acceptance', m.pendRcpt, 'GRNs / SRNs', '#/approvals?tab=receipts', m.pendRcpt ? 'a' : '')}
    ${tile('Pending milestone approval', m.pendMs, 'submitted for acceptance', '#/milestones' + qs({ status: 'Submitted for Acceptance' }), m.pendMs ? 'a' : '')}
    ${tile('Invoices blocked by matching', m.blocked, 'matching failed', '#/invoices' + qs({ status: 'Matching Failed', method: st.method, supplier: st.supplier }), m.blocked ? 'r' : '')}
    ${tile('Invoices pending approval', m.pendInv, 'awaiting AP Manager', '#/invoices' + qs({ status: 'Pending Approval', method: st.method, supplier: st.supplier }), m.pendInv ? 'a' : '')}
    ${tile('Remaining eligible billing value', money(m.remaining), 'accepted − invoiced', '#/schedules', 'g')}
   </div>
   <div class="grid-2" style="margin-top:16px;align-items:start">
    <div class="card flat"><h3>From PO to payment</h3><div class="funnel">${fr('Approved PO value', m.poValue, '#C9C4EE')}${fr('Accepted / eligible', m.accepted, '#8F83DE')}${fr('Invoiced (submitted)', m.submitted, '#6C5DD3')}${fr('Approved invoices', m.approved, '#4C9F70')}${fr('Paid', m.paid, '#2F9E62')}${fr('Remaining eligible', m.remaining, '#F0B24A')}</div>
      <p class="hint" style="margin-top:8px">Received, invoiced, approved and paid are distinct measures. Bars are relative to approved PO value.</p></div>
    <div class="card flat"><h3>Needs attention</h3>${attn}</div></div>
   <div class="sec-title">By billing method</div>
   <div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Billing method</th><th class="right">Approved POs</th><th class="right">PO value</th><th class="right">Accepted / eligible</th><th class="right">Invoiced</th><th class="right">Remaining eligible</th></tr></thead><tbody>${methods.map(x => `<tr class="click" data-act="go" data-hash="#/pos${qs({ method: x.k, status: 'Approved' })}"><td>${mb(x.k)}</td><td class="num">${x.n}</td><td class="num">${fmtNum(x.v)}</td><td class="num">${fmtNum(x.acc)}</td><td class="num">${fmtNum(x.inv)}</td><td class="num strong">${fmtNum(x.rem)}</td></tr>`).join('')}</tbody></table></div>
   <div class="sec-title">Recent activity</div><ul class="tl">${db.audit.slice(0, 8).map(a => `<li class="${a.kind === 'ok' ? 'ok' : a.kind === 'bad' ? 'bad' : a.kind === 'alloc' ? 'amber' : ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.ref)} · ${esc(a.by)} · ${fmtDT(a.at)}</div></li>`).join('')}</ul>
  </div></div>`;
};
ACT['dash-clear'] = () => { ui.lists.dash = { q: '', page: 1, method: '', supplier: '', poStatus: '', invStatus: '', from: '', to: '' }; render(); };
