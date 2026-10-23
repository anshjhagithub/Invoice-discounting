/* =====================================================================
   screens-inv.js — supplier invoices (list / create / detail), matching,
   approval queue, AP register
   ===================================================================== */
const matchBadge = i => i.match ? sb(i.match.result) : '<span class="dim-note">Not run</span>';
const INV_STATUSES = ['Draft', 'Submitted', 'Pending Matching', 'Matching Failed', 'Pending Approval', 'Approved', 'Rejected', 'Posted', 'Paid', 'Cancelled'];

/* ================================================================ list */
ROUTES.invoices = () => `<div>${pageHead({ title: 'Supplier Invoices', crumbs: [['Supplier Invoices']], right: gbtn('inv.create', 'go', 'Create Invoice', { cls: 'btn-primary', icn: 'plus', data: { hash: '#/invoice/new' } }) })}
  <div class="content">${listHtml('invoices', {
    pills: { name: 'status', values: ["Draft","Matching Failed","Pending Approval","Approved","Posted","Paid","Rejected","Cancelled"], get: i => i.status },
    searchPh: 'Search invoice, supplier invoice no., PO…', dates: true,
    filters: [{ name: 'status', label: 'Status', options: () => INV_STATUSES }, { name: 'method', label: 'Billing method', options: () => ['Standard', 'Progressive', 'Milestone'] }, { name: 'supplier', label: 'Supplier', options: () => supOpts() }, { name: 'po', label: 'PO', options: () => db.pos.filter(p => invsOf(p).length).map(p => [p.id, p.number]) }],
    rows: () => db.invoices.slice().sort((a, b) => b.seq - a.seq),
    match: (i, st) => matchText(st, i.number, invRef(i), getPO(i.poId).number, getSup(i.supplierId).name) && matchIn(st, 'status', i.status) && matchIn(st, 'method', i.method) && matchIn(st, 'supplier', i.supplierId) && matchIn(st, 'po', i.poId) && matchDate(st, i.date),
    cols: ['Invoice', 'Supplier inv. no.', 'PO', 'Method', 'Supplier', 'Date', '>Net', '>VAT', '>Gross', 'Matching', 'Status'],
    row: i => `<tr class="click" data-act="go" data-hash="#/invoice/${i.id}"><td class="strong">${invRef(i)}</td><td>${esc(i.number)}</td><td>${esc(getPO(i.poId).number)}</td><td>${mb(i.method)}</td><td>${esc(getSup(i.supplierId).name)}</td><td class="nowrap">${fmtD(i.date)}</td><td class="num">${fmtNum(i.net)}</td><td class="num">${fmtNum(i.vat)}</td><td class="num strong">${fmtNum(i.gross)}</td><td>${matchBadge(i)}</td><td>${sb(i.status)}</td></tr>`,
  })}</div></div>`;

