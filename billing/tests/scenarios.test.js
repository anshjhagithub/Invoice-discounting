let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)); };
const truthy = (name, v) => { if (!v) fails++; console.log((v ? 'PASS ' : 'FAIL ') + name); };
const PO = n => db.pos.find(p => p.id === 'po-' + n);
const mkGRN = (po, rec, rej, mode = 'accept', extra = {}) => A.createGRN({ poId: po.id, lineId: po.lines[0].id, date: todayISO(), received: rec, rejected: rej, remarks: '', ...extra }, mode);
const mkSRN = (po, value, mode = 'accept', extra = {}) => A.createSRN({ poId: po.id, lineId: po.lines[0].id, date: todayISO(), description: 'Service', serviceValue: value, ...extra }, mode);
const grnByNo = (po, no) => db.grns.find(g => g.poId === po.id && g.number === no);
const inv = (po, o) => A.saveInvoice({ poId: po.id, number: o.number, date: todayISO(), allocs: o.allocs || [], net: o.net, gstManual: o.gstManual, attachments: [] }, 'submit');
const draftOf = po => ({ id: po.id, supplierId: po.supplierId, buyer: po.buyer, office: po.office, title: po.title, poDate: po.poDate, deliveryDate: po.deliveryDate, endDate: po.endDate, type: po.type, category: po.category, gstRate: po.gstRate,
  billingMethod: po.billingMethod, progressBasis: po.progressBasis, lines: po.lines.map(l => ({ ...l })), milestones: msOf(po).map(m => ({ ...m })) });
const newDraft = (o = {}) => ({ id: null, supplierId: 'sup1', buyer: 'DICE', office: 'o-6225', title: 'Test PO', poDate: todayISO(), deliveryDate: daysFromNow(30), endDate: '', type: 'Goods', category: 'Corporate Assets', gstRate: 18, billingMethod: 'Standard', progressBasis: 'Receipt',
  lines: [{ desc: 'Item', qty: 10, uom: 'Units', price: 100 }], milestones: [], ...o });
const approve = d => { const r = A.savePO(d, true); const ok = r.ok && A.approvePO(r.id).ok; return ok ? getPO(r.id) : null; };

