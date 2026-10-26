/* =====================================================================
   screens-receipts.js — GRN (goods) and SRN (services): drawers, detail, lists
   A Goods PO only ever gets GRNs; a Services PO only ever gets SRNs.
   ===================================================================== */
const approvedPOs = filter => db.pos.filter(p => p.status === 'Approved' && (!filter || filter(p)));
const grnStatus = g => g.reversed ? 'Reversed' : g.status;
/* milestones on this PO that can still be backed by a receipt */
const gatedMilestones = po => po.billingMethod === 'Milestone' ? msOf(po).filter(m => m.needsReceipt && usage('milestone', m.id).value <= EPS) : [];

/* ================================================================ tables on the PO page */
const invIdsOf = (kind, id) => { const l = allocsOn(kind, id); return l.length ? [...new Set(l.map(x => x.inv))].map(invLink).join(', ') : '-'; };
function rcTab(po, noInv) {
  const g = isGoods(po), N = g ? 'GRN' : 'SRN', list = g ? grnsOf(po) : srnsOf(po), kind = g ? 'grn' : 'srn';
  const pend = list.filter(x => g ? x.status === 'Pending Inspection' : x.status === 'Pending Acceptance'), past = list.filter(x => !pend.includes(x));
  const open = x => `data-act="rc-open" data-kind="${kind}" data-id="${x.id}"`;
  const itemName = x => g ? esc(lineOf(po, x.lineId).desc) : esc(x.description);
  const create = po.status === 'Approved' ? (g ? gbtn('grn.create', 'grn-new', 'Create GRN', { cls: 'btn-primary', data: { po: po.id }, icn: 'plus' }) : gbtn('srn.create', 'srn-new', 'Create SRN', { cls: 'btn-primary', data: { po: po.id }, icn: 'plus' })) : '';
  const invs = invsOf(po);
  return `<div class="boxed" style="margin-top:22px"><div class="boxed-h"><h3>Pending ${N} Items :-</h3><span class="spacer"></span>${create}</div>
    <table class="tbl sm"><thead><tr><th>DETAILS</th><th>DATE</th><th class="right">${g ? 'QUANTITY' : 'SERVICE VALUE'}</th><th>MILESTONE</th><th>STATUS</th><th></th></tr></thead><tbody>
    ${pend.map(x => `<tr class="band click" ${open(x)}><td><b>${itemName(x)}</b><div class="sub">Notes: ${esc(x.remarks || '—')}</div><div class="sub">${N}: ${x.number}</div><div class="sub">Vendor: ${esc(getSup(po.supplierId).name)}</div></td><td>${fmtD(x.date)}</td><td class="num">${g ? `${fmtNum(x.received)} / ${esc(lineOf(po, x.lineId).uom)}` : money(x.serviceValue)}</td><td>${x.milestoneId ? esc(getMS(x.milestoneId).code) : '—'}</td><td>${sb(x.status)}</td><td class="act"><button class="btn-view" ${open(x)}>${icon('open', 12, 2)}View</button></td></tr>`).join('') || `<tr><td colspan="6" class="empty" style="padding:26px 0;font-weight:600;color:var(--text)">No Pending ${g ? 'Grn' : 'Srn'}</td></tr>`}</tbody></table>
    <h3 style="margin:26px 0 8px;font-size:15px">Past ${N} Items :-</h3>
    <table class="tbl sm"><thead><tr><th>${N} ID</th><th>ITEM</th><th>DATE</th><th class="right">${g ? 'DELIVERED' : 'SERVICE VALUE'}</th><th class="right">ACCEPTED</th><th>INVOICE ID</th><th>MILESTONE</th><th>STATUS</th><th></th></tr></thead><tbody>
    ${past.map(x => `<tr class="band click" ${open(x)}><td><b>${x.number}</b></td><td>${itemName(x)}</td><td>${fmtD(x.date)}</td><td class="num">${g ? fmtNum(x.received) : fmtNum(x.serviceValue)}</td><td class="num">${g ? fmtNum(x.accepted) : fmtNum(srnEnt(x))}</td><td>${invIdsOf(kind, x.id)}</td><td>${x.milestoneId ? esc(getMS(x.milestoneId).code) : '—'}</td><td>${sb(g ? grnStatus(x) : x.status)}</td><td class="act"><button class="btn-view" ${open(x)}>${icon('open', 12, 2)}View</button></td></tr>`).join('') || emptyRow(9, 'No past receipts yet.')}</tbody></table></div>${noInv ? '' : `
  <div class="sec" style="margin-top:34px;font-size:22px;font-weight:500">Invoices ${po.status === 'Approved' ? `<button class="plus-circle" data-act="inv-new" data-po="${po.id}" title="Submit Invoice">${icon('plus', 18, 2.4)}</button>` : ''}</div>
  <div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>INVOICE</th><th>BILL NO.</th><th>DATE</th><th class="right">BASE</th><th class="right">TOTAL</th><th>STATUS</th><th></th></tr></thead><tbody>${invs.map(i => `<tr class="band click" data-act="inv-view" data-id="${i.id}"><td><b>${invRef(i)}</b></td><td>${esc(i.number)}</td><td>${fmtD(i.date)}</td><td class="num">${fmtNum(i.net)}</td><td class="num">${fmtNum(i.gross)}</td><td>${sb(i.status)}</td><td class="act"><button class="btn-view" data-act="inv-view" data-id="${i.id}">${icon('open', 12, 2)}View</button></td></tr>`).join('') || emptyRow(7, 'No invoices yet.')}</tbody></table></div>`}`;
}
const grnTable = po => rcTab(po), srnTable = po => rcTab(po);

