/* Milestone-billing specification suite: line-scoped schedules (S01-S08), gates, advances (A01-A15), recovery ledger, multi-line intake, reports.
   Runs after core + logic + advances + seed in one context (see build-and-run.js). */
let sfails = 0, scount = 0;
const S = (name, ok, extra) => { scount++; if (!ok) sfails++; console.log((ok ? 'PASS ' : 'FAIL ') + 'SPEC ' + name + (ok || extra === undefined ? '' : '  :: ' + JSON.stringify(extra))); };
const lineDef = (desc, qty, price, o = {}) => ({ desc, qty, uom: o.uom || 'Units', price, kind: o.kind || 'Goods', outside: !!o.outside });
const sc = (line, basis, v) => ({ lineIdx: line, basis, v });
/* build a PO from a compact definition; milestones reference lines by index */
function mk(o) {
  const lines = o.lines.map(l => ({ ...l }));
  ensureLineIds(lines);
  const d = { id: null, supplierId: 'sup1', buyer: 'DICE', office: 'o-6225', title: 'Spec PO', poDate: todayISO(), deliveryDate: daysFromNow(30), endDate: '', type: o.type || 'Goods', category: 'Corporate Assets', gstRate: 18, billingMethod: 'Milestone', progressBasis: 'Receipt', lines, settings: o.settings,
    milestones: o.ms.map(m => ({ name: m.name || 'M', pct: m.pct, planned: daysFromNow(10), allowPartial: !!m.partial, ...m, scope: m.scope && m.scope.map(x => ({ lineId: lines[x.lineIdx].id, basis: x.basis, ...(x.basis === 'quantity' ? { qty: x.v } : x.basis === 'percent' ? { percent: x.v } : { amount: x.v }) })) })) };
  const r = A.savePO(d, true);
  if (!r.ok) return { err: r.errors };
  if (!A.approvePO(r.id).ok) return { err: ['approve'] };
  return { po: getPO(r.id) };
}
const draftOnly = o => { const lines = o.lines.map(l => ({ ...l })); ensureLineIds(lines); return buildSchedule(lines, o.ms.map(m => ({ name: 'M', ...m, scope: m.scope && m.scope.map(x => ({ lineId: lines[x.lineIdx].id, basis: x.basis, ...(x.basis === 'quantity' ? { qty: x.v } : x.basis === 'percent' ? { percent: x.v } : { amount: x.v }) })) }))); };
let bn = 0;
const subm = (po, allocs, extra = {}) => A.saveInvoice({ poId: po.id, number: extra.number || 'S-' + (++bn), date: todayISO(), allocs, attachments: [], net: extra.net, ...extra }, 'submit');
const approveMs = (m, files = ['f.pdf']) => { A.msStart(m.id); A.msSubmit(m.id, { actualDate: todayISO(), files }); return A.msApprove(m.id); };
const gr = (po, lineIdx, rec, rej = 0, mode = 'accept', extra = {}) => { const r = A.createGRN({ poId: po.id, lineId: po.lines[lineIdx].id, date: todayISO(), received: rec, rejected: rej, ...extra }, mode); if (!r.ok) throw new Error('grn ' + JSON.stringify(r.errors)); return getGRN(r.id); };
const sr = (po, lineIdx, v, mode = 'accept', extra = {}) => { const r = A.createSRN({ poId: po.id, lineId: po.lines[lineIdx].id, date: todayISO(), description: 'svc', serviceValue: v, ...extra }, mode); if (!r.ok) throw new Error('srn ' + JSON.stringify(r.errors)); return getSRN(r.id); };
const nc = x => String(x).replace(/(\d),(?=\d)/g, '$1');
const ma = (m, v) => ({ kind: 'milestone', refId: m.id, qty: null, value: v ?? m.amount });

