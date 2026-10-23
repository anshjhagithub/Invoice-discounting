/* =====================================================================
   screens-receipts.js — GRN and SRN: list, create, detail
   ===================================================================== */
const approvedPOs = filter => db.pos.filter(p => p.status === 'Approved' && (!filter || filter(p)));
const poOptLabel = p => `${p.number} — ${getSup(p.supplierId).name} (${p.billingMethod})`;

/* ================================================================ GRN */
ROUTES.grns = () => `<div>${pageHead({ title: 'Goods Receipts (GRN)', crumbs: [['Goods Receipts']], right: gbtn('grn.create', 'go', 'Create GRN', { cls: 'btn-primary', icn: 'plus', data: { hash: '#/grn/new' } }) })}
  <div class="content">${listHtml('grns', {
    pills: { name: 'status', values: ["Draft","Submitted","Pending Inspection","Accepted","Partially Accepted","Rejected"], get: g => g.status },
    searchPh: 'Search GRN, PO, supplier…',
    filters: [{ name: 'status', label: 'Status', options: () => ['Draft', 'Submitted', 'Pending Inspection', 'Accepted', 'Partially Accepted', 'Rejected'] }, { name: 'po', label: 'PO', options: () => db.pos.filter(p => grnsOf(p).length || p.lines.some(l => l.receiptType === 'Goods')).map(p => [p.id, p.number]) }],
    rows: () => db.grns.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq),
    match: (g, st) => { const po = getPO(g.poId); return matchText(st, g.number, po.number, getSup(po.supplierId).name) && matchIn(st, 'status', g.status) && matchIn(st, 'po', g.poId); },
    cols: ['GRN', 'PO', 'Supplier', 'Receipt date', '>Received', '>Accepted', '>Rejected', '>Pending', '>Invoiced qty', 'Status'],
    row: g => { const po = getPO(g.poId); return `<tr class="click" data-act="go" data-hash="#/grn/${g.id}"><td class="strong">${g.number}</td><td>${esc(po.number)}</td><td>${esc(getSup(po.supplierId).name)}</td><td class="nowrap">${fmtD(g.date)}</td><td class="num">${fmtNum(g.received)}</td><td class="num">${fmtNum(g.accepted)}</td><td class="num">${fmtNum(g.rejected)}</td><td class="num">${fmtNum(['Submitted', 'Pending Inspection'].includes(g.status) ? grnPending(g) : 0)}</td><td class="num">${fmtNum(usage('grn', g.id).qty)}</td><td>${sb(g.reversed ? 'Reversed' : g.status)}</td></tr>`; },
  })}</div></div>`;