/* ================================================================ GRN drawer */
ACT['grn-new'] = el => openGrnPanel(el.dataset.po, el.dataset.ms);
function openGrnPanel(poId, msId) {
  openPanel({ key: 'grn', title: 'GRN', sub: 'Record the goods delivered by the vendor', init: () => ({ poId: poId || '', fixed: !!poId, date: todayISO(), remarks: '', attachments: [], milestoneId: msId || '', rows: {} }), body: grnBody, foot: grnFoot, derive: grnDerive });
}
function grnBody() {
  const f = ui.f, po = getPO(f.poId), pos = approvedPOs(isGoods);
  let h = '';
  if (f.fixed && po) h += `<div class="field"><label>Purchase order</label><div class="ro"><b style="margin-right:8px">${esc(po.number)}</b> ${esc(getSup(po.supplierId).name)}</div></div>`;
  else h += `<div class="field"><label>Purchase order <span class="req">*</span></label><select class="input" data-f="poId" data-r data-hook="rcpo"><option value="">Select an approved goods PO</option>${opt(pos.map(p => [p.id, `${p.number} — ${getSup(p.supplierId).name}`]), f.poId)}</select><div class="fhint">Only approved Goods POs are listed. Services POs use an SRN.</div></div>`;
  if (!po) return h + '<div class="empty-state">Select a PO to enter the delivered quantities.</div>';
  const gm = gatedMilestones(po);
  h += `<div class="sec-h">GRN Items</div><div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Id</th><th>Details</th><th class="right">Price</th><th class="right">Available Quantity / Unit</th><th class="right">Delivered</th><th class="right">Rejected</th></tr></thead><tbody>
    ${po.lines.map((l, i) => { const st = lineReceiptStats(po, l); return `<tr><td>${i + 1}</td><td class="strong">${esc(l.desc)}</td><td class="num">${money(l.price)}</td><td class="num">${fmtNum(st.remaining)} / ${esc(l.uom)}</td>
      <td><input class="input sm num" style="width:96px" type="number" min="0" step="any" data-t="num" data-f="rows.${l.id}.received" value="${esc(f.rows[l.id]?.received ?? '')}" placeholder="0"></td>
      <td><input class="input sm num" style="width:84px" type="number" min="0" step="any" data-t="num" data-f="rows.${l.id}.rejected" value="${esc(f.rows[l.id]?.rejected ?? '')}" placeholder="0"></td></tr>`; }).join('')}</tbody></table></div>
    <div id="rc-val" style="margin-top:12px"></div>
    <div class="fgrid" style="margin-top:18px">${F.text('GRN Date', 'date', { type: 'date', req: 1 })}
    ${gm.length ? F.select('Link to milestone', 'milestoneId', gm.map(m => [m.id, `${m.code} — ${m.name}${m.receiptId ? ' (has a GRN)' : ''}`]), { blank: 'Not linked', hint: 'Links this GRN as the proof that clears the milestone gate. One GRN can back only one milestone.' }) : '<div></div>'}</div>
    ${F.area('Remarks', 'remarks', { ph: 'Enter Remarks' })}
    <div class="field"><label>Attachment</label>${attachBox('attachments', f.attachments)}</div>`;
  return h;
}
HOOKS.rcpo = () => { ui.f.rows = {}; ui.f.milestoneId = ''; };
const grnFoot = () => ui.f && ui.f.poId ? `${gbtn('grn.create', 'grn-save', 'Send for inspection', { cls: 'btn-outline', data: { m: 'inspect' } })}${gbtn('grn.decide', 'grn-save', 'Complete GRN', { cls: 'btn-dark', data: { m: 'accept' } })}` : '';
function grnEntries(mode) {
  const f = ui.f, po = getPO(f.poId); if (!po) return [];
  return po.lines.map(l => ({ l, rec: +f.rows[l.id]?.received || 0, rej: +f.rows[l.id]?.rejected || 0 })).filter(x => x.rec > 0 || x.rej > 0).map(x => ({ ...x, d: { poId: po.id, lineId: x.l.id, date: f.date, received: x.rec, rejected: mode === 'accept' ? x.rej : 0, accepted: mode === 'accept' ? r2(x.rec - x.rej) : 0, remarks: f.remarks, attachments: f.attachments, milestoneId: f.milestoneId } }));
}
function grnDerive() {
  const f = ui.f, po = getPO(f.poId), box = $('#rc-val'); if (!po || !box) return;
  const es = grnEntries('accept'), errs = [];
  es.forEach(e => validateGRN(e.d).forEach(m => errs.push(po.lines.length > 1 ? `Line ${e.l.no}: ${m}` : m)));
  if (f.milestoneId && es.length > 1) errs.push('A milestone can be linked to one GRN only — create one GRN per line when linking to a milestone.');
  const acc = sum(es, e => e.d.accepted), val = sum(es, e => e.d.accepted * e.l.price);
  box.innerHTML = errs.length ? alertBox('err', 'Cannot complete yet', errList([...new Set(errs)]))
    : es.length ? alertBox('info', '', `<b>Complete GRN</b> accepts delivered − rejected = ${fmtNum(acc)} unit(s) (${money(val)}), which become invoice-eligible. <b>Send for inspection</b> records the delivery but nothing is invoice-eligible until inspection is done.`)
    : '';
}
ACT['grn-save'] = el => {
  const mode = el.dataset.m, f = ui.f, po = getPO(f.poId), es = grnEntries(mode), errs = [];
  if (!es.length) return toast('Enter the delivered quantity for at least one item', 'err');
  es.forEach(e => validateGRN({ ...e.d, received: e.rec, rejected: mode === 'accept' ? e.rej : 0, accepted: mode === 'accept' ? r2(e.rec - e.rej) : 0 }).forEach(m => errs.push(po.lines.length > 1 ? `Line ${e.l.no}: ${m}` : m)));
  if (f.milestoneId && es.length > 1) errs.push('A milestone can be linked to one GRN only — create one GRN per line when linking to a milestone.');
  if (errs.length) return errorModal('GRN cannot be completed', [...new Set(errs)]);
  const made = es.map(e => A.createGRN(e.d, mode));
  const bad = made.find(r => !r.ok); if (bad) return done(bad);
  toast(made.length > 1 ? `${made.length} GRNs created` : made[0].msg); closePanel(); go(`#/po/${po.id}?tab=receipts`); render();
};

