/* =====================================================================
   screens-inv.js — Invoice Discounting: invoice list, admin, financiers, invoice detail, request flow, financing request status
   ===================================================================== */
const lastReq = inv => reqsOf(inv.id).slice(-1)[0];
const myInvoices = () => db.meta.role === 'supplier' ? db.invoices.filter(i => i.vendorId === db.meta.vendorId) : db.invoices;
const vendorName = id => (getVendor(id) || {}).name || id;

ROUTES.id = r => {
  const sub = r.parts[1];
  if (sub === 'inv') return invDetail(getInv(r.parts[2]));
  if (sub === 'req') return reqPage(getReq(r.parts[2]));
  sweepHolds();
  const tab = r.q.tab || 'all', k = KPI();
  return `<div class="page">${pageHead({ title: 'Invoice Discounting', back: false })}
    <div class="hint" style="margin:4px 0 0">Find approved invoices and request early payment through a participating financier. The approval stays the gate — everything else continues to normal payment.</div>
    ${tabsHtml([['all', 'All Invoices'], ['admin', 'Admin'], ['financiers', 'Financiers']], tab, '#/id')}
    <div style="margin-top:14px">${tab === 'admin' ? adminTab() : tab === 'financiers' ? financiersTab() : allInvoicesTab(k)}</div></div>`;
};

function allInvoicesTab(k) {
  const isSup = db.meta.role === 'supplier';
  return `${strip([['Eligible invoice value', inr(k.eligibleValue), `${k.eligibleCount} invoice(s)`, 'hl'], ['Financed value', inr(k.financed), `${k.fundedCount} funded`], ['Open requests', db.requests.filter(r => FIN_ACTIVE.includes(r.status)).length], ['Exceptions', k.exceptions, '', k.exceptions ? 'hl' : ''], ['Take-up', k.takeUp + '%', 'requested ÷ (eligible + requested)'], ['Duplicates blocked', k.duplicatesBlocked]])}
    ${isSup ? `<div class="small-note" style="margin-top:10px">Showing only invoices raised by <b>${esc(vendorName(db.meta.vendorId))}</b>.</div>` : ''}
    ${listHtml('invs', {
      noun: 'invoices', searchPh: 'Search invoice, vendor or PAN', dates: false, rows: () => myInvoices().slice().sort((a, b) => a.number < b.number ? 1 : -1), match: (r, st) => matchText(st, r.number, vendorName(r.vendorId), (getVendor(r.vendorId) || {}).pan, r.po),
      tabs: [['pending', 'Pending', r => !['Settled', 'Not funded'].includes((lastReq(r) || {}).status) || activeReqOf(r.id)], ['completed', 'Completed', r => (lastReq(r) || {}).status === FIN.SETTLED && !activeReqOf(r.id)], ['declined', 'Declined', r => (lastReq(r) || {}).status === FIN.NOT_FUNDED && !activeReqOf(r.id)]],
      cols: ['Details', 'Invoice ID', 'Vendor', 'Vendor PAN', 'Invoice Date', 'Due Date', '>Amount', 'Financing Status', 'Payment', 'Action'],
      row: i => { const v = invoiceFinView(i), can1 = v.label === 'Eligible';
        return `<tr><td>${viewBtn('#/id/inv/' + i.id)}</td><td><b>${esc(i.number)}</b></td><td>${esc(vendorName(i.vendorId))}</td><td>${esc((getVendor(i.vendorId) || {}).pan)}</td><td>${fmtD(i.date)}</td><td>${fmtD(i.due)}</td><td class="num-r">${i.currency === 'INR' ? inr(i.amount) : i.currency + ' ' + fmtNum(i.amount)}</td><td>${sb(v.label)}</td><td>${pcBadge(pcOf(i).state)}</td><td>${can1 ? gbtn('inv.request', 'inv-request', 'Request early payment', { cls: 'btn-primary btn-xs', data: { id: i.id } }) : v.req && FIN_ACTIVE.includes(v.req.status) ? viewBtn('#/id/req/' + v.req.id, 'View request') : `<button class="btn btn-ghost btn-xs" data-act="go" data-hash="#/id/inv/${i.id}" title="${esc(v.elig && v.elig.blocking[0] ? v.elig.blocking[0].reason : '')}">Why not?</button>`}</td></tr>`; },
      empty: 'No invoices in this view.' })}`;
}

