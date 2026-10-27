/* =====================================================================
   screens-avail.js — Avail Financing: programmes (PGL leads), active programmes, supplier financing onboarding, vendor-portal tile
   ===================================================================== */
const stg = () => ({ fintechPsbId: settings().fintechPsbId, epochUnit: settings().epochUnit });
const draftForCheck = f => ({ ...f, customerReferenceId: f.customerReferenceId || 'AUTOGEN', sourcingPartnerLeadId: f.sourcingPartnerLeadId || 'AUTOGEN' });
const clone = o => JSON.parse(JSON.stringify(o));
const limitText = f => `${fmtLakh(f.minLimit)} – ${fmtLakh(f.maxLimit)}`;
function prgStageStatus(prg) {
  if (!prg.lenders || !prg.lenders.length) return ['—', prg.dstatus];
  const best = prg.lenders.slice().sort((a, b) => stageRank(b.stage) - stageRank(a.stage) || (b.status === 'Active') - (a.status === 'Active'))[0];
  return [best.stage, best.status];
}
const prgCanEdit = prg => PRG_EDITABLE.includes(prg.dstatus);

/* ---------------------------------------------------------------- home */
ROUTES.avail = r => {
  const sub = r.parts[1];
  if (sub === 'new') return prgWizard(r, null);
  if (sub === 'prg' && r.parts[3] === 'edit') return prgWizard(r, getPrg(r.parts[2]));
  if (sub === 'prg') return prgDetail(getPrg(r.parts[2]));
  if (sub === 'active') return activeDetail(getPrg(r.parts[2]), r.parts[3]);
  if (sub === 'sup' && r.parts[2] === 'new') return supWizard(r);
  if (sub === 'sup') return supDetail(getProfile(r.parts[2]));
  if (db.meta.role === 'supplier') return vendorPortalHome();
  const tab = r.q.tab || 'programmes';
  if (tab === 'programmes') fetchPartnerships();                       // landing page: load lender partnerships (cached); never calls the Lead API
  const k = { all: db.programmes.length, pend: db.programmes.filter(p => p.dstatus === PRG_STATUS.PENDING).length, act: activeProgrammes().filter(x => !x.inactive).length };
  return `<div class="page">${pageHead({ title: 'Avail Financing', back: false, right: gbtn('prg.create', 'prg-new', 'Add Programme', { cls: 'btn-primary', icn: 'plus' }) })}
    <div class="hint" style="margin:4px 0 0">Set up financing programmes, onboard suppliers and track invoice financing. Programme requests are one-time setup — an active programme does not mean an invoice has been funded.</div>
    ${tabsHtml([['programmes', 'Programmes', k.all], ['suppliers', 'Suppliers', db.profiles.length], ['active', 'Active Programmes', k.act]], tab, '#/avail')}
    <div style="margin-top:14px">${tab === 'programmes' ? programmesTab(k) : tab === 'suppliers' ? suppliersTab() : activeTab()}</div></div>`;
};
ACT['prg-new'] = () => go('#/avail/new?step=1');

function programmesTab(k) {
  const c = db.cache.partnerships;
  return `${strip([['Programme requests', k.all], ['Awaiting internal approval', k.pend, '', k.pend ? 'hl' : ''], ['Awaiting lender / PSB', db.programmes.filter(p => p.dstatus === PRG_STATUS.SUBMITTED && !p.lenders.some(l => l.status === 'Active')).length], ['Active programmes', k.act, 'ready for suppliers'], ['Product', 'SID', 'Sales Invoice Discounting']])}
    <div class="small-note" style="margin:10px 0 0">Lender partnerships: ${c ? `cached ${fmtDT(c.fetchedAt)} (Get Partnerships Details API)` : 'not loaded'} · <a class="link" href="#" data-act="refresh-partners">Refresh</a></div>
    ${listHtml('prg', {
      noun: 'programme requests', searchPh: 'Search request ID, product or lender', rows: () => db.programmes.slice().reverse(), match: (r, st) => matchText(st, r.reqId, r.form.productcode, PRODUCT_NAME(r.form.productcode), r.form.lenders.map(lenderName).join(' '), r.dstatus),
      cols: ['Request ID', 'Product', 'Selected Lenders', 'Requested Limit', 'Request Date', 'Lead Stage', 'Lead Status', 'Last Updated', 'Action'],
      row: p => { const [stage, status] = prgStageStatus(p), ls = p.form.lenders; return `<tr class="click" data-act="go" data-hash="#/avail/prg/${p.id}"><td><b>${esc(p.reqId)}</b></td><td>${esc(PRODUCT_NAME(p.form.productcode))}</td><td>${esc(ls.length ? lenderName(ls[0]) : '—')}${ls.length > 1 ? ` <span class="chip">+${ls.length - 1}</span>` : ''}</td><td>${p.form.maxLimit !== '' ? limitText(p.form) : '—'}</td><td>${fmtD(p.createdAt.slice(0, 10))}</td><td>${esc(stage)}</td><td>${sb(status)}${p.dstatus !== PRG_STATUS.SUBMITTED && stage !== '—' ? '' : ''}</td><td>${fmtDT(p.updatedAt || p.createdAt)}</td><td>${viewBtn('#/avail/prg/' + p.id, prgCanEdit(p) ? 'Open' : p.lenders.some(l => l.status === 'Active') ? 'View' : 'Track')}</td></tr>`; },
      empty: 'No programme requests yet — use “Add Programme” to create the first one.', right: `<button class="tool" data-act="refresh-all-prg">${icon('reset', 16)}Refresh status</button>` })}`;
}
ACT['refresh-partners'] = () => { const r = fetchPartnerships(true); toast(r.ok ? 'Lender partnerships refreshed from PSBXchange' : r.msg, r.ok ? undefined : 'err'); render(); };
ACT['refresh-all-prg'] = () => { if (!can('prg.refresh')) return toast(whyNot('prg.refresh'), 'err'); const ps = db.programmes.filter(p => p.psb.psbPlatformId); if (!ps.length) return toast('No submitted programmes to refresh', 'err'); const rs = ps.map(p => refreshProgramme(p.id)); const bad = rs.find(x => !x.ok); toast(bad ? bad.msg : `${ps.length} programme(s) checked with Get Status API`, bad ? 'err' : undefined); render(); };

function suppliersTab() {
  const rows = db.vendors.map(v => ({ v, ps: db.profiles.filter(p => p.vendorId === v.id) })).flatMap(x => x.ps.length ? x.ps.map(p => ({ v: x.v, p })) : [{ v: x.v, p: null }]);
  return `${strip([['Suppliers', db.vendors.length], ['Eligible for financing', db.profiles.filter(p => p.status === SUP.ELIGIBLE).length], ['Onboarding', db.profiles.filter(p => p.status === SUP.ONBOARDING).length], ['Action required', db.profiles.filter(p => p.status === SUP.ACTION).length, '', db.profiles.some(p => p.status === SUP.ACTION) ? 'hl' : '']])}
   ${listHtml('sup', { noun: 'suppliers', searchPh: 'Search supplier name / PAN', rows: () => rows, match: (r, st) => matchText(st, r.v.name, r.v.pan, r.v.id), cols: ['Supplier ID', 'Supplier', 'Linked Programme', 'Onboarding', 'KYC / Bank', 'Financing Status', 'Action'],
    row: ({ v, p }) => { const prg = p && getPrg(p.programmeId); return `<tr class="${p ? 'click' : ''}" ${p ? `data-act="go" data-hash="#/avail/sup/${p.id}"` : ''}><td>${v.id}</td><td><b>${esc(v.name)}</b><div class="small-note">${v.pan}</div></td><td>${prg ? `${esc(prg.reqId)} · ${esc(prg.form.productcode)}` : '—'}</td><td>${p ? sb(p.status === SUP.ELIGIBLE ? 'Completed' : p.status === SUP.ONBOARDING ? 'In Progress' : p.status === SUP.ACTION ? 'Pending' : 'Incomplete') : sb('Not started')}</td><td>${p ? sb(p.kyc === 'Verified' ? 'Verified' : p.kyc) + ' ' + sb(p.bank === 'Verified' ? 'Verified' : p.bank) : '—'}</td><td>${sb(p ? p.status : SUP.NOT_ENABLED)}</td><td>${p ? viewBtn('#/avail/sup/' + p.id, p.status === SUP.ACTION ? 'Continue' : 'View') : gbtn('sup.add', 'sup-new', 'Add supplier', { cls: 'btn-outline btn-xs', data: { vendor: v.id } })}</td></tr>`; },
    empty: 'No suppliers.', right: gbtn('sup.add', 'sup-new', 'Add Supplier', { cls: 'btn-primary btn-sm', icn: 'plus' }) })}`;
}
ACT['sup-new'] = el => go(`#/avail/sup/new?step=1${el.dataset.vendor ? '&vendor=' + el.dataset.vendor : ''}`);