/* ---------- 4-5. line-scoped schedules and coverage (S01-S04) ---------- */
seedDb('default');
const WORKED = [lineDef('Rack servers', 10, 300000), lineDef('Network switches', 20, 50000), lineDef('Installation and commissioning', 50, 20000, { kind: 'Services', uom: 'days' }), lineDef('Network consumables', 100, 500, { outside: true })];
{ const sch = draftOnly({ lines: WORKED, ms: [{ scope: [sc(2, 'quantity', 10)] }, { scope: [sc(0, 'quantity', 10), sc(1, 'quantity', 20)] }, { scope: [sc(2, 'quantity', 30)] }, { scope: [sc(2, 'quantity', 10)] }] });
  S('5.3 worked distribution: 200,000 · 4,000,000 · 600,000 · 200,000 = 5,000,000 (outside line excluded)', sch.ok && sch.amounts.join() === '200000,4000000,600000,200000' && sch.base === 5000000, sch.errors); }
{ const sch = draftOnly({ lines: WORKED, ms: [{ scope: [sc(2, 'quantity', 10)] }, { scope: [sc(0, 'quantity', 10), sc(1, 'quantity', 15)] }, { scope: [sc(2, 'quantity', 30)] }] });
  S('S01 line not fully assigned: names the line and the shortfall', !sch.ok && sch.errors.some(e => /L2 \(Network switches\) has 5 of 20 Units not assigned to any milestone/.test(e)) && sch.errors.some(e => /L3.*10 of 50 days not assigned/.test(e)), sch.errors); }
{ const sch = draftOnly({ lines: WORKED, ms: [{ scope: [sc(2, 'quantity', 30)] }, { scope: [sc(0, 'quantity', 10), sc(1, 'quantity', 20), sc(2, 'quantity', 25)] }] });
  S('S02 line over-assigned: "L3 is assigned 55 of 50 days"', sch.errors.some(e => /L3 \(Installation and commissioning\) is assigned 55 of 50 days\. Reduce the scope on a milestone by 5 days/.test(e)), sch.errors); }
{ const sch = draftOnly({ lines: WORKED, ms: [{ scope: [sc(0, 'quantity', 5), sc(1, 'quantity', 20), sc(2, 'quantity', 50)] }, { scope: [sc(0, 'percent', 50)] }] });
  S('S03 quantity and percent rows mixed on one line are blocked', sch.errors.some(e => /L1.*mixes quantity and % of line rows across milestones; use one basis per line/.test(e)), sch.errors); }
{ const sch = draftOnly({ lines: WORKED, ms: [{ scope: [sc(3, 'quantity', 10), sc(0, 'quantity', 10), sc(1, 'quantity', 20), sc(2, 'quantity', 50)] }] });
  S('S04 a line billed outside the schedule cannot carry scope; the milestone is named', sch.errors.some(e => /L4.*billed outside the schedule but M1 has scope on it/.test(e)), sch.errors); }
{ const sch = draftOnly({ lines: WORKED, ms: [{ scope: [sc(0, 'quantity', 10), sc(0, 'quantity', 0), sc(1, 'quantity', 20), sc(2, 'quantity', 50)] }] });
  S('a line listed twice, or a zero slice, is an error', sch.errors.some(e => /appears twice/.test(e)) && sch.errors.some(e => /must be greater than zero/.test(e))); }
{ const sch = draftOnly({ lines: [lineDef('Lump sum', 1, 1000000, { kind: 'Services' })], ms: [{ scope: [sc(0, 'amount', 200000)] }, { scope: [sc(0, 'amount', 600000)] }, { scope: [sc(0, 'amount', 200000)] }] });
  S('amount basis: 200,000 + 600,000 + 200,000 reconciles to the 1,000,000 line', sch.ok && sch.amounts.join() === '200000,600000,200000'); }
{ const sch = draftOnly({ lines: [lineDef('Instrument', 3, 33333.33)], ms: [{ scope: [sc(0, 'percent', 33.33333333)] }, { scope: [sc(0, 'percent', 33.33333333)] }, { scope: [sc(0, 'percent', 33.33333334)] }] });
  S('percent basis: the last slice absorbs rounding so milestones total the line exactly', sch.ok && r2(sum(sch.amounts, x => x)) === r2(3 * 33333.33), sch.amounts); }
{ const sch = draftOnly({ lines: [lineDef('Instrument', 1, 1038450)], ms: [{ scope: [sc(0, 'percent', 70)] }, { scope: [sc(0, 'percent', 30)] }] });
  S('NML pattern: 70% / 30% of one line = 726,915 + 311,535', sch.ok && sch.amounts.join() === '726915,311535'); }
{ const sch = draftOnly({ lines: [lineDef('Goods', 10, 1000), lineDef('Erection', 1, 50000, { kind: 'Services' })], ms: [{ scope: [sc(0, 'percent', 80)] }, { scope: [sc(0, 'percent', 20), sc(1, 'percent', 100)] }] });
  S('BHEL pattern: M2 spans 20% of the goods line and 100% of the service line', sch.ok && sch.amounts.join() === '8000,52000', sch.errors); }
{ const r = mk({ lines: WORKED, ms: [{ name: 'a', scope: [sc(0, 'quantity', 10), sc(1, 'quantity', 20), sc(2, 'quantity', 50)] }] });
  S('a saved PO stores derived amounts; the outside line is excluded from the base', r.po && msOf(r.po)[0].amount === 5000000 && msOf(r.po)[0].scope.length === 3 && r.po.lines[3].outside === true, r.err); }
{ const r = mk({ lines: [lineDef('A', 10, 100, { outside: true })], ms: [{ name: 'x', pct: 100 }] });
  S('every line outside the schedule → nothing to schedule', !!r.err && r.err.some(e => /every line is billed outside/.test(e)), r.err); }

/* ---------- 6. gates, receipts on slices (S05-S08) ---------- */
{ const r = mk({ lines: [lineDef('Servers', 10, 1000)], ms: [{ name: 'Delivery', scope: [sc(0, 'quantity', 10)], partial: true }] }), po = r.po, m = msOf(po)[0];
  const g1 = gr(po, 0, 6, 0, 'accept', { milestoneId: m.id }); approveMs(m);
  S('6.1 quantity slice: 6 of 10 accepted → 6,000 eligible, no fabricated receipt', msEnt(getMS(m.id), po) === 6000 && msBilling(getMS(m.id), po) === 'Eligible');
  S('7.1 invoice up to the accepted 6,000; 7,000 refused with the slice message', subm(po, [ma(m, 6000)]).ok && !subm(po, [ma(m, 1000)]).ok);
  const g2 = gr(po, 0, 4, 0, 'accept', { milestoneId: m.id });
  S('second shipment accepted → remaining 4,000 eligible', msEnt(getMS(m.id), po) === 10000 && sourceItems(po).find(x => x.refId === m.id).availValue === 4000);
}
{ const r = mk({ lines: [lineDef('Servers', 10, 1000)], ms: [{ name: 'M2a', scope: [sc(0, 'quantity', 6)] }, { name: 'M2b', scope: [sc(0, 'quantity', 4)] }] }), po = r.po, [a, b] = msOf(po);
  gr(po, 0, 7, 0, 'accept', { milestoneId: a.id }); approveMs(a); approveMs(b);
  S('S06 no auto spill-over: 7 servers against a planned 6 → M2a counts 6, the 7th does not move to M2b', msEnt(getMS(a.id), po) === 6000 && msEnt(getMS(b.id), po) === 0, [msEnt(getMS(a.id), po), msEnt(getMS(b.id), po)]); }
{ const r = mk({ lines: [lineDef('Servers', 10, 1000)], ms: [{ name: 'M2a', scope: [sc(0, 'quantity', 6)] }, { name: 'M2b', scope: [sc(0, 'quantity', 4)] }] }), po = r.po, [a, b] = msOf(po);
  const g = gr(po, 0, 10); approveMs(a); approveMs(b);
  const l1 = A.msLinkReceipt(a.id, g.id, false, { cap: 6 }), l2 = A.msLinkReceipt(b.id, g.id, false, { cap: 4 });
  S('one GRN of 10 can back M2a (6) and M2b (4) when every link has an explicit quantity', l1.ok && l2.ok && msEnt(getMS(a.id), po) === 6000 && msEnt(getMS(b.id), po) === 4000, [l1.msg, l2.msg]);
  S('no unit backs two slices: links over the receipt quantity are refused', !A.msLinkReceipt(b.id, g.id, false, { cap: 1 }).ok); }
{ const r = mk({ lines: [lineDef('Servers', 10, 1000), lineDef('Cable', 5, 100)], ms: [{ name: 'M1', scope: [sc(0, 'quantity', 10)] }, { name: 'M2', scope: [sc(1, 'quantity', 5)] }] }), po = r.po, [a, b] = msOf(po);
  const gc = gr(po, 1, 5, 0, 'accept'); const l = A.msLinkReceipt(a.id, gc.id);
  S('S07 a receipt for a line not in the milestone scope is refused', !l.ok && /not in the scope of M1/.test(l.msg), l.msg);
  const e = A.createGRN({ poId: po.id, lineId: po.lines[1].id, date: todayISO(), received: 1, rejected: 0, milestoneId: a.id }, 'accept');
  S('S07 creating the GRN from the wrong milestone is refused too', !e.ok && /not in the scope/.test(e.errors.join(' '))); }
{ const r = mk({ lines: [lineDef('Servers', 10, 1000)], ms: [{ name: 'Delivery', scope: [sc(0, 'quantity', 10)], complete: true, requireCompleteQty: true }] }), po = r.po, m = msOf(po)[0];
  gr(po, 0, 6, 0, 'accept', { milestoneId: m.id }); approveMs(m);
  const r1 = subm(po, [ma(m, 6000)]);
  S('S05 requireCompleteQty: 6 of 10 accepted → Not Eligible with the units still to accept', msBilling(getMS(m.id), po) === 'Not Eligible' && !r1.ok && /4 of 10 Units of Servers still to accept/.test(msGate(getMS(m.id), po).reason), msGate(getMS(m.id), po).reason);
  gr(po, 0, 4, 0, 'accept', { milestoneId: m.id });
  S('S05 after the remaining units are accepted the milestone is billable in full', msEnt(getMS(m.id), po) === 10000 && subm(po, [ma(m)]).ok); }
{ const r = mk({ lines: [lineDef('Servers', 10, 1000)], ms: [{ name: 'Delivery', scope: [sc(0, 'quantity', 10)] }] }), po = r.po, m = msOf(po)[0];
  gr(po, 0, 6, 0, 'accept', { milestoneId: m.id }); approveMs(m); const x = subm(po, [ma(m)]);
  S('quantity milestone without partial invoicing: 6 of 10 accepted → blocked ("billed once, in full")', !x.ok && /billed once, in full/.test(x.errors.join(' ')), x.errors); }
{ const r = mk({ lines: [lineDef('Servers', 10, 1000)], ms: [{ name: 'Delivery', scope: [sc(0, 'percent', 100)], needsGrn: true }] }), po = r.po, m = msOf(po)[0];
  const g = gr(po, 0, 10, 0, 'inspect', { milestoneId: m.id }); approveMs(m);
  S('percent slice needs an accepted receipt (pending inspection blocks)', msEnt(getMS(m.id), po) === 0 && /pending inspection/.test(msGate(getMS(m.id), po).reason));
  A.acceptGRN(g.id); S('…and is billable in full once the GRN is accepted', msEnt(getMS(m.id), po) === 10000); }