/* ---------------------------------------------------------------- admin */
function adminTab() {
  if (!ui.f || ui.fKey !== 'settings') { ui.f = clone(settings()); ui.fKey = 'settings'; ui.errs = {}; }
  const f = ui.f, ro = !can('ops.settings');
  const prods = ['SID', 'PID', 'REVFACT', 'FACT'].map(c => `<label class="check-row" style="margin-bottom:6px"><input type="checkbox" data-act="set-prod" data-p="${c}" ${f.enabledProducts.includes(c) ? 'checked' : ''} ${ro || c === 'SID' ? 'disabled' : ''}> <span><b>${c}</b> — ${esc(PRODUCT_NAME(c))} ${c === 'SID' ? '<span class="small-note">(MVP product, always on)</span>' : '<span class="small-note">— confirm borrower, money flow and provider before enabling</span>'}</span></label>`).join('');
  return `${ro ? alertBox('info', 'Read only', esc(whyNot('ops.settings'))) : ''}<div class="cards-2"><div class="card"><div class="card-t">Eligibility rules</div><div class="fgrid">
      ${fx('Minimum invoice amount (INR)', 'minInvoiceAmount', { num: true, type: 'number', min: 0, dis: ro })}${fx('3-way match tolerance (%)', 'matchTolerancePct', { num: true, type: 'number', min: 0, step: '0.1', dis: ro })}
      ${fx('Financing window — min days before due', 'windowMinDays', { num: true, type: 'number', min: 0, dis: ro })}${fx('Financing window — max days before due', 'windowMaxDays', { num: true, type: 'number', min: 1, dis: ro })}
      ${fx('Apply supplier turnover rule?', 'applyTurnoverRule', { opts: [[false, 'No'], [true, 'Yes']], dis: ro, hint: 'The ₹25 Cr figure is a DICE programme rule, not a regulatory floor; confirm whether it applies to the supplier.' })}${fx('Minimum supplier turnover (₹ Cr)', 'minSupplierTurnoverCr', { num: true, type: 'number', min: 0, dis: ro })}</div></div>
    <div class="card"><div class="card-t">Journey &amp; controls</div><div class="fgrid">
      ${fx('Offer model', 'offerModel', { opts: [['embedded', 'Embedded — offers shown in DICE'], ['redirect', 'Redirect — supplier decides on the partner portal']], dis: ro })}${fx('Offer validity (hours)', 'offerExpiryHours', { num: true, type: 'number', min: 1, dis: ro })}
      ${fx('Payment-hold timeout (hours)', 'holdTimeoutHours', { num: true, type: 'number', min: 1, dis: ro, hint: 'After this long without a status the request is FLAGGED — the hold is never auto-released.' })}${fx('Invitation validity (days)', 'inviteExpiryDays', { num: true, type: 'number', min: 1, dis: ro })}
      ${fx('Partnership cache TTL (minutes)', 'partnershipTtlMin', { num: true, type: 'number', min: 1, dis: ro })}${fx('Internal approval before Lead API', 'requireInternalApproval', { opts: [[true, 'Required'], [false, 'Not required']], dis: ro })}</div></div></div>
    <div class="card" style="margin-top:16px"><div class="card-t">Products enabled for this tenant</div>${prods}<div class="small-note">An enabled product can still be refused by PSBXchange if it is not active for the sourcing partner (try enabling PID and submitting a programme).</div></div>
    <div class="card" style="margin-top:16px"><div class="card-t">Integration identity</div><div class="kvg c2">${kv('Sourcing partner PSB ID', `<span class="mono">${esc(f.fintechPsbId)}</span> <span class="tag-api">fintechpsbplatformid</span>`)}${kv('Epoch unit for date fields', `<select class="input sm" data-f="epochUnit" ${ro ? 'disabled' : ''}>${opt([['seconds', 'seconds'], ['milliseconds', 'milliseconds']], f.epochUnit)}</select><div class="small-note">The workbook says “epoch” without a unit — confirm in the PSB sandbox.</div>`)}</div></div>
    <div style="margin-top:16px">${ro ? '' : `<button class="btn btn-primary" data-act="set-save">Save settings</button>`}</div>`;
}
ACT['set-prod'] = el => { const p = el.dataset.p, a = ui.f.enabledProducts; ui.f.enabledProducts = el.checked ? [...new Set([...a, p])] : a.filter(x => x !== p); };
ACT['set-save'] = () => { const f = ui.f; ['applyTurnoverRule', 'requireInternalApproval'].forEach(k => { f[k] = f[k] === true || f[k] === 'true'; }); const r = saveSettings(f); if (!r.ok) return errorModal(r.msg, r.errors); ui.f = null; ui.fKey = ''; toast(r.msg); render(); };