function grnInit(q) {
  const po = q.po && getPO(q.po), ok = po && po.status === 'Approved' && po.lines.some(l => l.receiptType === 'Goods');
  const line = ok && po.lines.find(l => l.receiptType === 'Goods');
  return { poId: ok ? po.id : '', lineId: ok ? line.id : '', date: todayISO(), location: ok ? line.location : LOCATIONS[0], received: '', accepted: '', rejected: 0, inspection: 'Passed', remarks: '', attachments: [] };
}
ROUTES.grn = r => {
  const id = r.parts[1];
  if (id === 'new') return grnForm(r);
  const g = getGRN(id); if (!g) return notFound('Goods receipt');
  return grnDetail(g);
};
HOOKS.grnpo = () => { const f = ui.f, po = getPO(f.poId); const l = po && po.lines.find(x => x.receiptType === 'Goods'); f.lineId = l ? l.id : ''; f.location = l ? l.location : LOCATIONS[0]; };
function grnForm(r) {
  if (!ui.f || ui.fKey !== 'grn-new') { ui.f = grnInit(r.q); ui.fKey = 'grn-new'; }
  const f = ui.f, po = getPO(f.poId), pos = approvedPOs(p => p.lines.some(l => l.receiptType === 'Goods'));
  ui.derive = grnDerive;
  const lines = po ? po.lines.filter(l => l.receiptType === 'Goods') : [];
  return `<div>${pageHead({ title: 'Create Goods Receipt', crumbs: [['Goods Receipts', '#/grns'], ['New GRN']] })}
  <div class="content">
    <div class="card" style="margin-top:16px"><h3>Step 1 · Select purchase order</h3>
      <div class="fgrid c2"><div class="field"><label>Approved goods PO *</label><select class="input" data-f="poId" data-hook="grnpo" data-r><option value="">— Select a PO —</option>${opt(pos.map(p => [p.id, poOptLabel(p)]), f.poId)}</select><div class="fhint">Only approved POs with goods lines are listed.</div></div>
      ${po ? `<div class="field"><label>Supplier</label><div class="ro">${esc(getSup(po.supplierId).name)} · ${getSup(po.supplierId).code}</div></div>` : ''}</div>
      ${po ? `<div class="tbl-wrap" style="margin-top:12px"><table class="grid compact"><thead><tr><th>Line</th><th class="right">Ordered</th><th class="right">Previously received</th><th class="right">Previously accepted</th><th class="right">Pending inspection</th><th class="right">Remaining qty</th></tr></thead><tbody>${lines.map(l => { const st = lineReceiptStats(po, l); return `<tr class="${l.id === f.lineId ? 'sel' : ''}"><td>${l.no}. ${esc(l.desc)}</td><td class="num">${fmtNum(st.ordered)} ${l.uom}</td><td class="num">${fmtNum(st.receivedQty)}</td><td class="num">${fmtNum(st.acceptedQty)}</td><td class="num">${fmtNum(st.pendingQty)}</td><td class="num strong">${fmtNum(st.remaining)}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="hint" style="margin-top:6px">Existing receipts: ${grnsOf(po).map(g => `${g.number} (${g.status})`).join(', ') || 'none'}</div>` : ''}
    </div>
    ${po ? `<div class="card" style="margin-top:12px"><h3>Step 2 · Receipt details</h3><div class="fgrid">
      <div class="field"><label>GRN number</label><div class="ro">GRN-${pad(db.grns.filter(g => g.poId === po.id).length + 1)} <span class="hint">&nbsp;(auto-generated)</span></div></div>
      <div class="field"><label>PO number</label><div class="ro">${esc(po.number)}</div></div>
      <div class="field"><label>Supplier</label><div class="ro">${esc(getSup(po.supplierId).name)}</div></div>
      <div class="field"><label>Receipt date *</label><input class="input" type="date" data-f="date" value="${esc(f.date)}"></div>
      <div class="field"><label>Warehouse / location *</label><select class="input" data-f="location">${opt(LOCATIONS, f.location)}</select></div>
      <div class="field"><label>PO line *</label><select class="input" data-f="lineId" data-r>${opt(lines.map(l => [l.id, `${l.no}. ${l.desc}`]), f.lineId)}</select></div>
      <div class="field"><label>Ordered quantity</label><div class="ro" id="g-ord"></div></div>
      <div class="field"><label>Previously received</label><div class="ro" id="g-prev"></div></div>
      <div class="field"><label>Previously accepted</label><div class="ro" id="g-prevacc"></div></div>
      <div class="field"><label>Current received quantity *</label><input class="input num" type="number" min="0" step="any" data-t="num" data-f="received" value="${f.received}" placeholder="0"></div>
      <div class="field"><label>Accepted quantity</label><input class="input num" type="number" min="0" step="any" data-t="num" data-f="accepted" value="${f.accepted}" placeholder="0"><div class="fhint"><button type="button" class="link" data-act="grn-all">Accept all received</button></div></div>
      <div class="field"><label>Rejected quantity</label><input class="input num" type="number" min="0" step="any" data-t="num" data-f="rejected" value="${f.rejected}"></div>
      <div class="field"><label>Inspection status</label><select class="input" data-f="inspection">${opt(['Passed', 'Partially Passed', 'Pending', 'Failed', 'Not Required'], f.inspection)}</select></div>
      <div class="field span2"><label>Receiver remarks</label><input class="input" data-f="remarks" value="${esc(f.remarks)}" placeholder="Condition of goods, delivery note no., etc."></div>
      <div class="field span3"><label>Attachments (mock upload)</label>${attachBox('attachments', f.attachments, 'Attach delivery note / photos')}</div>
    </div><div id="grn-val" style="margin-top:12px"></div></div>
    <div class="form-actions">${actBtn('go', 'Cancel', { cls: 'btn-ghost', data: { hash: '#/grns' } })}<span class="spacer"></span>${gbtn('grn.create', 'grn-save', 'Save as Draft', { cls: 'btn-outline', data: { m: 'draft' } })}${gbtn('grn.create', 'grn-save', 'Submit', { cls: 'btn-outline', data: { m: 'submit' } })}${gbtn('grn.decide', 'grn-save', 'Submit & Accept', { cls: 'btn-primary', data: { m: 'accept' }, icn: 'check' })}</div>` : `<div class="empty-state">Select an approved goods PO to continue.</div>`}
  </div></div>`;
}
const grnNum = f => ({ ...f, received: +f.received || 0, accepted: +f.accepted || 0, rejected: +f.rejected || 0 });
function grnDerive() {
  const f = ui.f, po = getPO(f.poId); if (!po || !$('#grn-val')) return;
  const l = lineOf(po, f.lineId), st = lineReceiptStats(po, l), n = grnNum(f);
  $('#g-ord').textContent = `${fmtNum(st.ordered)} ${l.uom}`; $('#g-prev').textContent = `${fmtNum(st.receivedQty)} ${l.uom}`; $('#g-prevacc').textContent = `${fmtNum(st.acceptedQty)} ${l.uom}`;
  const errs = validateGRN(n), pend = r2(n.received - n.accepted - n.rejected);
  $('#grn-val').innerHTML = (errs.length ? alertBox('err', 'Cannot submit yet', errList(errs)) : '') +
    (n.received > 0 && !errs.length ? alertBox(pend > EPS ? 'warn' : 'ok', pend > EPS ? 'Pending inspection' : 'Quantities reconcile', pend > EPS ? `${fmtNum(pend)} ${l.uom} are neither accepted nor rejected. Pending-inspection quantity is <b>not invoice-eligible</b>; the GRN will wait in “Pending Inspection”.` : `${fmtNum(n.accepted)} ${l.uom} (${money(n.accepted * l.price)}) become invoice-eligible once accepted; ${fmtNum(n.rejected)} rejected are never invoice-eligible. Remaining PO quantity after this receipt: ${fmtNum(r2(st.remaining - n.received))}.`) : '');
}
ACT['grn-all'] = () => { const f = ui.f; f.accepted = +f.received || 0; f.rejected = 0; render(); };
ACT['grn-save'] = el => { const m = el.dataset.m; done(A.createGRN(grnNum(ui.f), m), r => { ui.f = null; go(`#/grn/${r.id}`); }); };

function grnDetail(g) {
  const po = getPO(g.poId), line = lineOf(po, g.lineId), u = usage('grn', g.id), ent = grnEnt(g), pend = ['Submitted', 'Pending Inspection'].includes(g.status) ? grnPending(g) : 0;
  const acts = [];
  if (g.status === 'Draft') acts.push(gbtn('grn.create', 'grn-submit', 'Submit GRN', { cls: 'btn-primary', data: { id: g.id } }));
  if (['Submitted', 'Pending Inspection'].includes(g.status)) acts.push(gbtn('grn.decide', 'grn-reject', 'Reject', { cls: 'btn-danger-soft', data: { id: g.id } }), gbtn('grn.decide', 'grn-inspect', 'Record inspection', { data: { id: g.id } }), gbtn('grn.decide', 'grn-accept', 'Accept GRN', { cls: 'btn-primary', data: { id: g.id }, icn: 'check', dis: pend > EPS, title: pend > EPS ? 'Record the inspection result for pending units first' : '' }));
  if (GRN_OK.includes(g.status) && !g.reversed) acts.push(gbtn('grn.decide', 'grn-reverse', 'Reverse GRN', { cls: 'btn-danger-soft', data: { id: g.id } }));
  const bn = g.reversed ? ['red', 'Reversed', `Entitlement withdrawn: ${g.reverseReason}. Historical record preserved; invoices relying on this receipt must be re-matched.`] : { Draft: ['gray', 'Draft', 'Not yet submitted.'], Submitted: ['blue', 'Submitted — awaiting acceptance', 'Quantities are not invoice-eligible until the GRN is accepted.'], 'Pending Inspection': ['amber', 'Pending inspection', `${fmtNum(grnPending(g))} unit(s) not yet inspected — not invoice-eligible.`], Accepted: ['green', 'Accepted', `${fmtNum(g.accepted)} units are invoice-eligible.`], 'Partially Accepted': ['green', 'Partially accepted', `${fmtNum(g.accepted)} accepted (eligible), ${fmtNum(g.rejected)} rejected (never eligible).`], Rejected: ['red', 'Rejected', 'No quantity is invoice-eligible.'] }[g.status];
  return `<div>${pageHead({ title: g.number, sub: sb(g.reversed ? 'Reversed' : g.status), crumbs: [['Goods Receipts', '#/grns'], [g.number]], right: acts.join('') })}
  <div class="content"><div class="status-banner ${bn[0]}"><div><div class="t">${bn[1]}</div><div class="d">${esc(bn[2])}</div></div></div>
  ${strip([['Received', fmtNum(g.received) + ' ' + line.uom, money(g.received * line.price)], ['Accepted', fmtNum(g.accepted) + ' ' + line.uom, money(g.accepted * line.price)], ['Rejected', fmtNum(g.rejected) + ' ' + line.uom, 'not invoice-eligible'], ['Pending inspection', fmtNum(pend)], ['Invoice-eligible now', fmtNum(ent) + ' ' + line.uom, 'accepted entitlement'], ['Allocated to invoices', fmtNum(u.qty), `reserved ${fmtNum(u.reservedQty)} · committed ${fmtNum(u.committedQty)}`], ['Remaining eligible', fmtNum(Math.max(0, r2(ent - u.qty))), money(Math.max(0, r2(ent - u.qty)) * line.price), 'hl']])}
  <div class="sec-title">Receipt details</div><div class="card flat"><div class="kvg">${kv('PO', poLink(po))}${kv('Supplier', esc(getSup(po.supplierId).name))}${kv('PO line', `${line.no}. ${esc(line.desc)}`)}${kv('Receipt date', fmtD(g.date))}${kv('Warehouse / location', esc(g.location))}${kv('Inspection status', esc(g.inspection))}${kv('Created by', esc(g.createdBy))}${kv('Billing method of PO', poMethodBadge(po))}${kv('Remarks', esc(g.remarks) || '—')}${kv('Attachments', attachChips(g.attachments) || '—')}</div></div>
  <div class="sec-title">Invoice allocations against this receipt</div>
  <div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Invoice</th><th>Supplier inv. no.</th><th class="right">Qty</th><th class="right">Value</th><th>Invoice status</th><th>State</th></tr></thead><tbody>${allocsOn('grn', g.id).map(({ inv, a }) => `<tr><td>${invLink(inv)}</td><td>${esc(inv.number)}</td><td class="num">${fmtNum(a.qty)}</td><td class="num">${fmtNum(a.value)}</td><td>${sb(inv.status)}</td><td>${sb(APPROVED.includes(inv.status) ? 'Committed' : 'Reserved')}</td></tr>`).join('') || emptyRow(6, po.billingMethod === 'Standard' ? 'Standard billing matches at PO level — no per-receipt allocation.' : 'No invoice has consumed this receipt yet.')}</tbody></table></div>
  <div class="sec-title">History</div><ul class="tl">${db.audit.filter(a => a.ref === g.number && a.poId === po.id).map(a => `<li class="${a.kind === 'ok' ? 'ok' : a.kind === 'bad' ? 'bad' : ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.by)} · ${fmtDT(a.at)}</div></li>`).join('') || '<li><div class="tm">No history.</div></li>'}</ul></div></div>`;
}
ACT['grn-submit'] = el => done(A.submitGRN(el.dataset.id));
ACT['grn-accept'] = el => confirmBox({ title: 'Accept GRN', message: `Accept <b>${esc(getGRN(el.dataset.id).number)}</b>? The accepted quantity becomes invoice-eligible and the PO's eligible receipt balance is updated.`, confirmLabel: 'Accept', onConfirm: () => done(A.acceptGRN(el.dataset.id)) });
ACT['grn-reject'] = el => reasonModal({ title: 'Reject GRN', label: 'Rejection reason', btn: 'Reject GRN', onSubmit: reason => { done(A.rejectGRN(el.dataset.id, reason)); } });
ACT['grn-reverse'] = el => reasonModal({ title: 'Reverse GRN', label: 'Reversal / correction reason', btn: 'Reverse GRN', ph: 'e.g. Goods returned, incorrect quantity booked', extra: `<p class="hint" style="margin-top:0">Reversing withdraws the invoice entitlement of this receipt. The record is kept for audit; in-flight invoices relying on it fail re-matching, and new invoices are blocked.</p>`, onSubmit: reason => { done(A.reverseGRN(el.dataset.id, reason)); } });
ACT['grn-inspect'] = el => { const g = getGRN(el.dataset.id); openModal({ title: `Record inspection — ${g.number}`, submitLabel: 'Save result', html: `<p class="hint" style="margin-top:0">Received: <b>${fmtNum(g.received)}</b>. Accepted + rejected must not exceed received; any difference stays pending and is not invoice-eligible.</p>${fld('Accepted quantity', 'acc', { type: 'number', value: g.accepted, step: 'any' })}${fld('Rejected quantity', 'rej', { type: 'number', value: g.rejected, step: 'any' })}`, onSubmit: v => { const r = A.recordInspection(g.id, v.acc, v.rej); if (!r.ok) { toast(r.msg, 'err'); return false; } toast(r.msg); render(); } }); };

/* ================================================================ SRN */
ROUTES.srns = () => `<div>${pageHead({ title: 'Service Receipts (SRN)', crumbs: [['Service Receipts']], right: gbtn('srn.create', 'go', 'Create SRN', { cls: 'btn-primary', icn: 'plus', data: { hash: '#/srn/new' } }) })}
  <div class="content">${listHtml('srns', {
    pills: { name: 'status', values: ["Draft","Pending Acceptance","Accepted","Partially Accepted","Rejected"], get: s => s.status },
    searchPh: 'Search SRN, PO, supplier…',
    filters: [{ name: 'status', label: 'Status', options: () => ['Draft', 'Pending Acceptance', 'Accepted', 'Partially Accepted', 'Rejected'] }, { name: 'po', label: 'PO', options: () => db.pos.filter(p => p.lines.some(l => l.receiptType === 'Services')).map(p => [p.id, p.number]) }],
    rows: () => db.srns.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq),
    match: (s, st) => { const po = getPO(s.poId); return matchText(st, s.number, po.number, s.description, getSup(po.supplierId).name) && matchIn(st, 'status', s.status) && matchIn(st, 'po', s.poId); },
    cols: ['SRN', 'PO', 'Supplier', 'Date', 'Description', 'Milestone', '>Service value', '>Accepted value', '>Invoiced', 'Status'],
    row: s => { const po = getPO(s.poId); return `<tr class="click" data-act="go" data-hash="#/srn/${s.id}"><td class="strong">${s.number}</td><td>${esc(po.number)}</td><td>${esc(getSup(po.supplierId).name)}</td><td class="nowrap">${fmtD(s.date)}</td><td>${esc(s.description)}</td><td>${s.milestoneId ? esc(getMS(s.milestoneId).code) : '—'}</td><td class="num">${fmtNum(s.serviceValue)}</td><td class="num">${fmtNum(srnEnt(s))}</td><td class="num">${fmtNum(usage('srn', s.id).value)}</td><td>${sb(s.status)}</td></tr>`; },
  })}</div></div>`;

/* service lines; a milestone PO with goods lines may still receive a linked SRN for the service element */
const srnLines = po => { const s = po.lines.filter(l => l.receiptType === 'Services'); return s.length ? s : (po.billingMethod === 'Milestone' ? po.lines : []); };
function srnInit(q) {
  const po = q.po && getPO(q.po), ok = po && po.status === 'Approved' && srnLines(po).length > 0;
  const line = ok && srnLines(po)[0], m = ok && q.ms && getMS(q.ms);
  return { poId: ok ? po.id : '', lineId: ok ? line.id : '', milestoneId: m && m.poId === po.id ? m.id : '', date: todayISO(), description: m ? `Services for milestone ${m.code} — ${m.name}` : '', serviceValue: m && m.poId === po.id ? m.amount : '', remarks: '', attachments: [] };
}
ROUTES.srn = r => {
  const id = r.parts[1]; if (id === 'new') return srnForm(r);
  const s = getSRN(id); if (!s) return notFound('Service receipt'); return srnDetail(s);
};
HOOKS.srnpo = () => { const f = ui.f, po = getPO(f.poId), l = po && srnLines(po)[0]; f.lineId = l ? l.id : ''; f.milestoneId = ''; };
HOOKS.srnms = (el, v) => { const m = getMS(v); if (m) { ui.f.serviceValue = m.amount; if (!ui.f.description) ui.f.description = `Services for milestone ${m.code} — ${m.name}`; } };
function srnForm(r) {
  if (!ui.f || ui.fKey !== 'srn-new') { ui.f = srnInit(r.q); ui.fKey = 'srn-new'; }
  const f = ui.f, po = getPO(f.poId), pos = approvedPOs(p => srnLines(p).length > 0);
  ui.derive = srnDerive;
  const lines = po ? srnLines(po) : [];
  return `<div>${pageHead({ title: 'Create Service Receipt', crumbs: [['Service Receipts', '#/srns'], ['New SRN']] })}
  <div class="content"><div class="card" style="margin-top:16px"><h3>Step 1 · Select purchase order</h3><div class="fgrid c2"><div class="field"><label>Approved service PO *</label><select class="input" data-f="poId" data-hook="srnpo" data-r><option value="">— Select a PO —</option>${opt(pos.map(p => [p.id, poOptLabel(p)]), f.poId)}</select></div>${po ? `<div class="field"><label>Supplier</label><div class="ro">${esc(getSup(po.supplierId).name)}</div></div>` : ''}</div></div>
  ${po ? `<div class="card" style="margin-top:12px"><h3>Step 2 · Service receipt details</h3><div class="fgrid">
    <div class="field"><label>SRN number</label><div class="ro">SRN-${pad(db.srns.filter(s => s.poId === po.id).length + 1)} <span class="hint">&nbsp;(auto-generated)</span></div></div>
    <div class="field"><label>PO line *</label><select class="input" data-f="lineId" data-r>${opt(lines.map(l => [l.id, `${l.no}. ${l.desc}`]), f.lineId)}</select></div>
    <div class="field"><label>Receipt date *</label><input class="input" type="date" data-f="date" value="${esc(f.date)}"></div>
    ${po.billingMethod === 'Milestone' ? `<div class="field span2"><label>Link to milestone (optional)</label><select class="input" data-f="milestoneId" data-hook="srnms" data-r><option value="">— Not linked —</option>${opt(msOf(po).map(m => [m.id, `${msFull(m)} · ${money(m.amount)} · ${m.status}`]), f.milestoneId)}</select><div class="fhint">The milestone and the SRN remain separate records. Accepting this SRN does not approve the milestone, and approving the milestone does not accept this SRN.</div></div>` : ''}
    <div class="field span2"><label>Service description *</label><input class="input" data-f="description" value="${esc(f.description)}"></div>
    <div class="field"><label>Service value (AED) *</label><input class="input num" type="number" min="0" step="any" data-t="num" data-f="serviceValue" value="${f.serviceValue}"><div class="fhint" id="s-rem"></div></div>
    <div class="field span2"><label>Remarks</label><input class="input" data-f="remarks" value="${esc(f.remarks)}"></div>
    <div class="field span3"><label>Attachments (mock upload)</label>${attachBox('attachments', f.attachments, 'Attach timesheets / completion report')}</div></div><div id="srn-val" style="margin-top:12px"></div></div>
  <div class="form-actions">${actBtn('go', 'Cancel', { cls: 'btn-ghost', data: { hash: '#/srns' } })}<span class="spacer"></span>${gbtn('srn.create', 'srn-save', 'Save as Draft', { cls: 'btn-outline', data: { m: 'draft' } })}${gbtn('srn.create', 'srn-save', 'Submit for acceptance', { cls: 'btn-primary', data: { m: 'submit' } })}</div>` : '<div class="empty-state">Select an approved service PO to continue.</div>'}</div></div>`;
}
function srnDerive() {
  const f = ui.f, po = getPO(f.poId); if (!po || !$('#srn-val')) return;
  const l = lineOf(po, f.lineId), st = lineServiceStats(po, l), errs = validateSRN({ ...f, serviceValue: +f.serviceValue || 0 });
  $('#s-rem').textContent = `Remaining on line: ${money(st.remaining)}`;
  $('#srn-val').innerHTML = errs.length ? alertBox('err', 'Cannot submit yet', errList(errs)) : alertBox('info', '', 'Once accepted, the accepted value becomes invoice-eligible for progressive billing (receipt-based) and can satisfy an SRN gate for milestones.');
}
ACT['srn-save'] = el => { const f = ui.f; done(A.createSRN({ ...f, serviceValue: +f.serviceValue || 0 }, el.dataset.m), r => { ui.f = null; go(`#/srn/${r.id}`); }); };
function srnDetail(s) {
  const po = getPO(s.poId), line = lineOf(po, s.lineId), u = usage('srn', s.id), ms = s.milestoneId && getMS(s.milestoneId), ent = srnEnt(s);
  const acts = [];
  if (s.status === 'Draft') acts.push(gbtn('srn.create', 'srn-submit', 'Submit for acceptance', { cls: 'btn-primary', data: { id: s.id } }));
  if (s.status === 'Pending Acceptance') acts.push(gbtn('srn.decide', 'srn-reject', 'Reject', { cls: 'btn-danger-soft', data: { id: s.id } }), gbtn('srn.decide', 'srn-accept', 'Accept SRN', { cls: 'btn-primary', data: { id: s.id }, icn: 'check' }));
  const bn = { Draft: ['gray', 'Draft', 'Not yet submitted.'], 'Pending Acceptance': ['amber', 'Pending acceptance', 'Not invoice-eligible until accepted. Any linked milestone invoice remains blocked if an accepted SRN is required.'], Accepted: ['green', 'Accepted', `${money(ent)} is invoice-eligible.`], 'Partially Accepted': ['green', 'Partially accepted', `${money(ent)} accepted of ${money(s.serviceValue)} — only the accepted value is eligible.`], Rejected: ['red', 'Rejected', s.rejectReason || ''] }[s.status];
  return `<div>${pageHead({ title: s.number, sub: sb(s.status), crumbs: [['Service Receipts', '#/srns'], [s.number]], right: acts.join('') })}
  <div class="content"><div class="status-banner ${bn[0]}"><div><div class="t">${bn[1]}</div><div class="d">${esc(bn[2])}</div></div></div>
  ${strip([['Service value', money(s.serviceValue)], ['Accepted value', money(ent)], ['Allocated to invoices', money(u.value), `reserved ${money(u.reservedValue)} · committed ${money(u.committedValue)}`], ['Remaining eligible', money(Math.max(0, r2(ent - u.value))), '', 'hl']])}
  <div class="sec-title">Service receipt details</div><div class="card flat"><div class="kvg">${kv('PO', poLink(po))}${kv('Supplier', esc(getSup(po.supplierId).name))}${kv('PO line', `${line.no}. ${esc(line.desc)}`)}${kv('Receipt date', fmtD(s.date))}${kv('Description', esc(s.description))}${kv('Linked milestone', ms ? `<a class="link" href="#/milestone/${ms.id}">${esc(msFull(ms))}</a> ${sb(ms.status)}` : '—')}${kv('PO billing method', poMethodBadge(po))}${kv('Remarks', esc(s.remarks) || '—')}${kv('Attachments', attachChips(s.attachments) || '—')}</div></div>
  <div class="sec-title">Invoice allocations against this SRN</div><div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Invoice</th><th>Supplier inv. no.</th><th class="right">Value</th><th>Status</th><th>State</th></tr></thead><tbody>${allocsOn('srn', s.id).map(({ inv, a }) => `<tr><td>${invLink(inv)}</td><td>${esc(inv.number)}</td><td class="num">${fmtNum(a.value)}</td><td>${sb(inv.status)}</td><td>${sb(APPROVED.includes(inv.status) ? 'Committed' : 'Reserved')}</td></tr>`).join('') || emptyRow(5, 'No invoice has consumed this SRN yet.')}</tbody></table></div>
  <div class="sec-title">History</div><ul class="tl">${db.audit.filter(a => a.ref === s.number && a.poId === po.id).map(a => `<li class="${a.kind === 'ok' ? 'ok' : a.kind === 'bad' ? 'bad' : ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.by)} · ${fmtDT(a.at)}</div></li>`).join('') || '<li><div class="tm">No history.</div></li>'}</ul></div></div>`;
}
ACT['srn-submit'] = el => done(A.submitSRN(el.dataset.id));
ACT['srn-reject'] = el => reasonModal({ title: 'Reject SRN', label: 'Rejection reason', btn: 'Reject SRN', onSubmit: reason => { done(A.rejectSRN(el.dataset.id, reason)); } });
ACT['srn-accept'] = el => { const s = getSRN(el.dataset.id); openModal({ title: `Accept ${s.number}`, submitLabel: 'Accept', html: `<p class="hint" style="margin-top:0">Service value claimed: <b>${money(s.serviceValue)}</b>. Enter a lower value to accept partially.</p>${fld('Accepted value (AED)', 'val', { type: 'number', value: s.serviceValue, step: 'any' })}`, onSubmit: v => { const r = A.acceptSRN(s.id, +v.val); if (!r.ok) { toast(r.msg, 'err'); return false; } toast(r.msg); render(); } }); };
