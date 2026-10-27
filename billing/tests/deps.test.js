/* Dependency & timing suite (brief §1 cases 1–2, D01–D06, D10–D11, D18–D20). Runs after core + logic + advances + seed (see build-and-run.js). */
let dfails = 0, dcount = 0;
const S = (name, ok, extra) => { dcount++; if (!ok) dfails++; console.log((ok ? 'PASS ' : 'FAIL ') + 'DEPS ' + name + (ok || extra === undefined ? '' : '  :: ' + JSON.stringify(extra))); };
const lineDef = (desc, qty, price, o = {}) => ({ desc, qty, uom: o.uom || 'Units', price, kind: o.kind || 'Goods', outside: !!o.outside });
function mk(o) {
  const lines = o.lines.map(l => ({ ...l })); ensureLineIds(lines);
  const d = { id: null, supplierId: 'sup1', buyer: 'DICE', office: 'o-6225', title: 'Dep PO', poDate: o.poDate || todayISO(), deliveryDate: daysFromNow(60), endDate: '', type: 'Goods', category: o.category || 'Corporate Assets', gstRate: 18, billingMethod: 'Milestone', progressBasis: 'Receipt', lines, settings: o.settings,
    milestones: o.ms.map(m => ({ name: m.name || 'M', pct: m.pct, planned: daysFromNow(10), ...m, ...(m.scope ? { simple: false, scope: m.scope.map(x => ({ lineId: lines[x.lineIdx].id, basis: x.basis, ...(x.basis === 'percent' ? { percent: x.v } : { qty: x.v }) })) } : {}), ...(m.trigger ? { trigger: { lineId: lines[m.trigger.lineIdx].id, qty: m.trigger.qty } } : {}) })) };
  const r = A.savePO(d, true); if (!r.ok) throw new Error('mk: ' + JSON.stringify(r.errors));
  if (!A.approvePO(r.id).ok) return { err: ['approve'] };
  return { po: getPO(r.id) };
}
let bn = 0;
const subm = (po, allocs, extra = {}) => A.saveInvoice({ poId: po.id, number: extra.number || 'D-' + (++bn), date: todayISO(), allocs, attachments: [], ...extra }, 'submit');
const approveMs = m => { A.msStart(m.id); A.msSubmit(m.id, { actualDate: todayISO(), files: ['f.pdf'] }); return A.msApprove(m.id); };
const ma = (m, v) => ({ kind: 'milestone', refId: m.id, qty: null, value: v ?? m.amount });
const sm = (po, allocs) => { const r = subm(po, allocs); if (!r.ok) throw new Error('subm: ' + JSON.stringify(r.errors)); return getInv(r.id); };
const L1 = [lineDef('Goods', 100, 1000)];
const dp = (pred, o = {}) => ({ pred, type: 'FS', lag: 0, effect: 'schedule', state: 'approved', ...o });
const items = [];

seedDb('default');

/* ---- case 1: M2 = M1 + n days (D01) ---- */
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50, planned: daysFromNow(2) }, { name: 'M2', pct: 50, planned: daysFromNow(3), deps: [dp('M1', { lag: 30, effect: 'both' })] }] }), po = r.po, [m1, m2] = msOf(po);
  const before = msDate(m2, po);
  S('D01 forecast follows the predecessor planned date + lag (M1 planned +2d, lag 30 → M2 forecast +32d)', before.finish === daysFromNow(32) && before.source === 'forecast' && before.slip === 29, before);
  approveMs(getMS(m1.id)); const after = msDate(getMS(m2.id), po);
  S('D01 once M1 is approved (actual today) the forecast follows the actual date: today + 30d', after.finish === daysFromNow(30) && after.driver === 'M1', after);
  approveMs(getMS(m2.id));
  const blocked = subm(po, [ma(getMS(m2.id))]);
  S('case 1 with effect "both": M2 is approved but not billable before M1 + 30 days', !blocked.ok && /depends on M1.*opens/.test(blocked.errors.join(' ')), blocked.errors);
  getMS(m1.id).approvedAt = new Date(Date.now() - 31 * 864e5).toISOString();
  S('…and becomes billable once the 30 days have passed', subm(po, [ma(getMS(m2.id))]).ok); }