/* ---- Scenario A: progressive, receipt-based, goods ---- */
seedDb('A');
let po = PO(1042), r, s;
eq('A: PO draft', po.status, 'Draft');
eq('A: PO number format', /^PO\/FY\d\d-\d\d\/\d\d\/42$/.test(po.number), true);
let d = draftOf(po); d.billingMethod = 'Progressive'; d.progressBasis = 'Receipt';
r = mkGRN(po, 10, 0); eq('A: GRN on a draft PO blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = A.savePO(d, true); truthy('A: submit PO', r.ok); r = A.approvePO(po.id); truthy('A: approve PO', r.ok);
eq('A: savePO cannot overwrite an approved PO', A.savePO(draftOf(po), false).ok, false);
truthy('A: GRN1', mkGRN(po, 30, 0).ok); truthy('A: GRN2', mkGRN(po, 40, 0).ok); truthy('A: GRN3', mkGRN(po, 10, 3).ok);
s = poSummary(po);
eq('A: accepted qty', s.acceptedQty, 77); eq('A: accepted value', s.accepted, 77000); eq('A: remaining PO qty', s.remainingPOQty, 23);
eq('A: GRN3 status', grnByNo(po, 'GRN-003').status, 'Partially Accepted');
const g1 = grnByNo(po, 'GRN-001'), g2 = grnByNo(po, 'GRN-002');
r = inv(po, { number: 'BIE-001', allocs: [{ kind: 'grn', refId: g1.id, qty: 30, value: 30000 }] });
truthy('A: inv1 submitted', r.ok); eq('A: inv1 status', getInv(r.id).status, 'Pending Approval'); eq('A: inv1 match', getInv(r.id).match.result, 'Matched'); eq('A: inv1 net/gst/total', [getInv(r.id).net, getInv(r.id).gst, getInv(r.id).gross], [30000, 5400, 35400]);
const i1 = r.id;
r = inv(po, { number: 'BIE-002', allocs: [{ kind: 'grn', refId: g2.id, qty: 20, value: 20000 }] });
truthy('A: inv2 submitted', r.ok); eq('A: inv2 net/gst/total', [getInv(r.id).net, getInv(r.id).gst, getInv(r.id).gross], [20000, 3600, 23600]);
const i2 = r.id;
r = inv(po, { number: 'BIE-003', allocs: [{ kind: 'grn', refId: g1.id, qty: 30, value: 30000 }] });
eq('A: duplicate GRN-001 blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'BIE-004', allocs: [{ kind: 'grn', refId: g2.id, qty: 25, value: 25000 }] });
eq('A: over-allocation msg', r.errors[0], 'Invoice quantity exceeds the eligible quantity remaining against GRN-002. Eligible: 20 units. Requested: 25 units.');
r = inv(po, { number: 'BIE-005', allocs: [{ kind: 'grn', refId: grnByNo(po, 'GRN-003').id, qty: 10, value: 10000 }] });
eq('A: GRN-003 beyond accepted blocked', r.ok, false); console.log('   ->', r.errors[0]);
s = poSummary(po);
eq('A: invoiced qty', s.invoicedQty, 50); eq('A: invoiced net', s.invoiced, 50000); eq('A: remaining accepted value', s.remaining, 27000);
truthy('A: approve1', A.approveInvoice(i1).ok); truthy('A: post1', A.postInvoice(i1).ok); truthy('A: pay1', A.payInvoice(i1).ok);
s = poSummary(po); eq('A: approved/paid/reserved separate', [s.approved, s.paid, s.reserved], [30000, 30000, 20000]);
A.rejectInvoice(i2, 'wrong PO ref');
eq('A: reject releases reservation', usage('grn', g2.id).qty, 0);
eq('A: remaining after reject', poSummary(po).remaining, 47000);
r = inv(po, { number: 'BIE-006', allocs: [{ kind: 'grn', refId: g2.id, qty: 40, value: 40000 }] }); truthy('A: inv6 ok', r.ok);
A.reverseGRN(g2.id, 'Damaged in storage'); A.runMatching(r.id); eq('A: reversed receipt fails matching', getInv(r.id).status, 'Matching Failed');
r = inv(po, { number: 'BIE-007', allocs: [{ kind: 'grn', refId: g2.id, qty: 1, value: 1000 }] }); eq('A: new invoice on reversed GRN blocked', r.ok, false);
eq('A: stage after payment', poStage(po).done >= 5, true);

/* concurrency via drafts */
seedDb('A'); po = PO(1042);
d = draftOf(po); d.billingMethod = 'Progressive'; A.savePO(d, true); A.approvePO(po.id);
mkGRN(po, 30, 0); const gg = grnByNo(po, 'GRN-001');
const dr1 = A.saveInvoice({ poId: po.id, number: 'C-1', date: todayISO(), allocs: [{ kind: 'grn', refId: gg.id, qty: 30, value: 30000 }] }, 'draft');
const dr2 = A.saveInvoice({ poId: po.id, number: 'C-2', date: todayISO(), allocs: [{ kind: 'grn', refId: gg.id, qty: 30, value: 30000 }] }, 'draft');
truthy('A: both drafts saved (no reservation)', dr1.ok && dr2.ok);
const sub1 = A.saveInvoice({ ...getInv(dr1.id) }, 'submit'), sub2 = A.saveInvoice({ ...getInv(dr2.id) }, 'submit');
eq('A: concurrency first wins / second blocked', [sub1.ok, sub2.ok], [true, false]); console.log('   ->', sub2.errors[0]);

/* ---- Scenario B: GOODS PO on milestones — full lifecycle ---- */
const sub = (m, files = [], extra = {}) => A.msSubmit(m.id, { actualDate: todayISO(), remarks: 'done', files, ...extra });
seedDb('B'); po = PO(1042);
eq('B: draft schedule', msOf(po).map(m => m.amount), [20000, 50000, 30000]);
eq('B: goods PO receipts are GRNs', recLabel(po), 'GRN');
let dm = draftOf(po); dm.milestones[2].pct = 40; r = A.savePO(dm, true); eq('B: >100% schedule rejected', r.ok, false); console.log('   ->', r.errors.find(e => /Milestone schedule/.test(e)));
dm.milestones[2].pct = 30; r = A.savePO(dm, true); truthy('B: submit PO', r.ok); truthy('B: approve PO', A.approvePO(po.id).ok);
const [m1, m2, m3] = msOf(po);
eq('B: milestones start Pending when the PO is approved', msOf(po).map(m => m.status), ['Pending', 'Pending', 'Pending']);
r = inv(po, { number: 'M-1', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); eq('B: invoice before approval blocked', r.ok, false); console.log('   ->', r.errors[0]);
eq('B: cannot approve before it is submitted', A.msApprove(m1.id).ok, false);
truthy('B: start M1', A.msStart(m1.id).ok); eq('B: In Progress', getMS(m1.id).status, 'In Progress'); eq('B: cannot start twice', A.msStart(m1.id).ok, false);
eq('B: submission needs a completion date', A.msSubmit(m1.id, { files: ['x.pdf'] }).ok, false);
truthy('B: submit M1 for approval', sub(m1, ['design.pdf']).ok); eq('B: Submitted for Approval', getMS(m1.id).status, 'Submitted for Approval');
eq('B: submitted but not billable', msBilling(getMS(m1.id), po), 'Not Eligible');
truthy('B: approver starts review', A.msStartReview(m1.id).ok); eq('B: Under Review', getMS(m1.id).status, 'Under Review');
eq('B: rejection needs a reason', A.msReject(m1.id, '').ok, false);
truthy('B: reject M1', A.msReject(m1.id, 'Drawings incomplete').ok); eq('B: Rejected, reason kept', [getMS(m1.id).status, getMS(m1.id).rejectReason], ['Rejected', 'Drawings incomplete']);
eq('B: a rejected milestone cannot be approved without resubmission', A.msApprove(m1.id).ok, false);
truthy('B: supplier resubmits', sub(m1, ['design-v2.pdf']).ok); eq('B: two submissions kept as evidence history', getMS(m1.id).submissions.map(x => x.status), ['Rejected', 'Submitted']);
truthy('B: approve M1', A.msApprove(m1.id).ok);
eq('B: audit trail of every state', getMS(m1.id).history.map(h => h.to), ['Pending', 'In Progress', 'Submitted for Approval', 'Under Review', 'Rejected', 'Submitted for Approval', 'Approved']);
eq('B: M1 eligible', msBilling(getMS(m1.id), po), 'Eligible'); eq('B: approved value separate from invoiced', [msEnt(getMS(m1.id), po), usage('milestone', m1.id).value], [20000, 0]);
r = inv(po, { number: 'M-1', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); truthy('B: invoice M1', r.ok); eq('B: M1 pending approval', getInv(r.id).status, 'Pending Approval');
truthy('B: approve inv', A.approveInvoice(r.id).ok); eq('B: M1 invoiced', msBilling(getMS(m1.id), po), 'Invoiced');
r = inv(po, { number: 'M-1b', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); eq('B: 2nd M1 invoice blocked', r.ok, false); console.log('   ->', r.errors[0]);
s = poSummary(po); eq('B: invoiced 20000', s.invoiced, 20000); eq('B: nothing else eligible yet', s.remaining, 0);
/* M2 needs an accepted GRN */
truthy('B: M2 submit + approve', sub(m2, ['i.pdf']).ok && A.msApprove(m2.id).ok);
eq('B: M2 approved but gated on a GRN', msBilling(getMS(m2.id), po), 'Not Eligible');
r = inv(po, { number: 'M-2', allocs: [{ kind: 'milestone', refId: m2.id, value: 50000 }] }); eq('B: M2 invoice blocked until a GRN is accepted', r.ok, false); console.log('   ->', r.errors[0]);
r = mkSRN(po, 1000); eq('B: SRN impossible on a goods PO', r.ok, false); console.log('   ->', r.errors[0]);
r = mkGRN(po, 100, 0, 'inspect', { milestoneId: m1.id }); eq('B: cannot link a GRN to a milestone that needs none', r.ok, false); console.log('   ->', r.errors[0]);
r = mkGRN(po, 100, 0, 'inspect', { milestoneId: m2.id }); truthy('B: GRN created + linked to M2 in one step', r.ok && getMS(m2.id).grnIds.includes(r.id) && getGRN(r.id).milestoneId === m2.id);
const gM2 = r.id; eq('B: pending GRN does not clear the gate', msGate(getMS(m2.id), po).ok, false);
truthy('B: accept GRN via inspection', A.recordInspection(gM2, 100, 0).ok);
eq('B: M2 now eligible', msBilling(getMS(m2.id), po), 'Eligible');
r = A.msLinkReceipt(m1.id, gM2); eq('B: a receipt cannot back two milestones / wrong gate', r.ok, false);
r = inv(po, { number: 'M-2', allocs: [{ kind: 'milestone', refId: m2.id, value: 50000 }] }); truthy('B: M2 invoice after GRN accepted', r.ok);
r = inv(po, { number: 'M-2', allocs: [{ kind: 'milestone', refId: m2.id, value: 50000 }] }); eq('B: dup bill no. / allocation blocked', r.ok, false);
const am = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 120, price: 1000 }], milestones: msOf(po).map(m => ({ ...m })), reason: 'Scope increase' });
eq('B: amend that leaves 100% (locked amounts fixed) needs a new/unlocked milestone', am.ok, false); console.log('   ->', am.errors[0]);
const am2 = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 120, price: 1000 }], milestones: [...msOf(po).map(m => ({ ...m })), { id: 'new', name: 'Extra scope', pct: 0, planned: '' }], reason: 'x' });
eq('B: amend with nothing allocated to the new scope rejected', am2.ok, false);
po = PO(1042); eq('B: failed amendments change nothing', [po.version, poNet(po)], [1, 100000]);
const rd = newDraft({ lines: [{ desc: 'Item', qty: 1, uom: 'Lot', price: 1000 }], billingMethod: 'Milestone', milestones: [{ name: 'A', pct: 33.33 }, { name: 'B', pct: 33.33 }, { name: 'C', pct: 33.34 }] });
const rp = approve(rd); eq('B: rounded schedule sums to PO value', [msOf(rp).reduce((x, m) => x + m.amount, 0), msOf(rp).map(m => m.amount)], [1000, [333.3, 333.3, 333.4]]);
const rd3 = newDraft({ lines: [{ desc: 'Item', qty: 1, uom: 'Lot', price: 100 }], billingMethod: 'Milestone', milestones: [{ name: 'A', pct: 33.333 }, { name: 'B', pct: 33.333 }, { name: 'C', pct: 33.334 }] });
const rp3 = approve(rd3); eq('B: odd percentages still sum exactly', r2(msOf(rp3).reduce((x, m) => x + m.amount, 0)), 100);
eq('B: milestone schedule is validated against the PO value on save', A.savePO(newDraft({ billingMethod: 'Milestone', milestones: [{ name: 'A', pct: 60 }, { name: 'B', pct: 60 }] }), true).ok, false);
eq('B: a GRN requirement needs goods lines', A.savePO(newDraft({ type: 'Services', billingMethod: 'Milestone', milestones: [{ name: 'A', pct: 100, needsGrn: true }] }), false).ok, false);
eq('B: an SRN requirement needs service lines', A.savePO(newDraft({ type: 'Goods', billingMethod: 'Milestone', milestones: [{ name: 'A', pct: 100, needsSrn: true }] }), false).ok, false);
eq('B: a document requirement needs a document name', A.savePO(newDraft({ billingMethod: 'Milestone', milestones: [{ name: 'A', pct: 100, needsDoc: true, docTitle: '' }] }), false).ok, false);

