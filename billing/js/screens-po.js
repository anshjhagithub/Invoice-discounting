/* =====================================================================
   screens-po.js — PO list, create / edit drawer (incl. milestone schedule), PO detail
   ===================================================================== */
const notFound = what => `<div class="page">${pageHead({ title: `${what} not found` })}<div class="empty-state">That record does not exist (the demo data may have been reset).<br><br>${actBtn('go', 'Go to purchase orders', { cls: 'btn-primary', data: { hash: '#/pos' } })}</div></div>`;
const MS_COLORS = ['#6A5BD2', '#2FA06B', '#E0A030', '#2E7DBA', '#B0285A', '#7B5BA8', '#3E8E95', '#C2583A'];
const recName = po => recLabel(po);                                         // GRN / SRN / GRN / SRN (mixed)
const poValueGross = po => { const n = poNet(po); return r2(n + n * gstOf(po) / 100); };

/* ---------------------------------------------------------------- list */
ROUTES.pos = () => `<div class="page"><h1 class="page-title">Purchase Order</h1>
  ${listHtml('pos', {
    noun: 'POs', searchPh: 'Search PO number, vendor, title…', defaults: {},
    tabs: [['pending', 'Pending', p => !poIsPast(p)], ['past', 'Past', p => poIsPast(p)], ['all', 'All Orders', () => true]],
    filters: [
      { name: 'method', label: 'Billing', options: () => ['Standard', 'Progressive', 'Milestone'] },
      { name: 'type', label: 'Type', options: () => ['Goods', 'Services'] },
      { name: 'supplier', label: 'Vendor', options: () => supOpts() }],
    above: gbtn('po.edit', 'po-new', 'Create Order', { cls: 'btn-primary', icn: 'plus' }),
    rows: () => db.pos.slice().sort((a, b) => (b.seqNo || 0) - (a.seqNo || 0)),
    match: (p, st) => matchText(st, p.number, getSup(p.supplierId).name, p.title, p.lines.map(l => l.desc).join(' ')) && matchIn(st, 'method', p.billingMethod) && matchIn(st, 'type', p.type) && matchIn(st, 'supplier', p.supplierId),
    cols: ['PO Number', 'Vendor Name', 'Type', 'Category', 'Office', 'Billing', 'Status', 'Created On', 'Submitted By', '>Amount', ''],
    row: p => { const s = p.status === 'Approved' ? poSummary(p) : null, val = poNet(p);
      return `<tr class="click" data-act="go" data-hash="#/po/${p.id}"><td class="id strong"><span class="pono">${esc(p.number)}${p.version > 1 ? ` <span class="badge-s s-gray">v${p.version}</span>` : ''}<span class="eye">${icon('eye', 15)}</span></span></td><td class="soft">${esc(getSup(p.supplierId).name)}</td><td>${typeBadge(p)}</td><td class="soft">${esc(p.category)}</td><td class="soft">${esc(officeOf(p.office).name)}</td><td>${poMethodBadge(p)}</td><td>${stagePill(p)}</td><td class="soft">${fmtD(p.poDate)}<br>${fmtT(p.createdAt)}</td><td class="soft">${esc(p.createdBy)}</td>
      <td class="num soft">${money(val)}${s ? `<div class="mini-bar" style="margin-left:auto"><span style="width:${pct(s.invoiced, val).toFixed(1)}%"></span></div><div class="sub">${fmtNum(pct(s.invoiced, val), 0)}% billed</div>` : ''}</td><td class="act">${viewBtn(`#/po/${p.id}`)}</td></tr>`; },
  })}</div>`;
ACT['po-new'] = () => openPoPanel(null);
ACT['po-edit'] = el => openPoPanel(el.dataset.id);

/* ---------------------------------------------------------------- router */
ROUTES.po = r => { const po = getPO(r.parts[1]); if (!po) return notFound('Purchase order'); return poDetail(po, r); };

/* ---------------------------------------------------------------- create / edit drawer */
const blankLine = () => ({ desc: '', qty: 1, uom: ui.f && ui.f.type === 'Services' ? 'Lot' : 'Units', price: '', kind: ui.f && ui.f.type === 'Services' ? 'Services' : 'Goods' });
const poDraftBlank = () => ({ id: null, supplierId: '', buyer: 'DICE Manufacturing Pvt Ltd', office: OFFICES[0].id, title: '', poDate: todayISO(), deliveryDate: daysFromNow(30), endDate: '', type: 'Goods', category: CATEGORIES[0], gstRate: GST_DEFAULT,
  billingMethod: 'Standard', progressBasis: 'Receipt', lines: [], milestones: [], attachments: [] });
const poDraftExisting = po => ({ id: po.id, supplierId: po.supplierId, buyer: po.buyer, office: po.office, title: po.title, poDate: po.poDate, deliveryDate: po.deliveryDate, endDate: po.endDate || '', type: po.type, category: po.category, gstRate: po.gstRate,
  billingMethod: po.billingMethod, progressBasis: po.progressBasis, lines: po.lines.map(l => ({ ...l })), milestones: msOf(po).map(m => ({ ...m })), attachments: [...(po.attachments || [])] });
