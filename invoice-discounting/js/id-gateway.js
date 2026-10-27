/* =====================================================================
   id-gateway.js — in-browser stand-in for PSBXchange (and the lender transaction route).
   - Request/response shapes for Lead, Get Status, Get Partnerships Details and Get Additional Lenders follow the workbook exactly.
   - The gateway keeps its OWN state (db.psb) separate from DICE's records, so a lost response or a dropped callback is a
     real situation that DICE must recover from with Get Status / reconciliation.
   - Transaction Initiate + Transaction Status Callback are NOT specified in the workbook (only listed in its index). They are
     implemented below as a clearly-marked PROVISIONAL adapter contract, built only from the fields the PRD says the
     partner needs. Replace txnAdapter when the real contract arrives.
   - Error codes are illustrative: the workbook says "custom error code" but publishes no code list.
   ===================================================================== */
const PSB_BASE = '{PSB_BASE_URL}';        // the workbook gives no host or path — configured per environment
const TXN_PROVISIONAL = 'PROVISIONAL — Transaction Initiate / Transaction Status Callback schemas are not in workbook v1.1';
const ERR = {
  FINTECH: 'PSB-1001', PRODUCT_INACTIVE: 'PSB-1002', PRODUCT_LEADTYPE: 'PSB-1003', FIELD: 'PSB-1004', LENDER: 'PSB-1005', DUP_LEAD: 'PSB-1006', DUP_ACTIVE: 'PSB-1007', CUSTREF_REUSE: 'PSB-1008',
  STUCK: 'PSB-1010', SYSTEM: 'PSB-1099',
};

/* ---------- logging ---------- */
function logEvent(e) {
  const ev = { id: uid('ev'), at: nowISO(), retry: 0, ...e };
  db.events.unshift(ev); if (db.events.length > 400) db.events.length = 400;
  return ev;
}
const maskPayload = o => JSON.parse(JSON.stringify(o, (k, v) => (['finalmou', 'finalsanctionletter'].includes(k) && v ? `[base64 ${String(v).length} chars]` : /^(authorizedpersonmobileno|sourcingpartnerspocmobileno|acct|account)$/i.test(k) && v ? String(v).replace(/.(?=.{3})/g, '•') : v)));
const sandbox = () => db.psb.sandbox;
const psbRef = (p, w = 6) => `${p}${String(++db.psb.seq).padStart(w, '0')}`;

/* one HTTP-like call from DICE to PSB. handler(req) -> { http, body, lost? } ; `lost` = processed on the server but the response never arrived */
function psbCall(api, request, handler, meta = {}) {
  const sb = sandbox(), corr = request.customerreferenceid || request.psbleadid || meta.corr || '—';
  if (sb.outage) {
    const body = { status: '503', message: 'PSBXchange is temporarily unavailable' };
    logEvent({ api, dir: 'out', corr, http: 503, ok: false, summary: 'Service unavailable (sandbox outage)', req: maskPayload(request), res: body, meta });
    return { http: 503, body, ok: false, outage: true };
  }
  const r = handler(request);
  if (r.lost) {
    logEvent({ api, dir: 'out', corr, http: 0, ok: false, summary: 'Timed out after 30 s — the server DID process the request but the response was lost', req: maskPayload(request), res: null, meta: { ...meta, serverProcessed: true } });
    return { http: 0, timeout: true, ok: false, body: null };
  }
  const ok = r.http >= 200 && r.http < 300 && !r.softFail;
  logEvent({ api, dir: 'out', corr, http: r.http, ok, summary: r.summary || (ok ? 'OK' : 'Rejected'), req: maskPayload(request), res: maskPayload(r.body), meta });
  return { http: r.http, ok, body: r.body };
}
const badReq = (message, extra = {}) => ({ http: 400, body: { status: '400', message, ...extra }, summary: message });

