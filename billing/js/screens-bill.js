/* =====================================================================
   screens-bill.js — milestones, progress claims, billing schedules overview
   ===================================================================== */

/* ================================================================ Milestones */
ROUTES.milestones = () => `<div>${pageHead({ title: 'Milestones', crumbs: [['Billing Schedules', '#/schedules'], ['Milestones']] })}
  <div class="content">${listHtml('milestones', {
    searchPh: 'Search milestone, PO…',
    filters: [{ name: 'status', label: 'Acceptance', options: () => ['Pending Acceptance', 'Submitted for Acceptance', 'More Info Requested', 'Approved', 'Rejected'] }, { name: 'billing', label: 'Billing', options: () => ['Not Eligible', 'Eligible', 'Invoiced'] }, { name: 'po', label: 'PO', options: () => db.pos.filter(p => p.billingMethod === 'Milestone').map(p => [p.id, p.number]) }],
    rows: () => db.milestones.filter(m => m.status !== 'Draft').sort((a, b) => getPO(a.poId).number.localeCompare(getPO(b.poId).number) || a.seq - b.seq),
    match: (m, st) => { const po = getPO(m.poId); return matchText(st, m.code, m.name, po.number) && matchIn(st, 'status', m.status) && matchIn(st, 'po', m.poId) && matchIn(st, 'billing', msBilling(m, po)); },
    cols: ['PO', 'ID', 'Milestone', '>Amount', 'Planned', 'Acceptance', 'SRN gate', 'Billing', '>Invoiced', '>Remaining'],
    row: m => { const po = getPO(m.poId), u = usage('milestone', m.id), g = msGate(m, po), sr = g.srn; return `<tr class="click" data-act="go" data-hash="#/milestone/${m.id}"><td>${esc(po.number)}</td><td class="strong">${m.code}</td><td>${esc(m.name)}</td><td class="num">${fmtNum(m.amount)}</td><td class="nowrap">${fmtD(m.planned)}</td><td>${sb(m.status)}</td><td>${m.srnRequired ? (sr ? `${esc(sr.number)} ${sb(sr.status)}` : '<span class="warn-t">Required — none</span>') : '<span class="dim-note">Not required</span>'}</td><td>${sb(msBilling(m, po))}</td><td class="num">${fmtNum(u.value)}</td><td class="num strong">${fmtNum(r2(m.amount - u.value))}</td></tr>`; },
  })}</div></div>`;

