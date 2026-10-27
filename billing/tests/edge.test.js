/* Edge-case suite for PRD v1.3 §5 (E01–E30) and flows 1–8 — progressive AND milestone billing.
   Runs after core + logic + seed in one context (see build-and-run.js). */
let efails = 0, ecount = 0;
const E = (name, ok, extra) => { ecount++; if (!ok) efails++; console.log((ok ? 'PASS ' : 'FAIL ') + 'EDGE ' + name + (ok || extra === undefined ? '' : '  :: ' + JSON.stringify(extra))); };
const mkPO = (o = {}) => {
  const d = { id: null, supplierId: 'sup1', buyer: 'DICE', office: 'o-6225', title: 'Edge PO', poDate: todayISO(), deliveryDate: daysFromNow(30), endDate: '', type: 'Goods', category: 'Corporate Assets', gstRate: 18, billingMethod: 'Progressive', progressBasis: 'Receipt',
    lines: [{ desc: 'Item', qty: 100, uom: 'Units', price: 100 }], milestones: [], ...o };
  const r = A.savePO(d, true); if (!r.ok) throw new Error('savePO: ' + JSON.stringify(r.errors)); A.approvePO(r.id); return getPO(r.id);
};
const grn = (po, rec, rej = 0, mode = 'accept', extra = {}) => { const r = A.createGRN({ poId: po.id, lineId: (extra.lineId || po.lines[0].id), date: todayISO(), received: rec, rejected: rej, ...extra }, mode); if (!r.ok) throw new Error('grn: ' + JSON.stringify(r.errors)); return getGRN(r.id); };
const srn = (po, v, mode = 'accept', extra = {}) => { const r = A.createSRN({ poId: po.id, lineId: (extra.lineId || po.lines[0].id), date: todayISO(), description: 'Svc', serviceValue: v, ...extra }, mode); if (!r.ok) throw new Error('srn: ' + JSON.stringify(r.errors)); return getSRN(r.id); };
let bill = 0;
const sub = (po, allocs, extra = {}) => A.saveInvoice({ poId: po.id, number: extra.number || 'B-' + (++bill), date: todayISO(), allocs, net: extra.net, attachments: [], ...extra }, 'submit');
const ga = (g, qty) => ({ kind: 'grn', refId: g.id, qty, value: r2(qty * lineOf(getPO(g.poId), g.lineId).price) });
const ma = (m, v) => ({ kind: 'milestone', refId: m.id, qty: null, value: v ?? m.amount });
const msReady = (m, files = ['f.pdf']) => { A.msStart(m.id); A.msSubmit(m.id, { actualDate: todayISO(), files }); return A.msApprove(m.id); };
const msd = (o = {}) => ({ name: 'M', pct: 100, planned: daysFromNow(10), needsDoc: false, docTitle: '', needsGrn: false, needsSrn: false, allowPartial: false, ...o });

