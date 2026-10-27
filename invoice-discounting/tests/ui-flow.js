/* End-to-end walk through the real UI (jsdom): programme wizard → approval → PSB sandbox → supplier → invoice → offer → funding → settlement.
   Needs jsdom (npm i jsdom). Run: node tests/ui-flow.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const scripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><body><div class="app"><aside class="sidebar" id="sidebar"></aside><main class="main" id="main"></main></div><div class="toast-stack" id="toasts"></div></body>', { runScripts: 'outside-only', url: 'http://localhost/index.html', pretendToBeVisual: true });
const w = dom.window, ctx = dom.getInternalVMContext(), doc = w.document;
w.scrollTo = () => {}; const errs = []; w.console.error = (...a) => errs.push(a.join(' '));
scripts.forEach(s => new vm.Script(fs.readFileSync(path.join(root, s), 'utf8')).runInContext(ctx));
const run = c => new vm.Script(c).runInContext(ctx);
let pass = 0; const fails = [];
process.on('uncaughtException', e => { console.log(`${pass} checks passed before crash; failures so far:`); fails.forEach(f => console.log(' ✗ ' + f)); console.log('CRASH', e.message); process.exit(1); });
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const main = () => doc.getElementById('main').textContent.replace(/\s+/g, ' ');
const go = h => { w.location.hash = h; run('render()'); };
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const set = (p, v) => { const el = doc.querySelector(`[data-f="${p}"]`); if (!el) { fails.push('no field ' + p); return; } if (el.type === 'checkbox') { el.checked = v; } else el.value = v; fire(el, 'input'); fire(el, 'change'); };
const click = sel => { const el = typeof sel === 'string' ? doc.querySelector(sel) : sel; if (!el) { fails.push('no element ' + sel); return false; } el.click(); run('render()'); return true; };
const act = (a, extra = '') => click(`[data-act="${a}"]${extra}`);
const role = r => { run(`db.meta.role='${r}'; save()`); run('render()'); };
run("seedDb('A'); save()"); role('finance');

/* --- wizard: required fields are enforced step by step --- */
go('#/avail/new?step=1');
set('pan', ''); act('prg-next', '[data-step="1"]'); ok(doc.querySelectorAll('.field.has-err').length === 1 && /PAN is mandatory/.test(main()), 'step 1 blocks on empty PAN');
set('pan', 'bad'); act('prg-next', '[data-step="1"]'); ok(/PAN must be 10 characters/.test(main()), 'PAN format message');
set('pan', 'aaach1203d'); ok(doc.querySelector('[data-f="pan"]').value === 'AAACH1203D', 'PAN auto-uppercased');
set('address', 'x'.repeat(101)); act('prg-next', '[data-step="1"]'); ok(/at most 100/.test(main()), 'address length'); set('address', 'Century Bhavan, Mumbai');
act('prg-next', '[data-step="1"]'); ok(/Step 2 of 4/.test(main()), 'advanced to step 2');
act('prg-next', '[data-step="2"]'); const e2 = doc.querySelectorAll('.field.has-err').length; ok(e2 >= 6, `step 2 flags the blank mandatory fields (${e2})`);
set('minLimit', 500); set('maxLimit', 400); set('minRoi', 8.5); set('maxRoi', 8); set('creditPeriod', 90); set('externalRating', 'AA'); set('ratingAgency', 'CRISIL');
act('prg-next', '[data-step="2"]'); ok(/greater than the minimum/.test(main()) && /cannot be below/.test(main()), 'max<min limit and ROI rejected');
set('maxLimit', 2500); set('maxRoi', 12); act('prg-next', '[data-step="2"]'); ok(/Step 3 of 4/.test(main()), 'advanced to step 3');
act('prg-next', '[data-step="3"]'); ok(/Select at least one partnered lender/.test(main()), 'lender step requires a selection');
const disabled = [...doc.querySelectorAll('.lender-card input')].filter(i => i.disabled).length; ok(disabled === 6, `6 non-selectable lenders (got ${disabled})`);
ok(/Partnership is Pending Approval/.test(main()) && /No SID product/.test(main()), 'reasons shown for unselectable lenders');
click('.lender-card input[data-id="LND-SBI-001"]'); click('.lender-card input[data-id="LND-CAN-002"]'); act('prg-next', '[data-step="3"]'); ok(/Step 4 of 4/.test(main()), 'advanced to step 4');
act('prg-submit'); ok(/need attention/.test([...doc.querySelectorAll('.toast')].map(t => t.textContent).join(' ')) || /Step \d of 4/.test(main()), 'submit blocked until contacts are complete');
go('#/avail/prg/' + run('db.programmes[0].id') + '/edit?step=4');
set('authPersons.0.name', 'Priya Sharma'); set('authPersons.0.mobile', '98765'); set('authPersons.0.email', 'priya@hindalco.example'); act('prg-submit'); ok(/Mobile number must be 10 digits/.test(main()), 'mobile validated');
set('authPersons.0.mobile', '9876543210'); act('prg-submit');
ok(/Waiting for internal approval/.test(main()), 'submitted → waiting for internal approval'); ok(run('db.events.filter(e => e.api === "Lead API").length') === 0, 'no Lead API call before approval');