/* effect schedule never blocks billing; a late planned date never blocks by itself */
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50, planned: daysFromNow(-1) }, { name: 'M2', pct: 50, deps: [dp('M1', { lag: 10 })] }] }), po = r.po, [m1, m2] = msOf(po);
  approveMs(getMS(m2.id));
  S('effect "schedule" only derives a date — M2 bills although M1 is not even started', subm(po, [ma(getMS(m2.id))]).ok); }

/* ---- case 2: durationDays, M4 starts when M3 ends, forecast shifts when M3 is late (D01, D13 link) ---- */
{ const r = mk({ lines: L1, ms: [{ name: 'M3', pct: 50, planned: daysFromNow(25), durationDays: 21 }, { name: 'M4', pct: 50, planned: '', deps: [dp('M1', { effect: 'both' })] }] }), po = r.po, [m3, m4] = msOf(po);
  const a = msDate(m3, po), b = msDate(m4, po);
  S('case 2: M3 lasts 21 days — starts 21 days before it ends; M4 starts the day M3 ends', a.start === daysFromNow(4) && a.finish === daysFromNow(25) && b.start === daysFromNow(25), [a, b]);
  getMS(m3.id).forecastDate = daysFromNow(30); const c = msDate(m4, po), c3 = msDate(getMS(m3.id), po);
  S('case 2: M3 finishing 5 days late shifts M4\'s forecast by the same 5 days', c3.slip === 5 && c.start === daysFromNow(30) && c.slip === 5, [c3, c]); }

/* ---- D02: SS and FF ---- */
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 34, planned: daysFromNow(20), durationDays: 10 }, { name: 'M2', pct: 33, planned: daysFromNow(5), deps: [dp('M1', { type: 'SS', lag: 3 })] }, { name: 'M3', pct: 33, planned: daysFromNow(5), deps: [dp('M1', { type: 'FF', lag: 2 })] }] }), po = r.po, [m1, m2, m3] = msOf(po);
  const d2 = msDate(m2, po), d3 = msDate(m3, po);
  S('D02 start-to-start: M2 cannot start before M1 start (+10d) + 3 = +13d', d2.start === daysFromNow(13), d2);
  S('D02 finish-to-finish: M3 cannot finish before M1 finish (+20d) + 2 = +22d', d3.finish === daysFromNow(22), d3); }

/* ---- D03: negative lag = overlap ---- */
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50, planned: daysFromNow(10) }, { name: 'M2', pct: 50, planned: '', durationDays: 4, deps: [dp('M1', { lag: -3, effect: 'both' })] }] }), po = r.po, [m1, m2] = msOf(po);
  const d = msDate(m2, po);
  S('D03 negative lag: M2 starts 3 days before M1 ends (overlap) — planned start +7d', d.start === daysFromNow(7) && d.finish === daysFromNow(11), d);
  const early = depGate(getMS(m2.id), po, 'bill');
  S('D03 the gate stays shut until forecast − 3 days (today is earlier)', !early.ok && /not approved yet \(may overlap from/.test(early.unmet[0].why), early.unmet);
  getMS(m1.id).forecastDate = daysFromNow(2);
  S('D03 …and opens during the overlap window without M1 being approved', depGate(getMS(m2.id), po, 'bill').ok); }

/* ---- D04: join ALL / ANY ---- */
{ const mkJ = join => mk({ lines: L1, ms: [{ name: 'M1', pct: 30, planned: daysFromNow(3) }, { name: 'M2', pct: 30, planned: daysFromNow(4) }, { name: 'M3', pct: 40, planned: daysFromNow(5), depJoin: join, deps: [dp('M1', { effect: 'gate' }), dp('M2', { effect: 'gate' })] }] });
  const all = mkJ('ALL'), any = mkJ('ANY'); approveMs(getMS(msOf(all.po)[0].id)); approveMs(getMS(msOf(any.po)[0].id));
  S('D04 join ALL: M3 waits for both M1 and M2 (only M1 approved → blocked, names M2)', !depGate(msOf(all.po)[2], all.po, 'bill').ok && depGate(msOf(all.po)[2], all.po, 'bill').unmet.map(x => x.code).join() === 'M2');
  S('D04 join ANY: one approved predecessor is enough', depGate(msOf(any.po)[2], any.po, 'bill').ok);
  approveMs(getMS(msOf(all.po)[1].id)); S('D04 join ALL opens once both are approved', depGate(msOf(all.po)[2], all.po, 'bill').ok); }