/* ================================================================ create */
function invInit(q) {
  if (q.inv) {
    const i = getInv(q.inv);
    if (i && ['Draft', 'Matching Failed'].includes(i.status)) {
      const alloc = {}; i.allocs.forEach(a => { alloc[a.kind + ':' + a.refId] = { on: true, qty: a.qty, value: a.value }; });
      return { id: i.id, number: i.number, date: i.date, poId: i.poId, lineId: i.lineId || '', desc: i.desc, remarks: i.remarks, attachments: [...i.attachments], net: i.net, vatManual: '', autoMatch: true, alloc };
    }
  }
  const po = q.po && getPO(q.po), ok = po && po.status === 'Approved';
  const f = { id: null, number: '', date: todayISO(), poId: ok ? po.id : '', lineId: '', desc: '', remarks: '', attachments: [], net: '', vatManual: '', autoMatch: true, alloc: {} };
  if (ok && q.ms && po.billingMethod === 'Milestone') { const m = getMS(q.ms); if (m && m.poId === po.id) { const it = sourceItems(po).find(x => x.refId === m.id); f.alloc['milestone:' + m.id] = { on: true, value: it.availValue > 0 ? it.availValue : m.amount }; f.desc = `${m.code} — ${m.name}`; } }
  return f;
}
HOOKS.invpo = () => { ui.f.alloc = {}; ui.f.lineId = ''; ui.f.net = ''; ui.f.desc = ''; };
function invAllocs(f, po) {
  const out = [];
  sourceItems(po, f.id).forEach(it => {
    const a = f.alloc[it.kind + ':' + it.refId]; if (!a || !a.on) return;
    if (it.kind === 'grn') { const qty = +a.qty || 0; out.push({ kind: 'grn', refId: it.refId, qty, value: r2(qty * it.price) }); }
    else out.push({ kind: it.kind, refId: it.refId, qty: null, value: r2(+a.value || 0) });
  });
  return out;
}
function invDraftObj(f) {
  const po = getPO(f.poId);
  return { id: f.id, poId: f.poId, number: f.number, date: f.date, lineId: f.lineId || null, desc: f.desc, remarks: f.remarks, attachments: f.attachments, allocs: po && po.billingMethod !== 'Standard' ? invAllocs(f, po) : [], net: +f.net || 0, vatRate: VAT_RATE_DEFAULT, vatManual: f.vatManual === '' ? null : +f.vatManual, autoMatch: f.autoMatch };
}
ROUTES.invoice = r => {
  const id = r.parts[1];
  if (id === 'new') return invForm(r);
  const i = getInv(id); if (!i) return notFound('Invoice');
  return invDetail(i);
};
function invForm(r) {
  const key = 'inv-new-' + (r.q.inv || '');
  if (!ui.f || ui.fKey !== key) { ui.f = invInit(r.q); ui.fKey = key; }
  const f = ui.f, po = getPO(f.poId), pos = approvedPOs();
  ui.derive = invDerive;
  const lineSel = po && po.lines.length > 1 ? `<div class="field"><label>PO line</label><select class="input" data-f="lineId" data-r><option value="">All lines</option>${opt(po.lines.map(l => [l.id, `${l.no}. ${l.desc}`]), f.lineId)}</select></div>` : po ? `<div class="field"><label>PO line</label><div class="ro">1. ${esc(po.lines[0].desc)}</div></div>` : '';
  return `<div>${pageHead({ title: f.id ? `Edit invoice ${invRef(getInv(f.id))}` : 'Create Supplier Invoice', crumbs: [['Supplier Invoices', '#/invoices'], [f.id ? invRef(getInv(f.id)) : 'New invoice']] })}
  <div class="content">
   <div class="card" style="margin-top:16px"><h3>Invoice header</h3><div class="fgrid">
    <div class="field"><label>Supplier invoice number *</label><input class="input" data-f="number" value="${esc(f.number)}" placeholder="e.g. GIE-2026-0101"></div>
    <div class="field"><label>Invoice date *</label><input class="input" type="date" data-f="date" value="${esc(f.date)}"></div>
    <div class="field"><label>Purchase order *</label><select class="input" data-f="poId" data-hook="invpo" data-r><option value="">— Select an approved PO —</option>${opt(pos.map(p => [p.id, poOptLabel(p)]), f.poId)}</select></div>
    ${po ? `<div class="field"><label>Supplier</label><div class="ro">${esc(getSup(po.supplierId).name)} · ${getSup(po.supplierId).code}</div></div>
    <div class="field"><label>Billing method (inherited from PO)</label><div class="ro" style="gap:8px">${poMethodBadge(po)} <span class="lock">${icon('lock', 11)} cannot be changed on the invoice</span></div></div>
    <div class="field"><label>Currency</label><div class="ro">AED</div></div>${lineSel}
    <div class="field span2"><label>Invoice line description</label><input class="input" data-f="desc" value="${esc(f.desc)}" placeholder="${esc(po.lines[0].desc)}"></div>
    <div class="field span2"><label>Remarks</label><input class="input" data-f="remarks" value="${esc(f.remarks)}"></div>
    <div class="field span3"><label>Supporting attachments (mock upload)</label>${attachBox('attachments', f.attachments, 'Attach invoice PDF / supporting documents')}</div>` : ''}</div></div>
   ${po ? methodPanel(f, po) : `<div class="empty-state">Select an approved PO. Its billing method (Standard, Progressive or Milestone) determines what you can invoice.</div>`}
   ${po ? `<div id="inv-derived"></div>
   <div class="sticky-bar"><label class="check-row" style="margin-right:auto"><input type="checkbox" data-f="autoMatch" ${f.autoMatch ? 'checked' : ''}> Run invoice matching on submit</label>${actBtn('go', 'Cancel', { cls: 'btn-ghost', data: { hash: '#/invoices' } })}${gbtn('inv.create', 'inv-save', 'Save as Draft', { cls: 'btn-outline', data: { m: 'draft' } })}${gbtn('inv.create', 'inv-save', 'Submit Invoice', { cls: 'btn-primary', data: { m: 'submit' }, icn: 'check' })}</div>` : ''}
  </div></div>`;
}
function methodPanel(f, po) {
  const items = sourceItems(po, f.id).filter(x => !f.lineId || !x.line || x.line.id === f.lineId);
  if (po.billingMethod === 'Standard') {
    const rc = items;
    return `<div class="method-banner standard"><div class="ic">${icon('doc', 14)}</div><div><b>Standard billing</b> — existing PO and receipt references. The invoice is matched against accepted receipts at PO level; no progressive or milestone restrictions apply.</div></div>
    <div class="card" style="margin-top:12px"><h3>PO and receipt references</h3><div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Receipt</th><th>Date</th><th>Status</th><th class="right">Received</th><th class="right">Accepted value</th></tr></thead><tbody>${rc.map(x => `<tr class="${x.entValue > 0 ? '' : 'dim'}"><td class="strong">${x.label}</td><td>${fmtD(x.ref.date)}</td><td>${sb(x.status)}${x.entValue <= 0 && x.reason ? `<div class="sub">${esc(x.reason)}</div>` : ''}</td><td class="num">${x.kind === 'grn' ? fmtNum(x.ref.received) : fmtNum(x.ref.serviceValue)}</td><td class="num">${fmtNum(x.entValue)}</td></tr>`).join('') || emptyRow(5, 'No receipts against this PO yet.')}</tbody></table></div>
    <div class="fgrid c2" style="margin-top:12px"><div class="field"><label>Invoice net amount (AED) *</label><input class="input num" type="number" min="0" step="any" data-t="num" data-f="net" value="${f.net}"><div class="fhint"><button type="button" class="link" data-act="inv-full-std">Use full eligible balance</button></div></div></div></div>`;
  }
  if (po.billingMethod === 'Milestone') {
    return `<div class="method-banner milestone"><div class="ic">${icon('flag', 14)}</div><div><b>Milestone billing</b> — invoice eligibility is the amount allocated to an <b>approved contractual milestone</b>, subject to any required SRN acceptance. Select the milestone being invoiced.</div></div>
    <div class="card pad0" style="margin-top:12px"><div style="padding:14px 14px 8px"><h3 style="margin:0">Milestone selector</h3></div><div class="table-wrap"><table class="grid compact"><thead><tr><th></th><th>Milestone</th><th>Approval status</th><th>Required acceptance / SRN</th><th class="right">Contractual amount</th><th class="right">Previously invoiced</th><th class="right">Remaining balance</th><th class="right">Invoice amount</th></tr></thead><tbody>
    ${[...items.filter(x => x.eligible), ...items.filter(x => !x.eligible)].map((x, ix, arr) => { const m = x.ref, key = 'milestone:' + x.refId, a = f.alloc[key] || {}, g = msGate(m, po), sr = g.srn;
      return `${ix > 0 && x.eligible === false && arr[ix - 1].eligible ? `<tr><td colspan="8" class="hint" style="background:var(--row-alt)">Not currently invoice-eligible — selecting these is blocked by the validation gate</td></tr>` : ''}
      <tr class="${a.on ? 'sel' : x.eligible ? '' : 'dim'}"><td><input type="radio" name="msel" ${a.on ? 'checked' : ''} data-act="inv-pick-ms" data-ref="${x.refId}"></td><td class="strong">${m.code} — ${esc(m.name)}<div class="sub">Planned ${fmtD(m.planned)}</div></td><td>${sb(m.status)}</td><td>${m.srnRequired ? (sr ? `${esc(sr.number)} ${sb(sr.status)}` : '<span class="warn-t">Accepted SRN required — none linked</span>') : '<span class="dim-note">No SRN required</span>'}</td><td class="num">${fmtNum(m.amount)}</td><td class="num">${fmtNum(x.usedValue)}</td><td class="num strong">${fmtNum(r2(m.amount - x.usedValue))}</td>
      <td class="right">${a.on ? `<input class="input sm num alloc-in" type="number" step="any" min="0" data-t="num" data-f="alloc.${key}.value" value="${a.value ?? ''}" ${po.partialMilestone ? '' : 'readonly title="Full milestone amount (partial billing is off)"'}>` : '—'}${!x.eligible && x.reason ? `<div class="inelig">${esc(x.reason)}</div>` : ''}</td></tr>`; }).join('') || emptyRow(8, 'No milestones configured.')}</tbody></table></div></div>`;
  }
  if (poCertified(po)) {
    return `<div class="method-banner progressive"><div class="ic">${icon('layers', 14)}</div><div><b>Progressive billing — certified work progress</b>. Only newly certified, unconsumed progress claims can be invoiced (current claim = new cumulative certified − previously certified).</div></div>
    <div class="card pad0" style="margin-top:12px"><div style="padding:14px 14px 8px"><h3 style="margin:0">Progress claims</h3></div><div class="table-wrap"><table class="grid compact"><thead><tr><th></th><th>Claim</th><th>Status</th><th class="right">Certified</th><th class="right">Previously allocated</th><th class="right">Remaining balance</th><th class="right">Current allocation (AED)</th></tr></thead><tbody>
    ${[...items.filter(x => x.eligible), ...items.filter(x => !x.eligible)].map(x => { const key = 'claim:' + x.refId, a = f.alloc[key] || {}; return `<tr class="${a.on ? 'sel' : x.eligible ? '' : 'dim'}"><td><input type="checkbox" ${a.on ? 'checked' : ''} data-act="inv-pick" data-kind="claim" data-ref="${x.refId}"></td><td class="strong">${x.label} · ${esc(x.ref.period)}</td><td>${sb(x.status)}</td><td class="num">${fmtNum(x.entValue)}</td><td class="num">${fmtNum(x.usedValue)}</td><td class="num strong">${fmtNum(x.availValue)}</td><td class="right">${a.on ? `<input class="input sm num alloc-in" type="number" step="any" min="0" data-t="num" data-f="alloc.${key}.value" value="${a.value ?? ''}">` : '—'}${!x.eligible && x.reason ? `<div class="inelig">${esc(x.reason)}</div>` : ''}</td></tr>`; }).join('') || emptyRow(7, 'No progress claims on this PO.')}</tbody></table></div></div>`;
  }
  // progressive, receipt-based
  const elig = items.filter(x => x.eligible), nonE = items.filter(x => !x.eligible);
  const row = x => { const key = x.kind + ':' + x.refId, a = f.alloc[key] || {}, g = x.kind === 'grn';
    return `<tr class="${a.on ? 'sel' : x.eligible ? '' : 'dim'}"><td><input type="checkbox" ${a.on ? 'checked' : ''} data-act="inv-pick" data-kind="${x.kind}" data-ref="${x.refId}"></td>
    <td class="strong">${x.label}<div class="sub">${g ? 'GRN' : 'SRN'} · ${fmtD(x.ref.date)}</div></td><td>${sb(x.status)}</td>
    <td class="num">${g ? fmtNum(x.entQty) + ' u<div class="sub">' + fmtNum(x.entValue) + '</div>' : fmtNum(x.entValue)}</td>
    <td class="num">${g ? fmtNum(x.committedQty) + ' u<div class="sub">' + fmtNum(x.committedValue) + '</div>' : fmtNum(x.committedValue)}</td>
    <td class="num">${g ? fmtNum(x.reservedQty) + ' u<div class="sub">' + fmtNum(x.reservedValue) + '</div>' : fmtNum(x.reservedValue)}</td>
    <td class="num strong">${g ? fmtNum(x.availQty) + ' u<div class="sub">' + fmtNum(x.availValue) + '</div>' : fmtNum(x.availValue)}</td>
    <td class="right">${a.on ? (g ? `<input class="input sm num alloc-in" type="number" step="any" min="0" data-t="num" data-f="alloc.${key}.qty" value="${a.qty ?? ''}"> <span class="hint">units</span><div class="sub" id="rv-${key}"></div>` : `<input class="input sm num alloc-in" type="number" step="any" min="0" data-t="num" data-f="alloc.${key}.value" value="${a.value ?? ''}"> <span class="hint">AED</span>`) + `<div class="inelig" id="re-${key}"></div>` : '—'}${!a.on && x.reason && !x.eligible ? `<div class="inelig">${esc(x.reason)}</div>` : ''}</td></tr>`; };
  return `<div class="method-banner progressive"><div class="ic">${icon('layers', 14)}</div><div><b>Progressive billing</b> — invoice eligibility is derived from <b>accepted GRN/SRN quantities and values</b>. Allocate this invoice across one or more receipts; consumed quantities become unavailable to other invoices.</div></div>
  <div class="card pad0" style="margin-top:12px"><div style="padding:14px 14px 8px"><h3 style="margin:0">Receipt selector &amp; allocation</h3><div class="hint">Previously allocated = approved / posted / paid · Reserved = in-flight invoices (released automatically if rejected or cancelled)</div></div>
  <div class="table-wrap"><table class="grid compact"><thead><tr><th></th><th>Receipt</th><th>Status</th><th class="right">Accepted</th><th class="right">Previously allocated</th><th class="right">Reserved</th><th class="right">Available now</th><th class="right">This invoice</th></tr></thead><tbody>
  ${elig.map(row).join('') || emptyRow(8, 'No eligible receipts. Receive and accept goods/services first.')}
  ${nonE.length ? `<tr><td colspan="8" class="hint" style="background:var(--row-alt)">Fully allocated, pending, rejected or reversed — selecting these is blocked by the validation gate</td></tr>${nonE.map(row).join('')}` : ''}</tbody></table></div></div>`;
}
ACT['inv-pick'] = el => {
  const f = ui.f, po = getPO(f.poId), key = el.dataset.kind + ':' + el.dataset.ref, on = el.checked;
  if (!on) { delete f.alloc[key]; return render(); }
  const it = sourceItems(po, f.id).find(x => x.kind === el.dataset.kind && x.refId === el.dataset.ref);
  if (it.kind === 'grn') f.alloc[key] = { on: true, qty: it.availQty > 0 ? it.availQty : (it.entQty > 0 ? it.entQty : it.ref.received) };
  else if (it.kind === 'srn') f.alloc[key] = { on: true, value: it.availValue > 0 ? it.availValue : (it.entValue > 0 ? it.entValue : it.ref.serviceValue) };
  else f.alloc[key] = { on: true, value: it.availValue > 0 ? it.availValue : (it.ref.certified || it.ref.amount) };
  render();
};
ACT['inv-pick-ms'] = el => { const f = ui.f, po = getPO(f.poId), it = sourceItems(po, f.id).find(x => x.refId === el.dataset.ref); f.alloc = { ['milestone:' + it.refId]: { on: true, value: it.availValue > 0 ? it.availValue : it.ref.amount } }; if (!f.desc) f.desc = `${it.ref.code} — ${it.ref.name}`; render(); };
ACT['inv-full-std'] = () => { const po = getPO(ui.f.poId), s = poSummary(po); ui.f.net = s.remaining; render(); };