/* ---------------------------------------------------------------- financiers */
function financiersTab() {
  const c = db.cache.partnerships; fetchPartnerships();
  return `<div class="card"><div class="card-t">Financiers available through the configured programmes <span class="spacer"></span>${gbtn('ops.reconcile', 'refresh-partners', 'Refresh', { cls: 'btn-outline btn-xs', icn: 'reset' })}${gbtn('ops.settings', 'discover', 'Discover more lenders', { cls: 'btn-outline btn-xs' })}</div>
    <div class="small-note" style="margin-bottom:10px">Get Partnerships Details API · cached ${c ? fmtDT(c.fetchedAt) : '—'}. A lender is usable for SID only when its partnership is <b>Active</b> and lists the SID product.</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Lender</th><th>PSB identifier</th><th>Partnership</th><th>Products</th><th>Active SID programmes</th><th>Since</th><th>Last updated by</th></tr></thead><tbody>${c ? c.rows.map(l => { const sid = l.products.find(p => p.productcode === 'SID'); return `<tr><td><b>${esc(l.lendername)}</b><div class="small-note">${esc(l.lenderpannumber)}</div></td><td class="mono">${esc(l.lenderpsbidentifier)}</td><td>${sb(l.partnershipstatus === 'Active' ? 'Active' : l.partnershipstatus === 'In Active' ? 'In Active' : l.partnershipstatus === 'Rejected' ? 'Rejected' : 'Pending')} <span class="small-note">${esc(l.partnershipstatus)}</span></td><td>${l.products.map(p => `<span class="chip">${p.productcode}</span>`).join('')}</td><td class="num-r">${sid ? sid.activeprogramcount + ' / ' + sid.totalprogramcount : '—'}</td><td>${fmtEpoch(l.currentstatusupdatedate, settings().epochUnit)}</td><td>${esc(l.lastupdatedby)}</td></tr>`; }).join('') : emptyRow(7, 'Partnerships have not been loaded')}</tbody></table></div></div>`;
}
ACT.discover = () => openModal({ title: 'Discover additional lenders', cls: 'wide', submitLabel: 'Search', html: `<div class="small-note" style="margin-bottom:10px">Get Additional Lenders on PSB API — lenders with <b>no partnership</b> with DICE at any status, active on PSBXchange, matching the product filter.</div>${fld('Product filter', 'prod', { opts: [['ALL', 'ALL — all products'], ['SID', 'SID'], ['PID', 'PID'], ['FACT', 'FACT'], ['REVFACT', 'REVFACT'], ['DF', 'DF'], ['VF', 'VF']] })}<div id="disc-out"></div>`, onSubmit: v => {
  const r = apiGetAdditionalLenders({ psbidentifier: settings().fintechPsbId, customerreferenceid: mkRef('DICEAL'), filterproductcode: [v.prod] }, { trigger: 'Admin discovery' }); save();
  document.getElementById('disc-out').innerHTML = !r.ok ? alertBox('err', 'Request failed', esc(r.body ? r.body.message : 'No response')) : `<div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Lender</th><th>Products</th><th>Onboarded</th></tr></thead><tbody>${r.body.additionallenderdetails.map(l => `<tr><td><b>${esc(l.lendername)}</b><div class="small-note mono">${esc(l.lenderpsbidentifier)}</div></td><td>${l.activeproductslist.map(p => `<span class="chip">${p.productcodes}</span>`).join('')}</td><td>${fmtEpoch(l.lenderonboardingdate, settings().epochUnit)}</td></tr>`).join('') || emptyRow(3, 'No lenders match')}</tbody></table></div><div class="small-note" style="margin-top:8px">Discovery only — a lender must still partner with DICE (Active) before it can receive a programme.</div>`; return false; } });

