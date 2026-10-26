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

/* ---- Scenario B: GOODS PO on milestones, gated on a GRN ---- */
seedDb('B'); po = PO(1042);
eq('B: draft schedule', msOf(po).map(m => m.amount), [20000, 50000, 30000]);
eq('B: goods PO gate is a GRN', recLabel(po), 'GRN');
let dm = draftOf(po); dm.milestones[2].pct = 40; r = A.savePO(dm, true); eq('B: >100% schedule rejected', r.ok, false); console.log('   ->', r.errors.find(e => /Milestone schedule/.test(e)));
dm.milestones[2].pct = 30; r = A.savePO(dm, true); truthy('B: submit PO', r.ok); truthy('B: approve', A.approvePO(po.id).ok);
const [m1, m2] = msOf(po);
eq('B: milestones pending', msOf(po).map(m => m.status), ['Pending Approval', 'Pending Approval', 'Pending Approval']);
r = inv(po, { number: 'M-1', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); eq('B: invoice before approval blocked', r.ok, false); console.log('   ->', r.errors[0]);
eq('B: cannot complete before approval', A.msComplete(m1.id, { actualDate: todayISO() }).ok, false);
truthy('B: approve M1', A.msApprove(m1.id).ok);
eq('B: approved is not yet billable', msBilling(getMS(m1.id), po), 'Not Eligible');
r = inv(po, { number: 'M-1', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); eq('B: approved-but-not-complete invoice blocked', r.ok, false); console.log('   ->', r.errors[0]);
eq('B: PO counts nothing as received yet', poSummary(po).accepted, 0);
truthy('B: complete M1', A.msComplete(m1.id, { actualDate: todayISO() }).ok);
eq('B: completed milestone counts toward the PO', poSummary(po).accepted, 20000);
eq('B: M1 eligible', msBilling(getMS(m1.id), po), 'Eligible');
r = inv(po, { number: 'M-1', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); truthy('B: invoice M1', r.ok); eq('B: M1 pending approval', getInv(r.id).status, 'Pending Approval');
truthy('B: approve inv', A.approveInvoice(r.id).ok);
eq('B: M1 invoiced', msBilling(getMS(m1.id), po), 'Invoiced');
r = inv(po, { number: 'M-1b', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); eq('B: 2nd M1 invoice blocked', r.ok, false); console.log('   ->', r.errors[0]);
s = poSummary(po); eq('B: invoiced 20000', s.invoiced, 20000); eq('B: remaining eligible 0', s.remaining, 0);
/* M2 needs a GRN: a goods PO must be gateable by a GRN, and an SRN must be impossible */
truthy('B: M2 approve', A.msApprove(m2.id).ok); r = A.msComplete(m2.id, { actualDate: todayISO() }); eq('B: M2 cannot be completed until its GRN is accepted', r.ok, false); console.log('   ->', r.errors[0]);
eq('B: M2 approved but gated on GRN', msBilling(getMS(m2.id), po), 'Not Eligible');
r = inv(po, { number: 'M-2', allocs: [{ kind: 'milestone', refId: m2.id, value: 50000 }] }); eq('B: M2 invoice blocked until GRN accepted', r.ok, false); console.log('   ->', r.errors[0]);
r = mkSRN(po, 1000); eq('B: SRN impossible on a goods PO', r.ok, false); console.log('   ->', r.errors[0]);
r = mkGRN(po, 100, 0, 'inspect', { milestoneId: m1.id }); eq('B: cannot link a GRN to a milestone that needs none', r.ok, false); console.log('   ->', r.errors[0]);
r = mkGRN(po, 100, 0, 'inspect', { milestoneId: m2.id }); truthy('B: GRN created + linked to M2 in one step', r.ok && getMS(m2.id).receiptId === r.id && getGRN(r.id).milestoneId === m2.id);
const gM2 = r.id;
eq('B: pending GRN does not clear the gate', msGate(getMS(m2.id), po).ok, false);
truthy('B: accept GRN via inspection', A.recordInspection(gM2, 100, 0).ok);
eq('B: accepted GRN alone does not make M2 billable', msBilling(getMS(m2.id), po), 'Not Eligible');
truthy('B: M2 can now be completed', A.msComplete(m2.id, { actualDate: todayISO() }).ok);
eq('B: M2 now eligible', msBilling(getMS(m2.id), po), 'Eligible');
r = A.msLinkReceipt(m1.id, gM2); eq('B: link blocked for non-gated milestone', r.ok, false);
r = inv(po, { number: 'M-2', allocs: [{ kind: 'milestone', refId: m2.id, value: 50000 }] }); truthy('B: M2 invoice after GRN accepted', r.ok);
r = inv(po, { number: 'M-2', allocs: [{ kind: 'milestone', refId: m2.id, value: 50000 }] }); eq('B: dup bill no. blocked by matching/duplicate allocation', r.ok, false);
const am = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 120, price: 1000 }], milestones: msOf(po).map(m => ({ ...m })), reason: 'Scope increase' });
eq('B: amend that leaves 100% (locked amounts fixed) needs a new/unlocked milestone', am.ok, false); console.log('   ->', am.errors[0]);
const am2 = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 120, price: 1000 }], milestones: [...msOf(po).map(m => ({ ...m })), { id: 'new', name: 'Extra scope', pct: 0, planned: '' }], reason: 'x' });
eq('B: amend with nothing allocated to the new scope rejected', am2.ok, false);
po = PO(1042); eq('B: failed amendments change nothing', [po.version, poNet(po)], [1, 100000]);
/* schedule rounding: 3 × 33.33% must still equal the PO value exactly */
const rd = newDraft({ lines: [{ desc: 'Item', qty: 1, uom: 'Lot', price: 1000 }], billingMethod: 'Milestone', milestones: [{ name: 'A', pct: 33.33 }, { name: 'B', pct: 33.33 }, { name: 'C', pct: 33.34 }] });
const rp = approve(rd); eq('B: rounded schedule sums to PO value', [msOf(rp).reduce((x, m) => x + m.amount, 0), msOf(rp).map(m => m.amount)], [1000, [333.3, 333.3, 333.4]]);
const rd3 = newDraft({ lines: [{ desc: 'Item', qty: 1, uom: 'Lot', price: 100 }], billingMethod: 'Milestone', milestones: [{ name: 'A', pct: 33.333 }, { name: 'B', pct: 33.333 }, { name: 'C', pct: 33.334 }] });
const rp3 = approve(rd3); eq('B: odd percentages still sum exactly', r2(msOf(rp3).reduce((x, m) => x + m.amount, 0)), 100);