/* ---------- Get Partnerships Details API ---------- */
const PARTNERSHIP_STATUSES = ['Active', 'In Active', 'Pending Approval', 'Pending Signing', 'WIP', 'Rejected'];
function apiGetPartnerships(request, meta) {
  return psbCall('Get Partnerships Details API', request, req => {
    const f = [];
    if (isBlank(req.psbidentifier)) f.push('psbidentifier is mandatory'); else if (req.psbidentifier !== db.meta.settings.fintechPsbId) f.push('psbidentifier is not a registered sourcing partner');
    if (isBlank(req.partnershipstatus) || !Array.isArray(req.partnershipstatus) || !req.partnershipstatus.length) f.push('partnershipstatus is mandatory (a list; ALL or one or more statuses)');
    if (isBlank(req.customerreferenceid)) f.push('customerreferenceid is mandatory'); else if (!RX.custRef.test(req.customerreferenceid)) f.push('customerreferenceid must be alphanumeric, max 32');
    if (f.length) return badReq(f.join('; '));
    const want = req.partnershipstatus.map(s => String(s).toLowerCase());
    const bad = want.filter(s => s !== 'all' && !PARTNERSHIP_STATUSES.some(p => p.toLowerCase() === s));
    if (bad.length) return badReq(`Unknown partnershipstatus value(s): ${bad.join(', ')}`);
    const all = want.includes('all');                                  // ALL supersedes the other filters
    const rows = db.psb.lenders.filter(l => all || want.includes(l.partnershipstatus.toLowerCase()));
    return { http: 200, summary: `${rows.length} partnership(s)`, body: { status: '200', message: 'Success', customerreferenceid: req.customerreferenceid, partnershipdetails: rows.map(l => ({
      lendername: l.name, lenderpannumber: l.pan, lendergstdetails: l.gst.map(g => ({ gstnumber: g })), lenderpsbidentifier: l.id, partnershipstatus: l.partnershipstatus,
      products: l.products.map(p => ({ productcode: p.code, totalprogramcount: p.total, activeprogramcount: p.active, totalchannelpartnercount: SPECIAL_PRODUCTS.includes(p.code) ? null : p.totalCp, activechannelpartnercount: SPECIAL_PRODUCTS.includes(p.code) ? null : p.activeCp })),
      currentstatusupdatedate: l.statusSince, lastupdatedby: l.lastUpdatedBy, lastupdatedbyemailid: l.lastUpdatedByEmail })) } };
  }, meta);
}

/* ---------- Get Additional Lenders on PSB API ---------- */
function apiGetAdditionalLenders(request, meta) {
  return psbCall('Get Additional Lenders on PSB API', request, req => {
    const f = [];
    if (isBlank(req.psbidentifier)) f.push('psbidentifier is mandatory'); else if (req.psbidentifier !== db.meta.settings.fintechPsbId) f.push('psbidentifier is not a registered sourcing partner');
    if (isBlank(req.customerreferenceid)) f.push('customerreferenceid is mandatory'); else if (!RX.custRef.test(req.customerreferenceid)) f.push('customerreferenceid must be alphanumeric, max 32');
    if (!Array.isArray(req.filterproductcode) || !req.filterproductcode.length) f.push('filterproductcode is mandatory (a list; ALL or product codes)');
    if (f.length) return badReq(f.join('; '));
    const want = req.filterproductcode.map(s => String(s).toUpperCase());
    const rows = db.psb.additionalLenders.filter(l => l.active && (want.includes('ALL') || l.products.some(p => want.includes(p.code))));
    return { http: 200, summary: `${rows.length} additional lender(s)`, body: { status: '200', message: 'Success', customerreferenceid: req.customerreferenceid, countofuniquesourcingpartnerspartnered: 14, additionallenderdetails: rows.map(l => ({
      lendername: l.name, lenderpannumber: l.pan, lendergstdetails: l.gst.map(g => ({ gstnumber: g })), lenderpsbidentifier: l.id, lenderonboardingdate: l.onboarded,
      activeproductslist: l.products.map(p => ({ productcodes: p.code, sourcingpartnerspartnered: p.partners, activeprogramcount: p.active, activechannelpartnercount: SPECIAL_PRODUCTS.includes(p.code) ? null : p.activeCp })) })) } };
  }, meta);
}

