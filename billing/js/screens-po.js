/* =====================================================================
   screens-po.js — PO list, create/edit wizard (incl. schedule builder), PO detail
   ===================================================================== */
const notFound = what => `<div>${pageHead({ title: `${what} not found` })}<div class="content"><div class="empty-state">That record does not exist (the demo data may have been reset).<br><br>${actBtn('go', 'Go to dashboard', { cls: 'btn-primary', data: { hash: '#/dashboard' } })}</div></div></div>`;
const CATEGORIES = ['Goods', 'Services', 'Project Services'];
const TERMS = ['Net 30', 'Net 45', 'Net 60', 'Advance 20% / Net 30'];
const UOMS = ['Units', 'Lot', 'Man-days', 'Hours', 'Sets', 'Metres'];
const LOCATIONS = ['Jebel Ali Plant — Warehouse A', 'Jebel Ali Plant — Site', 'DICE HQ — Dubai Investments Park', 'Sharjah Distribution Centre'];
const APPROVERS_LIST = ['Procurement Manager', 'Warehouse / Service Receiver', 'Project Engineer'];
const EXAMPLE_SCHEDULE = () => [
  { name: 'Design Approval', description: 'Detailed design package approved by DICE engineering.', pct: 20, amount: 0, planned: daysFromNow(30), criteria: 'Signed design approval certificate', evidenceReq: 'Approved drawings, sign-off sheet', approver: 'Procurement Manager', srnRequired: false },
  { name: 'Installation Complete', description: 'Machinery delivered and mechanically installed.', pct: 50, amount: 0, planned: daysFromNow(75), criteria: 'Installation checklist signed', evidenceReq: 'Installation report, photos', approver: 'Procurement Manager', srnRequired: false },
  { name: 'Commissioning Complete', description: 'Commissioning, trial run and handover.', pct: 30, amount: 0, planned: daysFromNow(110), criteria: 'Trial-run certificate', evidenceReq: 'Commissioning certificate', approver: 'Procurement Manager', srnRequired: false },
];

/* ---------------------------------------------------------------- list */
ROUTES.pos = () => `<div>${pageHead({ title: 'Purchase Orders', crumbs: [['Purchase Orders']], right: gbtn('po.edit', 'po-new', 'Create PO', { cls: 'btn-primary', icn: 'plus' }) })}
  <div class="content">${listHtml('pos', {
    searchPh: 'Search PO number, supplier, line…', defaults: {},
    filters: [
      { name: 'status', label: 'Status', options: () => ['Draft', 'Pending Approval', 'Approved', 'Rejected'] },
      { name: 'method', label: 'Billing method', options: () => ['Standard', 'Progressive', 'Milestone'] },
      { name: 'supplier', label: 'Supplier', options: () => supOpts() }],
    rows: () => db.pos.slice().sort((a, b) => b.number.localeCompare(a.number)),
    match: (p, st) => matchText(st, p.number, getSup(p.supplierId).name, p.lines.map(l => l.desc).join(' ')) && matchIn(st, 'status', p.status) && matchIn(st, 'method', p.billingMethod) && matchIn(st, 'supplier', p.supplierId),
    cols: ['PO number', 'Supplier', 'Category', 'Billing method', 'PO date', '>PO value', '>Accepted', '>Invoiced', '>Remaining eligible', 'Status', ''],
    row: p => { const s = poSummary(p); return `<tr class="click" data-act="go" data-hash="#/po/${p.id}"><td class="strong">${esc(p.number)}${p.version > 1 ? ` <span class="badge-s s-gray">v${p.version}</span>` : ''}</td><td>${esc(getSup(p.supplierId).name)}<div class="sub">${esc(getSup(p.supplierId).code)}</div></td><td>${esc(p.category)}</td><td>${poMethodBadge(p)}</td><td class="nowrap">${fmtD(p.poDate)}</td><td class="num">${fmtNum(s.value)}</td><td class="num">${p.status === 'Approved' ? fmtNum(s.accepted) : '—'}</td><td class="num">${p.status === 'Approved' ? fmtNum(s.invoiced) : '—'}</td><td class="num strong">${p.status === 'Approved' ? fmtNum(s.remaining) : '—'}</td><td>${sb(p.status)}</td><td class="act">${icon('chevRight', 12)}</td></tr>`; },
  })}</div></div>`;
ACT['po-new'] = () => go('#/po/new');

/* ---------------------------------------------------------------- router */
ROUTES.po = r => {
  const id = r.parts[1], sub = r.parts[2];
  if (id === 'new') return poForm(r, null);
  const po = getPO(id); if (!po) return notFound('Purchase order');
  if (sub === 'edit') { if (po.status !== 'Draft') { return poDetail(po, r); } return poForm(r, po); }
  return poDetail(po, r);
};

/* ---------------------------------------------------------------- create / edit wizard */
function blankLine(cat) { return { code: '', desc: '', qty: 1, uom: cat === 'Goods' ? 'Units' : 'Lot', price: 0, taxCode: 'VAT5', location: LOCATIONS[0], receiptType: cat === 'Goods' ? 'Goods' : 'Services' }; }
function poDraftFrom(po) {
  if (!po) return { id: null, supplierId: 'sup1', buyer: 'DICE Manufacturing LLC', poDate: todayISO(), deliveryDate: daysFromNow(60), terms: 'Net 30', category: 'Goods', billingMethod: '', progressBasis: 'Receipt', requireSrn: false, partialMilestone: false, overReceiptPct: 0, lines: [blankLine('Goods')], scheduleMode: 'percent', scheduleException: { allow: false, note: '' }, scheduleFinal: false, milestones: [], step: 1 };
  return { id: po.id, supplierId: po.supplierId, buyer: po.buyer, poDate: po.poDate, deliveryDate: po.deliveryDate, terms: po.terms, category: po.category, billingMethod: po.billingMethod, progressBasis: po.progressBasis, requireSrn: po.requireSrn, partialMilestone: po.partialMilestone, overReceiptPct: po.overReceiptPct || 0,
    lines: po.lines.map(l => ({ ...l })), scheduleMode: po.scheduleMode || 'percent', scheduleException: { ...(po.scheduleException || { allow: false, note: '' }) }, scheduleFinal: po.scheduleStatus === 'Final', step: +ui.r.q.step || 1, milestones: msOf(po).map(m => ({ ...m })) };
}
const fVal = f => r2(f.lines.reduce((s, l) => s + (+l.qty || 0) * (+l.price || 0), 0));
function poForm(r, po) {
  const key = po ? po.id : 'new';
  if (!ui.f || ui.fKey !== key) { ui.f = poDraftFrom(po); ui.fKey = key; }
  const f = ui.f, nextNo = po ? po.number : `PO-2026-${Math.max(1041, ...db.pos.map(p => +p.number.split('-').pop())) + 1}`;
  const steps = ['PO header', 'Line items', 'Billing configuration', 'Review & approval'];
  const body = [stepHeader, stepLines, stepBilling, stepReview][f.step - 1](f, nextNo);
  ui.derive = poDerive;
  return `<div>${pageHead({ title: po ? `Edit ${po.number}` : 'Create Purchase Order', crumbs: [['Purchase Orders', '#/pos'], [po ? po.number : 'New PO']], right: `<span class="badge-s s-gray">Draft</span>` })}
  <div class="content">
    <div class="stepper">${steps.map((s, i) => `<button class="step ${f.step === i + 1 ? 'on' : f.step > i + 1 ? 'done' : ''}" data-act="po-step" data-n="${i + 1}"><span class="n">${f.step > i + 1 ? '✓' : i + 1}</span>${s}</button>`).join('')}</div>
    <div style="margin-top:14px">${body}</div>
    <div class="form-actions">
      ${f.step > 1 ? actBtn('po-step', 'Back', { cls: 'btn-outline', data: { n: f.step - 1 } }) : ''}<span class="spacer"></span>
      ${actBtn('po-save', 'Save as Draft', { cls: 'btn-outline' })}
      ${f.step < 4 ? actBtn('po-step', 'Next', { cls: 'btn-primary', data: { n: f.step + 1 } }) : actBtn('po-submit', 'Submit for Approval', { cls: 'btn-primary', icn: 'check' })}
    </div></div></div>`;
}
ACT['po-step'] = el => { ui.f.step = +el.dataset.n; render(); };
ACT['po-save'] = () => done(A.savePO(ui.f, false), r => { ui.f = null; go(`#/po/${r.id}`); });
ACT['po-submit'] = () => done(A.savePO(ui.f, true), r => { ui.f = null; go(`#/po/${r.id}`); });
HOOKS.category = (el, v) => { const f = ui.f; f.lines.forEach(l => { l.receiptType = v === 'Goods' ? 'Goods' : 'Services'; if (l.uom === 'Units' && v !== 'Goods') l.uom = 'Lot'; }); f.requireSrn = v !== 'Goods'; f.milestones.forEach(m => m.srnRequired = f.requireSrn); };

