/* =====================================================================
   seed.js — interconnected demo data. scn: 'default' | 'A' | 'B'
   ===================================================================== */
function seedDb(scn = 'default') {
  db = {
    meta: { role: 'admin', scenario: scn, seededAt: nowISO() },
    seq: { id: 0, inv: 0, apv: 0, pay: 0 },
    suppliers: [
      { id: 'sup1', name: 'Gulf Industrial Equipment LLC', code: 'VEN-1042', currency: 'AED', vat: 5, terms: 'Net 30' },
      { id: 'sup2', name: 'Emirates Facility Services LLC', code: 'VEN-2077', currency: 'AED', vat: 5, terms: 'Net 30' },
    ],
    pos: [], milestones: [], grns: [], srns: [], claims: [], invoices: [], adjustments: [], audit: [],
  };
  const lines = (num, defs) => defs.map((d, i) => ({ id: `ln-${num}-${i + 1}`, no: i + 1, code: d.code, desc: d.desc, qty: d.qty, uom: d.uom, price: d.price, taxCode: 'VAT5', location: d.loc || 'Jebel Ali Plant — Warehouse A', receiptType: d.type || 'Goods' }));
  const addPO = o => {
    const po = {
      id: `po-${o.num}`, number: `PO-2026-${o.num}`, version: 1, amendments: [], approvals: [], supplierId: o.sup || 'sup1', buyer: 'DICE Manufacturing LLC', poDate: daysFromNow(o.poDays ?? -45), deliveryDate: daysFromNow(o.delDays ?? 60),
      currency: 'AED', terms: 'Net 30', category: o.category, status: o.status || 'Approved', billingMethod: o.method, progressBasis: o.basis || 'Receipt', requireSrn: !!o.requireSrn, partialMilestone: false, overReceiptPct: 0,
      scheduleMode: 'percent', scheduleException: { allow: false, note: '' }, scheduleStatus: o.method === 'Milestone' ? (o.scheduleFinal === false ? 'Draft' : 'Final') : 'n/a',
      createdBy: 'Procurement Manager', createdAt: nowISO(), lines: lines(o.num, o.lines),
    };
    db.pos.push(po);
    if (po.status === 'Approved') { po.approvals.push({ at: nowISO(), by: 'Procurement Manager', action: 'Approved', note: '' }); audit(po.id, po.number, `PO approved (${po.billingMethod}).`, 'po'); }
    else audit(po.id, po.number, `PO created as ${po.status}.`, 'po');
    return po;
  };
  const addMS = (po, defs) => defs.forEach((d, i) => {
    const m = { id: `ms-${po.id.slice(3)}-${i + 1}`, poId: po.id, lineId: po.lines[0].id, seq: i + 1, code: `M${i + 1}`, name: d.name, description: d.desc || '', pct: d.pct, amount: r2(d.pct * poNet(po) / 100), planned: daysFromNow(d.planned ?? 30 * (i + 1)),
      criteria: d.criteria || '', evidenceReq: d.evidence || '', approver: d.approver || 'Procurement Manager', status: d.status || 'Pending Acceptance', srnRequired: !!d.srn, srnId: d.srnId || null, evidence: d.files || [], remarks: d.remarks || '', actualDate: d.actual || '', approvedAt: d.status === 'Approved' ? nowISO() : '', rejectReason: '' };
    db.milestones.push(m);
  });
  const addGRN = (po, d) => {
    const seq = db.grns.filter(g => g.poId === po.id).length + 1;
    const g = { id: `grn-${po.id.slice(3)}-${seq}`, poId: po.id, lineId: po.lines[0].id, seq, number: `GRN-${pad(seq)}`, date: daysFromNow(d.days), location: 'Jebel Ali Plant — Warehouse A', received: d.received, accepted: d.accepted, rejected: d.rejected, inspection: d.inspection || 'Passed', remarks: d.remarks || '', attachments: [], status: d.status, reversed: false, createdBy: 'Warehouse Receiver', createdAt: nowISO() };
    db.grns.push(g); audit(po.id, g.number, `${g.number}: ${g.received} received, ${g.accepted} accepted, ${g.rejected} rejected → ${g.status}.`, 'grn'); return g;
  };
  const addSRN = (po, d) => {
    const seq = db.srns.filter(s => s.poId === po.id).length + 1;
    const s = { id: `srn-${po.id.slice(3)}-${seq}`, poId: po.id, lineId: po.lines[0].id, milestoneId: d.ms || null, seq, number: `SRN-${pad(seq)}`, date: daysFromNow(d.days), description: d.desc, serviceValue: d.value, acceptedValue: d.accepted || 0, status: d.status, remarks: '', attachments: [], createdBy: 'Service Receiver', createdAt: nowISO() };
    db.srns.push(s); audit(po.id, s.number, `${s.number}: ${money(s.serviceValue)} → ${s.status}.`, 'srn'); return s;
  };
  const invoice = (po, o) => {
    const r = A.saveInvoice({ poId: po.id, number: o.number, date: daysFromNow(o.days ?? -3), desc: o.desc || '', allocs: o.allocs || [], net: o.net, vatManual: o.vatManual, attachments: ['invoice.pdf'], remarks: '' }, 'submit');
    return r.id && getInv(r.id);
  };

  /* PO-2026-1042 — the master demo PO */
  const p1042 = addPO({ num: 1042, category: 'Goods', method: scn === 'A' ? 'Standard' : scn === 'B' ? 'Milestone' : 'Progressive', status: scn === 'default' ? 'Approved' : 'Draft', scheduleFinal: false,
    lines: [{ code: 'IME-INST-001', desc: 'Industrial Machinery Installation', qty: 100, uom: 'Units', price: 1000 }] });
  if (scn === 'B') addMS(p1042, [
    { name: 'Design Approval', pct: 20, status: 'Draft', desc: 'Detailed design package approved by DICE engineering.', criteria: 'Signed design approval certificate', evidence: 'Approved drawings, sign-off sheet' },
    { name: 'Installation Complete', pct: 50, status: 'Draft', desc: 'Machinery delivered and mechanically installed.', criteria: 'Installation checklist signed', evidence: 'Installation report, photos' },
    { name: 'Commissioning Complete', pct: 30, status: 'Draft', desc: 'Commissioning, trial run and handover.', criteria: 'Trial-run certificate', evidence: 'Commissioning certificate' },
  ]);
  if (scn === 'default') {
    addGRN(p1042, { received: 30, accepted: 30, rejected: 0, status: 'Accepted', days: -20 });
    addGRN(p1042, { received: 40, accepted: 40, rejected: 0, status: 'Accepted', days: -14 });
    addGRN(p1042, { received: 10, accepted: 7, rejected: 3, status: 'Partially Accepted', inspection: 'Partially Passed', days: -7, remarks: '3 units failed inspection — returned to supplier' });
  }

  /* PO-2026-1043 — milestone billing (goods + installation), schedule finalized & approved */
  const p1043 = addPO({ num: 1043, category: 'Goods', method: 'Milestone', lines: [{ code: 'IME-INST-001', desc: 'Industrial Machinery Installation', qty: 100, uom: 'Units', price: 1000 }] });
  addMS(p1043, [
    { name: 'Design Approval', pct: 20, desc: 'Detailed design package approved by DICE engineering.', criteria: 'Signed design approval certificate', evidence: 'Approved drawings, sign-off sheet' },
    { name: 'Installation Complete', pct: 50, desc: 'Machinery delivered and mechanically installed.', criteria: 'Installation checklist signed', evidence: 'Installation report, photos' },
    { name: 'Commissioning Complete', pct: 30, desc: 'Commissioning, trial run and handover.', criteria: 'Trial-run certificate', evidence: 'Commissioning certificate' },
  ]);

  /* PO-2026-1044 — standard billing regression */
  const p1044 = addPO({ num: 1044, category: 'Goods', method: 'Standard', lines: [{ code: 'HYD-PRS-020', desc: 'Hydraulic Press Units (20T)', qty: 20, uom: 'Units', price: 2000 }] });
  addGRN(p1044, { received: 12, accepted: 12, rejected: 0, status: 'Accepted', days: -10 });
  addGRN(p1044, { received: 8, accepted: 0, rejected: 0, status: 'Submitted', inspection: 'Not Required', days: -1 });

  /* PO-2026-1051 — service PO, progressive receipt-based (SRN) */
  const p1051 = addPO({ num: 1051, sup: 'sup2', category: 'Services', method: 'Progressive', lines: [{ code: 'FM-SVC-PH1', desc: 'Facility Maintenance Services — Phase 1', qty: 1, uom: 'Lot', price: 60000, type: 'Services', loc: 'DICE HQ — Dubai Investments Park' }] });
  const s1 = addSRN(p1051, { days: -15, desc: 'Preventive maintenance — months 1–2', value: 25000, accepted: 25000, status: 'Accepted' });
  addSRN(p1051, { days: -2, desc: 'Preventive maintenance — month 3', value: 10000, status: 'Pending Acceptance' });
  invoice(p1051, { number: 'EFS-2026-017', days: -6, allocs: [{ kind: 'srn', refId: s1.id, value: 10000 }], vatManual: 400 });   // VAT mismatch → Matching Failed
  invoice(p1051, { number: 'EFS-2026-018', days: -4, allocs: [{ kind: 'srn', refId: s1.id, value: 15000 }] });                      // Pending Approval

  /* PO-2026-1052 — service PO, milestone billing with SRN required */
  const p1052 = addPO({ num: 1052, sup: 'sup2', category: 'Project Services', method: 'Milestone', requireSrn: true, lines: [{ code: 'WH-FIT-PRJ', desc: 'Warehouse Fit-out Project', qty: 1, uom: 'Lot', price: 80000, type: 'Services', loc: 'DICE HQ — Dubai Investments Park' }] });
  const srnM1 = addSRN(p1052, { days: -3, desc: 'Survey & design services — milestone M1', value: 20000, status: 'Pending Acceptance', ms: 'ms-1052-1' });
  addMS(p1052, [
    { name: 'Survey & Design', pct: 25, status: 'Approved', srn: true, srnId: srnM1.id, evidence: 'Survey report, drawings', files: ['survey-report.pdf'], remarks: 'Survey and layout design complete.', actual: daysFromNow(-5) },
    { name: 'Fit-out Works', pct: 50, status: 'Submitted for Acceptance', srn: true, evidence: 'Progress photos, inspection record', files: ['fitout-photos.zip'], remarks: 'Fit-out completed in Zone A–C.', actual: daysFromNow(-1) },
    { name: 'Handover', pct: 25, status: 'Pending Acceptance', srn: true, evidence: 'Handover certificate' },
  ]);

  /* PO-2026-1060 — progressive billing on certified work progress */
  const p1060 = addPO({ num: 1060, category: 'Project Services', method: 'Progressive', basis: 'Certified', lines: [{ code: 'CW-PKG-01', desc: 'Civil Works Package', qty: 1, uom: 'Lot', price: 100000, type: 'Services', loc: 'Jebel Ali Plant — Site' }] });
  const pc1 = { id: 'pc-1060-1', poId: p1060.id, lineId: p1060.lines[0].id, seq: 1, number: 'PC-001', period: 'Aug 2026', prevCum: 0, claimedCum: 30000, certified: 30000, evidence: ['measurement-aug.pdf'], approver: 'Procurement Manager', status: 'Certified', srnId: null, remarks: '30% physical progress', createdAt: nowISO() };
  const pc2 = { id: 'pc-1060-2', poId: p1060.id, lineId: p1060.lines[0].id, seq: 2, number: 'PC-002', period: 'Sep 2026', prevCum: 30000, claimedCum: 50000, certified: 0, evidence: ['measurement-sep.pdf'], approver: 'Procurement Manager', status: 'Submitted', srnId: null, remarks: 'Cumulative progress 50%', createdAt: nowISO() };
  db.claims.push(pc1, pc2); audit(p1060.id, 'PC-001', 'PC-001 certified for AED 30,000.', 'ok'); audit(p1060.id, 'PC-002', 'PC-002 submitted: cumulative AED 50,000 − certified AED 30,000 = current AED 20,000.', 'claim');
  const iv = invoice(p1060, { number: 'GIE-2026-0044', days: -20, allocs: [{ kind: 'claim', refId: pc1.id, value: 30000 }] });
  if (iv) { A.approveInvoice(iv.id, 'Verified against PC-001'); A.postInvoice(iv.id); }

  /* a draft PO awaiting approval */
  addPO({ num: 1061, category: 'Goods', method: 'Standard', status: 'Pending Approval', poDays: -2, lines: [{ code: 'CNV-BLT-05', desc: 'Conveyor Belt Assembly', qty: 5, uom: 'Units', price: 7500 }] });

  db.meta.role = 'admin';
  save();
  return db;
}