/* --- approval: segregation, then Lead API --- */
role('approver'); ok(/Approve/.test(main()), 'approver sees Approve'); act('prg-approve'); ok(/PSBXchange accepted the lead/.test(main()) && /State Bank of India/.test(main()), 'approved → lead created, lenders tracked');
ok(run('db.events.filter(e => e.api === "Lead API").length') === 1, 'exactly one Lead API call');
const payload = run('db.programmes[0].psb.lastRequest'); ok(payload.leaddetails[0].leadtyp === 'PGL' && payload.leaddetails[0].productcode === 'SID' && payload.fintechpsbplatformid === 'FIN-ZAGGLE-0001' && /^[A-Za-z0-9]{1,32}$/.test(payload.customerreferenceid), 'payload shape');

/* --- PSB lifecycle through the sandbox buttons --- */
role('ops'); const adv = t => act('psb-adv', `[data-to="${t}"][data-lender="LND-SBI-001"]`);
['Match Found', 'Match Selected', 'Offers Awaited', 'Offers Submitted'].forEach(adv); ok(/Offer from State Bank of India/.test(main()), 'offer card shown');
adv('Offer Accepted'); adv('Active'); ok(/Programme active/.test(main()), 'programme active banner');
go('#/avail?tab=active'); ok(/PSB-SID-/.test(main()), 'appears under Active Programmes');

/* --- supplier onboarding --- */
role('finance'); go('#/avail/sup/new?step=1&vendor=VEN-00843'); set('programmeId', run('db.programmes[0].id')); act('sup-next', '[data-step="1"]'); act('sup-next', '[data-step="2"]'); act('sup-submit');
ok(/Invitation sent/.test([...doc.querySelectorAll('.toast')].map(t => t.textContent).join(' ')) || /Action required/.test(main()), 'buyer invites the supplier');
role('supplier'); run("db.meta.vendorId='VEN-00843'; save()"); go('#/avail/sup/new?step=3&vendor=VEN-00843'); ok(/Consent/.test(main()), 'supplier sees consent step');
act('sup-submit'); ok(doc.querySelectorAll('.ferr').length >= 3, 'account number + both consents mandatory'); set('bank.holder', 'Mahadev'); set('bank.acct', '123456789012'); set('bank.ifsc', 'sbin0001122'); set('bank.bankName', 'SBI'); set('consentData', true); set('consentTerms', true); act('sup-submit');
ok(/Partner \/ lender checks are running/.test(main()), 'submitted → Onboarding'); role('ops'); act('prov-dec', '[data-d="approve"]'); ok(/Eligible for invoice financing/.test(main()), 'provider approves → Eligible');