ROUTES.milestone = r => {
  const m = getMS(r.parts[1]); if (!m) return notFound('Milestone');
  const po = getPO(m.poId), u = usage('milestone', m.id), g = msGate(m, po), bill = msBilling(m, po), ent = msEnt(m, po), srn = m.srnId && getSRN(m.srnId);
  if (!ui.f || ui.fKey !== 'ms-' + m.id) { ui.f = { actualDate: m.actualDate || todayISO(), remarks: m.remarks || '', evidence: [...(m.evidence || [])] }; ui.fKey = 'ms-' + m.id; }
  const f = ui.f, canSubmit = ['Pending Acceptance', 'More Info Requested', 'Rejected'].includes(m.status), underReview = m.status === 'Submitted for Acceptance';
  const banner = { 'Pending Acceptance': ['amber', 'Pending acceptance', 'Eligible invoice amount: AED 0. The supplier must submit completion evidence and the approver must accept the milestone.'], 'Submitted for Acceptance': ['blue', 'Submitted — awaiting approval', 'Eligible invoice amount: AED 0 until the milestone is approved.'], 'More Info Requested': ['amber', 'More information requested', m.infoRequest], Rejected: ['red', 'Rejected', m.rejectReason], Approved: ent > 0 ? ['green', bill === 'Invoiced' ? 'Approved and invoiced' : 'Approved — invoice-eligible', bill === 'Invoiced' ? 'The full milestone amount is allocated to an invoice; a second invoice is blocked.' : `${money(ent)} can now be invoiced.`] : ['amber', 'Approved — not yet invoice-eligible', `Waiting for: ${g.reason}.`], Draft: ['gray', 'Draft schedule', 'The PO is not approved yet.'] }[m.status];
  const checklist = [
    [m.status === 'Approved', 'Milestone accepted by approver', m.status === 'Approved' ? `Approved ${fmtDT(m.approvedAt)}` : `Status: ${m.status}`],
    [!m.srnRequired || g.ok, 'Required SRN acceptance', m.srnRequired ? (g.ok ? `${srn.number} accepted` : esc(g.reason)) : 'Not required for this milestone — no SRN is invented'],
    [u.value < m.amount - EPS, 'Unallocated balance remains', u.value >= m.amount - EPS ? `Fully invoiced on ${u.invs.map(invRef).join(', ')}` : `${money(r2(m.amount - u.value))} unallocated`],
    [po.status === 'Approved', 'PO approved & schedule locked', `${po.number} is ${po.status}`],
  ];
  const acts = [];
  if (ent - u.value > EPS) acts.push(gbtn('inv.create', 'go', 'Create invoice for this milestone', { cls: 'btn-primary', icn: 'receipt', data: { hash: `#/invoice/new?po=${po.id}&ms=${m.id}` } }));
  return `<div>${pageHead({ title: `${m.code} — ${m.name}`, sub: sb(m.status), crumbs: [['Billing Schedules', '#/schedules'], ['Milestones', '#/milestones'], [po.number, `#/po/${po.id}?tab=billing`], [m.code]], right: acts.join('') })}
  <div class="content"><div class="status-banner ${banner[0]}"><div><div class="t">${banner[1]}</div><div class="d">${esc(banner[2] || '')}</div></div></div>
  ${strip([['Milestone amount', money(m.amount), `${fmtNum(m.pct)}% of PO`], ['Acceptance', sb(m.status)], ['Eligible invoice amount', money(Math.max(0, r2(ent - u.value))), ent > 0 ? 'approved & gates cleared' : 'not yet eligible', ent - u.value > EPS ? 'hl' : ''], ['Invoiced', money(u.value), u.invs.map(invRef).join(', ')], ['Remaining milestone balance', money(r2(m.amount - u.value))]])}
  <div class="grid-2" style="margin-top:16px;align-items:start">
   <div>
    <div class="card flat"><h3>Milestone record</h3><div class="kvg" style="grid-template-columns:1fr 1fr">${kv('Milestone ID', `${esc(po.number)} / ${m.code}`)}${kv('PO & line', `${poLink(po)} · line ${lineOf(po, m.lineId).no}`)}${kv('Planned completion', fmtD(m.planned))}${kv('Actual completion', fmtD(m.actualDate))}${kv('Approver', esc(m.approver))}${kv('Approval timestamp', m.approvedAt ? fmtDT(m.approvedAt) : '—')}${kv('Description', esc(m.description) || '—')}${kv('Acceptance criteria', esc(m.criteria) || '—')}${kv('Required evidence', esc(m.evidenceReq) || '—')}${kv("Supplier's completion remarks", esc(m.remarks) || '—')}${kv('Evidence submitted', attachChips(m.evidence) || '—')}${m.rejectReason ? kv('Rejection reason', `<span class="bad-t">${esc(m.rejectReason)}</span>`) : ''}${kv('Linked SRN', srn ? `<a class="link" href="#/srn/${srn.id}">${esc(srn.number)}</a> ${sb(srn.status)}` : (m.srnRequired ? '<span class="warn-t">Required — not linked</span>' : 'Not required'))}</div></div>
    ${canSubmit ? `<div class="card" style="margin-top:12px"><h3>Supplier completion submission</h3>${m.status === 'More Info Requested' ? alertBox('warn', 'Information requested', esc(m.infoRequest)) : ''}${m.status === 'Rejected' ? alertBox('err', 'Previously rejected', esc(m.rejectReason)) : ''}<div class="fgrid c2"><div class="field"><label>Actual completion date *</label><input class="input" type="date" data-f="actualDate" value="${esc(f.actualDate)}"></div><div class="field"><label>Required evidence</label><div class="ro">${esc(m.evidenceReq) || '—'}</div></div><div class="field span2"><label>Completion remarks *</label><textarea class="input" rows="2" data-f="remarks">${esc(f.remarks)}</textarea></div><div class="field span2"><label>Supporting evidence *</label>${attachBox('evidence', f.evidence, 'Attach evidence')}</div></div>
      <div class="form-actions" style="margin-top:12px">${gbtn('ms.submit', 'ms-submit-page', 'Mark as Submitted for Acceptance', { cls: 'btn-primary', data: { id: m.id }, icn: 'check' })}</div></div>` : ''}
    ${underReview ? `<div class="card" style="margin-top:12px"><h3>Approver decision</h3><p class="hint" style="margin-top:0">Review the evidence submitted by the supplier. Approval alone does not create or approve an SRN.</p><div class="row">${gbtn('ms.decide', 'ms-approve', 'Approve Milestone', { cls: 'btn-primary', data: { id: m.id }, icn: 'check' })}${gbtn('ms.decide', 'ms-info', 'Request More Information', { data: { id: m.id } })}${gbtn('ms.decide', 'ms-reject', 'Reject Milestone', { cls: 'btn-danger-soft', data: { id: m.id } })}</div></div>` : ''}
   </div>
   <div>
    <div class="card flat"><h3>Invoice eligibility</h3><div class="checks">${checklist.map(([ok, t, d]) => `<div class="check ${ok ? 'pass' : 'fail'}" style="grid-template-columns:22px 1fr"><div class="ci">${icon(ok ? 'check' : 'x', 11, 3)}</div><div><div class="cl">${t}</div><div class="cd">${d}</div></div></div>`).join('')}</div>
      <p class="hint" style="margin-top:8px">A passed planned date (${fmtD(m.planned)}) never makes a milestone invoice-eligible.</p></div>
    <div class="card flat" style="margin-top:12px"><h3>Service receipt (SRN)</h3>${m.srnRequired ? '' : '<p class="hint" style="margin-top:0">An accepted SRN is <b>not required</b> for this milestone.</p>'}
      ${srn ? `<div class="row"><b>${esc(srn.number)}</b> ${sb(srn.status)} <span class="hint">${money(srn.serviceValue)}</span><span class="spacer"></span><a class="link" href="#/srn/${srn.id}">Open SRN</a></div>` : '<div class="hint">No SRN linked.</div>'}
      <div class="row" style="margin-top:10px">${actBtn('ms-link', srn ? 'Change linked SRN' : 'Link existing SRN', { data: { id: m.id } })}${gbtn('srn.create', 'go', 'Create SRN for this milestone', { data: { hash: `#/srn/new?po=${po.id}&ms=${m.id}` }, icn: 'plus' })}</div></div>
    <div class="card flat" style="margin-top:12px"><h3>Linked invoices</h3>${allocsOn('milestone', m.id).map(({ inv, a }) => `<div class="row" style="padding:4px 0">${invLink(inv)} <span class="hint">${esc(inv.number)}</span> ${sb(inv.status)}<span class="spacer"></span><b>${money(a.value)}</b></div>`).join('') || '<div class="hint">No invoice allocated to this milestone.</div>'}</div>
   </div></div>
  <div class="sec-title">History</div><ul class="tl">${db.audit.filter(a => a.ref === `${po.number} / ${m.code}`).map(a => `<li class="${a.kind === 'ok' ? 'ok' : a.kind === 'bad' ? 'bad' : ''}"><div class="tt">${esc(a.text)}</div><div class="tm">${esc(a.by)} · ${fmtDT(a.at)}</div></li>`).join('') || '<li><div class="tm">No activity yet.</div></li>'}</ul></div></div>`;
};
ACT['ms-submit-page'] = el => { const f = ui.f; done(A.msSubmit(el.dataset.id, { actualDate: f.actualDate, remarks: f.remarks, evidence: f.evidence }), () => { ui.f = null; }); };
ACT['ms-approve'] = el => { const m = getMS(el.dataset.id); confirmBox({ title: 'Approve milestone', message: `Approve <b>${esc(msFull(m))}</b> (${money(m.amount)})? ${m.srnRequired ? 'It still needs an accepted SRN before it can be invoiced.' : 'It becomes invoice-eligible immediately.'}`, confirmLabel: 'Approve', onConfirm: () => { closeOverlays(); done(A.msApprove(m.id)); } }); };
ACT['ms-reject'] = el => reasonModal({ title: 'Reject milestone', label: 'Rejection reason', btn: 'Reject milestone', onSubmit: reason => { closeOverlays(); done(A.msReject(el.dataset.id, reason)); } });
ACT['ms-info'] = el => reasonModal({ title: 'Request more information', label: 'Information required', btn: 'Send request', danger: false, onSubmit: note => { closeOverlays(); done(A.msRequestInfo(el.dataset.id, note)); } });
ACT['ms-link'] = el => { const m = getMS(el.dataset.id), po = getPO(m.poId); const opts = [['', '— No SRN —'], ...srnsOf(po).filter(s => !s.milestoneId || s.milestoneId === m.id || true).map(s => [s.id, `${s.number} · ${money(s.serviceValue)} · ${s.status}${s.milestoneId && s.milestoneId !== m.id ? ' (linked to ' + getMS(s.milestoneId).code + ')' : ''}`])];
  openModal({ title: `Link SRN to ${m.code}`, submitLabel: 'Link', html: fld('Service receipt', 'srn', { opts, value: m.srnId || '' }) + '<p class="hint">The milestone and SRN stay separate records. If the milestone requires an accepted SRN, it only becomes invoice-eligible once that SRN is Accepted.</p>', onSubmit: v => { closeOverlays(); done(A.msLinkSrn(m.id, v.srn)); } }); };
function msDrawer(id) {
  const m = getMS(id), po = getPO(m.poId), u = usage('milestone', m.id), g = msGate(m, po), ent = msEnt(m, po), srn = m.srnId && getSRN(m.srnId);
  const acts = [];
  if (m.status === 'Submitted for Acceptance') acts.push(gbtn('ms.decide', 'ms-approve', 'Approve', { cls: 'btn-primary', data: { id: m.id } }), gbtn('ms.decide', 'ms-info', 'Request info', { data: { id: m.id } }), gbtn('ms.decide', 'ms-reject', 'Reject', { cls: 'btn-danger-soft', data: { id: m.id } }));
  if (['Pending Acceptance', 'More Info Requested', 'Rejected'].includes(m.status)) acts.push(actBtn('go', 'Open to submit for acceptance', { cls: 'btn-primary', data: { hash: `#/milestone/${m.id}` } }));
  openDrawer(`${m.code} — ${m.name}`, `
    <div class="row" style="margin-bottom:10px">${sb(m.status)} ${sb(msBilling(m, po))}<span class="spacer"></span><a class="link" href="#/milestone/${m.id}">Open full page</a></div>
    <div class="kv"><div class="k">PO</div><div>${esc(po.number)}</div><div class="k">Amount</div><div><b>${money(m.amount)}</b> (${fmtNum(m.pct)}%)</div><div class="k">Planned</div><div>${fmtD(m.planned)}</div><div class="k">Actual</div><div>${fmtD(m.actualDate)}</div><div class="k">Approver</div><div>${esc(m.approver)}</div>
    <div class="k">Acceptance criteria</div><div>${esc(m.criteria) || '—'}</div><div class="k">Evidence</div><div>${attachChips(m.evidence) || '—'}</div><div class="k">Linked SRN</div><div>${srn ? `${esc(srn.number)} ${sb(srn.status)}` : m.srnRequired ? '<span class="warn-t">Required — none linked</span>' : 'Not required'}</div>
    <div class="k">Eligible now</div><div><b>${money(Math.max(0, r2(ent - u.value)))}</b></div><div class="k">Invoiced</div><div>${money(u.value)} ${u.invs.map(invLink).join(', ')}</div><div class="k">Remaining balance</div><div>${money(r2(m.amount - u.value))}</div></div>
    ${!ent && m.status === 'Approved' ? alertBox('warn', 'Not invoice-eligible', esc(g.reason)) : ''}
    <div class="row">${acts.join('')}</div>`, true);
}

