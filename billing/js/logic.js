/* =====================================================================
   logic.js — derived balances, validation, matching engine, state transitions
   No DOM access. Every balance shown anywhere in the UI is computed here
   from the underlying records (nothing is hard-coded into screens).

   Model rules that keep the flows consistent:
   - A PO is Goods (receipts = GRN), Services (receipts = SRN) or Mixed (each line is goods or a service).
   - A milestone is billable only when it is APPROVED and every configured acceptance condition holds:
     document approval (evidence on the milestone itself), accepted GRN(s) for goods, accepted SRN(s) for services.
     Documents and receipts are separate records — a certificate never creates a GRN/SRN.
   - Milestone lifecycle: Pending → In Progress → Submitted for Approval → Under Review → Approved | Rejected (→ resubmit).
   - Certified work progress is a Services-only progressive basis, tracked at PO level.
   ===================================================================== */
const LIVE = ['Submitted', 'Pending Matching', 'Pending Approval', 'Approved', 'Posted', 'Paid'];   // invoice states that hold an allocation
const APPROVED = ['Approved', 'Posted', 'Paid'];
const GRN_OK = ['Accepted', 'Partially Accepted'];
const SRN_OK = ['Accepted', 'Partially Accepted'];
const isLive = i => LIVE.includes(i.status) && !i.reversed;     // a reversed (credited) invoice no longer holds an allocation

const getPO = id => db.pos.find(p => p.id === id);
const getSup = id => db.suppliers.find(s => s.id === id);
const getGRN = id => db.grns.find(g => g.id === id);
const getSRN = id => db.srns.find(s => s.id === id);
const getMS = id => db.milestones.find(m => m.id === id);
const getClaim = id => db.claims.find(c => c.id === id);
const getInv = id => db.invoices.find(i => i.id === id);
const lineOf = (po, id) => po.lines.find(l => l.id === id);
const poNet = po => sum(po.lines, l => l.qty * l.price);
const lineNet = l => r2(l.qty * l.price);
const grnsOf = po => db.grns.filter(g => g.poId === po.id).sort((a, b) => a.seq - b.seq);
const srnsOf = po => db.srns.filter(s => s.poId === po.id).sort((a, b) => a.seq - b.seq);
const msOf = po => db.milestones.filter(m => m.poId === po.id).sort((a, b) => a.seq - b.seq);
const claimsOf = po => db.claims.filter(c => c.poId === po.id).sort((a, b) => a.seq - b.seq);
const invsOf = po => db.invoices.filter(i => i.poId === po.id);
const poAllocatable = po => po.status === 'Approved';
const lineKind = (po, l) => po.type === 'Mixed' ? (l.kind === 'Services' ? 'Services' : 'Goods') : po.type;
const goodsLines = po => po.lines.filter(l => lineKind(po, l) === 'Goods');
const serviceLines = po => po.lines.filter(l => lineKind(po, l) === 'Services');
const hasGoods = po => goodsLines(po).length > 0, hasServices = po => serviceLines(po).length > 0;
const isGoods = po => po.type === 'Goods';                                  // purely goods
const recLabel = po => po.type === 'Mixed' ? 'GRN / SRN' : po.type === 'Goods' ? 'GRN' : 'SRN';
const poCertified = po => po.billingMethod === 'Progressive' && po.progressBasis === 'Certified';
const methodLabel = po => po.billingMethod === 'Progressive' ? (poCertified(po) ? 'Progressive · Certified progress' : 'Progressive · Receipt-based') : po.billingMethod;
const msFull = m => `${m.code} — ${m.name}`;
const gstOf = po => po.gstRate ?? GST_DEFAULT;

/* ---------- allocations: who is consuming what ---------- */
function allocsOn(kind, refId, exId) {
  const out = [];
  db.invoices.forEach(i => { if (!isLive(i) || i.id === exId) return; i.allocs.forEach(a => { if (a.kind === kind && a.refId === refId) out.push({ inv: i, a }); }); });
  return out;
}
function usage(kind, refId, exId) {
  const l = allocsOn(kind, refId, exId);
  const committed = l.filter(x => APPROVED.includes(x.inv.status)), reserved = l.filter(x => !APPROVED.includes(x.inv.status));
  return {
    qty: sum(l, x => x.a.qty || 0), value: sum(l, x => x.a.value), invs: [...new Set(l.map(x => x.inv))],
    committedQty: sum(committed, x => x.a.qty || 0), committedValue: sum(committed, x => x.a.value),
    reservedQty: sum(reserved, x => x.a.qty || 0), reservedValue: sum(reserved, x => x.a.value),
  };
}

/* ---------- goods receipts (GRN) ---------- */
const grnEnt = g => (GRN_OK.includes(g.status) && !g.reversed) ? g.accepted : 0;
const grnActiveQty = g => g.reversed ? 0 : (g.status === 'Pending Inspection' ? g.received : g.accepted);
function lineReceiptStats(po, line, exGrnId) {
  const gs = grnsOf(po).filter(g => g.lineId === line.id && g.id !== exGrnId);
  const active = sum(gs, grnActiveQty);
  const maxQty = r2(line.qty * (1 + (po.overReceiptPct || 0) / 100));
  return {
    ordered: line.qty, maxQty, active, remaining: r2(Math.max(0, maxQty - active)),
    receivedQty: sum(gs.filter(g => !g.reversed), g => g.received),
    acceptedQty: sum(gs, grnEnt), rejectedQty: sum(gs.filter(g => !g.reversed), g => g.rejected),
    pendingQty: sum(gs.filter(g => !g.reversed && g.status === 'Pending Inspection'), g => g.received),
  };
}
/* milestone ↔ receipt link validation shared by GRN / SRN creation and the link action */
function checkReceiptLink(po, milestoneId, kind) {
  if (!milestoneId) return [];
  const m = getMS(milestoneId), L = kind.toUpperCase();
  if (!m || m.poId !== po.id) return ['The selected milestone does not belong to this PO.'];
  if (!(kind === 'grn' ? m.needsGrn : m.needsSrn)) return [`${m.code} is not configured to require a ${L}.`];
  return [];
}
function validateGRN(d) {
  const po = getPO(d.poId), errs = [];
  if (!po) return ['Select an approved purchase order with goods lines.'];
  if (po.status !== 'Approved') return [`${po.number} is ${po.status}. Goods receipts can only be created against an approved PO.`];
  if (!hasGoods(po)) return [`${po.number} has no goods lines — record services with a service receipt (SRN) instead of a GRN.`];
  const line = lineOf(po, d.lineId);
  if (!line) return ['Select a PO line.'];
  if (lineKind(po, line) !== 'Goods') return [`Line ${line.no} is a services line — record it with an SRN, not a GRN.`];
  const st = lineReceiptStats(po, line, d.id);
  if (!(d.received > 0)) errs.push('Delivered quantity must be greater than zero.');
  if (d.received > st.remaining + EPS) errs.push(`Delivered quantity (${fmtNum(d.received)}) exceeds the remaining PO quantity (${fmtNum(st.remaining)} ${line.uom}) on line ${line.no}.`);
  if (d.accepted < 0 || d.rejected < 0) errs.push('Accepted and rejected quantities cannot be negative.');
  if (r2(d.accepted + d.rejected) > d.received + EPS) errs.push(`Accepted (${fmtNum(d.accepted)}) + rejected (${fmtNum(d.rejected)}) cannot exceed delivered quantity (${fmtNum(d.received)}).`);
  checkReceiptLink(po, d.milestoneId, 'grn').forEach(e => errs.push(e));
  return errs;
}

/* ---------- service receipts (SRN) ---------- */
const srnActive = s => s.status === 'Rejected' ? 0 : (SRN_OK.includes(s.status) ? s.acceptedValue : s.serviceValue);
const srnEnt = s => SRN_OK.includes(s.status) ? s.acceptedValue : 0;
function lineServiceStats(po, line, exId) {
  const ss = srnsOf(po).filter(s => s.lineId === line.id && s.id !== exId);
  return { total: lineNet(line), active: sum(ss, srnActive), accepted: sum(ss, srnEnt), remaining: r2(Math.max(0, lineNet(line) - sum(ss, srnActive))) };
}
function validateSRN(d) {
  const po = getPO(d.poId), errs = [];
  if (!po) return ['Select an approved purchase order with service lines.'];
  if (po.status !== 'Approved') return [`${po.number} is ${po.status}. Service receipts can only be created against an approved PO.`];
  if (!hasServices(po)) return [`${po.number} has no service lines — record goods with a goods receipt (GRN) instead of an SRN.`];
  const line = lineOf(po, d.lineId); if (!line) return ['Select a PO line.'];
  if (lineKind(po, line) !== 'Services') return [`Line ${line.no} is a goods line — record it with a GRN, not an SRN.`];
  const st = lineServiceStats(po, line, d.id);
  if (!(d.serviceValue > 0)) errs.push('Service value must be greater than zero.');
  if (d.serviceValue > st.remaining + EPS) errs.push(`Service value ${money(d.serviceValue)} exceeds the remaining value ${money(st.remaining)} on line ${line.no}.`);
  if (!String(d.description || '').trim()) errs.push('Describe the service received.');
  checkReceiptLink(po, d.milestoneId, 'srn').forEach(e => errs.push(e));
  return errs;
}

/* ---------- milestones ---------- */
/* Acceptance conditions are configured per milestone and are independent records:
     needsDoc → an evidence document (e.g. "Commissioning Certificate") uploaded by the supplier and APPROVED with the milestone —
                it lives on the milestone, never on a GRN / SRN, and no quantity is ever invented for it
     needsGrn → accepted GRN(s) recording the real goods received (one or several, e.g. staged deliveries)
     needsSrn → accepted SRN(s) recording the real service delivered
   Any combination (or none) can be required. */