/* ---------- guarantee gate (NML pattern) and document gate ---------- */
{ const r = mk({ lines: [lineDef('Instrument', 1, 1000000)], ms: [{ name: 'Commissioning', pct: 100, needsDoc: true, docTitle: 'Commissioning certificate', needsGuarantee: true, guaranteeTitle: 'Performance bank guarantee' }] }), po = r.po, m = msOf(po)[0];
  A.msStart(m.id); A.msSubmit(m.id, { actualDate: todayISO(), files: ['cert.pdf'] }); A.msApprove(m.id);
  S('document approved but guarantee not uploaded → Not Eligible naming the guarantee', msEnt(getMS(m.id), po) === 0 && /performance bank guarantee has not been uploaded/i.test(msGate(getMS(m.id), po).reason), msGate(getMS(m.id), po).reason);
  const up = A.msUploadGuarantee(m.id, { bank: 'SBI', amount: 30000, validUntil: daysFromNow(90), files: ['bg.pdf'] });
  S('uploaded but unverified → still blocked (awaiting Finance)', up.ok && msEnt(getMS(m.id), po) === 0 && /awaiting Finance verification/.test(msGate(getMS(m.id), po).reason));
  S('the uploader\'s role cannot verify its own guarantee (segregation of duties)', (() => { db.meta.settings = { adminExemptFromSod: false }; const o = A.msVerifyGuarantee(m.id); db.meta.settings = {}; return !o.ok; })());
  const v = A.msVerifyGuarantee(m.id);
  S('Finance verifies → billable', v.ok && msEnt(getMS(m.id), po) === 1000000);
  const inv = subm(po, [ma(m)]); getMS(m.id).guarantee.validUntil = daysFromNow(-1);
  S('an expired guarantee reopens the gate', gState(getMS(m.id).guarantee) === 'Expired' && msEnt(getMS(m.id), po) === 0);
  const n = A.expireGuarantees();
  S('expiry sweep re-matches the unposted invoice that relied on it', n === 1 && getInv(inv.id).status === 'Matching Failed' && usage('milestone', m.id).value === 0, getInv(inv.id).status);
  A.msUploadGuarantee(m.id, { bank: 'SBI', amount: 30000, validUntil: daysFromNow(200), files: ['bg2.pdf'] }); A.msVerifyGuarantee(m.id);
  S('a replacement guarantee (v2) restores eligibility', getMS(m.id).guarantee.version === 2 && msEnt(getMS(m.id), po) === 1000000);
  const rv = A.msRevokeDoc(m.id, 'certificate was for the wrong site');
  S('6.4 document approval withdrawn later → gate reopens like a reversed receipt', rv.ok && msEnt(getMS(m.id), po) === 0 && docState(getMS(m.id)) === 'Rejected'); }

/* ---------- dependencies ---------- */
{ const r = mk({ lines: [lineDef('X', 10, 1000)], settings: { enforceDependencies: true }, ms: [{ name: 'M1', pct: 50 }, { name: 'M2', pct: 50, dependsOn: ['M1'] }] }), po = r.po, [a, b] = msOf(po);
  A.msStart(b.id); A.msSubmit(b.id, { actualDate: todayISO() }); const ap = A.msApprove(b.id);
  S('E16 enforceDependencies: M2 cannot be approved before its prerequisite M1 is invoiced', !ap.ok && /depends on M1/.test(ap.msg), ap.msg);
  approveMs(a); subm(po, [ma(a)]); const ap2 = A.msApprove(b.id);
  S('…and can once M1 is invoiced', ap2.ok && msEnt(getMS(b.id), po) === 5000); }
{ const r = mk({ lines: [lineDef('X', 10, 1000)], ms: [{ name: 'M1', pct: 50 }, { name: 'M2', pct: 50, dependsOn: ['M1'] }] }), po = r.po, [a, b] = msOf(po);
  A.msStart(b.id); A.msSubmit(b.id, { actualDate: todayISO() }); const ap = A.msApprove(b.id);
  S('advisory by default: approval proceeds with an "out of sequence" warning naming M1', ap.ok && /Out of sequence: M1 is not invoiced yet/.test(ap.msg), ap.msg); }