const fVal = f => r2(f.lines.reduce((s, l) => s + (+l.qty || 0) * (+l.price || 0), 0));
const EXAMPLE_SCHEDULE = f => [
  { name: 'Design approval', pct: 20, planned: daysFromNow(30) },
  { name: f.type === 'Services' ? 'Works completed' : 'Equipment delivered', pct: 50, planned: daysFromNow(75), needsGrn: f.type !== 'Services', needsSrn: f.type === 'Services' },
  { name: 'Commissioning & handover', pct: 30, planned: daysFromNow(110), needsDoc: true, docTitle: 'Commissioning Certificate' },
];
function openPoPanel(id) {
  const po = id && getPO(id);
  openPanel({ key: 'po', title: po ? `Edit ${po.number}` : 'Create PO Order', sub: 'Fill out the details', init: () => po ? poDraftExisting(po) : poDraftBlank(), body: poPanelBody, foot: poPanelFoot, derive: poDerive });
}
HOOKS.potype = (el, v) => { if (v !== 'Services' && ui.f.progressBasis === 'Certified') ui.f.progressBasis = 'Receipt'; ui.f.lines.forEach(l => { l.kind = v === 'Mixed' ? (l.kind || 'Goods') : v; }); };
function poPanelBody() {
  const f = ui.f, off = officeOf(f.office), m = f.billingMethod, goods = f.type !== 'Services', mixed = f.type === 'Mixed', recs = f.type === 'Goods' ? 'GRNs' : f.type === 'Services' ? 'SRNs' : 'GRNs / SRNs';
  const card = (k, t, d) => `<button type="button" class="opt ${m === k ? 'on' : ''}" data-act="po-method" data-m="${k}"><div class="t"><span class="dot"></span>${t}</div><div class="d">${d}</div></button>`;
  return `
  <div class="fgrid">
    ${F.select('PO Type', 'type', [['Goods', 'Goods'], ['Services', 'Services'], ['Mixed', 'Mixed (goods + services)']], { req: 1, r: 1, hook: 'potype' })}
    ${F.select('Select Vendor', 'supplierId', supOpts(), { req: 1, blank: 'Select Vendor' })}
    ${F.text('Enter Order Title', 'title', { req: 1, ph: 'Order Title' })}
    ${F.select('Select Category', 'category', CATEGORIES.map(c => [c, c]))}
    ${F.select('Billing Office', 'office', officeOpts(), { r: 1, req: 1 })}
    ${F.ro('Currency', 'INR — Indian Rupee')}
    ${F.text('Delivery Date', 'deliveryDate', { type: 'date', req: 1 })}
    ${F.text('End Date (Optional)', 'endDate', { type: 'date' })}
    ${F.select('GST', 'gstRate', GST_RATES.map(r => [r, r + '%']))}
    ${F.ro('Bill Address', `<span style="font-size:12.5px;line-height:1.4;padding:8px 0">${esc(off.address)}<br><span class="muted">GSTIN: ${off.gstin}</span></span>`, { cls: 'span2' })}
  </div>
  <div class="sec-h" style="text-transform:none;font-size:13px;font-weight:500;margin-bottom:8px">Line Items<span class="req" style="color:var(--danger)">*</span></div>
  <table class="li-table"><thead><tr><th>Details</th>${mixed ? '<th style="width:96px">Type</th>' : ''}<th style="width:64px">Qty</th><th style="width:82px">UoM</th><th style="width:100px">Unit Price</th><th style="width:52px">GST</th><th style="width:96px">Total</th><th style="width:52px">Action</th></tr></thead><tbody>
  ${f.lines.map((l, i) => `<tr>
    <td><input class="input" data-f="lines.${i}.desc" value="${esc(l.desc)}" placeholder="${f.type === 'Services' || l.kind === 'Services' ? 'Service description' : 'Item description'}"></td>
    ${mixed ? `<td><select class="input" data-f="lines.${i}.kind" data-r>${opt([['Goods', 'Goods'], ['Services', 'Services']], l.kind || 'Goods')}</select></td>` : ''}
    <td><input class="input num" type="number" min="0" step="any" data-t="num" data-f="lines.${i}.qty" value="${l.qty}"></td>
    <td><select class="input" data-f="lines.${i}.uom">${opt(UOMS, l.uom)}</select></td>
    <td><input class="input num" type="number" min="0" step="any" data-t="num" data-f="lines.${i}.price" value="${l.price}" placeholder="0.00"></td>
    <td class="muted" style="text-align:center">${f.gstRate}%</td>
    <td class="num strong" id="li-amt-${i}"></td>
    <td style="text-align:center"><button type="button" class="icon-btn danger" data-act="ln-del" data-i="${i}" title="Remove line">${icon('trash', 15)}</button></td></tr>`).join('') || '<tr><td class="empty" colspan="${mixed ? 8 : 7}">No Line Items Added</td></tr>'}</tbody></table>
  <div class="li-actions"><button type="button" class="btn btn-green btn-sm" data-act="ln-add">${icon('plus', 13, 2.2)}Add Line Item</button><button type="button" class="stub-btn" data-act="stub" data-name="Bulk Upload">${icon('upload', 14)}Bulk Upload</button></div>
  <div class="li-total" id="li-total"></div>
  <div class="sec-h">Billing method</div>
  <div class="seg-cards">
    ${card('Standard', 'Standard', `Invoice against accepted ${recLabel(f)} value at PO level.`)}
    ${card('Progressive', 'Progressive', 'Many invoices over time, each against accepted work.')}
    ${card('Milestone', 'Milestone', 'Invoices follow a fixed schedule of milestones.')}
  </div>
  ${m === 'Progressive' ? `<div class="field" style="margin-top:14px"><label>Progress is measured by</label><div class="seg-cards" style="grid-template-columns:1fr 1fr">
    <button type="button" class="opt ${f.progressBasis !== 'Certified' ? 'on' : ''}" data-act="po-basis" data-b="Receipt"><div class="t"><span class="dot"></span>Accepted ${recs}</div><div class="d">Each accepted receipt becomes invoice-eligible.</div></button>
    <button type="button" class="opt ${f.progressBasis === 'Certified' ? 'on' : ''}" data-act="po-basis" data-b="Certified" ${f.type !== 'Services' ? 'disabled title="Certified work progress is only available for Services POs"' : ''}><div class="t"><span class="dot"></span>Certified work progress</div><div class="d">${f.type !== 'Services' ? 'Services POs only.' : 'Vendor claims cumulative progress; buyer certifies.'}</div></button></div></div>` : ''}
  ${m === 'Milestone' ? msEditor(f) : ''}
  <div class="sec-h" style="text-transform:none;font-size:14px;font-weight:700">Additional Attachment</div>${attachBox('attachments', f.attachments)}`;
}
/* milestone schedule in the Create PO drawer — same pattern as DICE line items: read-only table, Edit / Delete, "+ Add Milestone" dialog */
const accChips = m => { const acc = [m.needsDoc ? `<span class="acc-chip doc">${icon('doc', 12, 2)}${esc(m.docTitle || 'Document')} approved</span>` : '', m.needsGrn ? `<span class="acc-chip rec">${icon('box', 12, 2)}Accepted GRN</span>` : '', m.needsSrn ? `<span class="acc-chip rec">${icon('truck', 12, 2)}Accepted SRN</span>` : ''].filter(Boolean);
  return (acc.length ? acc.join('') : '<span class="dim-note">Approval only</span>') + (m.allowPartial ? '<span class="acc-chip part">Partial invoicing</span>' : ''); };