const docTitleOf = m => m.docTitle || 'Supporting document';
const docState = m => !m.doc || !(m.doc.files || []).length ? 'Not Uploaded' : m.doc.status;           // Not Uploaded | Pending Approval | Approved | Rejected
const msAwaiting = m => ['Submitted for Approval', 'Under Review'].includes(m.status);
const MS_STATES = ['Pending', 'In Progress', 'Submitted for Approval', 'Under Review', 'Approved', 'Rejected'];
const msLocked = m => usage('milestone', m.id).value > EPS || ['Submitted for Approval', 'Under Review', 'Approved'].includes(m.status);
function recCond(m, kind) {
  const ids = (kind === 'grn' ? m.grnIds : m.srnIds) || [], L = kind.toUpperCase(), OKS = kind === 'grn' ? GRN_OK : SRN_OK;
  const recs = ids.map(id => kind === 'grn' ? getGRN(id) : getSRN(id)).filter(Boolean);
  const live = recs.filter(r => !r.reversed && r.status !== 'Rejected'), pending = live.filter(r => !OKS.includes(r.status)), good = live.filter(r => OKS.includes(r.status));
  const ok = good.length > 0 && !pending.length, waiting = kind === 'grn' ? 'Pending Inspection' : 'Pending Acceptance';
  const reason = ok ? '' : !recs.length ? `an accepted ${L} is required — none linked yet` : !live.length ? `every linked ${L} was rejected or reversed — link a valid ${L}` : `${pending.map(r => r.number).join(', ')} ${kind === 'grn' ? 'is still pending inspection' : 'is still pending acceptance'}`;
  return { key: kind, ok, status: ok ? 'Accepted' : !recs.length ? 'None' : pending.length ? waiting : 'Rejected', title: `Accepted ${L}`, recs, reason };
}
function msGate(m, po) {
  const conds = [];
  if (m.needsDoc) {
    const st = docState(m), t = docTitleOf(m);
    conds.push({ key: 'doc', ok: st === 'Approved', status: st, title: t,
      reason: st === 'Approved' ? '' : st === 'Not Uploaded' ? `the ${t} has not been uploaded yet` : st === 'Rejected' ? `the ${t} was rejected${m.doc.rejectReason ? ' (' + m.doc.rejectReason + ')' : ''} — upload a corrected document` : `the ${t} is uploaded and awaiting approval` });
  }
  if (m.needsGrn) conds.push(recCond(m, 'grn'));
  if (m.needsSrn) conds.push(recCond(m, 'srn'));
  const unmet = conds.filter(c => !c.ok), recs = conds.flatMap(c => c.recs || []);
  const label = [m.needsGrn ? 'GRN' : '', m.needsSrn ? 'SRN' : ''].filter(Boolean).join(' + ') || recLabel(po);
  return { ok: !unmet.length, required: conds.length > 0, label, recs, rec: recs[0], conds, reason: unmet.map(c => c.reason).join(' and ') };
}
/* Eligible value = the milestone amount once it is APPROVED and every configured acceptance condition is satisfied */
const msEnt = (m, po) => (m.status === 'Approved' && msGate(m, po).ok) ? m.amount : 0;
function msBilling(m, po) {
  const u = usage('milestone', m.id), ent = msEnt(m, po);
  if (u.value >= m.amount - EPS && m.amount > 0) return 'Invoiced';
  if (u.value > EPS) return ent > 0 ? 'Partially Invoiced' : 'Not Eligible';
  return ent > 0 ? 'Eligible' : 'Not Eligible';
}
/* percentage schedule → amounts; the last milestone absorbs rounding so the schedule always equals the PO value */
function milestoneAmounts(ms, poValue) {
  let used = 0;
  return ms.map((m, i) => { const a = i === ms.length - 1 ? r2(poValue - used) : r2((Number(m.pct) || 0) * poValue / 100); used = r2(used + a); return a; });
}
function scheduleCheck(ms, poValue) {
  const errs = [], pctTotal = r2(ms.reduce((s, m) => s + (Number(m.pct) || 0), 0));
  const amounts = Math.abs(pctTotal - 100) < 0.0001 ? milestoneAmounts(ms, poValue) : ms.map(m => r2((Number(m.pct) || 0) * poValue / 100));
  if (!ms.length) errs.push('Add at least one milestone.');
  if (!(poValue > 0)) errs.push(`PO value is ${money(0)} — enter the line items before building the schedule.`);
  ms.forEach((m, i) => { const c = m.code || 'M' + (i + 1); if (!String(m.name || '').trim()) errs.push(`${c}: milestone name is required.`); if (!(Number(m.pct) > 0)) errs.push(`${c}: percentage must be greater than zero.`); });
  if (ms.length && Math.abs(pctTotal - 100) > 0.0001) errs.push(pctTotal > 100 ? `Schedule totals ${fmtNum(pctTotal)}% — it exceeds the PO value by ${fmtNum(r2(pctTotal - 100))}%.` : `Schedule totals ${fmtNum(pctTotal)}% — ${fmtNum(r2(100 - pctTotal))}% of the PO value is not allocated yet. It must total exactly 100%.`);
  return { pctTotal, total: sum(amounts, x => x), amounts, errors: errs, ok: !errs.length };
}

/* ---------- certified progress claims (Services, PO level) ---------- */
const cumCertified = (po, exId) => sum(claimsOf(po).filter(c => c.status === 'Certified' && c.id !== exId), c => c.certified);
function claimView(c) {
  const po = getPO(c.poId);
  const prev = c.status === 'Certified' ? c.prevCum : cumCertified(po, c.id);
  const current = r2(c.claimedCum - prev);
  const u = usage('claim', c.id);
  const ent = c.status === 'Certified' ? c.certified : 0;
  return { prev, current, cum: c.claimedCum, certified: c.status === 'Certified' ? c.certified : 0, used: u.value, remaining: r2(Math.max(0, ent - u.value)), ent };
}

/* ---------- eligible sources (entitlements) for a PO ---------- */
function sourceItems(po, ex) {
  const items = [];
  if (po.billingMethod === 'Milestone') {
    msOf(po).forEach(m => {
      const gate = msGate(m, po), ent = msEnt(m, po), u = usage('milestone', m.id, ex);
      let reason = '';
      if (m.status === 'Draft') reason = 'PO is not approved yet';
      else if (m.status === 'Pending') reason = 'Milestone work has not started';
      else if (m.status === 'In Progress') reason = 'Milestone is in progress — not submitted for approval yet';
      else if (m.status === 'Submitted for Approval') reason = 'Submitted — waiting for the approver to review';
      else if (m.status === 'Under Review') reason = 'Under review by the approver';
      else if (m.status === 'Rejected') reason = `Rejected${m.rejectReason ? ' (' + m.rejectReason + ')' : ''} — the supplier must resubmit`;
      else if (!gate.ok) reason = `Approved, but ${gate.reason}`;
      else if (u.value >= m.amount - EPS) reason = `Fully invoiced${u.invs.length ? ' on ' + u.invs.map(invRef).join(', ') : ''}`;
      items.push({ kind: 'milestone', refId: m.id, ref: m, label: m.code, name: m.name, status: m.status, entQty: null, entValue: ent, usedQty: 0, usedValue: u.value, committedValue: u.committedValue, reservedValue: u.reservedValue,
        availQty: null, availValue: r2(Math.max(0, ent - u.value)), eligible: ent > 0 && ent - u.value > EPS, reason, invs: u.invs });
    });
    return items;
  }
  if (poCertified(po)) {
    claimsOf(po).forEach(c => {
      const v = claimView(c), u = usage('claim', c.id, ex);
      let reason = '';
      if (c.status !== 'Certified') reason = `Claim is ${c.status} — not yet certified`;
      else if (u.value >= v.certified - EPS) reason = `Fully invoiced${u.invs.length ? ' on ' + u.invs.map(invRef).join(', ') : ''}`;
      items.push({ kind: 'claim', refId: c.id, ref: c, label: c.number, name: `Claim ${c.period}`, status: c.status, entQty: null, entValue: v.ent, usedQty: 0, usedValue: u.value, committedValue: u.committedValue, reservedValue: u.reservedValue,
        availQty: null, availValue: r2(Math.max(0, v.ent - u.value)), eligible: v.ent > 0 && v.ent - u.value > EPS, reason, invs: u.invs });
    });
    return items;
  }
  if (hasGoods(po)) grnsOf(po).forEach(g => {
    const line = lineOf(po, g.lineId), ent = grnEnt(g), u = usage('grn', g.id, ex), price = line.price;
    let reason = '';
    if (g.reversed) reason = 'Receipt reversed — entitlement withdrawn';
    else if (g.status === 'Rejected') reason = 'GRN rejected — nothing invoice-eligible';
    else if (!GRN_OK.includes(g.status)) reason = `GRN is ${g.status} — not invoice-eligible until accepted`;
    else if (ent - u.qty <= EPS) reason = `Fully allocated${u.invs.length ? ' on ' + u.invs.map(invRef).join(', ') : ''}`;
    const availQty = r2(Math.max(0, ent - u.qty));
    items.push({ kind: 'grn', refId: g.id, ref: g, label: g.number, name: `${g.number} · ${fmtD(g.date)}`, line, status: g.reversed ? 'Reversed' : g.status, price, entQty: ent, entValue: r2(ent * price), usedQty: u.qty, usedValue: r2(u.qty * price),
      committedQty: u.committedQty, reservedQty: u.reservedQty, committedValue: r2(u.committedQty * price), reservedValue: r2(u.reservedQty * price),
      availQty, availValue: r2(availQty * price), eligible: availQty > EPS, reason, invs: u.invs });
  });
  if (hasServices(po)) srnsOf(po).forEach(s => {
    const line = lineOf(po, s.lineId), ent = srnEnt(s), u = usage('srn', s.id, ex);
    let reason = '';
    if (s.status === 'Rejected') reason = 'SRN rejected — nothing invoice-eligible';
    else if (!SRN_OK.includes(s.status)) reason = `SRN is ${s.status} — not invoice-eligible until accepted`;
    else if (ent - u.value <= EPS) reason = `Fully allocated${u.invs.length ? ' on ' + u.invs.map(invRef).join(', ') : ''}`;
    items.push({ kind: 'srn', refId: s.id, ref: s, label: s.number, name: `${s.number} · ${fmtD(s.date)}`, line, status: s.status, entQty: null, entValue: ent, usedQty: 0, usedValue: u.value, committedValue: u.committedValue, reservedValue: u.reservedValue,
      availQty: null, availValue: r2(Math.max(0, ent - u.value)), eligible: ent > 0 && ent - u.value > EPS, reason, invs: u.invs });
  });
  return items;
}