/* ================================================================ Progress claims */
ROUTES.claims = () => `<div>${pageHead({ title: 'Progress Claims', crumbs: [['Billing Schedules', '#/schedules'], ['Progress Claims']], right: gbtn('claim.create', 'go', 'New progress claim', { cls: 'btn-primary', icn: 'plus', data: { hash: '#/claim/new' } }) })}
  <div class="content">${alertBox('info', 'Certified work-progress mode', 'Applies only to progressive POs configured with “Certified work progress”. Current claim = new cumulative − previously certified. Only newly certified, unconsumed value becomes invoice-eligible.')}${listHtml('claims', {
    searchPh: 'Search claim, PO…',
    filters: [{ name: 'status', label: 'Status', options: () => ['Draft', 'Submitted', 'Certified', 'Rejected'] }, { name: 'po', label: 'PO', options: () => db.pos.filter(poCertified).map(p => [p.id, p.number]) }],
    rows: () => db.claims.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq),
    match: (c, st) => matchText(st, c.number, getPO(c.poId).number, c.period) && matchIn(st, 'status', c.status) && matchIn(st, 'po', c.poId),
    cols: ['Claim', 'PO', 'Period', '>Previous cumulative certified', '>Current claim', '>Cumulative claimed', '>Certified', 'Status', 'Linked invoice', '>Remaining billable'],
    row: c => { const v = claimView(c), u = usage('claim', c.id); return `<tr class="click" data-act="claim-drawer" data-id="${c.id}"><td class="strong">${c.number}</td><td>${esc(getPO(c.poId).number)}</td><td>${esc(c.period)}</td><td class="num">${fmtNum(v.prev)}</td><td class="num">${fmtNum(v.current)}</td><td class="num">${fmtNum(v.cum)}</td><td class="num">${c.status === 'Certified' ? fmtNum(v.certified) : '—'}</td><td>${sb(c.status)}</td><td>${u.invs.map(invLink).join(', ') || '—'}</td><td class="num strong">${c.status === 'Certified' ? fmtNum(v.remaining) : '—'}</td></tr>`; },
  })}</div></div>`;