function stepHeader(f, nextNo) {
  return `<div class="card"><h3>PO header</h3><div class="fgrid">
    <div class="field"><label>PO number</label><div class="ro">${esc(nextNo)} <span class="hint">&nbsp;(auto-generated)</span></div></div>
    <div class="field"><label>Supplier *</label><select class="input" data-f="supplierId" data-r>${opt(supOpts(), f.supplierId)}</select></div>
    <div class="field"><label>Buyer entity</label><div class="ro">${esc(f.buyer)}</div></div>
    <div class="field"><label>PO date *</label><input class="input" type="date" data-f="poDate" value="${esc(f.poDate)}"></div>
    <div class="field"><label>Delivery date</label><input class="input" type="date" data-f="deliveryDate" value="${esc(f.deliveryDate)}"></div>
    <div class="field"><label>Currency</label><div class="ro">AED — UAE Dirham</div></div>
    <div class="field"><label>Payment terms</label><select class="input" data-f="terms" data-r>${opt(TERMS, f.terms)}</select></div>
    <div class="field"><label>PO category *</label><select class="input" data-f="category" data-hook="category" data-r>${opt(CATEGORIES, f.category)}</select><div class="fhint">Services and Project Services default to requiring an accepted SRN for milestone / certified billing.</div></div>
    <div class="field"><label>PO value (net, before VAT)</label><div class="ro strong" id="po-val">${money(fVal(f))}</div></div>
    <div class="field"><label>PO status</label><div class="ro">Draft</div></div>
  </div></div>`;
}
function stepLines(f) {
  return `<div class="card pad0"><div style="padding:14px 14px 4px;display:flex;align-items:center"><h3 style="margin:0">Line items</h3><span class="spacer"></span>${actBtn('ln-add', 'Add line', { icn: 'plus' })}</div>
  <div class="table-wrap"><table class="grid compact" style="min-width:1100px"><thead><tr><th>#</th><th>Item / service description *</th><th>Code</th><th>Receipt type</th><th>Qty *</th><th>UoM</th><th>Unit price (AED) *</th><th class="right">Net line value</th><th>Tax code</th><th>Delivery location</th><th></th></tr></thead><tbody>
  ${f.lines.map((l, i) => `<tr><td>${i + 1}</td>
    <td><input class="input sm" style="min-width:220px" data-f="lines.${i}.desc" value="${esc(l.desc)}" placeholder="e.g. Industrial Machinery Installation"></td>
    <td><input class="input sm" style="width:110px" data-f="lines.${i}.code" value="${esc(l.code)}"></td>
    <td><select class="input sm" data-f="lines.${i}.receiptType" data-r>${opt(['Goods', 'Services'], l.receiptType)}</select></td>
    <td><input class="input sm num" style="width:80px" type="number" min="0" step="any" data-t="num" data-f="lines.${i}.qty" value="${l.qty}"></td>
    <td><select class="input sm" data-f="lines.${i}.uom">${opt(UOMS, l.uom)}</select></td>
    <td><input class="input sm num" style="width:110px" type="number" min="0" step="any" data-t="num" data-f="lines.${i}.price" value="${l.price}"></td>
    <td class="num strong" id="ln-net-${i}">${fmtNum(r2((+l.qty || 0) * (+l.price || 0)))}</td>
    <td><select class="input sm" data-f="lines.${i}.taxCode"><option>VAT5</option></select></td>
    <td><select class="input sm" style="min-width:190px" data-f="lines.${i}.location">${opt(LOCATIONS, l.location)}</select></td>
    <td>${f.lines.length > 1 ? `<button class="kebab" data-act="ln-del" data-i="${i}" title="Remove line">${icon('trash', 12)}</button>` : ''}</td></tr>`).join('')}
  <tr class="total"><td colspan="7" class="right">Total PO value (net)</td><td class="num" id="ln-total">${fmtNum(fVal(f))}</td><td colspan="3"></td></tr></tbody></table></div></div>
  <p class="hint" style="margin-top:8px">Line value = quantity × unit price. VAT (5%) is calculated on invoices, not on the PO value.</p>`;
}
ACT['ln-add'] = () => { ui.f.lines.push(blankLine(ui.f.category)); render(); };
ACT['ln-del'] = el => { ui.f.lines.splice(+el.dataset.i, 1); render(); };

