/* =====================================================================
   id-logic.js — DICE-side domain: programmes (PGL leads), supplier financing profiles, invoice eligibility,
   financing requests, payment control, callbacks. DOM-free (tested in node).
   ===================================================================== */
const SETTING_DEFAULTS = {
  fintechPsbId: 'FIN-ZAGGLE-0001', callbackSecret: 'whsec_demo_only', epochUnit: 'seconds',
  enabledProducts: ['SID'], partnershipTtlMin: 30, requireInternalApproval: true,
  minInvoiceAmount: 100000, windowMinDays: 7, windowMaxDays: 180, matchTolerancePct: 0, holdTimeoutHours: 24, offerModel: 'embedded', offerExpiryHours: 48,
  applyTurnoverRule: false, minSupplierTurnoverCr: 25, inviteExpiryDays: 7,
};
const settings = () => ({ ...SETTING_DEFAULTS, ...((db && db.meta && db.meta.settings) || {}) });
const TERMS_VERSION = 'TERMS-SB-1.0', DATA_CONSENT_VERSION = 'CONSENT-DS-1.0';
const nowEpoch = () => epochNow(settings().epochUnit);

/* ---------- roles & permissions (replaces the billing set in core.js) ---------- */
const mkRef = (prefix, w = 4) => `${prefix}${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(++db.seq.ref).padStart(w, '0')}`;
const stamp = () => new Date().toISOString();
const latestIso = (a, b) => (a || '') > (b || '') ? a : b;

/* ---------- canonical statuses ---------- */
const PRG_STATUS = { DRAFT: 'Draft', PENDING: 'Pending Internal Approval', REJECTED: 'Rejected Internally', FAILED: 'Needs Correction', UNCERTAIN: 'Submission Uncertain', PSB_DRAFT: 'Draft at PSB', SUBMITTED: 'Submitted' };
const PRG_EDITABLE = [PRG_STATUS.DRAFT, PRG_STATUS.REJECTED, PRG_STATUS.FAILED];
const STATUS_ALIAS = { 'Lead Matched': 'Match Found', 'Lead Not Matched': 'No Match Found', 'In Active': 'In Active', 'InActive': 'In Active', 'Inactive': 'In Active' };   // Lender Status Master wording -> Fintech Status Master
const KNOWN_PSB = new Set(PSB_STATUS_MASTER.fintech.map(s => s.status).concat(PSB_STATUS_MASTER.lender.map(s => s.status)));
const normPsbStatus = s => STATUS_ALIAS[s] || s;
const stageRank = s => Math.max(0, STATUS_ORDER.indexOf(s));
const FIN = { REQUESTED: 'Requested', REVIEW: 'Under review', OFFER: 'Offer available', ACCEPTED: 'Accepted', FUNDED: 'Funded', SETTLE_PEND: 'Settlement pending', SETTLED: 'Settled', NOT_FUNDED: 'Not funded', EXCEPTION: 'Exception' };
const FIN_RANK = { [FIN.REQUESTED]: 0, [FIN.REVIEW]: 1, [FIN.OFFER]: 2, [FIN.ACCEPTED]: 3, [FIN.FUNDED]: 4, [FIN.SETTLE_PEND]: 5, [FIN.SETTLED]: 6 };
const FIN_ACTIVE = [FIN.REQUESTED, FIN.REVIEW, FIN.OFFER, FIN.ACCEPTED, FIN.FUNDED, FIN.SETTLE_PEND, FIN.EXCEPTION];
const FIN_PRE_FUNDING = [FIN.REQUESTED, FIN.REVIEW, FIN.OFFER, FIN.ACCEPTED];
const TXN_TO_FIN = { RECEIVED: FIN.REQUESTED, UNDER_REVIEW: FIN.REVIEW, OFFER_AVAILABLE: FIN.OFFER, ACCEPTED: FIN.ACCEPTED, FUNDED: FIN.FUNDED, SETTLEMENT_PENDING: FIN.SETTLE_PEND, SETTLED: FIN.SETTLED, DECLINED: FIN.NOT_FUNDED, EXPIRED: FIN.NOT_FUNDED, CANCELLED: FIN.NOT_FUNDED, EXCEPTION: FIN.EXCEPTION };
const SUP = { NOT_ENABLED: 'Not enabled', ONBOARDING: 'Onboarding', ACTION: 'Action required', ELIGIBLE: 'Eligible', NOT_ELIGIBLE: 'Not eligible', SUSPENDED: 'Suspended' };

/* ---------- lookups ---------- */
const getVendor = id => db.vendors.find(v => v.id === id);
const getPrg = id => db.programmes.find(p => p.id === id);
const getProfile = id => db.profiles.find(p => p.id === id);
const getInv = id => db.invoices.find(i => i.id === id);
const getReq = id => db.requests.find(r => r.id === id);
const profileOf = (vendorId, programmeId) => db.profiles.find(p => p.vendorId === vendorId && (!programmeId || p.programmeId === programmeId));
const activeReqOf = invId => db.requests.find(r => r.invoiceId === invId && FIN_ACTIVE.includes(r.status));
const reqsOf = invId => db.requests.filter(r => r.invoiceId === invId);
const lenderRow = (prg, lenderId) => prg.lenders.find(l => l.lenderId === lenderId);
const psbLender = id => db.psb.lenders.find(l => l.id === id) || db.psb.additionalLenders.find(l => l.id === id);
const lenderName = id => (psbLender(id) || {}).name || id;
const invRef = i => i.number;
const daysTo = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 864e5);

/* =====================================================================
   PARTNERSHIPS (Get Partnerships Details API) — cached; never blocks P2P
   ===================================================================== */
function fetchPartnerships(force) {
  const c = db.cache.partnerships, st = settings(), fresh = c && !force && (Date.now() - c.fetchedAtMs) < st.partnershipTtlMin * 60000;
  if (fresh) return { ok: true, cached: true, data: c };
  const r = apiGetPartnerships({ psbidentifier: st.fintechPsbId, partnershipstatus: ['ALL'], customerreferenceid: mkRef('DICEGP') }, { trigger: force ? 'Manual refresh' : 'Lender list load' });
  if (r.ok) { db.cache.partnerships = { fetchedAt: stamp(), fetchedAtMs: Date.now(), rows: r.body.partnershipdetails }; save(); return { ok: true, cached: false, data: db.cache.partnerships }; }
  if (c) return { ok: false, stale: true, data: c, msg: `PSBXchange unavailable — showing partnerships cached at ${fmtDT(c.fetchedAt)}` };
  return { ok: false, data: null, msg: r.body ? r.body.message : 'PSBXchange did not respond' };
}
/* lender rows usable for a product: only Active partnership that lists the product */
function lendersForProduct(product, rows) {
  return (rows || []).map(p => {
    const hasProduct = p.products.some(x => x.productcode === product), active = p.partnershipstatus === 'Active';
    return { id: p.lenderpsbidentifier, name: p.lendername, status: p.partnershipstatus, hasProduct, selectable: active && hasProduct, since: p.currentstatusupdatedate,
      why: !active ? `Partnership is ${p.partnershipstatus}` : !hasProduct ? `No ${product} product on this partnership` : '', products: p.products.map(x => x.productcode), activePrograms: (p.products.find(x => x.productcode === product) || {}).activeprogramcount };
  });
}

/* =====================================================================
   PROGRAMMES (Program Lead / Lead API)
   ===================================================================== */