/* ---------- 5.1 receipt-based progressive ---------- */
seedDb('default');
{ const po = mkPO(), g = grn(po, 10, 3);
  E('E01 10 received / 7 accepted → eligible 7, rejected excluded', g.accepted === 7 && sourceItems(po).find(x => x.refId === g.id).availQty === 7);
  E('UC24 request 8 → OVER_QTY, 7 succeeds', !sub(po, [ga(g, 8)]).ok && sub(po, [ga(g, 7)]).ok); }
{ const po = mkPO(), g = grn(po, 10, 0, 'inspect');
  E('E02 pending inspection counts against PO line but is not billable', lineReceiptStats(po, po.lines[0]).remaining === 90 && !sub(po, [ga(g, 5)]).ok); }
{ const po = mkPO(), g = grn(po, 30);
  const a = sub(po, [ga(g, 20)]), b = sub(po, [ga(g, 10)]), c = sub(po, [ga(g, 1)]);
  E('E03 one GRN invoiced 20 + 10, an 11th unit refused', a.ok && b.ok && !c.ok); }
{ const po = mkPO({ lines: [{ desc: 'A', qty: 50, uom: 'Units', price: 100 }, { desc: 'B', qty: 50, uom: 'Units', price: 200 }] });
  const g1 = grn(po, 20), g2 = grn(po, 20, 0, 'accept', { lineId: po.lines[1].id });
  const r = sub(po, [ga(g1, 10), ga(g2, 25)]);
  E('E04 one failing line blocks the whole invoice and names the line', !r.ok && r.errors.some(m => /GRN-002/.test(m)) && invsOf(po).length === 0, r.errors); }
{ const po = mkPO(), g = grn(po, 30), i = getInv(sub(po, [ga(g, 30)]).id);
  A.approveInvoice(i.id); A.postInvoice(i.id); A.reverseGRN(g.id, 'goods returned');
  const f = apReview(getInv(i.id));
  E('E05 receipt reduced after posting → invoice untouched but flagged for AP review with the overage', getInv(i.id).status === 'Posted' && f && f.amount === 3000, f); }
{ const po = mkPO(), g = grn(po, 30), i = getInv(sub(po, [ga(g, 30)]).id);
  const r = A.reverseGRN(g.id, 'wrong qty');
  E('E06 receipt reversed while invoice in flight → Matching Failed at once, hold released', getInv(i.id).status === 'Matching Failed' && usage('grn', g.id).qty === 0 && /failed re-matching/.test(r.msg), [getInv(i.id).status, r.msg]); }
{ const po = mkPO({ billingMethod: 'Standard' }), g = grn(po, 50), i = getInv(sub(po, [], { net: 4000 }).id);
  A.reverseGRN(g.id, 'x');
  E('E06 standard billing: reversal re-matches PO-level invoices too', getInv(i.id).status === 'Matching Failed'); }
{ const po = mkPO(); const r = A.createGRN({ poId: po.id, lineId: po.lines[0].id, date: todayISO(), received: 101, rejected: 0 }, 'accept');
  E('E07 over-receipt blocked (no tolerance by default)', !r.ok); }
{ const po = mkPO(), g = grn(po, 10);
  const r = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 100, price: 150 }], milestones: [], reason: 'price' });
  const r2_ = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 100, price: 100 }], milestones: [], reason: 'ok' });
  E('E08 price locked once receipts exist; a no-price-change amendment still works', !r.ok && r2_.ok); }