function msEditor(f) {
  const lbl = f.type === 'Goods' ? 'GRN' : 'SRN', v = fVal(f), chk = scheduleCheck(f.milestones, v), amts = chk.ok ? chk.amounts : f.milestones.map(m => r2((+m.pct || 0) * v / 100));
  return `<div class="sec-h" style="text-transform:none;font-size:13px;font-weight:500;margin-bottom:8px">Milestone Schedule<span class="req" style="color:var(--danger)">*</span></div>
  <div id="ms-bar"></div>
  <table class="li-table"><thead><tr><th style="width:46px">ID</th><th>Milestone</th><th style="width:60px">% of PO</th><th style="width:96px">Amount</th><th style="width:100px">Due Date</th><th>Acceptance required</th><th style="width:92px">Action</th></tr></thead><tbody>
  ${f.milestones.map((m, i) => `<tr><td><span class="ms-chip" style="background:${MS_COLORS[i % MS_COLORS.length]}">M${i + 1}</span></td><td><b>${esc(m.name || '(unnamed)')}</b></td><td class="num">${fmtNum(+m.pct || 0)}%</td><td class="num strong" id="ms-amt-${i}">${fmtNum(amts[i] || 0)}</td><td class="soft">${m.planned ? fmtD(m.planned) : '—'}</td><td><div class="acc-chips">${accChips(m)}</div></td><td style="white-space:nowrap"><button type="button" class="link" data-act="ms-edit" data-i="${i}">Edit</button> <button type="button" class="link" style="color:var(--danger)" data-act="ms-del" data-i="${i}">Delete</button></td></tr>`).join('') || '<tr><td class="empty" colspan="7">No Milestones Added</td></tr>'}</tbody></table>
  <div class="li-actions" style="margin:4px 0 6px"><button type="button" class="addline" data-act="ms-add">+ Add Milestone</button>${f.milestones.length ? '' : `<button type="button" class="stub-btn" data-act="ms-example">Load example (design · delivery · commissioning certificate)</button>`}</div>
  <p class="hint" style="margin:4px 0 0">Each milestone can require a <b>document approval</b> (uploaded by the supplier, approved with the milestone), accepted <b>GRN(s)</b> for real goods received, accepted <b>SRN(s)</b> for real service delivered, or any combination. A receipt is never created just to prove a certificate. Partial invoicing is configured per milestone.</p>
  <div id="ms-sum"></div>`;
}
function openMsModal(idx) {
  const f = ui.f, edit = idx != null, m = edit ? f.milestones[idx] : { name: '', pct: Math.max(0, r2(100 - f.milestones.reduce((s, x) => s + (+x.pct || 0), 0))) || '', planned: '', needsDoc: false, docTitle: '', needsGrn: false, needsSrn: false, allowPartial: false };
  const canG = f.type !== 'Services' && (f.type === 'Goods' || f.lines.some(l => l.kind !== 'Services')), canS = f.type !== 'Goods' && (f.type === 'Services' || f.lines.some(l => l.kind === 'Services'));
  const opt3 = (name, on, title, desc) => `<label class="check-row accbox"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> <span><b>${title}</b><span class="hint" style="display:block">${desc}</span></span></label>`;
  const ov = openModal({ title: edit ? `Edit milestone M${idx + 1}` : 'Add Milestone', submitLabel: edit ? 'Save' : 'Add', cls: 'wide', html: `<p style="margin:-6px 0 14px;font-size:12.5px">fill out the details</p>
    ${fld('Milestone name', 'name', { value: m.name, ph: 'e.g. Commissioning certificate', req: 1 })}
    <div class="fgrid">${fld('Amount (INR)', 'amount', { type: 'number', step: 'any', value: m.pct ? r2((+m.pct || 0) * fVal(f) / 100) : '', hint: `of PO base value ${money(fVal(f))}` })}${fld('% of PO value', 'pct', { type: 'number', step: 'any', value: m.pct, req: 1, hint: 'Enter the amount or the percentage — the other fills in' })}</div>
    <div class="fgrid">${fld('Due date', 'planned', { type: 'date', value: m.planned })}</div>
    <div class="field"><label>Acceptance required before the milestone value can be invoiced</label>
      ${opt3('needsDoc', m.needsDoc, 'Document approval', 'The supplier uploads the document (e.g. a Commissioning Certificate) with the milestone; the approver approves it. No GRN / SRN is needed for this.')}
      <div id="mm-doc" style="margin:0 0 10px 32px;${m.needsDoc ? '' : 'display:none'}"><input class="input" name="docTitle" value="${esc(m.docTitle || '')}" placeholder="Document name, e.g. Commissioning Certificate"></div>
      ${canG ? opt3('needsGrn', m.needsGrn, 'Accepted GRN', 'One or more GRNs recording the real goods and quantities received, linked to this milestone and accepted.') : ''}
      ${canS ? opt3('needsSrn', m.needsSrn, 'Accepted SRN', 'One or more SRNs recording the real service delivered, linked to this milestone and accepted.') : ''}
      <div class="hint">Tick any combination — or none if the milestone only needs approval.</div></div>
    <div class="field">${opt3('allowPartial', m.allowPartial, 'Allow partial invoicing', 'Invoice this milestone in several parts. Each invoice is limited to the remaining approved balance. Off = one invoice for the full amount.')}</div>`,
    onSubmit: v => {
      if (!String(v.name || '').trim()) { toast('Enter the milestone name', 'err'); return false; }
      if (!(+v.pct > 0)) { toast('Enter an amount or percentage greater than zero', 'err'); return false; }
      const n = { ...(edit ? m : {}), name: v.name.trim(), pct: +v.pct, planned: v.planned || '', needsDoc: !!v.needsDoc, docTitle: v.needsDoc ? (String(v.docTitle || '').trim() || 'Supporting document') : '', needsGrn: !!v.needsGrn, needsSrn: !!v.needsSrn, allowPartial: !!v.allowPartial };
      if (edit) f.milestones[idx] = n; else f.milestones.push(n);
      render();
    } });
  const tot = fVal(f), pi = ov.querySelector('[name=pct]'), ai = ov.querySelector('[name=amount]'), doc = ov.querySelector('#mm-doc');
  pi.addEventListener('input', () => { ai.value = tot ? r2((+pi.value || 0) * tot / 100) : ''; });
  ai.addEventListener('input', () => { pi.value = tot ? parseFloat(((+ai.value || 0) / tot * 100).toFixed(8)) : ''; });
  ov.querySelector('[name=needsDoc]').addEventListener('change', e => { doc.style.display = e.target.checked ? '' : 'none'; });
}
ACT['ms-edit'] = el => openMsModal(+el.dataset.i);
function poPanelFoot() { return `<button class="btn btn-ghost" data-act="po-save">Save as Draft</button><button class="btn btn-dark" data-act="po-submit">Create Order</button>`; }
function poDerive() {
  const f = ui.f; if (!f) return;
  const v = fVal(f), gst = r2(v * (+f.gstRate || 0) / 100);
  f.lines.forEach((l, i) => { const e = $('#li-amt-' + i); if (e) e.textContent = fmtNum(r2((+l.qty || 0) * (+l.price || 0) * (1 + (+f.gstRate || 0) / 100))); });
  const t = $('#li-total'); if (t) t.innerHTML = `<span>Base amount <b>${money(v)}</b></span><span>GST ${f.gstRate}% <b>${money(gst)}</b></span><span>Total <b>${money(r2(v + gst))}</b></span>`;
  if (f.billingMethod === 'Milestone') {
    const chk = scheduleCheck(f.milestones, v), amts = chk.ok ? chk.amounts : f.milestones.map(m => r2((+m.pct || 0) * v / 100));
    f.milestones.forEach((m, i) => { const e = $('#ms-amt-' + i); if (e) e.innerHTML = `${fmtNum(amts[i] || 0)}`; });
    const tot = chk.pctTotal, segs = f.milestones.map((m, i) => `<span title="M${i + 1}" style="width:${Math.max(0, Math.min(100, +m.pct || 0)).toFixed(2)}%;background:${MS_COLORS[i % MS_COLORS.length]}">${(+m.pct || 0) >= 9 ? `M${i + 1} · ${fmtNum(+m.pct)}%` : ''}</span>`).join('');
    const bar = $('#ms-bar'); if (bar) bar.innerHTML = `<div class="alloc-bar ${tot > 100.0001 ? 'over' : ''}">${segs}</div><div class="alloc-meta"><span>${fmtNum(tot)}% of ${money(v)} allocated</span><span class="${Math.abs(tot - 100) < 0.0001 ? 'ok-t' : tot > 100 ? 'bad-t' : 'warn-t'}">${Math.abs(tot - 100) < 0.0001 ? 'fully allocated' : tot > 100 ? `${fmtNum(r2(tot - 100))}% over` : `${fmtNum(r2(100 - tot))}% unallocated`}</span></div>`;
    const s = $('#ms-sum'); if (s) s.innerHTML = f.milestones.length && !chk.ok ? alertBox('warn', 'The schedule is not valid yet', errList(chk.errors)) : '';
  }
}
ACT['ln-add'] = () => { ui.f.lines.push(blankLine()); render(); };
ACT['ln-del'] = el => { ui.f.lines.splice(+el.dataset.i, 1); render(); };
ACT['po-method'] = el => { const f = ui.f; f.billingMethod = el.dataset.m; if (f.billingMethod === 'Milestone' && !f.milestones.length) f.milestones = EXAMPLE_SCHEDULE(f); render(); };
ACT['po-basis'] = el => { ui.f.progressBasis = el.dataset.b; render(); };
ACT['ms-add'] = () => openMsModal(null);
ACT['ms-del'] = el => { ui.f.milestones.splice(+el.dataset.i, 1); render(); };
ACT['ms-example'] = () => { ui.f.milestones = EXAMPLE_SCHEDULE(ui.f); render(); };
ACT['po-save'] = () => done(A.savePO(ui.f, false), r => { closePanel(); go(`#/po/${r.id}`); });
ACT['po-submit'] = () => done(A.savePO(ui.f, true), r => { closePanel(); go(`#/po/${r.id}`); });