/* ---------- Lead API ---------- */
const leadResult = (req, overall, ld) => ({ customerreferenceid: req.customerreferenceid, overallbulkuploadstatus: overall, leaddetails: [ld], responsetimestamp: epochNow() });
function apiLead(request, meta) {
  const out = psbCall('Lead API', request, req => {
    const sb = sandbox(), mode = sb.nextLead; sb.nextLead = 'success';           // one-shot
    const l = (req.leaddetails || [])[0] || {}, unit = db.meta.settings.epochUnit;
    const fail = (code, msg, http = 200) => ({ http, softFail: true, summary: `Failure ${code}`, body: leadResult(req, 'Failure', { leadstatus: 'Failure', psbplatformid: null, errorcode: code, errormessage: msg, sourcingpartnerleadid: l.sourcingpartnerleadid ?? null, leadtimestamp: epochNow() }) });
    if (mode === 'api500') return { http: 500, body: { status: '500', message: 'Internal server error' }, summary: 'HTTP 500' };
    if (isBlank(req.customerreferenceid) || !RX.custRef.test(req.customerreferenceid)) return badReq('customerreferenceid is mandatory and must be alphanumeric, max 32');
    if (req.fintechpsbplatformid !== db.meta.settings.fintechPsbId || !sb.fintechActive) return fail(ERR.FINTECH, sb.fintechActive ? 'fintechpsbplatformid is not a valid sourcing partner on PSBXchange' : 'Sourcing partner is not in Active state on PSBXchange');
    const errs = validateLeadPayload(req, { epochUnit: unit });
    if (errs.length) return fail(ERR.FIELD, errs.map(e => `[${e.key}${e.idx != null ? '#' + e.idx : ''}] ${e.msg}`).join('; '));
    if (!db.psb.partnerProducts.includes(l.productcode)) return fail(ERR.PRODUCT_INACTIVE, `Product ${l.productcode} is not active for this sourcing partner`);
    if (mode === 'serverRule') return fail(ERR.FIELD, '[leadindustryclassification] Value is not present in the PSB Industry Master');
    // idempotency on customerreferenceid
    const prev = db.psb.custRefs[req.customerreferenceid];
    if (prev) {
      if (prev.spLeadId !== l.sourcingpartnerleadid) return fail(ERR.CUSTREF_REUSE, 'customerreferenceid was already used for a different lead');
      if (db.psb.leads[prev.psbId]) return { http: 200, summary: 'Replay of earlier successful request (idempotent)', body: prev.response };
    }
    const dup = Object.values(db.psb.leads).find(x => x.spLeadId === l.sourcingpartnerleadid);
    if (dup) return fail(ERR.DUP_LEAD, 'sourcingpartnerleadid already exists on PSBXchange');
    for (const c of l.chooselenders) {
      const len = db.psb.lenders.find(x => x.id === c.lenderpsbplatformid);
      if (!len) return fail(ERR.LENDER, `Lender ${c.lenderpsbplatformid} is not on PSBXchange`);
      if (len.partnershipstatus !== 'Active' || !len.products.some(p => p.code === l.productcode)) return fail(ERR.LENDER, `${len.name} has no active ${l.productcode} partnership with this sourcing partner`);
    }
    const clash = Object.values(db.psb.leads).find(x => x.pan === l.anchorpannumber && x.product === l.productcode && l.chooselenders.some(c => x.lenders[c.lenderpsbplatformid]));
    if (clash) return fail(ERR.DUP_ACTIVE, `An active ${l.productcode} lead already exists for PAN ${l.anchorpannumber} with the selected lender(s)`);
    if (mode === 'draft') return { http: 200, softFail: true, summary: 'Draft — lead creation stuck', body: leadResult(req, 'Partial Success', { leadstatus: 'Draft', psbplatformid: null, errorcode: ERR.STUCK, errormessage: 'Lead creation is incomplete; additional information is required on the PSB Platform', sourcingpartnerleadid: l.sourcingpartnerleadid, leadtimestamp: epochNow() }) };
    const psbId = psbRef('PSBL'), now = epochNow();
    const lead = { id: psbId, custRef: req.customerreferenceid, spLeadId: l.sourcingpartnerleadid, pan: l.anchorpannumber, product: l.productcode, leadtype: 'Program Lead', leadname: l.leadname, payload: JSON.parse(JSON.stringify(req)), createdAt: now,
      lenders: Object.fromEntries(l.chooselenders.map(c => [c.lenderpsbplatformid, { stage: 'Opportunities', status: 'In Progress', updatedAt: now, history: [{ stage: 'Opportunities', status: 'In Progress', at: now }] }])) };
    db.psb.leads[psbId] = lead;
    const response = leadResult(req, 'Success', { leadstatus: 'Active', psbplatformid: psbId, errorcode: null, errormessage: null, sourcingpartnerleadid: l.sourcingpartnerleadid, leadtimestamp: now });
    db.psb.custRefs[req.customerreferenceid] = { spLeadId: l.sourcingpartnerleadid, psbId, response };
    if (mode === 'timeout') return { lost: true };
    return { http: 200, summary: `Lead created ${psbId}`, body: response };
  }, meta);
  return out;
}