function activeTab() {
  const rows = activeProgrammes();
  return `${listHtml('act', { noun: 'active programmes', searchPh: 'Search PSB Program ID / lender', rows: () => rows, match: (r, st) => matchText(st, r.row.psbProgramId, r.row.name, r.row.program.lenderprogramname),
    cols: ['PSB Program ID', 'Program Name', 'Product', 'Lender', 'Program Limit', 'Outstanding', 'Activation Date', 'Status', 'Action'],
    row: ({ prg, row }) => { const h = programmeHeadroom(prg), lim = row.program.programlimit, out = (row.program.outstandingBase || 0) + (rowUsable(prg, row) ? (h.outstanding - sum(h.lenders, l => l.program.outstandingBase || 0)) * (lim / (h.sanctioned || 1)) : 0);
      return `<tr class="click" data-act="go" data-hash="#/avail/active/${prg.id}/${row.lenderId}"><td><b>${esc(row.psbProgramId)}</b></td><td>${esc(row.program.lenderprogramname)}</td><td>${esc(prg.form.productcode)}</td><td>${esc(row.name)}</td><td class="num-r">${rupeeShort(lim)}</td><td class="num-r">${rupeeShort(out)}</td><td>${fmtEpoch(row.program.activationDate, settings().epochUnit)}</td><td>${sb(row.status)}</td><td>${viewBtn(`#/avail/active/${prg.id}/${row.lenderId}`, 'View')}</td></tr>`; },
    empty: 'No active programmes yet. A programme appears here when PSBXchange reports stage “Program” with an Active status.', right: `<button class="tool" data-act="refresh-all-prg">${icon('reset', 16)}Refresh</button>` })}`;
}