function invDerive() {
  const f = ui.f, po = getPO(f.poId), box = $('#inv-derived'); if (!po || !box) return;
  const d = invDraftObj(f), b = buildInvoice({ ...d, supplierId: po.supplierId, method: po.billingMethod }), ev = evaluateInvoice(b), s = poSummary(po);
  const gate = ev.errors || [];
  const stripItems = po.billingMethod === 'Milestone'
    ? [['PO value', money(s.value)], ['Approved milestone value', money(s.accepted)], ['Previously invoiced', money(sum(invsOf(po).filter(i => isLive(i) && i.id !== f.id), i => i.net))], ['Remaining eligible', money(s.remaining), '', 'hl']]
    : [['PO value', money(s.value)], [poCertified(po) ? 'Total certified value' : 'Total accepted receipt value', money(s.accepted)], [po.billingMethod === 'Standard' ? 'Previously invoiced' : 'Previously invoiced receipt value', money(sum(invsOf(po).filter(i => isLive(i) && i.id !== f.id), i => i.net))], ['Remaining eligible', money(s.remaining), '', 'hl']];
  const sel = po.billingMethod === 'Progressive' && !poCertified(po) ? b.allocs.map(a => allocRefLabel(a)).join(', ') : '';
  box.innerHTML = `<div class="sec-title">${po.billingMethod} invoice summary</div>${strip(stripItems)}
  <div class="grid-2" style="margin-top:14px;align-items:start">
   <div class="card flat"><h3>Invoice totals</h3><div class="total-box" style="background:#fff"><div class="r"><span>Net invoice amount</span><b>${money(b.net)}</b></div>${sel ? `<div class="r hint"><span>Selected receipts</span><span>${esc(sel)}</span></div>` : ''}<div class="r"><span>VAT (${b.vatRate}% — tax code VAT5)</span><b>${money(b.vat)}</b></div><div class="r g"><span>Gross invoice total</span><span>${money(b.gross)}</span></div></div>
    <div class="field" style="margin-top:10px"><label>VAT amount override (optional)</label><input class="input sm num" style="width:160px" type="number" step="any" data-t="num" data-f="vatManual" value="${f.vatManual}" placeholder="auto ${fmtNum(r2(b.net * b.vatRate / 100))}"><div class="fhint">Leave blank to auto-calculate. A variance above AED 1.00 fails VAT validation at matching.</div></div></div>
   <div class="card flat"><h3>Pre-submission validation</h3>
    ${gate.length ? alertBox('err', 'Validation gate — submission will be blocked', errList(gate)) : alertBox('ok', 'Passes the validation gate', 'Allocations are within the eligible balances. Matching will be run on submit.')}
    <div class="checks">${ev.checks.filter(c => c.key !== 'appr').map(c => `<div class="check ${c.status}" style="grid-template-columns:22px 150px 1fr"><div class="ci">${icon(c.status === 'pass' ? 'check' : c.status === 'warn' ? 'alert' : 'x', 11, 3)}</div><div class="cl">${esc(c.label)}</div><div class="cd">${esc(c.detail)}</div></div>`).join('')}</div></div></div>`;
  if (po.billingMethod === 'Progressive' && !poCertified(po)) b.allocs.forEach(a => {
    const key = a.kind + ':' + a.refId, v = document.getElementById('rv-' + key), e = document.getElementById('re-' + key);
    if (v && a.kind === 'grn') v.textContent = `= ${money(a.value)}`;
    if (e) e.textContent = (gate.find(g => g.ref && g.ref === (a.kind === 'grn' ? getGRN(a.refId).number : getSRN(a.refId).number)) || {}).msg ? 'Blocked — see validation' : '';
  });
}
ACT['inv-save'] = el => { const m = el.dataset.m, d = invDraftObj(ui.f); done(A.saveInvoice(d, m), r => { ui.f = null; go(`#/invoice/${r.id}`); }); };