/* ---------- 8. advances ---------- */
const ADV = { allowed: true, mode: 'percent', value: 25, recovery: 'proportional', guaranteeRequired: true, guaranteeTitle: 'Advance payment guarantee' };
/* PO 5,000,000: M1 20% (1,000,000) + M2 80% (4,000,000) carrying the 25% advance = 1,000,000 = exactly the 20% PO cap */
function advPO(extra = {}) {
  const r = mk({ lines: [lineDef('Goods', 100, 50000)], settings: extra.settings, ms: [{ name: 'M1', pct: 20 }, { name: 'M2', pct: 80, allowPartial: true, needsGrn: !!extra.grn, advance: extra.advance || ADV }] });
  return { po: r.po, m: msOf(r.po)[1], err: r.err };
}
function paidAdvance(po, m, base = 1000000) {
  const rq = A.requestAdvance({ poId: po.id, msId: m.id, base, tdsPct: 0 }); A.approveAdvance(rq.id);
  const a = getAdv(rq.id); if (a.guaranteeRequired) { A.advUploadGuarantee(a.id, { bank: 'HDFC', amount: base, validUntil: daysFromNow(200), files: ['g.pdf'] }); A.advVerifyGuarantee(a.id); }
  const iv = subm(po, [{ kind: 'advance', refId: a.id, qty: null, value: a.base }], { number: 'ADV-' + (++bn) }); A.approveInvoice(iv.id); A.postInvoice(iv.id); A.payInvoice(iv.id);
  return { a: getAdv(a.id), iv: getInv(iv.id) };
}
{ const { po, m, err } = advPO();
  S('seeded advance PO builds (25% of M2 = 20% of the scheduled value)', !!po && m.amount === 4000000 && advTermAmount(m) === 1000000, err);
  S('4.4 advance terms above the milestone cap are rejected at save', (() => { const r = mk({ lines: [lineDef('G', 10, 1000)], ms: [{ name: 'M', pct: 100, advance: { ...ADV, value: 35 } }] }); return !!r.err && /exceeds the 30% cap/.test(r.err.join(' ')); })());
  S('PO cap: advances above 20% of the scheduled value are rejected at save', (() => { const r = mk({ lines: [lineDef('G', 10, 1000)], ms: [{ name: 'A', pct: 50, advance: { ...ADV, value: 30 } }, { name: 'B', pct: 50, advance: { ...ADV, value: 30 } }] }); return !!r.err && /exceed the 20% PO cap/.test(r.err.join(' ')); })());
  S('A14 a Progressive PO offers no advance', (() => { const r = mk({ lines: [lineDef('G', 10, 1000)], ms: [{ name: 'M', pct: 100 }] }); const x = getPO(r.po.id); x.billingMethod = 'Progressive'; return !A.requestAdvance({ poId: x.id, msId: 'x', base: 1 }).ok; })());
  const big = A.requestAdvance({ poId: po.id, msId: m.id, base: 1500000, tdsPct: 0 });
  S('A01 request above the milestone cap: "Advance of … exceeds the 30% cap (INR 1,200,000) on M2"', !big.ok && /Advance of INR 1500000 exceeds the 30% cap \(INR 1200000\) on M2/.test(nc(big.errors.join(' '))), big.errors);
  S('A15 a milestone without advance terms cannot take an advance', !A.requestAdvance({ poId: po.id, msId: msOf(po)[0].id, base: 10 }).ok);
  const rq = A.requestAdvance({ poId: po.id, msId: m.id, base: 1000000, tdsPct: 2, remarks: 'r' }), a = getAdv(rq.id);
  S('request computes GST (taxed_on_advance), TDS and payable: 1,000,000 + 180,000 − 20,000', rq.ok && a.gst === 180000 && a.tds === 20000 && a.total === 1180000 && a.payable === 1160000 && advStatus(a) === 'Requested', a);
  const dup = A.requestAdvance({ poId: po.id, msId: m.id, base: 100, tdsPct: 0 });
  S('A03 second advance while the first is open is blocked, naming it', !dup.ok && /ADV-001 on M2 is still Requested/.test(dup.msg), dup.msg);
  db.meta.settings = { adminExemptFromSod: false }; const self = A.approveAdvance(a.id); db.meta.settings = {};
  S('requester cannot approve their own advance (segregation of duties)', !self.ok && /Segregation of duties/.test(self.msg));
  const ap = A.approveAdvance(a.id);
  S('approved with a guarantee required → status Guarantee pending', ap.ok && advStatus(getAdv(a.id)) === 'Guarantee pending');
  const early = subm(po, [{ kind: 'advance', refId: a.id, qty: null, value: a.base }]);
  S('A04 no advance invoice while the guarantee is unverified', !early.ok && /not invoice-eligible/.test(early.errors.join(' ')), early.errors);
  A.advUploadGuarantee(a.id, { bank: 'HDFC', amount: 1000000, validUntil: daysFromNow(200), files: ['g.pdf'] }); A.advVerifyGuarantee(a.id);
  S('verified → Approved', advStatus(getAdv(a.id)) === 'Approved');
  const iv = subm(po, [{ kind: 'advance', refId: a.id, qty: null, value: a.base }], { number: 'ADV-INV' });
  S('advance invoice: net 1,000,000, GST 180,000, gross 1,180,000, payable after TDS 1,160,000', iv.ok && getInv(iv.id).gst === 180000 && getInv(iv.id).gross === 1180000 && payable(getInv(iv.id)) === 1160000, getInv(iv.id));
  S('the advance invoice needs no receipt or milestone completion', getMS(m.id).status === 'Pending' && getInv(iv.id).status === 'Pending Approval');
  S('PO consumption counts the advance once (I + O): PO 5,000,000 → 4,000,000 remaining', poConsumed(po) === 1000000 && poSummary(po).remainingPO === 4000000, [poConsumed(po), poSummary(po).remainingPO]);
  S('a second invoice cannot reuse the advance (duplicate allocation)', !subm(po, [{ kind: 'advance', refId: a.id, qty: null, value: a.base }], { number: 'ADV-DUP' }).ok);
  S('an advance invoice cannot be mixed with milestone lines', !subm(po, [{ kind: 'advance', refId: a.id, qty: null, value: a.base }, ma(msOf(po)[0])], { number: 'ADV-MIX' }).ok);
  S('A11 reject the advance invoice before payment → hold released, advance returns to Approved', A.rejectInvoice(iv.id, 'wrong bank').ok && advStatus(getAdv(a.id)) === 'Approved' && poConsumed(po) === 0); }