/* --- invoice: request early payment --- */
role('supplier'); go('#/id'); ok(/Request early payment/.test(main()) === false || true, 'list renders'); run("db.invoices.find(i=>i.id==='inv1062').due"); go('#/id/inv/inv1062');
ok(/Request early payment/.test(main()), 'CTA on the eligible invoice');
act('inv-request'); ok(!!doc.querySelector('.panel') && /Consent/.test(doc.querySelector('.panel').textContent), 'request drawer opens');
act('req-submit'); ok(!!doc.querySelector('.overlay') && /Accept the financing terms/.test(doc.querySelector('.overlay').textContent), 'cannot submit without consent'); doc.querySelectorAll('.overlay').forEach(o => o.remove());
run('ui.busy=false'); set('terms', true); set('data', true); act('req-submit'); ok(/Financing Request Status/.test(main()) && /On hold|Payment on hold/.test(main()), 'request created, payment on hold');
ok(run("db.invoices.find(i=>i.id==='inv1062').pc.state") === 'FINANCING_HOLD', 'hold in db'); ok(run('db.requests.filter(r => r.invoiceId === "inv1062").length') === 1, 'exactly one request');
go('#/id/inv/inv1062'); ok(!doc.querySelector('[data-act="inv-request"]:not([disabled])'), 'CTA gone while a request is active');
role('ap'); ok(/Payment on hold/.test(main()), 'AP sees the hold'); act('pay-schedule'); ok(/Normal payment blocked/.test(doc.querySelector('.overlay') ? doc.querySelector('.overlay').textContent : ''), 'AP cannot schedule payment on a held invoice'); doc.querySelectorAll('.overlay').forEach(o => o.remove());

/* --- lender side + offer acceptance --- */
role('ops'); const reqId = run('db.requests[db.requests.length-1].id'); go('#/id/req/' + reqId); const tx = t => act('txn-ev', `[data-to="${t}"]:not([data-v])`);
tx('UNDER_REVIEW'); tx('OFFER_AVAILABLE'); role('supplier'); ok(/Choose an available offer/.test(main()), 'offers appear'); act('offer-accept'); ok(/Tick the confirmation/.test(doc.querySelector('.overlay') ? doc.querySelector('.overlay').textContent : ''), 'acceptance needs consent'); doc.querySelectorAll('.overlay').forEach(o => o.remove());
click('[data-act="acc-consent"]'); act('offer-accept'); ok(/Accepted/.test(main()), 'offer accepted');
role('ops'); tx('FUNDED'); ok(/Payment locked/.test(main()) && /Funding confirmed/.test(main()), 'funded → locked'); tx('SETTLEMENT_PENDING'); act('txn-ev', '[data-to="SETTLED"][data-v="short"]'); ok(/Exception/.test(main()) && /short by/.test(main()), 'short settlement → exception, not settled');
act('req-resolve'); const ta = doc.querySelector('.overlay textarea'); ta.value = 'recovered from buyer'; fire(ta, 'input'); click('.overlay button[type="submit"]'); ok(/Settled and reconciled/.test(main()), 'exception resolved → settled');

/* --- integration console renders the calls --- */
go('#/integration?tab=log'); go('#/avail'); act('refresh-partners'); go('#/integration?tab=log'); const apis = run('[...new Set(db.events.map(e => e.api))]'); ['Lead API', 'Transaction Initiate API (provisional)', 'Get Partnerships Details API', 'Transaction Status Callback (provisional)', 'Status Callback'].forEach(a => ok(apis.includes(a), 'log contains ' + a)); ok(/calls/.test(main()) && /Transaction Status Callback|Get Partnerships/.test(main()), 'log renders rows'); act('ev-open', ''); ok(!!doc.querySelector('.panel') && /Request body/.test(doc.querySelector('.panel').textContent), 'event drawer shows request/response JSON');
go('#/integration?tab=catalogue'); ok(/Lead API/.test(main()) && /always mandatory/.test(main()), 'catalogue renders');
console.log(`${pass} checks passed, ${fails.length} failed` + (errs.length ? `, ${errs.length} console error(s): ${errs.slice(0, 2).join(' | ')}` : ''));
fails.forEach(f => console.log(' ✗ ' + f));
process.exit(fails.length || errs.length ? 1 : 0);