/* ---------- PO summary: received / accepted / invoiced / approved / paid are distinct ---------- */
function poSummary(po) {
  const value = poNet(po), invs = invsOf(po).filter(i => !i.reversed), live = invs.filter(isLive);
  const items = sourceItems(po);
  const invoiced = sum(live, i => i.net);
  const approved = sum(invs.filter(i => APPROVED.includes(i.status)), i => i.net);
  const paid = sum(invs.filter(i => i.status === 'Paid'), i => i.net);
  const reserved = sum(live.filter(i => !APPROVED.includes(i.status)), i => i.net);
  let received = 0;
  if (po.billingMethod === 'Milestone') received = sum(msOf(po).filter(m => ['Submitted for Approval', 'Under Review', 'Approved'].includes(m.status)), m => m.amount);
  else if (poCertified(po)) received = sum(claimsOf(po).filter(c => ['Submitted', 'Certified'].includes(c.status)), c => claimView(c).current);
  else received = sum(grnsOf(po).filter(g => !g.reversed), g => g.received * lineOf(po, g.lineId).price) + sum(srnsOf(po), s => s.serviceValue);
  const accepted = sum(items, x => x.entValue);
  const remaining = (po.billingMethod === 'Standard') ? r2(Math.max(0, accepted - invoiced)) : sum(items, x => x.availValue);
  const gs = grnsOf(po);
  return {
    value, received, accepted, invoiced, approved, paid, reserved, remaining, remainingPO: r2(value - invoiced),
    acceptedQty: sum(gs, grnEnt), receivedQty: sum(gs.filter(g => !g.reversed), g => g.received), rejectedQty: sum(gs.filter(g => !g.reversed), g => g.rejected),
    invoicedQty: sum(live.flatMap(i => i.allocs.filter(a => a.kind === 'grn')), a => a.qty),
    remainingPOQty: sum(goodsLines(po), l => lineReceiptStats(po, l).remaining),
    items,
  };
}

/* ---------- PO stage (drives the status pill and the stage tracker) ---------- */
function poStage(po) {
  const s = po.status === 'Approved' ? poSummary(po) : null;
  const recName = po.billingMethod === 'Milestone' ? 'Milestone' : poCertified(po) ? 'Progress' : recLabel(po);
  const steps = [
    { t: 'PO created', pending: 'Draft — not submitted', next: 'Submit the PO for approval' },
    { t: 'PO approved', pending: 'Approval Pending', next: 'Procurement Manager approves the PO' },
    { t: po.billingMethod === 'Milestone' ? 'Milestone approved' : poCertified(po) ? 'Progress certified' : isGoods(po) ? 'Goods received' : po.type === 'Mixed' ? 'Goods / service accepted' : 'Service accepted',
      pending: po.billingMethod === 'Milestone' ? 'Milestone Approval Pending' : poCertified(po) ? 'Progress Certification Pending' : isGoods(po) ? 'Goods Receipt Pending' : po.type === 'Mixed' ? 'Goods / Service Receipt Pending' : 'Service Receipt Pending',
      next: po.billingMethod === 'Milestone' ? 'Supplier submits a milestone with its evidence; the approver approves it' : poCertified(po) ? 'Vendor claims progress and buyer certifies it' : isGoods(po) ? 'Receive and accept goods from vendor' : po.type === 'Mixed' ? 'Receive and accept goods and services from vendor' : 'Receive and accept services from vendor' },
    { t: 'Invoice submitted', pending: 'Invoice Pending', next: 'Vendor submits an invoice for the eligible value' },
    { t: 'Invoice approved', pending: 'Invoice Approval Pending', next: 'AP Manager approves the invoice' },
    { t: 'Payment made', pending: 'Payment Pending', next: 'Post to AP and pay the vendor' },
  ];
  const reached = [po.status !== 'Draft' && po.status !== 'Rejected', po.status === 'Approved', !!s && s.accepted > EPS, !!s && s.invoiced > EPS, !!s && s.approved > EPS, !!s && s.paid > EPS];
  const complete = !!s && s.value > 0 && s.paid >= s.value - EPS;
  let cur = reached.findIndex(x => !x);
  let label, short, tone;
  if (po.status === 'Rejected') { label = 'Rejected'; short = 'REJECTED'; tone = 'red'; cur = 1; }
  else if (complete) { label = 'Completed'; short = 'CLOSED'; tone = 'gray'; cur = 6; }
  else if (cur === -1) { label = 'Billing in progress'; short = 'BILLING'; tone = 'green'; cur = 6; }
  else { label = steps[cur].pending; tone = po.status === 'Draft' ? 'gray' : po.status === 'Pending Approval' ? 'amber' : 'green';
    short = ['DRAFT', 'APPROVAL', recName.toUpperCase(), 'INVOICE', 'INV. APPROVAL', 'PAYMENT'][cur]; }
  const done = reached.filter(Boolean).length;
  return { steps, reached, cur, label, short, tone, complete, done, total: 6, next: steps[Math.min(cur, 5)].next, pctDone: Math.round((complete ? 6 : done) / 6 * 100) };
}
const poIsPast = po => po.status === 'Rejected' || poStage(po).complete;

/* ---------- invoice helpers ---------- */
const invRef = i => i.ref || i.id;
const approvalStatus = i => ({ 'Pending Approval': 'Pending', Approved: 'Approved', Posted: 'Approved', Paid: 'Approved', Rejected: 'Rejected', Cancelled: '—' }[i.status] || 'Not started');
const paymentStatus = i => ({ Paid: 'Paid', Posted: 'Awaiting payment', Approved: 'Not posted to AP' }[i.status] || '—');
const adjOf = i => db.adjustments.filter(a => a.invoiceId === i.id);
const payable = i => r2(i.gross - sum(adjOf(i).filter(a => a.type === 'Credit'), a => a.amount) + sum(adjOf(i).filter(a => a.type === 'Debit'), a => a.amount));
function buildInvoice(d) {
  const po = getPO(d.poId);
  const inv = { ...d };
  inv.allocs = (d.allocs || []).map(a => ({ ...a, value: r2(a.value) }));
  if (po && po.billingMethod !== 'Standard') inv.net = sum(inv.allocs, a => a.value);
  else inv.net = r2(d.net || 0);
  inv.gstRate = po ? gstOf(po) : GST_DEFAULT;
  inv.discountPct = Math.max(0, +d.discountPct || 0);
  inv.discount = r2(inv.net * inv.discountPct / 100);                 // discount is applied before tax; entitlement consumed stays the undiscounted net
  const taxable = r2(inv.net - inv.discount), calc = r2(taxable * inv.gstRate / 100);
  inv.gst = (d.gstManual === null || d.gstManual === undefined || d.gstManual === '') ? calc : r2(d.gstManual);
  inv.tcs = r2(+d.tcs || 0); inv.roundOff = r2(+d.roundOff || 0);
  inv.gross = r2(taxable + inv.gst + inv.tcs + inv.roundOff);
  return inv;
}

/* ---------- validation gate shared by form, submit and matching ---------- */
function allocErrors(inv) {
  const po = getPO(inv.poId), errs = [], ex = inv.id;
  const add = (code, msg, ref) => errs.push({ code, msg, ref });
  if (!po) return [{ code: 'PO', msg: 'Select an approved purchase order.' }];
  const net = inv.net, poVal = poNet(po);
  if (!(net > 0)) add('NET', po.billingMethod === 'Standard' ? 'Enter an invoice amount greater than zero.' : 'Allocate a quantity/value greater than zero against at least one source.');
  const otherLive = sum(db.invoices.filter(i => i.poId === po.id && isLive(i) && i.id !== ex), i => i.net);
  if (net > 0 && r2(otherLive + net) > poVal + EPS) add('PO_BAL', `Cumulative invoicing would reach ${money(otherLive + net)}, exceeding the PO value ${money(poVal)}. Remaining PO balance: ${money(poVal - otherLive)}.`);
  const items = sourceItems(po, ex);
  if (po.billingMethod === 'Standard') {
    const accepted = sum(items, x => x.entValue);
    if (accepted <= EPS) add('NOT_ELIGIBLE', `No accepted ${recLabel(po)} receipts exist against this PO. Receive and accept first — pending or rejected quantities are not invoice-eligible.`);
    else if (net > 0 && net > accepted - otherLive + EPS) add('OVER_VALUE', `Invoice amount ${money(net)} exceeds the accepted receipt value still unbilled. Accepted receipts: ${money(accepted)}; already invoiced / reserved: ${money(otherLive)}; eligible: ${money(accepted - otherLive)}.`);
    return errs;
  }
  const kindName = po.billingMethod === 'Milestone' ? 'milestone' : (poCertified(po) ? 'progress claim' : recLabel(po));
  if (!inv.allocs.length) add('NO_ALLOC', `Select at least one ${kindName} to invoice against.`);
  const seen = new Set();
  inv.allocs.forEach(a => {
    const key = a.kind + a.refId;
    const it = items.find(x => x.kind === a.kind && x.refId === a.refId);
    if (!it) { add('NO_SOURCE', 'An allocation references a record that does not belong to this PO.'); return; }
    if (seen.has(key)) { add('DUP_ALLOC', `Duplicate allocation: ${it.label} appears more than once on this invoice.`, it.label); return; }
    seen.add(key);
    const isQty = a.kind === 'grn';
    if (isQty ? !(a.qty > 0) : !(a.value > 0)) { add('NET', `Enter ${isQty ? 'a quantity' : 'an amount'} for ${it.label}.`, it.label); return; }
    const byInv = it.invs.length ? it.invs.map(i => `${invRef(i)} (${i.status})`).join(', ') : '';
    if (a.kind === 'milestone') {
      const m = it.ref, gate = msGate(m, po);
      if (m.status !== 'Approved') return add('MS_NOT_APPROVED', `Milestone ${m.code} is not invoice-eligible: status is "${m.status}". Only an approved milestone can be invoiced; a passed due date does not make it eligible.`, it.label);
      if (!gate.ok) return add('GATE', `Milestone ${m.code} is approved but cannot be invoiced yet: ${gate.reason}. Approval does not replace the other acceptance conditions.`, it.label);
      if (!m.allowPartial) {
        if (it.usedValue > EPS) return add('DUP_ALLOC', `Duplicate allocation blocked: milestone ${m.code} (${money(m.amount)}) is already invoiced on ${byInv}. Only one invoice is allowed per milestone.`, it.label);
        if (Math.abs(a.value - m.amount) > EPS) return add('MS_FULL', `Milestone ${m.code} must be invoiced for its full amount (${money(m.amount)}); partial invoicing is not enabled on it. Requested: ${money(a.value)}.`, it.label);
      } else {
        if (it.availValue <= EPS) return add('DUP_ALLOC', `Duplicate allocation blocked: milestone ${m.code} (${money(m.amount)}) is fully invoiced on ${byInv}.`, it.label);
        if (a.value > it.availValue + EPS) return add('OVER_VALUE', `Invoice value exceeds the remaining balance of milestone ${m.code}. Approved ${money(it.entValue)}, already invoiced / reserved ${money(it.usedValue)}, remaining ${money(it.availValue)}. Requested: ${money(a.value)}.`, it.label);
      }
    } else if (a.kind === 'claim') {
      const c = it.ref;
      if (c.status !== 'Certified') return add('NOT_ELIGIBLE', `${c.number} is not invoice-eligible: claim status is "${c.status}". Only certified progress can be invoiced.`, it.label);
      if (it.availValue <= EPS) return add('DUP_ALLOC', `Duplicate allocation blocked: certified value of ${c.number} (${money(it.entValue)}) is already allocated to ${byInv}.`, it.label);
      if (a.value > it.availValue + EPS) return add('OVER_VALUE', `Invoice value exceeds the certified value remaining against ${c.number}. Eligible: ${money(it.availValue)}. Requested: ${money(a.value)}.`, it.label);
    } else if (a.kind === 'grn') {
      if (it.entQty <= 0) return add('NOT_ELIGIBLE', `${it.label} is not invoice-eligible: ${it.reason}.`, it.label);
      if (it.availQty <= EPS) return add('DUP_ALLOC', `Duplicate allocation blocked: all ${fmtNum(it.entQty)} accepted units of ${it.label} are already allocated to ${byInv}.`, it.label);
      if (a.qty > it.availQty + EPS) return add('OVER_QTY', `Invoice quantity exceeds the eligible quantity remaining against ${it.label}. Eligible: ${fmtNum(it.availQty)} units. Requested: ${fmtNum(a.qty)} units.`, it.label);
    } else if (a.kind === 'srn') {
      if (it.entValue <= 0) return add('NOT_ELIGIBLE', `${it.label} is not invoice-eligible: ${it.reason}.`, it.label);
      if (it.availValue <= EPS) return add('DUP_ALLOC', `Duplicate allocation blocked: the accepted value of ${it.label} (${money(it.entValue)}) is already allocated to ${byInv}.`, it.label);
      if (a.value > it.availValue + EPS) return add('OVER_VALUE', `Invoice value exceeds the eligible value remaining against ${it.label}. Eligible: ${money(it.availValue)}. Requested: ${money(a.value)}.`, it.label);
    }
  });
  return errs;
}

