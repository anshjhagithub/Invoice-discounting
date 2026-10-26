/* =====================================================================
   seed.js — interconnected demo data. scn: 'default' | 'A' | 'B'
   ===================================================================== */
const OFFICES = [
  { id: 'o-6225', name: '6225 - Bhopal', city: 'Bhopal', address: 'Plot No. 10, Alankar Complex, Mezanine Floor, Bank Street, M. P. Nagar, Zone II, Bhopal - 462011, Madhya Pradesh', gstin: '23AAACD1977A1Z7' },
  { id: 'o-6192', name: '6192 - Pune', city: 'Pune', address: 'Survey No. 21, Baner Road, Pune - 411045, Maharashtra', gstin: '27AAACD1977A1Z2' },
  { id: 'o-6164', name: '6164 - Mumbai - Bandra', city: 'Mumbai', address: 'Bandra Kurla Complex, Bandra East, Mumbai - 400051, Maharashtra', gstin: '27AAACD1977A1Z2' },
  { id: 'o-6314', name: '6314 - Dhanbad - Bank More', city: 'Dhanbad', address: 'Bank More, Dhanbad - 826001, Jharkhand', gstin: '20AAACD1977A1Z9' },
];
const officeOf = id => OFFICES.find(o => o.id === id) || OFFICES[0];
const CATEGORIES = ['Corporate Assets', 'Machinery & Equipment', 'Facility Services', 'Project Services', 'Legal Expenses'];
const UOMS = ['Units', 'Lot', 'Nos', 'Litre', 'Kg', 'Man-days', 'Hours', 'Sets'];