/* ---------- Get Status API ---------- */
const STATUS_ORDER = ['Lead', 'Opportunities', 'Matches', 'Offers', 'Program', 'Channel Partner'];
const OFFER_STATUSES = ['Offers Submitted', 'Offer Accepted', 'Offer Rejected', 'Offer Expired', 'Customer Rejected'];
function statusBody(lead, lenderId, custRef) {
  const ls = lead.lenders[lenderId], len = db.psb.lenders.find(x => x.id === lenderId), special = SPECIAL_PRODUCTS.includes(lead.product);
  const b = { status: '200', message: 'Success', customerreferenceid: custRef, psbleadid: lead.id, psbleadtype: lead.leadtype, productcode: lead.product, psbstage: ls.stage, psbsourcingpartnerstatus: ls.status, psblaststatusupdatedate: ls.updatedAt, lenderpsbplatformid: lenderId };
  if (ls.stage === 'Matches' && ls.status === 'Match Found') b.matches = { matchedlendername: len.name, matchedlenderpsbplatformid: lenderId, matchtimestamp: ls.updatedAt };
  if (ls.stage === 'Matches' && ls.status === 'Match Selected') b.selectedmatches = { matchedlendername: len.name, matchedlenderpsbplatformid: lenderId, matchtimestamp: ls.updatedAt };
  if (ls.stage === 'Offers' && OFFER_STATUSES.includes(ls.status) && ls.offer) b.offerdetails = [{ lendername: len.name, lenderpsbplatformid: lenderId, lenderoffertimestamp: ls.offer.at, offerstatus: ls.status === 'Offer Accepted' ? 'Selected' : ls.status === 'Offers Submitted' ? 'Submitted' : 'Rejected', psbofferexpiryperiod: ls.offer.expiryDays,
    lenderprogramname: ls.offer.name, programlimit: ls.offer.limit, programroi: ls.offer.roi, programroibenchmarkcode: ls.offer.benchmark, psbroispread: ls.offer.spread, programtenor: ls.offer.tenor, programinteresttype: ls.offer.interestType,
    programgraceperiodapplicable: ls.offer.graceDays ? 'Yes' : 'No', programgraceperioddays: ls.offer.graceDays, programfldgapplicable: ls.offer.fldg ? 'Yes' : 'No', programfldgpercentage: ls.offer.fldg, programpenalinterestrate: ls.offer.penal, conditiondescription: ls.offer.terms,
    ...(special ? {} : { programstopsupplyapplicable: ls.offer.stopSupplyDays ? 'Yes' : 'No', programstopsupplydays: ls.offer.stopSupplyDays, minchannelpartnerlimit: ls.offer.minCp, maxchannelpartnerlimit: ls.offer.maxCp }) }];
  if (ls.stage === 'Program' && ls.program) { const p = ls.program;
    b.psbprogramid = p.id;
    b.psbprogramdetails = { lenderprogramname: p.name, programlimit: p.limit, programroi: p.roi, programroibenchmarkcode: p.benchmark, psbroispread: p.spread, programtenor: p.tenor, programinteresttype: p.interestType,
      programgraceperiodapplicable: p.graceDays ? 'Yes' : 'No', programgraceperioddays: p.graceDays, programfldgapplicable: p.fldg ? 'Yes' : 'No', programfldgpercentage: p.fldg, programpenalinterestrate: p.penal,
      ...(special ? {} : { programstopsupplyapplicable: p.stopSupplyDays ? 'Yes' : 'No', programstopsupplydays: p.stopSupplyDays, minchannelpartnerlimit: p.minCp, maxchannelpartnerlimit: p.maxCp }) };
    b.programkeytermsandconditions = { conditiondescription: p.terms }; b.finalmou = p.mou; b.programsanctiondate = p.sanctionDate; }
  return b;
}
function apiGetStatus(request, meta) {
  return psbCall('Get Status API', request, req => {
    const f = []; ['psbleadid', 'fintechpsbplatformid', 'lenderpsbplatformid', 'customerreferenceid'].forEach(k => { if (isBlank(req[k])) f.push(`${k} is mandatory`); });
    if (!isBlank(req.customerreferenceid) && !RX.custRef.test(req.customerreferenceid)) f.push('customerreferenceid must be alphanumeric, max 32');
    if (f.length) return badReq(f.join('; '));
    if (req.fintechpsbplatformid !== db.meta.settings.fintechPsbId) return { http: 401, body: { status: '401', message: 'fintechpsbplatformid is not authorised' }, summary: 'Unauthorised' };
    const lead = db.psb.leads[req.psbleadid];
    if (!lead) return { http: 404, body: { status: '404', message: 'psbleadid is not a valid PSB Platform Program ID / Channel Partner ID', customerreferenceid: req.customerreferenceid }, summary: 'Lead not found' };
    if (!lead.lenders[req.lenderpsbplatformid]) return { http: 404, body: { status: '404', message: 'The lead was not sent to this lender', customerreferenceid: req.customerreferenceid }, summary: 'Lender not on lead' };
    const body = statusBody(lead, req.lenderpsbplatformid, req.customerreferenceid);
    return { http: 200, body, summary: `${body.psbstage} · ${body.psbsourcingpartnerstatus}` };
  }, meta);
}

