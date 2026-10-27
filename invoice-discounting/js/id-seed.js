/* =====================================================================
   id-seed.js — demo data. Seeds go through the same code paths as live use (Lead API result, callbacks, transaction events),
   so a seeded record can never be in a state the app could not have produced.
   ===================================================================== */
const SCENARIOS = [
  ['default', 'Seeded demo (recommended)', 'Two programmes (one active with SBI + Canara, one waiting for a Bank of Baroda offer), five suppliers in different onboarding states and 18 invoices that each exercise one eligibility rule, plus financing requests at every stage: under review, offer available, funded, settled and declined.'],
  ['A', 'Scenario A — start from scratch', 'No programmes and no supplier profiles. Create the first SID programme, approve it, move it to Active from the Integration console (Sandbox), then enable a supplier and request early payment on an invoice.'],
  ['B', 'Scenario B — no active SID lender', 'Every SID partnership is inactive, so the lender step blocks submission with the "no active partnership" message and the escalation path.'],
];
const ep = daysAgo => Math.floor(Date.now() / 1000) - Math.round(daysAgo * 86400);
const lenderSeed = (id, name, pan, gst, status, products, since, by) => ({ id, name, pan, gst: [gst], partnershipstatus: status, products, statusSince: ep(since), lastUpdatedBy: by, lastUpdatedByEmail: by.toLowerCase().replace(/ /g, '.') + '@psbxchange.example' });
const prod = (code, total, active, totalCp, activeCp) => ({ code, total, active, totalCp, activeCp });
const mkVendor = (id, name, pan, gstin, constitution, doi, industry, address, turnoverCr, contact, bank, udyam) => ({ id, name, pan, gstin, constitution, doi, industry, address, turnoverCr, udyam: udyam || '', contact: { name: contact[0], email: contact[1], mobile: contact[2] }, bank });