/* ---------- matching engine ---------- */
function evaluateInvoice(inv) {
  const po = getPO(inv.poId), sup = po && getSup(po.supplierId), errs = po ? allocErrors(inv) : [];
  const checks = [];
  const C = (key, label, status, detail) => checks.push({ key, label, status, detail });
  const by = (...codes) => errs.filter(e => codes.includes(e.code));
  if (!po) { C('po', 'PO match', 'fail', 'Purchase order not found.'); return { checks, result: 'Blocked' }; }
  C('po', 'PO match', po.status === 'Approved' ? 'pass' : 'fail', po.status === 'Approved' ? `${po.number} is Approved (v${po.version}) · billing method inherited: ${methodLabel(po)}.` : `${po.number} is ${po.status}; only approved POs can be invoiced.`);
  C('supplier', 'Vendor match', inv.supplierId === po.supplierId ? 'pass' : 'fail', inv.supplierId === po.supplierId ? `${sup.name} (${sup.code}) matches the PO vendor.` : 'Invoice vendor differs from the PO vendor.');
  const e1 = by('NOT_ELIGIBLE', 'MS_NOT_APPROVED', 'GATE', 'NO_SOURCE', 'NO_ALLOC', 'DUP_ALLOC');
  const refs = inv.allocs.map(a => { const it = sourceItems(po, inv.id).find(x => x.kind === a.kind && x.refId === a.refId); return it ? it.label : '?'; });
  const eligLabel = po.billingMethod === 'Milestone' ? 'Milestone eligibility' : poCertified(po) ? 'Certified progress eligibility' : `Receipt eligibility (${recLabel(po)})`;
  if (e1.length) C('elig', eligLabel, 'fail', e1.map(e => e.msg).join(' '));
  else if (po.billingMethod === 'Standard') C('elig', eligLabel, 'pass', `Accepted receipts of ${money(sum(sourceItems(po, inv.id), x => x.entValue))} are available on the PO (standard receipt-based matching, no allocation schedule).`);
  else if (po.billingMethod === 'Milestone') C('elig', eligLabel, 'pass', `${refs.join(', ')} approved — ${inv.allocs.some(a => msGate(getMS(a.refId), po).required) ? 'every configured acceptance condition (document approval / accepted GRN / accepted SRN) is satisfied' : 'no extra acceptance condition configured'}.`);
  else C('elig', eligLabel, 'pass', `${refs.join(', ')} accepted and unconsumed — pending and rejected quantities excluded.`);
  const e2 = by('OVER_QTY', 'OVER_VALUE', 'MS_FULL', 'NET');
  if (e2.length) C('qty', 'Quantity / value match', 'fail', e2.map(e => e.msg).join(' '));
  else if (po.billingMethod === 'Standard') C('qty', 'Quantity / value match', 'pass', `Invoice amount ${money(inv.net)} ≤ accepted unbilled receipt value.`);
  else C('qty', 'Quantity / value match', 'pass', `Allocations total ${money(sum(inv.allocs, a => a.value))} = invoice amount ${money(inv.net)}; every allocation is within its remaining eligible ${po.billingMethod === 'Milestone' ? 'milestone balance' : 'quantity/value'}.`);
  const dups = db.invoices.filter(i => i.id !== inv.id && i.supplierId === inv.supplierId && !['Draft', 'Cancelled'].includes(i.status) && String(i.number).trim().toLowerCase() === String(inv.number).trim().toLowerCase());
  C('dup', 'Duplicate invoice check', dups.length ? 'fail' : 'pass', dups.length ? `Bill number "${inv.number}" was already submitted by ${sup.name} as ${dups.map(d => `${invRef(d)} (${d.status})`).join(', ')}.` : `Bill number "${inv.number}" is unique for ${sup.name}.`);
  const otherLive = sum(db.invoices.filter(i => i.poId === po.id && isLive(i) && i.id !== inv.id), i => i.net), poVal = poNet(po);
  const eb = by('PO_BAL');
  C('bal', 'PO remaining balance', eb.length ? 'fail' : 'pass', eb.length ? eb[0].msg : `PO ${money(poVal)} − other live invoices ${money(otherLive)} − this invoice ${money(inv.net)} = ${money(poVal - otherLive - inv.net)} remaining.`);
  const exp = r2((inv.net - (inv.discount || 0)) * inv.gstRate / 100), diff = Math.abs(exp - inv.gst);
  if (inv.gstRate !== gstOf(po)) C('gst', 'GST validation', 'fail', `GST rate ${inv.gstRate}% differs from the ${gstOf(po)}% on the PO.`);
  else if (diff <= 0.01) C('gst', 'GST validation', 'pass', `GST ${money(inv.gst)} = ${inv.gstRate}% of ${money(inv.net - (inv.discount || 0))}; total ${money(inv.gross)}.`);
  else if (diff <= 1) C('gst', 'GST validation', 'warn', `GST ${money(inv.gst)} differs from the computed ${money(exp)} by ${money(diff)} (within the ${money(1)} rounding tolerance).`);
  else C('gst', 'GST validation', 'fail', `GST ${money(inv.gst)} does not equal ${inv.gstRate}% of ${money(inv.net - (inv.discount || 0))} (expected ${money(exp)}, variance ${money(diff)}).`);
  const result = checks.some(c => c.status === 'fail') ? 'Blocked' : checks.some(c => c.status === 'warn') ? 'Partially Matched' : 'Matched';
  C('appr', 'Approval routing', result === 'Blocked' ? 'info' : 'pass', result === 'Blocked' ? 'Not routed — resolve the exceptions above, then re-run matching.' : 'Eligible to route to the AP Manager approval queue.');
  return { checks, result, errors: errs };
}

/* =====================================================================
   Actions (state transitions). All return { ok, msg?, errors?, id? }
   ===================================================================== */
const A = {};
const OK = (msg, extra = {}) => ({ ok: true, msg, ...extra });
const NO = (errors, msg) => ({ ok: false, errors: [].concat(errors), msg: msg || [].concat(errors)[0] });