/* ---------------------------------------------------------------- detail */
function billTabName(po) { return po.billingMethod === 'Milestone' ? 'Milestones' : poCertified(po) ? 'Progress Claims' : 'Billing'; }
function poDetail(po, r) {
  const tab = r.q.tab || 'overview', s = poSummary(po), st = poStage(po);
  const actions = [];
  if (po.status === 'Draft') actions.push(gbtn('po.edit', 'po-edit', 'Edit', { data: { id: po.id }, icn: 'edit', cls: 'btn-outline' }), gbtn('po.edit', 'po-submit-draft', 'Submit for Approval', { cls: 'btn-soft', data: { id: po.id }, icn: 'check' }));
  if (po.status === 'Pending Approval') actions.push(gbtn('po.edit', 'po-reopen', 'Return to draft', { data: { id: po.id }, cls: 'btn-ghost' }), gbtn('po.approve', 'po-reject', 'Reject', { cls: 'btn-danger', data: { id: po.id } }), gbtn('po.approve', 'po-approve', 'Approve', { cls: 'btn-soft', data: { id: po.id }, icn: 'check' }));
  if (po.status === 'Rejected') actions.push(gbtn('po.edit', 'po-reopen', 'Revise PO', { cls: 'btn-soft', data: { id: po.id }, icn: 'edit' }));
  if (po.status === 'Approved') actions.push(gbtn('po.amend', 'po-amend', 'Amend PO', { data: { id: po.id }, icn: 'edit', cls: 'btn-outline' }));
  const nRec = (hasGoods(po) ? grnsOf(po).length : 0) + (hasServices(po) ? srnsOf(po).length : 0);
  const tabs = [['overview', 'Overview'], ['lines', 'Line Items'], ['billing', billTabName(po)], ['receipts', recLabel(po)], ['invoices', 'Invoice'], ['history', 'History']];
  const body = { overview: poOverview, lines: poLinesTab, billing: poBillingTab, receipts: poReceiptsTab, invoices: poInvoicesTab, history: poHistoryTab }[tab] || poOverview;
  const dots = st.steps.map((_, i) => `<i class="${st.reached[i] ? 'on' : ''} ${i === st.cur && !st.complete ? 'cur' : ''}">${st.reached[i] ? icon('check', 8, 4) : ''}</i>`).join('');
  return `<div class="page po-detail"><div class="ph"><button class="back" data-act="back" title="Back">${icon('back', 18, 2)}</button><div class="po-ttl"><h1>${esc(po.number)}</h1><div class="tags">${poMethodBadge(po)} ${typeBadge(po)}</div></div><div class="right">${actions.join('')}</div></div>
  <div class="stage-row"><div class="stage ${st.tone === 'green' ? '' : st.tone}"><div class="ico">${icon(po.type === 'Goods' ? 'box' : po.type === 'Services' ? 'truck' : 'layers', 24, 1.8)}</div>
    <div class="grow"><div class="t">${esc(st.label)}</div><div class="chips"><span class="chip">Stage ${Math.min(st.cur + 1, 6)}/6</span><span class="chip">${esc(getSup(po.supplierId).name)} · Vendor</span>${po.status !== 'Rejected' && !st.complete ? `<span class="chip">${esc(st.next)}</span>` : ''}</div></div>
    <div class="dots">${dots}</div><div class="pct">${st.pctDone}%</div>${po.status === 'Approved' && !st.complete ? '<span class="live">LIVE</span>' : ''}</div>
    <button class="side-tg" data-act="po-side" title="${ui.poSideOff ? 'Show' : 'Hide'} side panel">${icon(ui.poSideOff ? 'chevLeft' : 'chevRight', 14, 2.2)}</button></div>
  ${tabsHtml(tabs, tab, `#/po/${po.id}`)}
  <div>${body(po, s)}</div></div>`;
}
ACT['po-side'] = () => { ui.poSideOff = !ui.poSideOff; render(); };
ACT['po-submit-draft'] = el => done(A.savePO(poDraftExisting(getPO(el.dataset.id)), true));
ACT['po-approve'] = el => confirmBox({ title: 'Approve purchase order', message: `Approve <b>${esc(getPO(el.dataset.id).number)}</b>? It becomes available for ${recName(getPO(el.dataset.id))}${getPO(el.dataset.id).billingMethod === 'Milestone' ? ' and milestone work' : ''} and invoice selection.`, confirmLabel: 'Approve', onConfirm: () => done(A.approvePO(el.dataset.id)) });
ACT['po-reject'] = el => reasonModal({ title: 'Reject purchase order', label: 'Rejection reason', btn: 'Reject PO', onSubmit: reason => { done(A.rejectPO(el.dataset.id, reason)); } });
ACT['po-reopen'] = el => done(A.reopenPO(el.dataset.id));

/* what the user can do next on this PO */
function nextSteps(po, s) {
  const out = [];
  if (po.status === 'Draft') out.push(['Submit the PO for approval.', gbtn('po.edit', 'po-submit-draft', 'Submit for Approval', { cls: 'btn-primary btn-sm', data: { id: po.id } })]);
  else if (po.status === 'Pending Approval') out.push(['Waiting for the Procurement Manager.', gbtn('po.approve', 'po-approve', 'Approve', { cls: 'btn-primary btn-sm', data: { id: po.id } })]);
  else if (po.status === 'Rejected') out.push(['The PO was rejected — revise and resubmit.', gbtn('po.edit', 'po-reopen', 'Revise PO', { cls: 'btn-primary btn-sm', data: { id: po.id } })]);
  else if (po.status === 'Approved') {
    if (po.billingMethod === 'Milestone') msOf(po).forEach(m => {
      const g = msGate(m, po), open = (label, cls = 'btn-outline btn-xs') => actBtn('ms-open', label, { data: { id: m.id }, cls });
      if (m.status === 'Pending') out.push([`${m.code} ${esc(m.name)} — work not started${m.needsDoc ? `; the supplier must upload the ${esc(docTitleOf(m))}` : ''}.`, open('Open')]);
      else if (m.status === 'In Progress') out.push([`${m.code} ${esc(m.name)} — in progress; submit it with its evidence${m.needsDoc ? ` (${esc(docTitleOf(m))} is mandatory)` : ''}.`, open('Submit', 'btn-primary btn-xs')]);
      else if (m.status === 'Submitted for Approval') out.push([`${m.code} ${esc(m.name)} — submitted, waiting for the approver.`, open('Review', 'btn-primary btn-xs')]);
      else if (m.status === 'Under Review') out.push([`${m.code} ${esc(m.name)} — under review.`, open('Decide', 'btn-primary btn-xs')]);
      else if (m.status === 'Rejected') out.push([`${m.code} ${esc(m.name)} — rejected (${esc(m.rejectReason)}); the supplier must resubmit.`, open('Open')]);
      else if (m.status === 'Approved' && !g.ok) out.push([`${m.code} approved — invoicing blocked: ${esc(g.reason)}.`, open('Open')]);
      else if (msEnt(m, po) > 0 && usage('milestone', m.id).value < m.amount - EPS) out.push([`${m.code} ${esc(m.name)} — approved and cleared, ${money(m.amount - usage('milestone', m.id).value)} ready to invoice.`, gbtn('inv.create', 'inv-new', 'Submit Invoice', { cls: 'btn-primary btn-xs', data: { po: po.id, ms: m.id } })]);
    });
    else if (poCertified(po)) {
      if (claimsOf(po).some(c => c.status === 'Submitted')) out.push(['A progress claim is awaiting certification.', actBtn('go', 'Review', { data: { hash: `#/po/${po.id}?tab=billing` }, cls: 'btn-primary btn-xs' })]);
      else out.push(['Vendor raises the next progress claim.', gbtn('claim.create', 'claim-new', 'New claim', { cls: 'btn-outline btn-xs', data: { po: po.id } })]);
      if (s.remaining > EPS) out.push([`${money(s.remaining)} of certified progress is ready to invoice.`, gbtn('inv.create', 'inv-new', 'Submit Invoice', { cls: 'btn-primary btn-xs', data: { po: po.id } })]);
    } else {
      if (hasGoods(po) && s.remainingPOQty > EPS) out.push([`${fmtNum(s.remainingPOQty)} units are still to be received.`, gbtn('grn.create', 'grn-new', 'Create GRN', { cls: 'btn-outline btn-xs', data: { po: po.id } })]);
      if (hasServices(po) && sum(serviceLines(po), l => lineServiceStats(po, l).remaining) > EPS) out.push(['Service value is still to be received.', gbtn('srn.create', 'srn-new', 'Create SRN', { cls: 'btn-outline btn-xs', data: { po: po.id } })]);
      const pend = [...(hasGoods(po) ? grnsOf(po).filter(g => g.status === 'Pending Inspection') : []), ...(hasServices(po) ? srnsOf(po).filter(x => x.status === 'Pending Acceptance') : [])];
      if (pend.length) out.push([`${pend.length} receipt${pend.length > 1 ? 's' : ''} awaiting inspection / acceptance — not invoice-eligible yet.`, actBtn('go', 'Open', { data: { hash: `#/po/${po.id}?tab=receipts` }, cls: 'btn-outline btn-xs' })]);
      if (s.remaining > EPS) out.push([`${money(s.remaining)} is accepted and ready to invoice.`, gbtn('inv.create', 'inv-new', 'Submit Invoice', { cls: 'btn-primary btn-xs', data: { po: po.id } })]);
    }
  }
  return out;
}
function poOverview(po, s) {
  const total = s.value || 1, w = x => pct(x, total).toFixed(2), off = officeOf(po.office), sup = getSup(po.supplierId);
  const paid = s.paid, apprOnly = r2(s.approved - s.paid), res = s.reserved, avail = s.remaining;
  const log = db.audit.filter(a => a.poId === po.id).slice(0, 7), next = nextSteps(po, s);
  const basis = po.billingMethod === 'Progressive' ? (poCertified(po) ? 'Certified work progress' : `Accepted ${recName(po)}s`) : po.billingMethod === 'Milestone' ? `${msOf(po).length} milestones` : `Accepted ${recName(po)}s, PO level`;
  return `<div class="main-grid ${ui.poSideOff ? 'side-off' : ''}"><div>
    <div class="ov-top"><h2>Overview</h2><span class="spacer"></span>${actBtn('po-view', 'View Purchase Order', { cls: 'btn-primary', data: { id: po.id } })}</div>
    <div class="stat-row"><div class="stat green"><b>${esc(po.status)}</b><span>Status</span></div><div class="stat peach"><b>${esc(po.createdBy)}</b><span>Raised By</span></div><div class="stat pink"><b>${esc(po.category)}</b><span>Category</span></div><div class="stat gray"><b>${money(s.value)}</b><span>Amount (excl. GST)</span></div></div>
    <div class="meta-row"><div><div class="k">PO Title</div><div class="v">${esc(po.title)}</div></div><div><div class="k">Creation Date</div><div class="v">${fmtD(po.poDate)}</div></div><div><div class="k">Delivery Date</div><div class="v">${fmtD(po.deliveryDate)}</div></div><div><div class="k">End Date</div><div class="v">${fmtD(po.endDate)}</div></div></div>
    <div class="cards-3" style="margin-top:22px">
      <div class="card"><div class="card-t">Supplier Details</div><div class="strong" style="margin-bottom:8px">${esc(sup.name)}</div><div class="dl"><span class="k">Email</span><span>${esc(sup.email)}</span><span class="k">Mobile</span><span>${esc(sup.mobile)}</span><span class="k">GSTIN</span><span>${esc(sup.gstin)}</span></div></div>
      <div class="card"><div class="card-t">Billing Details</div><div class="strong" style="margin-bottom:8px">${esc(off.name)}</div><div class="dl"><span class="k">Address</span><span>${esc(off.address)}</span><span class="k">GSTIN</span><span>${esc(off.gstin)}</span></div></div>
      <div class="card"><div class="card-t">Billing Setup</div><div style="margin-bottom:10px">${poMethodBadge(po)}</div><div class="dl"><span class="k">Based on</span><span>${esc(basis)}</span><span class="k">GST</span><span>${gstOf(po)}%</span><span class="k">Receipt</span><span>${recName(po)} (${po.type.toLowerCase()})</span></div></div>
    </div>
    <div class="sec">Billing summary</div>
    ${strip([['PO value', money(s.value), 'excl. GST'], ['Accepted', money(s.accepted), po.billingMethod === 'Milestone' ? 'approved milestones' : poCertified(po) ? 'certified' : `accepted ${recName(po)}s`], ['Invoiced', money(s.invoiced), `in flight: ${money(s.reserved)}`], ['Approved', money(s.approved), 'approved · posted · paid'], ['Paid', money(s.paid), 'demo payments'], ['Ready to invoice', money(s.remaining), 'accepted − invoiced', 'hl']])}
    <div class="card flat" style="margin-top:14px"><div class="bar"><span class="b-paid" style="width:${w(paid)}%"></span><span class="b-appr" style="width:${w(apprOnly)}%"></span><span class="b-res" style="width:${w(res)}%"></span><span class="b-avail" style="width:${w(avail)}%"></span></div>
      <div class="legend"><span><i style="background:#1F9D63"></i>Paid ${money(paid)}</span><span><i style="background:#7BC79B"></i>Approved, unpaid ${money(apprOnly)}</span><span><i style="background:#F0B24A"></i>Invoiced, in approval ${money(res)}</span><span><i style="background:var(--primary)"></i>Ready to invoice ${money(avail)}</span><span><i style="background:#E9E9F0"></i>Not yet accepted ${money(Math.max(0, r2(s.value - paid - apprOnly - res - avail)))}</span></div></div>
    ${hasGoods(po) ? `<div class="sec">Goods quantities</div>${strip([['Ordered', fmtNum(sum(goodsLines(po), l => l.qty)) + ' units'], ['Delivered', fmtNum(s.receivedQty) + ' units'], ['Accepted', fmtNum(s.acceptedQty) + ' units'], ['Rejected', fmtNum(s.rejectedQty) + ' units', 'not invoice-eligible'], ['Still to receive', fmtNum(s.remainingPOQty) + ' units', '', 'hl']])}` : ''}
    <div class="sec">Line Items</div>${lineTable(po)}
    <div class="ov-sec"><div class="ov-h">${esc(billTabName(po))}</div>${poBillingTab(po, s)}</div>
    <div class="ov-sec"><div class="ov-h">${recLabel(po)}</div>${rcTab(po, true)}</div>
    <div class="ov-sec"><div class="ov-h">Invoices</div>${poInvoicesTab(po)}</div>
    <div class="ov-sec"><div class="ov-h">History</div>${poHistoryTab(po)}</div>
  </div>
  <div>
    <div class="side-card"><h4>What's next</h4>${next.length ? next.map(([t, b]) => `<div class="attn"><div style="flex:1;line-height:1.45">${t}</div>${b}</div>`).join('') : `<div class="hint">${po.status === 'Approved' ? 'Nothing is waiting on you for this PO right now.' : 'No action available.'}</div>`}</div>
    <div class="side-card"><h4 style="display:flex;align-items:center;gap:10px">Timeline<span class="spacer" style="flex:1"></span></h4>
      <div class="row" style="margin-bottom:14px"><span class="tat">Overall TAT: ${tatOf(po)}</span><span class="spacer"></span><button class="btn-orange" data-act="po-export" data-id="${po.id}">${icon('download', 14, 2)}Export</button></div>
      ${tlItems(po).join('') || '<div class="hint">No activity yet.</div>'}
      <div style="text-align:right"><button class="link" style="font-size:12px" data-act="go" data-hash="#/po/${po.id}?tab=history">View full history</button></div></div>
    <div class="side-card"><h4>Delegate Access</h4><div class="boxline"><button class="btn-dk" data-act="stub" data-name="Forward Request">+ Forward Request</button></div></div>
    <div class="side-card"><h4>Multiple Email</h4><div class="boxline">No Email Tagged</div></div>
    <div class="side-card"><h4>Support Ticket</h4><div class="boxline"><button class="btn-dk" data-act="stub" data-name="Support conversation">+ Start Conversation</button></div></div>
    <div class="side-card"><h4>PO copy send to vendor</h4><div class="boxline"><div class="row"><span class="pill red" style="font-size:10px;border-radius:5px">PDF</span></div><button class="btn-dk" style="margin-top:10px" data-act="po-send" data-id="${po.id}">Send Copy</button></div></div>
    <div class="side-card"><h4>Contract List</h4><div class="hint" style="text-align:center;padding:10px">No contract found</div></div>
  </div></div>`;
}
/* PO line table — shared by Overview and Line Items */
function lineTable(po) {
  return `<div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Details</th>${po.type === 'Mixed' ? '<th>Type</th>' : ''}<th>Delivery Address</th><th class="right">Qty / Unit</th><th class="right">Price / Unit</th><th class="right">Delivered</th><th class="right">Accepted</th><th class="right">Balance</th><th class="right">GST</th><th class="right">Amount</th></tr></thead><tbody>
  ${po.lines.map(l => { const g = lineKind(po, l) === 'Goods', st = g ? lineReceiptStats(po, l) : lineServiceStats(po, l), ss = srnsOf(po).filter(x => x.lineId === l.id);
    return `<tr><td class="strong">${esc(l.desc)}<div class="sub" style="font-weight:400">Line ${l.no}</div></td>${po.type === 'Mixed' ? `<td><span class="t-badge ${g ? '' : 't-services'}">${g ? 'Goods' : 'Service'}</span></td>` : ''}<td>${esc(officeOf(po.office).name)}</td><td class="num">${fmtNum(l.qty)} ${esc(l.uom)}</td><td class="num">${money(l.price)} / ${esc(l.uom)}</td>
      <td class="num">${g ? fmtNum(st.receivedQty) : money(sum(ss.filter(x => x.status !== 'Rejected'), x => x.serviceValue))}</td><td class="num">${g ? fmtNum(st.acceptedQty) : money(st.accepted)}</td><td class="num strong">${g ? fmtNum(st.remaining) : money(st.remaining)}</td><td class="num">${gstOf(po)}%</td><td class="num strong">${money(lineNet(l))}</td></tr>`; }).join('')}
  <tr class="total"><td colspan="${po.type === 'Mixed' ? 9 : 8}" class="right">Total (excl. GST)</td><td class="num">${money(poNet(po))}</td></tr></tbody></table></div>`;
}
const poLinesTab = po => `<div style="margin-top:22px">${lineTable(po)}</div><p class="hint" style="margin-top:10px">GST (${gstOf(po)}%) is added on invoices: ${money(r2(poNet(po) * gstOf(po) / 100))} on the full PO value, ${money(poValueGross(po))} in total.</p>`;

