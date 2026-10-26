/* =====================================================================
   screens-bill.js — the PO "Billing" tab: milestones, certified progress claims,
   receipt-based allocation, and their drawers
   ===================================================================== */
const allocRefLabel = a => a.kind === 'grn' ? getGRN(a.refId)?.number : a.kind === 'srn' ? getSRN(a.refId)?.number : a.kind === 'milestone' ? getMS(a.refId) && msFull(getMS(a.refId)) : getClaim(a.refId)?.number;
const gateCell = (m, po) => { const g = msGate(m, po); return !m.needsReceipt ? '<span class="dim-note">Not required</span>' : g.rec ? `<span class="strong">${esc(g.rec.number)}</span> ${sb(g.rec.reversed ? 'Reversed' : g.rec.status)}` : `<span class="warn-t">${g.label} required · none linked</span>`; };

/* ================================================================ receipt-based allocation (Standard / Progressive) */
function receiptEntitlementTable(po, s, progressive) {
  const items = s.items, alloc = [], g = isGoods(po);
  invsOf(po).filter(isLive).forEach(i => i.allocs.forEach(a => alloc.push({ i, a })));
  return `<div class="sec" style="margin-top:22px">${progressive ? `${recName(po)} allocation` : `Accepted ${recName(po)}s`}<span class="sub">${progressive ? `${recName(po)} value consumed by invoices (live = in approval, approved, posted or paid)` : 'Standard billing matches invoices against the accepted total at PO level'}</span><span class="spacer"></span>${po.status === 'Approved' ? gbtn('inv.create', 'inv-new', 'Submit Invoice', { cls: 'btn-primary', data: { po: po.id }, icn: 'plus' }) : ''}</div>
  <div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>${recName(po)}</th>${g ? '<th class="right">Delivered</th><th class="right">Accepted</th>' : ''}<th class="right">Accepted value</th><th class="right">Invoiced · approved</th><th class="right">Invoiced · in approval</th>${g ? '<th class="right">Available qty</th>' : ''}<th class="right">Available value</th><th>Status</th></tr></thead><tbody>
  ${items.map(x => `<tr class="${x.eligible ? '' : 'dim'}"><td class="strong"><a class="link" data-act="rc-open" data-kind="${x.kind}" data-id="${x.refId}" href="javascript:void 0">${x.label}</a><div class="sub">${fmtD(x.ref.date)}</div></td>${g ? `<td class="num">${fmtNum(x.ref.received)}</td><td class="num">${fmtNum(x.entQty)}</td>` : ''}<td class="num">${fmtNum(x.entValue)}</td>
    <td class="num">${g ? `${fmtNum(x.committedQty)} u / ` : ''}${fmtNum(x.committedValue)}</td><td class="num">${g ? `${fmtNum(x.reservedQty)} u / ` : ''}${fmtNum(x.reservedValue)}</td>${g ? `<td class="num">${fmtNum(x.availQty)}</td>` : ''}<td class="num strong">${fmtNum(x.availValue)}</td><td>${sb(x.status)}${!x.eligible && x.reason ? `<div class="sub">${esc(x.reason)}</div>` : ''}</td></tr>`).join('') || emptyRow(g ? 9 : 7, `No ${recName(po)}s yet — receipts are created from the ${recName(po)} tab.`)}
  <tr class="total"><td>Total</td>${g ? `<td class="num">${fmtNum(sum(items, x => x.ref.received))}</td><td class="num">${fmtNum(sum(items, x => x.entQty || 0))}</td>` : ''}<td class="num">${fmtNum(s.accepted)}</td><td class="num">${fmtNum(sum(items, x => x.committedValue))}</td><td class="num">${fmtNum(sum(items, x => x.reservedValue))}</td>${g ? `<td class="num">${fmtNum(sum(items, x => x.availQty || 0))}</td>` : ''}<td class="num">${fmtNum(s.remaining)}</td><td></td></tr></tbody></table></div>
  ${progressive ? `<div class="sec">Allocations by invoice</div><div class="tbl-wrap"><table class="tbl sm"><thead><tr><th>Invoice</th><th>Bill No.</th><th>${recName(po)}</th>${g ? '<th class="right">Qty</th>' : ''}<th class="right">Value</th><th>Invoice status</th><th>Allocation</th></tr></thead><tbody>${alloc.map(({ i, a }) => `<tr><td>${invLink(i)}</td><td>${esc(i.number)}</td><td>${esc(allocRefLabel(a))}</td>${g ? `<td class="num">${a.qty != null ? fmtNum(a.qty) : '—'}</td>` : ''}<td class="num">${fmtNum(a.value)}</td><td>${sb(i.status)}</td><td>${sb(APPROVED.includes(i.status) ? 'Committed' : 'Reserved')}</td></tr>`).join('') || emptyRow(g ? 7 : 6, 'No invoice has used a receipt yet.')}</tbody></table></div>` : ''}`;
}