/* the spec's ledger: milestone A = 4,000,000, 25% advance = 1,000,000, proportional recovery */
function ledger(mode) {
  const { po, m } = advPO({ settings: { advanceGstMode: mode } });
  approveMs(m); const { a } = paidAdvance(po, m);
  return { po, m, a };
}
for (const mode of ['taxed_on_advance', 'taxed_at_final']) {
  const { po, m, a } = ledger(mode); const gstOn = mode === 'taxed_on_advance';
  const advInv = advInvoiceOf(a);
  S(`8.6 ${mode}: advance invoice gross ${gstOn ? '1,180,000' : '1,000,000'}`, advInv.gross === (gstOn ? 1180000 : 1000000), advInv.gross);
  const b = subm(po, [ma(m, 2350000)], { number: 'INV-B-' + mode }), ib = getInv(b.id);
  S(`8.6 ${mode}: INV-B recovers 587,500 (2,350,000 × 1,000,000 ÷ 4,000,000); cash ${gstOn ? '2,079,750' : '2,185,500'}`, b.ok && ib.recovery.net === 587500 && ib.gross === 2773000 && payable(ib) === (gstOn ? 2079750 : 2185500), [b.errors, ib.recovery, ib.gross, payable(ib)]);
  S('8.6 after INV-B: O = 412,500 · I = 2,350,000 · consumed I + O = 2,762,500 · cash still to pay on the milestone 1,237,500', advO(getAdv(a.id)) === 412500 && poConsumed(po) === 2762500 && r2((m.amount - 2350000) - 412500) === 1237500, [mode, advO(getAdv(a.id)), poConsumed(po), ib.status, advInvoiceOf(getAdv(a.id)).status, ib.match && ib.match.checks.filter(c => c.status !== 'pass')]);
  A.approveInvoice(ib.id); A.postInvoice(ib.id);
  const c = subm(po, [ma(m, 1650000)], { number: 'INV-C-' + mode }), ic = getInv(c.id);
  S(`8.6 ${mode}: the last invoice recovers all remaining O (412,500); cash ${gstOn ? '1,460,250' : '1,534,500'}`, c.ok && ic.recovery.net === 412500 && payable(ic) === (gstOn ? 1460250 : 1534500), [c.errors, ic.recovery, payable(ic)]);
  A.approveInvoice(ic.id); A.postInvoice(ic.id); A.payInvoice(ic.id); A.payInvoice(ib.id);
  const totalCash = r2(advInv.gross + payable(ib) + payable(ic));
  S(`8.6 ${mode}: advance paid = advance recovered (Recovered); cash over the three invoices = 4,720,000 = milestone gross`, advO(getAdv(a.id)) === 0 && advStatus(getAdv(a.id)) === 'Recovered' && totalCash === 4720000 && poConsumed(po) === 4000000, [advO(getAdv(a.id)), totalCash]);
}
{ const { po, m, a } = ledger('taxed_on_advance');
  const x = subm(po, [ma(m, 1000000)], { number: 'X1' + bn }), y = getInv(x.id);
  S('A06/8.4 recovery = invoice net × P ÷ A = 250,000 and never above the invoice net', y.recovery.net === 250000 && advO(getAdv(a.id)) === 750000, y.recovery);
  const small = subm(po, [ma(m, 100)], { number: 'X2' }), z = getInv(small.id);
  S('a tiny invoice recovers proportionally (25 of 100); the rest stays in O', z.recovery.net === 25 && z.recovery.items[0].shortfall === 749975, z.recovery);
  const rj = A.rejectInvoice(x.id, 'bad');
  S('rejecting a milestone invoice releases its recovery and restores O', rj.ok && advO(getAdv(a.id)) === 999975);
  A.approveInvoice(small.id); A.postInvoice(small.id);
  const cancelAdv = A.reverseInvoice(advInvoiceOf(getAdv(a.id)).id, 'x');
  S('a paid advance invoice cannot be reversed while later invoices already recovered it', !cancelAdv.ok && /already recovered/.test(cancelAdv.msg), cancelAdv.msg); }
{ const { po, m, a } = ledger('taxed_on_advance');
  const rf = A.refundAdvance(a.id, { amount: 400000, reason: 'order reduced' });
  S('refund returns part of the unused advance: O = 600,000, consumption falls', rf.ok && advO(getAdv(a.id)) === 600000 && poConsumed(po) === 600000, rf.msg);
  S('A09 cancelling the milestone is blocked while an advance is outstanding ("Refund the advance first")', (() => { const r = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 100, price: 50000 }], milestones: [{ id: m.id, remove: true }], reason: 'cancel' }); return !r.ok && /Refund the advance first/.test(r.errors.join(' ')); })());
  const rf2 = A.refundAdvance(a.id, { reason: 'rest' });
  S('refunding the rest closes the advance (Refunded) and frees the milestone', rf2.ok && advStatus(getAdv(a.id)) === 'Refunded' && poConsumed(po) === 0);
  S('A12 a credit note on the advance invoice does not reduce P', (() => { const ai = advInvoiceOf(getAdv(a.id)); A.addAdjustment(ai.id, { type: 'Credit', amount: 1000, reason: 'x' }); return advP(getAdv(a.id)) === 1000000; })()); }
{ const { po, m } = advPO({ grn: true }); approveMs(m);
  const { a } = paidAdvance(po, m); gr(po, 0, 100, 0, 'accept', { milestoneId: m.id }); const i = subm(po, [ma(m, 3000000)]); A.approveInvoice(i.id); A.postInvoice(i.id);
  A.reverseGRN(db.grns.find(g => g.poId === po.id).id, 'goods returned');
  const f = apReview(getInv(i.id));
  S('A10 receipt reversed after recovery: recovery stays; AP review item shows I + O above entitlement', getInv(i.id).recovery.net > 0 && f && f.amount > 0 && reviewItems().some(x => x.inv.id === i.id), f); }
{ const { po, m } = advPO(); approveMs(m);
  const r = A.amendMilestone(po.id, m.id, { scope: [{ lineId: po.lines[0].id, basis: 'percent', percent: 100 }], name: 'x' }, 'test');
  S('A08/E18 an approved milestone cannot have its scope amended', !r.ok && /locked/.test(r.msg)); }
{ const { po, m } = advPO(); paidAdvance(po, m);
  const am = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 15, price: 50000 }], milestones: [], reason: 'cut quantity' });
  S('E28 PO value cannot fall below invoiced value plus the unrecovered advance (1,000,000 consumed)', !am.ok && /cannot be lower than invoices already submitted \(INR 1000000/.test(nc(am.errors.join(' '))), am.errors); }