/* ================================================================ SRN drawer */
ACT['srn-new'] = el => openSrnPanel(el.dataset.po, el.dataset.ms);
function openSrnPanel(poId, msId) {
  openPanel({ key: 'srn', title: 'SRN', sub: 'Record the services delivered by the vendor', init: () => {
    const po = poId && getPO(poId), m = msId && getMS(msId);
    return { poId: poId || '', fixed: !!poId, lineId: po ? po.lines[0].id : '', date: todayISO(), description: m ? `Services for milestone ${m.code} — ${m.name}` : '', serviceValue: m ? m.amount : '', remarks: '', attachments: [], milestoneId: msId || '' };
  }, body: srnBody, foot: srnFoot, derive: srnDerive });
}
HOOKS.srnpo = () => { const f = ui.f, po = getPO(f.poId); f.lineId = po ? po.lines[0].id : ''; f.milestoneId = ''; };
HOOKS.srnms = (el, v) => { const m = getMS(v); if (m) { ui.f.serviceValue = m.amount; if (!ui.f.description) ui.f.description = `Services for milestone ${m.code} — ${m.name}`; } };
function srnBody() {
  const f = ui.f, po = getPO(f.poId), pos = approvedPOs(p => !isGoods(p));
  let h = '';
  if (f.fixed && po) h += `<div class="field"><label>Purchase order</label><div class="ro"><b style="margin-right:8px">${esc(po.number)}</b> ${esc(getSup(po.supplierId).name)}</div></div>`;
  else h += `<div class="field"><label>Purchase order <span class="req">*</span></label><select class="input" data-f="poId" data-r data-hook="srnpo"><option value="">Select an approved services PO</option>${opt(pos.map(p => [p.id, `${p.number} — ${getSup(p.supplierId).name}`]), f.poId)}</select><div class="fhint">Only approved Services POs are listed. Goods POs use a GRN.</div></div>`;
  if (!po) return h + '<div class="empty-state">Select a PO to record the service delivery.</div>';
  const gm = gatedMilestones(po);
  h += `<div class="fgrid">
    ${po.lines.length > 1 ? F.select('PO line', 'lineId', po.lines.map(l => [l.id, `${l.no}. ${l.desc}`]), { r: 1, req: 1, cls: 'span2' }) : ''}
    ${F.text('Service description', 'description', { req: 1, cls: 'span2', ph: 'What was delivered?' })}
    ${F.text('Service value (INR)', 'serviceValue', { type: 'number', step: 'any', num: 1, req: 1, hint: '<span id="s-rem"></span>' })}
    ${F.text('SRN Date', 'date', { type: 'date', req: 1 })}
    ${gm.length ? F.select('Link to milestone', 'milestoneId', gm.map(m => [m.id, `${m.code} — ${m.name} · ${money(m.amount)}${m.receiptId ? ' (has an SRN)' : ''}`]), { blank: 'Not linked', hook: 'srnms', r: 1, cls: 'span2', hint: 'Links this SRN as the proof that clears the milestone gate. One SRN can back only one milestone.' }) : ''}
  </div>
  <div id="rc-val"></div>
  ${F.area('Remarks', 'remarks', { ph: 'Enter Remarks' })}
  <div class="field"><label>Attachment</label>${attachBox('attachments', f.attachments)}</div>`;
  return h;
}
const srnFoot = () => ui.f && ui.f.poId ? `${gbtn('srn.create', 'srn-save', 'Submit for acceptance', { cls: 'btn-outline', data: { m: 'submit' } })}${gbtn('srn.decide', 'srn-save', 'Complete SRN', { cls: 'btn-dark', data: { m: 'accept' } })}` : '';
const srnData = f => ({ ...f, serviceValue: +f.serviceValue || 0 });
function srnDerive() {
  const f = ui.f, po = getPO(f.poId); if (!po || !$('#rc-val')) return;
  const l = lineOf(po, f.lineId); if (!l) return;
  const st = lineServiceStats(po, l), errs = validateSRN(srnData(f));
  const rem = $('#s-rem'); if (rem) rem.textContent = `Remaining on this line: ${money(st.remaining)}`;
  $('#rc-val').innerHTML = errs.length && (+f.serviceValue || f.description) ? alertBox('err', 'Cannot submit yet', errList(errs)) : '';
}
ACT['srn-save'] = el => { const f = ui.f, po = getPO(f.poId); done(A.createSRN(srnData(f), el.dataset.m), () => { closePanel(); go(`#/po/${po.id}?tab=receipts`); }); };