/* ---------------------------------------------------------------- programme wizard (4 steps) */
const PRG_STEPS = ['Corporate Details', 'Programme Details', 'Lender Selection', 'Contact Details'];
function prgWizard(r, prg) {
  const key = 'prg:' + (prg ? prg.id : 'new'), step = Math.min(4, Math.max(1, +r.q.step || 1));
  if (!can('prg.create')) return `<div class="page">${pageHead({ title: 'Add Programme' })}${alertBox('warn', 'Not allowed', esc(whyNot('prg.create')))}</div>`;
  if (prg && !prgCanEdit(prg)) return `<div class="page">${pageHead({ title: prg.reqId })}${alertBox('info', 'Locked', `This programme is ${esc(prg.dstatus)} and can no longer be edited.`)}<button class="btn btn-primary" data-act="go" data-hash="#/avail/prg/${prg.id}">Open programme</button></div>`;
  if (!ui.f || ui.fKey !== key) {
    ui.f = prg ? clone(prg.form) : newPrgForm(); ui.fKey = key; ui.prgId = prg ? prg.id : null;
    ui.errs = prg && prg.psb.apiErrors ? leadErrorMap(prg.psb.apiErrors).m : {};
  }
  const f = ui.f, st = settings(), stepErrCount = n => stepErrors(validateLeadDraft(draftForCheck(f), stg()).errs, n).length, touched = Object.keys(ui.errs || {}).length > 0;
  const apiBanner = prg && prg.psb.errorMessage && prg.dstatus === PRG_STATUS.FAILED ? alertBox('err', `PSBXchange rejected the last submission (${esc(prg.psb.errorCode)})`, `${esc(prg.psb.errorMessage)}<div class="small-note" style="margin-top:4px">Correct the fields below and submit again — the same customer reference (${esc(prg.psb.customerReferenceId)}) is reused.</div>`) : prg && prg.dstatus === PRG_STATUS.REJECTED ? alertBox('warn', 'Returned by the approver', esc(prg.approval.reason || '')) : '';
  const stepper = `<div class="stepper">${PRG_STEPS.map((s, i) => `<button class="step ${i + 1 === step ? 'active' : touched && stepErrCount(i + 1) ? 'err' : i + 1 < step ? 'done' : ''}" data-act="prg-goto" data-step="${i + 1}"><b>${touched && stepErrCount(i + 1) ? '!' : i + 1 < step ? '✓' : i + 1}</b>${s}</button>`).join('')}</div>`;
  const body = step === 1 ? prgStep1(f) : step === 2 ? prgStep2(f) : step === 3 ? prgStep3(f) : prgStep4(f, prg);
  const last = step === 4;
  return `<div class="page">${pageHead({ title: prg ? `Edit ${prg.reqId}` : 'Add Programme', tags: `<span class="pill">PGL · Program Lead</span>`, right: `<button class="btn btn-outline" data-act="prg-close">${icon('x', 15)}Close</button>` })}
    <div class="hint">Create a new financing programme request · Step ${step} of 4 · <b>*</b> marks fields the PSBXchange Lead API requires.</div>${apiBanner}${stepper}
    <div class="card">${body}
      <div style="display:flex;gap:10px;margin-top:8px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:16px">
        ${step > 1 ? `<button class="btn btn-outline" data-act="prg-prev" data-step="${step}">← Back</button>` : '<button class="btn btn-ghost" data-act="prg-close">Cancel</button>'}<span class="spacer" style="flex:1"></span>
        <button class="btn btn-outline" data-act="prg-save">Save draft</button>
        ${last ? `<button class="btn btn-primary" data-act="prg-submit">${st.requireInternalApproval ? 'Submit for internal approval →' : 'Submit to PSBXchange →'}</button>` : `<button class="btn btn-primary" data-act="prg-next" data-step="${step}">Save &amp; Next →</button>`}</div></div>
    <div class="small-note" style="margin-top:12px">Nothing is sent to PSBXchange while you navigate or save a draft. The Lead API is called once — after you submit${st.requireInternalApproval ? ' and the authorised approver approves' : ''}.</div></div>`;
}
function prgStep1(f) {
  const prodOpts = ['SID', 'PID', 'REVFACT', 'FACT'].map(c => { const en = settings().enabledProducts.includes(c); return `<option value="${c}" ${f.productcode === c ? 'selected' : ''} ${en ? '' : 'disabled'}>${esc(PRODUCT_NAME(c))} (${c})${en ? '' : ' — not enabled for this tenant'}</option>`; }).join('');
  return `<div class="card-t">Corporate Details</div><div class="fgrid">
    ${fx('Product', 'productcode', { req: rq('productcode'), api: 'productcode', opts: [], optsHtml: prodOpts, r: true, hint: 'Exact PSBXchange code is sent. Programme leads (PGL) are used for SID, PID, FACT and REVFACT; CPL is only for DF / VF.' })}
    ${fx('Lead onboarding mode', 'onboardingMode', { req: rq('leadonboardingtype'), api: 'leadonboardingtype', opts: ONBOARDING_MODES(), hint: 'Self = the corporate completes onboarding itself; Assisted = DICE completes it on their behalf.' })}
    ${F.ro('Lead type', '<b>Program Lead</b> <span class="small-note">(leadtyp = PGL)</span>')}
    ${fx('Legal entity / anchor name', 'leadname', { req: rq('leadname'), api: 'leadname', ph: 'e.g. Hindalco Industries Limited', hint: 'Prefilled from the DICE company master. Letters, numbers and spaces only.' })}
    ${fx('PAN', 'pan', { req: rq('anchorpannumber'), api: 'anchorpannumber', ph: 'ABCDE1234F', hook: 'upper', max: 10 })}
    ${fx('Primary GSTIN', 'gstin', { req: rq('leadprimarygstn'), api: 'leadprimarygstn', ph: '15-character GSTIN', hook: 'upper', max: 15, hint: 'Must start with a valid state code and contain the PAN (characters 3–12).' })}
    ${fx('Constitution', 'constitution', { req: rq('leadconstitution'), api: 'leadconstitution', opts: CONSTITUTIONS(), blank: 'Select constitution' })}
    ${fx('Date of incorporation', 'doi', { req: rq('leaddateofincorporation'), api: 'leaddateofincorporation', type: 'date', hint: `Sent as an epoch integer (${settings().epochUnit}, IST midnight); shown as DD-MM-YYYY${f.doi ? ' → ' + ddmmyyyy(f.doi) : ''}.` })}
    ${fx('Industry classification', 'industry', { req: rq('leadindustryclassification'), api: 'leadindustryclassification', opts: INDUSTRIES, blank: 'Select industry', hint: 'The workbook refers to an Industry Master it does not contain — this list is a stand-in.' })}
    ${fx('Registered address', 'address', { req: rq('leadregisteredaddress'), api: 'leadregisteredaddress', area: true, cls: 'span2', hint: `${String(f.address || '').length}/100 characters` })}</div>`;
}
function prgStep2(f) {
  return `<div class="card-t">Programme Limit Required</div><div class="fgrid">
    ${fx('Minimum programme limit (INR lakhs)', 'minLimit', { req: rq('leadminexpectedlimit'), api: 'leadminexpectedlimit', num: true, type: 'number', min: 0, step: 1, hint: f.minLimit !== '' ? `= ${fmtLakh(f.minLimit)}` : 'Whole numbers only' })}
    ${fx('Maximum programme limit (INR lakhs)', 'maxLimit', { req: rq('leadmaxexpectedlimit'), api: 'leadmaxexpectedlimit', num: true, type: 'number', min: 0, step: 1, hint: f.maxLimit !== '' ? `= ${fmtLakh(f.maxLimit)} · must exceed the minimum` : 'Must exceed the minimum' })}
    ${fx('Expected minimum ROI (%)', 'minRoi', { req: rq('leadminexpectedroi'), api: 'leadminexpectedroi', num: true, type: 'number', min: 0, step: '0.01' })}
    ${fx('Expected maximum ROI (%)', 'maxRoi', { req: rq('leadmaxexpectedroi'), api: 'leadmaxexpectedroi', num: true, type: 'number', min: 0, step: '0.01' })}</div>
    <div class="sec-h">Additional Programme Details</div><div class="fgrid">
    ${fx('Programme tenor / credit period (days)', 'creditPeriod', { req: rq('creditperiod'), api: 'creditperiod', num: true, type: 'number', min: 1, step: 1 })}
    ${fx('External rating', 'externalRating', { req: rq('externalrating'), api: 'externalrating', opts: RATINGS, blank: 'Select rating', hint: 'Mandatory for a Program Lead. “Unrated” is allowed here but confirm with PSB that it is accepted.' })}
    ${fx('Rating agency', 'ratingAgency', { req: rq('externalratingagency'), api: 'externalratingagency', opts: RATING_AGENCIES, blank: 'Select agency' })}
    ${fx('Rating date', 'ratingDate', { type: 'date', dice: true, hint: 'The Lead API has no rating-date field — kept in DICE only.' })}
    ${fx('Prospective no. of channel partners', 'prospectiveCps', { api: 'prospectivenoofchannelpartners', num: true, type: 'number', min: 0, step: 1, hint: 'Optional · Program Lead only' })}
    ${fx('Average channel-partner limit (INR lakhs)', 'avgCpLimit', { api: 'averagechannelpartnerlimit', num: true, type: 'number', min: 0, step: 1, hint: 'Optional · Program Lead only' })}</div>
    ${noteBox('', 'info', 'Limit and ROI are <b>expectations</b> for the lender’s evaluation — not a sanctioned limit or a committed rate.')}`;
}
function prgStep3(f) {
  const res = fetchPartnerships(), rows = res.data ? lendersForProduct(f.productcode, res.data.rows) : [], sel = rows.filter(x => x.selectable), err = ui.errs && ui.errs.lenders;
  if (!res.data) return `<div class="card-t">Select Partnered Lenders</div>${alertBox('err', 'Could not load lenders', `${esc(res.msg)} <button class="btn btn-outline btn-xs" data-act="refresh-partners">Retry</button>`)}`;
  return `<div class="card-t">Select Partnered Lenders <span class="spacer"></span><button class="btn btn-outline btn-xs" data-act="prg-lender-all">Select all active</button><button class="btn btn-ghost btn-xs" data-act="refresh-partners">${icon('reset', 13)}Refresh</button></div>
    <div class="small-note" style="margin-bottom:10px">From the Get Partnerships Details API · cached ${fmtDT(res.data.fetchedAt)} · only an <b>Active</b> partnership that lists <b>${esc(f.productcode)}</b> can be selected${res.stale ? ' · <span style="color:var(--danger)">' + esc(res.msg) + '</span>' : ''}</div>
    ${!sel.length ? alertBox('err', `No active ${f.productcode} lender partnership`, `Submission is blocked until at least one lender is active for ${esc(f.productcode)}. <button class="btn btn-outline btn-xs" data-act="escalate-partner">Escalate to Integration Ops</button>`) : ''}
    ${err ? `<div class="ferr" style="margin:0 0 8px">${esc(err)}</div>` : ''}
    ${rows.map(l => `<label class="lender-card ${l.selectable ? (f.lenders.includes(l.id) ? 'on' : '') : 'off'}"><input type="checkbox" data-act="prg-lender" data-id="${l.id}" ${f.lenders.includes(l.id) ? 'checked' : ''} ${l.selectable ? '' : 'disabled'}><div style="flex:1"><div class="nm">${esc(l.name)} ${sb(l.status === 'Active' ? 'Active' : l.status === 'In Active' ? 'In Active' : l.status === 'Rejected' ? 'Rejected' : 'Pending')}</div><div class="sm">${l.products.map(p => `<span class="chip">${p}</span>`).join('')}${l.selectable ? ` ${l.activePrograms != null ? l.activePrograms + ' active ' + f.productcode + ' programme(s)' : ''}` : ` <span style="color:var(--danger)">${esc(l.why)}</span>`}</div></div></label>`).join('')}
    <div class="small-note">Sent as <span class="tag-api">chooselenders[].lenderpsbplatformid</span> · selected: ${f.lenders.length ? f.lenders.map(lenderName).join(', ') : 'none'}</div>`;
}
ACT['prg-lender'] = el => { const f = ui.f, id = el.dataset.id; f.lenders = el.checked ? [...new Set([...f.lenders, id])] : f.lenders.filter(x => x !== id); ui.errs.lenders = ''; render(); };
ACT['prg-lender-all'] = () => { const res = fetchPartnerships(); ui.f.lenders = lendersForProduct(ui.f.productcode, res.data.rows).filter(l => l.selectable).map(l => l.id); render(); };
ACT['escalate-partner'] = () => { audit(null, 'Integration', `Escalation: no active ${ui.f.productcode} lender partnership`, 'bad'); save(); toast('Escalated to Integration Ops (logged in the audit trail)'); };
function prgStep4(f, prg) {
  const ps = f.authPersons;
  return `<div class="card-t">Corporate Authorised Person Details</div>
    ${ps.map((p, i) => `<div class="person-card"><div class="ph-h">Authorised person ${i + 1}<span class="spacer"></span>${ps.length > 1 ? `<button class="btn btn-ghost btn-xs" data-act="prg-rm-person" data-i="${i}">${icon('trash', 13)}Remove</button>` : ''}</div><div class="fgrid3">
      ${fx('Name', `authPersons.${i}.name`, { req: rq('authorizedpersonname'), api: 'authorizedpersonname', errPath: `authPersons.${i}.name` })}
      ${fx('Mobile number', `authPersons.${i}.mobile`, { req: rq('authorizedpersonmobileno'), api: 'authorizedpersonmobileno', max: 10, ph: '10 digits' })}
      ${fx('Official email', `authPersons.${i}.email`, { req: rq('authorizedpersonemailid'), api: 'authorizedpersonemailid', type: 'email' })}
      ${fx('Business vertical', `authPersons.${i}.vertical`, { dice: true })}
      ${fx('Designation', `authPersons.${i}.designation`, { dice: true })}
      ${fx('Use for onboarding?', `authPersons.${i}.onboarding`, { req: rq('tobeusedforonboarding'), api: 'tobeusedforonboarding', opts: ['Yes', 'No'] })}</div></div>`).join('')}
    <button class="btn btn-outline btn-sm" data-act="prg-add-person">${icon('plus', 14)}Add authorised person</button>
    <div class="sec-h">Sourcing Partner Contact (DICE / Zaggle)</div><div class="fgrid3">
      ${fx('SPOC name', 'spoc.name', { req: rq('sourcingpartnerspocname'), api: 'sourcingpartnerspocname' })}${fx('SPOC email', 'spoc.email', { req: rq('sourcingpartneremailid'), api: 'sourcingpartneremailid', type: 'email' })}${fx('SPOC mobile', 'spoc.mobile', { req: rq('sourcingpartnerspocmobileno'), api: 'sourcingpartnerspocmobileno', max: 10 })}</div>
    <div class="fgrid">${F.ro('Sourcing partner PSB ID', `<span class="mono">${esc(settings().fintechPsbId)}</span> <span class="tag-api">fintechpsbplatformid</span> <span class="small-note">from integration settings — never typed by the user</span>`)}
      ${F.ro('Customer reference ID', `<span class="mono">${esc((prg && prg.psb.customerReferenceId) || 'generated on submit')}</span> <span class="tag-api">customerreferenceid</span><div class="small-note">Alphanumeric, max 32 — one per programme submission, reused on retries.</div>`)}</div>
    ${noteBox('', 'info', settings().requireInternalApproval ? 'After you submit, the <b>authorised approver</b> must approve the request. Only then does DICE call the PSBXchange Lead API.' : 'Internal approval is switched off for this tenant: submitting calls the Lead API immediately.')}`;
}
ACT['prg-add-person'] = () => { ui.f.authPersons.push({ ...emptyPerson(), onboarding: 'No' }); render(); };
ACT['prg-rm-person'] = el => { ui.f.authPersons.splice(+el.dataset.i, 1); render(); };
ACT['prg-goto'] = el => { const id = ui.prgId; const to = +el.dataset.step; go(`#/avail/${id ? 'prg/' + id + '/edit' : 'new'}?step=${to}`); };
ACT['prg-prev'] = el => go(`#/avail/${ui.prgId ? 'prg/' + ui.prgId + '/edit' : 'new'}?step=${+el.dataset.step - 1}`);
ACT['prg-close'] = () => go('#/avail');
function persistDraft() { const r = saveProgrammeDraft(ui.prgId, ui.f); if (r.ok) { ui.prgId = r.prg.id; } return r; }
ACT['prg-save'] = () => { const r = persistDraft(); toast(r.msg, r.ok ? undefined : 'err'); if (r.ok) { const step = +ui.r.q.step || 1; go(`#/avail/prg/${r.prg.id}/edit?step=${step}`); } };
ACT['prg-next'] = el => {
  const step = +el.dataset.step, { errs } = validateLeadDraft(draftForCheck(ui.f), stg()), se = stepErrors(errs, step);
  ui.errs = leadErrorMap(se).m;
  if (step === 3 && !se.length) { const res = fetchPartnerships(), ok = lendersForProduct(ui.f.productcode, res.data && res.data.rows).filter(l => l.selectable).map(l => l.id), bad = ui.f.lenders.filter(l => !ok.includes(l)); if (bad.length) { ui.errs.lenders = `${bad.map(lenderName).join(', ')} is no longer active for ${ui.f.productcode} — untick it`; } }
  if (se.length || (ui.errs && ui.errs.lenders)) { render(); return toast(`${Math.max(se.length, 1)} field(s) need attention`, 'err'); }
  const r = persistDraft(); if (!r.ok) return toast(r.msg, 'err');
  go(`#/avail/prg/${r.prg.id}/edit?step=${step + 1}`);
};
ACT['prg-submit'] = () => {
  const s = persistDraft(); if (!s.ok) return toast(s.msg, 'err');
  const r = submitProgramme(ui.prgId);
  if (r.fieldErrors) { const { m, steps } = leadErrorMap(r.fieldErrors); ui.errs = m; const first = Math.min(...Object.keys(steps).map(Number).filter(n => n > 0)); render(); toast(`${r.fieldErrors.length} field(s) need attention — see step ${first}`, 'err'); return go(`#/avail/prg/${ui.prgId}/edit?step=${first}`); }
  if (!r.ok && !getPrg(ui.prgId).psb.psbPlatformId && getPrg(ui.prgId).dstatus !== PRG_STATUS.FAILED && getPrg(ui.prgId).dstatus !== PRG_STATUS.UNCERTAIN && getPrg(ui.prgId).dstatus !== PRG_STATUS.PSB_DRAFT) { errorModal(r.msg, r.errors || [r.msg]); return; }
  const id = ui.prgId; ui.f = null; ui.fKey = ''; toast(r.msg, r.ok ? undefined : 'err'); go(`#/avail/prg/${id}`);
};