/* ----- Purchase orders ----- */
function validatePO(d, forSubmit) {
  const errs = [], v = d.lines.reduce((s, l) => s + (+l.qty || 0) * (+l.price || 0), 0);
  if (!['Goods', 'Services', 'Mixed'].includes(d.type)) errs.push('Select the PO type (Goods, Services or Mixed).');
  if (!d.supplierId) errs.push('Select a vendor.');
  if (!String(d.title || '').trim()) errs.push('Enter an order title.');
  if (!d.office) errs.push('Select the billing office.');
  if (!d.poDate) errs.push('PO date is required.');
  if (!d.deliveryDate) errs.push('Delivery date is required.');
  if (d.deliveryDate && d.poDate && d.deliveryDate < d.poDate) errs.push('Delivery date cannot be before the PO date.');
  if (d.endDate && d.deliveryDate && d.endDate < d.deliveryDate) errs.push('End date cannot be before the delivery date.');
  if (!GST_RATES.includes(+d.gstRate)) errs.push('Select a valid GST rate.');
  if (!d.lines.length) errs.push('Add at least one line item.');
  d.lines.forEach((l, i) => {
    if (!String(l.desc || '').trim()) errs.push(`Line ${i + 1}: description is required.`);
    if (!(+l.qty > 0)) errs.push(`Line ${i + 1}: quantity must be greater than zero.`);
    if (l.price === '' || !(+l.price >= 0)) errs.push(`Line ${i + 1}: unit price is required.`);
  });
  if (!d.billingMethod) errs.push('Select a billing method.');
  if (d.billingMethod === 'Progressive' && d.progressBasis === 'Certified' && d.type !== 'Services') errs.push('Certified work progress is only available on Services POs. Use accepted receipts (GRN / SRN) otherwise.');
  const anyGoods = d.type === 'Goods' || (d.type === 'Mixed' && d.lines.some(l => l.kind !== 'Services')), anySvc = d.type === 'Services' || (d.type === 'Mixed' && d.lines.some(l => l.kind === 'Services'));
  if (d.type === 'Mixed' && !(anyGoods && anySvc)) errs.push('A Mixed PO needs at least one goods line and one services line.');
  if (d.billingMethod === 'Milestone') (d.milestones || []).forEach((m, i) => {
    if (m.needsGrn && !anyGoods) errs.push(`M${i + 1}: a GRN requirement needs at least one goods line on the PO.`);
    if (m.needsSrn && !anySvc) errs.push(`M${i + 1}: an SRN requirement needs at least one services line on the PO.`);
    if (m.needsDoc && !String(m.docTitle || '').trim()) errs.push(`M${i + 1}: name the document that must be approved (e.g. Commissioning Certificate).`);
  });
  if (forSubmit) {
    if (!(v > 0)) errs.push('PO value must be greater than zero.');
    if (d.billingMethod === 'Milestone') scheduleCheck(d.milestones, r2(v)).errors.forEach(e => errs.push('Milestone schedule: ' + e));
  }
  return errs;
}
A.savePO = (d, submit) => {
  const errs = validatePO(d, submit);
  if (errs.length) return NO(errs, 'Please fix the highlighted issues.');
  let po = d.id && getPO(d.id), isNew = !po;
  if (po && po.status !== 'Draft') return NO(`${po.number} is ${po.status} — only draft POs can be edited. Use Amend PO for an approved PO.`);
  if (isNew) {
    const seqNo = Math.max(41, ...db.pos.map(p => p.seqNo || 0)) + 1;
    po = { id: uid('po'), seqNo, number: poNumberFor(d.poDate, seqNo), version: 1, amendments: [], approvals: [], createdBy: actor(), createdAt: nowISO() };
    db.pos.push(po);
  }
  Object.assign(po, {
    supplierId: d.supplierId, buyer: d.buyer || 'DICE Manufacturing Pvt Ltd', office: d.office, title: d.title.trim(), poDate: d.poDate, deliveryDate: d.deliveryDate, endDate: d.endDate || '',
    type: d.type, category: d.category, attachments: d.attachments || [], currency: CURRENCY, gstRate: +d.gstRate, billingMethod: d.billingMethod, progressBasis: d.billingMethod === 'Progressive' ? d.progressBasis : 'Receipt',
    overReceiptPct: po.overReceiptPct || 0, status: submit ? 'Pending Approval' : 'Draft',
    lines: d.lines.map((l, i) => ({ id: l.id || uid('ln'), no: i + 1, desc: l.desc.trim(), qty: +l.qty, uom: l.uom, price: +l.price, kind: d.type === 'Mixed' ? (l.kind === 'Services' ? 'Services' : 'Goods') : d.type })),
  });
  db.milestones = db.milestones.filter(m => m.poId !== po.id);          // schedule is only editable while the PO is a draft
  if (po.billingMethod === 'Milestone') {
    const amts = milestoneAmounts(d.milestones, poNet(po));
    d.milestones.forEach((m, i) => db.milestones.push({
      id: m.id || uid('ms'), poId: po.id, seq: i + 1, code: `M${i + 1}`, name: m.name.trim(), pct: +m.pct, amount: amts[i], planned: m.planned || '',
      status: 'Draft', needsDoc: !!m.needsDoc, docTitle: m.needsDoc ? (String(m.docTitle || '').trim() || 'Supporting document') : '', needsGrn: !!m.needsGrn, needsSrn: !!m.needsSrn, allowPartial: !!m.allowPartial, doc: null, grnIds: [], srnIds: [], submissions: [], history: [], evidence: [], remarks: '', actualDate: '', approvedAt: '', rejectReason: '',
    }));
  }
  audit(po.id, po.number, isNew ? `PO created${submit ? ' and submitted for approval' : ' as draft'} — billing method ${po.billingMethod}.` : `PO ${submit ? 'submitted for approval' : 'saved as draft'} (billing method ${po.billingMethod}).`, 'po');
  if (submit) po.approvals.push({ at: nowISO(), by: actor(), action: 'Submitted for approval', note: '' });
  save();
  return OK(submit ? `${po.number} submitted for approval` : `${po.number} saved as draft`, { id: po.id });
};
A.approvePO = id => {
  const po = getPO(id); if (!po || po.status !== 'Pending Approval') return NO('PO is not awaiting approval.');
  po.status = 'Approved';
  msOf(po).forEach(m => { if (m.status === 'Draft') { m.status = 'Pending'; (m.history = m.history || []).push({ at: nowISO(), by: actor(), role: db.meta.role, from: 'Draft', to: 'Pending', note: 'PO approved — milestone schedule approved with it' }); } });
  po.approvals.push({ at: nowISO(), by: actor(), action: 'Approved', note: '' });
  audit(po.id, po.number, `PO approved. Now available for ${recLabel(po)}${po.billingMethod === 'Milestone' ? ' / milestone work' : ''} and invoice selection.`, 'po');
  save(); return OK(`${po.number} approved`);
};
A.rejectPO = (id, reason) => {
  const po = getPO(id); if (!po || po.status !== 'Pending Approval') return NO('PO is not awaiting approval.');
  if (!String(reason || '').trim()) return NO('A rejection reason is required.');
  po.status = 'Rejected'; po.approvals.push({ at: nowISO(), by: actor(), action: 'Rejected', note: reason });
  audit(po.id, po.number, `PO rejected: ${reason}`, 'bad'); save(); return OK(`${po.number} rejected`);
};
A.reopenPO = id => { const po = getPO(id); if (!po || !['Rejected', 'Pending Approval'].includes(po.status)) return NO('Cannot revise this PO.'); po.status = 'Draft'; audit(po.id, po.number, 'PO returned to draft for revision.', 'po'); save(); return OK('PO returned to draft'); };
A.amendPO = (id, { lines, milestones, reason }) => {
  const po = getPO(id); if (!po || po.status !== 'Approved') return NO('Only approved POs can be amended.');
  const errs = [];
  if (!String(reason || '').trim()) errs.push('An amendment reason is required.');
  const before = poNet(po), changes = [];
  const next = po.lines.map(l => { const n = lines.find(x => x.id === l.id) || l; return { ...l, qty: +n.qty, price: +n.price }; });
  next.forEach(n => {
    const o = lineOf(po, n.id), touched = grnsOf(po).some(g => g.lineId === o.id) || srnsOf(po).some(s => s.lineId === o.id) || invsOf(po).some(i => isLive(i));
    if (!(n.qty > 0) || !(n.price >= 0)) errs.push(`Line ${o.no}: enter a valid quantity and price.`);
    if (n.price !== o.price && touched) errs.push(`Line ${o.no}: unit price is locked because receipts or invoices already exist — historical amounts are never rewritten.`);
    if (lineKind(po, o) === 'Goods' && n.qty < lineReceiptStats(po, { ...o, qty: 0 }).active - EPS) errs.push(`Line ${o.no}: quantity cannot drop below the quantity already received/accepted (${fmtNum(lineReceiptStats(po, { ...o, qty: 0 }).active)}).`);
    if (lineKind(po, o) === 'Services' && n.qty * n.price < lineServiceStats(po, { ...o, qty: 1, price: 0 }).active - EPS) errs.push(`Line ${o.no}: value cannot drop below the service value already received (${money(lineServiceStats(po, o).active)}).`);
    if (n.qty !== o.qty) changes.push(`Line ${o.no} quantity ${fmtNum(o.qty)} → ${fmtNum(n.qty)}`);
    if (n.price !== o.price) changes.push(`Line ${o.no} price ${fmtNum(o.price)} → ${fmtNum(n.price)}`);
  });
  const after = sum(next, l => l.qty * l.price);
  const liveInv = sum(invsOf(po).filter(isLive), i => i.net);
  if (after < liveInv - EPS) errs.push(`Amended PO value ${money(after)} cannot be lower than invoices already submitted (${money(liveInv)}).`);
  let plan = null;
  if (po.billingMethod === 'Milestone') {
    const cur = msOf(po);
    const locked = msLocked;
    const merged = cur.map(m => { const n = milestones.find(x => x.id === m.id); if (!n || locked(m)) return { ...m }; return { ...m, name: n.name, pct: +n.pct }; });
    const added = milestones.filter(x => !x.id || String(x.id).startsWith('new')).filter(x => String(x.name || '').trim() && +x.pct > 0).map(x => ({ name: x.name, pct: +x.pct, planned: x.planned || '', needsDoc: !!x.needsDoc, docTitle: x.docTitle || '', needsGrn: !!x.needsGrn, needsSrn: !!x.needsSrn, allowPartial: !!x.allowPartial }));
    added.forEach(x => { if (x.needsGrn && !hasGoods(po)) errs.push(`New milestone "${x.name}": the PO has no goods lines, so it cannot require a GRN.`); if (x.needsSrn && !hasServices(po)) errs.push(`New milestone "${x.name}": the PO has no services lines, so it cannot require an SRN.`); });
    const all = [...merged, ...added];
    const chk = scheduleCheck(all.map(m => m.id && locked(m) ? { ...m, pct: m.amount / after * 100 } : m), after);
    chk.errors.forEach(e => errs.push('Amended schedule: ' + e));
    if (!errs.length) plan = { cur, merged, added, locked };
  }
  if (errs.length) return NO(errs, 'Amendment rejected — see issues.');
  next.forEach(n => { const l = lineOf(po, n.id); l.qty = n.qty; l.price = n.price; });
  if (plan) {
    const { cur, merged, added, locked } = plan;
    const rows = [...merged, ...added];                                         // existing first, then new
    let used = sum(rows.filter(m => m.id && locked(m)), m => m.amount);
    const free = rows.filter(m => !(m.id && locked(m)));
    free.forEach((m, i) => { m.amount = i === free.length - 1 ? r2(after - used) : r2(m.pct * after / 100); used = r2(used + m.amount); });
    cur.forEach(m => { const n = merged.find(x => x.id === m.id); if (!locked(m)) { if (m.name !== n.name || m.amount !== n.amount) changes.push(`${m.code} "${m.name}" amount ${money(m.amount)} → ${money(n.amount)}`); m.name = n.name; m.amount = n.amount; } });
    added.forEach(x => { const seq = msOf(po).length + 1; changes.push(`Added milestone M${seq} "${x.name}" ${money(x.amount)}`);
      db.milestones.push({ id: uid('ms'), poId: po.id, seq, code: `M${seq}`, name: x.name, pct: x.pct, amount: x.amount, planned: x.planned, status: 'Pending', needsDoc: x.needsDoc, docTitle: x.needsDoc ? (String(x.docTitle || '').trim() || 'Supporting document') : '', needsGrn: x.needsGrn, needsSrn: x.needsSrn, allowPartial: x.allowPartial, doc: null, grnIds: [], srnIds: [], submissions: [], history: [{ at: nowISO(), by: actor(), role: db.meta.role, from: '', to: 'Pending', note: `Added by PO amendment v${po.version + 1}` }], evidence: [], remarks: '', actualDate: '', approvedAt: '', rejectReason: '' }); });
    msOf(po).forEach(m => { m.pct = after ? r2(m.amount / after * 100) : 0; });
    /* rescheduling: due dates may move at any time (amounts of locked milestones never do); every move is logged */
    cur.forEach(m => { const n = milestones.find(x => x.id === m.id); if (n && n.planned && n.planned !== m.planned) { changes.push(`${m.code} due date ${fmtD(m.planned)} → ${fmtD(n.planned)}`); (m.history = m.history || []).push({ at: nowISO(), by: actor(), role: db.meta.role, from: m.status, to: m.status, note: `Rescheduled ${fmtD(m.planned)} → ${fmtD(n.planned)} (PO amendment v${po.version + 1}: ${reason})` }); m.planned = n.planned; } });
  }
  po.version += 1;
  po.amendments.unshift({ id: uid('am'), version: po.version, at: nowISO(), by: actor(), reason, changes, valueBefore: before, valueAfter: poNet(po) });
  audit(po.id, po.number, `PO amended to v${po.version} (${money(before)} → ${money(poNet(po))}). ${changes.join('; ') || 'No value change.'} Historical invoice allocations preserved. Reason: ${reason}`, 'po');
  save(); return OK(`${po.number} amended to v${po.version}`);
};