/* ================================================================ receipt detail drawer */
ACT['rc-open'] = el => openReceiptPanel(el.dataset.kind, el.dataset.id);
function openReceiptPanel(kind, id) {
  const get = () => kind === 'grn' ? getGRN(id) : getSRN(id);
  openPanel({ key: 'rc-' + id, mid: true, title: () => get().number, sub: () => `All ${kind} details`,
    body: () => kind === 'grn' ? grnDetailBody(get()) : srnDetailBody(get()),
    foot: () => { const r = get(), a = [];
      if (kind === 'grn') {
        if (r.status === 'Pending Inspection') a.push(gbtn('grn.decide', 'grn-reject', 'Reject', { cls: 'btn-danger', data: { id } }), gbtn('grn.decide', 'grn-inspect', 'Record inspection', { data: { id } }), gbtn('grn.decide', 'grn-accept', 'Accept all', { cls: 'btn-primary', data: { id }, icn: 'check' }));
        if (GRN_OK.includes(r.status) && !r.reversed) a.push(gbtn('grn.decide', 'grn-reverse', 'Reverse GRN', { cls: 'btn-danger', data: { id } }));
      } else if (r.status === 'Pending Acceptance') a.push(gbtn('srn.decide', 'srn-reject', 'Reject', { cls: 'btn-danger', data: { id } }), gbtn('srn.decide', 'srn-accept', 'Accept SRN', { cls: 'btn-primary', data: { id }, icn: 'check' }));
      return a.join(''); } });
}
const histList = (ref, poId) => `<ul class="tl">${db.audit.filter(a => a.ref === ref && a.poId === poId).map(a => `<li class="${a.kind === 'ok' ? 'ok' : a.kind === 'bad' ? 'bad' : ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.by)} · ${fmtDT(a.at)}</div></li>`).join('') || '<li><div class="tm">No history.</div></li>'}</ul>`;
const stBanner = (tone, t, d) => `<div class="stage ${tone === 'green' ? '' : tone}" style="margin:0 0 18px"><div class="grow"><div class="t" style="font-size:16px">${esc(t)}</div><div class="hint" style="margin-top:3px">${esc(d)}</div></div></div>`;
/* View GRN / View SRN — laid out like the DICE "All grn details" drawer, plus the allocations the PRD asks for */
const rcTop = (po, r, N, kind) => `<div class="rc-top"><div><div class="rc-line"><b>PO Number:</b> ${esc(po.number)}</div><div class="rc-line"><b>${N} ID:</b> ${esc(r.number)}</div></div>
  <div class="rc-btns">${r.reversed || r.status === 'Rejected' ? '' : gbtn('inv.create', 'inv-from-rc', 'OCR Invoice', { cls: 'btn-primary', data: { kind, id: r.id, ocr: 1 }, icn: 'play' })}</div></div>`;