/* ================================================================ detail */
function allocState(inv) { return isLive(inv) ? (APPROVED.includes(inv.status) ? 'Committed' : 'Reserved') : (inv.status === 'Draft' ? 'Not reserved' : 'Released'); }
function invDetail(i) {
  const po = getPO(i.poId), sup = getSup(i.supplierId), adj = adjOf(i);
  const bn = { Draft: ['gray', 'Draft — no allocation reserved', 'Submit the invoice to reserve receipt / milestone entitlements and run matching.'], Submitted: ['blue', 'Submitted', 'Awaiting matching.'], 'Pending Matching': ['blue', 'Pending matching', 'Run matching to validate the invoice.'], 'Matching Failed': ['red', 'Matching failed — blocked', 'Reservations are held back. Resolve the exceptions and re-run matching.'], 'Pending Approval': ['amber', 'Pending approval', `Matching ${i.match ? i.match.result.toLowerCase() : ''}. Routed to the AP Manager. Allocations are reserved.`], Approved: ['green', 'Approved — ready to post to AP', 'Allocations are committed.'], Rejected: ['red', 'Rejected', 'Allocations released back to the eligible balance.'], Posted: ['blue', 'Posted to AP (simulated)', `Voucher ${i.ap?.voucher}. Awaiting payment.`], Paid: ['green', 'Paid (demo)', `Reference ${i.ap?.payRef}. No real bank payment was made.`], Cancelled: ['gray', 'Cancelled', 'Allocations released.'] }[i.status];
  const acts = [];
  if (['Draft', 'Matching Failed'].includes(i.status)) acts.push(gbtn('inv.create', 'go', 'Edit', { icn: 'edit', data: { hash: `#/invoice/new?inv=${i.id}` } }));
  if (i.status === 'Draft') acts.push(gbtn('inv.create', 'inv-submit-existing', 'Submit Invoice', { cls: 'btn-primary', data: { id: i.id }, icn: 'check' }));
  if (['Submitted', 'Pending Matching', 'Matching Failed', 'Pending Approval'].includes(i.status)) acts.push(gbtn('inv.match', 'inv-match', i.status === 'Pending Approval' ? 'Re-run matching' : 'Run Matching', { cls: ['Submitted', 'Pending Matching'].includes(i.status) ? 'btn-primary btn-sm' : 'btn-outline btn-sm', data: { id: i.id }, icn: 'play' }));
  if (i.status === 'Matching Failed') acts.push(actBtn('go', 'View Exceptions', { cls: 'btn-danger-soft btn-sm', data: { hash: `#/matching/${i.id}` } }));
  if (i.status === 'Pending Approval') acts.push(gbtn('inv.approve', 'inv-reject', 'Reject', { cls: 'btn-danger-soft', data: { id: i.id } }), gbtn('inv.approve', 'inv-approve', 'Approve', { cls: 'btn-primary', data: { id: i.id }, icn: 'check' }));
  if (i.status === 'Approved') acts.push(gbtn('inv.post', 'inv-post', 'Post to AP', { cls: 'btn-primary', data: { id: i.id } }));
  if (i.status === 'Posted') acts.push(gbtn('inv.post', 'inv-pay', 'Mark as Paid (demo)', { cls: 'btn-primary', data: { id: i.id } }));
  if (APPROVED.includes(i.status)) acts.push(gbtn('inv.adjust', 'inv-adjust', 'Credit / debit note', { data: { id: i.id } }));
  if (['Draft', 'Submitted', 'Pending Matching', 'Matching Failed', 'Pending Approval', 'Approved'].includes(i.status)) acts.push(gbtn('inv.cancel', 'inv-cancel', 'Cancel', { cls: 'btn-danger-soft', data: { id: i.id } }));
  return `<div>${pageHead({ title: invRef(i), sub: `${sb(i.status)} ${mb(i.method)}`, crumbs: [['Supplier Invoices', '#/invoices'], [invRef(i)]], right: acts.join('') })}
  <div class="content"><div class="status-banner ${bn[0]}"><div><div class="t">${bn[1]}</div><div class="d">${esc(bn[2])}</div></div></div>
  ${strip([['Net amount', money(i.net)], ['VAT (' + i.vatRate + '%)', money(i.vat)], ['Gross amount', money(i.gross)], ['Payable (after notes)', money(payable(i)), adj.length ? `${adj.length} adjustment(s)` : ''], ['Matching', i.match ? i.match.result : 'Not run'], ['Approval', approvalStatus(i)], ['Payment', paymentStatus(i)]])}
  <div class="grid-2" style="margin-top:16px;align-items:start">
   <div class="card flat"><h3>Invoice details</h3><div class="kvg" style="grid-template-columns:1fr 1fr">${kv('Internal reference', invRef(i))}${kv('Supplier invoice no.', esc(i.number))}${kv('Supplier', `${esc(sup.name)}<div class="hint">${sup.code}</div>`)}${kv('Purchase order', poLink(po))}${kv('Billing method (inherited)', poMethodBadge(po))}${kv('Invoice date', fmtD(i.date))}${kv('Description', esc(i.desc) || '—')}${kv('Currency', 'AED')}${kv('Remarks', esc(i.remarks) || '—')}${kv('Attachments', attachChips(i.attachments) || '—')}${kv('Submitted', i.submittedAt ? fmtDT(i.submittedAt) : '—')}${i.ap ? kv('AP voucher', esc(i.ap.voucher) + (i.ap.payRef ? ` · ${esc(i.ap.payRef)}` : '')) : ''}</div>${i.ap ? '<p class="hint" style="margin-top:8px">Simulated AP posting / payment — no ERP or bank system was contacted.</p>' : ''}</div>
   <div class="card flat"><h3>Allocations <span class="hint" style="font-weight:400">· ${allocState(i)}</span></h3><table class="grid compact"><thead><tr><th>Source</th><th class="right">Qty</th><th class="right">Value (net)</th><th>State</th></tr></thead><tbody>${i.allocs.map(a => `<tr><td class="strong">${a.kind === 'grn' ? link(`#/grn/${a.refId}`, allocRefLabel(a)) : a.kind === 'srn' ? link(`#/srn/${a.refId}`, allocRefLabel(a)) : a.kind === 'milestone' ? link(`#/milestone/${a.refId}`, allocRefLabel(a)) : esc(allocRefLabel(a))}</td><td class="num">${a.qty != null ? fmtNum(a.qty) : '—'}</td><td class="num">${fmtNum(a.value)}</td><td>${sb(allocState(i))}</td></tr>`).join('') || emptyRow(4, 'Standard billing — matched at PO level against accepted receipts (no per-receipt allocation).')}</tbody></table>
    <p class="hint" style="margin-top:8px">Credit/debit notes use a separate adjustment record and never restore receipt quantities automatically.</p></div></div>
  <div class="sec-title">Matching result ${i.match ? sb(i.match.result) : ''}<span class="spacer"></span>${i.match ? actBtn('go', 'Open matching screen', { data: { hash: `#/matching/${i.id}` } }) : ''}</div>
  ${i.match ? checksHtml(i.match.checks) : '<div class="empty-state">Matching has not been run on this invoice.</div>'}
  ${adj.length ? `<div class="sec-title">Credit / debit notes</div><div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Type</th><th class="right">Amount</th><th>Reason</th><th>By</th><th>Date</th></tr></thead><tbody>${adj.map(a => `<tr><td>${sb(a.type === 'Credit' ? 'Accepted' : 'Pending')} ${a.type}</td><td class="num">${fmtNum(a.amount)}</td><td>${esc(a.reason)}</td><td>${esc(a.by)}</td><td>${fmtDT(a.at)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  <div class="grid-2" style="align-items:start"><div><div class="sec-title">Approval &amp; status history</div><ul class="tl">${[...i.history].reverse().map(h => `<li class="${['Approved', 'Paid', 'Posted'].includes(h.to) ? 'ok' : ['Rejected', 'Matching Failed', 'Cancelled'].includes(h.to) ? 'bad' : ''}"><div class="tt">${esc(h.from)} → ${esc(h.to)}</div><div class="tm">${esc(h.by)} · ${fmtDT(h.at)}${h.note ? ' — ' + esc(h.note) : ''}</div></li>`).join('') || '<li><div class="tm">No history.</div></li>'}</ul></div>
  <div><div class="sec-title">Allocation &amp; reversal audit</div><ul class="tl">${db.audit.filter(a => a.ref === invRef(i)).map(a => `<li class="${a.kind === 'ok' ? 'ok' : a.kind === 'bad' ? 'bad' : a.kind === 'alloc' ? 'amber' : ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.by)} · ${fmtDT(a.at)}</div></li>`).join('') || '<li><div class="tm">No events.</div></li>'}</ul></div></div></div></div>`;
}
const checksHtml = checks => `<div class="checks">${checks.map(c => `<div class="check ${c.status}"><div class="ci">${icon(c.status === 'pass' ? 'check' : c.status === 'warn' ? 'alert' : c.status === 'fail' ? 'x' : 'info', 11, 3)}</div><div class="cl">${esc(c.label)}</div><div class="cd">${esc(c.detail)}</div></div>`).join('')}</div>`;
ACT['inv-submit-existing'] = el => { const i = getInv(el.dataset.id); done(A.saveInvoice({ ...i, vatManual: i.vat, attachments: i.attachments, autoMatch: true }, 'submit')); };
ACT['inv-match'] = el => done(A.runMatching(el.dataset.id));
ACT['inv-approve'] = el => reasonModal({ title: 'Approve invoice', label: 'Approval note (optional)', btn: 'Approve', danger: false, ph: 'Optional', optional: true, onSubmit: note => { done(A.approveInvoice(el.dataset.id, note)); } });
ACT['inv-reject'] = el => reasonModal({ title: 'Reject invoice', label: 'Rejection reason', btn: 'Reject invoice', extra: '<p class="hint" style="margin-top:0">Rejecting releases this invoice\'s reservations so the receipts / milestones can be invoiced again.</p>', onSubmit: reason => { done(A.rejectInvoice(el.dataset.id, reason)); } });
ACT['inv-cancel'] = el => confirmBox({ title: 'Cancel invoice', message: `Cancel <b>${esc(invRef(getInv(el.dataset.id)))}</b>? Its reserved allocations are released.`, confirmLabel: 'Cancel invoice', danger: true, onConfirm: () => done(A.cancelInvoice(el.dataset.id, 'Cancelled by user')) });
ACT['inv-post'] = el => confirmBox({ title: 'Post to AP', message: 'Simulate posting this approved invoice to Accounts Payable? <b>No real accounting entry is created.</b>', confirmLabel: 'Post (simulated)', onConfirm: () => done(A.postInvoice(el.dataset.id)) });
ACT['inv-pay'] = el => confirmBox({ title: 'Mark as paid', message: 'Mark as paid for demo purposes? <b>No bank payment is made.</b>', confirmLabel: 'Mark paid (demo)', onConfirm: () => done(A.payInvoice(el.dataset.id)) });
ACT['inv-adjust'] = el => { const i = getInv(el.dataset.id); openModal({ title: `Credit / debit note — ${invRef(i)}`, submitLabel: 'Record note', html: `<p class="hint" style="margin-top:0">Payable now: <b>${money(payable(i))}</b>. Adjustments are separate records — receipt quantities and milestone balances are <b>not</b> restored automatically.</p>${fld('Type', 'type', { opts: ['Credit', 'Debit'] })}${fld('Amount (AED, incl. VAT)', 'amount', { type: 'number', step: 'any', req: true })}${fld('Reason', 'reason', { rows: 2, req: true })}`, onSubmit: v => { const r = A.addAdjustment(i.id, { type: v.type, amount: +v.amount, reason: v.reason }); if (!r.ok) { toast(r.msg, 'err'); return false; } toast(r.msg); render(); } }); };

/* ================================================================ matching */
const matchState = i => i.match ? (i.match.result === 'Blocked' ? 'Blocked' : i.status === 'Pending Approval' ? 'Pending Approval' : i.match.result) : 'Not run';
ROUTES.matching = r => {
  if (r.parts[1]) return matchingDetail(r.parts[1]);
  return `<div>${pageHead({ title: 'Invoice Matching', crumbs: [['Invoice Matching']] })}<div class="content">
  ${alertBox('info', '', 'The matching engine validates PO, supplier, receipt/milestone eligibility, quantity/value, duplicates, PO balance and VAT — using the PO’s billing method as the baseline. Open an invoice to see exactly why it passed or failed.')}
  ${listHtml('matching', {
    searchPh: 'Search invoice, PO…',
    filters: [{ name: 'state', label: 'Result', options: () => ['Matched', 'Partially Matched', 'Blocked', 'Pending Approval', 'Not run'] }, { name: 'method', label: 'Billing method', options: () => ['Standard', 'Progressive', 'Milestone'] }],
    rows: () => db.invoices.filter(i => i.status !== 'Draft' && i.status !== 'Cancelled').sort((a, b) => b.seq - a.seq),
    match: (i, st) => matchText(st, invRef(i), i.number, getPO(i.poId).number) && matchIn(st, 'method', i.method) && (!st.state || (st.state === 'Pending Approval' ? i.status === 'Pending Approval' : st.state === 'Not run' ? !i.match : st.state === 'Blocked' ? matchState(i) === 'Blocked' : i.match && i.match.result === st.state)),
    cols: ['Invoice', 'Supplier inv. no.', 'PO', 'Method', '>Net', 'Matching result', 'Exceptions', 'Approval', ''],
    row: i => `<tr class="click" data-act="go" data-hash="#/matching/${i.id}"><td class="strong">${invRef(i)}</td><td>${esc(i.number)}</td><td>${esc(getPO(i.poId).number)}</td><td>${mb(i.method)}</td><td class="num">${fmtNum(i.net)}</td><td>${i.match ? sb(i.match.result) : sb('Not run')} ${i.status === 'Pending Approval' ? sb('Pending Approval') : ''}</td><td>${i.match ? esc(i.match.checks.filter(c => c.status === 'fail').map(c => c.label).join(', ') || '—') : '—'}</td><td>${sb(approvalStatus(i))}</td><td class="act">${icon('chevRight', 12)}</td></tr>`,
  })}</div></div>`;
};
const FIX = { po: 'Approve the PO before invoicing.', supplier: 'Create the invoice against the PO of the invoicing supplier.', elig: 'Make sure the receipt / milestone is accepted (and any required SRN accepted), not fully allocated, then re-run matching.', qty: 'Reduce the invoiced quantity/value to the eligible remaining balance shown, or wait for further receipts / milestone approval.', dup: 'Use a different supplier invoice number, or cancel the earlier invoice if it was submitted in error.', bal: 'Reduce the amount to the remaining PO balance or raise a PO amendment.', vat: 'Correct the VAT amount (5% of net) on the invoice and re-submit.' };
function matchingDetail(id) {
  const i = getInv(id); if (!i) return notFound('Invoice');
  const po = getPO(i.poId), m = i.match, st = matchState(i);
  const fails = m ? m.checks.filter(c => c.status === 'fail') : [];
  const acts = [];
  if (['Submitted', 'Pending Matching', 'Matching Failed', 'Pending Approval'].includes(i.status)) acts.push(gbtn('inv.match', 'inv-match', m ? 'Re-run matching' : 'Run matching', { cls: 'btn-primary', data: { id: i.id }, icn: 'play' }));
  if (i.status === 'Pending Approval') acts.push(gbtn('inv.approve', 'inv-reject', 'Reject', { cls: 'btn-danger-soft', data: { id: i.id } }), gbtn('inv.approve', 'inv-approve', 'Approve', { cls: 'btn-primary', data: { id: i.id }, icn: 'check' }));
  acts.push(actBtn('go', 'Open invoice', { data: { hash: `#/invoice/${i.id}` } }));
  const bc = st === 'Blocked' ? 'red' : st === 'Partially Matched' ? 'amber' : st === 'Not run' ? 'gray' : st === 'Pending Approval' ? 'amber' : 'green';
  return `<div>${pageHead({ title: `Matching — ${invRef(i)}`, sub: sb(st), crumbs: [['Invoice Matching', '#/matching'], [invRef(i)]], right: acts.join('') })}
  <div class="content"><div class="status-banner ${bc}"><div><div class="t">${st === 'Blocked' ? 'Blocked — exceptions must be resolved' : st === 'Pending Approval' ? 'Matched — pending approval' : st === 'Not run' ? 'Matching not run' : st}</div><div class="d">${m ? `Last run ${fmtDT(m.at)} by ${esc(m.by)}` : 'Run matching to validate this invoice.'} · Invoice status: ${esc(i.status)}</div></div></div>
  ${strip([['Invoice', invRef(i), esc(i.number)], ['PO', esc(po.number), methodLabel(po)], ['Net', money(i.net)], ['VAT', money(i.vat)], ['Gross', money(i.gross)]])}
  <div class="sec-title">Checks</div>${m ? checksHtml(m.checks) : '<div class="empty-state">No results yet.</div>'}
  ${fails.length ? `<div class="sec-title">Exceptions &amp; how to resolve</div>${fails.map(c => alertBox('err', c.label, `${esc(c.detail)}<div style="margin-top:4px"><b>Action:</b> ${esc(FIX[c.key] || '')}</div>`)).join('')}` : ''}
  <div class="sec-title">Allocations tested</div><div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Source</th><th class="right">Qty</th><th class="right">Value</th><th class="right">Eligible remaining now</th></tr></thead><tbody>${i.allocs.map(a => { const it = sourceItems(po, i.id).find(x => x.kind === a.kind && x.refId === a.refId); return `<tr><td class="strong">${esc(allocRefLabel(a))}</td><td class="num">${a.qty != null ? fmtNum(a.qty) : '—'}</td><td class="num">${fmtNum(a.value)}</td><td class="num">${it ? (a.kind === 'grn' ? `${fmtNum(it.availQty)} u / ${fmtNum(it.availValue)}` : fmtNum(it.availValue)) : '—'}</td></tr>`; }).join('') || emptyRow(4, 'Standard billing — tested at PO level.')}</tbody></table></div></div></div>`;
}

/* ================================================================ approvals */
ROUTES.approvals = r => {
  const tabs = [['invoices', 'Invoices', db.invoices.filter(i => i.status === 'Pending Approval')], ['pos', 'Purchase Orders', db.pos.filter(p => p.status === 'Pending Approval')],
    ['receipts', 'Receipts (GRN / SRN)', [...db.grns.filter(g => ['Submitted', 'Pending Inspection'].includes(g.status)).map(g => ({ t: 'grn', x: g })), ...db.srns.filter(s => s.status === 'Pending Acceptance').map(s => ({ t: 'srn', x: s }))]],
    ['milestones', 'Milestones', db.milestones.filter(m => m.status === 'Submitted for Acceptance')], ['claims', 'Progress Claims', db.claims.filter(c => c.status === 'Submitted')]];
  const tab = r.q.tab || (tabs.find(t => t[2].length) || tabs[0])[0], cur = tabs.find(t => t[0] === tab) || tabs[0];
  const body = { invoices: () => `<table class="grid compact"><thead><tr><th>Invoice</th><th>Supplier inv. no.</th><th>PO</th><th>Method</th><th class="right">Net</th><th class="right">Gross</th><th>Matching</th><th></th></tr></thead><tbody>${cur[2].map(i => `<tr><td>${invLink(i)}</td><td>${esc(i.number)}</td><td>${esc(getPO(i.poId).number)}</td><td>${mb(i.method)}</td><td class="num">${fmtNum(i.net)}</td><td class="num">${fmtNum(i.gross)}</td><td>${matchBadge(i)}</td><td class="act">${actBtn('go', 'Review', { data: { hash: `#/matching/${i.id}` } })} ${gbtn('inv.approve', 'inv-reject', 'Reject', { cls: 'btn-danger-soft btn-sm', data: { id: i.id } })} ${gbtn('inv.approve', 'inv-approve', 'Approve', { cls: 'btn-primary btn-sm', data: { id: i.id } })}</td></tr>`).join('') || emptyRow(8, 'No invoices pending approval.')}</tbody></table>`,
    pos: () => `<table class="grid compact"><thead><tr><th>PO</th><th>Supplier</th><th>Method</th><th class="right">Value</th><th></th></tr></thead><tbody>${cur[2].map(p => `<tr><td>${poLink(p)}</td><td>${esc(getSup(p.supplierId).name)}</td><td>${poMethodBadge(p)}</td><td class="num">${fmtNum(poNet(p))}</td><td class="act">${actBtn('go', 'Open', { data: { hash: `#/po/${p.id}` } })} ${gbtn('po.approve', 'po-reject', 'Reject', { cls: 'btn-danger-soft btn-sm', data: { id: p.id } })} ${gbtn('po.approve', 'po-approve', 'Approve', { cls: 'btn-primary btn-sm', data: { id: p.id } })}</td></tr>`).join('') || emptyRow(5, 'No POs pending approval.')}</tbody></table>`,
    receipts: () => `<table class="grid compact"><thead><tr><th>Receipt</th><th>PO</th><th>Type</th><th class="right">Received / value</th><th>Status</th><th></th></tr></thead><tbody>${cur[2].map(({ t, x }) => t === 'grn' ? `<tr><td>${link(`#/grn/${x.id}`, x.number)}</td><td>${esc(getPO(x.poId).number)}</td><td>GRN</td><td class="num">${fmtNum(x.received)} units</td><td>${sb(x.status)}</td><td class="act">${actBtn('go', 'Open', { data: { hash: `#/grn/${x.id}` } })} ${gbtn('grn.decide', 'grn-reject', 'Reject', { cls: 'btn-danger-soft btn-sm', data: { id: x.id } })} ${gbtn('grn.decide', 'grn-accept', 'Accept', { cls: 'btn-primary btn-sm', data: { id: x.id }, dis: grnPending(x) > EPS, title: grnPending(x) > EPS ? 'Pending inspection quantity — open the GRN to record inspection' : '' })}</td></tr>`
      : `<tr><td>${link(`#/srn/${x.id}`, x.number)}</td><td>${esc(getPO(x.poId).number)}</td><td>SRN</td><td class="num">${money(x.serviceValue)}</td><td>${sb(x.status)}</td><td class="act">${actBtn('go', 'Open', { data: { hash: `#/srn/${x.id}` } })} ${gbtn('srn.decide', 'srn-reject', 'Reject', { cls: 'btn-danger-soft btn-sm', data: { id: x.id } })} ${gbtn('srn.decide', 'srn-accept', 'Accept', { cls: 'btn-primary btn-sm', data: { id: x.id } })}</td></tr>`).join('') || emptyRow(6, 'No receipts awaiting acceptance.')}</tbody></table>`,
    milestones: () => `<table class="grid compact"><thead><tr><th>PO</th><th>Milestone</th><th class="right">Amount</th><th>Evidence</th><th>SRN gate</th><th></th></tr></thead><tbody>${cur[2].map(m => { const po = getPO(m.poId), g = msGate(m, po); return `<tr><td>${esc(po.number)}</td><td>${link(`#/milestone/${m.id}`, msFull(m))}</td><td class="num">${fmtNum(m.amount)}</td><td>${attachChips(m.evidence) || '—'}</td><td>${m.srnRequired ? (g.ok ? 'SRN accepted' : `<span class="warn-t">${esc(g.reason)}</span>`) : '—'}</td><td class="act">${actBtn('go', 'Open', { data: { hash: `#/milestone/${m.id}` } })} ${gbtn('ms.decide', 'ms-reject', 'Reject', { cls: 'btn-danger-soft btn-sm', data: { id: m.id } })} ${gbtn('ms.decide', 'ms-approve', 'Approve', { cls: 'btn-primary btn-sm', data: { id: m.id } })}</td></tr>`; }).join('') || emptyRow(6, 'No milestones awaiting approval.')}</tbody></table>`,
    claims: () => `<table class="grid compact"><thead><tr><th>Claim</th><th>PO</th><th>Period</th><th class="right">Current claim</th><th class="right">Cumulative</th><th></th></tr></thead><tbody>${cur[2].map(c => { const v = claimView(c); return `<tr><td>${c.number}</td><td>${esc(getPO(c.poId).number)}</td><td>${esc(c.period)}</td><td class="num">${fmtNum(v.current)}</td><td class="num">${fmtNum(v.cum)}</td><td class="act">${actBtn('claim-drawer', 'Review', { data: { id: c.id } })} ${gbtn('claim.decide', 'claim-certify', 'Certify', { cls: 'btn-primary btn-sm', data: { id: c.id } })}</td></tr>`; }).join('') || emptyRow(6, 'No claims awaiting certification.')}</tbody></table>` }[cur[0]];
  return `<div>${pageHead({ title: 'Approvals', crumbs: [['Approvals']] })}<div class="content"><div class="pill-tabs">${tabs.map(([k, l, a]) => `<button class="${k === cur[0] ? 'on' : ''}" data-act="go" data-hash="#/approvals?tab=${k}">${l}<span class="n">${a.length}</span></button>`).join('')}</div>
  <div class="tbl-wrap" style="margin-top:10px">${body()}</div></div></div>`;
};

/* ================================================================ AP register */
ROUTES.ap = () => {
  const rows = () => db.invoices.filter(i => APPROVED.includes(i.status)).sort((a, b) => b.seq - a.seq);
  const all = rows(), tot = f => sum(all.filter(f), i => payable(i));
  return `<div>${pageHead({ title: 'Accounts Payable — Invoice Register', crumbs: [['Accounts Payable']] })}<div class="content">
  ${alertBox('warn', 'Simulation only', 'Posting and payment are simulated for the demo. No ERP posting, bank payment or supplier notification is executed.')}
  ${strip([['Approved — not posted', money(tot(i => i.status === 'Approved')), `${all.filter(i => i.status === 'Approved').length} invoice(s)`], ['Posted — awaiting payment', money(tot(i => i.status === 'Posted')), `${all.filter(i => i.status === 'Posted').length} invoice(s)`], ['Paid (demo)', money(tot(i => i.status === 'Paid')), `${all.filter(i => i.status === 'Paid').length} invoice(s)`], ['Total payable', money(tot(() => true))]])}
  ${listHtml('ap', {
    searchPh: 'Search invoice, supplier, PO…',
    filters: [{ name: 'status', label: 'Payment', options: () => [['Approved', 'Not posted'], ['Posted', 'Awaiting payment'], ['Paid', 'Paid']] }, { name: 'method', label: 'Billing method', options: () => ['Standard', 'Progressive', 'Milestone'] }, { name: 'supplier', label: 'Supplier', options: () => supOpts() }],
    rows, match: (i, st) => matchText(st, invRef(i), i.number, getPO(i.poId).number, getSup(i.supplierId).name) && matchIn(st, 'status', i.status) && matchIn(st, 'method', i.method) && matchIn(st, 'supplier', i.supplierId),
    cols: ['Invoice', 'Supplier inv. no.', 'PO', 'Method', 'Supplier', '>Net', '>VAT', '>Gross', '>Payable', 'Matching', 'Approval', 'Payment', ''],
    row: i => `<tr><td class="strong">${invLink(i)}</td><td>${esc(i.number)}</td><td>${esc(getPO(i.poId).number)}</td><td>${mb(i.method)}</td><td>${esc(getSup(i.supplierId).name)}</td><td class="num">${fmtNum(i.net)}</td><td class="num">${fmtNum(i.vat)}</td><td class="num">${fmtNum(i.gross)}</td><td class="num strong">${fmtNum(payable(i))}</td><td>${matchBadge(i)}</td><td>${sb(approvalStatus(i))}</td><td>${sb(paymentStatus(i))}</td><td class="act">${i.status === 'Approved' ? gbtn('inv.post', 'inv-post', 'Post to AP', { cls: 'btn-primary btn-xs', data: { id: i.id } }) : i.status === 'Posted' ? gbtn('inv.post', 'inv-pay', 'Mark paid', { cls: 'btn-primary btn-xs', data: { id: i.id } }) : ''}</td></tr>`,
    empty: 'No approved invoices yet. Approve an invoice to see it here.',
  })}</div></div>`;
};