function baseDb() {
  const d = {
    meta: { role: 'admin', vendorId: 'VEN-00841', settings: { ...SETTING_DEFAULTS }, delegations: [] }, seq: { id: 0, ref: 0, lead: 0 }, audit: [], events: [], seen: {}, orphans: [], cache: { partnerships: null },
    company: { id: 'BUY-001', name: 'Hindalco Industries Limited', pan: 'AAACH1203D', gstin: '27AAACH1203D1Z4', constitution: 'Company', doi: '1958-12-15', industry: 'Metals & Mining', address: 'Century Bhavan, Mumbai, Maharashtra' },
    vendors: [
      mkVendor('VEN-00841', 'ABC Industries Pvt. Ltd.', 'AAECA1234F', '27AAECA1234F1Z8', 'Company', '2012-04-18', 'Manufacturing', 'Plot 14, Industrial Estate, Pune, Maharashtra', 48, ['Rahul Mehta', 'rahul.mehta@abc.example', '9876501234'], { holder: 'ABC Industries Pvt Ltd', acctMasked: '••••4521', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', verified: true, verifiedAt: new Date().toISOString(), version: 1 }, 'UDYAM-MH-26-0001234'),
      mkVendor('VEN-00842', 'Shree Components Ltd.', 'AAECS5678K', '24AAECS5678K1Z2', 'Company', '2008-09-02', 'Automotive & Components', '12 GIDC Estate, Vadodara, Gujarat', 31, ['Neha Shah', 'neha@shree.example', '9898012345'], { holder: 'Shree Components Ltd', acctMasked: '••••9012', ifsc: 'ICIC0004567', bankName: 'ICICI Bank', verified: false, version: 1 }),
      mkVendor('VEN-00843', 'Mahadev Industrial Supplies', 'AAFFM2345L', '24AAFFM2345L1ZP', 'Firm', '2015-01-20', 'Trading', 'Shop 7, Market Yard, Ahmedabad, Gujarat', 12, ['Mahesh Patel', 'mahesh@mahadev.example', '9811122233'], { holder: 'Mahadev Industrial Supplies', acctMasked: '••••7788', ifsc: 'SBIN0001122', bankName: 'State Bank of India', verified: true, verifiedAt: new Date().toISOString(), version: 1 }),
      mkVendor('VEN-00844', 'Kiran Metals Pvt. Ltd.', 'ABCPK3456M', '27ABCPK3456M1Z9', 'Company', '2010-06-11', 'Metals & Mining', 'B-22, MIDC, Nashik, Maharashtra', 40, ['Kiran Joshi', 'kiran@kiranmetals.example', '9822334455'], { holder: 'Kiran Metals Pvt Ltd', acctMasked: '••••3344', ifsc: 'UTIB0002233', bankName: 'Axis Bank', verified: false, version: 2 }),
      mkVendor('VEN-00845', 'Orion Fasteners Ltd.', 'AAGCO4567N', '29AAGCO4567N1ZB', 'Company', '2005-03-30', 'Manufacturing', '88 Peenya Industrial Area, Bengaluru, Karnataka', 65, ['Asha Rao', 'asha@orion.example', '9900112233'], { holder: 'Orion Fasteners Ltd', acctMasked: '••••5566', ifsc: 'KKBK0003344', bankName: 'Kotak Mahindra Bank', verified: true, verifiedAt: new Date().toISOString(), version: 1 }),
    ],
    programmes: [], profiles: [], invoices: [], requests: [],
    psb: { seq: 1000, leads: {}, custRefs: {}, txns: {}, partnerProducts: ['SID', 'DF', 'VF', 'REVFACT'],     // PID and FACT are not active for this sourcing partner at PSB
      sandbox: { outage: false, fintechActive: true, nextLead: 'success', nextTxn: 'accept', dropNextCallback: false },
      lenders: [
        lenderSeed('LND-SBI-001', 'State Bank of India', 'AAACS8577K', '27AAACS8577K1ZV', 'Active', [prod('SID', 6, 4, null, null), prod('DF', 12, 9, 410, 360), prod('VF', 8, 6, 220, 190)], 120, 'Anil Kulkarni'),
        lenderSeed('LND-CAN-002', 'Canara Bank', 'AAACC6106G', '29AAACC6106G1ZK', 'Active', [prod('SID', 3, 2, null, null), prod('DF', 5, 4, 120, 100)], 95, 'Meera Iyer'),
        lenderSeed('LND-BOB-003', 'Bank of Baroda', 'AAACB1534F', '24AAACB1534F1ZP', 'Active', [prod('SID', 4, 3, null, null), prod('VF', 4, 3, 90, 80)], 80, 'Sanjay Desai'),
        lenderSeed('LND-IND-004', 'Indian Bank', 'AAACI1195H', '33AAACI1195H1ZL', 'Active', [prod('DF', 3, 2, 60, 50), prod('VF', 2, 2, 40, 35)], 60, 'Lakshmi Narayan'),
        lenderSeed('LND-BOM-005', 'Bank of Maharashtra', 'AAACB4171P', '27AAACB4171P1ZQ', 'Pending Approval', [prod('SID', 0, 0, null, null)], 12, 'Pooja Kamat'),
        lenderSeed('LND-UCO-006', 'UCO Bank', 'AAACU5645A', '19AAACU5645A1ZB', 'Pending Signing', [prod('SID', 0, 0, null, null)], 9, 'Debashis Roy'),
        lenderSeed('LND-UBI-007', 'Union Bank of India', 'AAACU0564C', '27AAACU0564C1ZN', 'WIP', [prod('SID', 0, 0, null, null)], 4, 'Rohit Verma'),
        lenderSeed('LND-PNB-008', 'Punjab National Bank', 'AAACP0165G', '07AAACP0165G1ZD', 'Rejected', [prod('SID', 0, 0, null, null)], 30, 'Gurpreet Singh'),
        lenderSeed('LND-CBI-009', 'Central Bank of India', 'AAACC6140E', '27AAACC6140E1ZC', 'In Active', [prod('SID', 2, 0, null, null)], 200, 'Ritu Agarwal'),
      ],
      additionalLenders: [
        { id: 'LND-BOI-101', name: 'Bank of India', pan: 'AAACB0448C', gst: ['27AAACB0448C1ZX'], onboarded: ep(300), active: true, products: [{ code: 'SID', partners: 3, active: 2 }, { code: 'PID', partners: 2, active: 1 }] },
        { id: 'LND-FED-102', name: 'Federal Bank', pan: 'AAACT6277R', gst: ['32AAACT6277R1ZE'], onboarded: ep(220), active: true, products: [{ code: 'SID', partners: 5, active: 4 }, { code: 'FACT', partners: 1, active: 1 }] },
        { id: 'LND-KAR-103', name: 'Karnataka Bank', pan: 'AAACK4264F', gst: ['29AAACK4264F1ZJ'], onboarded: ep(150), active: true, products: [{ code: 'DF', partners: 2, active: 2, activeCp: 40 }] },
        { id: 'LND-OLD-104', name: 'Dormant Finance Ltd', pan: 'AAACD9999Q', gst: ['27AAACD9999Q1ZA'], onboarded: ep(500), active: false, products: [{ code: 'SID', partners: 0, active: 0 }] },
      ] },
  };
  return d;
}

const inv = (n, vendorId, amount, dueDays, o = {}) => ({ id: 'inv' + n, number: `INV-2026-${n}`, vendorId, buyer: 'Hindalco Industries Limited', date: daysFromNow(o.ageDays != null ? -o.ageDays : -20), due: daysFromNow(dueDays), amount, currency: o.currency || 'INR',
  po: `PO-HIN-000${n - 200}`, grn: `GRN-HIN-000${n - 281}`, match: { status: o.match || 'Passed', variancePct: o.variance || 0 }, approval: o.approval || 'Approved', approvedAt: nowISO(), payment: o.payment || { state: 'Unpaid' },
  dispute: o.dispute || { open: false }, paymentBlock: !!o.block, adjustments: o.adj || [], pc: { state: 'OPEN' } });

function seedDb(kind = 'default') {
  db = baseDb();
  if (kind === 'B') db.psb.lenders.forEach(l => { l.products = l.products.filter(p => p.code !== 'SID'); });
  fetchPartnerships(true);
  const prgForm = (f) => ({ ...newPrgForm(), ...f });
  const person = { name: 'Priya Sharma', mobile: '9876543210', email: 'priya.sharma@hindalco.example', vertical: 'Finance', designation: 'Treasury Head', onboarding: 'Yes' };
  const mkPrg = (lenders, f, advance) => {
    const saved = saveProgrammeDraft(null, prgForm({ authPersons: [person], externalRating: 'AA', ratingAgency: 'CRISIL', ratingDate: '2026-04-01', prospectiveCps: 250, avgCpLimit: 100, lenders, ...f }));
    const prg = saved.prg; db.meta.settings.requireInternalApproval = false;
    const r = submitProgramme(prg.id); db.meta.settings.requireInternalApproval = true;
    if (!r.ok) throw new Error('seed programme failed: ' + (r.errors || [r.msg]).join('; '));
    Object.entries(advance).forEach(([lid, path]) => path.forEach(t => psbAdvance(prg.psb.psbPlatformId, lid, t, { silent: true })));
    Object.keys(advance).forEach(lid => { const lead = db.psb.leads[prg.psb.psbPlatformId], row = lenderRow(prg, lid); row.updatedAt = 0; applyStatusBody(prg, lid, statusBody(lead, lid, 'SEED'), 'Status Callback'); });
    return prg;
  };
  // ---- invoices: each one exercises one rule ----
  db.invoices.push(
    inv(1042, 'VEN-00841', 1000000, 60), inv(1043, 'VEN-00842', 650000, 55), inv(1044, 'VEN-00841', 420000, 70, { match: 'Failed' }), inv(1045, 'VEN-00841', 310000, 65, { approval: 'Pending' }),
    inv(1046, 'VEN-00841', 275000, 62, { payment: { state: 'Scheduled', on: daysFromNow(62) } }), inv(1047, 'VEN-00841', 800000, 58, { dispute: { open: true, reason: 'Short supply of 40 units disputed by the buyer' } }),
    inv(1048, 'VEN-00841', 550000, 64, { adj: [{ id: 'cn1', type: 'Credit note', amount: 25000, status: 'Unresolved', at: stamp() }] }), inv(1049, 'VEN-00841', 90000, 60),
    inv(1050, 'VEN-00841', 1200000, 3), inv(1056, 'VEN-00841', 1400000, 400), inv(1057, 'VEN-00844', 380000, 60), inv(1058, 'VEN-00845', 520000, 60), inv(1060, 'VEN-00841', 550000000, 90), inv(1061, 'VEN-00841', 12000, 60, { currency: 'USD' }),
    inv(1051, 'VEN-00841', 900000, 45), inv(1052, 'VEN-00841', 720000, 50), inv(1053, 'VEN-00841', 600000, 52), inv(1054, 'VEN-00841', 1500000, 30), inv(1059, 'VEN-00841', 480000, 48), inv(1062, 'VEN-00843', 260000, 61));
  if (kind === 'default') {
    const active = ['Match Found', 'Match Selected', 'Offers Awaited', 'Offers Submitted', 'Offer Accepted', 'Active'];
    const p1 = mkPrg(['LND-SBI-001', 'LND-CAN-002'], { minLimit: 500, maxLimit: 2500, minRoi: 8.5, maxRoi: 12, creditPeriod: 90 }, { 'LND-SBI-001': active, 'LND-CAN-002': active });
    getPrg(p1.id).lenders.forEach(l => { l.program.outstandingBase = l.lenderId === 'LND-SBI-001' ? 42000000 : 0; });
    mkPrg(['LND-BOB-003'], { minLimit: 200, maxLimit: 1000, minRoi: 9, maxRoi: 11.5, creditPeriod: 60, avgCpLimit: 80, prospectiveCps: 120 }, { 'LND-BOB-003': ['Match Found', 'Match Selected', 'Offers Awaited'] });
    const mkProfile = (vid, status, o) => { const v = getVendor(vid); db.profiles.push({ id: uid('sp'), vendorId: vid, programmeId: p1.id, status, kyc: 'Verified', bank: 'Verified', missing: [], reason: '', consent: { dataVersion: DATA_CONSENT_VERSION, termsVersion: TERMS_VERSION, at: stamp(), by: v.name + ' (vendor portal)', channel: 'DICE vendor portal' }, bankVersion: v.bank.version, history: [{ at: stamp(), by: 'System', text: `Seeded as ${status}` }], form: newSupplierForm(vid, p1.id), ...o }); };
    mkProfile('VEN-00841', SUP.ELIGIBLE);
    mkProfile('VEN-00842', SUP.ONBOARDING, { kyc: 'In review', bank: 'Pending verification', bankVersion: 1 });
    mkProfile('VEN-00844', SUP.ACTION, { bank: 'Failed', missing: ['Re-enter bank details'], reason: 'Penny-drop verification failed — the account name does not match', bankVersion: 1 });
    mkProfile('VEN-00845', SUP.SUSPENDED, { reason: 'Paused by the lender pending a credit review' });
    const consent = inv => ({ terms: true, data: true, snapshot: eligibility(inv).snapshot });
    const flow = (n, path) => { const i = getInv('inv' + n), r = createFinanceRequest(i.id, consent(i)); if (!r.ok) throw new Error('seed request ' + n + ': ' + (r.errors || [r.msg]).join('; ')); const req = r.req;
      path.forEach(([state, data]) => { if (state === 'ACCEPT') acceptOffer(req.id, req.offers[0].offerId, true); else psbTxnEvent(req.txnId, state, data || {}); }); return req; };
    flow(1051, [['UNDER_REVIEW'], ['OFFER_AVAILABLE'], ['ACCEPT'], ['FUNDED'], ['SETTLEMENT_PENDING']]);
    flow(1052, [['UNDER_REVIEW']]);
    flow(1053, [['UNDER_REVIEW'], ['OFFER_AVAILABLE']]);
    flow(1054, [['UNDER_REVIEW'], ['OFFER_AVAILABLE'], ['ACCEPT'], ['FUNDED'], ['SETTLEMENT_PENDING'], ['SETTLED']]);
    flow(1059, [['UNDER_REVIEW'], ['DECLINED', { reason: 'Declined by lender credit policy: supplier concentration limit reached' }]]);
  }
  db.events = []; db.audit = db.audit.slice(0, 40); db.meta.role = 'admin'; db.meta.dupBlocked = 0;
  return db;
}