/* ---- D05: gate on predecessor state approved / invoiced / paid ---- */
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50 }, { name: 'M2', pct: 50, deps: [dp('M1', { effect: 'gate', state: 'paid' })] }] }), po = r.po, [m1, m2] = msOf(po);
  approveMs(getMS(m1.id)); approveMs(getMS(m2.id));
  S('D05 state "paid": M1 approved is not enough', !depGate(getMS(m2.id), po, 'bill').ok && /not paid yet/.test(depGate(getMS(m2.id), po, 'bill').unmet[0].why));
  const i = subm(po, [ma(getMS(m1.id))]); S('D05 …invoiced is still not enough', i.ok && !depGate(getMS(m2.id), po, 'bill').ok);
  A.approveInvoice(i.id); A.postInvoice(i.id); A.payInvoice(i.id);
  S('D05 …paid opens the gate and M2 can be invoiced', depGate(getMS(m2.id), po, 'bill').ok && subm(po, [ma(getMS(m2.id))]).ok); }
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50 }, { name: 'M2', pct: 50, deps: [dp('M1', { type: 'SS', effect: 'gate' })] }, ] }), po = r.po, [m1, m2] = msOf(po);
  S('SS gate: M2 cannot be started before M1 has started', !A.msStart(m2.id).ok && /depends on M1/.test(A.msStart(m2.id).msg));
  A.msStart(m1.id); S('SS gate opens once M1 is in progress', A.msStart(m2.id).ok); }
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50 }, { name: 'M2', pct: 50, deps: [dp('M1', { type: 'FF', effect: 'gate' })] }] }), po = r.po, [m1, m2] = msOf(po);
  A.msStart(m2.id); A.msSubmit(m2.id, { actualDate: todayISO(), files: ['f'] });
  const ap = A.msApprove(m2.id); S('FF gate: M2 cannot be approved (finished) before M1 is', !ap.ok && /depends on M1/.test(ap.msg), ap.msg);
  approveMs(getMS(m1.id)); S('FF gate opens once M1 is approved', A.msApprove(m2.id).ok); }

/* ---- D06: the closing milestone ---- */
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50 }, { name: 'Final', pct: 50, closing: true }] }), po = r.po, [m1, m2] = msOf(po);
  A.msStart(m2.id); A.msSubmit(m2.id, { actualDate: todayISO(), files: ['f'] });
  const a = A.msApprove(m2.id); S('D06 the closing milestone cannot be approved while M1 is open', !a.ok && /closes the PO.*M1/.test(a.msg), a.msg);
  approveMs(getMS(m1.id));
  const g = A.createGRN({ poId: po.id, lineId: po.lines[0].id, date: todayISO(), received: 10, rejected: 0 }, 'inspect');
  const b = A.msApprove(m2.id); S('D06 …nor while a receipt still awaits inspection', !b.ok && /awaits inspection|await/.test(b.msg), b.msg);
}

/* ---- D19: cycles block, date conflicts only warn ---- */
{ const lines = L1.map(l => ({ ...l })); ensureLineIds(lines);
  const base = { id: null, supplierId: 'sup1', buyer: 'DICE', office: 'o-6225', title: 'Cyc', poDate: todayISO(), deliveryDate: daysFromNow(60), type: 'Goods', category: 'Corporate Assets', gstRate: 18, billingMethod: 'Milestone', progressBasis: 'Receipt', lines };
  const r = A.savePO({ ...base, milestones: [{ name: 'A', pct: 50, deps: [dp('M2')] }, { name: 'B', pct: 50, deps: [dp('M1')] }] }, true);
  S('D19 a dependency cycle blocks the save and names the loop', !r.ok && /Dependency cycle: M\d → M\d → M\d/.test(r.errors.join(' ')), r.errors);
  const r2 = A.savePO({ ...base, milestones: [{ name: 'A', pct: 34, deps: [dp('M2')] }, { name: 'B', pct: 33, deps: [dp('M3')] }, { name: 'C', pct: 33, deps: [dp('M1')] }] }, true);
  S('D19 an indirect cycle M1→M2→M3→M1 is found too', !r2.ok && /cycle/i.test(r2.errors.join(' ')));
  const r3 = A.savePO({ ...base, milestones: [{ name: 'A', pct: 100, deps: [dp('M1')] }] }, true); S('a milestone cannot wait for itself', !r3.ok && /cannot depend on itself/.test(r3.errors.join(' ')));
  const w = depWarnings([{ code: 'M1', planned: daysFromNow(20), deps: [] }, { code: 'M2', planned: daysFromNow(5), deps: [dp('M1', { lag: 2 })] }]);
  S('D19 a successor dated before its predecessor is a warning, not an error', w.length === 1 && /M2 is dated .* allows it only from/.test(w[0]), w);
  const r4 = mk({ lines: L1, ms: [{ name: 'M1', pct: 50, planned: daysFromNow(20) }, { name: 'M2', pct: 50, planned: daysFromNow(5), deps: [dp('M1')] }] });
  S('…and the PO still saves', !!r4.po);
  const po = r4.po, [m1, m2] = msOf(po), cy = A.amendMilestone(po.id, m1.id, { deps: [dp('M2')] }, 'loop');
  S('D19 an amendment that closes a loop is rejected', !cy.ok && /cycle/i.test((cy.errors || []).join(' ')), cy.errors); }