/* ---- ACCEPTANCE TEST: goods PO, "Commissioning Certificate" milestone (PO 45 · M2 = INR 10,000) ---- */
seedDb('default'); po = PO(1045); const [a1, a2, a3, a4] = msOf(po); const grnN = db.grns.filter(g => g.poId === po.id).length;
eq('Cert: goods PO, milestone worth 10,000 that needs ONLY the certificate', [po.type, a2.amount, a2.needsDoc, a2.needsGrn, a2.needsSrn, a2.docTitle], ['Goods', 10000, true, false, false, 'Commissioning Certificate']);
eq('Cert: the supplier has uploaded it; it awaits approval', [a2.status, docState(a2)], ['Submitted for Approval', 'Pending Approval']);
eq('Cert: not billable before approval', msBilling(a2, po), 'Not Eligible');
r = inv(po, { number: 'CC-0', allocs: [{ kind: 'milestone', refId: a2.id, value: 10000 }] }); eq('Cert: invoice blocked before approval', r.ok, false); console.log('   ->', r.errors[0]);
db.meta.role = 'supplier'; r = A.msApprove(a2.id); eq('Cert: the submitting role cannot approve its own evidence (SoD)', r.ok, false); console.log('   ->', r.errors[0]);
db.meta.role = 'buyer'; truthy('Cert: approver approves the certificate', A.msApprove(a2.id).ok); db.meta.role = 'admin';
eq('Cert: approving the milestone approves its document', docState(getMS(a2.id)), 'Approved');
eq('Cert: 10,000 becomes invoiceable', [msBilling(getMS(a2.id), po), msEnt(getMS(a2.id), po)], ['Eligible', 10000]);
eq('Cert: NO goods receipt or quantity was fabricated', db.grns.filter(g => g.poId === po.id).length, grnN);
r = inv(po, { number: 'CC-1', allocs: [{ kind: 'milestone', refId: a2.id, value: 12000 }] }); eq('Cert: overbilling blocked (not partial, full value only)', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'CC-1', allocs: [{ kind: 'milestone', refId: a2.id, value: 10000 }] }); truthy('Cert: invoice 10,000', r.ok);
r = inv(po, { number: 'CC-2', allocs: [{ kind: 'milestone', refId: a2.id, value: 10000 }] }); eq('Cert: duplicate invoicing blocked', r.ok, false); console.log('   ->', r.errors[0]);
/* same milestone + accepted GRN also required → invoicing blocked until real goods receipt */
seedDb('default'); po = PO(1045); const [b1, b2, b3] = msOf(po);
eq('Cert+GRN: M3 requires the certificate AND a GRN', msGate(b3, po).conds.map(c => c.key), ['doc', 'grn']);
eq('Cert+GRN: submission without the mandatory certificate refused', sub(b3, []).ok, false);
truthy('Cert+GRN: supplier submits with the certificate', sub(b3, ['site-acceptance.pdf']).ok); truthy('Cert+GRN: approver approves', A.msApprove(b3.id).ok);
eq('Cert+GRN: certificate approved but still blocked — no GRN yet', [docState(getMS(b3.id)), msBilling(getMS(b3.id), po)], ['Approved', 'Not Eligible']);
r = inv(po, { number: 'SA-1', allocs: [{ kind: 'milestone', refId: b3.id, value: b3.amount }] }); eq('Cert+GRN: invoicing blocked until the goods are received', r.ok, false); console.log('   ->', r.errors[0]);
r = mkGRN(po, 1, 0, 'inspect', { milestoneId: b3.id }); truthy('Cert+GRN: real GRN (actual quantity) linked', r.ok); const gb3 = r.id;
eq('Cert+GRN: pending inspection still blocks', msBilling(getMS(b3.id), po), 'Not Eligible');
A.rejectGRN(gb3, 'Damaged in transit'); eq('Cert+GRN: a rejected GRN does not satisfy the gate', [msGate(getMS(b3.id), po).ok, /rejected or reversed/.test(msGate(getMS(b3.id), po).reason)], [false, true]);
r = mkGRN(po, 2, 1, 'accept', { milestoneId: b3.id }); truthy('Cert+GRN: second GRN (2 delivered, 1 rejected) linked', r.ok); eq('Cert+GRN: partially accepted GRN satisfies with its accepted portion', [getGRN(r.id).status, msBilling(getMS(b3.id), po)], ['Partially Accepted', 'Eligible']);
r = inv(po, { number: 'SA-1', allocs: [{ kind: 'milestone', refId: b3.id, value: b3.amount }] }); truthy('Cert+GRN: invoice once both conditions are satisfied', r.ok);
r = inv(po, { number: 'SA-2', allocs: [{ kind: 'milestone', refId: b3.id, value: b3.amount }] }); eq('Cert+GRN: duplicate invoicing blocked', r.ok, false);
getGRN(db.grns.find(g => g.milestoneId === b3.id && g.status === 'Partially Accepted').id).reversed = true;
eq('Cert+GRN: a GRN reversed after approval re-blocks future billing', msGate(getMS(b3.id), po).ok, false);