function seedDb(scn = 'default') {
  db = {
    meta: { role: 'admin', scenario: scn, seededAt: nowISO() },
    seq: { id: 0, inv: 0, apv: 0, pay: 0 },
    suppliers: [
      { id: 'sup1', name: 'Bharat Industrial Equipment Pvt Ltd', code: 'VEN-1042', gstin: '27AABCB4321K1Z6', email: 'accounts@bharat-industrial.example', mobile: '9876500142' },
      { id: 'sup2', name: 'Sahyadri Facility Services Pvt Ltd', code: 'VEN-2077', gstin: '27AAECS8890L1ZQ', email: 'billing@sahyadri-fs.example', mobile: '9876500277' },
    ],
    pos: [], milestones: [], grns: [], srns: [], claims: [], invoices: [], adjustments: [], audit: [],
  };
  const addPO = o => {
    const poDate = daysFromNow(o.poDays ?? -45), seqNo = o.num - 1000;
    const po = {
      id: `po-${o.num}`, seqNo, number: poNumberFor(poDate, seqNo), version: 1, amendments: [], approvals: [], supplierId: o.sup || 'sup1', buyer: 'DICE Manufacturing Pvt Ltd', office: o.office || 'o-6225', title: o.title,
      poDate, deliveryDate: daysFromNow(o.delDays ?? 60), endDate: daysFromNow((o.delDays ?? 60) + 30), type: o.type, category: o.category, currency: CURRENCY, gstRate: 18,
      status: o.status || 'Approved', billingMethod: o.method, progressBasis: o.basis || 'Receipt', overReceiptPct: 0,
      createdBy: 'Procurement Manager', createdAt: nowISO(),
      lines: o.lines.map((d, i) => ({ id: `ln-${o.num}-${i + 1}`, no: i + 1, desc: d.desc, qty: d.qty, uom: d.uom, price: d.price })),
    };
    db.pos.push(po);
    if (po.status === 'Approved') { po.approvals.push({ at: nowISO(), by: 'Procurement Manager', action: 'Approved', note: '' }); audit(po.id, po.number, `PO approved (${po.billingMethod}).`, 'po'); }
    else audit(po.id, po.number, `PO created as ${po.status}.`, 'po');
    return po;
  };
  const addMS = (po, defs) => {
    const amts = milestoneAmounts(defs, poNet(po));
    return defs.map((d, i) => {
      const m = { id: `ms-${po.id.slice(3)}-${i + 1}`, poId: po.id, seq: i + 1, code: `M${i + 1}`, name: d.name, pct: d.pct, amount: amts[i], planned: daysFromNow(d.planned ?? 30 * (i + 1)),
        status: d.status || 'Pending Approval', needsReceipt: !!d.needs, receiptId: d.rec ? d.rec.id : null, evidence: d.files || [], remarks: d.remarks || '', actualDate: d.actual || '', approvedAt: ['Approved', 'Completed'].includes(d.status) ? nowISO() : '', rejectReason: '' };
      db.milestones.push(m); if (d.rec) d.rec.milestoneId = m.id; return m;
    });
  };
  const addGRN = (po, d) => {
    const seq = db.grns.filter(g => g.poId === po.id).length + 1;
    const g = { id: `grn-${po.id.slice(3)}-${seq}`, poId: po.id, lineId: po.lines[0].id, seq, number: `GRN-${pad(seq)}`, date: daysFromNow(d.days), received: d.received, accepted: d.accepted, rejected: d.rejected, inspection: d.inspection || 'Passed', remarks: d.remarks || '', attachments: [], status: d.status, reversed: false, milestoneId: null, createdBy: 'Warehouse Receiver', createdAt: nowISO() };
    db.grns.push(g); audit(po.id, g.number, `${g.number}: ${g.received} delivered, ${g.accepted} accepted, ${g.rejected} rejected → ${g.status}.`, 'grn'); return g;
  };
  const addSRN = (po, d) => {
    const seq = db.srns.filter(s => s.poId === po.id).length + 1;
    const s = { id: `srn-${po.id.slice(3)}-${seq}`, poId: po.id, lineId: po.lines[0].id, seq, number: `SRN-${pad(seq)}`, date: daysFromNow(d.days), description: d.desc, serviceValue: d.value, acceptedValue: d.accepted || 0, status: d.status, remarks: '', attachments: [], milestoneId: null, createdBy: 'Service Receiver', createdAt: nowISO() };
    db.srns.push(s); audit(po.id, s.number, `${s.number}: ${money(s.serviceValue)} → ${s.status}.`, 'srn'); return s;
  };
  const invoice = (po, o) => {
    const r = A.saveInvoice({ poId: po.id, number: o.number, date: daysFromNow(o.days ?? -3), dueDate: daysFromNow((o.days ?? -3) + 30), allocs: o.allocs || [], net: o.net, gstManual: o.gstManual, attachments: ['invoice.pdf'], remarks: '' }, 'submit');
    return r.id && getInv(r.id);
  };
  const MACHINE = { desc: 'Industrial Machinery Unit — Model IM-200', qty: 100, uom: 'Units', price: 1000 };

  /* PO 42 — the master demo PO (goods) */
  const p1042 = addPO({ num: 1042, title: 'Industrial machinery units', type: 'Goods', category: 'Machinery & Equipment', office: 'o-6192', method: scn === 'A' ? 'Standard' : scn === 'B' ? 'Milestone' : 'Progressive', status: scn === 'default' ? 'Approved' : 'Draft', lines: [MACHINE] });
  if (scn === 'B') addMS(p1042, [
    { name: 'Design Approval', pct: 20, status: 'Draft' },
    { name: 'Equipment Delivered', pct: 50, status: 'Draft', needs: true },
    { name: 'Commissioning Complete', pct: 30, status: 'Draft' },
  ]);
  if (scn === 'default') {
    addGRN(p1042, { received: 30, accepted: 30, rejected: 0, status: 'Accepted', days: -20 });
    addGRN(p1042, { received: 40, accepted: 40, rejected: 0, status: 'Accepted', days: -14 });
    addGRN(p1042, { received: 10, accepted: 7, rejected: 3, status: 'Partially Accepted', inspection: 'Partially Passed', days: -7, remarks: '3 units failed inspection — returned to vendor' });
  }

  /* PO 43 — GOODS PO billed on milestones. M2 is gated on an accepted GRN (not an SRN). */
  const p1043 = addPO({ num: 1043, title: 'Machinery installation project', type: 'Goods', category: 'Machinery & Equipment', office: 'o-6164', method: 'Milestone', lines: [{ ...MACHINE, desc: 'Industrial Machinery Installation' }] });
  const g43 = addGRN(p1043, { received: 100, accepted: 0, rejected: 0, status: 'Pending Inspection', inspection: 'Pending', days: -2 });
  addMS(p1043, [
    { name: 'Design Approval', pct: 20, status: 'Completed', files: ['design-signoff.pdf'], remarks: 'Drawings approved by engineering.', actual: daysFromNow(-12) },
    { name: 'Equipment Delivered', pct: 50, status: 'Approved', needs: true, rec: g43, files: ['delivery-challan.pdf'], remarks: 'All units delivered to site.', actual: daysFromNow(-2) },
    { name: 'Commissioning Complete', pct: 30 },
  ]);

  /* PO 44 — standard billing regression (goods) */
  const p1044 = addPO({ num: 1044, title: 'Hydraulic press units', type: 'Goods', category: 'Machinery & Equipment', office: 'o-6192', method: 'Standard', lines: [{ desc: 'Hydraulic Press Unit (20T)', qty: 20, uom: 'Units', price: 2000 }] });
  addGRN(p1044, { received: 12, accepted: 12, rejected: 0, status: 'Accepted', days: -10 });
  addGRN(p1044, { received: 8, accepted: 0, rejected: 0, status: 'Pending Inspection', inspection: 'Pending', days: -1 });

  /* PO 51 — services, progressive receipt-based (SRN) */
  const p1051 = addPO({ num: 1051, sup: 'sup2', title: 'Facility maintenance — phase 1', type: 'Services', category: 'Facility Services', office: 'o-6225', method: 'Progressive', lines: [{ desc: 'Facility Maintenance Services — Phase 1', qty: 1, uom: 'Lot', price: 60000 }] });
  const s1 = addSRN(p1051, { days: -15, desc: 'Preventive maintenance — months 1–2', value: 25000, accepted: 25000, status: 'Accepted' });
  addSRN(p1051, { days: -2, desc: 'Preventive maintenance — month 3', value: 10000, status: 'Pending Acceptance' });
  invoice(p1051, { number: 'SFS-2026-017', days: -6, allocs: [{ kind: 'srn', refId: s1.id, value: 10000 }], gstManual: 1000 });   // GST mismatch → Matching Failed
  invoice(p1051, { number: 'SFS-2026-018', days: -4, allocs: [{ kind: 'srn', refId: s1.id, value: 15000 }] });                       // Pending Approval

  /* PO 52 — SERVICES PO billed on milestones, gated on an accepted SRN */
  const p1052 = addPO({ num: 1052, sup: 'sup2', title: 'Warehouse fit-out project', type: 'Services', category: 'Project Services', office: 'o-6314', method: 'Milestone', lines: [{ desc: 'Warehouse Fit-out Project', qty: 1, uom: 'Lot', price: 80000 }] });
  const srnM1 = addSRN(p1052, { days: -3, desc: 'Survey & design services — milestone M1', value: 20000, status: 'Pending Acceptance' });
  addMS(p1052, [
    { name: 'Survey & Design', pct: 25, status: 'Approved', needs: true, rec: srnM1, files: ['survey-report.pdf'], remarks: 'Survey and layout design complete.', actual: daysFromNow(-5) },
    { name: 'Fit-out Works', pct: 50, needs: true },
    { name: 'Handover', pct: 25, needs: true },
  ]);

  /* PO 60 — services, progressive billing on certified work progress */
  const p1060 = addPO({ num: 1060, sup: 'sup2', title: 'Civil works package', type: 'Services', category: 'Project Services', office: 'o-6314', method: 'Progressive', basis: 'Certified', lines: [{ desc: 'Civil Works Package', qty: 1, uom: 'Lot', price: 100000 }] });
  const pc1 = { id: 'pc-1060-1', poId: p1060.id, seq: 1, number: 'PC-001', period: 'Aug 2026', prevCum: 0, claimedCum: 30000, certified: 30000, evidence: ['measurement-aug.pdf'], status: 'Certified', remarks: '30% physical progress', createdAt: nowISO() };
  const pc2 = { id: 'pc-1060-2', poId: p1060.id, seq: 2, number: 'PC-002', period: 'Sep 2026', prevCum: 30000, claimedCum: 50000, certified: 0, evidence: ['measurement-sep.pdf'], status: 'Submitted', remarks: 'Cumulative progress 50%', createdAt: nowISO() };
  db.claims.push(pc1, pc2); audit(p1060.id, 'PC-001', 'PC-001 certified for INR 30,000.', 'ok'); audit(p1060.id, 'PC-002', 'PC-002 submitted: cumulative INR 50,000 − certified INR 30,000 = current claim INR 20,000.', 'claim');
  const iv = invoice(p1060, { number: 'SFS-2026-0044', days: -20, allocs: [{ kind: 'claim', refId: pc1.id, value: 30000 }] });
  if (iv) { A.approveInvoice(iv.id, 'Verified against PC-001'); A.postInvoice(iv.id); }

  /* a PO awaiting approval */
  addPO({ num: 1061, title: 'Conveyor belt assembly', type: 'Goods', category: 'Machinery & Equipment', office: 'o-6192', method: 'Standard', status: 'Pending Approval', poDays: -2, lines: [{ desc: 'Conveyor Belt Assembly', qty: 5, uom: 'Units', price: 7500 }] });

  db.meta.role = 'admin';
  save();
  return db;
}