/* ---------- PSB-side lifecycle (the part DICE cannot control) ---------- */
const PSB_FLOW = {
  'In Progress': ['Match Found', 'No Match Found'], 'Match Found': ['Match Selected', 'Customer Rejected'], 'No Match Found': [], 'Match Selected': ['Offers Awaited', 'Customer Rejected'],
  'Offers Awaited': ['Offers Submitted', 'Lender Rejected'], 'Offers Submitted': ['Offer Accepted', 'Offer Rejected', 'Offer Expired', 'Customer Rejected'],
  'Offer Expired': ['Offers Submitted', 'Offer Rejected'], 'Offer Accepted': ['Active'], 'Active': ['In Active'], 'In Active': ['Active'],
  'Customer Rejected': [], 'Lender Rejected': [], 'Offer Rejected': [],
};
const STAGE_OF = { 'In Progress': 'Opportunities', 'Match Found': 'Matches', 'No Match Found': 'Matches', 'Match Selected': 'Matches', 'Offers Awaited': 'Offers', 'Offers Submitted': 'Offers', 'Lender Rejected': 'Offers', 'Customer Rejected': 'Offers',
  'Offer Accepted': 'Offers', 'Offer Rejected': 'Offers', 'Offer Expired': 'Offers', 'Active': 'Program', 'In Active': 'Program' };