/* ---------------------------------------------------------------- programme detail / tracking */
function prgDetail(prg) {
  if (!prg) return `<div class="page">${pageHead({ title: 'Programme not found' })}</div>`;
  const f = prg.form, ds = prg.dstatus, [stage, status] = prgStageStatus(prg), hasLead = !!prg.psb.psbPlatformId;
  const banner = ds === PRG_STATUS.PENDING ? alertBox('warn', 'Waiting for internal approval', 'The PSBXchange Lead API has <b>not</b> been called. It is called only after the authorised approver approves.')
    : ds === PRG_STATUS.UNCERTAIN ? alertBox('warn', 'Submission outcome unknown', `${esc(prg.psb.reason || '')}. Retrying reuses customer reference <span class="mono">${esc(prg.psb.customerReferenceId)}</span> and lead ID <span class="mono">${esc(prg.psb.sourcingPartnerLeadId)}</span>, so PSBXchange can not create a second lead.`)
    : ds === PRG_STATUS.FAILED ? alertBox('err', `Lead API rejected the request${prg.psb.errorCode ? ' (' + esc(prg.psb.errorCode) + ')' : ''}`, `${esc(prg.psb.errorMessage || '')}<div class="small-note">Edit the programme to fix the fields — nothing was created at PSBXchange.</div>`)
    : ds === PRG_STATUS.PSB_DRAFT ? alertBox('warn', 'Lead is stuck in Draft at PSBXchange', esc(prg.psb.errorMessage || ''))
    : ds === PRG_STATUS.REJECTED ? alertBox('warn', 'Returned by the approver', esc((prg.approval || {}).reason || ''))
    : ds === PRG_STATUS.SUBMITTED ? (prg.lenders.some(l => l.status === 'Active') ? alertBox('ok', 'Programme active', 'At least one lender has activated the programme. Suppliers can now be onboarded against it. Active ≠ funded.') : noteBox('', 'info', 'PSBXchange accepted the lead — <b>acceptance is not approval</b>. DICE tracks each lender’s status through the callback and Get Status API.')) : '';
  const right = [
    prgCanEdit(prg) ? gbtn('prg.create', 'prg-edit', 'Edit', { cls: 'btn-outline', data: { id: prg.id }, icn: 'edit' }) : '',
    ds === PRG_STATUS.PENDING ? gbtn('prg.approve', 'prg-approve', 'Approve', { cls: 'btn-success', data: { id: prg.id }, icn: 'check' }) + gbtn('prg.approve', 'prg-reject', 'Reject', { cls: 'btn-danger', data: { id: prg.id } }) : '',
    [PRG_STATUS.UNCERTAIN, PRG_STATUS.PSB_DRAFT].includes(ds) ? gbtn('prg.refresh', 'prg-retry', 'Retry (same references)', { cls: 'btn-primary', data: { id: prg.id }, icn: 'reset' }) : '',
    hasLead ? gbtn('prg.refresh', 'prg-refresh', 'Refresh status', { cls: 'btn-outline', data: { id: prg.id }, icn: 'reset' }) : ''].join('');
  return `<div class="page">${pageHead({ title: prg.reqId, tags: sb(ds === PRG_STATUS.SUBMITTED ? status : ds) + ` <span class="pill">${esc(f.productcode)}</span>`, right, crumb: `<a class="link" href="#/avail">Avail Financing</a> › Programmes` })}
    ${banner}
    ${strip([['Requested limit', f.maxLimit !== '' ? limitText(f) : '—'], ['Expected ROI', f.maxRoi !== '' ? `${f.minRoi}% – ${f.maxRoi}%` : '—'], ['Credit period', f.creditPeriod ? `${f.creditPeriod} days` : '—'], ['PSB lead ID', hasLead ? `<span class="mono">${esc(prg.psb.psbPlatformId)}</span>` : '—'], ['Lead stage', esc(stage)]])}
    ${hasLead ? `<div class="sec">Lender status <span class="sub">one lead, tracked per lender${prg.lastRefreshAt ? ' · last refreshed ' + fmtDT(prg.lastRefreshAt) : ''}</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Lender</th><th>PSB stage</th><th>PSB status</th><th>Last updated</th><th>PSB Program ID</th><th>Action</th></tr></thead><tbody>${prg.lenders.map(l => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.stage)}</td><td>${sb(l.status)}${l.unknown ? ' <span class="chip" style="color:var(--danger)">unknown status</span>' : ''}</td><td>${fmtEpoch(l.updatedAt, settings().epochUnit)}</td><td class="mono">${esc(l.psbProgramId || '—')}</td><td>${l.stage === 'Program' && l.psbProgramId ? viewBtn(`#/avail/active/${prg.id}/${l.lenderId}`, 'View programme') : gbtn('prg.refresh', 'prg-refresh', 'Refresh', { cls: 'btn-outline btn-xs', data: { id: prg.id, lender: l.lenderId } })}</td></tr>`).join('')}</tbody></table></div>
    ${prg.lenders.filter(l => l.offer).map(l => offerCard(l)).join('')}` : ''}
    <div class="cards-2" style="margin-top:22px"><div class="card"><div class="card-t">Programme request</div><div class="kvg c2">
      ${kv('Entity', `${esc(f.leadname)}<div class="small-note">PAN ${esc(f.pan)} · ${esc(f.gstin)}</div>`)}${kv('Constitution / industry', `${esc(f.constitution)} · ${esc(f.industry)}`)}${kv('Onboarding mode', esc(f.onboardingMode))}${kv('Rating', `${esc(f.externalRating || '—')} ${f.ratingAgency ? '(' + esc(f.ratingAgency) + ')' : ''}`)}
      ${kv('Lenders requested', f.lenders.map(lenderName).map(esc).join(', ') || '—')}${kv('Authorised approver contact', f.authPersons.map(p => esc(p.name)).join(', '))}
      ${kv('Customer reference ID', `<span class="mono">${esc(prg.psb.customerReferenceId || '—')}</span>`)}${kv('Sourcing partner lead ID', `<span class="mono">${esc(prg.psb.sourcingPartnerLeadId || '—')}</span>`)}</div></div>
      <div class="card"><div class="card-t">Timeline</div>${timelineHtml(histItems(prg.history).concat((prg.lenders || []).flatMap(l => l.history.map(h => ({ at: new Date(h.at * (settings().epochUnit === 'seconds' ? 1000 : 1)).toISOString(), by: `${l.name} · ${h.source}`, text: `${h.stage} · ${h.status}` }))).sort((a, b) => b.at < a.at ? -1 : 1)))}</div></div>
    ${prg.psb.lastRequest ? `<div class="sec">API exchange <span class="sub">${prg.psb.attempts} attempt(s) · last HTTP ${prg.psb.lastHttp || 'timeout'} · <a class="link" href="#/integration">open Integration console</a></span></div>
      ${jsonBlock('Lead API request (as sent — masked)', prg.psb.lastRequest)}${jsonBlock('Lead API response', prg.psb.lastResponse)}` : prg.snapshot ? jsonBlock('Lead API request that will be sent after approval (snapshot at submit)', maskPayload(prg.snapshot.payload)) : ''}
    ${psbControlsHtml(prg)}</div>`;
}
function offerCard(l) {
  const o = l.offer;
  return `<div class="card" style="margin-top:14px"><div class="card-t">Offer from ${esc(l.name)} ${sb(l.status)}</div><div class="kvg c4">${kv('Programme', esc(o.lenderprogramname))}${kv('Limit', rupeeShort(o.programlimit))}${kv('ROI', `${o.programroi}% <span class="small-note">(${esc(o.programroibenchmarkcode)} + ${o.psbroispread}%)</span>`)}${kv('Tenor / interest', `${o.programtenor} days · ${esc(o.programinteresttype)}`)}${kv('Grace', o.programgraceperioddays ? o.programgraceperioddays + ' days' : 'None')}${kv('FLDG', o.programfldgapplicable === 'Yes' ? o.programfldgpercentage + '%' : 'Not applicable')}${kv('Penal interest', o.programpenalinterestrate + '%')}${kv('Offer valid for', o.psbofferexpiryperiod + ' days')}</div><div class="small-note" style="margin-top:10px"><b>Key terms:</b> ${esc(o.conditiondescription)}</div><div class="small-note">Accepting or rejecting an offer happens on the PSB Platform — the workbook has no API for it. DICE only shows the resulting status.</div></div>`;
}
ACT['prg-edit'] = el => go(`#/avail/prg/${el.dataset.id}/edit?step=1`);
ACT['prg-approve'] = el => { const r = approveProgramme(el.dataset.id); toast(r.msg, r.ok ? undefined : 'err'); render(); };
ACT['prg-reject'] = el => reasonModal({ title: 'Reject programme request', label: 'Reason for rejection', btn: 'Reject', onSubmit: reason => { const r = rejectProgramme(el.dataset.id, reason); toast(r.msg, r.ok ? undefined : 'err'); render(); } });
ACT['prg-retry'] = el => { const r = retryLead(el.dataset.id); toast(r.msg, r.ok ? undefined : 'err'); render(); };
ACT['prg-refresh'] = el => { if (!can('prg.refresh')) return toast(whyNot('prg.refresh'), 'err'); const r = refreshProgramme(el.dataset.id, el.dataset.lender); toast(r.msg, r.ok ? undefined : 'err'); render(); };