ROUTES.claim = r => {
  const id = r.parts[1];
  if (id === 'new') return claimForm(r);
  const c = getClaim(id); if (!c) return notFound('Progress claim');
  ui.after = () => claimDrawer(c.id);
  return ROUTES.claims();
};
function claimInit(q) {
  const po = q.po && getPO(q.po), ok = po && po.status === 'Approved' && poCertified(po);
  return { poId: ok ? po.id : '', lineId: ok ? po.lines[0].id : '', period: `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`, claimedCum: '', evidence: [], approver: 'Procurement Manager', srnId: '', remarks: '' };
}
HOOKS.claimpo = () => { const po = getPO(ui.f.poId); ui.f.lineId = po ? po.lines[0].id : ''; ui.f.srnId = ''; };
function claimForm(r) {
  if (!ui.f || ui.fKey !== 'claim-new') { ui.f = claimInit(r.q); ui.fKey = 'claim-new'; }
  const f = ui.f, po = getPO(f.poId), pos = approvedPOs(poCertified);
  ui.derive = claimDerive;
  return `<div>${pageHead({ title: 'New Progress Claim', crumbs: [['Billing Schedules', '#/schedules'], ['Progress Claims', '#/claims'], ['New claim']] })}
  <div class="content"><div class="card" style="margin-top:16px"><h3>Claim details</h3><div class="fgrid">
    <div class="field span2"><label>Approved PO (certified work progress) *</label><select class="input" data-f="poId" data-hook="claimpo" data-r><option value="">— Select a PO —</option>${opt(pos.map(p => [p.id, poOptLabel(p)]), f.poId)}</select><div class="fhint">Only POs whose progress basis is “Certified work progress” are listed.</div></div>
    ${po ? `<div class="field"><label>PO line</label><select class="input" data-f="lineId" data-r>${opt(po.lines.map(l => [l.id, `${l.no}. ${l.desc}`]), f.lineId)}</select></div>
    <div class="field"><label>Claim period *</label><input class="input" data-f="period" value="${esc(f.period)}"></div>
    <div class="field"><label>Contract value</label><div class="ro" id="c-contract"></div></div>
    <div class="field"><label>Previous cumulative certified value</label><div class="ro" id="c-prev"></div></div>
    <div class="field"><label>New cumulative claimed value (AED) *</label><input class="input num" type="number" min="0" step="any" data-t="num" data-f="claimedCum" value="${f.claimedCum}" placeholder="e.g. 50000"></div>
    <div class="field"><label>Current claim (derived)</label><div class="ro strong" id="c-cur"></div><div class="fhint">= new cumulative − previously certified</div></div>
    <div class="field"><label>Approver</label><select class="input" data-f="approver">${opt(APPROVERS_LIST, f.approver)}</select></div>
    ${po.requireSrn ? `<div class="field"><label>Linked SRN (accepted SRN required) *</label><select class="input" data-f="srnId"><option value="">— Select SRN —</option>${opt(srnsOf(po).map(s => [s.id, `${s.number} · ${money(s.serviceValue)} · ${s.status}`]), f.srnId)}</select></div>` : ''}
    <div class="field span3"><label>Remarks</label><input class="input" data-f="remarks" value="${esc(f.remarks)}"></div>
    <div class="field span3"><label>Supporting evidence *</label>${attachBox('evidence', f.evidence, 'Attach measurement sheets / site reports')}</div>` : ''}</div><div id="claim-val" style="margin-top:12px"></div></div>
  ${po ? `<div class="form-actions">${actBtn('go', 'Cancel', { cls: 'btn-ghost', data: { hash: '#/claims' } })}<span class="spacer"></span>${gbtn('claim.create', 'claim-save', 'Save as Draft', { cls: 'btn-outline', data: { m: 'draft' } })}${gbtn('claim.create', 'claim-save', 'Submit for review', { cls: 'btn-primary', data: { m: 'submit' } })}</div>` : ''}</div></div>`;
}
function claimDerive() {
  const f = ui.f, po = getPO(f.poId); if (!po || !$('#c-cur')) return;
  const line = lineOf(po, f.lineId) || po.lines[0], prev = cumCertified(po), cum = +f.claimedCum || 0;
  $('#c-contract').textContent = money(lineNet(line)); $('#c-prev').textContent = money(prev); $('#c-cur').textContent = money(cum ? r2(cum - prev) : 0);
  const rem = r2(lineNet(line) - prev);
  $('#claim-val').innerHTML = cum && cum <= prev + EPS ? alertBox('err', 'Already certified', `${money(prev)} has already been certified. The supplier must not invoice (or claim) it again — the new cumulative value must exceed ${money(prev)}.`) : cum > lineNet(line) + EPS ? alertBox('err', 'Exceeds contract', `Cumulative claimed value exceeds the contract line value ${money(lineNet(line))}.`) : alertBox('info', '', `Maximum claimable now: ${money(rem)} (contract ${money(lineNet(line))} − previously certified ${money(prev)}). Value only becomes invoice-eligible once certified.`);
}
ACT['claim-save'] = el => { const f = ui.f; done(A.createClaim({ ...f, claimedCum: +f.claimedCum || 0 }, el.dataset.m), r => { ui.f = null; go(`#/claim/${r.id}`); }); };
function claimDrawer(id) {
  const c = getClaim(id), po = getPO(c.poId), v = claimView(c), u = usage('claim', c.id), acts = [];
  if (c.status === 'Draft') acts.push(gbtn('claim.create', 'claim-submit', 'Submit for review', { cls: 'btn-primary', data: { id: c.id } }));
  if (c.status === 'Submitted') acts.push(gbtn('claim.decide', 'claim-reject', 'Reject', { cls: 'btn-danger-soft', data: { id: c.id } }), gbtn('claim.decide', 'claim-certify', 'Certify claim', { cls: 'btn-primary', data: { id: c.id }, icn: 'check' }));
  if (c.status === 'Certified' && v.remaining > EPS) acts.push(gbtn('inv.create', 'go', 'Create invoice', { cls: 'btn-primary', data: { hash: `#/invoice/new?po=${po.id}` }, icn: 'receipt' }));
  openDrawer(`${c.number} · ${c.period}`, `<div class="row" style="margin-bottom:10px">${sb(c.status)}<span class="spacer"></span><a class="link" href="#/po/${po.id}?tab=billing">Open ${esc(po.number)}</a></div>
    <div class="kv"><div class="k">PO &amp; line</div><div>${esc(po.number)} · ${esc(lineOf(po, c.lineId).desc)}</div><div class="k">Claim period</div><div>${esc(c.period)}</div><div class="k">Previous cumulative certified</div><div>${money(v.prev)}</div><div class="k">New cumulative claimed</div><div>${money(v.cum)}</div><div class="k">Current claim</div><div><b>${money(v.current)}</b> <span class="hint">(${fmtNum(v.cum)} − ${fmtNum(v.prev)})</span></div><div class="k">Certified value</div><div>${c.status === 'Certified' ? `<b>${money(v.certified)}</b>` : '—'}</div><div class="k">Approver</div><div>${esc(c.approver)}</div><div class="k">Linked SRN</div><div>${po.requireSrn ? (v.srn ? `${esc(v.srn.number)} ${sb(v.srn.status)}` : '<span class="warn-t">Required — none linked</span>') : 'Not required'}</div><div class="k">Evidence</div><div>${attachChips(c.evidence) || '—'}</div><div class="k">Linked invoice</div><div>${u.invs.map(invLink).join(', ') || '—'}</div><div class="k">Remaining billable certified</div><div><b>${money(v.remaining)}</b></div>${c.rejectReason ? `<div class="k">Rejection reason</div><div class="bad-t">${esc(c.rejectReason)}</div>` : ''}</div>
    <div class="row">${acts.join('')}</div>`, true);
}
ACT['claim-submit'] = el => { closeOverlays(); done(A.submitClaim(el.dataset.id)); };
ACT['claim-reject'] = el => reasonModal({ title: 'Reject progress claim', label: 'Rejection reason', btn: 'Reject claim', onSubmit: reason => { closeOverlays(); done(A.rejectClaim(el.dataset.id, reason)); } });
ACT['claim-certify'] = el => { const c = getClaim(el.dataset.id), v = claimView(c); openModal({ title: `Certify ${c.number}`, submitLabel: 'Certify', html: `<p class="hint" style="margin-top:0">Cumulative claimed ${money(v.cum)} − previously certified ${money(v.prev)} = current claim <b>${money(v.current)}</b>. Only this newly certified value becomes invoice-eligible.</p>${fld('Certified value (AED)', 'val', { type: 'number', value: v.current, step: 'any' })}`, onSubmit: x => { const r = A.certifyClaim(c.id, +x.val); if (!r.ok) { toast(r.msg, 'err'); return false; } closeOverlays(); toast(r.msg); render(); } }); };

