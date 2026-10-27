const load = require('./load');
load(() => {
  seedDb('default');
  console.log('programmes', JSON.stringify(db.programmes.map(p => [p.reqId, p.dstatus, p.lenders.map(l => l.name + ':' + l.status).join(',')])));
  console.log('profiles', JSON.stringify(db.profiles.map(p => [p.vendorId, p.status])));
  console.log('requests', JSON.stringify(db.requests.map(r => [r.number, r.invoiceId, r.status, getInv(r.invoiceId).pc.state])));
  db.invoices.forEach(i => { const v = invoiceFinView(i); console.log(i.number, i.amount, v.label, v.elig ? v.elig.blocking.map(b => b.code).join('|') : ''); });
});