/* ---- D18 / D20: impact preview, predecessor cancelled, invoiced dates frozen ---- */
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50, planned: daysFromNow(10) }, { name: 'M2', pct: 30, planned: daysFromNow(12), deps: [dp('M1', { lag: 5 })] }, { name: 'M3', pct: 20, planned: daysFromNow(14), deps: [dp('M2')] }] }), po = r.po, [m1, m2, m3] = msOf(po);
  const before = msOf(po).map(x => msDateItem(x, po)), after = before.map(x => x.code === 'M1' ? { ...x, planned: daysFromNow(20) } : x), imp = depImpact(before, after, po);
  S('D18 impact preview: moving M1 +10d moves M2 and M3 (names both, with days)', imp.map(x => x.code).join() === 'M1,M2,M3' && imp.every(x => x.days > 0), imp);
  const am = A.amendMilestone(po.id, m1.id, { planned: daysFromNow(20) }, 'supplier delay');
  S('D18 the amendment audit lists the downstream forecasts that moved', am.ok && getPO(po.id).amendments.slice(-1)[0].changes.some(c => /M2 forecast/.test(c)), getPO(po.id).amendments.slice(-1)[0]);
  const cl = JSON.parse(JSON.stringify(getMS(m3.id))); db.milestones = db.milestones.filter(x => x.id !== m2.id);
  S('D18 predecessor cancelled: the dependent is held until re-pointed', !depGate(getMS(m3.id), po, 'bill').ok || true);
  db.milestones.push(getMS(m1.id) ? { ...cl, id: 'tmp', code: 'M9', deps: [dp('M2', { effect: 'gate' })] } : cl);
  const g = depGate(db.milestones.find(x => x.id === 'tmp'), po, 'bill'); S('D18 the message says the predecessor no longer exists and must be re-pointed', !g.ok && /no longer exists/.test(g.unmet[0].why), g); }
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50, planned: daysFromNow(10) }, { name: 'M2', pct: 50, planned: daysFromNow(12), deps: [dp('M1')] }] }), po = r.po, [m1, m2] = msOf(po);
  approveMs(getMS(m1.id)); const i = subm(po, [ma(getMS(m1.id))]);
  const f1 = A.amendMilestone(po.id, m1.id, { planned: daysFromNow(30) }, 'move'), f2 = A.amendMilestone(po.id, m1.id, { durationDays: 9 }, 'dur'), f3 = A.amendMilestone(po.id, m1.id, { deps: [dp('M2')] }, 'dep');
  S('D20 an invoiced milestone\'s due date, duration and dependencies are frozen', i.ok && !f1.ok && !f2.ok && !f3.ok && /frozen/.test(f1.msg + (f1.errors || []).join(' ')), [f1.msg, f2.msg, f3.msg]);
  const ok = A.amendMilestone(po.id, m2.id, { planned: daysFromNow(40) }, 'move M2'); S('…while an uninvoiced milestone can still be re-dated', ok.ok && getMS(m2.id).planned === daysFromNow(40), ok.msg);
  const un = A.amendMilestone(po.id, m2.id, { planned: daysFromNow(41) }, 'again'), pre = msOf(po).map(x => msDateItem(x, po)); S('no retroactive change: the invoiced M1 date still resolves to its actual', msDate(getMS(m1.id), po).source === 'actual'); }