function stepBilling(f) {
  const m = f.billingMethod;
  const card = (k, t, d, bullets) => `<button class="rcard ${m === k ? 'on' : ''}" data-act="po-method" data-m="${k}"><div class="t"><span class="dot"></span>${t} ${mb(k)}</div><div class="d">${d}</div><ul>${bullets.map(b => `<li>${b}</li>`).join('')}</ul></button>`;
  return `<div class="card"><h3>Billing method <span class="bad-t">*</span></h3>
    ${!m ? alertBox('warn', 'Billing method is required', 'Select how this PO will be invoiced. It is inherited by every invoice and cannot be changed by the supplier.') : ''}
    <div class="radio-cards">
      ${card('Standard', 'Standard Billing', 'The existing receipt-based invoice flow.', ['Invoice matched against eligible GRNs/SRNs per the configured DICE process', 'No additional billing schedule'])}
      ${card('Progressive', 'Progressive Billing', 'Multiple invoices against eligible portions of the PO.', ['Eligibility from accepted GRN/SRN quantities &amp; values (default)', 'Or from separately certified work progress', 'Cumulative billed &amp; remaining eligible amounts tracked'])}
      ${card('Milestone', 'Milestone Billing', 'Invoices follow an approved contractual milestone schedule.', ['Schedule builder (add / edit / reorder before finalization)', 'Each milestone needs acceptance before it is billable', 'Optional accepted-SRN gate'])}
    </div></div>
    ${m === 'Standard' ? `<div class="method-banner standard"><div class="ic">${icon('doc', 14)}</div><div><b>Standard billing</b> — existing behaviour is unchanged. Invoices are matched against accepted receipts; no billing schedule or progress configuration applies.</div></div>` : ''}
    ${m === 'Progressive' ? progressiveConfig(f) : ''}
    ${m === 'Milestone' ? milestoneConfig(f) : ''}`;
}
ACT['po-method'] = el => { const f = ui.f; f.billingMethod = el.dataset.m; if (f.billingMethod === 'Milestone') { if (!f.milestones.length) { f.milestones = EXAMPLE_SCHEDULE().map(x => ({ ...x, srnRequired: f.requireSrn })); f.scheduleMode = 'percent'; f.scheduleFinal = false; } } render(); };
function progressiveConfig(f) {
  return `<div class="method-banner progressive"><div class="ic">${icon('layers', 14)}</div><div><b>Progressive billing</b> — invoice eligibility is derived from <b>accepted receipt quantities/values</b> (or separately certified work progress). It reuses the existing GRN/SRN → invoice flow; no duplicate receipts are created.</div></div>
  <div class="card" style="margin-top:12px"><h3>Progress measurement basis</h3>
    <div class="radio-cards" style="grid-template-columns:1fr 1fr">
      <button class="rcard ${f.progressBasis === 'Receipt' ? 'on' : ''}" data-act="po-basis" data-b="Receipt"><div class="t"><span class="dot"></span>Accepted GRN/SRN quantities and values <span class="badge-s s-green">Default</span></div><div class="d">Each accepted receipt becomes invoice-eligible. Pending-inspection and rejected quantities never qualify.</div></button>
      <button class="rcard ${f.progressBasis === 'Certified' ? 'on' : ''}" data-act="po-basis" data-b="Certified"><div class="t"><span class="dot"></span>Certified work progress</div><div class="d">A separate progress claim (cumulative − previously certified) must be submitted and certified before value becomes invoice-eligible. Not mixed with receipt-based billing.</div></button>
    </div>
    <div class="fgrid" style="margin-top:12px">
      ${f.progressBasis === 'Receipt' ? `<div class="field"><label>Over-receipt tolerance (%)</label><input class="input" type="number" min="0" max="20" step="any" data-t="num" data-f="overReceiptPct" value="${f.overReceiptPct}"><div class="fhint">0 = received quantity cannot exceed the PO quantity.</div></div>` : ''}
      ${f.progressBasis === 'Certified' ? `<div class="field span2"><label class="check-row"><input type="checkbox" data-f="requireSrn" data-r ${f.requireSrn ? 'checked' : ''}> Require an accepted SRN before certified value is invoice-eligible</label><div class="fhint">Applies the configured acceptance gate for service categories.</div></div>` : ''}
    </div></div>`;
}
ACT['po-basis'] = el => { ui.f.progressBasis = el.dataset.b; render(); };

function milestoneConfig(f) {
  const val = fVal(f), chk = scheduleCheck(f.milestones, val, f.scheduleMode, f.scheduleException), lock = f.scheduleFinal, dis = lock ? 'disabled' : '';
  const rows = f.milestones.map((m, i) => `<tr>
    <td class="strong nowrap">M${i + 1}</td>
    <td><input class="input sm" style="min-width:150px" ${dis} data-f="milestones.${i}.name" value="${esc(m.name)}" placeholder="Milestone name"></td>
    <td>${f.scheduleMode === 'percent' ? `<input class="input sm num" style="width:70px" type="number" step="any" min="0" ${dis} data-t="num" data-f="milestones.${i}.pct" value="${m.pct}"> %` : `<input class="input sm num" style="width:110px" type="number" step="any" min="0" ${dis} data-t="num" data-f="milestones.${i}.amount" value="${m.amount}">`}</td>
    <td class="num strong" id="ms-amt-${i}">${money(chk.amt(m))}</td>
    <td><input class="input sm" type="date" ${dis} data-f="milestones.${i}.planned" value="${esc(m.planned || '')}"></td>
    <td><select class="input sm" ${dis} data-f="milestones.${i}.approver">${opt(APPROVERS_LIST, m.approver)}</select></td>
    <td><label class="check-row"><input type="checkbox" ${dis} data-f="milestones.${i}.srnRequired" ${m.srnRequired ? 'checked' : ''}> SRN</label></td>
    <td><span class="badge-s s-gray">Draft</span></td>
    <td class="act nowrap">${lock ? `<span class="lock">${icon('lock', 11)}</span>` : `<button class="kebab" data-act="ms-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">${icon('up', 12)}</button><button class="kebab" data-act="ms-down" data-i="${i}" ${i === f.milestones.length - 1 ? 'disabled' : ''} title="Move down">${icon('down', 12)}</button><button class="kebab" data-act="ms-del" data-i="${i}" title="Remove">${icon('trash', 12)}</button>`}</td></tr>
    <tr><td></td><td colspan="8" style="padding-top:0"><div class="fgrid" style="gap:8px">
      <div class="field"><label>Description</label><input class="input sm" ${dis} data-f="milestones.${i}.description" value="${esc(m.description || '')}"></div>
      <div class="field"><label>Acceptance criteria</label><input class="input sm" ${dis} data-f="milestones.${i}.criteria" value="${esc(m.criteria || '')}"></div>
      <div class="field"><label>Required supporting evidence</label><input class="input sm" ${dis} data-f="milestones.${i}.evidenceReq" value="${esc(m.evidenceReq || '')}"></div></div></td></tr>`).join('');
  return `<div class="method-banner milestone"><div class="ic">${icon('flag', 14)}</div><div><b>Milestone billing</b> — invoice eligibility comes from the <b>amount allocated to an approved contractual milestone</b>. A milestone is never billable just because its planned date passed.</div></div>
  <div class="card pad0" style="margin-top:12px"><div style="padding:14px 14px 8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">Milestone schedule</h3>${lock ? `<span class="badge-s s-green">${icon('lock', 10)}&nbsp;Finalized</span>` : '<span class="badge-s s-amber">Draft schedule</span>'}<span class="spacer"></span>
    <div class="row"><label class="check-row"><input type="radio" name="smode" ${f.scheduleMode === 'percent' ? 'checked' : ''} ${dis} data-act="ms-mode" data-m="percent"> Percentage of PO value</label><label class="check-row"><input type="radio" name="smode" ${f.scheduleMode === 'fixed' ? 'checked' : ''} ${dis} data-act="ms-mode" data-m="fixed"> Fixed amounts</label></div></div>
  <div class="table-wrap"><table class="grid compact" style="min-width:980px"><thead><tr><th>ID</th><th>Milestone name *</th><th>${f.scheduleMode === 'percent' ? 'Percentage' : 'Fixed amount (AED)'}</th><th class="right">Amount</th><th>Planned completion</th><th>Approver</th><th>Gate</th><th>Status</th><th></th></tr></thead><tbody>${rows || emptyRow(9, 'No milestones yet.')}</tbody></table></div>
  <div id="sch-sum" style="padding:12px 14px">${scheduleSummary(f)}</div>
  <div class="form-actions" style="margin:0;padding:10px 14px">${lock ? actBtn('ms-unlock', 'Unlock schedule (draft PO)', { icn: 'lock' }) : `${actBtn('ms-add', 'Add milestone', { icn: 'plus' })}${actBtn('ms-example', 'Load example 20 / 50 / 30 schedule')}<span class="spacer"></span>${actBtn('ms-finalize', 'Finalize schedule', { cls: 'btn-primary btn-sm', icn: 'lock' })}`}</div></div>
  <div class="card" style="margin-top:12px"><h3>Billing rules</h3><div class="fgrid c2">
    <div class="field"><label class="check-row"><input type="checkbox" data-f="requireSrn" data-r data-hook="reqsrn" ${f.requireSrn ? 'checked' : ''}> Require accepted SRN before milestones are invoice-eligible (default for all milestones)</label><div class="fhint">The milestone (contractual deliverable) and the SRN (service receipt) stay separate records; acceptance of one never creates or approves the other. Can be overridden per milestone above.</div></div>
    <div class="field"><label class="check-row"><input type="checkbox" data-f="partialMilestone" data-r ${f.partialMilestone ? 'checked' : ''}> Allow partial milestone billing</label><div class="fhint">Off (default for this release): one invoice per milestone, for the full milestone amount.</div></div>
    ${f.scheduleMode === 'fixed' ? `<div class="field span2"><label class="check-row"><input type="checkbox" data-f="scheduleException.allow" data-r ${f.scheduleException.allow ? 'checked' : ''}> Explicit exception: fixed schedule may total less than the PO value</label>${f.scheduleException.allow ? `<input class="input" style="margin-top:6px" data-f="scheduleException.note" placeholder="Reason for the exception (required)" value="${esc(f.scheduleException.note)}">` : ''}</div>` : ''}
  </div></div>`;
}
HOOKS.reqsrn = (el, v) => { ui.f.milestones.forEach(m => m.srnRequired = v); };
function scheduleSummary(f) {
  const val = fVal(f), chk = scheduleCheck(f.milestones, val, f.scheduleMode, f.scheduleException);
  return `<div class="row" style="gap:22px"><div><div class="hint">Schedule total</div><div class="strong" style="font-size:15px">${money(chk.total)}${f.scheduleMode === 'percent' ? ` <span class="${Math.abs(chk.pctTotal - 100) < 0.0001 ? 'ok-t' : 'bad-t'}" style="font-size:12px">· ${fmtNum(chk.pctTotal)}%</span>` : ''}</div></div>
    <div><div class="hint">PO value</div><div class="strong" style="font-size:15px">${money(val)}</div></div>
    <div><div class="hint">Difference</div><div class="strong ${Math.abs(val - chk.total) < EPS ? 'ok-t' : 'bad-t'}" style="font-size:15px">${money(r2(val - chk.total))}</div></div></div>
    ${chk.ok ? alertBox('ok', '', 'Schedule is valid' + (f.scheduleMode === 'percent' ? ' — totals exactly 100% of the PO value.' : ' — fixed amounts equal the PO value.')) : alertBox('err', 'Schedule cannot be finalized', errList(chk.errors))}`;
}
ACT['ms-add'] = () => { const f = ui.f; f.milestones.push({ name: '', description: '', pct: 0, amount: 0, planned: '', criteria: '', evidenceReq: '', approver: 'Procurement Manager', srnRequired: f.requireSrn }); render(); };
ACT['ms-del'] = el => { ui.f.milestones.splice(+el.dataset.i, 1); render(); };
ACT['ms-up'] = el => { const a = ui.f.milestones, i = +el.dataset.i; [a[i - 1], a[i]] = [a[i], a[i - 1]]; render(); };
ACT['ms-down'] = el => { const a = ui.f.milestones, i = +el.dataset.i; [a[i + 1], a[i]] = [a[i], a[i + 1]]; render(); };
ACT['ms-example'] = () => { ui.f.scheduleMode = 'percent'; ui.f.milestones = EXAMPLE_SCHEDULE().map(x => ({ ...x, srnRequired: ui.f.requireSrn })); render(); };
ACT['ms-mode'] = el => { const f = ui.f, v = fVal(f), to = el.dataset.m; if (f.scheduleMode === to) return; f.milestones.forEach(m => { if (to === 'fixed') m.amount = r2((+m.pct || 0) * v / 100); else m.pct = v ? r2((+m.amount || 0) / v * 100) : 0; }); f.scheduleMode = to; render(); };
ACT['ms-finalize'] = () => { const f = ui.f, chk = scheduleCheck(f.milestones, fVal(f), f.scheduleMode, f.scheduleException); if (!chk.ok) return errorModal('Schedule cannot be finalized', chk.errors); f.scheduleFinal = true; toast('Milestone schedule finalized — locked until the PO is amended'); render(); };
ACT['ms-unlock'] = () => { ui.f.scheduleFinal = false; render(); };

