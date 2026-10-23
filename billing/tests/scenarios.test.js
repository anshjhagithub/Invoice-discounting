let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)); };
const truthy = (name, v) => { if (!v) fails++; console.log((v ? 'PASS ' : 'FAIL ') + name); };
const PO = n => db.pos.find(p => p.number === 'PO-2026-' + n);
const mkGRN = (po, rec, acc, rej, mode = 'accept') => A.createGRN({ poId: po.id, lineId: po.lines[0].id, date: todayISO(), location: 'WH-A', received: rec, accepted: acc, rejected: rej, inspection: 'Passed', remarks: '' }, mode);
const grnByNo = (po, no) => db.grns.find(g => g.poId === po.id && g.number === no);
const inv = (po, o) => A.saveInvoice({ poId: po.id, number: o.number, date: todayISO(), allocs: o.allocs || [], net: o.net, vatManual: o.vatManual, attachments: [] }, 'submit');
const draftOf = po => ({ id: po.id, ...po, milestones: msOf(po).map(m => ({ ...m })), scheduleFinal: po.scheduleStatus === 'Final' });

/* ---- Scenario A ---- */
seedDb('A');
let po = PO(1042), r, s;
eq('A: PO draft', po.status, 'Draft');
let d = draftOf(po); d.billingMethod = 'Progressive'; d.progressBasis = 'Receipt';
r = A.savePO(d, true); truthy('A: submit PO', r.ok); r = A.approvePO(po.id); truthy('A: approve PO', r.ok);
eq('A: method', po.billingMethod, 'Progressive');
truthy('A: GRN1', mkGRN(po, 30, 30, 0).ok); truthy('A: GRN2', mkGRN(po, 40, 40, 0).ok); truthy('A: GRN3', mkGRN(po, 10, 7, 3).ok);
s = poSummary(po);
eq('A: accepted qty', s.acceptedQty, 77); eq('A: accepted value', s.accepted, 77000); eq('A: remaining PO qty', s.remainingPOQty, 23);
eq('A: GRN3 status', grnByNo(po, 'GRN-003').status, 'Partially Accepted');
const g1 = grnByNo(po, 'GRN-001'), g2 = grnByNo(po, 'GRN-002');
r = inv(po, { number: 'GIE-001', allocs: [{ kind: 'grn', refId: g1.id, qty: 30, value: 30000 }] });
truthy('A: inv1 submitted', r.ok); eq('A: inv1 status', getInv(r.id).status, 'Pending Approval'); eq('A: inv1 match', getInv(r.id).match.result, 'Matched'); eq('A: inv1 gross', getInv(r.id).gross, 31500);
const i1 = r.id;
r = inv(po, { number: 'GIE-002', allocs: [{ kind: 'grn', refId: g2.id, qty: 20, value: 20000 }] });
truthy('A: inv2 submitted', r.ok); eq('A: inv2 net/vat/gross', [getInv(r.id).net, getInv(r.id).vat, getInv(r.id).gross], [20000, 1000, 21000]);
const i2 = r.id;
r = inv(po, { number: 'GIE-003', allocs: [{ kind: 'grn', refId: g1.id, qty: 30, value: 30000 }] });
eq('A: duplicate GRN-001 blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'GIE-004', allocs: [{ kind: 'grn', refId: g2.id, qty: 25, value: 25000 }] });
eq('A: over-allocation msg', r.errors[0], 'Invoice quantity exceeds the eligible quantity remaining against GRN-002. Eligible: 20 units. Requested: 25 units.');
r = inv(po, { number: 'GIE-005', allocs: [{ kind: 'grn', refId: grnByNo(po, 'GRN-003').id, qty: 10, value: 10000 }] });
eq('A: GRN-003 beyond accepted blocked', r.ok, false); console.log('   ->', r.errors[0]);
s = poSummary(po);
eq('A: invoiced qty', s.invoicedQty, 50); eq('A: invoiced net', s.invoiced, 50000); eq('A: remaining accepted value', s.remaining, 27000);
truthy('A: approve1', A.approveInvoice(i1).ok); truthy('A: post1', A.postInvoice(i1).ok); truthy('A: pay1', A.payInvoice(i1).ok);
s = poSummary(po); eq('A: approved/paid/reserved separate', [s.approved, s.paid, s.reserved], [30000, 30000, 20000]);
A.rejectInvoice(i2, 'wrong PO ref');
eq('A: reject releases reservation (GRN-002 usage 0)', usage('grn', g2.id).qty, 0);
eq('A: remaining after reject', poSummary(po).remaining, 47000);
r = inv(po, { number: 'GIE-006', allocs: [{ kind: 'grn', refId: g2.id, qty: 40, value: 40000 }] }); truthy('A: inv6 ok', r.ok);
A.reverseGRN(g2.id, 'Damaged in storage'); A.runMatching(r.id); eq('A: reversed receipt fails matching', getInv(r.id).status, 'Matching Failed');
r = inv(po, { number: 'GIE-007', allocs: [{ kind: 'grn', refId: g2.id, qty: 1, value: 1000 }] }); eq('A: new invoice on reversed GRN blocked', r.ok, false);

/* concurrency via drafts */
seedDb('A'); po = PO(1042);
d = draftOf(po); d.billingMethod = 'Progressive'; d.progressBasis = 'Receipt'; A.savePO(d, true); A.approvePO(po.id);
mkGRN(po, 30, 30, 0); const gg = grnByNo(po, 'GRN-001');
const dr1 = A.saveInvoice({ poId: po.id, number: 'C-1', date: todayISO(), allocs: [{ kind: 'grn', refId: gg.id, qty: 30, value: 30000 }] }, 'draft');
const dr2 = A.saveInvoice({ poId: po.id, number: 'C-2', date: todayISO(), allocs: [{ kind: 'grn', refId: gg.id, qty: 30, value: 30000 }] }, 'draft');
truthy('A: both drafts saved (no reservation)', dr1.ok && dr2.ok);
const sub1 = A.saveInvoice({ ...getInv(dr1.id) }, 'submit'), sub2 = A.saveInvoice({ ...getInv(dr2.id) }, 'submit');
eq('A: concurrency first wins / second blocked', [sub1.ok, sub2.ok], [true, false]); console.log('   ->', sub2.errors[0]);

/* ---- Scenario B ---- */
seedDb('B'); po = PO(1042);
eq('B: draft schedule', msOf(po).map(m => m.amount), [20000, 50000, 30000]);
let dm = draftOf(po); dm.scheduleFinal = true; dm.scheduleMode = 'percent';
dm.milestones[2].pct = 40; r = A.savePO(dm, true); eq('B: >100% schedule rejected', r.ok, false); console.log('   ->', r.errors.find(e => /Milestone schedule/.test(e)));
dm.milestones[2].pct = 30; r = A.savePO(dm, true); truthy('B: submit PO', r.ok); truthy('B: approve', A.approvePO(po.id).ok);
const [m1, m2] = msOf(po);
eq('B: milestones pending', msOf(po).map(m => m.status), ['Pending Acceptance', 'Pending Acceptance', 'Pending Acceptance']);
r = inv(po, { number: 'M-1', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); eq('B: invoice before approval blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = A.msSubmit(m1.id, { actualDate: todayISO(), remarks: 'Design complete', evidence: [] }); eq('B: evidence required', r.ok, false);
truthy('B: submit M1', A.msSubmit(m1.id, { actualDate: todayISO(), remarks: 'Design complete', evidence: ['design.pdf'] }).ok);
truthy('B: approve M1', A.msApprove(m1.id).ok);
eq('B: M1 eligible', msBilling(getMS(m1.id), po), 'Eligible');
r = inv(po, { number: 'M-1', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); truthy('B: invoice M1', r.ok); eq('B: M1 pending approval', getInv(r.id).status, 'Pending Approval');
truthy('B: approve inv', A.approveInvoice(r.id).ok);
eq('B: M1 invoiced', msBilling(getMS(m1.id), po), 'Invoiced');
r = inv(po, { number: 'M-1b', allocs: [{ kind: 'milestone', refId: m1.id, value: 20000 }] }); eq('B: 2nd M1 invoice blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'M-2', allocs: [{ kind: 'milestone', refId: m2.id, value: 50000 }] }); eq('B: M2 blocked while pending', r.ok, false);
s = poSummary(po); eq('B: remaining eligible 0', s.remaining, 0); eq('B: invoiced 20000', s.invoiced, 20000);
A.msSubmit(m2.id, { actualDate: todayISO(), remarks: 'x', evidence: ['i.pdf'] }); A.msApprove(m2.id);
r = inv(po, { number: 'M-1', allocs: [{ kind: 'milestone', refId: m2.id, value: 50000 }] }); truthy('B: dup invoice no. passes gate', r.ok); eq('B: dup invoice no. fails matching', getInv(r.id).status, 'Matching Failed');
const am = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 120, price: 1000 }], milestones: msOf(po).map(m => ({ ...m })), reason: 'Scope increase' }); eq('B: amend without rebalancing schedule rejected', am.ok, false); console.log('   ->', am.errors[0]);

/* ---- Scenario C ---- */
seedDb('default'); po = PO(1044);
r = inv(po, { number: 'STD-1', net: 30000 }); eq('C: over accepted (24,000) blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'STD-1', net: 24000 }); truthy('C: invoice 24,000', r.ok); eq('C: status', getInv(r.id).status, 'Pending Approval');
truthy('C: approve', A.approveInvoice(r.id).ok); eq('C: remaining 0', poSummary(po).remaining, 0);
eq('C: pending GRN not eligible', grnEnt(grnByNo(po, 'GRN-002')), 0);

/* ---- Scenario D ---- */
po = PO(1051); s = poSummary(po); eq('D: SRN accepted 25,000', s.accepted, 25000); eq('D: live invoice 15,000', s.invoiced, 15000); eq('D: remaining 10,000', s.remaining, 10000);
eq('D: seeded VAT failure', db.invoices.find(i => i.number === 'EFS-2026-017').status, 'Matching Failed');
const srn1 = db.srns.find(x => x.poId === po.id && x.number === 'SRN-001');
r = inv(po, { number: 'EFS-NEW', allocs: [{ kind: 'srn', refId: srn1.id, value: 12000 }] }); eq('D: over SRN eligible blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'EFS-NEW', allocs: [{ kind: 'srn', refId: srn1.id, value: 10000 }] }); truthy('D: 10,000 vs SRN ok', r.ok);
po = PO(1052); const [n1] = msOf(po);
eq('D: M1 approved but not eligible', msBilling(n1, po), 'Not Eligible');
r = inv(po, { number: 'PRJ-1', allocs: [{ kind: 'milestone', refId: n1.id, value: 20000 }] }); eq('D: blocked until SRN accepted', r.ok, false); console.log('   ->', r.errors[0]);
A.acceptSRN(db.srns.find(x => x.poId === po.id).id, 20000);
eq('D: milestone status untouched by SRN', getMS(n1.id).status, 'Approved');
r = inv(po, { number: 'PRJ-1', allocs: [{ kind: 'milestone', refId: n1.id, value: 20000 }] }); truthy('D: invoice after SRN accepted', r.ok);

/* ---- Certified progress ---- */
po = PO(1060); const c2 = db.claims.find(c => c.number === 'PC-002'); const cv = claimView(c2);
eq('Cert: prev/current', [cv.prev, cv.current], [30000, 20000]);
r = A.certifyClaim(c2.id, 25000); eq('Cert: cannot certify > current', r.ok, false);
truthy('Cert: certify 20,000', A.certifyClaim(c2.id).ok); eq('Cert: remaining billable', claimView(c2).remaining, 20000);
r = inv(po, { number: 'CW-2', allocs: [{ kind: 'claim', refId: c2.id, value: 50000 }] }); eq('Cert: cannot invoice 50,000 again', r.ok, false); console.log('   ->', r.errors[0]);
r = inv(po, { number: 'CW-2', allocs: [{ kind: 'claim', refId: c2.id, value: 20000 }] }); truthy('Cert: invoice 20,000', r.ok);

/* ---- GRN validation ---- */
seedDb('default'); po = PO(1042);
eq('seed: 1042 accepted 77', poSummary(po).acceptedQty, 77);
r = mkGRN(po, 24, 24, 0, 'submit'); eq('GRN: over-receipt blocked', r.ok, false); console.log('   ->', r.errors[0]);
r = mkGRN(po, 10, 8, 5, 'submit'); eq('GRN: accepted+rejected>received blocked', r.ok, false);
r = mkGRN(po, 10, 5, 0, 'submit'); truthy('GRN: pending qty -> Pending Inspection', r.ok && getGRN(r.id).status === 'Pending Inspection');
eq('GRN: pending not eligible', poSummary(po).accepted, 77000);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