function grnDetailBody(g) {
  const po = getPO(g.poId), line = lineOf(po, g.lineId), u = usage('grn', g.id), ent = grnEnt(g), ms = g.milestoneId && getMS(g.milestoneId), off = officeOf(po.office);
  const base = r2(g.received * line.price), gst = r2(base * gstOf(po) / 100);
  const bn = g.reversed ? ['red', 'Reversed', `Entitlement withdrawn: ${g.reverseReason}. The record is preserved; invoices relying on this receipt must be re-matched.`]
    : { 'Pending Inspection': ['amber', 'Pending inspection', `${fmtNum(g.received)} unit(s) delivered but not yet inspected — not invoice-eligible.`], Accepted: ['green', 'Accepted', `${fmtNum(g.accepted)} units are invoice-eligible.`], 'Partially Accepted': ['green', 'Partially accepted', `${fmtNum(g.accepted)} accepted (eligible), ${fmtNum(g.rejected)} rejected (never eligible).`], Rejected: ['red', 'Rejected', 'No quantity is invoice-eligible.'] }[g.status];
  return `${rcTop(po, g, 'GRN', 'grn')}
  <div class="rc-items"><b>All Items</b>${ent - u.qty > EPS && !g.reversed ? gbtn('inv.create', 'inv-from-rc', 'Submit', { cls: 'btn-primary btn-xs', data: { kind: 'grn', id: g.id } }) : ''}</div>
  <div class="tbl-wrap boxedtbl"><table class="tbl sm plain"><thead><tr><th>Product Name</th><th>Delivery Address</th><th>Order Quantity</th><th>Price</th><th>Delivered Quantity</th><th>GRN Amount</th><th>Total</th></tr></thead><tbody><tr><td><b>${esc(line.desc)}</b><div class="sub">Item Ref No : ${900 + line.no}</div><div class="sub"><b>... show more</b></div></td><td>${esc(off.name)}<br>${esc(off.address)}</td><td>${fmtNum(line.qty)}</td><td>${fmtNum(line.price)}</td><td>${fmtNum(g.received)}</td><td>${fmtNum(base)}</td><td>${fmtNum(r2(base + gst))}</td></tr></tbody></table></div>
  <div class="rc-sum"><div><b>GRN Amount</b><span>${fmtNum(base)}</span></div><div><b>Tax</b><span>${fmtNum(gst)}</span></div><div><b>Total GRN Amount</b><span>${fmtNum(r2(base + gst))}</span></div></div>
  <div class="rc-meta"><div>Delivery Date: ${fmtD(g.date)}</div><div>GRN Owner: ${esc(g.createdBy)}</div><div>Remarks: ${esc(g.remarks) || '—'}</div>${ms ? `<div>Linked milestone: ${esc(msFull(ms))} ${sb(ms.status)}</div>` : ''}</div>
  <div class="rc-att"><b>All Attachment</b>${g.attachments.length ? `<div style="margin-top:10px">${attachChips(g.attachments)}</div>` : `<div class="noitems">${icon('box', 34, 1.4)}<span>No Items found</span></div>`}</div>
  <div class="sec-h">Receipt status</div>${stBanner(bn[0], bn[1], bn[2])}
  ${strip([['Delivered', fmtNum(g.received) + ' ' + line.uom, money(base)], ['Accepted', fmtNum(g.accepted), money(g.accepted * line.price)], ['Rejected', fmtNum(g.rejected)], ['Invoiced', fmtNum(u.qty), `in approval ${fmtNum(u.reservedQty)} · approved ${fmtNum(u.committedQty)}`], ['Remaining eligible', fmtNum(Math.max(0, r2(ent - u.qty))), money(Math.max(0, r2(ent - u.qty)) * line.price), 'hl']])}
  ${po.billingMethod !== 'Milestone' ? `<div class="sec-h">Invoice allocations</div><div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Invoice</th><th>Bill No.</th><th class="right">Qty</th><th class="right">Value</th><th>Status</th><th>State</th></tr></thead><tbody>${allocsOn('grn', g.id).map(({ inv, a }) => `<tr><td>${invLink(inv)}</td><td>${esc(inv.number)}</td><td class="num">${fmtNum(a.qty)}</td><td class="num">${fmtNum(a.value)}</td><td>${sb(inv.status)}</td><td>${sb(APPROVED.includes(inv.status) ? 'Committed' : 'Reserved')}</td></tr>`).join('') || emptyRow(6, po.billingMethod === 'Standard' ? 'Standard billing matches at PO level — no per-receipt allocation.' : 'No invoice has used this GRN yet.')}</tbody></table></div>` : ''}
  <div class="sec-h">History</div>${histList(g.number, po.id)}`;
}
function srnDetailBody(s) {
  const po = getPO(s.poId), line = lineOf(po, s.lineId), u = usage('srn', s.id), ent = srnEnt(s), ms = s.milestoneId && getMS(s.milestoneId), off = officeOf(po.office);
  const gst = r2(s.serviceValue * gstOf(po) / 100);
  const bn = { 'Pending Acceptance': ['amber', 'Pending acceptance', 'Not invoice-eligible until accepted. A linked milestone stays blocked until then.'], Accepted: ['green', 'Accepted', `${money(ent)} is invoice-eligible.`], 'Partially Accepted': ['green', 'Partially accepted', `${money(ent)} accepted of ${money(s.serviceValue)} — only the accepted value is eligible.`], Rejected: ['red', 'Rejected', s.rejectReason || ''] }[s.status];
  return `${rcTop(po, s, 'SRN', 'srn')}
  <div class="rc-items"><b>All Items</b>${ent - u.value > EPS ? gbtn('inv.create', 'inv-from-rc', 'Submit', { cls: 'btn-primary btn-xs', data: { kind: 'srn', id: s.id } }) : ''}</div>
  <div class="tbl-wrap boxedtbl"><table class="tbl sm plain"><thead><tr><th>Service Name</th><th>Delivery Address</th><th>PO Line Value</th><th>Service Value</th><th>Accepted Value</th><th>SRN Amount</th><th>Total</th></tr></thead><tbody><tr><td><b>${esc(s.description)}</b><div class="sub">${esc(line.desc)}</div></td><td>${esc(off.name)}<br>${esc(off.address)}</td><td>${fmtNum(lineNet(line))}</td><td>${fmtNum(s.serviceValue)}</td><td>${fmtNum(ent)}</td><td>${fmtNum(s.serviceValue)}</td><td>${fmtNum(r2(s.serviceValue + gst))}</td></tr></tbody></table></div>
  <div class="rc-sum"><div><b>SRN Amount</b><span>${fmtNum(s.serviceValue)}</span></div><div><b>Tax</b><span>${fmtNum(gst)}</span></div><div><b>Total SRN Amount</b><span>${fmtNum(r2(s.serviceValue + gst))}</span></div></div>
  <div class="rc-meta"><div>Service Date: ${fmtD(s.date)}</div><div>SRN Owner: ${esc(s.createdBy)}</div><div>Remarks: ${esc(s.remarks) || '—'}</div>${ms ? `<div>Linked milestone: ${esc(msFull(ms))} ${sb(ms.status)}</div>` : ''}</div>
  <div class="rc-att"><b>All Attachment</b>${s.attachments.length ? `<div style="margin-top:10px">${attachChips(s.attachments)}</div>` : `<div class="noitems">${icon('box', 34, 1.4)}<span>No Items found</span></div>`}</div>
  <div class="sec-h">Receipt status</div>${stBanner(bn[0], bn[1], bn[2])}
  ${strip([['Service value', money(s.serviceValue)], ['Accepted', money(ent)], ['Invoiced', money(u.value), `in approval ${money(u.reservedValue)} · approved ${money(u.committedValue)}`], ['Remaining eligible', money(Math.max(0, r2(ent - u.value))), '', 'hl']])}
  ${po.billingMethod !== 'Milestone' ? `<div class="sec-h">Invoice allocations</div><div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Invoice</th><th>Bill No.</th><th class="right">Value</th><th>Status</th><th>State</th></tr></thead><tbody>${allocsOn('srn', s.id).map(({ inv, a }) => `<tr><td>${invLink(inv)}</td><td>${esc(inv.number)}</td><td class="num">${fmtNum(a.value)}</td><td>${sb(inv.status)}</td><td>${sb(APPROVED.includes(inv.status) ? 'Committed' : 'Reserved')}</td></tr>`).join('') || emptyRow(5, po.billingMethod === 'Standard' ? 'Standard billing matches at PO level — no per-receipt allocation.' : 'No invoice has used this SRN yet.')}</tbody></table></div>` : ''}
  <div class="sec-h">History</div>${histList(s.number, po.id)}`;
}
ACT['inv-from-rc'] = el => openInvPanel({ recKind: el.dataset.kind, recId: el.dataset.id, ocr: !!el.dataset.ocr });
ACT['grn-accept'] = el => confirmBox({ title: 'Accept GRN', message: `Accept all ${fmtNum(getGRN(el.dataset.id).received)} delivered unit(s) on <b>${esc(getGRN(el.dataset.id).number)}</b>? They become invoice-eligible. Use <b>Record inspection</b> if some units failed.`, confirmLabel: 'Accept', onConfirm: () => done(A.acceptGRN(el.dataset.id)) });
ACT['grn-reject'] = el => reasonModal({ title: 'Reject GRN', label: 'Rejection reason', btn: 'Reject GRN', onSubmit: reason => { done(A.rejectGRN(el.dataset.id, reason)); } });
ACT['grn-reverse'] = el => reasonModal({ title: 'Reverse GRN', label: 'Reversal / correction reason', btn: 'Reverse GRN', ph: 'e.g. Goods returned, incorrect quantity booked', extra: `<p style="margin-bottom:12px">Reversing withdraws the invoice entitlement of this receipt. The record is kept for audit; in-flight invoices fail re-matching, new invoices are blocked, and a linked milestone loses its GRN gate.</p>`, onSubmit: reason => { done(A.reverseGRN(el.dataset.id, reason)); } });
ACT['grn-inspect'] = el => { const g = getGRN(el.dataset.id); openModal({ title: `Record inspection — ${g.number}`, submitLabel: 'Save result', html: `<p style="margin-bottom:12px">Delivered: <b>${fmtNum(g.received)}</b>. Accepted + rejected must equal the delivered quantity.</p>${fld('Accepted quantity', 'acc', { type: 'number', value: g.received, step: 'any' })}${fld('Rejected quantity', 'rej', { type: 'number', value: 0, step: 'any' })}`, onSubmit: v => { const r = A.recordInspection(g.id, v.acc, v.rej); if (!r.ok) { toast(r.msg, 'err'); return false; } toast(r.msg); render(); } }); };
ACT['srn-reject'] = el => reasonModal({ title: 'Reject SRN', label: 'Rejection reason', btn: 'Reject SRN', onSubmit: reason => { done(A.rejectSRN(el.dataset.id, reason)); } });
ACT['srn-accept'] = el => { const s = getSRN(el.dataset.id); openModal({ title: `Accept ${s.number}`, submitLabel: 'Accept', html: `<p style="margin-bottom:12px">Service value claimed: <b>${money(s.serviceValue)}</b>. Enter a lower value to accept partially.</p>${fld('Accepted value (INR)', 'val', { type: 'number', value: s.serviceValue, step: 'any' })}`, onSubmit: v => { const r = A.acceptSRN(s.id, +v.val); if (!r.ok) { toast(r.msg, 'err'); return false; } toast(r.msg); render(); } }); };