/* ---------- 5.2 milestone billing ---------- */
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ name: 'Deliver', pct: 100, needsGrn: true })] }), m = msOf(po)[0];
  const g = grn(po, 100, 0, 'inspect', { milestoneId: m.id });
  msReady(m);
  const r1 = sub(po, [ma(m)]);
  A.acceptGRN(g.id);
  E('E09/UC23 approved + GRN pending → GATE; after acceptance the same invoice succeeds', !r1.ok && /approved but cannot be invoiced yet|approved/.test(r1.errors[0]) && sub(po, [ma(m)]).ok, r1.errors); }
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ needsGrn: true })] }), m = msOf(po)[0], g = grn(po, 100, 0, 'accept', { milestoneId: m.id });
  msReady(m); const i = getInv(sub(po, [ma(m)]).id);
  A.reverseGRN(g.id, 'returned');
  E('E10/UC26 linked receipt reversed → milestone Not Eligible, unposted invoice fails re-match, hold released',
    msBilling(getMS(m.id), po) !== 'Eligible' && msEnt(getMS(m.id), po) === 0 && getInv(i.id).status === 'Matching Failed' && usage('milestone', m.id).value === 0); }
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ name: 'A', pct: 50, needsGrn: true }), msd({ name: 'B', pct: 50, needsGrn: true })] }), [m1, m2] = msOf(po), g = grn(po, 50, 0, 'accept', { milestoneId: m1.id });
  const r = A.msLinkReceipt(m2.id, g.id);
  E('E11/UC25 one receipt cannot back two milestones; message names M1', !r.ok && /M1/.test(r.msg), r.msg); }
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ needsDoc: true, docTitle: 'Cert' })] }), m = msOf(po)[0];
  A.msStart(m.id); A.msSubmit(m.id, { actualDate: todayISO(), files: ['a.pdf'] });
  const ri = A.msRequestInfo(m.id, 'signature page missing');
  A.msSubmit(m.id, { actualDate: todayISO(), files: ['a2.pdf'] });
  E('E12/UC27 info requested keeps submission 1; not eligible until the second approval', ri.ok && getMS(m.id).submissions.length === 2 && getMS(m.id).submissions[0].status === 'Info Requested' && msEnt(getMS(m.id), po) === 0);
  A.msApprove(m.id); E('E12 eligible after the second approval', msEnt(getMS(m.id), po) === m.amount); }
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ name: 'A', pct: 50 }), msd({ name: 'B', pct: 50 })] }), [m1, m2] = msOf(po);
  A.msStart(m2.id); A.msSubmit(m2.id, { actualDate: todayISO() }); const r = A.msApprove(m2.id);
  E('E16 M2 approved before M1 → allowed with an out-of-sequence advisory', r.ok && /Out of sequence: M1/.test(r.msg), r.msg); }
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ name: 'A', pct: 50 }), msd({ name: 'B', pct: 50 })] }), m = msOf(po)[0];
  A.msStart(m.id); A.msSubmit(m.id, { actualDate: todayISO() }); getMS(m.id).submittedAt = new Date(Date.now() - 3 * 864e5).toISOString();
  const ag = msAging(getMS(m.id)); getMS(m.id).submittedAt = new Date(Date.now() - 8 * 864e5).toISOString();
  E('E13 ageing: 3 days → reminder, 8 days → escalated', ag.level === 'reminder' && msAging(getMS(m.id)).level === 'escalated'); }
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ name: 'A', pct: 50 }), msd({ name: 'B', pct: 50 })] }), [m1, m2] = msOf(po);
  msReady(m1); sub(po, [ma(m1)]);
  const bad = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 100, price: 100 }], milestones: [{ id: m1.id, remove: true }, { id: m2.id, name: 'B', pct: 100 }], reason: 'drop M1' });
  const ok = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 100, price: 100 }], milestones: [{ id: m1.id, name: 'A', pct: 50 }, { id: m2.id, remove: true }, { id: 'new1', name: 'C', pct: 50 }], reason: 'replace M2' });
  const codes = msOf(po).map(m => m.code);
  E('E19 milestone with allocations cannot be cancelled; an untouched one can, and codes never collide', !bad.ok && /M1 cannot be cancelled/.test(bad.errors.join(' ')) && ok.ok && new Set(codes).size === codes.length && codes.length === 2 && Math.abs(sum(msOf(po), m => m.amount) - 10000) < 0.01, [bad.errors, ok.errors, codes]); }
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ name: 'A', pct: 20 }), msd({ name: 'B', pct: 80 })] }), [m1] = msOf(po);
  const r = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 100, price: 100 }], milestones: [{ id: m1.id, name: 'A', pct: 20, planned: daysFromNow(99) }], reason: 'move date' });
  E('E20 rescheduling never changes eligibility or amounts', r.ok && getMS(m1.id).planned === daysFromNow(99) && getMS(m1.id).amount === 2000); }
{ const chk = scheduleCheck([{ name: 'a', pct: 33.33333333 }, { name: 'b', pct: 33.33333333 }, { name: 'c', pct: 33.33333334 }], 100000);
  E('E17 amounts typed as 33,333.33 + 33,333.33 + 33,333.34 pass the 100% check and total exactly', chk.ok && chk.total === 100000, chk); }
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ pct: 100, allowPartial: true })] }), m = msOf(po)[0];
  msReady(m); const a = sub(po, [ma(m, 6000)]), b = sub(po, [ma(m, 5000)]), c = sub(po, [ma(m, 4000)]);
  E('partial milestone: 6,000 + 4,000 ok, 5,000 over the remaining 4,000 blocked, then fully invoiced', a.ok && !b.ok && c.ok && msBilling(getMS(m.id), po) === 'Invoiced'); }
{ const po = mkPO({ billingMethod: 'Milestone', milestones: [msd({ needsGrn: true })] }), m = msOf(po)[0];
  const g = grn(po, 100, 0, 'accept', { milestoneId: m.id }); msReady(m); sub(po, [ma(m)]);
  const g2 = grn(po, 0.0001 + 0, 0, 'inspect');
  E('B8 a receipt cannot be linked to a milestone that is already invoiced', (() => { const r = A.msLinkReceipt(m.id, g2.id); return !r.ok && /already has invoices/.test(r.msg); })()); }