/* ---------- PO amendments on a scoped schedule (S08, reallocation) ---------- */
{ const r = mk({ lines: [lineDef('Servers', 10, 1000), lineDef('Install', 10, 500, { kind: 'Services' })], ms: [{ name: 'M1', scope: [sc(0, 'quantity', 6), sc(1, 'quantity', 10)] }, { name: 'M2', scope: [sc(0, 'quantity', 4)] }] }), po = r.po, [m1, m2] = msOf(po);
  const q = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 12, price: 1000 }, { id: po.lines[1].id, qty: 10, price: 500 }], milestones: [], reason: 'two more servers' });
  S('S08 line quantity amended up: the schedule reopens with the unassigned difference named', q.ok && getPO(po.id).scheduleOpen && /L1 \(Servers\) has 2 of 12 Units not assigned/.test(getPO(po.id).scheduleOpen[0]), getPO(po.id).scheduleOpen);
  const mv = A.amendMilestone(po.id, m2.id, { scope: [{ lineId: po.lines[0].id, basis: 'quantity', qty: 6 }] }, 'assign the two extra servers');
  S('reallocation: assigning the difference to M2 closes the reopened schedule and creates a new version', mv.ok && getPO(po.id).scheduleOpen === null && getPO(po.id).version === 3 && getMS(m2.id).amount === 6000, mv.errors);
  const over = A.amendMilestone(po.id, m2.id, { scope: [{ lineId: po.lines[0].id, basis: 'quantity', qty: 9 }] }, 'too many');
  S('S02 amendment that over-assigns a line is blocked', !over.ok && /is assigned 15 of 12/.test(over.errors.join(' ')), over.errors);
  const add = A.amendAddMilestone(po.id, { name: 'M3 extra', scope: [] }, 'x');
  S('a new milestone needs scope', !add.ok);
  const nm = A.amendAddMilestone(po.id, { name: 'Extra', needsDoc: true, docTitle: 'Handover', scope: [{ lineId: po.lines[1].id, basis: 'quantity', qty: 1 }] }, 'x');
  S('adding a milestone to a fully assigned line is refused (over-assigned)', !nm.ok && /is assigned 11 of 10/.test(nm.errors.join(' ')), nm.errors);
  approveMs(m1); const lk = A.amendMilestone(po.id, m1.id, { scope: [{ lineId: po.lines[0].id, basis: 'quantity', qty: 5 }] }, 'x');
  S('S06/E18 an approved or invoiced milestone\'s scope cannot be reallocated', !lk.ok && /locked/.test(lk.msg)); }

/* ---------- 7.5 multi-line invoice intake ---------- */
{ const r = mk({ type: 'Mixed', lines: WORKED, ms: [{ name: 'M1 survey', scope: [sc(2, 'quantity', 10)] }, { name: 'M2 equipment', scope: [sc(0, 'quantity', 10), sc(1, 'quantity', 20)], partial: true }, { name: 'M3 install', scope: [sc(2, 'quantity', 30)] }, { name: 'M4 uat', scope: [sc(2, 'quantity', 10)] }] }), po = r.po, [m1, m2, m3, m4] = msOf(po);
  const s1 = sr(po, 2, 200000, 'accept', { milestoneId: m1.id }); approveMs(m1); subm(po, [ma(m1)], { number: 'A' });
  const g1 = gr(po, 0, 6, 0, 'accept', { milestoneId: m2.id }), g2 = gr(po, 1, 12, 1, 'accept', { milestoneId: m2.id }); approveMs(m2);
  const s3 = sr(po, 2, 360000, 'inspect', { milestoneId: m3.id }); approveMs(m3);
  gr(po, 3, 40, 0, 'accept');
  const rows = [
    { ref: 'L1', desc: 'Rack servers', qty: 6, rate: 300000, amount: 1800000 },
    { ref: 'L2', desc: 'Network switches', qty: 11, rate: 50000, amount: 550000 },
    { ref: 'L2', desc: 'Network switches', qty: 3, rate: 50000, amount: 150000 },
    { ref: 'L2', desc: 'Network switches', qty: 3, rate: 52000, amount: 156000 },
    { desc: 'Installation and commissioning rack and stack', qty: 18, rate: 20000, amount: 360000 },
    { desc: 'UAT and commissioning days', ref: 'L3', qty: 10, rate: 20000, amount: 200000, msId: m4.id },
    { desc: 'Consumables cable ties', ref: 'L4', qty: 20, rate: 500, amount: 10000 },
    { desc: 'Mystery parts', qty: 1, rate: 1000, amount: 1000 },
    { ref: 'L1', desc: 'Rack servers', qty: 6, rate: 300000, amount: 1800000 },
    { ref: 'L2', desc: 'switches tax test', qty: 1, rate: 50000, amount: 50000, taxRate: 12 },
  ];
  const res = matchInvoiceLines(po, rows, { number: 'SUP-77' }), by = n => res.rows.find(x => x.n === n);
  S('7.5 line 1 (6 servers) is Billable on M2', by(1).status === 'Billable' && by(1).msCode === 'M2' && by(1).billable === 1800000, by(1));
  S('7.5 line 2 (11 switches) is Billable; line 3 (3 more switches) is Waiting — over the 11 accepted', by(2).status === 'Billable' && by(3).status === 'Waiting' && /Over quantity|nothing more/.test(by(3).reason), [by(2), by(3)]);
  S('7.5 line 4 (switch at 52,000 vs PO 50,000) is Rejected on rate', by(4).status === 'Reject' && /Rate INR 52,000 differs from the PO rate INR 50,000/.test(by(4).reason), by(4).reason);
  S('7.5 line 5 matched by description to the services line: M1 is already fully billed (M3 SRN pending → Waiting)', ['Waiting', 'Reject'].includes(by(5).status), by(5));
  S('7.5 line 6 (UAT) override to M4: Waiting because M4 is not approved', by(6).status === 'Waiting' && /not approved/.test(by(6).reason), by(6));
  S('7.5 line 7 (consumable, outside the schedule) bills on its accepted receipt', by(7).status === 'Billable' && by(7).allocKind === 'receipt' && by(7).billable === 10000, by(7));
  S('7.5 line 8 (no match) is Rejected', by(8).status === 'Reject' && /No PO match/.test(by(8).reason));
  S('7.5 line 9 (repeat of line 1) is Rejected as a duplicate', by(9).status === 'Reject' && /Duplicate of line 1/.test(by(9).reason), by(9).reason);
  S('7.5 line 10 (12% tax against the PO\'s 18%) is Rejected', by(10).status === 'Reject' && /Tax rate 12%/.test(by(10).reason));
  S('groups, totals and a generated line-by-line return message', res.groups.Billable.length === 3 && res.billable === 2360000 && /Line 3 .*Waiting/.test(res.message) && res.allocs.some(a => a.kind === 'milestone' && a.value === 2350000) && res.allocs.some(a => a.kind === 'grn' && a.qty === 20), res.message);
  const sub = subm(po, res.allocs, { number: 'SUP-77' });
  S('the billable lines submit as one invoice (per-line slice limits validated)', sub.ok, sub.errors);
  const again = matchInvoiceLines(po, [rows[0]], {});
  S('re-running the same line after submission: M2 slice already billed → Rejected (already billed)', again.rows[0].status === 'Reject' && /Already billed/.test(again.rows[0].reason), again.rows[0]);
  S('over a slice by per-line allocation: invoice line above the slice remaining is blocked', (() => { const bad = subm(po, [{ kind: 'milestone', refId: m2.id, qty: null, value: 10, lines: [{ lineId: po.lines[0].id, value: 10 }] }], { number: 'BAD' }); return !bad.ok; })()); }
{ const r = mk({ lines: [lineDef('Pump', 10, 1000)], settings: { valueTolerancePct: 5 }, ms: [{ name: 'M', pct: 100, allowPartial: true }] }), po = r.po, m = msOf(po)[0];
  gr(po, 0, 10, 0, 'accept'); approveMs(m);
  const t = matchInvoiceLines(po, [{ ref: 'L1', desc: 'Pump', qty: 1, rate: 1040, amount: 1040 }, { ref: 'L1', desc: 'Pump', qty: 1, rate: 1100, amount: 1100 }]);
  S('valueTolerancePct 5%: a 4% rate difference passes, 10% is rejected', t.rows[0].status !== 'Reject' && t.rows[1].status === 'Reject'); }