function stepReview(f, nextNo) {
  const v = fVal(f), errs = validatePO(f, true), sup = getSup(f.supplierId);
  return `<div class="card"><h3>Review ${esc(nextNo)}</h3><div class="kvg">${kv('Supplier', esc(sup.name) + ` <span class="hint">${sup.code}</span>`)}${kv('Buyer entity', esc(f.buyer))}${kv('Category', esc(f.category))}${kv('PO date', fmtD(f.poDate))}${kv('Delivery date', fmtD(f.deliveryDate))}${kv('Payment terms', esc(f.terms))}${kv('PO value (net)', `<b>${money(v)}</b>`)}${kv('Billing method', f.billingMethod ? mb(f.billingMethod) + (f.billingMethod === 'Progressive' ? ` <span class="hint">${f.progressBasis === 'Certified' ? 'Certified work progress' : 'Accepted receipts'}</span>` : '') : '<span class="bad-t">Not selected</span>')}${kv('Lines', f.lines.length)}</div></div>
  ${f.billingMethod === 'Milestone' ? `<div class="card" style="margin-top:12px"><h3>Milestone schedule ${f.scheduleFinal ? '<span class="badge-s s-green">Finalized</span>' : '<span class="badge-s s-amber">Not finalized</span>'}</h3><table class="grid compact"><thead><tr><th>ID</th><th>Name</th><th class="right">Amount</th><th class="right">%</th><th>Planned</th><th>SRN gate</th></tr></thead><tbody>${f.milestones.map((m, i) => `<tr><td class="strong">M${i + 1}</td><td>${esc(m.name)}</td><td class="num">${fmtNum(scheduleCheck(f.milestones, v, f.scheduleMode, f.scheduleException).amt(m))}</td><td class="num">${v ? fmtNum(r2(scheduleCheck(f.milestones, v, f.scheduleMode).amt(m) / v * 100)) : 0}%</td><td>${fmtD(m.planned)}</td><td>${m.srnRequired ? 'Accepted SRN required' : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
  ${errs.length ? alertBox('err', 'Resolve before submitting for approval', errList(errs)) : alertBox('ok', 'Ready to submit', 'All required fields are valid. Only approved POs become available for GRN, SRN and invoice selection.')}`;
}
function poDerive() {
  const f = ui.f; if (!f) return;
  const v = $('#po-val'); if (v) v.textContent = money(fVal(f));
  f.lines.forEach((l, i) => { const e = $('#ln-net-' + i); if (e) e.textContent = fmtNum(r2((+l.qty || 0) * (+l.price || 0))); });
  const t = $('#ln-total'); if (t) t.textContent = fmtNum(fVal(f));
  if (f.billingMethod === 'Milestone' && f.step === 3) {
    const chk = scheduleCheck(f.milestones, fVal(f), f.scheduleMode, f.scheduleException);
    f.milestones.forEach((m, i) => { const e = $('#ms-amt-' + i); if (e) e.textContent = money(chk.amt(m)); });
    const s = $('#sch-sum'); if (s) s.innerHTML = scheduleSummary(f);
  }
}

/* ---------------------------------------------------------------- detail */
const PO_TABS = (po) => [['overview', 'Overview'], ['lines', 'Line Items', po.lines.length], ['billing', 'Billing Schedule'], ['receipts', 'Receipts', grnsOf(po).length + srnsOf(po).length], ['invoices', 'Invoices', invsOf(po).length], ['audit', 'Approvals & Audit Trail']];
function poDetail(po, r) {
  const tab = r.q.tab || 'overview', s = poSummary(po);
  const banner = { Draft: ['gray', 'Draft', 'Not yet submitted. Receipts and invoices cannot be created until the PO is approved.'], 'Pending Approval': ['amber', 'Pending approval', 'Awaiting Procurement Manager approval.'], Approved: ['green', 'Approved', 'Available for GRN, SRN and invoice selection.'], Rejected: ['red', 'Rejected', 'Returned to the buyer — revise and resubmit.'] }[po.status] || ['gray', po.status, ''];
  const goods = po.lines.some(l => l.receiptType === 'Goods'), svc = po.lines.some(l => l.receiptType === 'Services');
  const actions = [];
  if (po.status === 'Draft') actions.push(gbtn('po.edit', 'go', 'Edit', { data: { hash: `#/po/${po.id}/edit` }, icn: 'edit' }), gbtn('po.edit', 'po-submit-draft', 'Submit for Approval', { cls: 'btn-primary', data: { id: po.id }, icn: 'check' }));
  if (po.status === 'Pending Approval') actions.push(gbtn('po.approve', 'po-reject', 'Reject', { cls: 'btn-danger-soft', data: { id: po.id } }), gbtn('po.approve', 'po-approve', 'Approve', { cls: 'btn-primary', data: { id: po.id }, icn: 'check' }), gbtn('po.edit', 'po-reopen', 'Return to draft', { data: { id: po.id } }));
  if (po.status === 'Rejected') actions.push(gbtn('po.edit', 'po-reopen', 'Revise PO', { cls: 'btn-primary', data: { id: po.id }, icn: 'edit' }));
  if (po.status === 'Approved') {
    if (goods) actions.push(gbtn('grn.create', 'go', 'Create GRN', { data: { hash: `#/grn/new?po=${po.id}` }, icn: 'box' }));
    if (svc) actions.push(gbtn('srn.create', 'go', 'Create SRN', { data: { hash: `#/srn/new?po=${po.id}` }, icn: 'truck' }));
    actions.push(gbtn('inv.create', 'go', 'Create Invoice', { cls: 'btn-primary', data: { hash: `#/invoice/new?po=${po.id}` }, icn: 'receipt' }), gbtn('po.amend', 'po-amend', 'Amend PO', { data: { id: po.id }, icn: 'edit' }));
  }
  const body = { overview: poOverview, lines: poLinesTab, billing: poBillingTab, receipts: poReceiptsTab, invoices: poInvoicesTab, audit: poAuditTab }[tab] || poOverview;
  return `<div>${pageHead({ title: po.number, sub: `${poMethodBadge(po)}`, crumbs: [['Purchase Orders', '#/pos'], [po.number]], right: actions.join('') })}
  <div class="content">
    <div class="status-banner ${banner[0]}"><div><div class="t">${banner[1]}${po.version > 1 ? ` · version ${po.version}` : ''}</div><div class="d">${banner[2]}</div></div><span class="spacer"></span><div class="hint">${esc(getSup(po.supplierId).name)} · ${money(s.value)} · ${esc(po.terms)}</div></div>
    ${tabsHtml(PO_TABS(po), tab, `#/po/${po.id}`)}
    <div style="margin-top:6px">${body(po, s)}</div></div></div>`;
}
ACT['po-submit-draft'] = el => { const po = getPO(el.dataset.id); const d = poDraftFrom(po); done(A.savePO(d, true)); };
ACT['po-approve'] = el => confirmBox({ title: 'Approve purchase order', message: `Approve <b>${esc(getPO(el.dataset.id).number)}</b>? It becomes available for GRN, SRN and invoice selection${getPO(el.dataset.id).billingMethod === 'Milestone' ? ', and its milestone schedule is locked' : ''}.`, confirmLabel: 'Approve', onConfirm: () => done(A.approvePO(el.dataset.id)) });
ACT['po-reject'] = el => reasonModal({ title: 'Reject purchase order', label: 'Rejection reason', btn: 'Reject PO', onSubmit: reason => { done(A.rejectPO(el.dataset.id, reason)); } });
ACT['po-reopen'] = el => done(A.reopenPO(el.dataset.id));

function poOverview(po, s) {
  const total = s.value || 1, w = x => pct(x, total).toFixed(2);
  const paid = s.paid, apprOnly = r2(s.approved - s.paid), res = s.reserved, avail = s.remaining;
  const note = { Standard: ['standard', 'doc', 'Standard billing', 'Existing receipt-based flow: invoices are matched against accepted GRNs/SRNs on the PO. No billing schedule applies.'],
    Progressive: ['progressive', 'layers', poCertified(po) ? 'Progressive billing — certified work progress' : 'Progressive billing — accepted receipts', poCertified(po) ? 'Invoice-eligible value = newly certified, unconsumed progress claims (current claim = new cumulative certified − previously certified).' : 'Invoice-eligible value = accepted GRN quantities / SRN values not yet consumed by a live invoice. Pending and rejected quantities never qualify.'],
    Milestone: ['milestone', 'flag', 'Milestone billing', 'Invoice-eligible value = the amount allocated to an approved contractual milestone (plus any required SRN acceptance). Planned dates never create eligibility.'] }[po.billingMethod];
  return `
  <div class="method-banner ${note[0]}"><div class="ic">${icon(note[1], 14)}</div><div><b>${note[2]}</b> — ${note[3]}</div></div>
  ${strip([['PO value', money(s.value), 'net, before VAT'], ['Received value', money(s.received), po.billingMethod === 'Milestone' ? 'milestones submitted/approved' : poCertified(po) ? 'claims submitted/certified' : 'incl. rejected / pending'], ['Accepted value', money(s.accepted), po.billingMethod === 'Milestone' ? 'approved &amp; gate-cleared' : poCertified(po) ? 'certified' : 'accepted receipts'],
    ['Invoiced value', money(s.invoiced), `reserved in-flight: ${money(s.reserved)}`], ['Approved invoices', money(s.approved), 'approved · posted · paid'], ['Paid value', money(s.paid), 'demo payments'], ['Remaining eligible', money(s.remaining), 'accepted − invoiced', 'hl']])}
  <div class="card flat" style="margin-top:14px"><h3>Where the PO value stands</h3>
    <div class="bar" style="height:12px;width:100%"><span class="b-paid" style="width:${w(paid)}%"></span><span class="b-appr" style="width:${w(apprOnly)}%"></span><span class="b-res" style="width:${w(res)}%"></span><span class="b-avail" style="width:${w(avail)}%"></span></div>
    <div class="legend"><span><i style="background:#2F9E62"></i>Paid ${money(paid)}</span><span><i style="background:#7BC79B"></i>Approved, unpaid ${money(apprOnly)}</span><span><i style="background:#F0B24A"></i>Reserved (in-flight) ${money(res)}</span><span><i style="background:var(--primary)"></i>Eligible to invoice ${money(avail)}</span><span><i style="background:#E6E6EC"></i>Not yet eligible ${money(Math.max(0, r2(s.value - paid - apprOnly - res - avail)))}</span></div></div>
  ${s.hasGoods ? `${'<div class="sub-title">Goods quantities</div>'}${strip([['Ordered', fmtNum(sum(po.lines.filter(l => l.receiptType === 'Goods'), l => l.qty)) + ' units'], ['Received', fmtNum(s.receivedQty) + ' units'], ['Accepted (eligible)', fmtNum(s.acceptedQty) + ' units'], ['Rejected', fmtNum(s.rejectedQty) + ' units', 'not invoice-eligible'], ['Invoiced', fmtNum(s.invoicedQty) + ' units', po.billingMethod === 'Progressive' ? 'allocated to GRNs' : ''], ['Remaining PO qty', fmtNum(s.remainingPOQty) + ' units', 'not yet accepted / received', 'hl']])}` : ''}
  <div class="sub-title">Purchase order details</div>
  <div class="card flat"><div class="kvg">${kv('Supplier', `${esc(getSup(po.supplierId).name)}<div class="hint">${getSup(po.supplierId).code}</div>`)}${kv('Buyer entity', esc(po.buyer))}${kv('Category', esc(po.category))}${kv('PO date', fmtD(po.poDate))}${kv('Delivery date', fmtD(po.deliveryDate))}${kv('Payment terms', esc(po.terms))}${kv('Billing method', poMethodBadge(po))}${kv('PO status', sb(po.status))}${kv('Version', 'v' + po.version)}</div></div>`;
}
function poLinesTab(po) {
  return `<div class="tbl-wrap" style="margin-top:12px"><table class="grid compact"><thead><tr><th>#</th><th>Item / service</th><th>Code</th><th>Receipt type</th><th class="right">Qty</th><th>UoM</th><th class="right">Unit price</th><th class="right">Net value</th><th>Tax</th><th>Location</th><th class="right">Received / accepted</th><th class="right">Remaining</th></tr></thead><tbody>
  ${po.lines.map(l => { const g = l.receiptType === 'Goods', st = g ? lineReceiptStats(po, l) : lineServiceStats(po, l); return `<tr><td>${l.no}</td><td class="strong">${esc(l.desc)}</td><td>${esc(l.code)}</td><td>${l.receiptType === 'Goods' ? 'Goods (GRN)' : 'Services (SRN)'}</td><td class="num">${fmtNum(l.qty)}</td><td>${esc(l.uom)}</td><td class="num">${fmtNum(l.price)}</td><td class="num strong">${fmtNum(lineNet(l))}</td><td>${l.taxCode}</td><td>${esc(l.location)}</td><td class="num">${g ? `${fmtNum(st.receivedQty)} / ${fmtNum(st.acceptedQty)} ${l.uom}` : `${money(sum(srnsOf(po).filter(x => x.lineId === l.id), srnEnt))} accepted`}</td><td class="num">${g ? fmtNum(st.remaining) + ' ' + l.uom : money(st.remaining)}</td></tr>`; }).join('')}
  <tr class="total"><td colspan="7" class="right">PO value (net)</td><td class="num">${fmtNum(poNet(po))}</td><td colspan="4"></td></tr></tbody></table></div>`;
}

/* ----- billing schedule tab (method specific) ----- */
function poBillingTab(po, s) {
  if (po.billingMethod === 'Standard') return `<div class="method-banner standard"><div class="ic">${icon('doc', 14)}</div><div><b>Standard billing</b> — no additional billing schedule. Invoices are matched against the accepted receipts below (PO-level balance).</div></div>${receiptEntitlementTable(po, s, false)}`;
  if (po.billingMethod === 'Milestone') return milestoneTable(po, s);
  if (poCertified(po)) return claimsBlock(po, s);
  return receiptEntitlementTable(po, s, true);
}
function receiptEntitlementTable(po, s, progressive) {
  const items = s.items.filter(x => x.kind === 'grn' || x.kind === 'srn');
  const alloc = [];
  invsOf(po).filter(isLive).forEach(i => i.allocs.forEach(a => alloc.push({ i, a })));
  return `<div class="sec-title">${progressive ? 'Receipt &amp; invoice allocation' : 'Eligible receipts'}<span class="sub">${progressive ? 'GRN/SRN entitlements consumed by invoices (live = submitted, matched, approved, posted or paid)' : 'Accepted receipts available for matching'}</span></div>
  <div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Receipt reference</th><th class="right">Received qty</th><th class="right">Accepted qty</th><th class="right">Accepted value</th><th class="right">Previously allocated<div class="sub" style="text-transform:none;font-weight:400">approved / posted / paid</div></th><th class="right">Current invoice allocation<div class="sub" style="text-transform:none;font-weight:400">reserved, in-flight</div></th><th class="right">Remaining eligible qty</th><th class="right">Remaining eligible value</th><th>Receipt status</th></tr></thead><tbody>
  ${items.map(x => { const g = x.kind === 'grn', rec = g ? x.ref.received : null; return `<tr class="${x.eligible ? '' : 'dim'}"><td class="strong">${link(g ? `#/grn/${x.refId}` : `#/srn/${x.refId}`, x.label)}<div class="sub">${fmtD(x.ref.date)}${x.ref.reversed ? ' · reversed' : ''}</div></td><td class="num">${g ? fmtNum(rec) : '—'}</td><td class="num">${g ? fmtNum(x.entQty) : '—'}</td><td class="num">${fmtNum(x.entValue)}</td>
    <td class="num">${g ? `${fmtNum(x.committedQty)} u / ` : ''}${fmtNum(x.committedValue)}</td><td class="num">${g ? `${fmtNum(x.reservedQty)} u / ` : ''}${fmtNum(x.reservedValue)}</td><td class="num">${g ? fmtNum(x.availQty) : '—'}</td><td class="num strong">${fmtNum(x.availValue)}</td><td>${sb(x.status)}${!x.eligible && x.reason ? `<div class="sub">${esc(x.reason)}</div>` : ''}</td></tr>`; }).join('') || emptyRow(9, 'No receipts yet — create a GRN/SRN against this PO.')}
  <tr class="total"><td>Total</td><td class="num">${fmtNum(sum(items.filter(x => x.kind === 'grn'), x => x.ref.received))}</td><td class="num">${fmtNum(sum(items, x => x.entQty || 0))}</td><td class="num">${fmtNum(s.accepted)}</td><td class="num">${fmtNum(sum(items, x => x.committedValue))}</td><td class="num">${fmtNum(sum(items, x => x.reservedValue))}</td><td class="num">${fmtNum(sum(items, x => x.availQty || 0))}</td><td class="num">${fmtNum(po.billingMethod === 'Standard' ? s.remaining : sum(items, x => x.availValue))}</td><td></td></tr></tbody></table></div>
  ${po.billingMethod === 'Standard' ? '<p class="hint" style="margin-top:6px">Standard billing tracks the balance at PO level: accepted receipts − live invoices.</p>' : ''}
  ${progressive ? `<div class="sub-title">Allocations by invoice</div><div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Invoice</th><th>Supplier invoice no.</th><th>Receipt</th><th class="right">Qty</th><th class="right">Value (net)</th><th>Invoice status</th><th>Allocation state</th></tr></thead><tbody>${alloc.map(({ i, a }) => `<tr><td>${invLink(i)}</td><td>${esc(i.number)}</td><td>${esc(allocRefLabel(a))}</td><td class="num">${a.qty != null ? fmtNum(a.qty) : '—'}</td><td class="num">${fmtNum(a.value)}</td><td>${sb(i.status)}</td><td>${sb(APPROVED.includes(i.status) ? 'Committed' : 'Reserved')}</td></tr>`).join('') || emptyRow(7, 'No invoice has consumed any receipt yet.')}</tbody></table></div>` : ''}
  <div class="row" style="margin-top:12px">${gbtn('inv.create', 'go', 'Create invoice from eligible receipts', { cls: 'btn-primary', data: { hash: `#/invoice/new?po=${po.id}` }, icn: 'receipt', dis: po.status !== 'Approved' })}</div>`;
}
const allocRefLabel = a => a.kind === 'grn' ? getGRN(a.refId)?.number : a.kind === 'srn' ? getSRN(a.refId)?.number : a.kind === 'milestone' ? getMS(a.refId) && msFull(getMS(a.refId)) : getClaim(a.refId)?.number;

function milestoneTable(po, s) {
  const ms = msOf(po), locked = po.scheduleStatus === 'Final';
  const tot = sum(ms, m => m.amount), appr = sum(ms, m => msEnt(m, po)), inv = sum(ms, m => usage('milestone', m.id).value);
  return `${strip([['Schedule', locked ? 'Finalized &amp; locked' : 'Draft', po.partialMilestone ? 'partial billing on' : 'one invoice per milestone'], ['Schedule total', money(tot), `${fmtNum(sum(ms, m => m.pct))}% of PO`], ['Invoice-eligible (approved)', money(appr)], ['Invoiced', money(inv)], ['Remaining eligible now', money(s.remaining), 'approved − invoiced', 'hl']])}
  <div class="sec-title">Milestone schedule <span class="sub">Click a milestone to open its detail drawer</span><span class="spacer"></span>${po.status === 'Approved' ? gbtn('po.amend', 'po-amend', 'Amend schedule', { data: { id: po.id }, icn: 'edit' }) : ''}</div>
  <div class="tbl-wrap"><table class="grid compact"><thead><tr><th>ID</th><th>Name</th><th class="right">Amount</th><th>Completion status</th><th>Approval status</th><th>Linked SRN</th><th class="right">Invoiced</th><th class="right">Remaining balance</th><th>Linked invoice</th><th>Billing</th></tr></thead><tbody>
  ${ms.map(m => { const u = usage('milestone', m.id), g = msGate(m, po), sr = m.srnId && getSRN(m.srnId), bill = msBilling(m, po);
    const completion = m.status === 'Approved' ? 'Completed' : m.status === 'Submitted for Acceptance' ? 'Submitted' : m.status === 'Draft' ? 'Draft' : 'Not completed';
    return `<tr class="click" data-act="ms-drawer" data-id="${m.id}"><td class="strong">${m.code}</td><td>${esc(m.name)}<div class="sub">Planned ${fmtD(m.planned)}</div></td><td class="num strong">${fmtNum(m.amount)}</td><td>${sb(completion)}</td><td>${sb(m.status)}</td><td>${m.srnRequired ? (sr ? `${esc(sr.number)} ${sb(sr.status)}` : '<span class="warn-t">Required · none linked</span>') : '<span class="dim-note">Not required</span>'}</td><td class="num">${fmtNum(u.value)}</td><td class="num strong">${fmtNum(r2(m.amount - u.value))}</td><td>${u.invs.map(invLink).join(', ') || '—'}</td><td>${sb(bill)}</td></tr>`; }).join('') || emptyRow(10, 'No milestones.')}
  <tr class="total"><td colspan="2">Total</td><td class="num">${fmtNum(tot)}</td><td colspan="3"></td><td class="num">${fmtNum(inv)}</td><td class="num">${fmtNum(r2(tot - inv))}</td><td colspan="2"></td></tr></tbody></table></div>
  <p class="hint" style="margin-top:8px">${locked ? `${icon('lock', 11)} The schedule is locked. Changes require an authorised PO amendment; invoiced milestones can never be rewritten.` : ''}</p>`;
}
function claimsBlock(po, s) {
  const cs = claimsOf(po);
  return `${strip([['Contract value', money(s.value)], ['Cumulative certified', money(cumCertified(po)), `${fmtNum(pct(cumCertified(po), s.value))}% of contract`], ['Invoiced', money(s.invoiced)], ['Remaining billable certified', money(s.remaining), '', 'hl']])}
  <div class="sec-title">Progress claims <span class="sub">Certified work progress — separate from receipt-based billing</span><span class="spacer"></span>${po.status === 'Approved' ? gbtn('claim.create', 'go', 'New progress claim', { cls: 'btn-primary', data: { hash: `#/claim/new?po=${po.id}` }, icn: 'plus' }) : ''}</div>${claimTable(cs)}`;
}
function claimTable(cs) {
  return `<div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Claim</th><th>Period</th><th class="right">Previous cumulative certified</th><th class="right">Current claim</th><th class="right">Cumulative claimed</th><th class="right">Certified</th><th>Status</th><th>Linked invoice</th><th class="right">Remaining billable</th></tr></thead><tbody>
  ${cs.map(c => { const v = claimView(c), u = usage('claim', c.id); return `<tr class="click" data-act="claim-drawer" data-id="${c.id}"><td class="strong">${c.number}<div class="sub">${esc(getPO(c.poId).number)}</div></td><td>${esc(c.period)}</td><td class="num">${fmtNum(v.prev)}</td><td class="num">${fmtNum(v.current)}</td><td class="num">${fmtNum(v.cum)}</td><td class="num">${c.status === 'Certified' ? fmtNum(v.certified) : '—'}</td><td>${sb(c.status)}</td><td>${u.invs.map(invLink).join(', ') || '—'}</td><td class="num strong">${c.status === 'Certified' ? fmtNum(v.remaining) : '—'}</td></tr>`; }).join('') || emptyRow(9, 'No progress claims yet.')}</tbody></table></div>`;
}

function poReceiptsTab(po) {
  const gs = grnsOf(po), ss = srnsOf(po);
  return `<div class="sec-title">Goods receipts (GRN)<span class="spacer"></span>${po.status === 'Approved' && po.lines.some(l => l.receiptType === 'Goods') ? gbtn('grn.create', 'go', 'Create GRN', { data: { hash: `#/grn/new?po=${po.id}` }, icn: 'plus' }) : ''}</div>
  <div class="tbl-wrap"><table class="grid compact"><thead><tr><th>GRN</th><th>Date</th><th class="right">Received</th><th class="right">Accepted</th><th class="right">Rejected</th><th class="right">Pending</th><th>Status</th></tr></thead><tbody>${gs.map(g => `<tr class="click" data-act="go" data-hash="#/grn/${g.id}"><td class="strong">${g.number}</td><td>${fmtD(g.date)}</td><td class="num">${fmtNum(g.received)}</td><td class="num">${fmtNum(g.accepted)}</td><td class="num">${fmtNum(g.rejected)}</td><td class="num">${fmtNum(['Submitted', 'Pending Inspection', 'Draft'].includes(g.status) ? grnPending(g) : 0)}</td><td>${sb(g.reversed ? 'Reversed' : g.status)}</td></tr>`).join('') || emptyRow(7, 'No goods receipts.')}</tbody></table></div>
  <div class="sec-title">Service receipts (SRN)<span class="spacer"></span>${po.status === 'Approved' && po.lines.some(l => l.receiptType === 'Services') ? gbtn('srn.create', 'go', 'Create SRN', { data: { hash: `#/srn/new?po=${po.id}` }, icn: 'plus' }) : ''}</div>
  <div class="tbl-wrap"><table class="grid compact"><thead><tr><th>SRN</th><th>Date</th><th>Description</th><th>Linked milestone</th><th class="right">Service value</th><th class="right">Accepted value</th><th>Status</th></tr></thead><tbody>${ss.map(x => `<tr class="click" data-act="go" data-hash="#/srn/${x.id}"><td class="strong">${x.number}</td><td>${fmtD(x.date)}</td><td>${esc(x.description)}</td><td>${x.milestoneId ? esc(getMS(x.milestoneId).code) : '—'}</td><td class="num">${fmtNum(x.serviceValue)}</td><td class="num">${fmtNum(srnEnt(x))}</td><td>${sb(x.status)}</td></tr>`).join('') || emptyRow(7, 'No service receipts.')}</tbody></table></div>`;
}
function poInvoicesTab(po) {
  return `<div class="sec-title">Invoices against ${esc(po.number)}<span class="spacer"></span>${po.status === 'Approved' ? gbtn('inv.create', 'go', 'Create Invoice', { cls: 'btn-primary', data: { hash: `#/invoice/new?po=${po.id}` }, icn: 'plus' }) : ''}</div>
  <div class="tbl-wrap"><table class="grid compact"><thead><tr><th>Invoice</th><th>Supplier inv. no.</th><th>Date</th><th>References</th><th class="right">Net</th><th class="right">VAT</th><th class="right">Gross</th><th>Matching</th><th>Status</th></tr></thead><tbody>${invsOf(po).map(i => `<tr class="click" data-act="go" data-hash="#/invoice/${i.id}"><td class="strong">${invRef(i)}</td><td>${esc(i.number)}</td><td>${fmtD(i.date)}</td><td>${esc(i.allocs.map(allocRefLabel).join(', ') || 'PO-level')}</td><td class="num">${fmtNum(i.net)}</td><td class="num">${fmtNum(i.vat)}</td><td class="num">${fmtNum(i.gross)}</td><td>${i.match ? sb(i.match.result) : '—'}</td><td>${sb(i.status)}</td></tr>`).join('') || emptyRow(9, 'No invoices yet.')}</tbody></table></div>`;
}
function poAuditTab(po) {
  const log = db.audit.filter(a => a.poId === po.id);
  return `<div class="grid-2" style="margin-top:12px;align-items:start"><div><div class="sub-title" style="margin-top:6px">Approvals</div><ul class="tl">${po.approvals.map(a => `<li class="${a.action === 'Approved' ? 'ok' : a.action === 'Rejected' ? 'bad' : ''}"><div class="tt">${esc(a.action)}</div><div class="tm">${esc(a.by)} · ${fmtDT(a.at)}${a.note ? ' — ' + esc(a.note) : ''}</div></li>`).join('') || '<li><div class="tm">No approval activity yet.</div></li>'}</ul>
    <div class="sub-title">Amendments</div><ul class="tl">${po.amendments.map(a => `<li class="amber"><div class="tt">v${a.version} — ${money(a.valueBefore)} → ${money(a.valueAfter)}</div><div class="tm">${esc(a.by)} · ${fmtDT(a.at)} · ${esc(a.reason)}</div><div class="hint">${esc(a.changes.join('; ') || 'No value change')}</div></li>`).join('') || '<li><div class="tm">No amendments.</div></li>'}</ul></div>
  <div><div class="sub-title" style="margin-top:6px">Audit trail (allocations, receipts, invoices)</div><ul class="tl">${log.map(a => `<li class="${a.kind === 'ok' ? 'ok' : a.kind === 'bad' ? 'bad' : a.kind === 'alloc' ? 'amber' : ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.ref)} · ${esc(a.by)} · ${fmtDT(a.at)}</div></li>`).join('') || '<li><div class="tm">No activity.</div></li>'}</ul></div></div>`;
}

/* ----- amend PO ----- */
ACT['po-amend'] = el => {
  const po = getPO(el.dataset.id), ms = po.billingMethod === 'Milestone' ? msOf(po) : [], mode = po.scheduleMode || 'percent';
  const lockedMs = m => usage('milestone', m.id).value > EPS || ['Approved', 'Submitted for Acceptance'].includes(m.status);
  openModal({ title: `Amend ${po.number} (v${po.version} → v${po.version + 1})`, cls: 'xwide', submitLabel: 'Apply amendment', html: `
    ${alertBox('info', 'Historical records are preserved', 'Invoice allocations, receipts and approvals already recorded are never rewritten. Prices are locked on lines that already have receipts or invoices; quantities cannot fall below what is received.')}
    <div class="sub-title" style="margin-top:4px">PO lines</div>
    <table class="grid compact"><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit price</th><th class="right">Current value</th></tr></thead><tbody>${po.lines.map(l => { const touched = grnsOf(po).some(g => g.lineId === l.id && g.status !== 'Draft') || srnsOf(po).some(s => s.lineId === l.id && s.status !== 'Draft') || invsOf(po).some(isLive); return `<tr><td>${l.no}</td><td>${esc(l.desc)}</td><td><input class="input sm num white" style="width:90px" name="q_${l.id}" type="number" step="any" value="${l.qty}"></td><td><input class="input sm num white" style="width:110px" name="p_${l.id}" type="number" step="any" value="${l.price}" ${touched ? 'readonly title="Locked — receipts/invoices exist"' : ''}> ${touched ? icon('lock', 11) : ''}</td><td class="num">${fmtNum(lineNet(l))}</td></tr>`; }).join('')}</tbody></table>
    ${ms.length ? `<div class="sub-title">Milestone schedule <span class="hint" style="text-transform:none">(${mode === 'percent' ? '% of the amended PO value — must total 100%' : 'fixed amounts — must total the amended PO value'})</span></div>
    <table class="grid compact"><thead><tr><th>ID</th><th>Name</th><th>${mode === 'percent' ? 'Percentage' : 'Amount'}</th><th class="right">Current amount</th><th>State</th></tr></thead><tbody>${ms.map(m => { const lk = lockedMs(m); return `<tr><td class="strong">${m.code}</td><td><input class="input sm white" name="mn_${m.id}" value="${esc(m.name)}" ${lk ? 'readonly' : ''}></td><td><input class="input sm num white" style="width:100px" name="mv_${m.id}" type="number" step="any" value="${mode === 'percent' ? m.pct : m.amount}" ${lk ? 'readonly' : ''}></td><td class="num">${fmtNum(m.amount)}</td><td>${lk ? `<span class="lock">${icon('lock', 11)} Locked — ${usage('milestone', m.id).value > EPS ? 'invoiced' : m.status.toLowerCase()}</span>` : sb(m.status)}</td></tr>`; }).join('')}
      <tr><td class="strong">New</td><td><input class="input sm white" name="new_name" placeholder="Add milestone (optional)"></td><td><input class="input sm num white" style="width:100px" name="new_val" type="number" step="any" placeholder="${mode === 'percent' ? '%' : 'AED'}"></td><td colspan="2" class="hint">Leave blank to skip</td></tr></tbody></table>` : ''}
    <div style="margin-top:12px">${fld('Amendment reason', 'reason', { rows: 2, req: true, ph: 'Why is the PO being amended?' })}</div>`,
    onSubmit: v => {
      const lines = po.lines.map(l => ({ id: l.id, qty: +v['q_' + l.id], price: +v['p_' + l.id] }));
      const msIn = ms.map(m => ({ id: m.id, name: v['mn_' + m.id], pct: mode === 'percent' ? +v['mv_' + m.id] : m.pct, amount: mode === 'fixed' ? +v['mv_' + m.id] : m.amount }));
      if (String(v.new_name || '').trim() && +v.new_val > 0) msIn.push({ id: 'new', name: v.new_name, pct: mode === 'percent' ? +v.new_val : 0, amount: mode === 'fixed' ? +v.new_val : 0 });
      const r = A.amendPO(po.id, { lines, milestones: msIn, reason: v.reason });
      if (!r.ok) { errorModal(r.msg, r.errors); return false; }
      toast(r.msg); render();
    } });
};

/* ----- drawers ----- */
ACT['ms-drawer'] = el => msDrawer(el.dataset.id);
ACT['claim-drawer'] = el => claimDrawer(el.dataset.id);