/* ---------------------------------------------------------------- active programme (read-only, from Get Status) */
function activeDetail(prg, lenderId) {
  const row = prg && lenderRow(prg, lenderId); if (!row || !row.program) return `<div class="page">${pageHead({ title: 'Programme not found' })}</div>`;
  const p = row.program, f = prg.form, special = SPECIAL_PRODUCTS.includes(f.productcode), h = programmeHeadroom(prg), ok = rowUsable(prg, row);
  const sup = db.profiles.filter(x => x.programmeId === prg.id);
  return `<div class="page">${pageHead({ title: 'Active Programme Details', tags: sb(row.status), right: gbtn('prg.refresh', 'prg-refresh', 'Refresh', { cls: 'btn-outline', data: { id: prg.id, lender: lenderId }, icn: 'reset' }), crumb: `<a class="link" href="#/avail?tab=active">Active Programmes</a> › ${esc(row.psbProgramId)}` })}
    ${row.status === 'In Active' ? alertBox('warn', 'Programme is inactive', 'New financing requests are blocked. Already-funded transactions are not changed.') : !ok ? alertBox('warn', 'Not usable for financing', 'The lender partnership is no longer active for this product.') : ''}
    <div class="card"><div class="card-t">Programme summary</div><div class="kvg">
      ${kv('Programme name', esc(p.lenderprogramname))}${kv('Product', `${esc(f.productcode)} — ${esc(PRODUCT_NAME(f.productcode))}`)}${kv('Lender', esc(row.name))}${kv('Sanctioned limit', rupeeShort(p.programlimit))}${kv('Outstanding (this lender)', rupeeShort((p.outstandingBase || 0)))}${kv('Programme tenor', `${p.programtenor} days`)}
      ${kv('ROI', `${p.programroi}%`)}${kv('Benchmark', esc(p.programroibenchmarkcode))}${kv('Spread', `${p.psbroispread}%`)}${kv('Interest type', esc(p.programinteresttype))}${kv('Grace period', p.programgraceperiodapplicable === 'Yes' ? `${p.programgraceperioddays} days` : 'Not applicable')}${kv('FLDG', p.programfldgapplicable === 'Yes' ? `${p.programfldgpercentage}%` : 'Not applicable')}
      ${kv('Penal interest', `${p.programpenalinterestrate}%`)}${kv('Sanction date', fmtEpoch(p.sanctionDate, settings().epochUnit))}${kv('PSB Program ID', `<span class="mono">${esc(row.psbProgramId)}</span>`)}
      ${special ? '' : kv('Stop supply', p.programstopsupplyapplicable === 'Yes' ? `${p.programstopsupplydays} days` : 'Not applicable')}${special ? '' : kv('Channel-partner limit', `${rupeeShort(p.minchannelpartnerlimit)} – ${rupeeShort(p.maxchannelpartnerlimit)}`)}</div>
      ${special ? `<div class="small-note" style="margin-top:10px">Stop-supply days and min/max channel-partner limit are not applicable to ${esc(f.productcode)} (the workbook sends them only for products other than SID, PID, FACT and REVFACT).</div>` : ''}
      <div class="small-note" style="margin-top:10px"><b>Key terms and conditions:</b> ${esc(p.terms)}</div>
      <div style="margin-top:10px"><button class="btn btn-outline btn-sm" data-act="dl-mou" data-prg="${prg.id}" data-lender="${lenderId}">${icon('download', 14)}Download final MOU (PDF)</button></div></div>
    <div class="sec">Suppliers linked to this programme ${gbtn('sup.add', 'sup-new', 'Add Supplier', { cls: 'btn-primary btn-sm', icn: 'plus' })}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Supplier</th><th>Supplier ID</th><th>Onboarding status</th><th>Financing eligibility</th><th>Action</th></tr></thead><tbody>${sup.length ? sup.map(s => { const v = getVendor(s.vendorId); return `<tr class="click" data-act="go" data-hash="#/avail/sup/${s.id}"><td><b>${esc(v.name)}</b></td><td>${v.id}</td><td>${sb(s.status === SUP.ELIGIBLE ? 'Completed' : s.status === SUP.ONBOARDING ? 'In Progress' : 'Pending')}</td><td>${sb(s.status)}</td><td>${viewBtn('#/avail/sup/' + s.id)}</td></tr>`; }).join('') : emptyRow(5, 'No suppliers linked yet')}</tbody></table></div></div>`;
}