/* ================================================================ global receipts list */
const allReceipts = () => [...db.grns.map(x => ({ t: 'grn', x })), ...db.srns.map(x => ({ t: 'srn', x }))].sort((a, b) => b.x.createdAt.localeCompare(a.x.createdAt) || b.x.seq - a.x.seq);
const rcStatus = r => r.t === 'grn' ? grnStatus(r.x) : r.x.status;
ROUTES.receipts = () => `<div class="page"><h1 class="page-title">Receipts</h1>${listHtml('receipts', {
  noun: 'receipts', searchPh: 'Search receipt, PO, vendor…',
  tabs: [['all', 'All', () => true], ['pending', 'Pending', r => ['Pending Inspection', 'Pending Acceptance'].includes(rcStatus(r))], ['accepted', 'Accepted', r => ['Accepted', 'Partially Accepted'].includes(rcStatus(r))], ['rejected', 'Rejected / Reversed', r => ['Rejected', 'Reversed'].includes(rcStatus(r))]],
  filters: [{ name: 'type', label: 'Type', options: () => [['grn', 'GRN'], ['srn', 'SRN']] }, { name: 'po', label: 'PO', options: () => db.pos.filter(p => grnsOf(p).length || srnsOf(p).length || p.status === 'Approved').map(p => [p.id, p.number]) }],
  above: gbtn('grn.create', 'grn-new', 'Create GRN', { cls: 'btn-primary', icn: 'plus', data: { po: '' } }) + gbtn('srn.create', 'srn-new', 'Create SRN', { cls: 'btn-outline', icn: 'plus', data: { po: '' } }),
  rows: allReceipts,
  match: (r, st) => { const po = getPO(r.x.poId); return matchText(st, r.x.number, po.number, getSup(po.supplierId).name, r.x.description || '') && matchIn(st, 'type', r.t) && matchIn(st, 'po', r.x.poId); },
  cols: ['Receipt', 'Type', 'PO', 'Vendor', 'Date', '>Delivered', '>Accepted', 'Milestone', 'Status', ''],
  row: r => { const x = r.x, po = getPO(x.poId), g = r.t === 'grn';
    return `<tr class="click" data-act="rc-open" data-kind="${r.t}" data-id="${x.id}"><td class="strong">${x.number}</td><td>${g ? 'GRN' : 'SRN'}</td><td>${esc(po.number)}</td><td>${esc(getSup(po.supplierId).name)}</td><td class="nowrap">${fmtD(x.date)}</td><td class="num">${g ? fmtNum(x.received) + ' units' : money(x.serviceValue)}</td><td class="num">${g ? fmtNum(x.accepted) : money(srnEnt(x))}</td><td>${x.milestoneId ? esc(getMS(x.milestoneId).code) : '<span class="dim-note">—</span>'}</td><td>${sb(rcStatus(r))}</td><td class="act"><button class="btn-view" data-act="rc-open" data-kind="${r.t}" data-id="${x.id}">${icon('open', 12, 2)}View</button></td></tr>`; },
})}</div>`;