/* ----- GRN (goods PO) ----- */
function finalizeGRN(g) {
  g.status = g.accepted >= g.received - EPS ? 'Accepted' : g.accepted > 0 ? 'Partially Accepted' : 'Rejected';
  g.inspection = g.status === 'Accepted' ? 'Passed' : g.status === 'Partially Accepted' ? 'Partially Passed' : 'Failed';
  g.decidedAt = nowISO(); g.decidedBy = actor();
}
/* d: { poId, lineId, date, received, rejected, remarks, attachments, milestoneId }  mode: 'accept' (delivered − rejected accepted now) | 'inspect' (goes to Pending Inspection) */
A.createGRN = (d, mode = 'accept') => {
  const received = +d.received || 0, rejected = mode === 'accept' ? (+d.rejected || 0) : 0;
  const n = { ...d, received, rejected, accepted: mode === 'accept' ? r2(received - rejected) : 0 };
  const errs = validateGRN(n);
  if (errs.length) return NO(errs);
  const po = getPO(d.poId), seq = db.grns.filter(g => g.poId === po.id).length + 1;
  const g = { id: uid('grn'), poId: po.id, lineId: d.lineId, seq, number: `GRN-${pad(seq)}`, date: d.date || todayISO(), received, accepted: n.accepted, rejected, inspection: 'Pending', remarks: d.remarks || '', attachments: d.attachments || [], status: 'Pending Inspection', reversed: false, milestoneId: null, createdBy: actor(), createdAt: nowISO() };
  db.grns.push(g);
  audit(po.id, g.number, `${g.number} created: ${fmtNum(g.received)} delivered${mode === 'accept' ? `, ${fmtNum(g.accepted)} accepted, ${fmtNum(g.rejected)} rejected` : ' — sent for inspection'}.`, 'grn');
  if (mode === 'accept') { finalizeGRN(g); audit(po.id, g.number, `${g.number} ${g.status.toLowerCase()}: ${fmtNum(g.accepted)} units are now invoice-eligible.`, g.status === 'Rejected' ? 'bad' : 'ok'); }
  if (d.milestoneId) A.msLinkReceipt(d.milestoneId, g.id, true);
  save(); return OK(`${g.number} ${mode === 'accept' ? g.status.toLowerCase() : 'sent for inspection'}`, { id: g.id });
};
A.acceptGRN = id => {
  const g = getGRN(id); if (!g || g.status !== 'Pending Inspection') return NO('GRN is not awaiting inspection.');
  g.accepted = g.received; g.rejected = 0; finalizeGRN(g);
  audit(g.poId, g.number, `${g.number} accepted: ${fmtNum(g.accepted)} units now invoice-eligible.`, 'ok');
  save(); return OK(`${g.number} accepted`);
};
A.recordInspection = (id, accepted, rejected) => {
  const g = getGRN(id); if (!g || g.status !== 'Pending Inspection') return NO('GRN is not awaiting inspection.');
  accepted = +accepted || 0; rejected = +rejected || 0;
  if (accepted < 0 || rejected < 0) return NO('Quantities cannot be negative.');
  if (Math.abs(r2(accepted + rejected) - g.received) > EPS) return NO(`Accepted + rejected must equal the delivered quantity (${fmtNum(g.received)}).`);
  g.accepted = accepted; g.rejected = rejected; finalizeGRN(g);
  audit(g.poId, g.number, `Inspection completed on ${g.number}: ${fmtNum(accepted)} accepted, ${fmtNum(rejected)} rejected → ${g.status}.`, g.status === 'Rejected' ? 'bad' : 'ok'); save(); return OK(`${g.number} ${g.status.toLowerCase()}`);
};
A.rejectGRN = (id, reason) => {
  const g = getGRN(id); if (!g || g.status !== 'Pending Inspection') return NO('GRN is not awaiting inspection.');
  if (!String(reason || '').trim()) return NO('A rejection reason is required.');
  g.rejected = g.received; g.accepted = 0; g.status = 'Rejected'; g.inspection = 'Failed'; g.remarks = (g.remarks ? g.remarks + ' · ' : '') + 'Rejected: ' + reason;
  audit(g.poId, g.number, `${g.number} rejected: ${reason}`, 'bad'); save(); return OK(`${g.number} rejected`);
};
A.reverseGRN = (id, reason) => {
  const g = getGRN(id); if (!g || !GRN_OK.includes(g.status) || g.reversed) return NO('Only accepted GRNs can be reversed.');
  if (!String(reason || '').trim()) return NO('A reversal reason is required.');
  g.reversed = true; g.reverseReason = reason; g.reversedAt = nowISO();
  const hit = usage('grn', g.id), ms = g.milestoneId && getMS(g.milestoneId);
  audit(g.poId, g.number, `${g.number} reversed (${reason}). Eligible balance reduced by ${fmtNum(g.accepted)} units. History preserved.${hit.invs.length ? ` In-flight invoices ${hit.invs.map(invRef).join(', ')} now rely on an invalidated receipt — re-run matching.` : ''}${ms ? ` Milestone ${ms.code} no longer has an accepted GRN.` : ''}`, 'bad');
  save(); return OK(`${g.number} reversed`);
};

/* ----- SRN (services PO) ----- */
/* d: { poId, lineId, date, description, serviceValue, remarks, attachments, milestoneId }  mode: 'accept' | 'submit' (pending acceptance) */
A.createSRN = (d, mode = 'submit') => {
  const n = { ...d, serviceValue: r2(d.serviceValue || 0) };
  const errs = validateSRN(n); if (errs.length) return NO(errs);
  const po = getPO(d.poId), seq = db.srns.filter(s => s.poId === po.id).length + 1;
  const s = { id: uid('srn'), poId: po.id, lineId: d.lineId, seq, number: `SRN-${pad(seq)}`, date: d.date || todayISO(), description: d.description.trim(), serviceValue: n.serviceValue, acceptedValue: 0, status: 'Pending Acceptance', remarks: d.remarks || '', attachments: d.attachments || [], milestoneId: null, createdBy: actor(), createdAt: nowISO() };
  db.srns.push(s);
  audit(po.id, s.number, `${s.number} created for ${money(s.serviceValue)} — pending acceptance.`, 'srn');
  if (mode === 'accept') A.acceptSRN(s.id, s.serviceValue, true);
  if (d.milestoneId) A.msLinkReceipt(d.milestoneId, s.id, true);
  save(); return OK(`${s.number} ${mode === 'accept' ? 'accepted' : 'submitted for acceptance'}`, { id: s.id });
};
A.acceptSRN = (id, acceptedValue, quiet) => {
  const s = getSRN(id); if (!s || s.status !== 'Pending Acceptance') return NO('SRN is not awaiting acceptance.');
  const v = r2(acceptedValue ?? s.serviceValue);
  if (!(v > 0) || v > s.serviceValue + EPS) return NO(`Accepted value must be between 0 and ${money(s.serviceValue)}.`);
  s.acceptedValue = v; s.status = v >= s.serviceValue - EPS ? 'Accepted' : 'Partially Accepted'; s.decidedAt = nowISO(); s.decidedBy = actor();
  audit(s.poId, s.number, `${s.number} ${s.status.toLowerCase()} for ${money(v)}. Service receipt balance updated.${s.milestoneId ? ' (Milestone approval is a separate record and is unchanged.)' : ''}`, 'ok'); if (!quiet) save(); return OK(`${s.number} ${s.status.toLowerCase()}`);
};
A.rejectSRN = (id, reason) => {
  const s = getSRN(id); if (!s || s.status !== 'Pending Acceptance') return NO('SRN is not awaiting acceptance.');
  if (!String(reason || '').trim()) return NO('A rejection reason is required.');
  s.status = 'Rejected'; s.rejectReason = reason; audit(s.poId, s.number, `${s.number} rejected: ${reason}`, 'bad'); save(); return OK(`${s.number} rejected`);
};