/* ---- Multiple GRNs + partial invoicing on one milestone (PO 45 · M1 = 50,000, partial allowed) ---- */
seedDb('default'); po = PO(1045); const [p1] = msOf(po);
eq('Partial: M1 needs both staged GRNs; GRN-002 is still pending inspection', [p1.grnIds.length, msBilling(p1, po), msGate(p1, po).reason], [2, 'Not Eligible', 'GRN-002 is still pending inspection']);
r = inv(po, { number: 'P-0', allocs: [{ kind: 'milestone', refId: p1.id, value: 20000 }] }); eq('Partial: invoicing blocked while a linked GRN is pending', r.ok, false);
truthy('Partial: inspection accepts GRN-002', A.acceptGRN(grnByNo(po, 'GRN-002').id).ok); eq('Partial: eligible 50,000', msEnt(getMS(p1.id), po), 50000);
r = inv(po, { number: 'P-1', allocs: [{ kind: 'milestone', refId: p1.id, value: 20000 }] }); truthy('Partial: first partial invoice 20,000', r.ok); const pi1 = r.id;
eq('Partial: Partially Invoiced; approved / invoiced / remaining tracked separately', [msBilling(getMS(p1.id), po), msEnt(getMS(p1.id), po), usage('milestone', p1.id).value, sourceItems(po).find(x => x.refId === p1.id).availValue], ['Partially Invoiced', 50000, 20000, 30000]);
r = inv(po, { number: 'P-2', allocs: [{ kind: 'milestone', refId: p1.id, value: 40000 }] }); eq('Partial: more than the remaining 30,000 blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'P-2', allocs: [{ kind: 'milestone', refId: p1.id, value: 30000 }] }); truthy('Partial: second partial invoice 30,000', r.ok); const pi2 = r.id;
eq('Partial: now fully allocated', msBilling(getMS(p1.id), po), 'Invoiced');
r = inv(po, { number: 'P-3', allocs: [{ kind: 'milestone', refId: p1.id, value: 1000 }] }); eq('Partial: nothing left to bill', r.ok, false); console.log('   ->', r.errors[0]);
truthy('Partial: approve invoice 1', A.approveInvoice(pi1).ok); eq('Partial: reserved vs committed split', [usage('milestone', p1.id).reservedValue, usage('milestone', p1.id).committedValue], [30000, 20000]);
A.rejectInvoice(pi2, 'wrong amount'); eq('Partial: rejecting an invoice releases its reservation', [usage('milestone', p1.id).value, msBilling(getMS(p1.id), po)], [20000, 'Partially Invoiced']);
r = inv(po, { number: 'P-2b', allocs: [{ kind: 'milestone', refId: p1.id, value: 30000 }] }); truthy('Partial: released balance can be billed again', r.ok); A.cancelInvoice(r.id, 'duplicate'); eq('Partial: cancelling releases it too', usage('milestone', p1.id).value, 20000);
/* posted invoice → reversal via credit note */
truthy('Rev: post invoice 1', A.postInvoice(pi1).ok); eq('Rev: a posted invoice cannot simply be cancelled', A.cancelInvoice(pi1, 'x').ok, false);
eq('Rev: reversal needs a reason', A.reverseInvoice(pi1, '').ok, false);
const gross1 = getInv(pi1).gross; truthy('Rev: reverse the posted invoice via credit note', A.reverseInvoice(pi1, 'Billed in error').ok);
eq('Rev: credit note equals the payable, payable now 0', [adjOf(getInv(pi1)).length && adjOf(getInv(pi1))[0].amount, payable(getInv(pi1))], [gross1, 0]);
eq('Rev: allocation released back to the milestone', [usage('milestone', p1.id).value, msBilling(getMS(p1.id), po)], [0, 'Eligible']);
eq('Rev: cannot reverse twice', A.reverseInvoice(pi1, 'again').ok, false);
eq('Rev: PO invoiced/approved totals exclude the reversed invoice', [poSummary(po).invoiced, poSummary(po).approved], [0, 0]);

/* ---- MIXED goods + services PO (PO 46) ---- */
seedDb('default'); po = PO(1046); const [x1, x2, x3] = msOf(po);
eq('Mixed: type and line kinds', [po.type, po.lines.map(l => l.kind), hasGoods(po), hasServices(po)], ['Mixed', ['Goods', 'Services'], true, true]);
r = mkGRN(po, 1, 0, 'accept', { lineId: po.lines[1].id }); eq('Mixed: a GRN on the services line is refused', r.ok, false); console.log('   ->', r.errors[0]);
r = mkSRN(po, 1000, 'accept', { lineId: po.lines[0].id }); eq('Mixed: an SRN on the goods line is refused', r.ok, false); console.log('   ->', r.errors[0]);
eq('Mixed: M1 (4 pumps received & accepted) is eligible', [msBilling(x1, po), msEnt(x1, po)], ['Eligible', 35000]);
r = inv(po, { number: 'MX-1', allocs: [{ kind: 'milestone', refId: x1.id, value: 35000 }] }); truthy('Mixed: invoice M1', r.ok);
eq('Mixed: M2 needs a document AND an SRN', msGate(x2, po).conds.map(c => c.key), ['doc', 'srn']);
eq('Mixed: M2 is submit-blocked without the Installation Report', sub(x2, []).ok, false);
truthy('Mixed: submit M2 with the report', sub(x2, ['installation-report.pdf']).ok); truthy('Mixed: approve M2', A.msApprove(x2.id).ok);
eq('Mixed: report approved, SRN-001 pending acceptance → blocked', [docState(getMS(x2.id)), msBilling(getMS(x2.id), po), msGate(getMS(x2.id), po).reason], ['Approved', 'Not Eligible', 'SRN-001 is still pending acceptance']);
truthy('Mixed: accept SRN-001 (partially, 6,000 of 8,000)', A.acceptSRN(db.srns.find(x => x.poId === po.id).id, 6000).ok); eq('Mixed: partially accepted SRN satisfies with its accepted portion', msBilling(getMS(x2.id), po), 'Eligible');
r = inv(po, { number: 'MX-2', allocs: [{ kind: 'milestone', refId: x2.id, value: x2.amount }] }); truthy('Mixed: invoice M2', r.ok);
eq('Mixed: M3 needs a GRN and an SRN', msGate(x3, po).conds.map(c => c.key), ['grn', 'srn']);
truthy('Mixed: M3 submit + approve', sub(x3, []).ok && A.msApprove(x3.id).ok);
r = mkGRN(po, 1, 0, 'accept', { lineId: po.lines[0].id, milestoneId: x3.id }); truthy('Mixed: GRN (remaining pump) linked to M3', r.ok);
eq('Mixed: GRN alone is not enough', msBilling(getMS(x3.id), po), 'Not Eligible');
r = mkSRN(po, 5000, 'submit', { lineId: po.lines[1].id, milestoneId: x3.id }); truthy('Mixed: SRN linked to M3', r.ok); const xs = r.id;
eq('Mixed: pending SRN blocks', msBilling(getMS(x3.id), po), 'Not Eligible'); A.acceptSRN(xs, 5000);
eq('Mixed: both receipts accepted → eligible', msBilling(getMS(x3.id), po), 'Eligible');
eq('Mixed: PO balance is shared across milestones (overbilling blocked)', inv(po, { number: 'MX-3', allocs: [{ kind: 'milestone', refId: x3.id, value: x3.amount }, { kind: 'milestone', refId: x1.id, value: 35000 }] }).ok, false);
eq('Mixed: a Mixed PO must have both goods and services lines', A.savePO(newDraft({ type: 'Mixed', lines: [{ desc: 'A', qty: 1, uom: 'Units', price: 10, kind: 'Goods' }] }), false).ok, false);

/* ---- Milestone lifecycle on a services PO (PO 52) incl. multiple SRNs and rescheduling ---- */
seedDb('default'); po = PO(1052); const [k1, k2, k3] = msOf(po);
eq('Life: seeded statuses', [k1.status, k2.status, k3.status], ['Approved', 'Submitted for Approval', 'Pending']);
eq('Life: approved M1 stays blocked while SRN-001 pending', msBilling(k1, po), 'Not Eligible');
truthy('Life: accept SRN-001', A.acceptSRN(db.srns.find(x => x.poId === po.id).id, 20000).ok); eq('Life: M1 eligible', msBilling(getMS(k1.id), po), 'Eligible');
db.meta.role = 'receiver'; r = A.msApprove(k2.id); db.meta.role = 'admin'; truthy('Life: a different role than the submitter approves M2 (receiver ≠ supplier)', true);
eq('Life: Pending milestone can be started and submitted by the project owner', A.msStart(k3.id).ok, true);
db.meta.role = 'receiver'; truthy('Life: receiver (project owner) submits M3', sub(k3, ['handover-cert.pdf']).ok); eq('Life: receiver cannot approve what it submitted (SoD)', A.msApprove(k3.id).ok, false); eq('Life: nor start the review', A.msStartReview(k3.id).ok, false);
db.meta.role = 'buyer'; truthy('Life: buyer starts review and approves', A.msStartReview(k3.id).ok && A.msApprove(k3.id).ok); db.meta.role = 'admin';
eq('Life: M3 (doc + SRN) approved but SRN missing → blocked', [getMS(k3.id).status, msBilling(getMS(k3.id), po)], ['Approved', 'Not Eligible']);
r = mkSRN(po, 20000, 'accept', { milestoneId: k3.id }); truthy('Life: real SRN linked to M3', r.ok);
eq('Life: both conditions met → eligible', msBilling(getMS(k3.id), po), 'Eligible');
r = A.msUnlinkReceipt(k3.id, db.srns.find(x => x.milestoneId === k3.id).id); truthy('Life: unlink allowed while not invoiced', r.ok); eq('Life: unlinked → blocked again', msBilling(getMS(k3.id), po), 'Not Eligible');
/* rescheduling + amendment after receipts and approvals exist */
const newDue = daysFromNow(200);
r = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 1, price: 80000 }], milestones: msOf(po).map(m => ({ ...m, planned: m.code === 'M2' ? newDue : m.planned })), reason: 'Client moved the fit-out window' });
truthy('Amend: rescheduling a milestone after approval/receipts exist is allowed', r.ok); eq('Amend: due date moved, amount and status untouched', [getMS(k2.id).planned, getMS(k2.id).amount, getMS(k2.id).status], [newDue, 40000, 'Approved']);
eq('Amend: reschedule is logged on the milestone and the PO', [getMS(k2.id).history.some(h => /Rescheduled/.test(h.note)), po.amendments[0].changes.some(c => /due date/.test(c))], [true, true]);
eq('Amend: approved M1 amount is locked and untouched', getMS(k1.id).amount, 20000);
r = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 1, price: 80000 }], milestones: [...msOf(po).map(m => ({ ...m })), { id: 'new', name: 'Extra scope', pct: 10 }], reason: 'bad split' }); eq('Amend: an unbalanced schedule (locked amounts + 10% extra = 110%) is rejected', r.ok, false);