/* ---- Milestone lifecycle on a services PO: approve → receipt gate → complete ---- */
seedDb('default'); po = PO(1052); const [k1, k2, k3] = msOf(po);
eq('Life: seeded statuses', [k1.status, k2.status, k3.status], ['Approved', 'Pending Approval', 'Pending Approval']);
eq('Life: cannot complete an unapproved milestone', A.msComplete(k2.id, { actualDate: todayISO() }).ok, false);
eq('Life: approved M1 cannot complete while SRN pending', A.msComplete(k1.id, { actualDate: todayISO() }).ok, false); console.log('   ->', A.msComplete(k1.id, { actualDate: todayISO() }).errors[0]);
eq('Life: rejection needs a reason', A.msReject(k3.id, '').ok, false);
truthy('Life: reject M3', A.msReject(k3.id, 'Scope not agreed').ok); eq('Life: rejected M3 status', getMS(k3.id).status, 'Rejected');
truthy('Life: a rejected milestone can be approved again', A.msApprove(k3.id).ok);
truthy('Life: approve M2', A.msApprove(k2.id).ok); eq('Life: approving twice blocked', A.msApprove(k2.id).ok, false);
A.acceptSRN(db.srns.find(x => x.poId === po.id).id, 20000);
truthy('Life: M1 completes once SRN accepted', A.msComplete(k1.id, { actualDate: todayISO() }).ok); eq('Life: M1 complete', getMS(k1.id).status, 'Completed');
eq('Life: complete twice blocked', A.msComplete(k1.id, { actualDate: todayISO() }).ok, false);
const gAfter = A.reverseGRN; // receipt reversal after completion must close the gate again
eq('Life: completed + gate clear is billable', msBilling(getMS(k1.id), po), 'Eligible');
db.srns.find(x => x.poId === po.id).status = 'Rejected'; eq('Life: a later rejected SRN re-blocks billing', msBilling(getMS(k1.id), po), 'Not Eligible');

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
eq('D: services PO gate is an SRN', recLabel(po), 'SRN');
eq('D: M1 approved but not eligible', msBilling(n1, po), 'Not Eligible');
r = inv(po, { number: 'PRJ-1', allocs: [{ kind: 'milestone', refId: n1.id, value: 20000 }] }); eq('D: blocked until SRN accepted', r.ok, false); console.log('   ->', r.errors[0]);
A.acceptSRN(db.srns.find(x => x.poId === po.id).id, 20000);
eq('D: milestone status untouched by SRN', getMS(n1.id).status, 'Approved');
truthy('D: complete M1 after SRN accepted', A.msComplete(n1.id, { actualDate: todayISO() }).ok);
r = inv(po, { number: 'PRJ-1', allocs: [{ kind: 'milestone', refId: n1.id, value: 20000 }] }); truthy('D: invoice after SRN accepted', r.ok);
const n3 = msOf(po)[2];
r = mkSRN(po, 20000, 'submit', { milestoneId: n3.id }); truthy('D: SRN created linked to M3', r.ok && getMS(n3.id).receiptId === r.id);
r = A.msLinkReceipt(msOf(po)[1].id, db.srns.find(x => x.milestoneId === n3.id).id); eq('D: one SRN cannot back two milestones', r.ok, false); console.log('   ->', r.errors[0]);
r = A.msLinkReceipt(n3.id, ''); truthy('D: unlink works', r.ok && !getMS(n3.id).receiptId);

/* ---- Goods PO with a milestone seeded behind a pending GRN (PO 43) ---- */
po = PO(1043); const [q1, q2] = msOf(po);
eq('Seed 43: goods PO milestone M2 approved but blocked by pending GRN', [q2.status, msBilling(q2, po)], ['Approved', 'Not Eligible']);
r = inv(po, { number: 'IM-9', allocs: [{ kind: 'milestone', refId: q2.id, value: q2.amount }] }); eq('Seed 43: invoice blocked while M2 is not complete', /not invoice-eligible/.test((r.errors || [''])[0]), true); console.log('   ->', r.errors[0]);
A.acceptGRN(getMS(q2.id).receiptId);
r = A.msComplete(q2.id, { actualDate: todayISO() }); truthy('Seed 43: M2 completes after GRN accepted', r.ok);
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