const nextPsbStatuses = status => PSB_FLOW[status] || [];
const LENDER_RATE = { default: { benchmark: 'MCLR-3M', base: 8.2, spread: 1.5, interestType: 'Front' } };
function psbBuildOffer(lead, lenderId) {
  const p = lead.payload.leaddetails[0], idx = Object.keys(lead.lenders).indexOf(lenderId), k = LENDER_RATE.default, special = SPECIAL_PRODUCTS.includes(lead.product);
  const spread = r2(k.spread + idx * 0.25), roi = r2(k.base + spread);
  return { at: epochNow(), expiryDays: 15, name: `${p.leadname} ${lead.product} Programme`, limit: lakhsToRupees(Math.round(p.leadmaxexpectedlimit * (1 - idx * 0.1))), roi, benchmark: k.benchmark, spread, tenor: p.creditperiod, interestType: k.interestType,
    graceDays: 5, fldg: 0, penal: 2, terms: 'Sanction subject to execution of MOU, buyer acknowledgement of assigned receivables and satisfactory KYC of onboarded suppliers.', ...(special ? {} : { stopSupplyDays: 30, minCp: 500000, maxCp: 50000000 }) };
}
function psbAdvance(psbId, lenderId, target, opts = {}) {
  const lead = db.psb.leads[psbId]; if (!lead) return { ok: false, msg: 'Unknown PSB lead' };
  const ls = lead.lenders[lenderId]; if (!ls) return { ok: false, msg: 'Lender not on lead' };
  if (!nextPsbStatuses(ls.status).includes(target)) return { ok: false, msg: `PSB does not allow ${ls.status} → ${target}` };
  const now = epochNow() + (opts.skew || 0);
  if (target === 'Offers Submitted') ls.offer = psbBuildOffer(lead, lenderId);
  if (target === 'Offer Expired' && ls.offer) ls.offer.expired = true;
  if (target === 'Active') {
    const o = ls.program ? null : ls.offer || psbBuildOffer(lead, lenderId), seq = psbRef('', 4);
    if (o) ls.program = { id: `PSB-${lead.product}-${seq}`, name: o.name, limit: o.limit, roi: o.roi, benchmark: o.benchmark, spread: o.spread, tenor: o.tenor, interestType: o.interestType, graceDays: o.graceDays, fldg: o.fldg, penal: o.penal, terms: o.terms, stopSupplyDays: o.stopSupplyDays, minCp: o.minCp, maxCp: o.maxCp,
      mou: btoa(`%PDF-1.4 sample MOU for ${lead.leadname} / ${lead.id}`), sanctionDate: now, activationDate: now, outstanding: 0 };
  }
  ls.status = target; ls.stage = STAGE_OF[target]; ls.updatedAt = now; ls.history.push({ stage: ls.stage, status: target, at: now });
  const len = db.psb.lenders.find(x => x.id === lenderId);
  if (target === 'Active' && len) { const pr = len.products.find(p => p.code === lead.product); if (pr) { pr.total++; pr.active++; } }
  if (opts.silent) return { ok: true, msg: target, delivery: 'silent' };
  logEvent({ api: 'PSB lifecycle (sandbox)', dir: 'psb', corr: lead.custRef, http: 200, ok: true, summary: `${len ? len.name : lenderId}: ${ls.stage} · ${target}`, req: { psbplatformid: psbId, lenderpsbplatformid: lenderId, action: target }, res: null });
  const delivery = psbDeliverCallback(psbId, lenderId, opts);
  return { ok: true, msg: `${len ? len.name : lenderId} → ${target}`, delivery };
}
/* PSB -> DICE "Status Callback". The sheet says the payload is the Get Status response. */
function psbDeliverCallback(psbId, lenderId, opts = {}) {
  const lead = db.psb.leads[psbId]; if (!lead) return 'no-lead';
  const body = statusBody(lead, lenderId, psbRef('PSBCB', 10));
  const sb = sandbox();
  if (opts.drop || sb.dropNextCallback) { sb.dropNextCallback = false; logEvent({ api: 'Status Callback', dir: 'in', corr: lead.custRef, http: 0, ok: false, summary: 'Callback was NOT delivered (dropped by sandbox) — recover with Get Status', req: body, res: null, meta: { dropped: true } }); return 'dropped'; }
  const hdr = { 'X-Callback-Signature': opts.badSignature ? 'sha256=forged' : 'sha256=' + simpleHash(JSON.stringify(body).slice(0, 80) + db.meta.settings.callbackSecret) };
  const r = receiveStatusCallback(body, hdr);
  if (opts.duplicate) receiveStatusCallback(body, hdr);
  return r.ok ? 'delivered' : 'rejected';
}
function simpleHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }
const callbackSig = body => 'sha256=' + simpleHash(JSON.stringify(body).slice(0, 80) + db.meta.settings.callbackSecret);

/* ======================================================================
   PROVISIONAL transaction route (schemas NOT in the workbook).
   Request fields = those listed in the PRD "API trigger matrix" for Transaction Initiate. Nothing else is invented.
   ====================================================================== */