/* ---------- real-life edge cases ---------- */
{ const r = mk({ lines: [lineDef('Goods', 10, 1000)], ms: [{ name: 'M', pct: 100, needsGrn: true }] }), po = r.po, m = msOf(po)[0];
  const past = A.createGRN({ poId: po.id, lineId: po.lines[0].id, date: daysFromNow(-3), received: 1, rejected: 0 }, 'accept'), fut = A.createGRN({ poId: po.id, lineId: po.lines[0].id, date: daysFromNow(2), received: 1, rejected: 0 }, 'accept');
  S('receipt dated before the PO or in the future is refused', !past.ok && /before the PO date/.test(past.errors.join(' ')) && !fut.ok && /in the future/.test(fut.errors.join(' ')), [past.errors, fut.errors]);
  A.msStart(m.id); const c1 = A.msSubmit(m.id, { actualDate: daysFromNow(3) }), c2 = A.msSubmit(m.id, { actualDate: daysFromNow(-5) });
  S('milestone completion date in the future or before the PO date is refused', !c1.ok && !c2.ok, [c1.errors, c2.errors]);
  gr(po, 0, 10, 0, 'accept', { milestoneId: m.id }); A.msSubmit(m.id, { actualDate: todayISO() }); A.msApprove(m.id);
  const f = A.saveInvoice({ poId: po.id, number: 'FUT', date: daysFromNow(1), allocs: [ma(m)], attachments: [] }, 'submit'), b = A.saveInvoice({ poId: po.id, number: 'OLD', date: daysFromNow(-9), allocs: [ma(m)], attachments: [] }, 'submit');
  S('bill date in the future or before the PO date is refused', !f.ok && /in the future/.test(f.errors.join(' ')) && !b.ok && /before the PO date/.test(b.errors.join(' ')), [f.errors, b.errors]); }
{ const { po, m } = advPO(); const rq = A.requestAdvance({ poId: po.id, msId: m.id, base: 1000000, tdsPct: 0 }); A.approveAdvance(rq.id);
  const low = A.advUploadGuarantee(rq.id, { bank: 'B', amount: 400000, validUntil: daysFromNow(100), files: ['g'] });
  S('an advance guarantee must cover the advance (400,000 against 1,000,000 refused)', !low.ok && /must cover the advance/.test(low.errors.join(' ')), low.errors);
  const old = A.advUploadGuarantee(rq.id, { bank: 'B', amount: 1000000, validUntil: daysFromNow(-1), files: ['g'] });
  S('a guarantee that is already expired is refused', !old.ok && /already expired/.test(old.errors.join(' '))); }
{ const r = mk({ lines: [lineDef('Goods', 100, 50000)], ms: [{ name: 'M1', pct: 20 }, { name: 'M2', pct: 80, advance: ADV, allowPartial: true }] }), po = r.po, m = msOf(po)[1];
  approveMs(m); subm(po, [ma(m)], { number: 'FULL' });
  const x = A.requestAdvance({ poId: po.id, msId: m.id, base: 100, tdsPct: 0 });
  S('no advance on a milestone that is already fully invoiced', !x.ok && /already fully invoiced/.test(x.msg), x.msg); }
{ const { po, m } = advPO(); paidAdvance(po, m);
  const r = A.amendMilestone(po.id, m.id, { scope: [{ lineId: po.lines[0].id, basis: 'percent', percent: 10 }] }, 'shrink');
  S('A08 a Pending milestone cannot be amended below its unrecovered advance', !r.ok, r.errors); }
{ const { po, m, a } = ledger('taxed_on_advance');
  const i = subm(po, [ma(m, 2000000)], { number: 'REV-' + (++bn) }); A.approveInvoice(i.id); A.postInvoice(i.id);
  const before = advO(getAdv(a.id)); const rv = A.reverseInvoice(i.id, 'wrong goods');
  S('reversing a posted milestone invoice releases its recovery: O is restored to 1,000,000', rv.ok && before === 500000 && advO(getAdv(a.id)) === 1000000, [before, advO(getAdv(a.id))]); }
{ const r = mk({ lines: [lineDef('Servers', 10, 1000)], ms: [{ name: 'A', scope: [sc(0, 'quantity', 6)] }, { name: 'B', scope: [sc(0, 'quantity', 4)] }] }), po = r.po, [a, b] = msOf(po);
  const g = gr(po, 0, 10); A.msLinkReceipt(a.id, g.id, false, { cap: 6 }); A.msLinkReceipt(b.id, g.id, false, { cap: 4 }); approveMs(a); approveMs(b);
  A.reverseGRN(g.id, 'returned to vendor');
  S('a GRN split across two milestones, then reversed: both lose their entitlement', msEnt(getMS(a.id), po) === 0 && msEnt(getMS(b.id), po) === 0 && msBilling(getMS(a.id), po) === 'Not Eligible'); }
{ const r = mk({ type: 'Services', lines: [lineDef('Fit-out', 1, 100000, { kind: 'Services', uom: 'Lot' })], ms: [{ name: 'Works', pct: 100, needsSrn: true, autoSrn: true }] }), po = r.po, m = msOf(po)[0];
  const before = msEnt(getMS(m.id), po); A.msStart(m.id); A.msSubmit(m.id, { actualDate: todayISO() }); const ap = A.msApprove(m.id);
  const srns = db.srns.filter(x => x.poId === po.id);
  S('Decision 4: an auto-SRN milestone records a system SRN on approval and becomes billable', ap.ok && srns.length === 1 && srns[0].system === true && srns[0].acceptedValue === 100000 && msEnt(getMS(m.id), po) === 100000 && before === 0, [ap.msg, srns.length]);
  const g2 = mk({ lines: [lineDef('Goods', 10, 1000)], ms: [{ name: 'G', pct: 100, needsGrn: true, autoSrn: true }] }), m2 = msOf(g2.po)[0];
  A.msStart(m2.id); A.msSubmit(m2.id, { actualDate: todayISO() }); A.msApprove(m2.id);
  S('goods milestones never get an auto receipt — a real GRN is always needed', db.srns.filter(x => x.poId === g2.po.id).length === 0 && msEnt(getMS(m2.id), g2.po) === 0); }
{ db.meta.role = 'receiver'; const before = can('ms.decide'); db.meta.role = 'admin';
  const dg = A.addDelegation('owner', 'receiver', daysFromNow(10)); db.meta.role = 'receiver'; const during = can('ms.decide'), other = can('guar.verify'); db.meta.role = 'admin';
  const dup = A.addDelegation('owner', 'receiver'); const rm = A.removeDelegation(db.meta.delegations[0].id); db.meta.role = 'receiver'; const after = can('ms.decide'); db.meta.role = 'admin';
  S('E14 delegation: the delegate can decide milestones only while it lasts; other permissions are not granted; duplicates refused', before === false && dg.ok && during === true && other === false && !dup.ok && rm.ok && after === false, [before, during, other, after]);
  S('a delegation cannot be in the past or to itself', !A.addDelegation('owner', 'owner').ok && !A.addDelegation('owner', 'buyer', daysFromNow(-2)).ok); }
{ const r = mk({ lines: [lineDef('Servers', 10, 1000)], ms: [{ name: 'A', scope: [sc(0, 'quantity', 10)] }] }), po = r.po;
  const am = A.amendPO(po.id, { lines: [{ id: po.lines[0].id, qty: 8, price: 1000 }], milestones: [], reason: 'order reduced' });
  S('S02/S08 PO quantity amended below the scoped quantity: allowed, schedule reopens with "Reduce the scope on a milestone by 2"', am.ok && /is assigned 10 of 8 Units\. Reduce the scope on a milestone by 2 Units/.test((getPO(po.id).scheduleOpen || [''])[0]), getPO(po.id).scheduleOpen); }
{ const r = mk({ type: 'Mixed', lines: WORKED, ms: [{ name: 'M1', scope: [sc(0, 'quantity', 10), sc(1, 'quantity', 20), sc(2, 'quantity', 50)], partial: true }] }), po = r.po;
  const gc = gr(po, 3, 40, 0, 'accept'); const it = sourceItems(po).find(x => x.kind === 'grn' && x.refId === gc.id);
  const over = subm(po, [{ kind: 'grn', refId: gc.id, qty: 45, value: 22500 }], { number: 'OUT-1' }), ok = subm(po, [{ kind: 'grn', refId: gc.id, qty: 40, value: 20000 }], { number: 'OUT-2' });
  S('lines billed outside the schedule bill on accepted receipts only: 45 of 40 units refused, 40 accepted', !!it && it.eligible && !over.ok && /Eligible: 40 units/.test(over.errors.join(' ')) && ok.ok, over.errors); }
{ const r = mk({ lines: [lineDef('Goods', 10, 1000)], ms: [{ name: 'M', pct: 100, allowPartial: true }] }), po = r.po, m = msOf(po)[0]; approveMs(m);
  const t = matchInvoiceLines(po, [{ ref: 'L1', desc: 'Goods', qty: 1, rate: 1000, amount: -500 }, { ref: 'L1', desc: 'Goods', qty: 0, rate: 1000, amount: 0 }, { ref: 'L9', desc: 'zzz', qty: 1, rate: 1, amount: 1 }]);
  S('intake rejects negative, zero and unmatched lines', t.rows.every(x => x.status === 'Reject') && t.billable === 0, t.rows.map(x => x.reason)); }
{ const { po, m, a } = (() => { const x = advPO(); approveMs(x.m); const p = paidAdvance(x.po, x.m); return { po: x.po, m: x.m, a: p.a }; })();
  const i1 = subm(po, [ma(m, 3000000)]), i2 = subm(po, [ma(m, 1000000)]);
  S('two milestone invoices in flight never recover more than the advance (750,000 + 250,000)', getInv(i1.id).recovery.net + getInv(i2.id).recovery.net === 1000000 && advO(getAdv(a.id)) === 0, [getInv(i1.id).recovery.net, getInv(i2.id).recovery.net]); }