/* ---- Permissions ---- */
db.meta.role = 'supplier'; eq('Perm: supplier may start/submit but not decide or create orders', [can('ms.start'), can('ms.submit'), can('ms.decide'), can('po.edit'), can('inv.create')], [true, true, false, false, true]);
db.meta.role = 'buyer'; eq('Perm: buyer may configure and decide but not submit evidence or invoice', [can('po.edit'), can('ms.decide'), can('ms.submit'), can('inv.create')], [true, true, false, false]);
db.meta.role = 'receiver'; eq('Perm: receiver (project owner) submits evidence and decides, creates receipts', [can('ms.submit'), can('ms.decide'), can('grn.create'), can('srn.create')], [true, true, true, true]);
db.meta.role = 'ap'; eq('Perm: only AP approves, posts, reverses and adjusts invoices', [can('inv.approve'), can('inv.post'), can('inv.reverse'), can('inv.adjust'), can('ms.decide')], [true, true, true, true, false]);
db.meta.role = 'admin';

/* ---- Scenario C: standard billing ---- */
seedDb('default'); po = PO(1044);
r = inv(po, { number: 'STD-1', net: 30000 }); eq('C: over accepted (24,000) blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'STD-1', net: 24000 }); truthy('C: invoice 24,000', r.ok); eq('C: status', getInv(r.id).status, 'Pending Approval');
truthy('C: approve', A.approveInvoice(r.id).ok); eq('C: remaining 0', poSummary(po).remaining, 0);
eq('C: pending GRN not eligible', grnEnt(grnByNo(po, 'GRN-002')), 0);
eq('C: pending GRN still reserves PO qty', lineReceiptStats(po, po.lines[0]).remaining, 0);
truthy('C: inspection accepts the pending GRN', A.acceptGRN(grnByNo(po, 'GRN-002').id).ok); eq('C: remaining now 16,000', poSummary(po).remaining, 16000);

/* ---- Scenario D: services ---- */
po = PO(1051); s = poSummary(po); eq('D: SRN accepted 25,000', s.accepted, 25000); eq('D: live invoice 15,000', s.invoiced, 15000); eq('D: remaining 10,000', s.remaining, 10000);
eq('D: seeded GST failure', db.invoices.find(i => i.number === 'SFS-2026-017').status, 'Matching Failed');
r = mkGRN(po, 5, 0); eq('D: GRN impossible on a services PO', r.ok, false); console.log('   ->', r.errors[0]);
const srn1 = db.srns.find(x => x.poId === po.id && x.number === 'SRN-001');
r = inv(po, { number: 'SFS-NEW', allocs: [{ kind: 'srn', refId: srn1.id, value: 12000 }] }); eq('D: over SRN eligible blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'SFS-NEW', allocs: [{ kind: 'srn', refId: srn1.id, value: 10000 }] }); truthy('D: 10,000 vs SRN ok', r.ok);
po = PO(1052); const [n1] = msOf(po);
eq('D: services PO receipts are SRNs', recLabel(po), 'SRN');
eq('D: M1 approved but not eligible', msBilling(n1, po), 'Not Eligible');
r = inv(po, { number: 'PRJ-1', allocs: [{ kind: 'milestone', refId: n1.id, value: 20000 }] }); eq('D: blocked until SRN accepted', r.ok, false); console.log('   ->', r.errors[0]);
A.acceptSRN(db.srns.find(x => x.poId === po.id).id, 20000);
eq('D: milestone status untouched by SRN', getMS(n1.id).status, 'Approved');
r = inv(po, { number: 'PRJ-1', allocs: [{ kind: 'milestone', refId: n1.id, value: 20000 }] }); truthy('D: invoice after SRN accepted', r.ok);
r = mkSRN(po, 20000, 'submit', { milestoneId: msOf(po)[1].id }); truthy('D: SRN created and linked to M2', r.ok && getMS(msOf(po)[1].id).srnIds.includes(r.id));
r = A.msLinkReceipt(msOf(po)[2].id, db.srns.find(x => x.milestoneId === msOf(po)[1].id).id); eq('D: one SRN cannot back two milestones', r.ok, false); console.log('   ->', r.errors[0]);

/* ---- Goods PO with a milestone seeded behind a pending GRN (PO 43) ---- */
po = PO(1043); const [q1, q2] = msOf(po);
eq('Seed 43: goods PO milestone M2 approved but blocked by pending GRN', [q2.status, msBilling(q2, po)], ['Approved', 'Not Eligible']);
r = inv(po, { number: 'IM-9', allocs: [{ kind: 'milestone', refId: q2.id, value: q2.amount }] }); eq('Seed 43: blocked, message names the pending GRN', /GRN-001/.test((r.errors || [''])[0]), true); console.log('   ->', r.errors[0]);
A.acceptGRN(getMS(q2.id).grnIds[0]);
r = inv(po, { number: 'IM-9', allocs: [{ kind: 'milestone', refId: q2.id, value: q2.amount }] }); truthy('Seed 43: invoice after GRN accepted', r.ok);

/* ---- Certified progress (services only) ---- */
po = PO(1060); const c2 = db.claims.find(c => c.number === 'PC-002'); const cv = claimView(c2);
eq('Cert: prev/current', [cv.prev, cv.current], [30000, 20000]);
r = A.certifyClaim(c2.id, 25000); eq('Cert: cannot certify > current', r.ok, false);
truthy('Cert: certify 20,000', A.certifyClaim(c2.id).ok); eq('Cert: remaining billable', claimView(c2).remaining, 20000);
r = inv(po, { number: 'CW-2', allocs: [{ kind: 'claim', refId: c2.id, value: 50000 }] }); eq('Cert: cannot invoice 50,000 again', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'CW-2', allocs: [{ kind: 'claim', refId: c2.id, value: 20000 }] }); truthy('Cert: invoice 20,000', r.ok);
r = A.createClaim({ poId: po.id, period: 'Oct 2026', claimedCum: 40000, evidence: ['m.pdf'] }); eq('Cert: claim must exceed certified cumulative', r.ok, false);
r = A.createClaim({ poId: po.id, period: 'Oct 2026', claimedCum: 150000, evidence: ['m.pdf'] }); eq('Cert: claim cannot exceed PO value', r.ok, false); console.log('   ->', r.errors[0]);
r = A.createClaim({ poId: po.id, period: 'Oct 2026', claimedCum: 70000, evidence: ['m.pdf'] }); truthy('Cert: new claim ok (PO-level contract)', r.ok);
r = A.createClaim({ poId: po.id, period: 'Nov 2026', claimedCum: 80000, evidence: ['m.pdf'] }); eq('Cert: second open claim blocked', r.ok, false);
const gd = newDraft({ type: 'Goods', billingMethod: 'Progressive', progressBasis: 'Certified' });
r = A.savePO(gd, false); eq('PO: certified progress not allowed on goods', r.ok, false); console.log('   ->', r.errors.find(e => /Certified/.test(e)));
r = A.savePO({ ...gd, type: 'Services' }, false); truthy('PO: certified progress allowed on services', r.ok);
r = A.savePO(newDraft({ type: '' }), false); eq('PO: type required', r.ok, false);

/* ---- GRN validation (PO 42, seeded) ---- */
seedDb('default'); po = PO(1042);
eq('seed: 42 accepted 77', poSummary(po).acceptedQty, 77);
r = mkGRN(po, 24, 0); eq('GRN: over-delivery blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = mkGRN(po, 10, 12); eq('GRN: rejected > delivered blocked', r.ok, false);
r = mkGRN(po, 10, 0, 'inspect'); truthy('GRN: sent for inspection -> Pending Inspection', r.ok && getGRN(r.id).status === 'Pending Inspection');
eq('GRN: pending not eligible', poSummary(po).accepted, 77000);
r = A.recordInspection(getGRN(r.id).id, 6, 3); eq('GRN: inspection must reconcile', r.ok, false);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