/* ================================================================ milestones */
function milestoneTable(po, s) {
  const ms = msOf(po), tot = sum(ms, m => m.amount), appr = sum(ms, m => msEnt(m, po)), inv = sum(ms, m => usage('milestone', m.id).value);
  return `<div class="sec" style="margin-top:22px">Milestone schedule<span class="sub">Open a milestone to complete, approve, link its ${recName(po)} or invoice it</span><span class="spacer"></span>${po.status === 'Draft' ? gbtn('po.edit', 'po-edit', 'Edit schedule', { data: { id: po.id }, icn: 'edit', cls: 'btn-primary' }) : ''}${po.status === 'Approved' ? gbtn('po.amend', 'po-amend', 'Amend schedule', { data: { id: po.id }, icn: 'edit' }) : ''}</div>
  ${strip([['Schedule total', money(tot), `${fmtNum(sum(ms, m => m.pct))}% of PO`], ['Approved & cleared', money(appr), 'invoice-eligible'], ['Invoiced', money(inv)], ['Ready to invoice', money(s.remaining), 'approved − invoiced', 'hl']])}
  <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>ID</th><th>Milestone</th><th class="right">%</th><th class="right">Amount</th><th>Completion</th><th>${recName(po)} gate</th><th class="right">Invoiced</th><th>Billing</th><th></th></tr></thead><tbody>
  ${ms.map(m => { const u = usage('milestone', m.id), bill = msBilling(m, po);
    return `<tr class="click" data-act="ms-open" data-id="${m.id}"><td class="strong">${m.code}</td><td class="strong">${esc(m.name)}<div class="sub" style="font-weight:400">Due ${fmtD(m.planned)}</div></td><td class="num">${fmtNum(m.pct)}%</td><td class="num strong">${fmtNum(m.amount)}</td><td>${sb(m.status)}</td><td>${gateCell(m, po)}</td><td class="num">${u.value ? fmtNum(u.value) : '—'}${u.invs.length ? `<div class="sub">${u.invs.map(invRef).join(', ')}</div>` : ''}</td><td>${sb(bill)}</td><td class="act" data-stop>${msRowAction(m, po)}<button class="btn-view" data-act="ms-open" data-id="${m.id}">${icon('open', 12, 2)}View</button></td></tr>`; }).join('') || emptyRow(9, 'No milestones.')}
  <tr class="total"><td colspan="2">Total</td><td class="num">${fmtNum(sum(ms, m => m.pct))}%</td><td class="num">${fmtNum(tot)}</td><td colspan="2"></td><td class="num">${fmtNum(inv)}</td><td colspan="2"></td></tr></tbody></table></div>
  <p class="hint" style="margin-top:10px">${icon('lock', 12)} The schedule is fixed once the PO is approved. Changes need an amendment; invoiced milestones are never rewritten. A passed due date never makes a milestone billable.</p>`;
}
/* the one next action for a milestone, shown right on its schedule row */
function msRowAction(m, po) {
  const g = msGate(m, po), ent = msEnt(m, po), u = usage('milestone', m.id);
  if (['Pending Approval', 'Rejected'].includes(m.status)) return (can('ms.decide') ? gbtn('ms.decide', 'ms-approve', 'Approve', { cls: 'btn-primary btn-xs', data: { id: m.id }, icn: 'check' }) : actBtn('role-switch', 'Switch role to approve', { cls: 'btn-primary btn-xs', data: { role: rolesFor('ms.decide')[0] } })) + ' ';
  if (m.status === 'Approved') return g.ok ? gbtn('ms.submit', 'ms-open', 'Mark complete', { cls: 'btn-primary btn-xs', data: { id: m.id }, icn: 'check' }) + ' ' : actBtn('ms-open', `Needs ${g.label}`, { cls: 'btn-outline btn-xs', data: { id: m.id }, title: g.reason }) + ' ';
  if (ent - u.value > EPS) return gbtn('inv.create', 'inv-new', 'Invoice', { cls: 'btn-primary btn-xs', data: { po: po.id, ms: m.id } }) + ' ';
  return '';
}
ACT['ms-open'] = el => openMilestonePanel(el.dataset.id);
function openMilestonePanel(id) {
  const get = () => getMS(id), m0 = get();
  openPanel({ key: 'ms-' + id, mid: true, title: () => `${get().code} — ${get().name}`, sub: () => 'All milestone details',
    init: () => ({ actualDate: m0.actualDate || todayISO(), remarks: m0.remarks || '', evidence: [...(m0.evidence || [])] }),
    body: () => msPanelBody(get()), foot: () => msPanelFoot(get()) });
}
function msPanelBody(m) {
  const po = getPO(m.poId), u = usage('milestone', m.id), g = msGate(m, po), bill = msBilling(m, po), ent = msEnt(m, po), rec = g.rec, f = ui.f, L = recName(po);
  const banner = {
    Draft: ['gray', 'Draft schedule', 'The PO is not approved yet — milestones are approved once the PO is.'],
    'Pending Approval': ['amber', 'Step 1 · Waiting for approval', 'The approver reviews this milestone first, like the PO. Only then can it be worked on.'],
    Rejected: ['red', 'Rejected', m.rejectReason || ''],
    Approved: g.ok ? ['green', 'Step 3 · Ready to mark complete', 'Approved and all checks are clear. Mark it complete when the work is done — that makes it billable.'] : ['amber', `Step 2 · Waiting for the ${L}`, `Approved. Marking it complete is locked until the required ${L} is accepted — ${g.reason}.`],
    Completed: ent > 0 ? ['green', bill === 'Invoiced' ? 'Completed and invoiced' : 'Completed — ready to invoice', bill === 'Invoiced' ? 'The full milestone amount is on an invoice; a second invoice is blocked.' : `${money(ent)} is invoice-eligible and counted in the PO's accepted value.`] : ['amber', 'Completed — not billable', `Cannot be invoiced: ${g.reason}.`],
  }[m.status];
  const check = [
    [['Approved', 'Completed'].includes(m.status), 'Milestone approved', m.approvedAt ? `Approved ${fmtDT(m.approvedAt)}${m.approvedBy ? ' by ' + esc(m.approvedBy) : ''}` : `Status: ${m.status}`],
    [g.ok, g.required ? `Accepted ${L} linked` : `No ${L} required`, g.required ? (g.ok ? `${rec.number} is Accepted` : esc(g.reason)) : 'This milestone is not gated on a receipt.'],
    [m.status === 'Completed', 'Marked complete', m.status === 'Completed' ? `Completed ${fmtD(m.actualDate)}` : 'Done by the project owner / vendor once approved and the checks are clear'],
    [u.value < m.amount - EPS, 'Not yet invoiced', u.value >= m.amount - EPS ? `Invoiced on ${u.invs.map(invRef).join(', ')}` : `${money(r2(m.amount - u.value))} still to invoice`],
  ];
  const gst = r2(m.amount * gstOf(po) / 100);
  const need = ['Pending Approval', 'Rejected'].includes(m.status) ? roleBanner('ms.decide', 'Approving this milestone') : m.status === 'Approved' && g.ok ? roleBanner('ms.submit', 'Marking a milestone complete') : '';
  const decide = ['Pending Approval', 'Rejected'].includes(m.status) ? `<div class="card tint" style="margin-bottom:18px"><div class="card-t">Approve this milestone?</div><div class="hint" style="margin:-4px 0 12px">Approving ${m.code} (${money(m.amount)}) lets the team start on it. ${m.needsReceipt ? `It then needs an accepted ${L} before it can be marked complete.` : 'It can then be marked complete.'}</div><div class="row">${gbtn('ms.decide', 'ms-approve', 'Approve milestone', { cls: 'btn-primary', data: { id: m.id }, icn: 'check' })}${m.status === 'Pending Approval' ? gbtn('ms.decide', 'ms-reject', 'Reject', { cls: 'btn-danger', data: { id: m.id } }) : ''}</div></div>` : '';
  const head = `<div class="rc-top"><div><div class="rc-line"><b>PO Number:</b> ${esc(po.number)}</div><div class="rc-line"><b>Milestone ID:</b> ${esc(m.code)}</div></div><div class="rc-btns">${sb(m.status)} ${sb(bill)}</div></div>
  <div class="rc-items"><b>All Details</b></div>
  <div class="tbl-wrap boxedtbl"><table class="tbl sm plain"><thead><tr><th>Milestone</th><th>Due Date</th><th>% of PO</th><th>Amount</th><th>GST</th><th>Total</th><th>${L} Gate</th></tr></thead><tbody><tr><td><b>${esc(m.name)}</b><div class="sub">${esc(po.title)}</div></td><td>${fmtD(m.planned)}</td><td>${fmtNum(m.pct)}%</td><td>${fmtNum(m.amount)}</td><td>${gstOf(po)}%</td><td>${fmtNum(r2(m.amount + gst))}</td><td>${m.needsReceipt ? (rec ? `${esc(rec.number)}` : '<span class="warn-t">Required</span>') : 'Not required'}</td></tr></tbody></table></div>
  <div class="rc-sum"><div><b>Milestone Amount</b><span>${fmtNum(m.amount)}</span></div><div><b>Tax</b><span>${fmtNum(gst)}</span></div><div><b>Total Milestone Amount</b><span>${fmtNum(r2(m.amount + gst))}</span></div></div>
  <div style="height:18px"></div>`;
  const showForm = m.status === 'Approved' && g.ok;
  return `${head}${need}${stBanner(banner[0], banner[1], banner[2] || '')}${decide}
  ${strip([['Amount', money(m.amount), `${fmtNum(m.pct)}% of PO`], ['Ready to invoice', money(Math.max(0, r2(ent - u.value))), ent > 0 ? 'completed & cleared' : 'not yet eligible', ent - u.value > EPS ? 'hl' : ''], ['Invoiced', money(u.value), u.invs.map(invRef).join(', ')], ['Remaining', money(r2(m.amount - u.value))]])}
  <div class="sec-h">Progress</div><div class="checklist">${check.map(([ok, t, d]) => `<div class="it"><div class="ci ${ok ? 'ok' : 'no'}">${icon(ok ? 'check' : 'x', 11, 3)}</div><div><div class="strong">${t}</div><div class="d">${d}</div></div></div>`).join('')}</div>
  ${m.needsReceipt ? `<div class="sec-h">${L === 'GRN' ? 'Goods receipt (GRN)' : 'Service receipt (SRN)'} gate</div>
    <div class="card flat">${rec ? `<div class="row"><b>${esc(rec.number)}</b> ${sb(rec.reversed ? 'Reversed' : rec.status)} <span class="hint">${isGoods(po) ? `${fmtNum(rec.received)} units delivered · ${fmtNum(rec.accepted)} accepted` : `${money(rec.serviceValue)} service value`}</span><span class="spacer"></span><button class="link" data-act="rc-open" data-kind="${isGoods(po) ? 'grn' : 'srn'}" data-id="${rec.id}">Open ${L}</button></div>` : `<div class="hint">No ${L} linked yet. The ${L} is the proof that the ${isGoods(po) ? 'goods arrived and passed inspection' : 'service was delivered and accepted'}.</div>`}
    ${u.value > EPS ? '' : `<div class="row" style="margin-top:12px">${isGoods(po) ? gbtn('grn.create', 'grn-new', `Create GRN for ${m.code}`, { data: { po: po.id, ms: m.id }, icn: 'plus', cls: 'btn-outline btn-sm' }) : gbtn('srn.create', 'srn-new', `Create SRN for ${m.code}`, { data: { po: po.id, ms: m.id }, icn: 'plus', cls: 'btn-outline btn-sm' })}${actBtn('ms-link', rec ? `Change linked ${L}` : `Link existing ${L}`, { data: { id: m.id }, icn: 'link', cls: 'btn-outline btn-sm' })}${rec ? actBtn('ms-unlink', 'Unlink', { data: { id: m.id }, cls: 'btn-ghost btn-sm' }) : ''}</div>`}</div>
    ${m.needsReceipt && !rec && !can(isGoods(po) ? 'grn.create' : 'srn.create') ? roleBanner(isGoods(po) ? 'grn.create' : 'srn.create', `Creating the ${L}`) : ''}` : ''}
  ${showForm ? `<div class="sec-h">Mark as complete</div><div class="fgrid">${F.text('Completion date', 'actualDate', { type: 'date', req: 1 })}${F.ro('Status', 'Approved')}</div>${F.area('Remarks (optional)', 'remarks', { ph: 'What was completed?' })}<div class="field"><label>Supporting documents (optional)</label>${attachBox('evidence', f && f.evidence)}</div>` : ''}
  ${m.status === 'Completed' ? `<div class="sec-h">Completion record</div><div class="kvg c2">${kv('Completed on', fmtD(m.actualDate))}${kv('Completed by', esc(m.completedBy) || '—')}${kv('Remarks', esc(m.remarks) || '—')}${kv('Documents', attachChips(m.evidence) || '—')}</div>` : ''}
  ${u.invs.length ? `<div class="sec-h">Invoices</div>${allocsOn('milestone', m.id).map(({ inv, a }) => `<div class="row" style="padding:5px 0">${invLink(inv)} <span class="hint">${esc(inv.number)}</span> ${sb(inv.status)}<span class="spacer"></span><b>${money(a.value)}</b></div>`).join('')}` : ''}
  <div class="sec-h">History</div>${histList(`${po.number} / ${m.code}`, po.id)}`;
}
function msPanelFoot(m) {
  const po = getPO(m.poId), ent = msEnt(m, po), u = usage('milestone', m.id), g = msGate(m, po), a = [];
  if (['Pending Approval', 'Rejected'].includes(m.status)) { if (m.status === 'Pending Approval') a.push(gbtn('ms.decide', 'ms-reject', 'Reject', { cls: 'btn-danger', data: { id: m.id } })); a.push(gbtn('ms.decide', 'ms-approve', 'Approve milestone', { cls: 'btn-primary', data: { id: m.id }, icn: 'check' })); }
  if (m.status === 'Approved') a.push(g.ok ? gbtn('ms.submit', 'ms-complete', 'Mark complete', { cls: 'btn-primary', data: { id: m.id }, icn: 'check' }) : actBtn('ms-complete', 'Mark complete', { cls: 'btn-primary', dis: true, title: `Locked: ${g.reason}` }));
  if (ent - u.value > EPS) a.push(gbtn('inv.create', 'inv-new', `Submit Invoice for ${m.code}`, { cls: 'btn-primary', data: { po: po.id, ms: m.id }, icn: 'receipt' }));
  return a.join('');
}
ACT['ms-complete'] = el => { const f = ui.f; done(A.msComplete(el.dataset.id, { actualDate: f.actualDate, remarks: f.remarks, evidence: f.evidence })); };
ACT['ms-approve'] = el => { const m = getMS(el.dataset.id), po = getPO(m.poId); confirmBox({ title: 'Approve milestone', message: `Approve <b>${esc(msFull(m))}</b> (${money(m.amount)})? ${m.needsReceipt ? `It then needs an accepted ${recName(po)} before it can be marked complete.` : 'It can then be marked complete.'}`, confirmLabel: 'Approve', onConfirm: () => done(A.msApprove(m.id)) }); };
ACT['ms-reject'] = el => reasonModal({ title: 'Reject milestone', label: 'Rejection reason', btn: 'Reject milestone', onSubmit: reason => { done(A.msReject(el.dataset.id, reason)); } });
ACT['ms-unlink'] = el => done(A.msLinkReceipt(el.dataset.id, ''));
ACT['ms-link'] = el => {
  const m = getMS(el.dataset.id), po = getPO(m.poId), L = recName(po);
  const list = (isGoods(po) ? grnsOf(po) : srnsOf(po)).filter(r => !['Rejected'].includes(r.status) && !r.reversed);
  const opts = [['', `— No ${L} —`], ...list.map(r => [r.id, `${r.number} · ${isGoods(po) ? fmtNum(r.received) + ' units' : money(r.serviceValue)} · ${r.status}${r.milestoneId && r.milestoneId !== m.id ? ' (used by ' + getMS(r.milestoneId).code + ')' : ''}`])];
  openModal({ title: `Link ${L} to ${m.code}`, submitLabel: 'Link', html: fld(`${L}`, 'rec', { opts, value: m.receiptId || '' }) + `<p class="hint" style="margin-top:6px">The milestone and the ${L} stay separate records: the milestone is invoice-eligible only when it is approved <b>and</b> the ${L} is Accepted.</p>`, onSubmit: v => { done(A.msLinkReceipt(m.id, v.rec)); } });
};