const TXN_STATES = ['RECEIVED', 'UNDER_REVIEW', 'OFFER_AVAILABLE', 'ACCEPTED', 'FUNDED', 'SETTLEMENT_PENDING', 'SETTLED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'EXCEPTION'];
const TXN_FLOW = {
  RECEIVED: ['UNDER_REVIEW', 'DECLINED', 'CANCELLED'], UNDER_REVIEW: ['OFFER_AVAILABLE', 'DECLINED', 'CANCELLED'], OFFER_AVAILABLE: ['ACCEPTED', 'EXPIRED', 'DECLINED', 'CANCELLED'],
  ACCEPTED: ['FUNDED', 'DECLINED', 'EXCEPTION'], FUNDED: ['SETTLEMENT_PENDING', 'EXCEPTION'], SETTLEMENT_PENDING: ['SETTLED', 'EXCEPTION'], SETTLED: [], DECLINED: [], EXPIRED: [], CANCELLED: [], EXCEPTION: ['SETTLED', 'CANCELLED'],
};
const TXN_REQUIRED = ['diceRequestId', 'idempotencyKey', 'invoiceId', 'invoiceNumber', 'invoiceAmount', 'currency', 'dueDate', 'buyerId', 'supplierId', 'programmeId', 'evidence'];
const txnAdapter = {
  contract: TXN_PROVISIONAL,
  initiate(payload, meta) {
    return psbCall('Transaction Initiate API (provisional)', { ...payload, customerreferenceid: payload.diceRequestId }, req => {
      const sb = sandbox(), mode = sb.nextTxn; sb.nextTxn = 'accept';
      if (mode === 'api500') return { http: 500, body: { status: '500', message: 'Internal server error' }, summary: 'HTTP 500 — nothing created' };
      const miss = TXN_REQUIRED.filter(k => isBlank(payload[k])); if (miss.length) return badReq(`Missing: ${miss.join(', ')}`);
      if (mode === 'reject') return { http: 422, body: { status: '422', code: 'SUPPLIER_NOT_ONBOARDED', message: 'Supplier is not onboarded for this programme at the lender' }, summary: 'Rejected: SUPPLIER_NOT_ONBOARDED' };
      const prev = Object.values(db.psb.txns).find(t => t.idempotencyKey === payload.idempotencyKey);
      if (prev) return { http: 200, summary: 'Replay (idempotent)', body: { transactionId: prev.id, status: prev.state, diceRequestId: prev.diceRequestId, receivedAt: prev.createdAt } };
      const id = psbRef('TXN', 7), now = nowISO();
      db.psb.txns[id] = { id, idempotencyKey: payload.idempotencyKey, diceRequestId: payload.diceRequestId, payload, state: 'RECEIVED', createdAt: now, events: [{ state: 'RECEIVED', at: now }] };
      if (mode === 'timeout') return { lost: true };
      return { http: 202, summary: `Accepted ${id}`, body: { transactionId: id, status: 'RECEIVED', diceRequestId: payload.diceRequestId, receivedAt: now } };
    }, { ...meta, provisional: true });
  },
  status(q, meta) {      // transaction status query (poll). q: { transactionId? , idempotencyKey? , diceRequestId }
    return psbCall('Transaction Status Query (provisional)', { ...q, customerreferenceid: q.diceRequestId }, req => {
      const t = db.psb.txns[req.transactionId] || Object.values(db.psb.txns).find(x => x.idempotencyKey === req.idempotencyKey);
      if (!t) return { http: 404, body: { status: '404', code: 'NOT_FOUND', message: 'No transaction exists for this reference' }, summary: 'NOT_FOUND — no such transaction' };
      return { http: 200, summary: t.state, body: txnBody(t) };
    }, { ...meta, provisional: true });
  },
  accept(q, meta) { return txnAction('Transaction Accept Offer (provisional)', q, 'ACCEPTED', meta); },
  cancel(q, meta) { return txnAction('Transaction Cancel (provisional)', q, 'CANCELLED', meta); },
  amend(q, meta) {
    return psbCall('Transaction Amend (provisional)', { ...q, customerreferenceid: q.diceRequestId }, req => {
      const t = db.psb.txns[req.transactionId]; if (!t) return { http: 404, body: { status: '404', code: 'NOT_FOUND', message: 'No transaction' }, summary: 'NOT_FOUND' };
      if (['FUNDED', 'SETTLEMENT_PENDING', 'SETTLED'].includes(t.state)) return { http: 409, body: { status: '409', code: 'ALREADY_FUNDED', message: 'Funded transaction cannot be amended — open an exception' }, summary: 'ALREADY_FUNDED' };
      t.payload = { ...t.payload, ...req.changes }; t.events.push({ state: t.state, at: nowISO(), note: 'amended' });
      return { http: 200, summary: 'Amended', body: txnBody(t) };
    }, { ...meta, provisional: true });
  },
};
const txnBody = t => ({ transactionId: t.id, diceRequestId: t.diceRequestId, status: t.state, updatedAt: t.events[t.events.length - 1].at, ...(t.offers ? { offers: t.offers } : {}), ...(t.acceptedOfferId ? { acceptedOfferId: t.acceptedOfferId } : {}), ...(t.funding ? { funding: t.funding } : {}), ...(t.settlement ? { settlement: t.settlement } : {}), ...(t.reason ? { reason: t.reason } : {}) });
function txnAction(api, q, target, meta) {
  return psbCall(api, { ...q, customerreferenceid: q.diceRequestId }, req => {
    const t = db.psb.txns[req.transactionId]; if (!t) return { http: 404, body: { status: '404', code: 'NOT_FOUND', message: 'No transaction' }, summary: 'NOT_FOUND' };
    if (!TXN_FLOW[t.state].includes(target)) return { http: 409, body: { status: '409', code: 'INVALID_STATE', message: `Cannot ${target} a transaction in ${t.state}` }, summary: `INVALID_STATE (${t.state})` };
    if (target === 'ACCEPTED') { const o = (t.offers || []).find(x => x.offerId === req.offerId); if (!o) return badReq('Unknown offerId'); if (new Date(o.expiresAt) < new Date()) return { http: 409, body: { status: '409', code: 'OFFER_EXPIRED', message: 'Offer has expired' }, summary: 'OFFER_EXPIRED' }; t.acceptedOfferId = o.offerId; }
    t.state = target; t.events.push({ state: target, at: nowISO() }); if (target === 'CANCELLED') t.reason = req.reason || 'Cancelled by sourcing partner';
    return { http: 200, summary: target, body: txnBody(t) };
  }, { ...meta, provisional: true });
}
/* offers the sandbox lender returns for a transaction (indicative — numbers come from the programme terms) */
function sandboxOffers(t) {
  const p = t.payload, days = Math.max(1, Math.round((new Date(p.dueDate) - new Date(todayISO())) / 864e5)), amount = p.invoiceAmount;
  const lenders = (p.lenders && p.lenders.length ? p.lenders : [{ id: 'L?', name: 'Lender', roi: 10 }]);
  return lenders.map((l, i) => { const discount = r2(amount * (l.roi / 100) * days / 365), fee = r2(amount * 0.001);
    return { offerId: `${t.id}-O${i + 1}`, lenderpsbplatformid: l.id, lendername: l.name, ratePct: l.roi, tenorDays: days, discount, fee, netPayout: r2(amount - discount - fee), recourse: 'Without recourse (indicative)', expiresAt: new Date(Date.now() + (db.meta.settings.offerExpiryHours || 48) * 36e5).toISOString(), termsVersion: 'TERMS-SB-1.0' }; });
}
/* provider-side progression + Transaction Status Callback to DICE. opts: { drop, duplicate, badSignature } */
function psbTxnEvent(txnId, target, data = {}, opts = {}) {
  const t = db.psb.txns[txnId]; if (!t) return { ok: false, msg: 'Unknown transaction' };
  if (!TXN_FLOW[t.state].includes(target)) return { ok: false, msg: `Provider does not allow ${t.state} → ${target}` };
  const now = nowISO(); t.state = target; t.events.push({ state: target, at: now, ...(data.note ? { note: data.note } : {}) });
  if (target === 'OFFER_AVAILABLE') t.offers = sandboxOffers(t);
  if (target === 'FUNDED') t.funding = { amount: data.amount ?? (t.offers || []).find(o => o.offerId === t.acceptedOfferId)?.netPayout ?? t.payload.invoiceAmount, date: todayISO(), utr: data.utr || `UTR${Date.now().toString().slice(-10)}`, reference: `FND-${t.id}` };
  if (target === 'SETTLED') t.settlement = { amount: data.amount ?? t.payload.invoiceAmount, date: todayISO(), utr: data.utr || `UTR${Date.now().toString().slice(-10)}`, reference: `SET-${t.id}` };
  if (['DECLINED', 'EXPIRED', 'CANCELLED', 'EXCEPTION'].includes(target)) t.reason = data.reason || ({ DECLINED: 'Declined by lender credit policy', EXPIRED: 'Offer expired', CANCELLED: 'Cancelled', EXCEPTION: 'Exception raised by lender' })[target];
  logEvent({ api: 'Lender lifecycle (sandbox)', dir: 'psb', corr: t.diceRequestId, http: 200, ok: true, summary: `${t.id}: ${target}`, req: { transactionId: t.id, action: target }, res: null });
  const sb = sandbox(), eventId = `${t.id}:${t.events.length}:${target}`, body = { eventId, ...txnBody(t) };
  if (opts.drop || sb.dropNextCallback) { sb.dropNextCallback = false; logEvent({ api: 'Transaction Status Callback (provisional)', dir: 'in', corr: t.diceRequestId, http: 0, ok: false, summary: 'Callback was NOT delivered (dropped by sandbox) — recover with the status query', req: body, res: null, meta: { dropped: true, provisional: true } }); return { ok: true, delivery: 'dropped' }; }
  const hdr = { 'X-Callback-Signature': opts.badSignature ? 'sha256=forged' : callbackSig(body) };
  const r = receiveTxnCallback(body, hdr); if (opts.duplicate) receiveTxnCallback(body, hdr);
  return { ok: true, delivery: r.ok ? 'delivered' : 'rejected' };
}
