/* =====================================================================
   screens-dash.js — overview (all numbers derived from the records)
   ===================================================================== */
const SUBMITTED_SET = ['Submitted', 'Pending Matching', 'Matching Failed', 'Pending Approval', 'Approved', 'Posted', 'Paid'];
ROUTES.overview = () => {
  const appr = db.pos.filter(p => p.status === 'Approved'), sums = appr.map(p => ({ p, s: poSummary(p) }));
  const invs = db.invoices, val = sum(appr, poNet), accepted = sum(sums, x => x.s.accepted), remaining = sum(sums, x => x.s.remaining);
  const submitted = sum(invs.filter(i => SUBMITTED_SET.includes(i.status)), i => i.net), approved = sum(invs.filter(i => APPROVED.includes(i.status)), i => i.net), paid = sum(invs.filter(i => i.status === 'Paid'), i => i.net);
  const blocked = invs.filter(i => i.status === 'Matching Failed').length, pendInv = invs.filter(i => i.status === 'Pending Approval').length;
  const pendRcpt = db.grns.filter(g => g.status === 'Pending Inspection').length + db.srns.filter(s => s.status === 'Pending Acceptance').length;
  const pendMs = db.milestones.filter(m => m.status === 'Pending Approval' || docState(m) === 'Pending Approval').length, pendClaims = db.claims.filter(c => c.status === 'Submitted').length, pendPO = db.pos.filter(p => p.status === 'Pending Approval').length;
  const gatedMs = db.milestones.filter(m => { const po = getPO(m.poId); return m.status === 'Approved' && po && !msGate(m, po).ok; });
  const tile = (k, v, s, href, cls = '') => `<button class="tile ${cls}" data-act="go" data-hash="${href}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></button>`;
  const maxV = val || 1, fr = (label, v, color) => `<div class="fr"><div>${label}</div><div class="fb"><span style="width:${pct(v, maxV).toFixed(1)}%;background:${color}"></span></div><div class="num strong">${money(v)}</div></div>`;
  const methods = ['Standard', 'Progressive', 'Milestone'].map(k => { const ps = appr.filter(p => p.billingMethod === k), ss = ps.map(poSummary); return { k, n: ps.length, v: sum(ps, poNet), acc: sum(ss, s => s.accepted), inv: sum(ss, s => s.invoiced), rem: sum(ss, s => s.remaining) }; });
  const row = (pillHtml, text, href, label) => `<div class="attn">${pillHtml}<span style="flex:1">${text}</span><a class="link" href="${href}">${label}</a></div>`;
  const attn = [
    blocked ? row(sb('Matching Failed'), `${blocked} invoice(s) blocked by matching`, '#/invoices?tab=pending', 'Review') : '',
    pendInv ? row(sb('Pending Approval'), `${pendInv} invoice(s) awaiting AP approval`, '#/approvals?tab=invoices', 'Approve') : '',
    pendRcpt ? row(sb('Pending Inspection'), `${pendRcpt} receipt(s) awaiting inspection / acceptance`, '#/approvals?tab=receipts', 'Review') : '',
    pendMs ? row(sb('Pending Approval'), `${pendMs} milestone approval(s) / document(s) awaiting approval`, '#/approvals?tab=milestones', 'Review') : '',
    gatedMs.length ? row(sb('Not Eligible'), `${gatedMs.length} approved milestone(s) blocked until their GRN / SRN is accepted: ${gatedMs.map(m => m.code + ' on ' + getPO(m.poId).number.split('/').pop()).join(', ')}`, '#/pos?tab=pending', 'Open POs') : '',
    pendClaims ? row(sb('Submitted'), `${pendClaims} progress claim(s) awaiting certification`, '#/approvals?tab=claims', 'Certify') : '',
    pendPO ? row(sb('Pending Approval'), `${pendPO} PO(s) awaiting approval`, '#/approvals?tab=pos', 'Approve') : '',
  ].filter(Boolean).join('') || '<div class="hint">Nothing needs attention.</div>';
  return `<div class="page"><div class="ph" style="margin-bottom:0"><h1 class="page-title">Overview</h1><div class="right">${gbtn('po.edit', 'po-new', 'Create Order', { cls: 'btn-primary', icn: 'plus' })}</div></div>
   <div class="tiles">
    ${tile('Approved PO value', money(val), `${appr.length} approved PO(s), excl. GST`, '#/pos?tab=pending')}
    ${tile('Accepted value', money(accepted), 'receipts / milestones / certified', '#/receipts?tab=accepted')}
    ${tile('Invoiced', money(submitted), 'base amount, excl. drafts & rejected', '#/invoices?tab=all')}
    ${tile('Approved invoices', money(approved), 'approved · posted · paid', '#/invoices?tab=approved', 'g')}
    ${tile('Paid', money(paid), 'demo payments only', '#/invoices?tab=paid', 'g')}
    ${tile('Ready to invoice', money(remaining), 'accepted − invoiced', '#/pos?tab=pending', 'g')}
    ${tile('Awaiting approval', pendInv + pendRcpt + pendMs + pendClaims + pendPO, 'invoices, receipts, milestones, POs', '#/approvals', pendInv + pendRcpt + pendMs + pendClaims + pendPO ? 'a' : '')}
    ${tile('Blocked invoices', blocked, 'matching failed', '#/invoices?tab=pending', blocked ? 'r' : '')}
   </div>
   <div class="cards-2" style="margin-top:22px;align-items:start">
    <div class="card"><div class="card-t">From PO to payment</div><div class="funnel">${fr('Approved PO value', val, '#CFC8F0')}${fr('Accepted / eligible', accepted, '#9A8EE3')}${fr('Invoiced', submitted, '#6A5BD2')}${fr('Approved invoices', approved, '#4C9F70')}${fr('Paid', paid, '#1F9D63')}${fr('Ready to invoice', remaining, '#F0B24A')}</div>
      <p class="hint" style="margin-top:10px">Accepted, invoiced, approved and paid are distinct measures. Bars are relative to approved PO value.</p></div>
    <div class="card"><div class="card-t">Needs attention</div>${attn}</div></div>
   <div class="sec">By billing method</div>
   <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Billing method</th><th class="right">Approved POs</th><th class="right">PO value</th><th class="right">Accepted</th><th class="right">Invoiced</th><th class="right">Ready to invoice</th></tr></thead><tbody>${methods.map(x => `<tr class="click" data-act="go" data-hash="#/pos?tab=pending&method=${x.k}"><td>${mb(x.k)}</td><td class="num">${x.n}</td><td class="num">${fmtNum(x.v)}</td><td class="num">${fmtNum(x.acc)}</td><td class="num">${fmtNum(x.inv)}</td><td class="num strong">${fmtNum(x.rem)}</td></tr>`).join('')}</tbody></table></div>
   <div class="sec">Recent activity</div><div class="timeline-card" style="max-width:760px"><ul class="tl">${db.audit.slice(0, 8).map(a => `<li class="${a.kind === 'ok' ? 'ok' : a.kind === 'bad' ? 'bad' : a.kind === 'alloc' ? 'amber' : ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.ref)} · ${esc(a.by)} · ${fmtDT(a.at)}</div></li>`).join('')}</ul></div>
  </div>`;
};
