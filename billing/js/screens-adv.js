/* =====================================================================
   screens-adv.js — advances, guarantees, approvals queue, multi-line invoice intake, reports and settings
   ===================================================================== */
const advMsOf = a => getMS(a.msId);
const advTone = st => ({ Requested: 'amber', 'Guarantee pending': 'amber', Approved: 'green', 'Invoice raised': 'blue', Paid: 'green', 'Partly recovered': 'blue', Recovered: 'green', Refunded: 'gray', Rejected: 'red' }[st] || 'gray');
const gChip = g => sb(gState(g) === 'Not Uploaded' ? 'Not Uploaded' : gState(g));
const gDetail = g => g && (g.files || []).length ? `${esc(g.bank)} · ${money(g.amount)} · valid until ${fmtD(g.validUntil)}${g.version > 1 ? ` · v${g.version}` : ''}` : 'Nothing uploaded yet';

/* ================================================================ PO page: Advances (as in DICE — title + "+" and request cards) */
function advCard(a, po) {
  const m = advMsOf(a), st = advStatus(a), inv = advInvoiceOf(a);
  return `<div class="inv-card adv-card" data-act="adv-open" data-id="${a.id}"><div class="adv-ic">${icon('doc', 24, 1.6)}</div>
    <div class="inv-ref" style="font-size:12.5px;font-weight:500">${esc(getSup(po.supplierId).name)}</div><div class="inv-ref">${esc(a.number)} · ${esc(m ? m.code : '')}</div><div class="inv-amt">${money(a.base)}</div>
    <div class="inv-meta"><div>Remarks: ${esc(a.remarks || '—')}</div><div>Tds: ${a.tdsPct}% (${money(a.tds)})</div><div>PO Number: ${esc(po.number)}</div>${st === 'Requested' || st === 'Guarantee pending' ? `<div>Requested by ${esc(a.requestedBy)} · ${fmtD(a.requestedAt)}</div>` : ''}${a.guaranteeRequired ? `<div>${esc(a.guaranteeTitle)}: ${gState(a.guarantee)}</div>` : ''}${inv ? `<div>Invoice: ${esc(invRef(inv))} (${esc(inv.status)})</div>` : ''}${['Paid', 'Partly recovered', 'Recovered', 'Refunded'].includes(st) ? `<div>Outstanding: ${money(advO(a))}</div>` : ''}</div>
    <div class="inv-foot">${sb(st)}</div></div>`;
}
function poAdvancesTab(po) {
  const terms = po.billingMethod === 'Milestone' ? msOf(po).filter(m => m.advance && m.advance.allowed) : [], list = advsOf(po), cf = poCfg(po);
  const canReq = po.status === 'Approved' && terms.length;
  const box = txt => `<div class="po-empty">${icon('box', 22, 1.6)}<span>${txt}</span></div>`;
  const o = advOutstandingOf(po);
  return `<div class="sec" style="margin-top:22px">Advances${canReq ? `<button class="plus-circle" data-act="adv-new" data-po="${po.id}" title="Request advance">${icon('plus', 18, 2.4)}</button>` : ''}</div>
  ${po.billingMethod !== 'Milestone' ? box('Advances are available on Milestone POs only.') : !terms.length ? box('No advance terms on this PO. The buyer sets them on a milestone with the schedule.')
  : `<div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Milestone</th><th class="right">Amount</th><th>Advance terms</th><th class="right">Advance</th><th>Recovery</th><th>Guarantee</th><th class="right">Outstanding</th></tr></thead><tbody>${terms.map(m => { const t = m.advance, adv = advOfMs(m).filter(ADV_OPEN)[0] || advOfMs(m)[0];
      return `<tr><td class="strong">${m.code} — ${esc(m.name)}</td><td class="num">${fmtNum(m.amount)}</td><td>${t.mode === 'percent' ? `${fmtNum(t.value)}% of the milestone` : 'Fixed amount'}</td><td class="num">${fmtNum(advTermAmount(m))}</td><td>${t.recovery === 'first' ? 'First invoice' : 'Proportional'}</td><td>${t.guaranteeRequired ? esc(t.guaranteeTitle) : '<span class="dim-note">Not required</span>'}</td><td class="num">${adv ? fmtNum(advO(adv)) : '—'}</td></tr>`; }).join('')}</tbody></table></div>
  <p class="hint" style="margin-top:8px">Caps: ${cf.maxAdvancePctPerMilestone}% per milestone · ${cf.maxAdvancePctOfPO}% of the scheduled value across the PO · GST mode: ${cf.advanceGstMode === 'taxed_on_advance' ? 'GST on the advance invoice, reversed on each recovery' : 'GST at the final invoice, advance invoiced net'} · unrecovered advance on this PO: <b>${money(o)}</b>. An advance is part of a milestone's value paid early and recovered from its invoices — never extra money.</p>`}
  ${list.length ? `<div class="sec" style="font-size:16px;margin-top:26px">Advances Requests</div><div class="inv-cards">${list.map(a => advCard(a, po)).join('')}</div>` : (terms.length ? `<div class="sec" style="font-size:16px;margin-top:26px">Advances Requests</div>${box('No Advances')}` : '')}`;
}
ACT['adv-new'] = el => openAdvRequest(el.dataset.po, el.dataset.ms);
function openAdvRequest(poId, msId) {
  const po = getPO(poId), terms = msOf(po).filter(m => m.advance && m.advance.allowed && !advOfMs(m).some(ADV_OPEN) && usage('milestone', m.id).value < m.amount - EPS);
  if (!terms.length) return toast('No milestone can take an advance right now — each needs terms set by the buyer and no open advance.', 'err');
  const first = terms.find(m => m.id === msId) || terms[0], rate = gstOf(po), mode = poCfg(po).advanceGstMode;
  const ov = openModal({ title: 'Create Advance', submitLabel: 'Request advance', cls: 'adv-modal', html: `<p style="margin:-6px 0 14px;font-size:12.5px">Enter the below details to add advance</p>
    ${fld('Milestone', 'ms', { opts: terms.map(m => [m.id, `${m.code} — ${m.name} (advance ${money(advTermAmount(m))})`]), value: first.id, req: true })}
    ${fld('Base amount', 'base', { type: 'number', step: 'any', value: advTermAmount(first), ph: 'Enter Base Amount', req: true, hint: '<span id="adv-cap"></span>' })}
    ${fld('Select GST (percentage)', 'gst', { opts: [[rate, `${rate}% — PO rate`]], value: rate })}
    <div class="field"><label>GST amount</label><div class="ro" id="adv-gst"></div><div class="fhint" id="adv-gstnote"></div></div>
    ${fld('Select TDS', 'tds', { opts: TDS_RATES.map(t => [t, t ? `${t}%` : 'No TDS']), value: 0 })}
    <div class="field"><label>Total amount</label><div class="ro" id="adv-total"></div></div>
    <div class="field"><label>Total payable (after TDS deduction)</label><div class="ro strong" id="adv-pay"></div></div>
    ${fld('Remarks', 'remarks', { ph: 'Enter Remarks' })}
    <div class="field"><label>Attachments</label><input class="input" type="file" name="afile" multiple><div class="fhint">Optional supporting documents.</div></div>
    <div id="adv-chk"></div>`,
    onSubmit: v => { const files = [...(ov.querySelector('[name=afile]').files || [])].map(f => f.name); const r = A.requestAdvance({ poId, msId: v.ms, base: +v.base, tdsPct: +v.tds, remarks: v.remarks, attachments: files });
      if (!r.ok) { errorModal(r.msg || 'Advance blocked', r.errors || [r.msg]); return false; } toast(r.msg); render(); } });
  const f = ov.querySelector('form'), upd = () => {
    const m = getMS(f.ms.value), base = r2(+f.base.value || 0), gst = mode === 'taxed_on_advance' ? r2(base * rate / 100) : 0, tds = r2(base * (+f.tds.value || 0) / 100), cap = r2(m.amount * poCfg(po).maxAdvancePctPerMilestone / 100);
    ov.querySelector('#adv-gst').textContent = money(gst); ov.querySelector('#adv-gstnote').textContent = mode === 'taxed_on_advance' ? `GST at ${rate}% is charged on the advance invoice and reversed on each recovery.` : 'GST mode is "taxed at final": the advance is invoiced net and GST is charged on the full milestone invoice.';
    ov.querySelector('#adv-total').textContent = money(r2(base + gst)); ov.querySelector('#adv-pay').textContent = money(r2(base + gst - tds));
    ov.querySelector('#adv-cap').textContent = `Terms: ${money(advTermAmount(m))} · cap ${poCfg(po).maxAdvancePctPerMilestone}% = ${money(cap)} · milestone ${money(m.amount)}`;
    const errs = base > 0 ? advCapErrors(po, m, base) : []; ov.querySelector('#adv-chk').innerHTML = errs.length ? alertBox('err', 'This advance would be blocked', errList(errs)) : '';
  };
  f.addEventListener('input', upd); f.addEventListener('change', e => { if (e.target.name === 'ms') f.base.value = advTermAmount(getMS(f.ms.value)); upd(); }); upd();
}

/* ================================================================ advance drawer */
ACT['adv-open'] = el => openAdvPanel(el.dataset.id);
function openAdvPanel(id) {
  const get = () => getAdv(id);
  openPanel({ key: 'adv-' + id, mid: true, title: () => `${get().number} — advance`, sub: () => `${esc(getPO(get().poId).number)} · ${esc(advMsOf(get()).code)} ${esc(advMsOf(get()).name)}`, body: () => advPanelBody(get()), foot: () => advPanelFoot(get()) });
}
function guaranteeCard(g, title, st, holder, kind) {
  const state = gState(g), up = kind === 'adv' ? 'adv-guar-up' : 'ms-guar-up', ok = kind === 'adv' ? 'adv-guar-ok' : 'ms-guar-ok', no = kind === 'adv' ? 'adv-guar-no' : 'ms-guar-no';
  return `<div class="sec-h">${esc(title)} <span class="hint" style="text-transform:none;font-weight:400;letter-spacing:0">· verified by Finance</span></div>
  <div class="card flat"><div class="row">${gChip(g)}<span class="hint">${gDetail(g)}</span></div>
    ${g && (g.files || []).length ? `<div style="margin-top:8px">${attachChips(g.files)}</div><div class="hint" style="margin-top:6px">Uploaded by ${esc(g.uploadedBy)} on ${fmtDT(g.uploadedAt)}${g.verifiedBy ? ` · ${g.status === 'Rejected' ? 'rejected' : 'verified'} by ${esc(g.verifiedBy)} on ${fmtDT(g.verifiedAt)}` : ''}</div>` : ''}
    ${state === 'Rejected' ? alertBox('err', 'Rejected', `${esc(g.rejectReason)} — upload a corrected guarantee.`) : ''}${state === 'Expired' ? alertBox('err', 'Expired', `Valid until ${fmtD(g.validUntil)}. No new invoices until a valid guarantee is verified.`) : ''}
    <div class="row" style="margin-top:12px">${st.upload ? gbtn('guar.upload', up, state === 'Not Uploaded' ? 'Upload guarantee' : 'Upload replacement', { cls: 'btn-outline btn-sm', data: { id: holder.id }, icn: 'upload' }) : ''}${state === 'Uploaded' ? gbtn('guar.verify', ok, 'Verify', { cls: 'btn-primary btn-sm', data: { id: holder.id }, icn: 'check' }) + gbtn('guar.verify', no, 'Reject', { cls: 'btn-danger btn-sm', data: { id: holder.id } }) : ''}${state === 'Uploaded' && !can('guar.verify') ? roleBanner('guar.verify', 'Verifying a guarantee') : ''}</div></div>`;
}
function advPanelBody(a) {
  const po = getPO(a.poId), m = advMsOf(a), st = advStatus(a), inv = advInvoiceOf(a), P = advP(a), R = advR(a), O = advO(a), F = a.refunded || 0;
  const bn = { Requested: ['amber', 'Requested — waiting for the approver', `Requested by ${a.requestedBy} on ${fmtDT(a.requestedAt)}. An approver other than the requester decides within the caps.`], 'Guarantee pending': ['amber', 'Approved — guarantee pending', `Finance must verify the ${a.guaranteeTitle} before the supplier can raise the advance invoice.`], Approved: ['green', 'Approved — raise the advance invoice', 'The supplier can now raise the advance invoice. It needs no receipt or milestone completion.'],
    'Invoice raised': ['blue', 'Advance invoice raised', `${inv ? invRef(inv) + ' is ' + inv.status : ''}. Recovery starts once milestone invoices are raised.`], Paid: ['green', 'Paid — outstanding until recovered', 'Every later invoice on the milestone recovers part of it automatically.'], 'Partly recovered': ['blue', 'Partly recovered', `${money(R)} recovered on later invoices; ${money(O)} still outstanding.`], Recovered: ['green', 'Fully recovered', 'Advance paid equals advance recovered.'], Refunded: ['gray', 'Refunded', 'The unused advance was returned.'], Rejected: ['red', 'Rejected', a.rejectReason || '']}[st];
  const recs = db.invoices.filter(i => isLive(i) && i.recovery && i.recovery.items.some(x => x.advId === a.id));
  return `${stBanner(bn[0], bn[1], bn[2])}
  ${strip([['Advance (base)', money(a.base), `${a.recovery === 'first' ? 'first-invoice' : 'proportional'} recovery`], ['Paid / invoiced (P)', money(P)], ['Recovered (R)', money(R), recs.map(invRef).join(', ')], ['Refunded (F)', money(F)], ['Outstanding (O = P − R − F)', money(O), O > EPS ? 'counts against the PO ceiling' : '', O > EPS ? 'hl' : '']])}
  <div class="sec-h">Advance request</div><div class="kvg c2">${kv('Milestone', `${esc(m.code)} — ${esc(m.name)} (${money(m.amount)})`)}${kv('GST', `${a.gstPct}% → ${money(a.gst)}${poCfg(po).advanceGstMode === 'taxed_at_final' ? ' (taxed at final)' : ''}`)}${kv('Total', money(a.total))}${kv('TDS', `${a.tdsPct}% → ${money(a.tds)}`)}${kv('Payable after TDS', money(a.payable))}${kv('Remarks', esc(a.remarks) || '—')}${kv('Requested by', `${esc(a.requestedBy)} · ${fmtDT(a.requestedAt)}`)}${kv('Approved', a.approved ? `${esc(a.approvedBy)} · ${fmtDT(a.approvedAt)}` : '—')}${kv('Attachments', attachChips(a.attachments) || '—')}</div>
  ${a.guaranteeRequired ? guaranteeCard(a.guarantee, a.guaranteeTitle, { upload: !a.rejected && !['Recovered', 'Refunded'].includes(st) }, a, 'adv') : ''}
  ${inv ? `<div class="sec-h">Advance invoice</div><div class="row">${invLink(inv)} <span class="hint">${esc(inv.number)}</span> ${sb(inv.status)}<span class="spacer"></span><b>${money(inv.gross)}</b></div>` : ''}
  ${recs.length ? `<div class="sec-h">Recoveries on later invoices</div>${recs.map(i => `<div class="row" style="padding:5px 0">${invLink(i)} <span class="hint">${esc(i.number)}</span> ${sb(i.status)}<span class="spacer"></span><b>−${money(sum(i.recovery.items.filter(x => x.advId === a.id), x => x.net))}</b></div>`).join('')}` : ''}
  <div class="sec-h">History</div><ul class="tl">${(a.history || []).slice().reverse().map(h => `<li class="${h.action === 'Rejected' ? 'bad' : ['Approved', 'Refunded'].includes(h.action) ? 'ok' : ''}"><div class="tt">${esc(h.action)}${h.note ? ' — ' + esc(h.note) : ''}</div><div class="tm">${esc(h.by)} · ${fmtDT(h.at)}</div></li>`).join('')}</ul>`;
}
function advPanelFoot(a) {
  const st = advStatus(a), out = [];
  if (st === 'Requested') out.push(gbtn('adv.approve', 'adv-reject', 'Reject', { cls: 'btn-danger', data: { id: a.id } }), gbtn('adv.approve', 'adv-approve', 'Approve advance', { cls: 'btn-primary', data: { id: a.id }, icn: 'check' }));
  if (st === 'Approved') out.push(gbtn('inv.create', 'inv-new', 'Raise advance invoice', { cls: 'btn-primary', data: { po: a.poId, adv: a.id }, icn: 'receipt' }));
  if (['Paid', 'Partly recovered'].includes(st) && advO(a) > EPS) out.push(gbtn('adv.refund', 'adv-refund', 'Record refund', { cls: 'btn-outline', data: { id: a.id } }));
  return out.join('');
}
ACT['adv-approve'] = el => { const a = getAdv(el.dataset.id); confirmBox({ title: 'Approve advance', message: `Approve <b>${esc(a.number)}</b> (${money(a.base)}) against ${esc(advMsOf(a).code)}? ${a.guaranteeRequired ? `The supplier can invoice it only after Finance verifies the ${esc(a.guaranteeTitle)}.` : 'The supplier can then raise the advance invoice.'}`, confirmLabel: 'Approve', onConfirm: () => done(A.approveAdvance(a.id)) }); };
ACT['adv-reject'] = el => reasonModal({ title: 'Reject advance', label: 'Rejection reason', btn: 'Reject advance', onSubmit: reason => { done(A.rejectAdvance(el.dataset.id, reason)); } });
ACT['adv-refund'] = el => { const a = getAdv(el.dataset.id); openModal({ title: `Refund ${a.number}`, submitLabel: 'Record refund', html: `<p style="margin-bottom:12px">Outstanding advance: <b>${money(advO(a))}</b>. Only a refund — never a credit note — reduces an advance. A fully refunded advance frees the milestone for cancellation.</p>${fld('Refund amount (INR)', 'amount', { type: 'number', step: 'any', value: advO(a), req: true })}${fld('Reason', 'reason', { rows: 2, req: true })}`, onSubmit: v => { const r = A.refundAdvance(a.id, { amount: +v.amount, reason: v.reason }); if (!r.ok) { errorModal(r.msg, r.errors || [r.msg]); return false; } toast(r.msg); render(); } }); };
function guaranteeModal(title, holderLabel, onSave) {
  openModal({ title, submitLabel: 'Upload for verification', html: `${fld('Issuing bank', 'bank', { req: true, ph: 'e.g. HDFC Bank' })}${fld('Guarantee amount (INR)', 'amount', { type: 'number', step: 'any', req: true })}${fld('Valid until', 'validUntil', { type: 'date', req: true, value: daysFromNow(180) })}${fld('Attachment (file name)', 'file', { value: 'bank-guarantee.pdf', hint: 'Or choose a file below' })}<div class="field"><input class="input" type="file" name="gfile"></div><p class="hint">Finance verifies the guarantee; an expired or rejected guarantee reopens the gate.</p>`,
    onSubmit: (v, form) => { const fl = form.querySelector('[name=gfile]').files[0]; const r = onSave({ bank: v.bank, amount: +v.amount, validUntil: v.validUntil, files: [fl ? fl.name : String(v.file || '').trim()].filter(Boolean) }); if (!r.ok) { errorModal(r.msg || 'Blocked', r.errors || [r.msg]); return false; } toast(r.msg); render(); } });
}
ACT['adv-guar-up'] = el => { const a = getAdv(el.dataset.id); guaranteeModal(`Upload ${a.guaranteeTitle}`, a.number, d => A.advUploadGuarantee(a.id, { ...d, amount: d.amount })); };
ACT['adv-guar-ok'] = el => done(A.advVerifyGuarantee(el.dataset.id));
ACT['adv-guar-no'] = el => reasonModal({ title: 'Reject guarantee', label: 'Reason', btn: 'Reject guarantee', onSubmit: reason => { done(A.advRejectGuarantee(el.dataset.id, reason)); } });
ACT['ms-guar-up'] = el => { const m = getMS(el.dataset.id); guaranteeModal(`Upload ${m.guaranteeTitle}`, m.code, d => A.msUploadGuarantee(m.id, d)); };
ACT['ms-guar-ok'] = el => done(A.msVerifyGuarantee(el.dataset.id));
ACT['ms-guar-no'] = el => reasonModal({ title: 'Reject guarantee', label: 'Reason', btn: 'Reject guarantee', onSubmit: reason => { done(A.msRejectGuarantee(el.dataset.id, reason)); } });
ACT['ms-doc-revoke'] = el => reasonModal({ title: 'Withdraw document approval', label: 'Reason', btn: 'Withdraw approval', ph: 'e.g. certificate was for the wrong site', extra: '<p style="margin-bottom:12px">The gate reopens exactly as for a reversed receipt: the milestone is Not Eligible, unposted invoices fail re-matching and posted ones are flagged for AP review.</p>', onSubmit: reason => { done(A.msRevokeDoc(el.dataset.id, reason)); } });

/* ================================================================ approvals queue: advances and guarantees */
function advQueue() {
  const items = [];
  advList().filter(a => !a.rejected).forEach(a => { const st = advStatus(a); if (st === 'Requested') items.push({ t: 'adv', a }); if (a.guaranteeRequired && gState(a.guarantee) === 'Uploaded') items.push({ t: 'advg', a }); });
  db.milestones.forEach(m => { if (m.needsGuarantee && gState(m.guarantee) === 'Uploaded') items.push({ t: 'msg', m }); });
  return items;
}
function advQueueHtml(list) {
  return `<table class="tbl"><thead><tr><th>Item</th><th>PO</th><th>Milestone</th><th class="right">Amount</th><th>Waiting for</th><th></th></tr></thead><tbody>${list.map(x => {
    if (x.t === 'adv') { const a = x.a, po = getPO(a.poId); return `<tr><td class="strong">${esc(a.number)}<div class="sub">Advance · ${esc(a.requestedBy)}</div></td><td>${esc(po.number)}</td><td>${esc(advMsOf(a).code)}</td><td class="num">${fmtNum(a.base)}</td><td>Approval ${sb('Requested')}</td><td class="act"><button class="btn-view" data-act="adv-open" data-id="${a.id}">${icon('open', 12, 2)}Open</button> ${gbtn('adv.approve', 'adv-reject', 'Reject', { cls: 'btn-danger btn-xs', data: { id: a.id } })} ${gbtn('adv.approve', 'adv-approve', 'Approve', { cls: 'btn-primary btn-xs', data: { id: a.id } })}</td></tr>`; }
    if (x.t === 'advg') { const a = x.a, po = getPO(a.poId); return `<tr><td class="strong">${esc(a.guaranteeTitle)}<div class="sub">${esc(a.number)} · ${gDetail(a.guarantee)}</div></td><td>${esc(po.number)}</td><td>${esc(advMsOf(a).code)}</td><td class="num">${fmtNum(a.guarantee.amount)}</td><td>Finance verification ${sb('Uploaded')}</td><td class="act"><button class="btn-view" data-act="adv-open" data-id="${a.id}">${icon('open', 12, 2)}Open</button> ${gbtn('guar.verify', 'adv-guar-no', 'Reject', { cls: 'btn-danger btn-xs', data: { id: a.id } })} ${gbtn('guar.verify', 'adv-guar-ok', 'Verify', { cls: 'btn-primary btn-xs', data: { id: a.id } })}</td></tr>`; }
    const m = x.m, po = getPO(m.poId); return `<tr><td class="strong">${esc(m.guaranteeTitle)}<div class="sub">${esc(m.code)} · ${gDetail(m.guarantee)}</div></td><td>${esc(po.number)}</td><td>${esc(m.code)}</td><td class="num">${fmtNum(m.guarantee.amount)}</td><td>Finance verification ${sb('Uploaded')}</td><td class="act"><button class="btn-view" data-act="ms-open" data-id="${m.id}">${icon('open', 12, 2)}Open</button> ${gbtn('guar.verify', 'ms-guar-no', 'Reject', { cls: 'btn-danger btn-xs', data: { id: m.id } })} ${gbtn('guar.verify', 'ms-guar-ok', 'Verify', { cls: 'btn-primary btn-xs', data: { id: m.id } })}</td></tr>`; }).join('') || emptyRow(6, 'No advances or guarantees awaiting a decision.')}</tbody></table>`;
}

/* ================================================================ reports + settings (Billing Overview) */
function advReportsHtml() {
  const out = outstandingAdvances(), exp = expiringGuarantees(30), rev = reviewItems();
  return `<div class="sec">Outstanding advances by age<span class="sub">paid but not yet recovered (O = P − R − F)</span></div>
  <div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Advance</th><th>PO</th><th>Milestone</th><th class="right">Paid (P)</th><th class="right">Recovered (R)</th><th class="right">Outstanding (O)</th><th class="right">Days since paid</th><th>Milestone status</th></tr></thead><tbody>${out.map(x => `<tr class="click" data-act="adv-open" data-id="${x.adv.id}"><td class="strong">${esc(x.adv.number)}</td><td>${esc(x.po.number)}</td><td>${esc(x.m.code)} ${esc(x.m.name)}</td><td class="num">${fmtNum(x.P)}</td><td class="num">${fmtNum(x.R)}</td><td class="num strong">${fmtNum(x.O)}</td><td class="num ${x.days > 60 ? 'bad-t' : ''}">${x.days}</td><td>${sb(msBilling(x.m, x.po) === 'Not Eligible' ? x.m.status : msBilling(x.m, x.po))}</td></tr>`).join('') || emptyRow(8, 'No outstanding advances.')}</tbody></table></div>
  <div class="sec">Guarantees expiring within 30 days<span class="sub">or already expired</span></div>
  <div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Type</th><th>Reference</th><th>Guarantee</th><th>Bank</th><th class="right">Amount</th><th>Valid until</th><th>State</th></tr></thead><tbody>${exp.map(x => `<tr class="click" data-act="go" data-hash="#/po/${x.poId}?tab=${x.kind === 'Advance' ? 'advances' : 'billing'}"><td>${x.kind}</td><td class="strong">${esc(x.ref)}</td><td>${esc(x.title)}</td><td>${esc(x.g.bank)}</td><td class="num">${fmtNum(x.g.amount)}</td><td>${fmtD(x.g.validUntil)}</td><td>${sb(x.state)}</td></tr>`).join('') || emptyRow(7, 'No guarantee is close to expiry.')}</tbody></table></div>
  <div class="sec">AP review items<span class="sub">posted / paid invoices whose receipt or milestone entitlement later dropped (invoiced + unrecovered advance above entitlement)</span></div>
  <div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Invoice</th><th>PO</th><th>Type</th><th>Source</th><th class="right">Overage</th><th>Status</th></tr></thead><tbody>${rev.map(x => `<tr class="click" data-act="inv-view" data-id="${x.inv.id}"><td class="strong">${invRef(x.inv)}</td><td>${esc(x.po.number)}</td><td>${esc(x.type)}</td><td>${esc(x.refs.join(', '))}</td><td class="num bad-t">${fmtNum(x.amount)}</td><td>${sb(x.inv.status)}</td></tr>`).join('') || emptyRow(6, 'No AP review items.')}</tbody></table></div>`;
}
function settingsCardHtml() {
  const c = cfg();
  return `<div class="sec">Billing settings<span class="sub">system-wide · PO-level caps are set per PO</span></div>
  <div class="card"><div class="fgrid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    ${fld('Approver reminder after (days)', 'set-rem', { type: 'number', value: c.reminderAfterDays })}${fld('Escalate to Procurement after (days)', 'set-esc', { type: 'number', value: c.escalateAfterDays })}${fld('Stale reservation timeout (hours)', 'set-hrs', { type: 'number', value: c.reservationTimeoutHours })}
    <div class="field"><label>Admin exempt from segregation of duties</label><label class="check-row" style="margin-top:8px"><input type="checkbox" id="set-adm" ${c.adminExemptFromSod ? 'checked' : ''}> Demo Admin may approve its own submissions (turn off for production)</label></div></div>
    <div class="row" style="margin-top:10px">${actBtn('set-save', 'Save settings', { cls: 'btn-primary btn-sm' })}</div></div>
  <div class="card" style="margin-top:14px"><div class="card-t">Delegate approvals<span class="sub">when an approver is away or leaves, delegate to another role — pending items move to the delegate, earlier approvals stay valid</span></div>
    ${(db.meta.delegations || []).map(d => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(ROLES[d.from].name)}</b> → <b>${esc(ROLES[d.to].name)}</b><span class="hint">${d.until ? 'until ' + fmtD(d.until) : 'no end date'} · by ${esc(d.by)}</span><span class="spacer"></span>${actBtn('deleg-del', 'End', { cls: 'btn-ghost btn-xs', data: { id: d.id } })}</div>`).join('') || '<div class="hint">No delegations.</div>'}
    <div class="fgrid" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-top:12px">${fld('Delegate from', 'dg-from', { opts: Object.entries(ROLES).filter(([k]) => k !== 'admin').map(([k, r]) => [k, r.name]), value: 'owner' })}${fld('Delegate to', 'dg-to', { opts: Object.entries(ROLES).filter(([k]) => k !== 'admin').map(([k, r]) => [k, r.name]), value: 'buyer' })}${fld('Until (optional)', 'dg-until', { type: 'date' })}<div class="field"><label>&nbsp;</label>${actBtn('deleg-add', 'Add delegation', { cls: 'btn-outline btn-sm' })}</div></div></div>`;
}
ACT['deleg-add'] = () => { const v = n => (document.querySelector(`[name="${n}"]`) || {}).value; done(A.addDelegation(v('dg-from'), v('dg-to'), v('dg-until'))); };
ACT['deleg-del'] = el => done(A.removeDelegation(el.dataset.id));
ACT['set-save'] = () => {
  const v = id => +(document.querySelector(`[name="${id}"]`) || {}).value, rem = v('set-rem'), esc_ = v('set-esc'), hrs = v('set-hrs');
  if (!(rem > 0) || !(esc_ > rem)) return toast('Escalation must come after the reminder (both above zero).', 'err');
  if (!(hrs > 0)) return toast('Enter the reservation timeout in hours.', 'err');
  db.meta.settings = { reminderAfterDays: rem, escalateAfterDays: esc_, reservationTimeoutHours: hrs, adminExemptFromSod: !!document.getElementById('set-adm').checked };
  save(); toast('Settings saved'); render();
};

/* ================================================================ multi-line invoice intake (spec 7.5) */
function intakeSample(po) {
  const L = po.lines, rows = L.map(l => ({ ref: 'L' + l.no, desc: l.desc, qty: Math.max(1, Math.round(l.qty * 0.6)), rate: l.price, amount: Math.max(1, Math.round(l.qty * 0.6)) * l.price })), first = rows[0];
  if (L[1]) rows.push({ ref: 'L' + L[1].no, desc: L[1].desc, qty: 2, rate: Math.round(L[1].price * 1.04), amount: 2 * Math.round(L[1].price * 1.04) });
  rows.push({ ref: '', desc: 'Mystery spare parts', qty: 1, rate: 1000, amount: 1000 });
  if (first) rows.push({ ...first });
  if (L[1]) rows.push({ ref: 'L' + L[1].no, desc: L[1].desc, qty: 1, rate: L[1].price, amount: L[1].price, taxRate: 12 });
  return rows;
}
const intakeText = rows => rows.map(r => [r.ref, r.desc, r.qty ?? '', r.rate ?? '', r.amount ?? '', r.taxRate ?? ''].join(' | ')).join('\n');
function parseIntake(txt) {
  return String(txt || '').split('\n').map(l => l.trim()).filter(l => l && !/^ref\b/i.test(l)).map(l => { const p = l.split(/\s*[|\t]\s*|,(?=\s*\d|\s*$)/).map(x => x.trim()); return { ref: p[0] || '', desc: p[1] || '', qty: p[2] === '' ? null : +p[2], rate: p[3] === '' ? null : +p[3], amount: p[4] === '' ? null : +p[4], taxRate: p[5] === '' || p[5] == null ? null : +p[5] }; });
}
ACT['inv-intake'] = () => {
  const f = ui.f, po = getPO(f.poId); if (!po) return;
  let rows = null, res = null;
  const ov = openModal({ title: 'Match supplier invoice lines', cls: 'xwide', submitLabel: 'Use billable lines', html: `<p class="hint" style="margin:-6px 0 12px">Paste the supplier's lines (<b>ref | description | qty | rate | amount | tax %</b>). Each line is matched to a PO line and milestone, then checked in order: PO match → duplicate → rate → milestone state → remaining quantity → tax → PO ceiling.</p>
    <textarea class="input" id="in-txt" rows="7" placeholder="L1 | Rack servers | 6 | 300000 | 1800000"></textarea>
    <div class="row" style="margin:8px 0"><button type="button" class="btn btn-outline btn-xs" id="in-sample">Load sample lines</button><button type="button" class="btn btn-primary btn-xs" id="in-run">Match lines</button><span class="hint" id="in-count"></span></div><div id="in-res"></div>`,
    onSubmit: () => { if (!res || !res.allocs.length) { toast('Match lines first — nothing is billable yet.', 'err'); return false; }
      f.alloc = {}; res.allocs.forEach(a => { f.alloc[a.kind + ':' + a.refId] = { on: true, qty: a.qty, value: a.value, ...(a.lines ? { lines: a.lines } : {}) }; });
      const num = ov.querySelector('[name=in-num]'); if (num && num.value.trim() && !f.number) f.number = num.value.trim();
      snapAlloc(f, po); render(); toast(`${res.groups.Billable.length} billable line(s) added; ${res.groups.Waiting.length} waiting, ${res.groups.Reject.length} rejected.`); } });
  const txt = ov.querySelector('#in-txt'), out = ov.querySelector('#in-res');
  const lineOpts = sel => `<option value="">auto</option>${po.lines.map(l => `<option value="${l.id}" ${sel === l.id ? 'selected' : ''}>L${l.no} ${esc(String(l.desc).slice(0, 28))}</option>`).join('')}`;
  const msOpts = sel => `<option value="">auto</option>${msOf(po).map(m => `<option value="${m.id}" ${sel === m.id ? 'selected' : ''}>${m.code}</option>`).join('')}`;
  const run = () => {
    if (!rows) rows = parseIntake(txt.value); res = matchInvoiceLines(po, rows, { number: f.number || '' });
    ov.querySelector('#in-count').textContent = `${rows.length} line(s)`;
    const g = res.groups;
    out.innerHTML = `<div class="strip" style="margin:6px 0 12px"><div><div class="k">Claimed</div><div class="v">${money(res.claimed)}</div></div><div><div class="k">Billable</div><div class="v ok-t">${money(res.billable)}</div></div><div><div class="k">Waiting</div><div class="v">${g.Waiting.length}</div></div><div><div class="k">Rejected</div><div class="v bad-t">${g.Reject.length}</div></div></div>
      <div class="tbl-wrap" style="max-height:340px;overflow:auto"><table class="tbl sm"><thead><tr><th>#</th><th>Supplier line</th><th class="right">Amount</th><th>PO line</th><th>Milestone</th><th>Result</th><th class="right">Billable</th><th>Why</th></tr></thead><tbody>${res.rows.map((r, i) => `<tr><td>${r.n}</td><td>${esc(r.desc || r.ref)}<div class="sub">${r.qty != null ? fmtNum(r.qty) + ' × ' + fmtNum(r.rate) : ''}</div></td><td class="num">${fmtNum(r.amount)}</td>
        <td><select class="input sm" data-ov="line" data-i="${i}">${lineOpts(rows[i].lineId || '')}</select></td><td><select class="input sm" data-ov="ms" data-i="${i}">${msOpts(rows[i].msId || '')}</select></td><td><span class="badge-s s-${r.status === 'Billable' ? 'green' : r.status === 'Waiting' ? 'amber' : 'red'}">${r.status}</span></td><td class="num strong">${r.billable ? fmtNum(r.billable) : '—'}${r.excess > EPS && r.billable ? `<div class="sub">excess ${fmtNum(r.excess)}</div>` : ''}</td><td class="sub" style="white-space:normal;max-width:260px">${esc(r.reason)}</td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:10px"><label class="check-row"><input type="text" class="input sm" name="in-num" placeholder="Supplier bill number" style="width:200px" value="${esc(f.number || '')}"></label><span class="spacer"></span><button type="button" class="btn btn-outline btn-xs" id="in-msg">Return message for the rejected / waiting lines</button></div><div id="in-msgbox"></div>`;
  };
  ov.querySelector('#in-sample').onclick = () => { rows = intakeSample(po); txt.value = intakeText(rows); run(); };
  ov.querySelector('#in-run').onclick = () => { rows = parseIntake(txt.value); run(); };
  out.addEventListener('change', e => { const s = e.target.closest('[data-ov]'); if (!s) return; const r = rows[+s.dataset.i]; r[s.dataset.ov === 'line' ? 'lineId' : 'msId'] = s.value || null; run(); });
  out.addEventListener('click', e => { if (e.target.closest('#in-msg')) { ov.querySelector('#in-msgbox').innerHTML = `<textarea class="input" rows="8" readonly style="margin-top:8px">${esc(res.message)}</textarea>`; } });
};