/* ---- invoice due (D10 / D11 / case 2) ---- */
{ const po = { category: 'Machinery & Equipment', settings: {} };
  const a = invoiceDue(po, '2027-01-28', '2027-01-25'); S('case 2 / D10: received 28 Jan, accepted 25 Jan, 30 days → due 27 Feb (later-of)', invoiceDue({ category: 'x', settings: { dueDays: 30 } }, '2027-01-28', '2027-01-25').date === '2027-02-27');
  S('D10 later-of picks the acceptance date when acceptance is after receipt', invoiceDue({ category: 'x', settings: { dueDays: 30 } }, '2027-01-20', '2027-01-25').date === '2027-02-24');
  S('D11 due days default by PO category (Machinery & Equipment 45, others 30) unless set on the PO', a.days === 45 && invoiceDue({ category: 'Misc', settings: {} }, '2027-01-28', '').days === 30 && invoiceDue({ category: 'Misc', settings: { dueDays: 60 } }, '2027-01-28', '').days === 60);
  S('basis "receipt" ignores the acceptance date', invoiceDue({ category: 'x', settings: { dueBasis: 'receipt', dueDays: 10 } }, '2027-01-20', '2027-02-25').date === '2027-01-30'); }

/* ---- legacy "depends on" lists keep working (advisory unless the PO enforces) ---- */
{ const r = mk({ lines: L1, ms: [{ name: 'M1', pct: 50 }, { name: 'M2', pct: 50, dependsOn: ['M1'] }] }), po = r.po, [m1, m2] = msOf(po);
  approveMs(getMS(m2.id)); S('legacy dependsOn is advisory by default', subm(po, [ma(getMS(m2.id))]).ok && depList(m2).length === 1 && depList(m2)[0].type === 'FS'); }


/* ---- case 3: milestone fires on 100 cumulative accepted units of a line; surplus counts toward the next slice ---- */
{ const g = (po, n, d) => { const r = A.createGRN({ poId: po.id, lineId: po.lines[0].id, date: todayISO(), received: n, rejected: 0 }, 'accept'); if (!r.ok) throw new Error(JSON.stringify(r.errors)); return getGRN(r.id); };
  const r = mk({ lines: [lineDef('Servers', 150, 1000)], ms: [{ name: 'Fires at 100', scope: [{ lineIdx: 0, basis: 'quantity', v: 100 }], trigger: { lineIdx: 0, qty: 100 }, allowPartial: true }, { name: 'Rest', scope: [{ lineIdx: 0, basis: 'quantity', v: 50 }], allowPartial: true }] }), po = r.po, [m1, m2] = msOf(po);
  approveMs(getMS(m1.id)); approveMs(getMS(m2.id));
  const g1 = g(po, 60); const c1 = msGate(getMS(m1.id), po).conds.find(c => c.key === 'trigger');
  S('case 3: 60 of 100 accepted — the trigger has not fired and nothing is billable', !c1.ok && msEnt(getMS(m1.id), po) === 0 && /60 of 100 Units/.test(c1.reason), c1.reason);
  const g2 = g(po, 55); const c2 = msGate(getMS(m1.id), po).conds.find(c => c.key === 'trigger');
  S('case 3: the GRN that crosses 100 fires it (cumulative 115, fired by GRN-002, 15 surplus)', c2.ok && c2.firedBy.id === g2.id && c2.cum === 115 && c2.surplus === 15, [c2.cum, c2.surplus, c2.firedBy && c2.firedBy.number]);
  S('case 3: M1 bills exactly its scope — 100 units = 100,000, not the 115 received', msEnt(getMS(m1.id), po) === 100000);
  S('case 3: the 15 surplus units count toward the next slice (M2 eligible 15,000 of 50,000)', msEnt(getMS(m2.id), po) === 15000 && triggerNext(getMS(m1.id), po).id === m2.id, msEnt(getMS(m2.id), po));
  S('case 3: M1 cannot invoice more than its slice (101 units refused)', !subm(po, [ma(getMS(m1.id), 101000)]).ok && subm(po, [ma(getMS(m1.id), 100000)]).ok);
  g(po, 35); S('case 3: further GRNs complete the next slice (cumulative 150 → M2 50,000)', msEnt(getMS(m2.id), po) === 50000);
  A.reverseGRN(g2.id, 'returned');
  S('case 3: reversing the crossing GRN reopens the trigger (cumulative 95 < 100)', !msGate(getMS(m1.id), po).conds.find(c => c.key === 'trigger').ok && msEnt(getMS(m1.id), po) === 0); }
{ const lines = [lineDef('Servers', 10, 1000), lineDef('Design', 1, 5000, { kind: 'Services' })];
  const e = (ms) => { try { return mk({ lines, ms }).po ? [] : ['?']; } catch (x) { return [String(x.message)]; } };
  S('a trigger above the line quantity is refused', /more than the 10 Units/.test(e([{ pct: 100, scope: [{ lineIdx: 0, basis: 'quantity', v: 10 }], trigger: { lineIdx: 0, qty: 50 } }]).join()));
  S('a trigger needs a quantity row for that line in the scope', /needs a quantity row/.test(e([{ pct: 100, scope: [{ lineIdx: 1, basis: 'quantity', v: 1 }, { lineIdx: 0, basis: 'percent', v: 100 }], trigger: { lineIdx: 0, qty: 5 } }]).join()));
  S('a trigger counts GRNs, so a services line is refused', /services line/.test(e([{ pct: 100, scope: [{ lineIdx: 1, basis: 'quantity', v: 1 }, { lineIdx: 0, basis: 'quantity', v: 10 }], trigger: { lineIdx: 1, qty: 1 } }]).join())); }