/* ---------------------------------------------------------------- supplier onboarding wizard (3 steps) */
const SUP_STEPS = ['Select Supplier', 'Financing Details', 'Review & Consent'];
function supWizard(r) {
  const isSup = db.meta.role === 'supplier', vid = isSup ? db.meta.vendorId : (r.q.vendor || ''), step = Math.min(3, Math.max(1, +r.q.step || 1)), key = 'sup:' + vid;
  if (!can(isSup ? 'sup.enable' : 'sup.add')) return `<div class="page">${pageHead({ title: 'Add Supplier for Financing' })}${alertBox('warn', 'Not allowed', esc(whyNot('sup.add')))}</div>`;
  if (!ui.f || ui.fKey !== key) {
    const existing = vid && db.profiles.find(p => p.vendorId === vid && p.form && [SUP.ACTION, SUP.NOT_ELIGIBLE].includes(p.status));
    const firstPrg = db.programmes.find(p => programmeHeadroom(p).lenders.length) ;
    ui.f = existing ? clone(existing.form) : newSupplierForm(vid, firstPrg ? firstPrg.id : ''); if (!ui.f.programmeId && firstPrg) ui.f.programmeId = firstPrg.id;
    ui.fKey = key; ui.errs = {};
  }
  const f = ui.f, v = getVendor(f.vendorId), prgs = db.programmes.filter(p => programmeHeadroom(p).lenders.length);
  const stepper = `<div class="stepper">${SUP_STEPS.map((s, i) => `<button class="step ${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}" data-act="sup-goto" data-step="${i + 1}"><b>${i + 1 < step ? '✓' : i + 1}</b>${s}</button>`).join('')}</div>`;
  const inv = existingInvite(f);
  let body;
  if (step === 1) body = `<div class="card-t">${isSup ? 'Your company' : 'Select from Supplier Master'}</div><div class="fgrid">
      ${isSup ? F.ro('Supplier', `<b>${esc(v.name)}</b>`) : fx('Supplier', 'vendorId', { req: true, opts: supOpts(), blank: 'Select supplier', r: true })}
      ${F.ro('DICE Supplier ID', esc(f.vendorId || '—'))}${F.ro('Legal entity name', esc(v ? v.name : '—'))}${F.ro('PAN', esc(v ? v.pan : '—'))}${F.ro('Primary GSTIN', esc(v ? v.gstin : '—'))}
      ${F.ro('Bank account', v && v.bank ? `${esc(v.bank.bankName)} ${esc(v.bank.acctMasked)} ${v.bank.verified ? sb('Verified') : sb('Pending')}<div class="small-note">Verified in DICE — the lender re-verifies</div>` : 'None on file')}</div>
      <div class="sec-h">Select active financing programme</div><div class="fgrid">
      ${prgs.length ? fx('Programme', 'programmeId', { req: true, opts: prgs.map(p => [p.id, `${p.reqId} · ${p.form.productcode} · ${p.lenders.filter(l => l.status === 'Active').map(l => l.name).join(', ')}`]), blank: 'Select programme' }) : `<div class="span2">${alertBox('warn', 'No active programme', 'A supplier can only be linked to an active programme. Create one under Avail Financing → Programmes.')}</div>`}
      ${F.ro('Financing product', 'SID — Sales Invoice Discounting')}</div>
      ${noteBox('', 'info', 'This is a <b>DICE financing-enablement flow</b>, not a PSBXchange CPL submission: the workbook allows CPL only for Dealer / Vendor Finance. No PSBXchange API is called when a supplier is enabled for SID — the external onboarding route is an open dependency.')}`;
  else if (step === 2) body = `<div class="card-t">Business details <span class="small-note">prefilled from the DICE supplier master — confirm or correct</span></div><div class="fgrid">
      ${fx('Registered address', 'address', { req: true, area: true, cls: 'span2' })}${fx('Constitution', 'constitution', { req: true, opts: CONSTITUTIONS(), blank: 'Select' })}${fx('Date of incorporation', 'doi', { req: true, type: 'date' })}
      ${fx('Industry', 'industry', { req: true, opts: INDUSTRIES, blank: 'Select' })}${fx('MSME / Udyam registered?', 'msme', { opts: ['Yes', 'No'], r: true })}${f.msme === 'Yes' ? fx('Udyam registration number', 'udyam', { req: true, ph: 'UDYAM-MH-26-0001234', hook: 'upper' }) : ''}</div>
      <div class="sec-h">Financial details <span class="small-note" style="text-transform:none;letter-spacing:0">only if the selected lender / product asks — INR lakhs, optional</span></div><div class="fgrid3">
      ${['cur:Current FY', 'last:Previous FY', 'second:Second previous FY'].map(x => { const [k, l] = x.split(':'); return fx(`Purchases / sales from anchor — ${l}`, `purch.${k}`, { num: true, type: 'number', min: 0 }); }).join('')}
      ${['cur:Current FY', 'last:Previous FY', 'second:Second previous FY'].map(x => { const [k, l] = x.split(':'); return fx(`Turnover — ${l}`, `turn.${k}`, { num: true, type: 'number', min: 0 }); }).join('')}
      ${['cur:Current FY', 'last:Previous FY', 'second:Second previous FY'].map(x => { const [k, l] = x.split(':'); return fx(`PAT — ${l}`, `pat.${k}`, { num: true, type: 'number', min: 0 }); }).join('')}</div>
      ${noteBox('', 'info', 'These mirror the generic channel-partner journey. For SID they are <b>not</b> sent as CPL fields — they are stored in DICE and passed only if the lender’s onboarding contract asks for them.')}
      <div class="sec-h">Authorised contact</div><div class="fgrid3">${fx('Contact name', 'contact.name', { req: true })}${fx('Official email', 'contact.email', { req: true, type: 'email' })}${fx('Mobile number', 'contact.mobile', { req: true, max: 10 })}</div>`;
  else body = `<div class="card-t">Bank details <span class="small-note">account number is masked after save</span></div><div class="fgrid">
      ${isSup ? `${fx('Account holder name', 'bank.holder', { req: true })}${fx('Account number', 'bank.acct', { req: true, ph: '9–18 digits', max: 18 })}${fx('IFSC', 'bank.ifsc', { req: true, hook: 'upper', ph: 'HDFC0001234', max: 11 })}${fx('Bank name', 'bank.bankName', { req: true })}` : `<div class="span2">${noteBox('gray', 'lock', 'Bank details and consent are collected from the <b>supplier</b> in the vendor portal — a buyer cannot give consent on a supplier’s behalf. This invitation takes the supplier straight to those steps.')}</div>`}</div>
      <div class="sec-h">Onboarding checklist</div><div class="checklist">
      ${[['Business details reviewed', 'Prefilled data confirmed by the supplier / buyer.', true], ['Bank account verification', 'Penny-drop verification is run by the partner / lender.', isSup], ['KYC / KYB and AML checks', 'Completed by the lender / partner as required.', false], ['Programme terms and consent', 'Supplier accepts data sharing and the programme participation declaration.', isSup && f.consentData && f.consentTerms]].map(([t, d, ok]) => `<div class="it"><div class="ci ${ok ? 'ok' : 'no'}">${icon('check', 12, 3)}</div><div><b>${t}</b><div class="d">${d}</div></div></div>`).join('')}</div>
      ${isSup ? `<div class="sec-h">Consent</div>
        <label class="check-row" style="margin-bottom:8px"><input type="checkbox" data-f="consentData" ${f.consentData ? 'checked' : ''}> <span>I consent to my company's data being shared with the financing partner and selected lender for verification and financing. <span class="small-note">(${DATA_CONSENT_VERSION})</span></span></label>${ui.errs.consentData ? `<div class="ferr">${esc(ui.errs.consentData)}</div>` : ''}
        <label class="check-row"><input type="checkbox" data-f="consentTerms" ${f.consentTerms ? 'checked' : ''}> <span>I have read the programme participation declaration. <span class="small-note">(${TERMS_VERSION}) — programme parameters are indicative, not a financing offer.</span></span></label>${ui.errs.consentTerms ? `<div class="ferr">${esc(ui.errs.consentTerms)}</div>` : ''}` : ''}
      ${noteBox('', 'info', isSup ? 'Submitting starts the partner / lender onboarding checks. It does not approve you or finance an invoice.' : `Sending creates a secure link, valid for ${settings().inviteExpiryDays} days, bound to <b>${esc(v ? v.name : 'this supplier')}</b> and this programme only.`)}`;
  return `<div class="page">${pageHead({ title: isSup ? 'Enable invoice financing' : 'Add Supplier for Financing', right: `<button class="btn btn-outline" data-act="sup-close">${icon('x', 15)}Close</button>` })}<div class="hint">Use the existing DICE supplier master · Step ${step} of 3</div>${stepper}
    <div class="card">${body}<div style="display:flex;gap:10px;margin-top:8px;border-top:1px solid var(--border);padding-top:16px">
      ${step > 1 ? `<button class="btn btn-outline" data-act="sup-goto" data-step="${step - 1}">← Back</button>` : '<button class="btn btn-ghost" data-act="sup-close">Cancel</button>'}<span style="flex:1"></span>
      ${step < 3 ? `<button class="btn btn-primary" data-act="sup-next" data-step="${step}">Continue →</button>` : `<button class="btn btn-primary" data-act="sup-submit">${isSup ? 'Submit onboarding request →' : 'Send invitation to supplier →'}</button>`}</div></div></div>`;
}
const existingInvite = f => null;
const supUrl = step => `#/avail/sup/new?step=${step}${ui.f && ui.f.vendorId && db.meta.role !== 'supplier' ? '&vendor=' + ui.f.vendorId : ''}`;
ACT['sup-close'] = () => { ui.f = null; ui.fKey = ''; go(db.meta.role === 'supplier' ? '#/avail' : '#/avail?tab=suppliers'); };
ACT['sup-goto'] = el => go(supUrl(+el.dataset.step));
ACT['sup-next'] = el => {
  const step = +el.dataset.step, e = validateSupplierForm(ui.f, { step }), mine = Object.fromEntries(Object.entries(e).filter(([k]) => step === 1 ? ['vendorId', 'programmeId'].includes(k) : !['vendorId', 'programmeId'].includes(k) && !k.startsWith('bank') && !k.startsWith('consent')));
  ui.errs = mine; if (Object.keys(mine).length) { render(); return toast(`${Object.keys(mine).length} field(s) need attention`, 'err'); }
  if (step === 1 && db.meta.role !== 'supplier' && ui.f.vendorId !== (ui.r.q.vendor || '')) { const v = ui.f.vendorId, pr = ui.f.programmeId; ui.f = null; ui.fKey = ''; ui.pendingPrg = pr; return go(`#/avail/sup/new?step=2&vendor=${v}`); }
  go(supUrl(step + 1));
};
ACT['sup-submit'] = () => {
  const isSup = db.meta.role === 'supplier', r = isSup ? supplierSubmitOnboarding(ui.f) : buyerAddSupplier(ui.f);
  if (r.fieldErrors) { ui.errs = r.fieldErrors; render(); return toast(r.msg, 'err'); }
  if (!r.ok) return errorModal(r.msg, r.errors || [r.msg]);
  const id = r.profile.id; ui.f = null; ui.fKey = ''; toast(r.msg); go(`#/avail/sup/${id}`);
};
const origSupInit = null;