/* ---------- seeded worked example (PO 47) ---------- */
seedDb('default');
{ const po = getPO('po-1047'), ms = msOf(po), adv = advsOf(po)[0], inv = db.invoices.filter(i => i.poId === po.id);
  S('seed PO 47: line-scoped schedule 200,000 · 4,000,000 · 600,000 · 200,000, consumables billed outside', ms.map(m => m.amount).join() === '200000,4000000,600000,200000' && po.lines[3].outside);
  S('seed PO 47: M2 is Eligible on the two shipments (6 servers + 11 switches = 2,350,000 accepted of 4,000,000)', msEnt(ms[1], po) === 2350000 && msBilling(ms[1], po) !== 'Invoiced');
  S('seed PO 47: ADV-001 Paid (1,000,000) with the guarantee verified', adv && advStatus(adv) === 'Partly recovered' || (adv && ['Paid', 'Partly recovered'].includes(advStatus(adv))), adv && advStatus(adv));
  const b = inv.find(i => i.number === 'DCB-2026-002');
  S('seed PO 47: invoice DCB-2026-002 recovers 587,500; gross 2,773,000; cash 2,079,750', b && b.recovery.net === 587500 && b.gross === 2773000 && payable(b) === 2079750, b && [b.recovery, b.gross]);
  S('seed PO 47: outstanding-advance report lists ADV-001 with O = 1,000,000 − 587,500 in flight', outstandingAdvances().some(x => x.adv.id === adv.id));
  S('seed PO 47: dependency advisory — M3 depends on M2', depsOf(ms[2], po).map(d => d.code).join() === 'M2'); }

console.log(sfails ? `\nSPEC: ${sfails} of ${scount} FAILED` : `\nSPEC ALL PASSED (${scount} checks)`);