/* ----- Milestones: Pending → In Progress → Submitted for Approval → Under Review → Approved | Rejected (→ resubmit) ----- */
const msRef = (po, m) => `${po.number} / ${m.code}`;
function msMove(m, po, to, note, kind) {
  (m.history = m.history || []).push({ at: nowISO(), by: actor(), role: db.meta.role, from: m.status, to, note: note || '' });
  m.status = to; audit(po.id, msRef(po, m), `Milestone ${m.code} "${m.name}" → ${to}${note ? ': ' + note : ''}.`, kind || 'ms');
}
/* segregation of duties (PRD UC-19): whoever submitted the evidence cannot review, approve or reject it. Demo Admin acts for every role and is exempt. */
const msSod = m => db.meta.role !== 'admin' && m.submittedRole === db.meta.role ? NO(`Segregation of duties: ${m.submittedBy} submitted ${m.code}, so the same role cannot review or decide on it. Switch to another approver role.`) : null;
const msCtx = id => { const m = getMS(id), po = m && getPO(m.poId); return { m, po }; };
A.msStart = id => {
  const { m, po } = msCtx(id); if (!m || !po) return NO('Milestone not found.');
  if (po.status !== 'Approved') return NO('The PO must be approved first.');
  if (m.status !== 'Pending') return NO(`${m.code} is ${m.status} — only a Pending milestone can be started.`);
  msMove(m, po, 'In Progress', 'work started'); m.startedAt = nowISO(); m.startedBy = actor(); save(); return OK(`${m.code} is now in progress`);
};
/* files = the evidence the supplier uploads (mandatory when the milestone requires a document) */
A.msSubmit = (id, { actualDate, remarks, files } = {}) => {
  const { m, po } = msCtx(id); if (!m || !po) return NO('Milestone not found.');
  if (po.status !== 'Approved') return NO('The PO must be approved first.');
  if (!['Pending', 'In Progress', 'Rejected'].includes(m.status)) return NO(`${m.code} is ${m.status} — it cannot be submitted now.`);
  const errs = [], fl = files || [];
  if (!actualDate) errs.push('Completion date is required.');
  if (m.needsDoc && !fl.length) errs.push(`Upload the ${docTitleOf(m)} — it is mandatory for ${m.code}.`);
  if (errs.length) return NO(errs);
  const v = (m.submissions || []).length + 1, resub = m.status === 'Rejected';
  (m.submissions = m.submissions || []).push({ v, at: nowISO(), by: actor(), role: db.meta.role, files: [...fl], remarks: remarks || '', actualDate, status: 'Submitted' });
  Object.assign(m, { actualDate, remarks: remarks || '', evidence: [...fl], rejectReason: '', submittedBy: actor(), submittedRole: db.meta.role, submittedAt: nowISO(), reviewedBy: '', reviewedAt: '' });
  if (m.needsDoc) m.doc = { files: [...fl], remarks: remarks || '', status: 'Pending Approval', version: v, uploadedBy: actor(), uploadedRole: db.meta.role, uploadedAt: nowISO() };
  msMove(m, po, 'Submitted for Approval', `${resub ? 'resubmitted' : 'submitted'} (submission ${v}) with ${fl.length} file(s)${m.needsDoc ? ' incl. the ' + docTitleOf(m) : ''}`);
  save(); return OK(`${m.code} ${resub ? 'resubmitted' : 'submitted'} for approval`);
};
A.msStartReview = id => {
  const { m, po } = msCtx(id); if (!m || !po) return NO('Milestone not found.');
  if (m.status !== 'Submitted for Approval') return NO(`${m.code} is ${m.status} — there is nothing waiting to be reviewed.`);
  const sod = msSod(m); if (sod) return sod;
  m.reviewedBy = actor(); m.reviewedAt = nowISO(); msMove(m, po, 'Under Review', 'review started'); save(); return OK(`${m.code} is now under review`);
};
A.msApprove = (id, note) => {
  const { m, po } = msCtx(id); if (!m || !po) return NO('Milestone not found.');
  if (po.status !== 'Approved') return NO('The PO must be approved first.');
  if (!['Submitted for Approval', 'Under Review'].includes(m.status)) return NO(`${m.code} is ${m.status} — only a submitted milestone can be approved.`);
  const sod = msSod(m); if (sod) return sod;
  if (!m.reviewedBy) { m.reviewedBy = actor(); m.reviewedAt = nowISO(); }
  m.approvedAt = nowISO(); m.approvedBy = actor(); m.rejectReason = '';
  const last = (m.submissions || [])[(m.submissions || []).length - 1]; if (last) Object.assign(last, { status: 'Approved', decidedBy: actor(), decidedAt: nowISO() });
  if (m.needsDoc && m.doc) Object.assign(m.doc, { status: 'Approved', decidedBy: actor(), decidedAt: nowISO(), rejectReason: '' });
  const g = msGate(m, po);
  msMove(m, po, 'Approved', `${note ? note + ' — ' : ''}${g.ok ? money(m.amount) + ' is now invoice-eligible' : 'still blocked for invoicing: ' + g.reason}`, 'ok'); save();
  return OK(g.ok ? `${m.code} approved — ${money(m.amount)} is now invoice-eligible` : `${m.code} approved — invoicing stays blocked until: ${g.reason}`);
};
A.msReject = (id, reason) => {
  const { m, po } = msCtx(id); if (!m || !po) return NO('Milestone not found.');
  if (!['Submitted for Approval', 'Under Review'].includes(m.status)) return NO(`${m.code} is ${m.status} — only a submitted milestone can be rejected.`);
  if (!String(reason || '').trim()) return NO('A rejection reason is required.');
  const sod = msSod(m); if (sod) return sod;
  const last = (m.submissions || [])[(m.submissions || []).length - 1]; if (last) Object.assign(last, { status: 'Rejected', decidedBy: actor(), decidedAt: nowISO(), reason });
  if (m.needsDoc && m.doc) Object.assign(m.doc, { status: 'Rejected', decidedBy: actor(), decidedAt: nowISO(), rejectReason: reason });
  m.rejectReason = reason; msMove(m, po, 'Rejected', reason, 'bad'); save(); return OK(`${m.code} rejected — the supplier can resubmit`);
};
/* link a GRN / SRN to a milestone (a milestone may have several; one receipt backs only one milestone) */
A.msLinkReceipt = (msId, recId, quiet) => {
  const { m, po } = msCtx(msId); if (!m) return NO('Milestone not found.');
  const g = getGRN(recId), sn = g ? null : getSRN(recId), r = g || sn, kind = g ? 'grn' : 'srn', L = kind.toUpperCase();
  if (!r || r.poId !== po.id) return NO(`Select a GRN / SRN that belongs to this PO.`);
  if (!(kind === 'grn' ? m.needsGrn : m.needsSrn)) return NO(`${m.code} is not configured to require a ${L}.`);
  if (r.milestoneId && r.milestoneId !== m.id) return NO(`${r.number} is already linked to ${getMS(r.milestoneId)?.code || 'another milestone'}. A receipt can support only one milestone.`);
  const list = kind === 'grn' ? (m.grnIds = m.grnIds || []) : (m.srnIds = m.srnIds || []);
  if (list.includes(r.id)) return NO(`${r.number} is already linked to ${m.code}.`);
  list.push(r.id); r.milestoneId = m.id;
  audit(po.id, msRef(po, m), `Milestone ${m.code} linked to ${r.number} (${r.reversed ? 'Reversed' : r.status}).`, 'ms');
  if (!quiet) save(); return OK(`Linked ${r.number} to ${m.code}`);
};
A.msUnlinkReceipt = (msId, recId) => {
  const { m, po } = msCtx(msId); if (!m) return NO('Milestone not found.');
  if (usage('milestone', m.id).value > EPS) return NO(`${m.code} already has invoices against it — its receipts can no longer be unlinked.`);
  const r = getGRN(recId) || getSRN(recId); if (!r) return NO('Receipt not found.');
  m.grnIds = (m.grnIds || []).filter(x => x !== recId); m.srnIds = (m.srnIds || []).filter(x => x !== recId); r.milestoneId = null;
  audit(po.id, msRef(po, m), `${r.number} unlinked from milestone ${m.code}.`, 'ms'); save(); return OK(`${r.number} unlinked`);
};

/* ----- Certified progress claims (Services POs, tracked at PO level) ----- */
A.createClaim = d => {
  const po = getPO(d.poId); if (!po || !poCertified(po)) return NO('Select a Services PO that bills on certified work progress.');
  if (po.status !== 'Approved') return NO(`${po.number} is ${po.status}. Claims can only be raised against an approved PO.`);
  const contract = poNet(po), prev = cumCertified(po), errs = [];
  const cum = r2(d.claimedCum);
  if (!String(d.period || '').trim()) errs.push('Enter the claim period.');
  if (db.claims.some(c => c.poId === po.id && c.status === 'Submitted')) errs.push('An earlier claim is still awaiting certification. Certify or reject it before raising the next one.');
  if (!(cum > prev + EPS)) errs.push(`New cumulative claimed value must be greater than the previously certified cumulative value (${money(prev)}). The vendor must not re-claim value that is already certified.`);
  if (cum > contract + EPS) errs.push(`Cumulative claimed value ${money(cum)} exceeds the PO value ${money(contract)}.`);
  if (!(d.evidence || []).length) errs.push('Attach supporting evidence (measurement sheets / site reports).');
  if (errs.length) return NO(errs);
  const seq = db.claims.filter(c => c.poId === po.id).length + 1;
  const c = { id: uid('pc'), poId: po.id, seq, number: `PC-${pad(seq)}`, period: d.period, prevCum: prev, claimedCum: cum, certified: 0, evidence: d.evidence || [], status: 'Submitted', remarks: d.remarks || '', createdAt: nowISO() };
  db.claims.push(c);
  audit(po.id, c.number, `${c.number} submitted for certification: cumulative ${money(cum)} − previously certified ${money(prev)} = current claim ${money(cum - prev)}.`, 'claim'); save();
  return OK(`${c.number} submitted for certification`, { id: c.id });
};
A.certifyClaim = (id, value) => {
  const c = getClaim(id); if (!c || c.status !== 'Submitted') return NO('Claim is not awaiting certification.');
  const po = getPO(c.poId), prev = cumCertified(po, c.id), cur = r2(c.claimedCum - prev), v = r2(value ?? cur);
  if (!(cur > EPS)) return NO('Nothing left to certify — the claimed cumulative value is already covered by earlier certificates.');
  if (!(v > 0) || v > cur + EPS) return NO(`Certified value must be between 0 and the current claim ${money(cur)} (cumulative ${money(c.claimedCum)} − previously certified ${money(prev)}).`);
  c.prevCum = prev; c.certified = v; c.status = 'Certified'; c.certifiedAt = nowISO(); c.certifiedBy = actor();
  audit(po.id, c.number, `${c.number} certified for ${money(v)} (cumulative certified now ${money(prev + v)}). Only this newly certified, unconsumed value is invoice-eligible.`, 'ok'); save(); return OK(`${c.number} certified for ${money(v)}`);
};
A.rejectClaim = (id, reason) => { const c = getClaim(id); if (!c || c.status !== 'Submitted') return NO('Claim is not awaiting certification.'); if (!String(reason || '').trim()) return NO('A rejection reason is required.'); c.status = 'Rejected'; c.rejectReason = reason; audit(c.poId, c.number, `${c.number} rejected: ${reason}`, 'bad'); save(); return OK(`${c.number} rejected`); };