function poBillingTab(po, s) {
  if (po.billingMethod === 'Milestone') return milestoneTable(po, s);
  if (poCertified(po)) return claimsBlock(po, s);
  return receiptEntitlementTable(po, s, po.billingMethod === 'Progressive');
}
function poReceiptsTab(po) { return rcTab(po); }
function poInvoicesTab(po) {
  const invs = invsOf(po);
  return `<div class="sec" style="margin-top:22px">Invoices${po.status === 'Approved' ? `<button class="plus-circle" data-act="inv-new" data-po="${po.id}" title="Submit Invoice">${icon('plus', 18, 2.4)}</button>` : ''}</div>
  ${invs.length ? `<div class="inv-cards">${invs.map(i => `<div class="inv-card" data-act="inv-view" data-id="${i.id}"><div class="inv-thumb"><i></i><i></i><i></i></div>
    <div class="inv-ref">${invRef(i)}</div><div class="inv-amt">INR ${fmtNum(i.gross)}</div>
    <div class="inv-meta"><div>Vendor: ${esc(getSup(po.supplierId).name)}</div><div>Owner: ${esc(i.createdBy || po.createdBy)}</div><div>Date: ${fmtD(i.date)}</div><div>Bill No.: ${esc(i.number)}</div><div>Against: ${esc(i.allocs.map(allocRefLabel).join(', ') || 'PO level')}</div></div>
    <div class="inv-foot">${sb(i.status)}${i.match ? sb(i.match.result) : ''}</div></div>`).join('')}</div>`
    : `<div class="po-empty">${icon('box', 22, 1.6)}<span>No Invoice Submitted yet</span></div>`}`;
}
function poHistoryTab(po) {
  const log = db.audit.filter(a => a.poId === po.id);
  return `<div class="cards-2" style="margin-top:22px;align-items:start"><div class="timeline-card"><div class="card-t">Approvals</div><ul class="tl">${po.approvals.map(a => `<li class="${a.action === 'Approved' ? 'ok' : a.action === 'Rejected' ? 'bad' : ''}"><div class="tt">${esc(a.action)}</div><div class="tm">${esc(a.by)} · ${fmtDT(a.at)}${a.note ? ' — ' + esc(a.note) : ''}</div></li>`).join('') || '<li><div class="tm">No approval activity yet.</div></li>'}</ul>
    <div class="card-t" style="margin-top:14px">Amendments</div><ul class="tl">${po.amendments.map(a => `<li class="amber"><div class="tt">v${a.version} — ${money(a.valueBefore)} → ${money(a.valueAfter)}</div><div class="tm">${esc(a.by)} · ${fmtDT(a.at)} · ${esc(a.reason)}</div><div class="hint">${esc(a.changes.join('; ') || 'No value change')}</div></li>`).join('') || '<li><div class="tm">No amendments.</div></li>'}</ul></div>
  <div class="timeline-card"><div class="card-t">Audit trail</div><ul class="tl">${log.map(a => `<li class="${a.kind === 'ok' ? 'ok' : a.kind === 'bad' ? 'bad' : a.kind === 'alloc' ? 'amber' : ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.ref)} · ${esc(a.by)} · ${fmtDT(a.at)}</div></li>`).join('') || '<li><div class="tm">No activity.</div></li>'}</ul></div></div>`;
}