/* ================================================================ Billing schedules overview */
ROUTES.schedules = () => {
  const pos = db.pos.filter(p => p.billingMethod !== 'Standard');
  return `<div>${pageHead({ title: 'Billing Schedules', crumbs: [['Billing Schedules']] })}<div class="content">
  <div class="grid-2" style="margin-top:16px">
    <div class="method-banner progressive" style="margin:0"><div class="ic">${icon('layers', 14)}</div><div><b>Progressive billing</b><br>Eligibility is <b>derived from accepted receipts</b> (GRN quantities / SRN values) or separately certified work progress. Many invoices over time; each consumes part of an eligible receipt.</div></div>
    <div class="method-banner milestone" style="margin:0"><div class="ic">${icon('flag', 14)}</div><div><b>Milestone billing</b><br>Eligibility is the <b>amount allocated to an approved contractual milestone</b>, subject to SRN / acceptance gates. By default one invoice per milestone.</div></div></div>
  <div class="sec-title">Progressive and milestone POs</div>
  <div class="tbl-wrap"><table class="grid compact"><thead><tr><th>PO</th><th>Supplier</th><th>Method</th><th>Eligibility source</th><th>Schedule</th><th class="right">PO value</th><th class="right">Eligible (accepted)</th><th class="right">Invoiced</th><th class="right">Remaining eligible</th><th>Status</th></tr></thead><tbody>
  ${pos.map(p => { const s = poSummary(p); return `<tr class="click" data-act="go" data-hash="#/po/${p.id}?tab=billing"><td class="strong">${esc(p.number)}</td><td>${esc(getSup(p.supplierId).name)}</td><td>${poMethodBadge(p)}</td><td>${p.billingMethod === 'Milestone' ? 'Approved milestones' : poCertified(p) ? 'Certified progress claims' : 'Accepted GRN / SRN'}</td><td>${p.billingMethod === 'Milestone' ? `${msOf(p).length} milestones · ${p.scheduleStatus}` : poCertified(p) ? `${claimsOf(p).length} claims` : `${grnsOf(p).length} GRN · ${srnsOf(p).length} SRN`}</td><td class="num">${fmtNum(s.value)}</td><td class="num">${fmtNum(s.accepted)}</td><td class="num">${fmtNum(s.invoiced)}</td><td class="num strong">${fmtNum(s.remaining)}</td><td>${sb(p.status)}</td></tr>`; }).join('') || emptyRow(10, 'No progressive or milestone POs.')}</tbody></table></div>
  <div class="row" style="margin-top:14px">${actBtn('go', 'View milestones', { data: { hash: '#/milestones' } })}${actBtn('go', 'View progress claims', { data: { hash: '#/claims' } })}</div></div></div>`;
};