/* ----- Invoices ----- */
function setLive(inv, wasLive) {
  const now = isLive(inv);
  if (now && !wasLive) inv.allocs.forEach(a => audit(inv.poId, invRef(inv), `Allocation reserved: ${allocText(a)} → ${invRef(inv)}.`, 'alloc'));
  if (!now && wasLive) inv.allocs.forEach(a => audit(inv.poId, invRef(inv), `Allocation released: ${allocText(a)} returned to eligible balance (${invRef(inv)} ${inv.status}).`, 'alloc'));
}
function allocText(a) {
  const src = a.kind === 'grn' ? getGRN(a.refId) : a.kind === 'srn' ? getSRN(a.refId) : a.kind === 'milestone' ? getMS(a.refId) : getClaim(a.refId);
  const l = a.kind === 'milestone' ? src.code : src.number;
  return a.kind === 'grn' ? `${fmtNum(a.qty)} units of ${l} (${money(a.value)})` : `${money(a.value)} of ${l}`;
}
function setStatus(inv, to, note) {
  const was = isLive(inv), from = inv.status; inv.status = to; setLive(inv, was);
  inv.history.push({ at: nowISO(), by: actor(), from, to, note: note || '' });
}
A.saveInvoice = (d, mode) => {                  // mode: 'draft' | 'submit'
  const po = getPO(d.poId), errs = [];
  if (!po) return NO('Select a purchase order.');
  if (!poAllocatable(po)) return NO(`${po.number} is ${po.status}. Only approved POs can be invoiced.`);
  const b = buildInvoice({ ...d, supplierId: po.supplierId, method: po.billingMethod });
  if (!String(b.number || '').trim()) errs.push('Enter the bill number.');
  if (!b.date) errs.push('Enter the bill date.');
  if (b.dueDate && b.date && b.dueDate < b.date) errs.push('Due date cannot be before the bill date.');
  if (d.discountPct !== '' && d.discountPct != null && (+d.discountPct < 0 || +d.discountPct > 100)) errs.push('Discount percent must be between 0 and 100.');
  const ca = (d.costAlloc && d.costAlloc.rows || []).filter(r => r.dept || +r.pct);
  if (ca.length && Math.abs(sum(ca, r => +r.pct) - 100) > 0.0001) errs.push(`Cost allocation percentages total ${fmtNum(sum(ca, r => +r.pct))}% — they must total 100%.`);
  if (mode === 'submit') allocErrors(b).forEach(e => errs.push(e.msg));
  else if (!(b.net > 0)) errs.push('Enter an amount or allocation before saving.');
  if (errs.length) return NO(errs, mode === 'submit' ? 'Submission blocked by the validation gate.' : 'Cannot save draft.');
  let inv = d.id && getInv(d.id);
  if (inv && !['Draft', 'Matching Failed'].includes(inv.status)) return NO('Only draft or failed invoices can be edited.');
  if (!inv) {
    db.seq.inv += 1;
    inv = { id: uid('inv'), seq: db.seq.inv, ref: `INV-${pad(db.seq.inv, 4)}`, status: 'Draft', history: [], approvals: [], createdAt: nowISO(), createdBy: actor() };
    db.invoices.push(inv);
  }
  const was = isLive(inv);
  Object.assign(inv, { number: b.number.trim(), supplierId: po.supplierId, poId: po.id, method: po.billingMethod, date: b.date, dueDate: b.dueDate || '', net: b.net, gstRate: b.gstRate, discountPct: b.discountPct, discount: b.discount, gst: b.gst, tcs: b.tcs, roundOff: b.roundOff, gross: b.gross, gstCredit: !!d.gstCredit, createAsn: !!d.createAsn, costAlloc: d.costAlloc || { type: '', rows: [] }, remarks: d.remarks || '', attachments: d.attachments || [], allocs: b.allocs.map(a => ({ id: a.id || uid('al'), kind: a.kind, refId: a.refId, qty: a.qty ?? null, value: a.value })) });
  if (mode === 'draft') { audit(po.id, invRef(inv), `${invRef(inv)} saved as draft (no allocation reserved).`, 'inv'); save(); return OK(`${invRef(inv)} saved as draft`, { id: inv.id }); }
  inv.submittedAt = nowISO();
  setStatus(inv, 'Submitted', 'Submitted by vendor'); audit(po.id, invRef(inv), `${invRef(inv)} (bill no. ${inv.number}) submitted for ${money(inv.gross)} total.`, 'inv');
  setStatus(inv, 'Pending Matching');
  if (d.autoMatch !== false) A.runMatching(inv.id, true);
  save(); return OK(`${invRef(inv)} submitted`, { id: inv.id });
};
A.runMatching = (id, quiet) => {
  const inv = getInv(id); if (!inv) return NO('Invoice not found.');
  if (!['Submitted', 'Pending Matching', 'Matching Failed', 'Pending Approval'].includes(inv.status)) return NO(`Matching cannot run on a ${inv.status} invoice.`);
  const ev = evaluateInvoice({ ...inv, allocs: inv.allocs });
  inv.match = { at: nowISO(), by: actor(), result: ev.result, checks: ev.checks };
  const target = ev.result === 'Blocked' ? 'Matching Failed' : 'Pending Approval';
  if (inv.status !== target) setStatus(inv, target, `Matching: ${ev.result}`);
  audit(inv.poId, invRef(inv), `Matching run on ${invRef(inv)}: ${ev.result}${ev.result === 'Blocked' ? ' — ' + ev.checks.filter(c => c.status === 'fail').map(c => c.label).join(', ') : '. Routed to AP Manager approval.'}`, ev.result === 'Blocked' ? 'bad' : 'ok');
  if (!quiet) save();
  return OK(ev.result === 'Blocked' ? 'Matching failed — invoice blocked' : `Matching ${ev.result.toLowerCase()} — routed for approval`, { result: ev.result });
};
A.approveInvoice = (id, note) => {
  const inv = getInv(id); if (!inv || inv.status !== 'Pending Approval') return NO('Invoice is not pending approval.');
  const ev = evaluateInvoice(inv);                             // re-validate against the live balances
  if (ev.result === 'Blocked') { inv.match = { at: nowISO(), by: actor(), result: ev.result, checks: ev.checks }; setStatus(inv, 'Matching Failed', 'Re-validation at approval failed'); audit(inv.poId, invRef(inv), `Approval blocked: re-validation failed — ${ev.checks.filter(c => c.status === 'fail').map(c => c.detail).join(' ')}`, 'bad'); save(); return NO(ev.checks.filter(c => c.status === 'fail').map(c => c.detail), 'Approval blocked — invoice no longer matches current balances.'); }
  setStatus(inv, 'Approved', note); inv.approvals.push({ at: nowISO(), by: actor(), action: 'Approved', note: note || '' });
  audit(inv.poId, invRef(inv), `${invRef(inv)} approved by AP Manager${note ? ': ' + note : ''}.`, 'ok'); save(); return OK(`${invRef(inv)} approved`);
};
A.rejectInvoice = (id, reason) => {
  const inv = getInv(id); if (!inv || inv.status !== 'Pending Approval') return NO('Invoice is not pending approval.');
  if (!String(reason || '').trim()) return NO('A rejection reason is required.');
  setStatus(inv, 'Rejected', reason); inv.approvals.push({ at: nowISO(), by: actor(), action: 'Rejected', note: reason });
  audit(inv.poId, invRef(inv), `${invRef(inv)} rejected: ${reason}`, 'bad'); save(); return OK(`${invRef(inv)} rejected — allocations released`);
};
A.cancelInvoice = (id, reason) => {
  const inv = getInv(id); if (!inv || !['Draft', 'Submitted', 'Pending Matching', 'Matching Failed', 'Pending Approval', 'Approved'].includes(inv.status)) return NO('This invoice can no longer be cancelled (post-AP reversals use credit notes).');
  setStatus(inv, 'Cancelled', reason); audit(inv.poId, invRef(inv), `${invRef(inv)} cancelled${reason ? ': ' + reason : ''}.`, 'bad'); save(); return OK(`${invRef(inv)} cancelled`);
};
A.postInvoice = id => {
  const inv = getInv(id); if (!inv || inv.status !== 'Approved') return NO('Only approved invoices can be posted to AP.');
  db.seq.apv += 1; inv.ap = { postedAt: nowISO(), postedBy: actor(), voucher: `APV-2026-${pad(db.seq.apv, 4)}` };
  setStatus(inv, 'Posted', 'Simulated AP posting'); audit(inv.poId, invRef(inv), `${invRef(inv)} posted to AP as ${inv.ap.voucher} (simulated — no ERP update).`, 'ok'); save(); return OK(`Posted as ${inv.ap.voucher} (simulated)`);
};
A.payInvoice = id => {
  const inv = getInv(id); if (!inv || inv.status !== 'Posted') return NO('Only posted invoices can be marked as paid.');
  db.seq.pay += 1; inv.ap.paidAt = nowISO(); inv.ap.payRef = `DEMO-PAY-${pad(db.seq.pay, 4)}`;
  setStatus(inv, 'Paid', 'Marked paid for demo'); audit(inv.poId, invRef(inv), `${invRef(inv)} marked as paid (demo only — no bank payment executed), ref ${inv.ap.payRef}.`, 'ok'); save(); return OK(`${invRef(inv)} marked paid (demo)`);
};
/* Posted / paid invoices are never deleted: a reversal issues a full credit note and RELEASES the allocation back to the receipt / milestone balance (PRD §12.2: Committed → Reversed) */
A.reverseInvoice = (id, reason) => {
  const inv = getInv(id); if (!inv || !['Posted', 'Paid'].includes(inv.status) || inv.reversed) return NO('Only a posted or paid invoice that has not been reversed can be reversed. Earlier invoices are cancelled or rejected instead.');
  if (!String(reason || '').trim()) return NO('A reversal reason is required.');
  const amt = payable(inv); if (amt > EPS) db.adjustments.push({ id: uid('adj'), invoiceId: inv.id, type: 'Credit', amount: amt, reason: `Reversal: ${reason}`, at: nowISO(), by: actor() });
  inv.reversed = { at: nowISO(), by: actor(), reason }; inv.history.push({ at: nowISO(), by: actor(), from: inv.status, to: inv.status + ' (reversed)', note: reason });
  inv.allocs.forEach(a => audit(inv.poId, invRef(inv), `Allocation reversed: ${allocText(a)} returned to the eligible balance (${invRef(inv)} reversed by credit note — ${reason}).`, 'alloc'));
  audit(inv.poId, invRef(inv), `${invRef(inv)} reversed via credit note of ${money(amt)}: ${reason}.`, 'bad'); save(); return OK(`${invRef(inv)} reversed — allocations released`);
};
A.addAdjustment = (id, { type, amount, reason }) => {
  const inv = getInv(id); if (!inv || !APPROVED.includes(inv.status)) return NO('Adjustments apply to approved, posted or paid invoices.');
  amount = r2(amount); if (!(amount > 0)) return NO('Enter an amount greater than zero.'); if (!String(reason || '').trim()) return NO('A reason is required.');
  if (type === 'Credit' && amount > payable(inv) + EPS) return NO(`Credit note cannot exceed the payable amount ${money(payable(inv))}.`);
  db.adjustments.push({ id: uid('adj'), invoiceId: inv.id, type, amount, reason, at: nowISO(), by: actor() });
  audit(inv.poId, invRef(inv), `${type} note of ${money(amount)} recorded against ${invRef(inv)} (${reason}). Receipt/milestone entitlements are NOT restored automatically.`, 'inv'); save(); return OK(`${type} note recorded`);
};