/* ---------------------------------------------------------------- supplier profile */
function supDetail(p) {
  if (!p) return `<div class="page">${pageHead({ title: 'Profile not found' })}</div>`;
  const v = getVendor(p.vendorId), prg = getPrg(p.programmeId), isSup = db.meta.role === 'supplier', expired = inviteExpired(p);
  if (isSup && db.meta.vendorId !== p.vendorId) return `<div class="page">${pageHead({ title: 'Not available' })}${alertBox('warn', 'Not available', 'You can only see your own financing profile.')}</div>`;
  const banner = p.status === SUP.ELIGIBLE ? alertBox('ok', 'Eligible for invoice financing', 'Approved invoices that pass every check show “Get paid early”. Normal payment is unchanged for everything else.')
    : p.status === SUP.ACTION ? alertBox('warn', 'Action required', `${esc(p.reason || '')}${p.missing && p.missing.length ? '<ul>' + p.missing.map(m => `<li>${esc(m)}</li>`).join('') + '</ul>' : ''}`)
    : p.status === SUP.NOT_ELIGIBLE ? alertBox('err', 'Not eligible', `${esc(p.reason || '')}. Normal procurement and payment remain available.`) : p.status === SUP.SUSPENDED ? alertBox('err', 'Suspended', `${esc(p.reason || '')}. The financing button is hidden; in-flight requests are paused.`) : noteBox('', 'info', 'Partner / lender checks are running. This does not approve the supplier or finance an invoice.');
  const sim = ['approve:Approve (KYC + bank verified)', 'docs:Request documents', 'bankfail:Bank verification failed', 'reject:Mark not eligible', 'suspend:Suspend', 'reinstate:Reinstate'].map(x => { const [k, l] = x.split(':'); return gbtn('ops.provider', 'prov-dec', l, { cls: 'btn-outline btn-xs', data: { id: p.id, d: k } }); }).join('');
  return `<div class="page">${pageHead({ title: v.name, tags: sb(p.status), right: [isSup && [SUP.ACTION, SUP.NOT_ELIGIBLE].includes(p.status) ? `<button class="btn btn-primary" data-act="sup-continue" data-vendor="${v.id}">Continue onboarding</button>` : '', gbtn('sup.bank', 'bank-change', 'Change bank account', { cls: 'btn-outline', data: { id: v.id } })].join(''), crumb: `<a class="link" href="#/avail?tab=suppliers">Suppliers</a> › ${esc(v.id)}` })}${banner}
    ${strip([['DICE vendor status', 'Active'], ['Financing onboarding', esc(p.status)], ['KYC / KYB', esc(p.kyc || '—')], ['Bank verification', esc(p.bank || '—')], ['Invoice financing', p.status === SUP.ELIGIBLE ? '<span style="color:var(--success)">Eligible</span>' : 'Not available']])}
    <div class="cards-2" style="margin-top:20px"><div class="card"><div class="card-t">Linked programme &amp; supplier</div><div class="kvg c2">${kv('Programme', prg ? `${esc(prg.reqId)} · ${esc(prg.form.productcode)}` : '—')}${kv('Financier / platform', 'PSBXchange route · lender confirmed at transaction')}${kv('PAN / GSTIN', `${esc(v.pan)}<div class="small-note">${esc(v.gstin)}</div>`)}${kv('Bank', v.bank ? `${esc(v.bank.bankName)} ${esc(v.bank.acctMasked)} ${v.bank.verified ? sb('Verified') : sb('Pending')}` : '—')}${kv('Consent', p.consent ? `${esc(p.consent.termsVersion)} · ${fmtDT(p.consent.at)}<div class="small-note">${esc(p.consent.by)} · ${esc(p.consent.channel)}</div>` : 'Not given')}${kv('Authorised contact', p.form && p.form.contact ? esc(p.form.contact.name) : '—')}</div>
      ${p.invite ? `<div class="sec-h">Invitation</div><div class="kv-inline"><span>Sent to <b>${esc(p.invite.sentTo)}</b></span><span>Sent <b>${fmtDT(p.invite.sentAt)}</b></span><span>${expired ? '<b style="color:var(--danger)">Expired</b>' : p.invite.usedAt ? 'Used <b>' + fmtDT(p.invite.usedAt) + '</b>' : 'Expires <b>' + fmtD(p.invite.expiresAt.slice(0, 10)) + '</b>'}</span></div><div style="margin-top:8px">${!p.invite.usedAt ? gbtn('sup.add', 'inv-resend', expired ? 'Resend (link expired)' : 'Resend invitation', { cls: 'btn-outline btn-xs', data: { id: p.id } }) : ''} ${!p.invite.usedAt && !expired ? gbtn('ops.provider', 'inv-expire', 'Simulate expiry', { cls: 'btn-ghost btn-xs', data: { id: p.id } }) : ''} ${!p.invite.usedAt && !expired && isSup ? `<button class="btn btn-primary btn-xs" data-act="sup-continue" data-vendor="${v.id}">Open secure link</button>` : ''}</div>` : ''}</div>
      <div class="card"><div class="card-t">History</div>${timelineHtml(histItems(p.history))}</div></div>
    <div class="sim-card"><div class="st">Sandbox · partner / lender onboarding decision</div><div class="small-note">The SID supplier-onboarding contract is not in the workbook, so DICE keeps its own case and maps provider outcomes into DICE-neutral statuses. Use these to play the lender.</div><div class="btns">${sim}</div></div></div>`;
}
ACT['sup-continue'] = el => { ui.f = null; ui.fKey = ''; go(`#/avail/sup/new?step=2&vendor=${el.dataset.vendor}`); };
ACT['prov-dec'] = el => { const need = ['docs', 'reject', 'suspend', 'bankfail'].includes(el.dataset.d); const run = reason => { const r = providerDecision(el.dataset.id, el.dataset.d, reason); toast(r.msg, r.ok ? undefined : 'err'); render(); }; if (need) reasonModal({ title: 'Reason (shown to the supplier)', label: 'Reason', btn: 'Apply', danger: false, optional: true, onSubmit: run }); else run(); };
ACT['inv-resend'] = el => { const r = resendInvite(el.dataset.id); toast(r.msg, r.ok ? undefined : 'err'); render(); };
ACT['inv-expire'] = el => { expireInviteNow(el.dataset.id); render(); };
ACT['bank-change'] = el => openModal({ title: 'Change bank account', submitLabel: 'Save & re-verify', html: `<div class="alert warn" style="margin-top:0">Changing the account pauses financing for this supplier until it is re-verified. In-flight requests that are not yet funded are paused.</div>${fld('Account holder name', 'holder', { req: true })}${fld('Account number', 'acct', { req: true, ph: '9–18 digits' })}${fld('IFSC', 'ifsc', { req: true, ph: 'HDFC0001234' })}${fld('Bank name', 'bankName', { req: true })}`, onSubmit: v => { const r = changeSupplierBank(el.dataset.id, v); if (!r.ok) { toast(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.msg, 'err'); return false; } toast(r.msg); render(); } });