/* ---------------------------------------------------------------- invoice detail */
function invDetail(inv) {
  if (!inv) return `<div class="page">${pageHead({ title: 'Invoice not found' })}</div>`;
  if (db.meta.role === 'supplier' && inv.vendorId !== db.meta.vendorId) return `<div class="page">${pageHead({ title: 'Not available' })}${alertBox('warn', 'Not available', 'You can only see your own invoices.')}</div>`;
  const e = eligibility(inv), act = activeReqOf(inv.id), v = getVendor(inv.vendorId), pc = pcOf(inv), prof = e.prof, hist = reqsOf(inv.id);
  const cta = act ? `<button class="btn btn-primary" data-act="go" data-hash="#/id/req/${act.id}">View financing request</button>` : e.ok ? gbtn('inv.request', 'inv-request', 'Request early payment →', { cls: 'btn-primary', data: { id: inv.id } }) : `<button class="btn btn-primary" disabled title="${esc(e.blocking[0].reason)}">Request early payment</button>`;
  return `<div class="page">${pageHead({ title: `Invoice ${inv.number}`, tags: sb(inv.approval) + ' ' + sb(invoiceFinView(inv).label), right: cta, crumb: `<a class="link" href="#/id">Invoice Discounting</a> › ${esc(v.name)}` })}
    <div class="grid-2"><div>
      <div class="card"><div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap"><div><div class="small-note">Invoice amount</div><div style="font-size:30px;font-weight:700;letter-spacing:-.5px">${inv.currency === 'INR' ? inr(inv.amount) : inv.currency + ' ' + fmtNum(inv.amount)}</div><div class="small-note">Due ${fmtD(inv.due)} · in ${daysTo(inv.due)} day(s)</div></div></div>
        <div class="sec-h">P2P validation</div><div class="kvg c2">${kv('Purchase order', esc(inv.po))}${kv('Goods receipt note', esc(inv.grn))}${kv('3-way match', `${sb(inv.match.status)}${inv.match.variancePct ? ' <span class="small-note">variance ' + inv.match.variancePct + '%</span>' : ''}`)}${kv('Payment status', inv.payment.state === 'Scheduled' ? `Scheduled for ${fmtD(inv.payment.on)}` : esc(inv.payment.state))}${kv('Supplier financing profile', prof ? `<a class="link" href="#/avail/sup/${prof.id}">${sb(prof.status)}</a>` : sb(SUP.NOT_ENABLED))}${kv('Programme', e.prg ? `${esc(e.prg.reqId)} · ${esc(e.prg.form.productcode)} ${e.room && e.room.lenders.length ? sb('Active') : sb('Pending')}` : '—')}
        ${kv('Open dispute / block', inv.dispute.open ? `<span style="color:var(--danger)">${esc(inv.dispute.reason)}</span>` : inv.paymentBlock ? 'Payment block' : 'None')}${kv('Credit / debit notes', inv.adjustments.length ? inv.adjustments.map(a => `${esc(a.type)} ${inr(a.amount)} ${sb(a.status === 'Resolved' ? 'Completed' : 'Pending')}`).join('<br>') : 'None')}</div></div>
      <div class="sec">Eligibility ${e.ok ? sb('Eligible') : sb('Not Eligible')} <span class="sub">${e.checks.filter(c => c.status === 'pass').length} of ${e.checks.length} checks passed · re-run immediately before every request</span></div>${checksHtml(e.checks)}
      ${hist.length ? `<div class="sec">Financing requests on this invoice</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Request</th><th>Created</th><th>Status</th><th>Reason / reference</th><th></th></tr></thead><tbody>${hist.slice().reverse().map(r => `<tr class="click" data-act="go" data-hash="#/id/req/${r.id}"><td><b>${esc(r.number)}</b></td><td>${fmtDT(r.createdAt)}</td><td>${sb(r.status)}</td><td>${esc(r.reason || (r.funding ? 'UTR ' + r.funding.utr : ''))}</td><td>${viewBtn('#/id/req/' + r.id)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>
    <div>
      <div class="card"><div class="card-t">Payment control ${pcBadge(pc.state)}</div><div class="small-note">${esc(pc.reason || 'Normal AP payment is available for this invoice.')}</div>
        <div style="margin-top:10px">${inv.payment.state === 'Scheduled' ? gbtn('pay.schedule', 'pay-cancel', 'Cancel scheduled payment', { cls: 'btn-outline btn-sm', data: { id: inv.id } }) : gbtn('pay.schedule', 'pay-schedule', 'Schedule normal payment', { cls: 'btn-outline btn-sm', data: { id: inv.id } })}</div>
        <div class="small-note" style="margin-top:8px">Normal payment can never be released while the invoice is on <b>hold</b> or <b>locked</b>. Try “Schedule normal payment” on a financed invoice.</div>
        ${pc.history && pc.history.length ? `<div class="sec-h">Control history</div>${timelineHtml(pc.history.slice().reverse().map(h => ({ at: h.at, text: `${h.from} → ${h.to}: ${h.reason || ''}` })))}` : ''}</div>
      <div class="card" style="margin-top:16px"><div class="card-t">Financing journey</div><ul class="tl">${[['Invoice approved', inv.approval === 'Approved', fmtDT(inv.approvedAt)], ['Eligibility checked', e.ok, e.ok ? 'Passed every required check' : `${e.blocking.length} check(s) failing`], ['Request early payment', !!hist.length, hist.length ? hist[hist.length - 1].number : 'Not yet requested'], ['Financier offer & funding', hist.some(r => r.funding), hist.some(r => r.funding) ? 'Funded' : 'Pending request'], ['Settlement', hist.some(r => r.status === FIN.SETTLED), hist.some(r => r.status === FIN.SETTLED) ? 'Reconciled' : 'Pending']].map(([t, ok, s]) => `<li class="${ok ? 'ok' : ''}"><div class="tt">${t}</div><div class="tm">${esc(s)}</div></li>`).join('')}</ul></div>
      <div class="sim-card"><div class="st">Sandbox · simulate a P2P change on this invoice</div><div class="small-note">Material changes pause a request that is not yet funded, or open an exception if it is. Credit notes and disputes block new requests.</div><div class="btns">${[['dispute', 'Raise dispute'], ['cleardispute', 'Clear dispute'], ['creditnote', 'Raise credit note'], ['resolvenote', 'Resolve notes'], ['duedate', 'Move due date +10d'], ['unapprove', 'Withdraw approval'], ['amount', 'Reduce amount 10%']].map(([k, l]) => gbtn('ops.sim', 'p2p-ev', l, { cls: 'btn-outline btn-xs', data: { id: inv.id, t: k } })).join('')}</div></div></div></div></div>`;
}
ACT['p2p-ev'] = el => { const r = p2pEvent(el.dataset.id, el.dataset.t); toast(r.msg, r.ok ? undefined : 'err'); render(); };
ACT['pay-schedule'] = el => { const r = schedulePayment(el.dataset.id); if (!r.ok) return errorModal('Normal payment blocked', r.errors || [r.msg]); toast(r.msg); render(); };
ACT['pay-cancel'] = el => { const r = cancelPayment(el.dataset.id); toast(r.msg, r.ok ? undefined : 'err'); render(); };

/* ---------------------------------------------------------------- Request early payment (drawer) */
ACT['inv-request'] = el => {
  const inv = getInv(el.dataset.id), e = eligibility(inv);
  if (!e.ok) return errorModal('This invoice is not eligible for early payment', e.blocking.map(c => c.reason));
  const dup = activeReqOf(inv.id); if (dup) { db.meta.dupBlocked = (db.meta.dupBlocked || 0) + 1; save(); toast(`Already requested (${dup.number})`); return go('#/id/req/' + dup.id); }
  openPanel({ key: 'req-' + inv.id, mid: true, title: 'Request early payment', sub: `Invoice ${esc(inv.number)} · ${inr(inv.amount)}`, init: () => ({ terms: false, data: false, snapshot: e.snapshot }),
    body: () => { const cur = eligibility(inv), room = cur.room, st = settings(), days = Math.max(0, daysTo(inv.due));
      return `<div class="kvg c2" style="margin-bottom:16px">${kv('Supplier', esc(vendorName(inv.vendorId)))}${kv('Buyer', esc(db.company.name))}${kv('Invoice amount', inr(inv.amount))}${kv('Settlement due date', `${fmtD(inv.due)} <span class="small-note">(${days} days)</span>`)}${kv('Programme', cur.prg ? esc(cur.prg.reqId) + ' · SID' : '—')}${kv('Lenders in programme', room ? room.lenders.map(l => esc(l.name)).join(', ') : '—')}</div>
        ${cur.ok ? alertBox('ok', 'All eligibility checks passed', 'They are checked again the moment you submit.') : alertBox('err', 'Not eligible any more', `<ul>${cur.blocking.map(c => `<li>${esc(c.reason)}</li>`).join('')}</ul>`)}
        <div class="fgrid">${F.ro('Amount to finance', `<b>${inr(inv.amount)}</b> <span class="small-note">full invoice — partial invoice financing is out of the MVP</span>`)}${F.ro('Offer model', st.offerModel === 'embedded' ? 'Offers are shown in DICE after the lender reviews' : 'You will decide on the partner portal; DICE tracks the status')}</div>
        <div class="sec-h">Consent</div>
        <label class="check-row" style="margin-bottom:8px"><input type="checkbox" data-f="terms" ${fv('terms') ? 'checked' : ''}> <span>I authorise this early-payment request and accept the financing terms (${TERMS_VERSION}). The binding rate, fees and net payout are shown by the lender <b>before</b> anything is accepted.</span></label>
        <label class="check-row"><input type="checkbox" data-f="data" ${fv('data') ? 'checked' : ''}> <span>I consent to the invoice, PO, GRN and match evidence being shared with the financing partner and lender (${DATA_CONSENT_VERSION}).</span></label>
        ${noteBox('', 'lock', 'When you submit, DICE creates the request and <b>places normal payment on hold in one step</b>, then sends it to the partner. A second click or a retry cannot create a second request.')}${provBanner()}`; },
    foot: () => `<button class="btn btn-ghost" data-act="panel-close">Cancel</button><button class="btn btn-primary" data-act="req-submit" data-id="${inv.id}">Accept &amp; submit request →</button>` });
};
ACT['req-submit'] = el => {
  if (ui.busy) return; ui.busy = true; setTimeout(() => { ui.busy = false; }, 700);
  const r = createFinanceRequest(el.dataset.id, { terms: ui.f && ui.f.terms, data: ui.f && ui.f.data, snapshot: ui.f && ui.f.snapshot, model: settings().offerModel });
  if (r.dup) { closePanel(); toast(r.msg, 'err'); return go('#/id/req/' + r.dup.id); }
  if (!r.ok) return errorModal(r.msg, r.errors || [r.msg]);
  closePanel(); toast(r.msg, r.req.uncertain ? 'err' : undefined); go('#/id/req/' + r.req.id);
};

/* ---------------------------------------------------------------- financing request status */
function reqPage(req) {
  if (!req) return `<div class="page">${pageHead({ title: 'Request not found' })}</div>`;
  const inv = getInv(req.invoiceId), pc = pcOf(inv), st = settings(), t = req.txnId && db.psb.txns[req.txnId], off = (req.offers || []).find(o => o.offerId === req.acceptedOfferId);
  if (db.meta.role === 'supplier' && req.vendorId !== db.meta.vendorId) return `<div class="page">${pageHead({ title: 'Not available' })}${alertBox('warn', 'Not available', 'You can only see your own requests.')}</div>`;
  const banners = [
    req.uncertain ? alertBox('warn', 'Partner outcome unknown', 'The partner did not confirm this request. <b>Payment stays on hold</b> — DICE will not release it on a timer. Query the partner to find out whether the request exists.') : '',
    req.stale && !req.uncertain ? alertBox('warn', 'No status for a long time', `No update for ${st.holdTimeoutHours} h. The hold is kept — query the partner to resolve it.`) : '',
    req.paused ? alertBox('warn', `Paused — ${esc(req.paused.reason)}`, 'The invoice changed after the request. Checks must be re-run; any earlier offer is invalid.') : '',
    req.status === FIN.EXCEPTION ? alertBox('err', 'Exception — payment locked', esc((req.exception || {}).reason || '')) : '',
    req.status === FIN.NOT_FUNDED ? alertBox('info', 'Not funded', `${esc(req.reason || '')}. The payment hold was released only after an authoritative answer from the partner — the invoice is back on the normal payment path.`) : '',
    req.status === FIN.SETTLED ? alertBox('ok', 'Settled and reconciled', 'The financing lifecycle is closed.') : '',
    req.status === FIN.FUNDED || req.status === FIN.SETTLE_PEND ? noteBox('green', 'lock', 'Funding is confirmed. Normal payment is <b>locked</b> for this invoice until settlement is reconciled.') : ''].join('');
  const right = [
    ([FIN.REQUESTED, FIN.REVIEW].includes(req.status) || req.uncertain || req.stale) ? gbtn('ops.reconcile', 'req-query', 'Query partner status', { cls: 'btn-outline', data: { id: req.id }, icn: 'reset' }) : (![FIN.SETTLED, FIN.NOT_FUNDED].includes(req.status) ? gbtn('ops.reconcile', 'req-query', 'Query partner status', { cls: 'btn-outline', data: { id: req.id }, icn: 'reset' }) : ''),
    req.paused ? gbtn('inv.revalidate', 'req-reval', 'Revalidate & resume', { cls: 'btn-primary', data: { id: req.id } }) : '',
    ([FIN.REQUESTED, FIN.REVIEW, FIN.OFFER].includes(req.status) && req.txnId) ? gbtn('inv.cancel', 'req-cancel', 'Cancel request', { cls: 'btn-danger', data: { id: req.id } }) : ''].join('');
  return `<div class="page">${pageHead({ title: 'Financing Request Status', tags: sb(req.status) + (req.paused ? ' ' + sb('Paused') : ''), right, crumb: `<a class="link" href="#/id">Invoice Discounting</a> › <a class="link" href="#/id/inv/${inv.id}">${esc(inv.number)}</a> › ${esc(req.number)}` })}
    ${banners}
    ${strip([['Invoice amount', inr(req.amount), esc(inv.number)], ['Financier', esc(off ? off.lendername : req.offers && req.offers.length ? `${req.offers.length} offer(s)` : '—')], ['Financing status', esc(req.status)], ['Normal payment', pcBadge(pc.state)], ['Net payout', off ? inr(off.netPayout) : req.funding ? inr(req.funding.amount) : '—']])}
    ${req.status === FIN.OFFER && !req.paused ? offersCard(req) : ''}
    <div class="cards-2" style="margin-top:20px"><div class="card"><div class="card-t">Transaction timeline</div>${timelineHtml(histItems(req.history))}</div>
      <div class="card"><div class="card-t">Details</div><div class="kvg c2">${kv('Request', `<b>${esc(req.number)}</b>`)}${kv('Partner transaction ID', `<span class="mono">${esc(req.txnId || (req.uncertain ? 'unknown' : '—'))}</span>`)}${kv('Idempotency key', `<span class="mono" style="word-break:break-all">${esc(req.idempotencyKey)}</span>`)}${kv('Programme', esc((getPrg(req.programmeId) || {}).reqId || '—'))}${kv('Consent', `${esc(req.consent.termsVersion)} · ${esc(req.consent.by)}<div class="small-note">${fmtDT(req.consent.at)} · ${esc(req.consent.channel)}</div>`)}${kv('Due date', fmtD(req.dueDate))}
        ${req.funding ? kv('Funding', `${inr(req.funding.amount)}<div class="small-note">UTR <span class="mono">${esc(req.funding.utr)}</span> · ${fmtD(req.funding.date)}</div>`) : ''}${req.settlement ? kv('Settlement', `${inr(req.settlement.amount)}<div class="small-note">UTR <span class="mono">${esc(req.settlement.utr)}</span> · ${fmtD(req.settlement.date)}</div>`) : ''}${req.variance ? kv('Variance', `<span style="color:var(--danger)">${inr(req.variance)}</span>`) : ''}</div>
        ${req.status === FIN.EXCEPTION && req.funding ? `<div style="margin-top:12px">${gbtn('ops.resolve', 'req-resolve', 'Resolve exception', { cls: 'btn-primary btn-sm', data: { id: req.id } })}<div class="small-note" style="margin-top:6px">Settlement is never closed on a mismatch — it needs a recorded resolution.</div></div>` : ''}</div></div>
    ${provBanner()}${txnApiBlock(req)}${txnSimHtml(req, t)}</div>`;
}
function offersCard(req) {
  const model = settings().offerModel, sel = ui.offerSel && (req.offers || []).some(o => o.offerId === ui.offerSel) ? ui.offerSel : (req.offers[0] || {}).offerId;
  if (model === 'redirect') return `<div class="card" style="margin-top:20px"><div class="card-t">Offer ready on the partner portal</div><div class="small-note">Offer selection, acceptance and funding happen on the partner portal in this model; DICE receives the status.</div><div style="margin-top:10px">${gbtn('inv.offer', 'open-partner', 'Open partner portal →', { cls: 'btn-primary', data: { id: req.id } })}</div></div>`;
  return `<div class="card" style="margin-top:20px"><div class="card-t">Choose an available offer <span class="small-note">from the lender response — indicative figures are labelled as such</span></div>${offerList(req, sel)}
    <div class="sec-h">Final consent</div><label class="check-row"><input type="checkbox" data-act="acc-consent" ${ui.accConsent ? 'checked' : ''}> <span>I confirm the supplier has reviewed the final lender terms and authorises this financing. <span class="small-note">Terms version, actor, timestamp and partner reference are stored.</span></span></label>
    <div style="display:flex;gap:10px;margin-top:14px">${gbtn('inv.offer', 'offer-accept', 'Accept & continue →', { cls: 'btn-primary', data: { id: req.id } })}${gbtn('inv.cancel', 'req-cancel', 'Reject offers & cancel', { cls: 'btn-outline', data: { id: req.id } })}</div></div>`;
}
function offerList(req, sel) {
  return (req.offers || []).map(o => { const exp = new Date(o.expiresAt) < new Date();
    return `<label class="offer ${o.offerId === sel ? 'on' : ''} ${exp ? 'expired' : ''}" data-act="offer-pick" data-oid="${o.offerId}"><input type="radio" name="offer" ${o.offerId === sel ? 'checked' : ''} ${exp ? 'disabled' : ''}><div><div style="font-weight:700">${esc(o.lendername)}</div><div class="small-note">Rate ${o.ratePct}% p.a. · ${o.tenorDays} days · discount ${inr(o.discount)} · fee ${inr(o.fee)}</div><div class="small-note">${esc(o.recourse)} · valid until ${fmtDT(o.expiresAt)}${exp ? ' <b style="color:var(--danger)">· EXPIRED</b>' : ''} · ${esc(o.termsVersion)}</div></div><div class="net">${inr(o.netPayout)}<small>net payout today</small></div></label>`; }).join('');
}
ACT['offer-pick'] = el => { ui.offerSel = el.dataset.oid; render(); };
ACT['acc-consent'] = el => { ui.accConsent = el.checked; };
ACT['offer-accept'] = el => { const req = getReq(el.dataset.id), sel = ui.offerSel || (req.offers[0] || {}).offerId, r = acceptOffer(req.id, sel, !!ui.accConsent); if (!r.ok) return errorModal(r.msg, r.errors || [r.msg]); ui.accConsent = false; toast(r.msg); render(); };
ACT['open-partner'] = el => { const req = getReq(el.dataset.id), sel = (req.offers[0] || {}).offerId; ui.offerSel = sel; openModal({ title: 'Partner portal (simulated)', cls: 'wide', hideFoot: true, html: `<div class="alert info" style="margin-top:0">You are on the partner's portal. DICE passed a signed context for <b>${esc(req.number)}</b>. Pick an offer and accept — DICE only learns the outcome through the status callback.</div>${offerList(req, sel)}<div style="margin-top:10px"><label class="check-row"><input type="checkbox" id="pp-consent"> <span>I accept the final terms on the partner portal.</span></label></div><div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-primary" data-act="pp-accept" data-id="${req.id}">Accept offer</button><button class="btn btn-outline" data-close>Leave portal</button></div>` }); };
ACT['pp-accept'] = el => { const ok = document.getElementById('pp-consent').checked, r = acceptOffer(el.dataset.id, ui.offerSel, ok); if (!r.ok) return toast(r.errors ? r.errors[0] : r.msg, 'err'); document.querySelector('.overlay')?.remove(); toast('Accepted on the partner portal — waiting for funding'); render(); };
ACT['req-query'] = el => { const r = queryPartnerStatus(el.dataset.id); toast(r.msg, r.ok ? undefined : 'err'); render(); };
ACT['req-reval'] = el => { const r = revalidateRequest(el.dataset.id); if (r.errors && r.errors.length) errorModal(r.msg, r.errors); else toast(r.msg, r.ok ? undefined : 'err'); render(); };
ACT['req-cancel'] = el => reasonModal({ title: 'Cancel financing request', label: 'Reason', btn: 'Cancel request', optional: true, onSubmit: reason => { const r = cancelRequest(el.dataset.id, reason); if (!r.ok) { errorModal(r.msg, r.errors || [r.msg]); return false; } toast(r.msg); render(); } });
ACT['req-resolve'] = el => reasonModal({ title: 'Resolve financing exception', label: 'Resolution (recorded in the audit trail)', btn: 'Resolve', danger: false, onSubmit: reason => { const r = resolveException(el.dataset.id, reason); toast(r.msg, r.ok ? undefined : 'err'); render(); } });

/* API exchange for a request + sandbox controls for the provider's side */
function txnApiBlock(req) {
  const evs = db.events.filter(e => e.corr === req.number || (req.txnId && JSON.stringify(e.req || '').includes(req.txnId))).slice(0, 8);
  return `<div class="sec">API exchange <span class="sub">${evs.length} recent call(s) · <a class="link" href="#/integration">open Integration console</a></span></div>${evs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>API</th><th>Dir</th><th>HTTP</th><th>Summary</th><th></th></tr></thead><tbody>${evs.map(e => `<tr class="click" data-act="ev-open" data-id="${e.id}"><td>${fmtDT(e.at)}</td><td>${esc(e.api)}</td><td>${e.dir === 'out' ? 'DICE → PSB' : e.dir === 'in' ? 'PSB → DICE' : 'Provider'}</td><td>${e.http == null ? '—' : e.http || 'timeout'}</td><td>${esc(e.summary)}</td><td>${viewBtn('', 'JSON').replace('data-act="go" data-hash=""', `data-act="ev-open" data-id="${e.id}"`)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="hint">No calls recorded for this request in the current log.</div>'}`;
}
const TXN_LABEL = { UNDER_REVIEW: 'Lender is reviewing', OFFER_AVAILABLE: 'Send offer(s)', ACCEPTED: 'Offer accepted', FUNDED: 'Confirm funding', SETTLEMENT_PENDING: 'Settlement pending', SETTLED: 'Settlement received', DECLINED: 'Decline', EXPIRED: 'Expire the offer', CANCELLED: 'Cancel', EXCEPTION: 'Raise an exception' };
function txnSimHtml(req, t) {
  if (!can('ops.sim') && db.meta.role !== 'admin') return '';
  if ([FIN.SETTLED, FIN.NOT_FUNDED].includes(req.status) && !(t && TXN_FLOW[t.state].length)) return `<div class="sim-card"><div class="st">Sandbox · lender side</div><div class="small-note">This request is closed.</div></div>`;
  if (!t) return `<div class="sim-card"><div class="st">Sandbox · lender side</div><div class="small-note">The partner holds <b>no transaction</b> for this request — the submission never arrived. “Query partner status” will confirm that and release the hold.</div></div>`;
  const next = TXN_FLOW[t.state].filter(s => s !== 'ACCEPTED');
  const btn = (s, extra = {}, label) => gbtn('ops.sim', 'txn-ev', label || TXN_LABEL[s], { cls: 'btn-outline btn-xs', data: { txn: t.id, to: s, ...extra } });
  return `<div class="sim-card"><div class="st">Sandbox · lender side (provisional transaction contract)</div><div class="small-note">Provider state: <b>${t.state}</b>. Buttons below advance the lender, which then calls DICE’s Transaction Status Callback. Use “drop the callback” to practise recovery with the status query. The supplier accepts offers in DICE; funding is the lender’s act.</div>
    <div class="btns">${next.map(s => s === 'FUNDED' ? btn(s) + btn(s, { v: 'short' }, 'Fund a different amount (−₹1,500)') : s === 'SETTLED' ? btn(s) + btn(s, { v: 'short' }, 'Settle short (−₹10,000)') + btn(s, { v: 'nourt' }, 'Settle without UTR') : btn(s)).join('') || '<span class="small-note">No further provider transitions</span>'}
    ${['FUNDED', 'SETTLEMENT_PENDING'].includes(t.state) ? btn('DECLINED', { v: 'afterfund' }, 'Send a conflicting DECLINED after funding') : ''}</div>${simOptsHtml()}</div>`;
}
ACT['txn-ev'] = el => {
  const t = db.psb.txns[el.dataset.txn], v = el.dataset.v, to = el.dataset.to, data = {};
  if (to === 'FUNDED' && v === 'short') { const o = (t.offers || []).find(x => x.offerId === t.acceptedOfferId); data.amount = r2((o ? o.netPayout : t.payload.invoiceAmount) - 1500); }
  if (to === 'SETTLED' && v === 'short') data.amount = r2(t.payload.invoiceAmount - 10000);
  if (to === 'SETTLED' && v === 'nourt') data.utr = ' ';
  if (v === 'afterfund') { t.state = 'ACCEPTED'; t.events.push({ state: 'ACCEPTED', at: nowISO(), note: 'forced for conflict test' }); }
  const r = psbTxnEvent(t.id, to, data, simOpts()); save();
  if (!r.ok) toast(r.msg, 'err'); else toast(`${TXN_LABEL[to]} · callback ${r.delivery}`, r.delivery === 'rejected' ? 'err' : undefined);
  render();
};