/* ---------- 5.3 invoice, concurrency and adjustments ---------- */
{ const po = mkPO(), g = grn(po, 20), key = 'idem-1';
  const a = sub(po, [ga(g, 5)], { idemKey: key, number: 'IDEM' }), b = sub(po, [ga(g, 5)], { idemKey: key, number: 'IDEM' });
  E('E22 double submit with the same key returns the first invoice (one record, one hold)', a.ok && b.ok && b.duplicate && a.id === b.id && invsOf(po).length === 1 && usage('grn', g.id).qty === 5); }
{ const po = mkPO(), g = grn(po, 20), snap = { ['grn:' + g.id]: 20 };
  sub(po, [ga(g, 15)], { number: 'OTHER' });                                     // someone else takes 15 meanwhile
  const r = sub(po, [ga(g, 20)], { snap, number: 'MINE' });
  E('E21/STALE balance changed while editing → refreshed-amounts message + the reason', !r.ok && /Balances changed while you were editing/.test(r.errors[0]) && /Eligible: 5/.test(r.errors.join(' ')), r.errors); }
{ const po = mkPO(), g = grn(po, 20);
  const r = A.saveInvoice({ poId: po.id, number: 'OLD', date: todayISO(), allocs: [ga(g, 5)], attachments: [], autoMatch: false }, 'submit'); const i = getInv(r.id);
  i.submittedAt = new Date(Date.now() - 30 * 36e5).toISOString();
  const held = usage('grn', g.id).qty, n = A.expireStaleInvoices();
  E('E23/UC31 stuck in matching > 24h → Matching Failed and the hold is released', held === 5 && n === 1 && getInv(i.id).status === 'Matching Failed' && usage('grn', g.id).qty === 0); }
{ const po = mkPO(), g = grn(po, 20), a = sub(po, [ga(g, 5)], { number: 'DUP-1' }), b = sub(po, [ga(g, 5)], { number: 'dup-1' });
  E('E24 duplicate bill number fails matching even though it fits the balance', a.ok && getInv(b.id).status === 'Matching Failed' && getInv(b.id).match.checks.find(c => c.key === 'dup').status === 'fail'); }
{ const po = mkPO(), g = grn(po, 20), a = getInv(sub(po, [ga(g, 5)], { number: 'RJ-1' }).id);
  A.rejectInvoice(a.id, 'wrong'); const b = sub(po, [ga(g, 5)], { number: 'RJ-1' });
  E('E24/E25 after rejection the supplier can resubmit with the same bill number; hold was released', b.ok && getInv(b.id).status === 'Pending Approval' && usage('grn', g.id).qty === 5); }
{ const po = mkPO(), g = grn(po, 30), a = getInv(sub(po, [ga(g, 30)], { gstManual: 1 }).id);
  E('E25 GST mismatch → Matching Failed and reservation released at once', a.status === 'Matching Failed' && usage('grn', g.id).qty === 0); }
{ const po = mkPO(), g = grn(po, 30), a = getInv(sub(po, [ga(g, 30)]).id);
  A.approveInvoice(a.id); A.postInvoice(a.id); A.addAdjustment(a.id, { type: 'Credit', amount: a.gross, reason: 'credit' });
  const stillUsed = usage('grn', g.id).qty;
  A.reverseInvoice(a.id, 'full reversal');
  E('E26/UC30 credit note alone restores nothing; a full reversal with reason releases the 30 units', stillUsed === 30 && usage('grn', g.id).qty === 0 && sourceItems(po).find(x => x.refId === g.id).availQty === 30); }

/* ---------- 5.4 amendment and financial rules ---------- */
{ const po = mkPO({ lines: [{ desc: 'A', qty: 100, uom: 'Units', price: 1000 }] }), g = grn(po, 60); sub(po, [ga(g, 60)]);
  const r = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 50, price: 1000 }], milestones: [], reason: 'cut' });
  E('E28/UC33 amend PO below invoices already submitted → rejected with the invoiced amount', !r.ok && /60,000/.test(r.errors.join(' ')), r.errors); }
{ const po = mkPO(), g = grn(po, 100), i = getInv(sub(po, [ga(g, 100)], { gstManual: 1200 }).id), gst = i.match.checks.find(c => c.key === 'gst');
  E('E29/UC36 invoice carrying 12% on an 18% PO fails the GST check; allocation released; supplier can correct', i.status === 'Matching Failed' && gst.status === 'fail' && usage('grn', g.id).qty === 0 && getInv(sub(po, [ga(g, 100)], { id: i.id, number: i.number }).id).status === 'Pending Approval'); }
{ const po = mkPO({ lines: [{ desc: 'A', qty: 100, uom: 'Units', price: 1000 }] }), g = grn(po, 100);
  sub(po, [ga(g, 95)]); const r = sub(po, [ga(g, 10)]);
  E('UC32 95,000 invoiced of 100,000 → 10 more units blocked (eligible 5)', !r.ok); }