/* ---------------------------------------------------------------- vendor portal landing */
function vendorPortalHome() {
  const v = getVendor(db.meta.vendorId), ps = db.profiles.filter(p => p.vendorId === v.id), p = ps[0], prgs = db.programmes.filter(x => programmeHeadroom(x).lenders.length);
  const status = p ? p.status : SUP.NOT_ENABLED;
  return `<div class="page">${pageHead({ title: 'Financing', back: false, tags: `<span class="small-note">Vendor portal · ${esc(v.name)}</span>` })}
    <div class="vtile" style="margin-top:14px"><div style="flex:1;min-width:260px"><div class="small-note">Invoice financing</div><div class="big">${status === SUP.ELIGIBLE ? 'You can get paid early' : status === SUP.NOT_ENABLED ? 'Enable invoice financing' : esc(status)}</div><div class="small-note" style="margin-top:4px">${status === SUP.ELIGIBLE ? 'Request early payment on any approved invoice that passes the checks.' : status === SUP.ACTION ? esc(p.reason) : status === SUP.ONBOARDING ? 'Your details are with the partner / lender.' : status === SUP.NOT_ELIGIBLE || status === SUP.SUSPENDED ? esc(p.reason) : 'Get paid for approved invoices before their due date. Optional — normal payment continues if you do nothing.'}</div></div>
      ${sb(status)}
      ${p ? `<button class="btn btn-outline" data-act="go" data-hash="#/avail/sup/${p.id}">View profile</button>` : ''}
      ${!p || [SUP.ACTION, SUP.NOT_ELIGIBLE].includes(status) ? gbtn('sup.enable', 'sup-continue', p ? 'Continue' : 'Enable invoice financing', { cls: 'btn-primary', data: { vendor: v.id } }) : ''}
      ${status === SUP.ELIGIBLE ? `<button class="btn btn-primary" data-act="go" data-hash="#/id">Go to Invoice Discounting →</button>` : ''}</div>
    <div class="sec">Programmes available to you</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Programme</th><th>Product</th><th>Buyer</th><th>Lenders</th><th>Your status</th></tr></thead><tbody>${prgs.length ? prgs.map(g => `<tr><td><b>${esc(g.reqId)}</b></td><td>${esc(g.form.productcode)}</td><td>${esc(db.company.name)}</td><td>${g.lenders.filter(l => l.status === 'Active').map(l => esc(l.name)).join(', ')}</td><td>${sb(profileOf(v.id, g.id) ? profileOf(v.id, g.id).status : SUP.NOT_ENABLED)}</td></tr>`).join('') : emptyRow(5, 'No active programme for your buyer yet')}</tbody></table></div>
    <div class="small-note" style="margin-top:10px">You only see programmes of buyers you supply. Nothing here changes how your invoices are submitted, matched or paid.</div></div>`;
}