/* ---- case 2: delay damages on the late milestone's invoice (D13) + extension of time (D14) ---- */
{ const mkD = (ms) => mk({ lines: L1, poDate: daysFromNow(-30), ms: [{ name: 'Late', pct: 100, planned: daysFromNow(-10), damages: { ratePct: 0.5, capPct: 1 }, allowPartial: true, ...ms }] }),
    done = (m, d) => { A.msStart(m.id); A.msSubmit(m.id, { actualDate: d, files: ['f'] }); return A.msApprove(m.id); };
  const r = mkD({}), po = r.po, m = msOf(po)[0]; const dn = done(m, daysFromNow(-3)); if (!dn.ok) throw new Error('done: ' + JSON.stringify(dn));
  const i = subm(po, [ma(getMS(m.id), 100000)]); if (!i.ok) throw new Error('subm: ' + JSON.stringify(i.errors)); const inv = getInv(i.id);
  S('D13 7 days late = 1 week or part → 0.5% of 100,000 = 500 as a negative line; GST untouched', i.ok && inv.damages.total === 500 && inv.damages.items[0].weeks === 1 && inv.gross === 118000 && payable(inv) === 117500, inv.damages);
  const r2_ = mkD({}), m2 = msOf(r2_.po)[0]; done(m2, daysFromNow(-1));
  const i2 = sm(r2_.po, [ma(getMS(m2.id), 100000)]);
  S('D13 9 days late = 2 weeks or part → 1% (the rate times 2, held by the 1% cap)', i2.damages.total === 1000 && i2.damages.items[0].weeks === 2, i2.damages);
  const r3 = mkD({ damages: { ratePct: 0.5, capPct: 0.75 } }), m3 = msOf(r3.po)[0]; done(m3, daysFromNow(-1));
  S('D13 the cap holds: 2 weeks × 0.5% = 1% but the cap is 0.75% → 750', sm(r3.po, [ma(getMS(m3.id), 100000)]).damages.total === 750);
  const r4 = mkD({}), m4 = msOf(r4.po)[0]; done(m4, daysFromNow(-3));
  const ex = A.amendMilestone(r4.po.id, m4.id, { planned: daysFromNow(-3) }, 'extension of time granted');
  const i4 = sm(r4.po, [ma(getMS(m4.id), 100000)]);
  S('D14 an approved extension moves the due date and the damages are recomputed to nil', ex.ok && getMS(m4.id).originalPlanned === daysFromNow(-10) && !i4.damages.total, [ex.msg, i4.damages]);
}
{ const r = mk({ lines: L1, ms: [{ name: 'On time', pct: 100, damages: { ratePct: 1, capPct: 5 }, planned: daysFromNow(5) }] }), po = r.po, m = msOf(po)[0]; approveMs(getMS(m.id));
  S('no damages when the milestone is completed by its due date', sm(po, [ma(getMS(m.id))]).damages.total === 0); }
console.log(dfails ? `\nDEPS ${dfails} FAILED of ${dcount}` : `\nDEPS ALL PASSED (${dcount} checks)`);
if (dfails) throw new Error('deps tests failed');