/* ----- View Purchase Order (document preview) ----- */
ACT['po-view'] = el => {
  const po = getPO(el.dataset.id);
  openPanel({ key: 'po-view', mid: true, title: po.number, sub: `${esc(po.title)} · ${fmtD(po.poDate)}`, body: () => { const sup = getSup(po.supplierId), off = officeOf(po.office), net = poNet(po), gst = r2(net * gstOf(po) / 100);
    return `<div class="doc"><h3>PURCHASE ORDER</h3>
    <div class="box"><div><b>Vendor</b>${esc(sup.name)}<br>${esc(sup.email)}<br>GSTIN ${esc(sup.gstin)}</div><div class="r"><b>PO Number</b>${esc(po.number)}<br>Date ${fmtD(po.poDate)}<br>Delivery by ${fmtD(po.deliveryDate)}</div>
      <div><b>Bill to</b>${esc(off.name)}<br>${esc(off.address)}<br>GSTIN ${off.gstin}</div><div class="r"><b>Billing method</b>${esc(methodLabel(po))}<br>Type ${esc(po.type)}<br>Version v${po.version}</div></div>
    <table><thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>${po.lines.map(l => `<tr><td>${l.no}</td><td>${esc(l.desc)}</td><td class="r">${fmtNum(l.qty)} ${esc(l.uom)}</td><td class="r">${fmtNum(l.price)}</td><td class="r">${gstOf(po)}%</td><td class="r">${fmtNum(lineNet(l))}</td></tr>`).join('')}</tbody></table>
    <div class="totals"><div><span>Base amount</span><span>${fmtNum(net)}</span></div><div><span>GST ${gstOf(po)}%</span><span>${fmtNum(gst)}</span></div><div class="g"><span>Total (INR)</span><span>${fmtNum(r2(net + gst))}</span></div></div>
    ${po.billingMethod === 'Milestone' ? `<div class="sec-h">Payment milestones</div><table><thead><tr><th>#</th><th>Milestone</th><th class="r">%</th><th class="r">Amount</th></tr></thead><tbody>${msOf(po).map(m => `<tr><td>${m.code}</td><td>${esc(m.name)}<div class="muted" style="font-size:11px">${[m.needsDoc ? esc(docTitleOf(m)) + ' approved' : '', m.needsGrn ? 'accepted GRN' : '', m.needsSrn ? 'accepted SRN' : ''].filter(Boolean).join(' + ') || 'approval only'}${m.allowPartial ? ' · partial invoicing' : ''}</div></td><td class="r">${fmtNum(m.pct)}%</td><td class="r">${fmtNum(m.amount)}</td></tr>`).join('')}</tbody></table>` : ''}</div>`; } });
};

/* ----- amend PO ----- */
ACT['po-amend'] = el => {
  const po = getPO(el.dataset.id), ms = po.billingMethod === 'Milestone' ? msOf(po) : [];
  const lockedMs = msLocked;
  openModal({ title: `Amend ${po.number} (v${po.version} → v${po.version + 1})`, cls: 'xwide', submitLabel: 'Apply amendment', html: `
    ${alertBox('info', 'Historical records are preserved', 'Invoice allocations, receipts and approvals already recorded are never rewritten. Prices are locked on lines that already have receipts or invoices; quantities cannot fall below what is already received.')}
    <div class="sec-h">PO lines</div>
    <table class="tbl sm"><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit price</th><th class="right">Current value</th></tr></thead><tbody>${po.lines.map(l => { const touched = grnsOf(po).some(g => g.lineId === l.id) || srnsOf(po).some(s => s.lineId === l.id) || invsOf(po).some(isLive); return `<tr><td>${l.no}</td><td>${esc(l.desc)}</td><td><input class="input sm num" style="width:100px" name="q_${l.id}" type="number" step="any" value="${l.qty}"></td><td><input class="input sm num" style="width:120px" name="p_${l.id}" type="number" step="any" value="${l.price}" ${touched ? 'readonly title="Locked — receipts/invoices exist"' : ''}> ${touched ? icon('lock', 13) : ''}</td><td class="num">${fmtNum(lineNet(l))}</td></tr>`; }).join('')}</tbody></table>
    ${ms.length ? `<div class="sec-h">Milestone schedule <span class="hint" style="text-transform:none;font-weight:400">(% of the amended PO value — must total 100%; locked milestones keep their amount)</span></div>
    <table class="tbl sm"><thead><tr><th>ID</th><th>Name</th><th>%</th><th class="right">Current amount</th><th>Due date <span class="hint" style="text-transform:none;font-weight:400">(can always be rescheduled)</span></th><th>State</th><th>Cancel</th></tr></thead><tbody>${ms.map(m => { const lk = lockedMs(m); return `<tr><td class="strong">${m.code}</td><td><input class="input sm" name="mn_${m.id}" value="${esc(m.name)}" ${lk ? 'readonly' : ''}></td><td><input class="input sm num" style="width:100px" name="mv_${m.id}" type="number" step="any" value="${m.pct}" ${lk ? 'readonly' : ''}></td><td class="num">${fmtNum(m.amount)}</td><td><input class="input sm" style="width:150px" type="date" name="md_${m.id}" value="${esc(m.planned || '')}"></td><td>${lk ? `<span class="lock">${icon('lock', 13)} Locked — ${usage('milestone', m.id).value > EPS ? 'invoiced' : m.status.toLowerCase()}</span>` : sb(m.status)}</td><td>${lk ? `<span class="hint" title="Submitted, approved or invoiced milestones cannot be cancelled">—</span>` : `<label class="check-row"><input type="checkbox" name="mx_${m.id}"> Remove</label>`}</td></tr>`; }).join('')}
      <tr><td class="strong">New</td><td><input class="input sm" name="new_name" placeholder="Add milestone (optional)"></td><td><input class="input sm num" style="width:100px" name="new_val" type="number" step="any" placeholder="%"></td><td colspan="4" class="hint">Leave blank to skip (the new milestone starts Pending and needs no extra acceptance — edit it after if needed)</td></tr></tbody></table>` : ''}
    <div style="margin-top:16px">${fld('Amendment reason', 'reason', { rows: 2, req: true, ph: 'Why is the PO being amended?' })}</div>`,
    onSubmit: v => {
      const lines = po.lines.map(l => ({ id: l.id, qty: +v['q_' + l.id], price: +v['p_' + l.id] }));
      const msIn = ms.map(m => ({ id: m.id, name: v['mn_' + m.id], pct: +v['mv_' + m.id], planned: v['md_' + m.id], remove: !!v['mx_' + m.id] }));
      if (String(v.new_name || '').trim() && +v.new_val > 0) msIn.push({ id: 'new', name: v.new_name, pct: +v.new_val });
      const r = A.amendPO(po.id, { lines, milestones: msIn, reason: v.reason });
      if (!r.ok) { errorModal(r.msg, r.errors); return false; }
      toast(r.msg); render();
    } });
};

/* DICE-style timeline cards: who did what, with TAT chips */
function tlItems(po) {
  const ev = [...po.approvals].map(a => ({ t: a.action, who: a.by, at: a.at, note: a.note })).reverse();
  return ev.slice(0, 4).map((e, i, arr) => { const prev = arr[i + 1], tat = prev ? Math.max(0, Math.round((new Date(e.at) - new Date(prev.at)) / 60000)) : 0;
    return `<div class="tl-item"><div class="st"><span class="chip-done">COMPLETED</span><span class="chip-done">TAT: ${tat}m</span></div><div class="who"><span class="ok-dot"></span><div><b style="font-size:12px">${esc(e.t)}</b><div class="meta">${esc(e.who)}${e.note ? ' — ' + esc(e.note) : ''}<br>Sent on: ${fmtDT(e.at)}</div></div></div></div>`; });
}
function tatOf(po) { const a = po.approvals; if (!a.length) return '0m'; const m = Math.max(0, Math.round((new Date(a[a.length - 1].at) - new Date(po.createdAt)) / 60000)); return m < 60 ? m + 'm' : Math.round(m / 60) + 'h'; }
ACT['po-send'] = el => toast(`${getPO(el.dataset.id).number} PDF sent to ${getSup(getPO(el.dataset.id).supplierId).name} (simulated)`);
ACT['po-export'] = el => { const po = getPO(el.dataset.id), rows = db.audit.filter(a => a.poId === po.id).map(a => [fmtDT(a.at), a.by, a.ref, a.text].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const url = URL.createObjectURL(new Blob([['"When","By","Ref","Event"', ...rows].join('\n')], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `timeline-${po.id}.csv`; document.body.appendChild(a); a.click(); a.remove(); toast('Timeline exported'); };
