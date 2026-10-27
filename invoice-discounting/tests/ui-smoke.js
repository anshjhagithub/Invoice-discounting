/* Renders every route for every role in jsdom with the real scripts and fails on any "Screen error".
   Needs jsdom:  npm i jsdom   (not a runtime dependency of the prototype).
   Run:  node tests/ui-smoke.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><body><div class="app"><aside class="sidebar" id="sidebar"></aside><main class="main" id="main"></main></div><div class="toast-stack" id="toasts"></div></body>', { runScripts: 'outside-only', url: 'http://localhost/index.html', pretendToBeVisual: true });
const ctx = dom.getInternalVMContext(), w = dom.window;
w.scrollTo = () => {}; w.HTMLElement.prototype.scrollTo = () => {};
const errors = []; w.addEventListener('error', e => errors.push(e.message)); const origErr = w.console.error; w.console.error = (...a) => { errors.push(a.map(String).join(' ')); };
scripts.forEach(s => new vm.Script(fs.readFileSync(path.join(root, s), 'utf8'), { filename: s }).runInContext(ctx));
const run = code => new vm.Script(code).runInContext(ctx);
let n = 0, bad = 0;
function visit(hash, label) {
  w.location.hash = hash; run('render()'); n++;
  const html = w.document.getElementById('main').innerHTML;
  if (/Screen error|Panel error/.test(html) || errors.length) { bad++; console.log('FAIL', label || hash, (html.match(/<div class="at">Screen error<\/div>([^<]*)/) || [])[1] || '', errors.splice(0).slice(0, 2).join(' | ')); }
}
const act = (name, data = {}) => { const el = w.document.createElement('button'); Object.entries(data).forEach(([k, v]) => { el.dataset[k] = v; }); el.dataset.act = name; run(`ACT['${name}'](document.querySelector('[data-tmp-act]')||(window.__el))`); };
function clickAct(name, data = {}) { const b = w.document.createElement('button'); b.dataset.act = name; Object.entries(data).forEach(([k, v]) => { b.dataset[k] = v; }); w.document.body.appendChild(b); b.click(); b.remove(); }

const ids = run('({ prg: db.programmes.map(p => p.id), prof: db.profiles.map(p => p.id), inv: db.invoices.map(i => i.id), req: db.requests.map(r => r.id), act: activeProgrammes().map(a => [a.prg.id, a.row.lenderId]), vendors: db.vendors.map(v => v.id) })');
for (const role of ['admin', 'finance', 'approver', 'ap', 'supplier', 'ops']) {
  run(`db.meta.role='${role}'; db.meta.vendorId='VEN-00841'`);
  ['#/avail', '#/avail?tab=suppliers', '#/avail?tab=active', '#/id', '#/id?tab=admin', '#/id?tab=financiers', '#/integration', '#/integration?tab=log', '#/integration?tab=sandbox', '#/integration?tab=mapping', '#/integration?tab=exceptions'].forEach(h => visit(h, `${role} ${h}`));
  ['new?step=1', 'new?step=2', 'new?step=3', 'new?step=4'].forEach(s => visit('#/avail/' + s, `${role} avail/${s}`));
  [1, 2, 3].forEach(s => visit(`#/avail/sup/new?step=${s}&vendor=VEN-00843`, `${role} sup/new ${s}`));
  ids.prg.forEach(i => { visit(`#/avail/prg/${i}`, `${role} prg ${i}`); visit(`#/avail/prg/${i}/edit?step=4`, `${role} prg edit ${i}`); });
  ids.act.forEach(([p, l]) => visit(`#/avail/active/${p}/${l}`, `${role} active ${p}`));
  ids.prof.forEach(i => visit(`#/avail/sup/${i}`, `${role} sup ${i}`));
  ids.inv.forEach(i => visit(`#/id/inv/${i}`, `${role} inv ${i}`));
  ids.req.forEach(i => visit(`#/id/req/${i}`, `${role} req ${i}`));
}
run("db.meta.role='admin'");
// panels / modals through their real handlers
visit('#/id'); clickAct('inv-request', { id: 'inv1042' }); if (!w.document.querySelector('.panel')) { bad++; console.log('FAIL request panel did not open'); } else w.document.querySelector('.panel-body').innerHTML.includes('Consent') || (bad++, console.log('FAIL panel body'));
clickAct('panel-close');
clickAct('discover'); if (!w.document.querySelector('.overlay')) { bad++; console.log('FAIL discover modal'); } w.document.querySelectorAll('.overlay').forEach(o => o.remove());
visit('#/integration?tab=log'); clickAct('ev-open', { id: run('db.events[0] && db.events[0].id') || 'none' });
['demo-open'].forEach(a => clickAct(a));
w.document.querySelectorAll('.overlay').forEach(o => o.remove()); clickAct('panel-close');
// scenarios A / B render
['A', 'B'].forEach(k => { run(`seedDb('${k}'); save()`); ['#/avail', '#/avail/new?step=3', '#/id', '#/integration'].forEach(h => visit(h, `scenario ${k} ${h}`)); run("db.meta.role='finance'"); visit('#/avail/new?step=3', `scenario ${k} lender step`); run("db.meta.role='admin'"); });
console.log(`${n} screens rendered, ${bad} failure(s)`);
process.exit(bad ? 1 : 0);