const PRG_FORM_FIELDS = ['productcode', 'onboardingMode', 'leadname', 'pan', 'gstin', 'constitution', 'doi', 'industry', 'address', 'minLimit', 'maxLimit', 'minRoi', 'maxRoi', 'creditPeriod', 'externalRating', 'ratingAgency', 'ratingDate', 'prospectiveCps', 'avgCpLimit', 'lenders', 'authPersons', 'spoc'];
function newPrgForm() {
  const c = db.company, st = settings();
  return { leadtyp: 'PGL', productcode: st.enabledProducts[0] || 'SID', onboardingMode: 'Assisted', leadname: c.name, pan: c.pan, gstin: c.gstin, constitution: c.constitution, doi: c.doi, industry: c.industry, address: c.address,
    minLimit: '', maxLimit: '', minRoi: '', maxRoi: '', creditPeriod: '', externalRating: '', ratingAgency: '', ratingDate: '', prospectiveCps: '', avgCpLimit: '', lenders: [], authPersons: [emptyPerson()],
    spoc: { name: 'DICE Finance Operations', email: 'finance-ops@zoyer.example', mobile: '9000000000' } };
}
function prgPayload(prg) { return buildLeadPayload(prg.form, { fintechPsbId: settings().fintechPsbId, epochUnit: settings().epochUnit }); }
function nextReqId() { const n = db.programmes.length + 1; return `PG-2026-${String(n).padStart(3, '0')}`; }
function saveProgrammeDraft(id, form) {
  let prg = id && getPrg(id);
  if (prg && !PRG_EDITABLE.includes(prg.dstatus)) return { ok: false, msg: `A programme in "${prg.dstatus}" can no longer be edited` };
  if (!prg) { prg = { id: uid('prg'), reqId: nextReqId(), dstatus: PRG_STATUS.DRAFT, createdAt: stamp(), createdBy: actor(), form: null, psb: {}, lenders: [], history: [] }; db.programmes.push(prg); audit(null, prg.reqId, 'Programme draft created'); }
  prg.form = JSON.parse(JSON.stringify(form)); prg.updatedAt = stamp(); save();
  return { ok: true, msg: 'Draft saved', prg };
}
/* user presses Submit: validate -> mint references -> (approval) -> Lead API */
function submitProgramme(id) {
  const prg = getPrg(id); if (!prg) return { ok: false, msg: 'Programme not found' };
  if (!PRG_EDITABLE.includes(prg.dstatus)) return { ok: false, msg: `Already ${prg.dstatus}` };
  const st = settings(), f = prg.form;
  if (!st.enabledProducts.includes(f.productcode)) return { ok: false, msg: `Product ${f.productcode} is not enabled for this tenant`, errors: [`Product ${f.productcode} is not enabled for this tenant — an admin must enable it in Settings`] };
  if (!prg.psb.customerReferenceId) { prg.psb.customerReferenceId = mkRef('DICEPGL'); prg.psb.sourcingPartnerLeadId = `DICE-PGL-${todayISO().replace(/-/g, '')}-${String(++db.seq.lead).padStart(4, '0')}`; }
  f.customerReferenceId = prg.psb.customerReferenceId; f.sourcingPartnerLeadId = prg.psb.sourcingPartnerLeadId;
  const { errs } = validateLeadDraft(f, { fintechPsbId: st.fintechPsbId, epochUnit: st.epochUnit });
  if (errs.length) return { ok: false, msg: 'Fix the highlighted fields', errors: errs.map(e => e.msg), fieldErrors: errs };
  const cache = db.cache.partnerships, usable = lendersForProduct(f.productcode, cache && cache.rows).filter(l => l.selectable).map(l => l.id);
  if (!cache || !usable.length) return { ok: false, msg: `No active ${f.productcode} lender partnership`, errors: [`No active ${f.productcode} partnership is available, so the programme cannot be submitted. Escalate to Integration Ops to enable a lender.`] };
  const stale = f.lenders.filter(l => !usable.includes(l)); if (stale.length) return { ok: false, msg: 'A selected lender is no longer active', errors: [`${stale.map(lenderName).join(', ')} no longer has an active ${f.productcode} partnership — reselect lenders (step 3).`] };
  prg.snapshot = { at: stamp(), by: actor(), payload: prgPayload(prg) };
  if (st.requireInternalApproval) { prg.dstatus = PRG_STATUS.PENDING; prg.approval = { submittedBy: actor(), submittedAt: stamp() }; prg.history.push({ at: stamp(), by: actor(), text: 'Submitted for internal approval — Lead API not called yet' }); audit(null, prg.reqId, 'Programme submitted for internal approval'); save(); return { ok: true, msg: 'Submitted for internal approval — the PSBXchange lead is created only after approval' }; }
  return dispatchLead(prg);
}
function approveProgramme(id) {
  const prg = getPrg(id); if (!prg || prg.dstatus !== PRG_STATUS.PENDING) return { ok: false, msg: 'Nothing to approve' };
  if (prg.approval.submittedBy === actor() && db.meta.role !== 'admin') return { ok: false, msg: 'Segregation of duties: the submitter cannot approve their own programme request' };
  prg.approval.approvedBy = actor(); prg.approval.approvedAt = stamp(); prg.history.push({ at: stamp(), by: actor(), text: 'Approved internally' }); audit(null, prg.reqId, 'Programme approved internally', 'ok');
  return dispatchLead(prg);
}
function rejectProgramme(id, reason) {
  const prg = getPrg(id); if (!prg || prg.dstatus !== PRG_STATUS.PENDING) return { ok: false, msg: 'Nothing to reject' };
  prg.dstatus = PRG_STATUS.REJECTED; prg.approval.rejectedBy = actor(); prg.approval.reason = reason; prg.history.push({ at: stamp(), by: actor(), text: `Rejected internally: ${reason}` }); audit(null, prg.reqId, `Programme rejected internally: ${reason}`, 'bad'); save();
  return { ok: true, msg: 'Programme returned to the requester for changes' };
}
function parseLeadError(msg) { const out = []; String(msg || '').replace(/\[([a-z0-9._]+?)(?:#(\d+))?\]\s*([^;]+)/gi, (_, key, idx, text) => { out.push({ key, idx: idx != null ? +idx : undefined, msg: text.trim() }); }); return out; }
/* the actual Lead API call + every outcome the PRD calls out */
function dispatchLead(prg) {
  const st = settings(), payload = prgPayload(prg);
  prg.psb.attempts = (prg.psb.attempts || 0) + 1;
  const r = apiLead(payload, { trigger: 'Programme final submit', retry: prg.psb.attempts - 1 });
  const evt = db.events[0]; if (evt) evt.retry = prg.psb.attempts - 1;
  prg.psb.lastRequest = maskPayload(payload); prg.psb.lastResponse = r.body ? maskPayload(r.body) : null; prg.psb.lastHttp = r.http;
  if (r.timeout || r.http >= 500 || r.outage) {
    prg.dstatus = PRG_STATUS.UNCERTAIN; prg.psb.reason = r.timeout ? 'The Lead API call timed out — PSBXchange may or may not have created the lead' : `PSBXchange returned HTTP ${r.http}`;
    prg.history.push({ at: stamp(), by: 'System', text: prg.psb.reason + '. Retry reuses the same references; no new lead is created.' }); audit(null, prg.reqId, prg.psb.reason, 'bad'); save();
    return { ok: false, msg: prg.psb.reason + ' — use Retry (same references)', errors: [prg.psb.reason] };
  }
  if (r.http >= 400) { prg.dstatus = PRG_STATUS.FAILED; prg.psb.apiErrors = [{ key: '_http', msg: r.body.message }]; prg.history.push({ at: stamp(), by: 'System', text: `Lead API rejected the request: ${r.body.message}` }); save(); return { ok: false, msg: r.body.message, errors: [r.body.message] }; }
  const ld = r.body.leaddetails[0];
  if (ld.leadstatus === 'Failure') {
    prg.dstatus = PRG_STATUS.FAILED; prg.psb.apiErrors = parseLeadError(ld.errormessage); prg.psb.errorCode = ld.errorcode; prg.psb.errorMessage = ld.errormessage;
    prg.history.push({ at: stamp(), by: 'System', text: `Lead API failure ${ld.errorcode}: ${ld.errormessage}` }); audit(null, prg.reqId, `Lead API failure ${ld.errorcode}`, 'bad'); save();
    return { ok: false, msg: `PSBXchange rejected the lead (${ld.errorcode})`, errors: [ld.errormessage], code: ld.errorcode };
  }
  if (ld.leadstatus === 'Draft') { prg.dstatus = PRG_STATUS.PSB_DRAFT; prg.psb.errorCode = ld.errorcode; prg.psb.errorMessage = ld.errormessage; prg.history.push({ at: stamp(), by: 'System', text: `Lead is in Draft at PSBXchange: ${ld.errormessage}` }); save(); return { ok: false, msg: 'Lead is stuck in Draft at PSBXchange — retry, or complete it on the PSB Platform', errors: [ld.errormessage] }; }
  prg.psb.psbPlatformId = ld.psbplatformid; prg.psb.leadStatus = ld.leadstatus; prg.psb.apiErrors = null; prg.psb.reason = null; prg.psb.leadTimestamp = ld.leadtimestamp;
  prg.lenders = prg.form.lenders.map(id => ({ lenderId: id, name: lenderName(id), stage: 'Opportunities', status: 'In Progress', updatedAt: ld.leadtimestamp, history: [{ stage: 'Opportunities', status: 'In Progress', at: ld.leadtimestamp, source: 'Lead API' }] }));
  prg.dstatus = PRG_STATUS.SUBMITTED; prg.submittedAt = stamp(); prg.history.push({ at: stamp(), by: 'System', text: `Lead accepted by PSBXchange (${ld.psbplatformid}). Acceptance is not approval — tracking status.` }); audit(null, prg.reqId, `Lead created at PSBXchange: ${ld.psbplatformid}`, 'ok'); save();
  return { ok: true, msg: `Lead created at PSBXchange (${ld.psbplatformid}) — status tracking started` };
}
const retryLead = id => { const prg = getPrg(id); if (!prg || ![PRG_STATUS.UNCERTAIN, PRG_STATUS.PSB_DRAFT].includes(prg.dstatus)) return { ok: false, msg: 'Nothing to retry' }; return dispatchLead(prg); };
/* correcting a failed programme re-runs submit (same references are kept) */
function reopenForCorrection(id) { const prg = getPrg(id); if (prg && prg.dstatus === PRG_STATUS.FAILED) return { ok: true }; return { ok: false }; }

/* apply a Get Status response / callback body to a lender row. Returns 'applied' | 'stale' | 'same' | 'unknown-status' */
function applyStatusBody(prg, lenderId, body, source) {
  const row = lenderRow(prg, lenderId); if (!row) return 'no-row';
  const status = normPsbStatus(body.psbsourcingpartnerstatus), stage = body.psbstage === 'Programs' ? 'Program' : body.psbstage;
  if (body.psblaststatusupdatedate < row.updatedAt) return 'stale';
  if (row.stage === stage && row.status === status && body.psblaststatusupdatedate === row.updatedAt) return 'same';
  row.stage = stage; row.status = status; row.updatedAt = body.psblaststatusupdatedate; row.raw = maskPayload(body); row.unknown = !KNOWN_PSB.has(body.psbsourcingpartnerstatus);
  row.history.push({ stage, status, at: body.psblaststatusupdatedate, source });
  if (body.offerdetails) row.offer = body.offerdetails[0];
  if (body.matches) row.match = body.matches; if (body.selectedmatches) row.match = body.selectedmatches;
  if (body.psbprogramid) { row.psbProgramId = body.psbprogramid; row.program = { ...body.psbprogramdetails, terms: (body.programkeytermsandconditions || {}).conditiondescription, mou: body.finalmou, sanctionDate: body.programsanctiondate, activationDate: row.program ? row.program.activationDate : body.psblaststatusupdatedate, outstandingBase: row.program ? row.program.outstandingBase : 0 }; }
  if (row.unknown) audit(null, prg.reqId, `Unknown PSB status "${body.psbsourcingpartnerstatus}" — flagged for Integration Ops`, 'bad');
  else audit(null, prg.reqId, `${row.name}: ${stage} · ${status} (${source})`, status === 'Active' ? 'ok' : 'info');
  return row.unknown ? 'unknown-status' : 'applied';
}
function refreshProgramme(id, lenderId) {
  const prg = getPrg(id); if (!prg || !prg.psb.psbPlatformId) return { ok: false, msg: 'This programme has no PSBXchange lead yet' };
  const rows = lenderId ? prg.lenders.filter(l => l.lenderId === lenderId) : prg.lenders, res = [];
  rows.forEach(row => {
    const r = apiGetStatus({ psbleadid: prg.psb.psbPlatformId, fintechpsbplatformid: settings().fintechPsbId, lenderpsbplatformid: row.lenderId, customerreferenceid: mkRef('DICEGS') }, { trigger: 'Refresh / reconciliation' });
    if (r.ok) res.push(applyStatusBody(prg, row.lenderId, r.body, 'Get Status API')); else res.push('error:' + (r.body ? r.body.message : 'no response'));
  });
  prg.lastRefreshAt = stamp(); save();
  const err = res.find(x => String(x).startsWith('error:'));
  if (err) return { ok: false, msg: `Get Status failed — ${err.slice(6)}. Showing the last known status.`, errors: [err.slice(6)] };
  const n = res.filter(x => x === 'applied' || x === 'unknown-status').length;
  return { ok: true, msg: n ? `${n} lender status(es) updated from PSBXchange` : 'Already up to date' };
}
/* PSB -> DICE Status Callback (authenticate, deduplicate, correlate, map) */
function receiveStatusCallback(body, hdr) {
  const corr = body.customerreferenceid || '—', log = (http, ok, summary, meta) => logEvent({ api: 'Status Callback', dir: 'in', corr, http, ok, summary, req: maskPayload(body), res: { received: ok }, meta: { ...meta, headers: hdr } });
  if (!hdr || hdr['X-Callback-Signature'] !== callbackSig(body)) { log(401, false, 'Rejected — signature check failed (not processed)', { security: true }); return { ok: false, http: 401 }; }
  const key = `${body.psbleadid}|${body.lenderpsbplatformid}|${body.psbstage}|${body.psbsourcingpartnerstatus}|${body.psblaststatusupdatedate}`;
  if (db.seen[key]) { log(200, true, 'Duplicate callback ignored (already processed)', { duplicate: true }); return { ok: true, duplicate: true }; }
  const prg = db.programmes.find(p => p.psb.psbPlatformId === body.psbleadid);
  if (!prg) { db.seen[key] = 1; db.orphans.unshift({ at: stamp(), body: maskPayload(body) }); log(404, false, 'Unknown lead — parked for Integration Ops', { orphan: true }); return { ok: false, http: 404 }; }
  const r = applyStatusBody(prg, body.lenderpsbplatformid, body, 'Status Callback');
  db.seen[key] = 1; save();
  log(200, true, r === 'stale' ? 'Out-of-order callback ignored (older than current status)' : `Applied: ${body.psbstage} · ${body.psbsourcingpartnerstatus}`, { result: r });
  return { ok: true, result: r };
}

/* ---- active programme view model ---- */
function activeProgrammes() {
  const out = [];
  db.programmes.forEach(prg => (prg.lenders || []).forEach(l => { if (l.stage === 'Program' && l.psbProgramId) out.push({ prg, row: l, inactive: l.status === 'In Active' }); }));
  return out;
}
function lenderPartnershipActive(lenderId, product) {
  const c = db.cache.partnerships; if (!c) return true;
  const p = c.rows.find(x => x.lenderpsbidentifier === lenderId);
  return !!p && p.partnershipstatus === 'Active' && p.products.some(x => x.productcode === product);
}
const rowUsable = (prg, row) => row.stage === 'Program' && row.status === 'Active' && !!row.psbProgramId && lenderPartnershipActive(row.lenderId, prg.form.productcode);
function programmeHeadroom(prg) {
  const rows = (prg.lenders || []).filter(l => rowUsable(prg, l));
  const sanctioned = sum(rows, l => l.program.programlimit), base = sum(rows, l => l.program.outstandingBase || 0);
  const active = sum(db.requests.filter(r => r.programmeId === prg.id && [FIN.REQUESTED, FIN.REVIEW, FIN.OFFER, FIN.ACCEPTED, FIN.FUNDED, FIN.SETTLE_PEND, FIN.EXCEPTION].includes(r.status)), r => r.amount);
  return { sanctioned, outstanding: r2(base + active), headroom: r2(sanctioned - base - active), lenders: rows };
}

/* =====================================================================
   SUPPLIER FINANCING PROFILES (no PSB API: SID/PID supplier onboarding contract is not in the workbook)
   ===================================================================== */
const OB_ADAPTER = 'Supplier onboarding hand-off (adapter — external route not confirmed)';
function newSupplierForm(vendorId, programmeId) {
  const v = getVendor(vendorId) || {};
  return { vendorId: vendorId || '', programmeId: programmeId || '', address: v.address || '', constitution: v.constitution || '', doi: v.doi || '', industry: v.industry || '', msme: v.udyam ? 'Yes' : 'No', udyam: v.udyam || '',
    purch: { cur: '', last: '', second: '' }, turn: { cur: '', last: '', second: '' }, pat: { cur: '', last: '', second: '' }, vintage: '',
    contact: { name: v.contact ? v.contact.name : '', email: v.contact ? v.contact.email : '', mobile: v.contact ? v.contact.mobile : '' },
    bank: { holder: v.bank ? v.bank.holder : '', acct: '', ifsc: v.bank ? v.bank.ifsc : '', bankName: v.bank ? v.bank.bankName : '' }, consentData: false, consentTerms: false };
}
function profileStatusFor(p) { return p.status; }
/* buyer adds a supplier -> case awaiting the supplier's own consent + invite */
function buyerAddSupplier(form) {
  const errs = validateSupplierForm(form, { step: 2 }); const keys = Object.keys(errs).filter(k => !k.startsWith('bank') && !k.startsWith('consent'));
  if (keys.length) return { ok: false, msg: 'Fix the highlighted fields', fieldErrors: errs };
  const prg = getPrg(form.programmeId); if (!prg || !programmeHeadroom(prg).lenders.length) return { ok: false, msg: 'The selected programme is not active', errors: ['The selected programme is not active — a supplier can only be linked to an active programme'] };
  if (profileOf(form.vendorId, form.programmeId) && !['Not eligible'].includes(profileOf(form.vendorId, form.programmeId).status)) return { ok: false, msg: 'This supplier already has a financing profile for the programme', errors: ['This supplier already has a financing profile for this programme — open it from the Suppliers tab'] };
  const v = getVendor(form.vendorId), exp = new Date(Date.now() + settings().inviteExpiryDays * 864e5).toISOString();
  let p = profileOf(form.vendorId, form.programmeId);
  if (!p) { p = { id: uid('sp'), vendorId: v.id, programmeId: prg.id, history: [] }; db.profiles.push(p); }
  Object.assign(p, { status: SUP.ACTION, kyc: 'Not started', bank: 'Not started', form: JSON.parse(JSON.stringify(form)), missing: ['Supplier consent', 'Bank details'], reason: 'Waiting for the supplier to confirm details and give consent', initiatedBy: 'Buyer', initiatedAt: stamp(),
    invite: { token: 'inv_' + Math.random().toString(36).slice(2, 10), sentTo: form.contact.email, sentAt: stamp(), expiresAt: exp, usedAt: null } });
  p.history.push({ at: stamp(), by: actor(), text: `Buyer invited ${v.name} to enable financing (link expires ${fmtD(exp.slice(0, 10))})` }); audit(null, v.name, 'Supplier invited to enable invoice financing'); save();
  return { ok: true, msg: `Invitation sent to ${form.contact.email}`, profile: p };
}
const inviteExpired = p => !!(p.invite && !p.invite.usedAt && p.invite.expiresAt < stamp());
function resendInvite(id) { const p = getProfile(id); if (!p || !p.invite) return { ok: false, msg: 'No invitation on this profile' }; p.invite = { ...p.invite, token: 'inv_' + Math.random().toString(36).slice(2, 10), sentAt: stamp(), expiresAt: new Date(Date.now() + settings().inviteExpiryDays * 864e5).toISOString(), usedAt: null }; p.history.push({ at: stamp(), by: actor(), text: 'Invitation re-sent with a new secure link' }); save(); return { ok: true, msg: 'New invitation link sent' }; }
function expireInviteNow(id) { const p = getProfile(id); if (p && p.invite) { p.invite.expiresAt = new Date(Date.now() - 864e5).toISOString(); save(); } }
/* supplier completes + submits (own portal). Requires consent + bank details. */
function supplierSubmitOnboarding(form) {
  const errs = validateSupplierForm(form, { step: 3, final: true }); if (Object.keys(errs).length) return { ok: false, msg: 'Fix the highlighted fields', fieldErrors: errs };
  const v = getVendor(form.vendorId), prg = getPrg(form.programmeId); if (!v || !prg) return { ok: false, msg: 'Supplier or programme not found' };
  let p = profileOf(form.vendorId, form.programmeId);
  if (p && p.invite && inviteExpired(p)) return { ok: false, msg: 'This invitation link has expired', errors: ['The invitation link has expired. Ask the buyer to resend the invitation.'] };
  if (p && [SUP.ONBOARDING, SUP.ELIGIBLE].includes(p.status)) return { ok: false, msg: `Profile is already ${p.status}` };
  if (!p) { p = { id: uid('sp'), vendorId: v.id, programmeId: prg.id, history: [] }; db.profiles.push(p); }
  const ifscU = String(form.bank.ifsc).toUpperCase(), last4 = String(form.bank.acct).slice(-4);
  v.bank = { holder: form.bank.holder, acctMasked: '••••' + last4, ifsc: ifscU, bankName: form.bank.bankName, verified: false, version: (v.bank ? v.bank.version : 0) + 1 };      // account number is masked after save
  Object.assign(p, { status: SUP.ONBOARDING, kyc: 'In review', bank: 'Pending verification', form: { ...JSON.parse(JSON.stringify(form)), bank: { ...form.bank, acct: '••••' + last4 } }, missing: [], reason: '', bankVersion: v.bank.version,
    consent: { dataVersion: DATA_CONSENT_VERSION, termsVersion: TERMS_VERSION, at: stamp(), by: db.meta.role === 'supplier' ? v.name + ' (vendor portal)' : actor(), channel: 'DICE vendor portal' }, submittedAt: stamp() });
  if (p.invite) p.invite.usedAt = stamp();
  logEvent({ api: OB_ADAPTER, dir: 'out', corr: v.id, http: null, ok: true, summary: 'DICE onboarding case created. No PSBXchange call: SID supplier-onboarding contract is not in the workbook.', req: { vendorId: v.id, programmeId: prg.id, product: prg.form.productcode, consentVersion: DATA_CONSENT_VERSION }, res: null, meta: { provisional: true } });
  p.history.push({ at: stamp(), by: p.consent.by, text: 'Onboarding submitted with consent and bank details; hand-off to partner/lender checks' }); audit(null, v.name, 'Supplier financing onboarding submitted'); save();
  return { ok: true, msg: 'Submitted — partner/lender checks are running', profile: p };
}
/* provider outcome (sandbox) — maps to DICE-neutral statuses */
function providerDecision(id, decision, reason) {
  const p = getProfile(id), v = p && getVendor(p.vendorId); if (!p) return { ok: false, msg: 'Profile not found' };
  const set = (status, extra, text, kind = 'info') => { Object.assign(p, { status }, extra); p.history.push({ at: stamp(), by: 'Partner / lender', text }); logEvent({ api: 'Supplier onboarding status (adapter — provisional)', dir: 'in', corr: v.id, http: 200, ok: true, summary: `${v.name}: ${status}`, req: { vendorId: v.id, externalStatus: decision, reason: reason || null }, res: null, meta: { provisional: true } }); audit(null, v.name, `Financing profile: ${status}${reason ? ' — ' + reason : ''}`, kind); save(); return { ok: true, msg: `${v.name}: ${status}` }; };
  const must = () => p.consent && v.bank && p.status !== SUP.ACTION ? null : 'Supplier has not submitted consent/bank details yet';
  if (decision === 'approve') { const e = must(); if (e) return { ok: false, msg: e }; v.bank.verified = true; v.bank.verifiedAt = stamp(); return set(SUP.ELIGIBLE, { kyc: 'Verified', bank: 'Verified', missing: [], reason: '', bankVersion: v.bank.version }, 'KYC/KYB and bank verification passed — supplier eligible', 'ok'); }
  if (decision === 'docs') return set(SUP.ACTION, { kyc: 'Documents required', missing: ['GST registration certificate', 'Cancelled cheque'], reason: reason || 'Additional documents requested by the lender' }, 'Additional documents requested');
  if (decision === 'bankfail') { v.bank.verified = false; return set(SUP.ACTION, { bank: 'Failed', missing: ['Re-enter bank details'], reason: reason || 'Penny-drop verification failed' }, 'Bank verification failed', 'bad'); }
  if (decision === 'reject') return set(SUP.NOT_ELIGIBLE, { kyc: 'Failed', reason: reason || 'Does not meet lender criteria' }, 'Not eligible: ' + (reason || 'does not meet lender criteria'), 'bad');
  if (decision === 'suspend') { pauseRequestsForVendor(v.id, 'Supplier suspended by the lender'); return set(SUP.SUSPENDED, { reason: reason || 'Paused by the lender' }, 'Supplier suspended', 'bad'); }
  if (decision === 'reinstate') return set(SUP.ELIGIBLE, { reason: '' }, 'Supplier reinstated', 'ok');
  return { ok: false, msg: 'Unknown decision' };
}
/* supplier changes bank account -> must be re-verified; funding is blocked meanwhile */
function changeSupplierBank(vendorId, bank) {
  const v = getVendor(vendorId); if (!v) return { ok: false, msg: 'Supplier not found' };
  const e = validateSupplierForm({ vendorId, programmeId: 'x', address: 'x', constitution: v.constitution, doi: v.doi, industry: 'x', msme: 'No', contact: { name: 'x', email: 'a@b.co', mobile: '9999999999' }, bank, consentData: true, consentTerms: true }, { final: true });
  const be = Object.fromEntries(Object.entries(e).filter(([k]) => k.startsWith('bank')));
  if (Object.keys(be).length) return { ok: false, msg: 'Fix the bank details', fieldErrors: be };
  v.bank = { holder: bank.holder, acctMasked: '••••' + String(bank.acct).slice(-4), ifsc: String(bank.ifsc).toUpperCase(), bankName: bank.bankName, verified: false, version: (v.bank ? v.bank.version : 0) + 1 };
  db.profiles.filter(p => p.vendorId === vendorId && [SUP.ELIGIBLE, SUP.ONBOARDING].includes(p.status)).forEach(p => { p.status = SUP.ACTION; p.bank = 'Pending verification'; p.missing = ['Bank re-verification']; p.reason = 'Bank account changed — verification pending'; p.history.push({ at: stamp(), by: actor(), text: 'Bank account changed; financing paused until re-verified' }); });
  pauseRequestsForVendor(vendorId, 'Supplier bank account changed — verification pending');
  audit(null, v.name, 'Supplier bank account changed — re-verification required', 'bad'); save();
  return { ok: true, msg: 'Bank account updated — verification pending; financing is paused for this supplier' };
}

/* =====================================================================
   INVOICE ELIGIBILITY (PRD §7.3). Every check has a reason code so the supplier always sees why a button is missing.
   ===================================================================== */
const invSnapshot = inv => { const v = getVendor(inv.vendorId), p = profileOf(inv.vendorId); return { amount: inv.amount, due: inv.due, approval: inv.approval, match: inv.match.status, bankVersion: v && v.bank ? v.bank.version : 0, adj: inv.adjustments.filter(a => a.status === 'Unresolved').length, dispute: !!inv.dispute.open, block: !!inv.paymentBlock, profile: p ? p.status : 'none' }; };
const snapHash = s => simpleHash(JSON.stringify(s));
function eligibility(inv, opts = {}) {
  const st = settings(), v = getVendor(inv.vendorId), prof = profileOf(inv.vendorId), prg = prof && getPrg(prof.programmeId), checks = [];
  const add = (key, label, pass, reason, { warn = false, code } = {}) => checks.push({ key, label, status: pass ? 'pass' : warn ? 'warn' : 'fail', reason: pass ? '' : reason, code: pass ? null : code });
  add('approval', 'Invoice approved in DICE', inv.approval === 'Approved', 'The invoice is not approved yet', { code: 'INV_NOT_APPROVED' });
  add('match', '3-way match within tolerance', inv.match.status === 'Passed' && Math.abs(inv.match.variancePct || 0) <= st.matchTolerancePct, inv.match.status === 'Passed' ? `Match variance ${inv.match.variancePct}% exceeds the ${st.matchTolerancePct}% tolerance` : `3-way match is ${inv.match.status}`, { code: 'MATCH_FAILED' });
  add('payment', 'Unpaid and not scheduled for normal payment', inv.payment.state === 'Unpaid', inv.payment.state === 'Scheduled' ? `Normal payment is scheduled for ${fmtD(inv.payment.on)} — AP must cancel it first` : `Invoice is already ${inv.payment.state.toLowerCase()}`, { code: inv.payment.state === 'Scheduled' ? 'PAYMENT_SCHEDULED' : 'ALREADY_PAID' });
  const act0 = activeReqOf(inv.id), act = opts.ignoreReq && act0 && act0.id === opts.ignoreReq ? null : act0; add('dup', 'No other active financing on this invoice', !act, `Financing request ${act && act.number} is already ${act && act.status.toLowerCase()}`, { code: 'DUPLICATE_FINANCING' });
  add('dispute', 'No open dispute, block or hold', !inv.dispute.open && !inv.paymentBlock, inv.dispute.open ? `Open dispute: ${inv.dispute.reason}` : 'A payment block is on this invoice', { code: inv.dispute.open ? 'OPEN_DISPUTE' : 'PAYMENT_BLOCK' });
  const unres = inv.adjustments.filter(a => a.status === 'Unresolved'); add('adj', 'No unresolved credit / debit note', !unres.length, `${unres.length} unresolved ${unres[0] && unres[0].type.toLowerCase()} affects the financed amount — needs review`, { warn: true, code: 'UNRESOLVED_ADJUSTMENT' });
  const d = daysTo(inv.due); add('due', `Due date inside the financing window (${st.windowMinDays}–${st.windowMaxDays} days)`, d >= st.windowMinDays && d <= st.windowMaxDays, d < 0 ? 'The invoice is already overdue' : d < st.windowMinDays ? `Due in ${d} day(s): less than the ${st.windowMinDays}-day minimum` : `Due in ${d} days: beyond the ${st.windowMaxDays}-day maximum`, { code: 'OUTSIDE_WINDOW' });
  add('currency', 'Invoice currency is INR', inv.currency === 'INR', `Currency is ${inv.currency}; only INR invoices can be financed`, { code: 'CURRENCY' });
  const room = prg ? programmeHeadroom(prg) : null;
  add('amount', `Amount within limits (min ${money(st.minInvoiceAmount)}${room ? ', programme headroom ' + money(room.headroom) : ''})`, inv.amount >= st.minInvoiceAmount && (!room || inv.amount <= room.headroom), inv.amount < st.minInvoiceAmount ? `Amount is below the ${money(st.minInvoiceAmount)} minimum` : `Amount exceeds the available programme limit of ${money(room ? room.headroom : 0)}`, { code: inv.amount < st.minInvoiceAmount ? 'BELOW_MIN' : 'EXCEEDS_LIMIT' });
  let supOk = false, supWhy = 'Supplier has not enabled invoice financing', supCode = 'SUPPLIER_NOT_ENABLED';
  if (prof) { supCode = 'SUPPLIER_' + prof.status.toUpperCase().replace(/ /g, '_'); supWhy = prof.status === SUP.ELIGIBLE ? '' : `Supplier financing profile is ${prof.status}${prof.reason ? ': ' + prof.reason : ''}`;
    supOk = prof.status === SUP.ELIGIBLE; if (supOk && !(v.bank && v.bank.verified && prof.bankVersion === v.bank.version)) { supOk = false; supWhy = 'Bank account is not verified or has changed since approval'; supCode = 'BANK_NOT_VERIFIED'; }
    if (supOk && !prof.consent) { supOk = false; supWhy = 'Supplier consent is missing'; supCode = 'NO_CONSENT'; } }
  add('supplier', 'Supplier onboarded, bank verified, not suspended', supOk, supWhy, { code: supCode });
  const usable = prg ? room.lenders.length > 0 : false;
  add('programme', 'Active SID programme and active lender partnership', usable, prg ? 'The programme is not active, or its lender partnership is no longer active' : 'No programme is linked to this supplier', { code: 'PROGRAMME_INACTIVE' });
  if (st.applyTurnoverRule) add('turnover', `Supplier turnover ≥ ₹${st.minSupplierTurnoverCr} Cr (DICE rule)`, !!(v && v.turnoverCr >= st.minSupplierTurnoverCr), `Turnover ₹${v ? v.turnoverCr : 0} Cr is below the ₹${st.minSupplierTurnoverCr} Cr DICE programme rule`, { warn: true, code: 'TURNOVER_RULE' });
  if (opts.snapshot) { const cur = snapHash(invSnapshot(inv)); add('fresh', 'No change since the eligibility snapshot', cur === opts.snapshot, 'The invoice, supplier or bank data changed since eligibility was checked — re-check', { code: 'STALE_SNAPSHOT' }); }
  const ok = checks.every(c => c.status === 'pass'), blocking = checks.filter(c => c.status !== 'pass');
  return { ok, checks, blocking, prg, prof, room, snapshot: snapHash(invSnapshot(inv)) };
}
const finStatusOfInvoice = inv => { const r = reqsOf(inv.id).slice().reverse().find(x => FIN_ACTIVE.includes(x.status)) || reqsOf(inv.id).slice(-1)[0]; return r ? r.status : null; };
function invoiceFinView(inv) {      // what the list shows in "Financing Status"
  const r = reqsOf(inv.id).slice(-1)[0], act = activeReqOf(inv.id);
  if (act) return { label: act.status, req: act, tone: act.status };
  if (r && r.status === FIN.SETTLED) return { label: FIN.SETTLED, req: r, tone: FIN.SETTLED };
  const e = eligibility(inv);
  if (e.ok) return { label: 'Eligible', tone: 'Eligible', elig: e };
  const first = e.blocking[0]; return { label: first.key === 'supplier' && e.prof && e.prof.status !== SUP.ELIGIBLE ? (e.prof.status === SUP.ONBOARDING ? 'Onboarding pending' : e.prof ? 'Supplier ' + e.prof.status.toLowerCase() : 'Not eligible') : first.key === 'supplier' ? 'Not enabled' : 'Not eligible', tone: 'Not Eligible', elig: e, req: r };
}

/* =====================================================================
   PAYMENT CONTROL — normal AP can never pay an invoice that is held / locked
   ===================================================================== */
const PC = { OPEN: 'OPEN', HOLD: 'FINANCING_HOLD', LOCKED: 'LOCKED', CLOSED: 'CLOSED' };
const pcOf = inv => inv.pc || (inv.pc = { state: PC.OPEN });
function setPc(inv, state, reason, reqId) { const was = pcOf(inv).state; inv.pc = { ...pcOf(inv), state, reason, requestId: reqId, at: stamp() }; if (was !== state) inv.pc.history = [...(inv.pc.history || []), { at: stamp(), from: was, to: state, reason }]; }
function schedulePayment(invId, on) {
  const inv = getInv(invId); if (!inv) return { ok: false, msg: 'Invoice not found' };
  const pc = pcOf(inv); if (pc.state !== PC.OPEN) return { ok: false, msg: `Normal payment is blocked: invoice is under financing (${pc.state === PC.HOLD ? 'payment hold' : pc.state === PC.LOCKED ? 'funded — payment locked' : 'closed'})`, errors: [`Payment control: ${pc.state}. ${pc.reason || ''}`] };
  if (inv.approval !== 'Approved') return { ok: false, msg: 'Only approved invoices can be paid' };
  if (inv.payment.state !== 'Unpaid') return { ok: false, msg: `Invoice is already ${inv.payment.state.toLowerCase()}` };
  inv.payment = { state: 'Scheduled', on: on || inv.due }; audit(null, inv.number, `Normal payment scheduled for ${fmtD(inv.payment.on)}`); save(); return { ok: true, msg: `Payment scheduled for ${fmtD(inv.payment.on)}` };
}
function cancelPayment(invId) { const inv = getInv(invId); if (!inv || inv.payment.state !== 'Scheduled') return { ok: false, msg: 'No scheduled payment' }; inv.payment = { state: 'Unpaid' }; audit(null, inv.number, 'Scheduled payment cancelled'); save(); return { ok: true, msg: 'Scheduled payment cancelled' }; }

/* =====================================================================
   FINANCING REQUESTS
   ===================================================================== */
const nextFrNo = () => `FR-2026-${String(db.requests.length + 1).padStart(3, '0')}`;
function txnPayload(req, inv, prg, prof) {
  const rows = programmeHeadroom(prg).lenders, v = getVendor(inv.vendorId);
  return { diceRequestId: req.number, idempotencyKey: req.idempotencyKey, invoiceId: inv.id, invoiceNumber: inv.number, invoiceDate: inv.date, invoiceAmount: inv.amount, currency: inv.currency, dueDate: inv.due,
    buyerId: db.company.id, buyerPan: db.company.pan, supplierId: v.id, supplierPan: v.pan, supplierGstin: v.gstin, programmeId: prg.id, productCode: prg.form.productcode, psbProgramIds: rows.map(l => l.psbProgramId), lenders: rows.map(l => ({ id: l.lenderId, name: l.name, roi: l.program.programroi })),
    evidence: { purchaseOrder: inv.po, goodsReceipt: inv.grn, threeWayMatch: inv.match.status, approvalStatus: inv.approval, approvedAt: inv.approvedAt || null },
    consent: { termsVersion: req.consent.termsVersion, dataSharingVersion: req.consent.dataVersion, acceptedBy: req.consent.by, acceptedAt: req.consent.at } };
}
function createFinanceRequest(invId, consent) {
  const inv = getInv(invId); if (!inv) return { ok: false, msg: 'Invoice not found' };
  const dup = activeReqOf(invId); if (dup) { db.meta.dupBlocked = (db.meta.dupBlocked || 0) + 1; save(); return { ok: false, dup, msg: `Already requested (${dup.number} — ${dup.status}). A second request was not created.` }; }
  if (!consent || !consent.terms || !consent.data) return { ok: false, msg: 'Consent is required', errors: ['Accept the financing terms and the data-sharing consent to continue'] };
  const e = eligibility(inv, { snapshot: consent.snapshot });             // re-run immediately before submission (incl. freshness)
  if (!e.ok) return { ok: false, msg: 'This invoice is no longer eligible', errors: e.blocking.map(c => c.reason), checks: e.checks };
  const snap = invSnapshot(inv), hash = snapHash(snap);
  const req = { id: uid('fr'), number: nextFrNo(), invoiceId: inv.id, vendorId: inv.vendorId, programmeId: e.prg.id, product: e.prg.form.productcode, amount: inv.amount, dueDate: inv.due, status: FIN.REQUESTED, snapshot: snap, snapshotHash: hash, idempotencyKey: `DICE-${inv.id}-${hash}`,
    consent: { termsVersion: TERMS_VERSION, dataVersion: DATA_CONSENT_VERSION, by: actor(), at: stamp(), channel: 'DICE web' }, createdAt: stamp(), lastEventAt: stamp(), txnId: null, uncertain: false, history: [], seenEvents: {} };
  // ---- atomic section: request row + payment hold are written together, before any external call ----
  db.requests.push(req); setPc(inv, PC.HOLD, `Financing request ${req.number} submitted`, req.id);
  req.history.push({ at: stamp(), by: actor(), text: `Request created; normal payment placed on hold (${consent.model === 'redirect' ? 'redirect' : 'embedded'} model)` });
  audit(null, inv.number, `Early-payment request ${req.number} created — payment hold placed`, 'info');
  const r = txnAdapter.initiate(txnPayload(req, inv, e.prg, e.prof), { trigger: 'Supplier confirmed "Get paid early"', invoice: inv.number });
  if (r.ok) { req.txnId = r.body.transactionId; req.history.push({ at: stamp(), by: 'System', text: `Partner accepted the request (${req.txnId})` }); }
  else if (r.timeout || r.outage || r.http >= 500) { req.uncertain = true; req.history.push({ at: stamp(), by: 'System', text: 'Partner did not confirm (timeout / server error). Outcome is UNKNOWN — hold kept; query the partner before releasing.' }); audit(null, inv.number, `${req.number}: partner outcome unknown — payment stays on hold`, 'bad'); }
  else { finalizeNotFunded(req, `Rejected by partner at submission: ${r.body.code || r.http} — ${r.body.message}`, true); }
  save();
  return { ok: true, req, msg: req.status === FIN.NOT_FUNDED ? `Partner rejected the request: ${r.body.message}` : req.uncertain ? 'Request saved and payment is on hold, but the partner did not confirm — use “Query partner status”' : 'Request submitted — payment is on hold while the financier reviews it' };
}
function finalizeNotFunded(req, reason, authoritative) {
  const inv = getInv(req.invoiceId);
  req.status = FIN.NOT_FUNDED; req.reason = reason; req.closedAt = stamp(); req.uncertain = false; req.paused = null;
  if (authoritative) { setPc(inv, PC.OPEN, `Released: ${reason}`, req.id); req.history.push({ at: stamp(), by: 'System', text: `Not funded: ${reason}. Payment hold released — invoice back to normal payment.` }); audit(null, inv.number, `${req.number} not funded — payment hold released (${reason})`, 'bad'); }
}
const lastKnownTxnEventId = (req, eventId) => { if (!eventId) return false; if (req.seenEvents[eventId]) return true; req.seenEvents[eventId] = 1; return false; };
/* a provider event (callback or status query) -> canonical DICE state. Idempotent, order-aware. */
function applyTxnEvent(req, ev, source) {
  const inv = getInv(req.invoiceId), target = TXN_TO_FIN[ev.status], rank = FIN_RANK[req.status];
  if (lastKnownTxnEventId(req, ev.eventId)) return 'duplicate';
  if (!target) { req.history.push({ at: stamp(), by: 'System', text: `Unknown partner status "${ev.status}" — flagged for Integration Ops` }); audit(null, inv.number, `${req.number}: unknown partner status ${ev.status}`, 'bad'); return 'unknown'; }
  if (req.txnId == null && ev.transactionId) req.txnId = ev.transactionId, req.uncertain = false;
  req.lastEventAt = stamp(); req.stale = false;
  const note = t => req.history.push({ at: stamp(), by: source, text: t });
  if ([FIN.SETTLED, FIN.NOT_FUNDED].includes(req.status)) { note(`Ignored ${ev.status}: request already ${req.status}`); return 'ignored'; }
  if (target === FIN.NOT_FUNDED) {
    if (rank >= FIN_RANK[FIN.FUNDED] || req.status === FIN.EXCEPTION) { toException(req, `Conflicting ${ev.status} received after funding`, source); return 'exception'; }
    finalizeNotFunded(req, ev.reason || ev.status, true); return 'applied';
  }
  if (target === FIN.EXCEPTION) { toException(req, ev.reason || 'Exception raised by the partner', source); return 'exception'; }
  if (rank != null && FIN_RANK[target] != null && FIN_RANK[target] < rank) { note(`Ignored out-of-order ${ev.status} (already ${req.status})`); return 'stale'; }
  if (target === FIN.OFFER) { req.offers = ev.offers || []; req.status = FIN.OFFER; note(`${req.offers.length} offer(s) received`); }
  else if (target === FIN.ACCEPTED) { req.status = FIN.ACCEPTED; req.acceptedOfferId = ev.acceptedOfferId || req.acceptedOfferId; note('Offer accepted — processing funding'); }
  else if (target === FIN.FUNDED) {
    req.status = FIN.FUNDED; req.funding = ev.funding; setPc(inv, PC.LOCKED, `Funded (${ev.funding.utr})`, req.id);
    const o = (req.offers || []).find(x => x.offerId === req.acceptedOfferId);
    note(`Funding confirmed: ${money(ev.funding.amount)} · UTR ${ev.funding.utr}. Normal payment is locked.`); audit(null, inv.number, `${req.number} funded — UTR ${ev.funding.utr}`, 'ok');
    if (o && Math.abs(o.netPayout - ev.funding.amount) > 0.5) toException(req, `Funding amount ${money(ev.funding.amount)} differs from the accepted net payout ${money(o.netPayout)}`, source);
  }
  else if (target === FIN.SETTLE_PEND) { req.status = FIN.SETTLE_PEND; note('Awaiting the buyer’s due-date settlement'); }
  else if (target === FIN.SETTLED) { reconcileSettlement(req, ev.settlement, source); }
  else { req.status = target; note(`Status: ${target}`); }
  if (FIN_PRE_FUNDING.includes(req.status)) setPc(inv, PC.HOLD, `Financing request ${req.number} ${req.status.toLowerCase()}`, req.id);
  return 'applied';
}
function toException(req, reason, source) {
  const inv = getInv(req.invoiceId); req.status = FIN.EXCEPTION; req.exception = { reason, at: stamp(), by: source }; setPc(inv, PC.LOCKED, `Exception: ${reason}`, req.id);
  req.history.push({ at: stamp(), by: source || 'System', text: `Exception: ${reason}. Payment stays locked until resolved.` }); audit(null, inv.number, `${req.number} exception: ${reason}`, 'bad');
}
/* settlement is closed only when amount/reference match; otherwise it is an exception, never silently "settled" */
function reconcileSettlement(req, s, source) {
  const inv = getInv(req.invoiceId);
  if (!s || !String(s.utr || '').trim()) { toException(req, 'Settlement reported without a UTR / reference', source); return; }
  const variance = r2(s.amount - req.amount);
  req.settlement = s;
  if (Math.abs(variance) > 0.5) { req.variance = variance; toException(req, `Settlement variance ${variance < 0 ? 'short by ' : 'excess of '}${money(Math.abs(variance))} (received ${money(s.amount)}, expected ${money(req.amount)})`, source); return; }
  req.status = FIN.SETTLED; req.closedAt = stamp(); setPc(inv, PC.CLOSED, 'Settled via financing', req.id); inv.payment = { state: 'Settled via financing' };
  req.history.push({ at: stamp(), by: source, text: `Settlement reconciled: ${money(s.amount)} · UTR ${s.utr}. Financing closed.` }); audit(null, inv.number, `${req.number} settled and reconciled`, 'ok');
}
function resolveException(id, reason) {
  const req = getReq(id); if (!req || req.status !== FIN.EXCEPTION) return { ok: false, msg: 'Not in exception' };
  const inv = getInv(req.invoiceId);
  if (!req.funding) return { ok: false, msg: 'No funding evidence — resolve with the partner (cancel) instead' };
  req.history.push({ at: stamp(), by: actor(), text: `Exception resolved: ${reason}` });
  if (req.settlement && req.settlement.utr) { req.status = FIN.SETTLED; req.closedAt = stamp(); req.resolution = reason; setPc(inv, PC.CLOSED, 'Settled via financing (exception resolved)', req.id); inv.payment = { state: 'Settled via financing' }; }
  else { req.status = FIN.SETTLE_PEND; req.exception = null; setPc(inv, PC.LOCKED, 'Funded — awaiting settlement', req.id); }
  audit(null, inv.number, `${req.number} exception resolved: ${reason}`, 'ok'); save(); return { ok: true, msg: 'Exception resolved and recorded' };
}
function receiveTxnCallback(body, hdr) {
  const corr = body.diceRequestId || body.transactionId || '—', log = (http, ok, summary, meta) => logEvent({ api: 'Transaction Status Callback (provisional)', dir: 'in', corr, http, ok, summary, req: maskPayload(body), res: { received: ok }, meta: { ...meta, provisional: true, headers: hdr } });
  if (!hdr || hdr['X-Callback-Signature'] !== callbackSig(body)) { log(401, false, 'Rejected — signature check failed (not processed)', { security: true }); return { ok: false, http: 401 }; }
  const req = db.requests.find(r => r.txnId === body.transactionId || r.number === body.diceRequestId);
  if (!req) { db.orphans.unshift({ at: stamp(), body: maskPayload(body) }); log(404, false, 'Unknown transaction — parked for Integration Ops', { orphan: true }); return { ok: false, http: 404 }; }
  const r = applyTxnEvent(req, { eventId: body.eventId, status: body.status, transactionId: body.transactionId, offers: body.offers, acceptedOfferId: body.acceptedOfferId, funding: body.funding, settlement: body.settlement, reason: body.reason }, 'Transaction Status Callback');
  save(); log(200, true, r === 'duplicate' ? 'Duplicate callback ignored' : `${body.status} → ${r}`, { result: r });
  return { ok: true, result: r };
}
/* poll / reconcile: the recovery path for a missed callback or an unknown submission outcome */
function queryPartnerStatus(id) {
  const req = getReq(id); if (!req) return { ok: false, msg: 'Request not found' };
  const r = txnAdapter.status({ transactionId: req.txnId, idempotencyKey: req.idempotencyKey, diceRequestId: req.number }, { trigger: 'Status query / reconciliation' });
  if (r.timeout || r.outage || (r.http >= 500)) return { ok: false, msg: 'Partner did not answer — status stays unknown; payment is NOT released', errors: ['Partner did not answer'] };
  if (r.http === 404) {            // partner never saw this request => definitively not funded
    if (FIN_PRE_FUNDING.includes(req.status) && !req.txnId) { finalizeNotFunded(req, 'Partner confirmed it never received the request (no transaction exists)', true); save(); return { ok: true, msg: 'Partner has no record of this request — confirmed not funded; payment hold released' }; }
    return { ok: false, msg: 'Partner returned NOT_FOUND for a known transaction — raise with Integration Ops', errors: ['NOT_FOUND for a known transaction'] };
  }
  const b = r.body, t = db.psb.txns[b.transactionId];
  if (!req.txnId) { req.txnId = b.transactionId; req.uncertain = false; req.history.push({ at: stamp(), by: 'Reconciliation', text: `Found transaction ${b.transactionId} at the partner — submission outcome resolved` }); }
  // replay every provider event we have not applied yet, in order
  let applied = 0; (t.events || []).forEach((e, i) => { if (e.note === 'amended') return; const evId = `${t.id}:${i + 1}:${e.state}`; if (e.state !== 'RECEIVED' || i > 0) { const o = applyTxnEvent(req, { eventId: evId, status: e.state, transactionId: t.id, offers: t.offers, acceptedOfferId: t.acceptedOfferId, funding: t.funding, settlement: t.settlement, reason: t.reason }, 'Status query'); if (o === 'applied' || o === 'exception') applied++; } });
  req.lastEventAt = stamp(); req.stale = false; save();
  return { ok: true, msg: applied ? `Partner status recovered: ${b.status}` : `Partner reports ${b.status} — already up to date` };
}
function acceptOffer(id, offerId, consent) {
  const req = getReq(id); if (!req || req.status !== FIN.OFFER) return { ok: false, msg: 'There is no offer waiting for a decision' };
  if (req.paused) return { ok: false, msg: 'This request is paused — revalidate it first', errors: ['Request paused: ' + req.paused.reason] };
  if (!consent) return { ok: false, msg: 'Accept the final terms to continue', errors: ['Tick the confirmation that the supplier has reviewed the final lender terms'] };
  const o = (req.offers || []).find(x => x.offerId === offerId); if (!o) return { ok: false, msg: 'Select an offer' };
  if (new Date(o.expiresAt) < new Date()) return { ok: false, msg: 'This offer has expired', errors: ['The offer expired at ' + fmtDT(o.expiresAt)] };
  const r = txnAdapter.accept({ transactionId: req.txnId, offerId, diceRequestId: req.number, termsVersion: o.termsVersion, acceptedBy: actor() }, { trigger: 'Supplier accepted offer' });
  if (!r.ok) return { ok: false, msg: r.body ? r.body.message : 'Partner did not respond', errors: [r.body ? r.body.message : 'Partner did not respond — nothing was accepted'] };
  req.acceptedOfferId = offerId; req.history.push({ at: stamp(), by: actor(), text: `Accepted offer from ${o.lendername} (net payout ${money(o.netPayout)}), terms ${o.termsVersion}` }); audit(null, getInv(req.invoiceId).number, `${req.number}: offer from ${o.lendername} accepted`, 'ok');
  req.status = FIN.ACCEPTED; req.lastEventAt = stamp(); save(); return { ok: true, msg: 'Offer accepted — waiting for the lender to fund' };
}
function cancelRequest(id, reason) {
  const req = getReq(id); if (!req || !FIN_PRE_FUNDING.includes(req.status)) return { ok: false, msg: 'Only a request that has not been funded can be cancelled' };
  if (req.status === FIN.ACCEPTED) return { ok: false, msg: 'Funding is already in progress — it can no longer be cancelled', errors: ['The offer was accepted and funding is in progress. Contact the lender.'] };
  if (!req.txnId) return { ok: false, msg: 'Partner outcome is unknown — query the partner first' };
  const r = txnAdapter.cancel({ transactionId: req.txnId, diceRequestId: req.number, reason }, { trigger: 'Supplier cancelled' });
  if (!r.ok) return { ok: false, msg: r.body ? r.body.message : 'Partner did not respond — the request stays on hold', errors: [r.body ? r.body.message : 'Partner did not respond'] };
  finalizeNotFunded(req, `Cancelled: ${reason || 'by supplier'}`, true); save(); return { ok: true, msg: 'Request cancelled — payment hold released' };
}

/* ---------- invoice changes (material change rule) ---------- */
function pauseRequestsForVendor(vendorId, reason) { db.requests.filter(r => r.vendorId === vendorId && FIN_PRE_FUNDING.includes(r.status)).forEach(r => pauseRequest(r, reason)); }
function pauseRequest(req, reason) {
  if (req.paused) return; req.paused = { reason, at: stamp() }; const inv = getInv(req.invoiceId);
  req.history.push({ at: stamp(), by: 'System', text: `Paused: ${reason}. Checks must run again before the request continues.` });
  if (req.txnId) txnAdapter.amend({ transactionId: req.txnId, diceRequestId: req.number, changes: { paused: true, reason } }, { trigger: 'Material change' });
  setPc(inv, PC.HOLD, `Request paused: ${reason}`, req.id); audit(null, inv.number, `${req.number} paused: ${reason}`, 'bad');
}
function p2pEvent(invId, type, data = {}) {
  const inv = getInv(invId); if (!inv) return { ok: false, msg: 'Invoice not found' };
  const req = activeReqOf(invId), funded = req && FIN_FILTER_FUNDED.includes(req.status);
  const msgs = { dispute: 'Dispute raised', creditnote: 'Credit note raised', duedate: 'Due date changed', unapprove: 'Approval withdrawn', amount: 'Amount changed' };
  if (type === 'dispute') inv.dispute = { open: true, reason: data.reason || 'Quality dispute raised by buyer' };
  else if (type === 'cleardispute') inv.dispute = { open: false };
  else if (type === 'creditnote') inv.adjustments.push({ id: uid('cn'), type: 'Credit note', amount: data.amount || Math.round(inv.amount * 0.05), status: 'Unresolved', at: stamp() });
  else if (type === 'resolvenote') inv.adjustments.forEach(a => { a.status = 'Resolved'; });
  else if (type === 'duedate') inv.due = data.due || daysFromNow(daysTo(inv.due) + 10);
  else if (type === 'unapprove') inv.approval = 'Pending';
  else if (type === 'amount') inv.amount = data.amount || Math.round(inv.amount * 0.9);
  else return { ok: false, msg: 'Unknown event' };
  audit(null, inv.number, `${msgs[type] || type}`, 'info');
  if (['dispute', 'creditnote', 'duedate', 'unapprove', 'amount'].includes(type) && req) {
    if (funded) toException(req, `${msgs[type]} after funding`, 'P2P event');
    else pauseRequest(req, msgs[type]);
  }
  save(); return { ok: true, msg: `${msgs[type] || 'Updated'}${req ? (funded ? ' — financing exception opened, payment stays locked' : ' — financing request paused') : ''}` };
}
const FIN_FILTER_FUNDED = [FIN.FUNDED, FIN.SETTLE_PEND, FIN.EXCEPTION];
function revalidateRequest(id) {
  const req = getReq(id); if (!req || !req.paused) return { ok: false, msg: 'Request is not paused' };
  const inv = getInv(req.invoiceId), e = eligibility(inv, { ignoreReq: req.id });
  if (!e.ok) { const r = cancelRequest(id, 'Invoice no longer eligible after change: ' + e.blocking[0].reason); return r.ok ? { ok: true, msg: 'Checks failed after the change — request cancelled and the payment hold released', errors: e.blocking.map(c => c.reason) } : { ok: false, msg: r.msg, errors: r.errors }; }
  req.snapshot = invSnapshot(inv); req.snapshotHash = snapHash(req.snapshot); req.amount = inv.amount; req.dueDate = inv.due; req.paused = null;
  if (req.txnId) txnAdapter.amend({ transactionId: req.txnId, diceRequestId: req.number, changes: { invoiceAmount: inv.amount, dueDate: inv.due, paused: false } }, { trigger: 'Revalidated after change' });
  if (req.status === FIN.OFFER) { req.status = FIN.REVIEW; req.offers = null; }          // earlier offer priced the old invoice — invalidated
  req.history.push({ at: stamp(), by: actor(), text: 'Checks re-run and passed — request resumed with the updated invoice (any earlier offer is invalidated)' }); audit(null, inv.number, `${req.number} resumed after revalidation`, 'ok'); save();
  return { ok: true, msg: 'Revalidated — request resumed' };
}
/* hold timeout: never auto-release on a timer — flag it and require a partner query (PRD §10) */
function sweepHolds() {
  const lim = settings().holdTimeoutHours * 36e5;
  db.requests.forEach(r => { if ([FIN.REQUESTED, FIN.REVIEW].includes(r.status) && !r.stale && Date.now() - new Date(r.lastEventAt).getTime() > lim) { r.stale = true; r.history.push({ at: stamp(), by: 'System', text: `No status for ${settings().holdTimeoutHours} h. Payment stays on hold — query the partner to resolve.` }); audit(null, getInv(r.invoiceId).number, `${r.number}: hold timeout reached — partner query required`, 'bad'); } });
}
const ageRequest = (id, hours) => { const r = getReq(id); if (r) { r.lastEventAt = new Date(Date.now() - hours * 36e5).toISOString(); sweepHolds(); save(); } };

/* ---------- admin ---------- */
function saveSettings(patch) {
  const e = []; const n = k => Number(patch[k]);
  if (!(n('minInvoiceAmount') >= 0)) e.push('Minimum invoice amount must be 0 or more'); if (!(n('windowMinDays') >= 0) || !(n('windowMaxDays') > n('windowMinDays'))) e.push('Financing window: maximum days must exceed minimum days');
  if (!(n('holdTimeoutHours') >= 1)) e.push('Hold timeout must be at least 1 hour'); if (!(n('partnershipTtlMin') >= 1)) e.push('Partnership cache TTL must be at least 1 minute'); if (!(n('matchTolerancePct') >= 0)) e.push('Match tolerance must be 0 or more');
  if (!patch.enabledProducts || !patch.enabledProducts.length) e.push('Enable at least one product');
  if (e.length) return { ok: false, msg: 'Settings not saved', errors: e };
  db.meta.settings = { ...settings(), ...patch, minInvoiceAmount: n('minInvoiceAmount'), windowMinDays: n('windowMinDays'), windowMaxDays: n('windowMaxDays'), holdTimeoutHours: n('holdTimeoutHours'), partnershipTtlMin: n('partnershipTtlMin'), matchTolerancePct: n('matchTolerancePct') };
  audit(null, 'Settings', 'Invoice discounting settings updated'); save(); return { ok: true, msg: 'Settings saved' };
}
const KPI = () => {
  const el = db.invoices.filter(i => !activeReqOf(i.id) && eligibility(i).ok), all = db.requests, funded = all.filter(r => r.funding);
  return { eligibleValue: sum(el, i => i.amount), eligibleCount: el.length, financed: sum(funded, r => r.funding.amount), fundedCount: funded.length, requests: all.length, exceptions: all.filter(r => r.status === FIN.EXCEPTION).length, takeUp: (el.length + all.length) ? Math.round(all.length / (el.length + all.length) * 100) : 0, duplicatesBlocked: db.meta.dupBlocked || 0 };
};
