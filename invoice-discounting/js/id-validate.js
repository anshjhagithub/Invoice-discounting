/* =====================================================================
   id-validate.js — PSBXchange field rules (from the API workbook), lead payload builder + validator.
   DOM-free: used by the screens, by the mock PSB gateway (server-side re-validation) and by the node tests.
   Every "Yes" / "Yes*" flag comes from PSB_SCHEMA (generated from the workbook) — see leadFieldRequired().
   ===================================================================== */
const SPECIAL_PRODUCTS = ['SID', 'PID', 'FACT', 'REVFACT'];            // no stop-supply / min-max CP limit for these (Get Status sheet)
const PGL_PRODUCTS = ['DF', 'VF', 'SID', 'PID', 'FACT', 'REVFACT'];    // Lead API sheet: leadtype = PGL
const CPL_PRODUCTS = ['DF', 'VF'];                                     // leadtype = CPL (sheet writes "CGL" in places — it is CPL in the Master Reference)
const GST_STATE_CODES = new Set([...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')), '97', '99']);
/* The workbook says "Refer Industry Master" but does not contain one: this list is a stand-in until PSB supplies it. */
const INDUSTRIES = ['Metals & Mining', 'Manufacturing', 'Automotive & Components', 'Chemicals', 'Pharmaceuticals', 'FMCG', 'Textiles', 'Construction & Infrastructure', 'Energy & Utilities', 'Trading', 'Services', 'Other'];
const RATING_AGENCIES = ['CRISIL', 'ICRA', 'CARE', 'India Ratings', 'Brickwork', 'Acuité', 'Other'];
const RATINGS = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB', 'B', 'Unrated'];
const CONSTITUTIONS = () => PSB_MASTERS.constitution.map(c => c.code);
const CONDUCT = () => PSB_MASTERS.conduct.map(c => c.code);
const ONBOARDING_MODES = () => PSB_MASTERS.onboardingModes.map(c => c.name);
const PRODUCT_NAME = c => (PSB_MASTERS.products.find(p => p.code === c) || {}).name || c;

/* ---------- regexes — wording follows the sheet's "Validation ?" column ---------- */
const RX = {
  // 1-3 AAA-ZZZ, 4th in P C H A B G J L F T, 5th alpha, 6-9 digits, 10th alpha.
  // The sheet says "6th-9th = 0000 to 1111 sequence"; read literally that rejects real PANs (the wireframe's own AAACH1203D), so any 4 digits are accepted — open question for PSB.
  pan: /^[A-Za-z]{3}[PCHABGJLFT][A-Za-z][0-9]{4}[A-Za-z]$/,
  gstn: /^(0[1-9]|[12][0-9]|3[0-8]|97|99)[A-Za-z]{3}[PCHABGJLFT][A-Za-z][0-9]{4}[A-Za-z][A-Za-z0-9][Zz][A-Za-z0-9]$/,
  udyam: /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  mobile: /^[0-9]{10}$/,
  custRef: /^[A-Za-z0-9]{1,32}$/,
  leadName: /^[A-Za-z0-9 ]+$/,           // "only alphanumeric" — spaces allowed (sheet samples such as "Dummy Lead 1234" contain them)
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
};
const isBlank = v => v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length);
const isInt = v => v !== '' && v != null && Number.isInteger(Number(v));
const isNum = v => v !== '' && v != null && Number.isFinite(Number(v));

/* ---------- dates: the sheet wants DD-MM-YYYY on screen and an epoch integer on the wire ---------- */
const IST_OFFSET_MS = 19800000;
const ddmmyyyy = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}-${m}-${y}`; };
function isoToEpoch(iso, unit = 'seconds') { if (!validISO(iso)) return null; const [y, m, d] = iso.split('-').map(Number); const ms = Date.UTC(y, m - 1, d) - IST_OFFSET_MS; return unit === 'milliseconds' ? ms : Math.floor(ms / 1000); }
function epochToISO(ep, unit = 'seconds') { const ms = unit === 'milliseconds' ? Number(ep) : Number(ep) * 1000; const d = new Date(ms + IST_OFFSET_MS); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
const epochNow = (unit = 'seconds') => unit === 'milliseconds' ? Date.now() : Math.floor(Date.now() / 1000);
const fmtEpoch = (ep, unit = 'seconds') => { if (ep == null) return '—'; const iso = new Date(unit === 'milliseconds' ? ep : ep * 1000).toISOString(); return fmtDT(iso); };
function validISO(iso) { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false; const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
const lakhsToRupees = l => Math.round(Number(l) * 100000);
const rupeesToLakhs = r => r / 100000;

/* ---------- which schema rows are mandatory for a lead type / product ---------- */
const leadSchemaRows = () => PSB_SCHEMA.leadApi.request;
const rowId = r => (r.path ? r.path + '.' : '') + r.key;
/* Conditional ("Yes*") rules, transcribed from the sheet's Mandatory column. */
const COND_RULES = {
  relationshipvintagewithanchor: c => c.leadtyp === 'CPL', conductwithanchor: c => c.leadtyp === 'CPL', anchorrecommendedlimit: c => c.leadtyp === 'CPL',
  psbplatformprogramid: c => c.leadtyp === 'CPL',
  externalrating: c => c.leadtyp === 'PGL', externalratingagency: c => c.leadtyp === 'PGL',
};
function leadFieldRequired(row, ctx) {
  if (row.mandKind === 'always') return true;
  if (row.mandKind === 'optional') return false;
  const id = rowId(row);
  if (/dependencyonanchor/.test(id)) return ctx.leadtyp === 'CPL' && ctx.productcode === 'DF';
  if (/purchasesalesfromtoanchor|\.turnover|profitaftertax|leaddetails->turnover/.test(id) || /^leaddetails->(turnover|profitaftertax|purchasesalesfromtoanchor)/.test(id)) return ctx.leadtyp === 'CPL';
  const f = COND_RULES[row.key]; return f ? f(ctx) : false;
}
/* Fields the sheet says to discard when they are sent for the wrong lead type. */
function leadFieldIgnored(row, ctx) {
  const id = rowId(row);
  const cplOnly = /relationshipvintage|conductwithanchor|anchorrecommendedlimit|purchasesalesfromtoanchor|dependencyonanchor|leaddetails->turnover|profitaftertax|psbplatformprogramid|ischannelpartnerasme|channelpartnerudyamno/.test(id);
  const pglOnly = /externalrating|prospectivenoofchannelpartners|averagechannelpartnerlimit/.test(id);
  if (ctx.leadtyp === 'PGL' && cplOnly) return true;
  if (ctx.leadtyp === 'CPL' && pglOnly) return true;
  if (/dependencyonanchor/.test(id) && !(ctx.leadtyp === 'CPL' && ctx.productcode === 'DF')) return true;
  return false;
}
const REQUIRED_LEAD_ROWS = ctx => leadSchemaRows().filter(r => leadFieldRequired(r, ctx));
/* Used by the forms to draw the red asterisk — so UI and validator cannot drift from the sheet. */
const isReqKey = (key, ctx = { leadtyp: 'PGL', productcode: 'SID' }, path) => { const r = leadSchemaRows().find(x => x.key === key && (path == null || x.path === path)); return !!r && leadFieldRequired(r, ctx); };

/* ---------- draft (form) -> API payload ---------- */
const emptyPerson = () => ({ name: '', mobile: '', email: '', vertical: '', designation: '', onboarding: 'Yes' });
function buildLeadPayload(d, st = {}) {
  const unit = st.epochUnit || 'seconds', typ = d.leadtyp || 'PGL', pgl = typ === 'PGL';
  const num = v => (v === '' || v == null ? undefined : Number(v));
  const ld = {
    leadtyp: typ, leadonboardingtype: d.onboardingMode, sourcingpartnerleadid: d.sourcingPartnerLeadId, productcode: d.productcode,
    anchorpannumber: d.pan ? String(d.pan).trim().toUpperCase() : d.pan, leadname: d.leadname ? String(d.leadname).trim() : d.leadname,
    leadprimarygstn: d.gstin ? String(d.gstin).trim().toUpperCase() : d.gstin, leadconstitution: d.constitution,
    leaddateofincorporation: d.doi ? isoToEpoch(d.doi, unit) : undefined, leadindustryclassification: d.industry, leadregisteredaddress: d.address ? String(d.address).trim() : d.address,
    leadminexpectedlimit: num(d.minLimit), leadmaxexpectedlimit: num(d.maxLimit), leadminexpectedroi: num(d.minRoi), leadmaxexpectedroi: num(d.maxRoi), creditperiod: num(d.creditPeriod),
  };
  if (pgl) {
    ld.externalrating = d.externalRating; ld.externalratingagency = d.ratingAgency;
    if (!isBlank(d.prospectiveCps)) ld.prospectivenoofchannelpartners = num(d.prospectiveCps);
    if (!isBlank(d.avgCpLimit)) ld.averagechannelpartnerlimit = num(d.avgCpLimit);
  } else {
    ld.relationshipvintagewithanchor = num(d.vintage); ld.conductwithanchor = d.conduct; ld.anchorrecommendedlimit = num(d.anchorRecLimit);
    ld.purchasesalesfromtoanchor = { currentfyyear: num(d.purch?.cur), lastfyyear: num(d.purch?.last), secondlastfyyear: num(d.purch?.second) };
    if (d.productcode === 'DF') ld.dependencyonanchor = { currentfyyear: num(d.dep?.cur), lastfyyear: num(d.dep?.last), secondlastfyyear: num(d.dep?.second) };
    ld.turnover = { currentfyyear: num(d.turn?.cur), lastfyyear: num(d.turn?.last), secondlastfyyear: num(d.turn?.second) };
    ld.profitaftertax = { currentfyyear: num(d.pat?.cur), lastfyyear: num(d.pat?.last), secondlastfyyear: num(d.pat?.second) };
    if (!isBlank(d.isMsme)) ld.ischannelpartnerasme = d.isMsme; if (!isBlank(d.udyam)) ld.channelpartnerudyamno = d.udyam;
  }
  ld.chooselenders = (d.lenders || []).map(id => pgl ? { lenderpsbplatformid: id } : { lenderpsbplatformid: id, psbplatformprogramid: d.programId });
  ld.authorizedpersondetails = (d.authPersons || []).map(p => ({ authorizedpersonname: p.name, authorizedpersonemailid: p.email, authorizedpersonmobileno: p.mobile === '' ? undefined : String(p.mobile), tobeusedforonboarding: p.onboarding }));
  return {
    fintechpsbplatformid: st.fintechPsbId, customerreferenceid: d.customerReferenceId,
    sourcingpartnerspocname: d.spoc?.name, sourcingpartneremailid: d.spoc?.email, sourcingpartnerspocmobileno: d.spoc?.mobile === '' ? undefined : d.spoc?.mobile,
    leaddetails: [ld],
  };
}

/* ---------- payload validator (server side + client side share it) ---------- */
/* returns [{ key, msg, idx? }] — key is the API field name so the UI can map it back to a form field */
function validateLeadPayload(p, ctx = {}) {
  const errs = [], unit = ctx.epochUnit || 'seconds', add = (key, msg, extra) => errs.push({ key, msg, ...extra });
  if (isBlank(p.fintechpsbplatformid)) add('fintechpsbplatformid', 'Fintech PSB Platform ID is mandatory');
  if (isBlank(p.customerreferenceid)) add('customerreferenceid', 'Customer Reference No. is mandatory'); else if (!RX.custRef.test(p.customerreferenceid)) add('customerreferenceid', 'Customer Reference No. must be alphanumeric, max 32 characters');
  if (isBlank(p.sourcingpartnerspocname)) add('sourcingpartnerspocname', 'Sourcing Partner SPOC name is mandatory');
  if (isBlank(p.sourcingpartneremailid)) add('sourcingpartneremailid', 'Sourcing Partner SPOC email is mandatory'); else if (!RX.email.test(p.sourcingpartneremailid)) add('sourcingpartneremailid', 'Enter a valid email address');
  if (isBlank(p.sourcingpartnerspocmobileno)) add('sourcingpartnerspocmobileno', 'Sourcing Partner SPOC mobile is mandatory'); else if (!RX.mobile.test(String(p.sourcingpartnerspocmobileno))) add('sourcingpartnerspocmobileno', 'Mobile number must be 10 digits');
  const l = (p.leaddetails || [])[0];
  if (!l) { add('leaddetails', 'leaddetails is mandatory'); return errs; }
  const typ = l.leadtyp, pgl = typ === 'PGL', cpl = typ === 'CPL', c = { leadtyp: typ, productcode: l.productcode };
  if (isBlank(typ)) add('leadtyp', 'Lead type is mandatory'); else if (!pgl && !cpl) add('leadtyp', 'Lead type must be PGL or CPL');
  if (isBlank(l.leadonboardingtype)) add('leadonboardingtype', 'Lead onboarding mode is mandatory'); else if (!ONBOARDING_MODES().includes(l.leadonboardingtype)) add('leadonboardingtype', 'Onboarding mode must be Self or Assisted');
  if (isBlank(l.sourcingpartnerleadid)) add('sourcingpartnerleadid', 'Sourcing Partner Lead ID is mandatory');
  if (isBlank(l.productcode)) add('productcode', 'Product code is mandatory');
  else if (pgl && !PGL_PRODUCTS.includes(l.productcode)) add('productcode', `Product ${l.productcode} is not allowed for a Program Lead`);
  else if (cpl && !CPL_PRODUCTS.includes(l.productcode)) add('productcode', `A Channel Partner Lead is only allowed for DF or VF (got ${l.productcode})`);
  if (isBlank(l.anchorpannumber)) add('anchorpannumber', 'Anchor PAN is mandatory'); else if (!RX.pan.test(l.anchorpannumber)) add('anchorpannumber', 'PAN must be 10 characters, e.g. ABCDE1234F (4th character one of P C H A B G J L F T)');
  if (isBlank(l.leadname)) add('leadname', 'Lead name is mandatory'); else if (!RX.leadName.test(l.leadname)) add('leadname', 'Lead name may contain only letters, numbers and spaces');
  if (isBlank(l.leadprimarygstn)) add('leadprimarygstn', 'Primary GSTIN is mandatory');
  else if (!RX.gstn.test(l.leadprimarygstn)) add('leadprimarygstn', GST_STATE_CODES.has(String(l.leadprimarygstn).slice(0, 2)) ? 'GSTIN format is invalid (15 characters, 14th must be Z)' : 'GSTIN must start with a valid GST state code');
  else if (l.anchorpannumber && String(l.leadprimarygstn).slice(2, 12).toUpperCase() !== String(l.anchorpannumber).toUpperCase()) add('leadprimarygstn', 'The PAN must be a substring of the GSTIN (characters 3–12)');
  if (isBlank(l.leadconstitution)) add('leadconstitution', 'Constitution is mandatory'); else if (!CONSTITUTIONS().includes(l.leadconstitution)) add('leadconstitution', 'Constitution must be one of the PSB master values');
  if (isBlank(l.leaddateofincorporation)) add('leaddateofincorporation', 'Date of incorporation is mandatory');
  else if (!isInt(l.leaddateofincorporation)) add('leaddateofincorporation', 'Date of incorporation must be an epoch integer');
  else { const iso = epochToISO(l.leaddateofincorporation, unit), today = todayISO(); if (!validISO(iso) || iso >= today) add('leaddateofincorporation', 'Date of incorporation must be before today (DD-MM-YYYY)'); else if (+iso.slice(0, 4) < 1800) add('leaddateofincorporation', 'Date of incorporation is not plausible'); }
  if (isBlank(l.leadindustryclassification)) add('leadindustryclassification', 'Industry classification is mandatory');
  if (isBlank(l.leadregisteredaddress)) add('leadregisteredaddress', 'Registered address is mandatory'); else if (String(l.leadregisteredaddress).length > 100) add('leadregisteredaddress', 'Registered address can be at most 100 characters');
  const minL = l.leadminexpectedlimit, maxL = l.leadmaxexpectedlimit;
  if (isBlank(minL)) add('leadminexpectedlimit', 'Minimum requested limit is mandatory'); else if (!isInt(minL)) add('leadminexpectedlimit', 'Whole numbers only (INR lakhs, no decimals)'); else if (Number(minL) < 0) add('leadminexpectedlimit', 'Minimum limit must be 0 or more');
  if (isBlank(maxL)) add('leadmaxexpectedlimit', 'Maximum requested limit is mandatory'); else if (!isInt(maxL)) add('leadmaxexpectedlimit', 'Whole numbers only (INR lakhs, no decimals)'); else if (Number(maxL) <= 0) add('leadmaxexpectedlimit', 'Maximum limit must be greater than 0'); else if (isInt(minL) && Number(maxL) <= Number(minL)) add('leadmaxexpectedlimit', 'Maximum limit must be greater than the minimum limit');
  const minR = l.leadminexpectedroi, maxR = l.leadmaxexpectedroi;
  if (isBlank(minR)) add('leadminexpectedroi', 'Minimum expected ROI is mandatory'); else if (!isNum(minR)) add('leadminexpectedroi', 'ROI must be a number'); else if (Number(minR) < 0) add('leadminexpectedroi', 'ROI must be 0 or more');
  if (isBlank(maxR)) add('leadmaxexpectedroi', 'Maximum expected ROI is mandatory'); else if (!isNum(maxR)) add('leadmaxexpectedroi', 'ROI must be a number'); else if (Number(maxR) < 0) add('leadmaxexpectedroi', 'ROI must be 0 or more'); else if (isNum(minR) && Number(maxR) < Number(minR)) add('leadmaxexpectedroi', 'Maximum ROI cannot be below the minimum ROI');
  if (isBlank(l.creditperiod)) add('creditperiod', 'Credit period is mandatory'); else if (!isInt(l.creditperiod) || Number(l.creditperiod) < 1) add('creditperiod', 'Credit period must be a whole number of days, at least 1');
  if (pgl) {
    if (isBlank(l.externalrating)) add('externalrating', 'External rating is mandatory for a Program Lead');
    if (isBlank(l.externalratingagency)) add('externalratingagency', 'External rating agency is mandatory for a Program Lead');
    if (!isBlank(l.prospectivenoofchannelpartners) && (!isInt(l.prospectivenoofchannelpartners) || Number(l.prospectivenoofchannelpartners) < 0)) add('prospectivenoofchannelpartners', 'Whole number, 0 or more');
    if (!isBlank(l.averagechannelpartnerlimit) && (!isInt(l.averagechannelpartnerlimit) || Number(l.averagechannelpartnerlimit) < 0)) add('averagechannelpartnerlimit', 'Whole number, 0 or more (INR lakhs)');
  }
  if (cpl) {
    if (isBlank(l.relationshipvintagewithanchor)) add('relationshipvintagewithanchor', 'Relationship vintage is mandatory for a Channel Partner Lead'); else if (!isInt(l.relationshipvintagewithanchor) || Number(l.relationshipvintagewithanchor) < 1) add('relationshipvintagewithanchor', 'Vintage must be a whole number of months, at least 1');
    if (isBlank(l.conductwithanchor)) add('conductwithanchor', 'Conduct with anchor is mandatory for a Channel Partner Lead'); else if (!CONDUCT().includes(l.conductwithanchor)) add('conductwithanchor', 'Conduct must be Satisfactory or Unsatisfactory');
    if (isBlank(l.anchorrecommendedlimit)) add('anchorrecommendedlimit', 'Anchor recommended limit is mandatory'); else if (!isInt(l.anchorrecommendedlimit) || Number(l.anchorrecommendedlimit) <= 0) add('anchorrecommendedlimit', 'Whole number greater than 0 (INR lakhs)');
    const fy = (grp, label, cond) => ['currentfyyear', 'lastfyyear', 'secondlastfyyear'].forEach(k => { const v = (l[grp] || {})[k]; if (cond) { if (isBlank(v)) add(`${grp}.${k}`, `${label} (${k}) is mandatory`); else if (Number(v) < 0 || (grp !== 'dependencyonanchor' && !isInt(v))) add(`${grp}.${k}`, `${label} must be ${grp === 'dependencyonanchor' ? 'a number' : 'a whole number'} of 0 or more`); } });
    fy('purchasesalesfromtoanchor', 'Purchases/Sales from anchor', true); fy('turnover', 'Turnover', true); fy('profitaftertax', 'PAT', true); fy('dependencyonanchor', 'Dependency on anchor', l.productcode === 'DF');
    if (!isBlank(l.channelpartnerudyamno) && !RX.udyam.test(l.channelpartnerudyamno)) add('channelpartnerudyamno', 'UDYAM number must look like UDYAM-XX-00-0000000');
  }
  const lenders = l.chooselenders || [];
  if (!lenders.length || lenders.every(x => isBlank(x.lenderpsbplatformid))) add('lenderpsbplatformid', 'Select at least one partnered lender');
  if (cpl && lenders.some(x => isBlank(x.psbplatformprogramid))) add('psbplatformprogramid', 'PSB Platform Program ID is mandatory for a Channel Partner Lead');
  const ap = l.authorizedpersondetails || [];
  if (!ap.length) add('authorizedpersonname', 'At least one authorised person is mandatory');
  ap.forEach((a, i) => {
    const e = { idx: i };
    if (isBlank(a.authorizedpersonname)) add('authorizedpersonname', 'Authorised person name is mandatory', e);
    if (isBlank(a.authorizedpersonemailid)) add('authorizedpersonemailid', 'Authorised person email is mandatory', e); else if (!RX.email.test(a.authorizedpersonemailid)) add('authorizedpersonemailid', 'Enter a valid email address', e);
    if (isBlank(a.authorizedpersonmobileno)) add('authorizedpersonmobileno', 'Authorised person mobile is mandatory', e); else if (!RX.mobile.test(String(a.authorizedpersonmobileno))) add('authorizedpersonmobileno', 'Mobile number must be 10 digits', e);
    if (isBlank(a.tobeusedforonboarding)) add('tobeusedforonboarding', 'Choose whether this person is used for onboarding', e);
  });
  if (ap.length && ap.every(a => a.tobeusedforonboarding !== 'Yes')) add('tobeusedforonboarding', 'DICE rule: at least one authorised person must be marked for onboarding', { idx: 0 });
  return errs;
}

/* ---------- API key -> form field / wizard step (so API errors land next to the right input) ---------- */
const LEAD_KEY_FIELD = {
  leadtyp: ['leadtyp', 1], leadonboardingtype: ['onboardingMode', 1], productcode: ['productcode', 1], anchorpannumber: ['pan', 1], leadname: ['leadname', 1], leadprimarygstn: ['gstin', 1],
  leadconstitution: ['constitution', 1], leaddateofincorporation: ['doi', 1], leadindustryclassification: ['industry', 1], leadregisteredaddress: ['address', 1],
  leadminexpectedlimit: ['minLimit', 2], leadmaxexpectedlimit: ['maxLimit', 2], leadminexpectedroi: ['minRoi', 2], leadmaxexpectedroi: ['maxRoi', 2], creditperiod: ['creditPeriod', 2],
  externalrating: ['externalRating', 2], externalratingagency: ['ratingAgency', 2], prospectivenoofchannelpartners: ['prospectiveCps', 2], averagechannelpartnerlimit: ['avgCpLimit', 2],
  lenderpsbplatformid: ['lenders', 3],
  authorizedpersonname: ['name', 4], authorizedpersonemailid: ['email', 4], authorizedpersonmobileno: ['mobile', 4], tobeusedforonboarding: ['onboarding', 4],
  sourcingpartnerspocname: ['spoc.name', 4], sourcingpartneremailid: ['spoc.email', 4], sourcingpartnerspocmobileno: ['spoc.mobile', 4], customerreferenceid: ['customerReferenceId', 4], sourcingpartnerleadid: ['sourcingPartnerLeadId', 4],
  fintechpsbplatformid: ['fintechPsbId', 0],
};
const PERSON_KEYS = ['authorizedpersonname', 'authorizedpersonemailid', 'authorizedpersonmobileno', 'tobeusedforonboarding'];
function leadErrorMap(errs) {                 // -> { 'leadname': msg, 'authPersons.0.email': msg, ... } + per-step counts
  const m = {}, steps = {};
  errs.forEach(e => {
    const f = LEAD_KEY_FIELD[e.key]; if (!f) { m['_' + e.key] = e.msg; return; }
    const path = PERSON_KEYS.includes(e.key) ? `authPersons.${e.idx || 0}.${f[0]}` : f[0];
    if (!m[path]) m[path] = e.msg; steps[f[1]] = (steps[f[1]] || 0) + 1;
  });
  return { m, steps };
}
/* client validation of a draft: build the payload exactly as it would be sent, validate it as the server would */
function validateLeadDraft(d, st) {
  const payload = buildLeadPayload(d, st); let errs = validateLeadPayload(payload, st);
  if (d.doi && !validISO(d.doi)) errs = errs.filter(e => e.key !== 'leaddateofincorporation').concat({ key: 'leaddateofincorporation', msg: 'Enter a real calendar date (DD-MM-YYYY)' });
  return { payload, errs };
}
const stepErrors = (errs, step) => errs.filter(e => (LEAD_KEY_FIELD[e.key] || [])[1] === step);

/* ---------- supplier onboarding form ---------- */
function validateSupplierForm(f, ctx = {}) {
  const e = {}, add = (k, m) => { if (!e[k]) e[k] = m; };
  if (isBlank(f.vendorId)) add('vendorId', 'Select a supplier from the Supplier Master');
  if (isBlank(f.programmeId)) add('programmeId', 'Select an active programme');
  if (isBlank(f.address)) add('address', 'Registered address is required'); else if (String(f.address).length > 100) add('address', 'Registered address can be at most 100 characters');
  if (isBlank(f.constitution) || !CONSTITUTIONS().includes(f.constitution)) add('constitution', 'Choose a constitution from the PSB master');
  if (isBlank(f.doi)) add('doi', 'Date of incorporation is required'); else if (!validISO(f.doi) || f.doi >= todayISO()) add('doi', 'Date of incorporation must be a past date');
  if (isBlank(f.industry)) add('industry', 'Industry is required');
  if (f.msme === 'Yes') { if (isBlank(f.udyam)) add('udyam', 'Udyam number is required for an MSME'); else if (!RX.udyam.test(f.udyam)) add('udyam', 'UDYAM number must look like UDYAM-XX-00-0000000'); }
  if (isBlank(f.contact?.name)) add('contact.name', 'Authorised person name is required');
  if (isBlank(f.contact?.email)) add('contact.email', 'Email is required'); else if (!RX.email.test(f.contact.email)) add('contact.email', 'Enter a valid email address');
  if (isBlank(f.contact?.mobile)) add('contact.mobile', 'Mobile is required'); else if (!RX.mobile.test(String(f.contact.mobile))) add('contact.mobile', 'Mobile number must be 10 digits');
  ['purch', 'turn', 'pat'].forEach(g => ['cur', 'last', 'second'].forEach(k => { const v = f[g]?.[k]; if (!isBlank(v) && (!isNum(v) || Number(v) < 0)) add(`${g}.${k}`, 'Enter a number of 0 or more (INR lakhs)'); }));
  if (ctx.step >= 3 || ctx.final) {
    if (isBlank(f.bank?.holder)) add('bank.holder', 'Account holder name is required');
    if (isBlank(f.bank?.acct)) add('bank.acct', 'Account number is required'); else if (!/^[0-9]{9,18}$/.test(String(f.bank.acct))) add('bank.acct', 'Account number must be 9–18 digits');
    if (isBlank(f.bank?.ifsc)) add('bank.ifsc', 'IFSC is required'); else if (!RX.ifsc.test(String(f.bank.ifsc).toUpperCase())) add('bank.ifsc', 'IFSC must look like HDFC0001234');
    if (isBlank(f.bank?.bankName)) add('bank.bankName', 'Bank name is required');
    if (!f.consentData) add('consentData', 'Consent to share data with the partner/lender is required');
    if (!f.consentTerms) add('consentTerms', 'Acceptance of the programme participation declaration is required');
  }
  return e;
}