/* ---------- flows: services, mixed, certified ---------- */
{ const po = mkPO({ type: 'Services', lines: [{ desc: 'Svc', qty: 1, uom: 'Lot', price: 100000 }] }), s = srn(po, 40000), i = getInv(sub(po, [{ kind: 'srn', refId: s.id, qty: null, value: 40000 }]).id);
  A.approveInvoice(i.id); A.postInvoice(i.id); const r = A.reverseSRN(s.id, 'service not rendered');
  E('Flow 8: SRN reversal withdraws entitlement; posted invoice preserved and flagged for AP review', r.ok && srnEnt(getSRN(s.id)) === 0 && getInv(i.id).status === 'Posted' && apReview(getInv(i.id)).amount === 40000); }
{ const po = mkPO({ type: 'Services', lines: [{ desc: 'Svc', qty: 1, uom: 'Lot', price: 100000 }], billingMethod: 'Milestone', milestones: [msd({ needsSrn: true })] }), m = msOf(po)[0];
  const s = srn(po, 100000, 'accept', { milestoneId: m.id }); msReady(m); const i = getInv(sub(po, [ma(m)]).id);
  A.reverseSRN(s.id, 'cancelled');
  E('E10 services: reversed SRN closes the milestone gate and fails the in-flight invoice', msEnt(getMS(m.id), po) === 0 && getInv(i.id).status === 'Matching Failed'); }
{ const po = mkPO({ type: 'Mixed', billingMethod: 'Milestone', lines: [{ desc: 'Pump', qty: 10, uom: 'Units', price: 1000, kind: 'Goods' }, { desc: 'Install', qty: 1, uom: 'Lot', price: 10000, kind: 'Services' }], milestones: [msd({ name: 'Both', needsGrn: true, needsSrn: true })] }), m = msOf(po)[0];
  const g = grn(po, 10, 0, 'accept', { lineId: po.lines[0].id, milestoneId: m.id }); msReady(m);
  const s = srn(po, 10000, 'inspect', { lineId: po.lines[1].id, milestoneId: m.id });
  const blocked = !sub(po, [ma(m)]).ok; A.acceptSRN(s.id);
  E('Mixed PO: milestone needs BOTH the accepted GRN and the accepted SRN', blocked && sub(po, [ma(m)]).ok); }
{ const po = mkPO({ type: 'Services', lines: [{ desc: 'Svc', qty: 1, uom: 'Lot', price: 100000 }], progressBasis: 'Certified' });
  const c1 = A.createClaim({ poId: po.id, period: 'M1', claimedCum: 30000, evidence: ['a'] }); A.certifyClaim(c1.id, 30000);
  const c2 = A.createClaim({ poId: po.id, period: 'M2', claimedCum: 50000, evidence: ['a'] });
  const dup = A.createClaim({ poId: po.id, period: 'M3', claimedCum: 60000, evidence: ['a'] });
  A.certifyClaim(c2.id, 15000);
  const over = sub(po, [{ kind: 'claim', refId: c2.id, qty: null, value: 20000 }]), okv = sub(po, [{ kind: 'claim', refId: c2.id, qty: null, value: 15000 }]);
  E('UC34/UC35/E27 certified 45k of 50k claim: entitlement 15,000; a second open claim is blocked; 20,000 invoice blocked', !dup.ok && !over.ok && okv.ok); }
{ const po = mkPO({ billingMethod: 'Standard' }), g = grn(po, 50);
  const a = sub(po, [], { net: 5000 }), b = sub(po, [], { net: 1 });
  E('Standard: invoice up to accepted value, nothing beyond', a.ok && !b.ok); }

console.log(efails ? `\nEDGE: ${efails} of ${ecount} FAILED` : `\nEDGE ALL PASSED (${ecount} checks)`);