/* ================================================================ certified progress claims (Services) */
function claimsBlock(po, s) {
  const cs = claimsOf(po), cum = cumCertified(po);
  return `<div class="sec" style="margin-top:22px">Progress claims<span class="sub">Certified work progress — current claim = new cumulative − previously certified</span><span class="spacer"></span>${po.status === 'Approved' ? gbtn('claim.create', 'claim-new', 'New progress claim', { cls: 'btn-primary', data: { po: po.id }, icn: 'plus' }) : ''}</div>
  ${strip([['PO value', money(s.value)], ['Cumulative certified', money(cum), `${fmtNum(pct(cum, s.value))}% of PO`], ['Invoiced', money(s.invoiced)], ['Ready to invoice', money(s.remaining), 'certified − invoiced', 'hl']])}
  <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Claim</th><th>Period</th><th class="right">Previously certified</th><th class="right">Current claim</th><th class="right">Cumulative claimed</th><th class="right">Certified</th><th>Status</th><th>Invoice</th><th class="right">Ready to invoice</th><th></th></tr></thead><tbody>
  ${cs.map(c => { const v = claimView(c), u = usage('claim', c.id); return `<tr class="click" data-act="claim-open" data-id="${c.id}"><td class="strong">${c.number}</td><td>${esc(c.period)}</td><td class="num">${fmtNum(v.prev)}</td><td class="num">${fmtNum(v.current)}</td><td class="num">${fmtNum(v.cum)}</td><td class="num">${c.status === 'Certified' ? fmtNum(v.certified) : '—'}</td><td>${sb(c.status)}</td><td>${u.invs.map(invLink).join(', ') || '—'}</td><td class="num strong">${c.status === 'Certified' ? fmtNum(v.remaining) : '—'}</td><td class="act"><button class="btn-view" data-act="claim-open" data-id="${c.id}">${icon('open', 12, 2)}View</button></td></tr>`; }).join('') || emptyRow(10, 'No progress claims yet.')}</tbody></table></div>`;
}
ACT['claim-new'] = el => {
  const poId = el.dataset.po;
  openPanel({ key: 'claim-new', title: 'New progress claim', sub: 'Claim cumulative progress for certification',
    init: () => ({ poId, period: `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`, claimedCum: '', remarks: '', evidence: [] }),
    body: () => { const f = ui.f, po = getPO(poId);
      return `<div class="fgrid">${F.ro('Purchase order', `<b>${esc(po.number)}</b>&nbsp;${esc(getSup(po.supplierId).name)}`, { cls: 'span2' })}${F.ro('PO value', money(poNet(po)))}${F.ro('Previously certified (cumulative)', money(cumCertified(po)))}
      ${F.text('Claim period', 'period', { req: 1 })}${F.text('New cumulative claimed (INR)', 'claimedCum', { type: 'number', step: 'any', num: 1, req: 1, ph: 'e.g. 50000' })}</div>
      <div class="field"><label>Current claim (derived)</label><div class="ro strong" id="c-cur"></div><div class="fhint">= new cumulative − previously certified</div></div><div id="rc-val"></div>
      ${F.area('Remarks', 'remarks')}<div class="field"><label>Supporting evidence <span class="req">*</span></label>${attachBox('evidence', f.evidence)}</div>`; },
    foot: () => gbtn('claim.create', 'claim-save', 'Submit for certification', { cls: 'btn-dark' }),
    derive: () => { const f = ui.f, po = getPO(f.poId), prev = cumCertified(po), cum = +f.claimedCum || 0, c = $('#c-cur'); if (!c) return;
      c.textContent = money(cum ? r2(cum - prev) : 0);
      $('#rc-val').innerHTML = cum && cum <= prev + EPS ? alertBox('err', 'Already certified', `${money(prev)} has already been certified. The new cumulative value must exceed it.`) : cum > poNet(po) + EPS ? alertBox('err', 'Exceeds PO value', `Cumulative claimed value exceeds the PO value ${money(poNet(po))}.`) : alertBox('info', '', `Maximum claimable now: ${money(r2(poNet(po) - prev))}. Value becomes invoice-eligible only once certified.`); } });
};
ACT['claim-save'] = () => { const f = ui.f; done(A.createClaim({ ...f, claimedCum: +f.claimedCum || 0 }), () => { closePanel(); go(`#/po/${f.poId}?tab=billing`); }); };
ACT['claim-open'] = el => {
  const id = el.dataset.id, get = () => getClaim(id);
  openPanel({ key: 'claim-' + id, mid: true, title: () => `${get().number} · ${get().period}`, sub: () => esc(getPO(get().poId).number),
    body: () => { const c = get(), po = getPO(c.poId), v = claimView(c), u = usage('claim', c.id);
      const bn = { Submitted: ['blue', 'Awaiting certification', 'Not invoice-eligible until certified.'], Certified: ['green', 'Certified', `${money(v.certified)} certified — ${money(v.remaining)} still to invoice.`], Rejected: ['red', 'Rejected', c.rejectReason || ''] }[c.status];
      return `${stBanner(bn[0], bn[1], bn[2])}${strip([['Previously certified', money(v.prev)], ['Cumulative claimed', money(v.cum)], ['Current claim', money(v.current), `${fmtNum(v.cum)} − ${fmtNum(v.prev)}`], ['Certified', c.status === 'Certified' ? money(v.certified) : '—'], ['Ready to invoice', money(v.remaining), '', 'hl']])}
      <div class="sec-h">Details</div><div class="kvg c2">${kv('PO', poLink(po))}${kv('Period', esc(c.period))}${kv('Remarks', esc(c.remarks) || '—')}${kv('Evidence', attachChips(c.evidence) || '—')}${kv('Invoices', u.invs.map(invLink).join(', ') || '—')}</div>
      <div class="sec-h">History</div>${histList(c.number, po.id)}`; },
    foot: () => { const c = get(), po = getPO(c.poId), v = claimView(c), a = [];
      if (c.status === 'Submitted') a.push(gbtn('claim.decide', 'claim-reject', 'Reject', { cls: 'btn-danger', data: { id } }), gbtn('claim.decide', 'claim-certify', 'Certify claim', { cls: 'btn-primary', data: { id }, icn: 'check' }));
      if (c.status === 'Certified' && v.remaining > EPS) a.push(gbtn('inv.create', 'inv-new', 'Submit Invoice', { cls: 'btn-primary', data: { po: po.id }, icn: 'receipt' }));
      return a.join(''); } });
};
ACT['claim-reject'] = el => reasonModal({ title: 'Reject progress claim', label: 'Rejection reason', btn: 'Reject claim', onSubmit: reason => { done(A.rejectClaim(el.dataset.id, reason)); } });
ACT['claim-certify'] = el => { const c = getClaim(el.dataset.id), v = claimView(c); openModal({ title: `Certify ${c.number}`, submitLabel: 'Certify', html: `<p style="margin-bottom:12px">Cumulative claimed ${money(v.cum)} − previously certified ${money(v.prev)} = current claim <b>${money(v.current)}</b>. Only this newly certified value becomes invoice-eligible.</p>${fld('Certified value (INR)', 'val', { type: 'number', value: v.current, step: 'any' })}`, onSubmit: x => { const r = A.certifyClaim(c.id, +x.val); if (!r.ok) { toast(r.msg, 'err'); return false; } toast(r.msg); render(); } }); };
