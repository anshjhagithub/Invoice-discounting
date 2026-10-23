/* =====================================================================
   logic.js — derived balances, validation, matching engine, state transitions
   No DOM access. Every balance shown anywhere in the UI is computed here
   from the underlying records (nothing is hard-coded into screens).
   ===================================================================== */
const LIVE = ['Submitted', 'Pending Matching', 'Pending Approval', 'Approved', 'Posted', 'Paid'];   // invoice states that hold an allocation
const APPROVED = ['Approved', 'Posted', 'Paid'];
const GRN_OK = ['Accepted', 'Partially Accepted'];
const SRN_OK = ['Accepted', 'Partially Accepted'];
const isLive = i => LIVE.includes(i.status);

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
const poCertified = po => po.billingMethod === 'Progressive' && po.progressBasis === 'Certified';
const methodLabel = po => po.billingMethod === 'Progressive' ? (poCertified(po) ? 'Progressive · Certified progress' : 'Progressive · Receipt-based') : po.billingMethod;
const grnLabel = g => g.number;
const msFull = m => `${m.code} — ${m.name}`;

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

/* ---------- goods receipts ---------- */
const grnEnt = g => (GRN_OK.includes(g.status) && !g.reversed) ? g.accepted : 0;
const grnPending = g => r2(g.received - g.accepted - g.rejected);
const grnActiveQty = g => g.reversed || g.status === 'Draft' ? 0 : (['Accepted', 'Partially Accepted', 'Rejected'].includes(g.status) ? g.accepted : g.received);
function lineReceiptStats(po, line, exGrnId) {
  const gs = grnsOf(po).filter(g => g.lineId === line.id && g.id !== exGrnId);
  const active = sum(gs, grnActiveQty);
  const maxQty = r2(line.qty * (1 + (po.overReceiptPct || 0) / 100));
  return {
    ordered: line.qty, maxQty, active, remaining: r2(Math.max(0, maxQty - active)),
    receivedQty: sum(gs.filter(g => g.status !== 'Draft' && !g.reversed), g => g.received),
    acceptedQty: sum(gs, grnEnt), rejectedQty: sum(gs.filter(g => !g.reversed && g.status !== 'Draft'), g => g.rejected),
    pendingQty: sum(gs.filter(g => ['Submitted', 'Pending Inspection'].includes(g.status)), g => g.received),
  };
}
function validateGRN(d) {
  const po = getPO(d.poId), errs = [];
  if (!po) return ['Select an approved goods purchase order.'];
  const line = lineOf(po, d.lineId);
  if (!line) return ['Select a PO line.'];
  const st = lineReceiptStats(po, line, d.id);
  if (!(d.received > 0)) errs.push('Current received quantity must be greater than zero.');
  if (d.received > st.remaining + EPS) errs.push(`Received quantity (${fmtNum(d.received)}) exceeds the remaining PO quantity (${fmtNum(st.remaining)} ${line.uom}). Over-receipt tolerance configured: ${po.overReceiptPct || 0}%.`);
  if (d.accepted < 0 || d.rejected < 0) errs.push('Accepted and rejected quantities cannot be negative.');
  if (r2(d.accepted + d.rejected) > d.received + EPS) errs.push(`Accepted (${fmtNum(d.accepted)}) + rejected (${fmtNum(d.rejected)}) cannot exceed received quantity (${fmtNum(d.received)}).`);
  if (!d.location) errs.push('Select the receiving warehouse / location.');
  return errs;
}

/* ---------- service receipts ---------- */
const srnActive = s => s.status === 'Draft' || s.status === 'Rejected' ? 0 : (SRN_OK.includes(s.status) ? s.acceptedValue : s.serviceValue);
const srnEnt = s => SRN_OK.includes(s.status) ? s.acceptedValue : 0;
function lineServiceStats(po, line, exId) {
  const ss = srnsOf(po).filter(s => s.lineId === line.id && s.id !== exId);
  return { total: lineNet(line), active: sum(ss, srnActive), remaining: r2(Math.max(0, lineNet(line) - sum(ss, srnActive))) };
}
function validateSRN(d) {
  const po = getPO(d.poId), errs = [];
  if (!po) return ['Select an approved PO.'];
  const line = lineOf(po, d.lineId); if (!line) return ['Select a PO line.'];
  const st = lineServiceStats(po, line, d.id);
  if (!(d.serviceValue > 0)) errs.push('Service value must be greater than zero.');
  if (d.serviceValue > st.remaining + EPS) errs.push(`Service value ${money(d.serviceValue)} exceeds the remaining PO line value ${money(st.remaining)}.`);
  if (!String(d.description || '').trim()) errs.push('Describe the service received.');
  if (d.milestoneId) { const m = getMS(d.milestoneId); if (!m || m.poId !== po.id) errs.push('Linked milestone does not belong to this PO.'); }
  return errs;
}

/* ---------- milestones ---------- */
function msGate(m, po) {
  if (!m.srnRequired) return { ok: true, required: false, reason: '' };
  const s = m.srnId && getSRN(m.srnId);
  if (!s) return { ok: false, required: true, reason: 'accepted SRN required — none linked yet' };
  if (s.status === 'Accepted') return { ok: true, required: true, srn: s, reason: '' };
  return { ok: false, required: true, srn: s, reason: `linked ${s.number} is ${s.status} (must be Accepted)` };
}
const msEnt = (m, po) => (m.status === 'Approved' && msGate(m, po).ok) ? m.amount : 0;
function msBilling(m, po) {
  const u = usage('milestone', m.id), ent = msEnt(m, po);
  if (u.value >= m.amount - EPS && m.amount > 0) return 'Invoiced';
  if (u.value > EPS) return 'Partially Invoiced';
  return ent > 0 ? 'Eligible' : 'Not Eligible';
}
function scheduleCheck(ms, poValue, mode, exception) {
  const errs = [];
  const amt = m => mode === 'percent' ? r2((Number(m.pct) || 0) * poValue / 100) : r2(Number(m.amount) || 0);
  const total = sum(ms, amt), pctTotal = r2(ms.reduce((s, m) => s + (Number(m.pct) || 0), 0));
  if (!ms.length) errs.push('Add at least one milestone.');
  ms.forEach(m => { if (!String(m.name || '').trim()) errs.push(`${m.code}: milestone name is required.`); if (!(amt(m) > 0)) errs.push(`${m.code}: amount must be greater than zero.`); });
  if (total > poValue + EPS) errs.push(`Schedule total ${money(total)} exceeds the PO value ${money(poValue)} by ${money(total - poValue)}.`);
  else if (mode === 'percent' && Math.abs(pctTotal - 100) > 0.0001) errs.push(`Percentage schedule totals ${fmtNum(pctTotal)}% — it must total exactly 100% of the PO value.`);
  else if (mode === 'fixed' && Math.abs(total - poValue) > EPS && !(exception && exception.allow && String(exception.note || '').trim())) errs.push(`Fixed-amount schedule totals ${money(total)} but the PO value is ${money(poValue)}. Balance ${money(poValue - total)} — fix the amounts or record an explicit exception with a reason.`);
  return { total, pctTotal, errors: errs, ok: !errs.length, amt };
}

/* ---------- certified progress claims ---------- */
const cumCertified = (po, exId) => sum(claimsOf(po).filter(c => c.status === 'Certified' && c.id !== exId), c => c.certified);
function claimView(c) {
  const po = getPO(c.poId);
  const prev = c.status === 'Certified' ? c.prevCum : cumCertified(po, c.id);
  const current = r2(c.claimedCum - prev);
  const u = usage('claim', c.id);
  const gateOk = !po.requireSrn || (c.srnId && getSRN(c.srnId)?.status === 'Accepted');
  const ent = (c.status === 'Certified' && gateOk) ? c.certified : 0;
  return { prev, current, cum: c.claimedCum, certified: c.status === 'Certified' ? c.certified : 0, used: u.value, remaining: r2(Math.max(0, ent - u.value)), ent, gateOk, srn: c.srnId && getSRN(c.srnId) };
}

/* ---------- eligible sources (entitlements) for a PO ---------- */
function sourceItems(po, ex) {
  const items = [];
  if (po.billingMethod === 'Milestone') {
    msOf(po).forEach(m => {
      const gate = msGate(m, po), ent = msEnt(m, po), u = usage('milestone', m.id, ex);
      let reason = '';
      if (m.status !== 'Approved') reason = `Milestone is ${m.status} — not yet accepted`;
      else if (!gate.ok) reason = `Milestone approved, but ${gate.reason}`;
      else if (u.value >= m.amount - EPS) reason = `Fully invoiced${u.invs.length ? ' on ' + u.invs.map(invRef).join(', ') : ''}`;
      items.push({ kind: 'milestone', refId: m.id, ref: m, label: m.code, name: m.name, line: lineOf(po, m.lineId), status: m.status, entQty: null, entValue: ent, usedQty: 0, usedValue: u.value, committedValue: u.committedValue, reservedValue: u.reservedValue,
        availQty: null, availValue: r2(Math.max(0, ent - u.value)), eligible: ent > 0 && ent - u.value > EPS, reason, invs: u.invs });
    });
    return items;
  }
  if (poCertified(po)) {
    claimsOf(po).forEach(c => {
      const v = claimView(c), u = usage('claim', c.id, ex);
      let reason = '';
      if (c.status !== 'Certified') reason = `Claim is ${c.status} — not yet certified`;
      else if (!v.gateOk) reason = 'Certified, but accepted SRN required';
      else if (u.value >= v.certified - EPS) reason = `Fully invoiced${u.invs.length ? ' on ' + u.invs.map(invRef).join(', ') : ''}`;
      items.push({ kind: 'claim', refId: c.id, ref: c, label: c.number, name: `Claim ${c.period}`, line: lineOf(po, c.lineId), status: c.status, entQty: null, entValue: v.ent, usedQty: 0, usedValue: u.value, committedValue: u.committedValue, reservedValue: u.reservedValue,
        availQty: null, availValue: r2(Math.max(0, v.ent - u.value)), eligible: v.ent > 0 && v.ent - u.value > EPS, reason, invs: u.invs });
    });
    return items;
  }
  grnsOf(po).filter(g => g.status !== 'Draft').forEach(g => {
    const line = lineOf(po, g.lineId), ent = grnEnt(g), u = usage('grn', g.id, ex), price = line.price;
    let reason = '';
    if (g.reversed) reason = 'Receipt reversed — entitlement withdrawn';
    else if (g.status === 'Rejected') reason = 'GRN rejected — nothing invoice-eligible';
    else if (!GRN_OK.includes(g.status)) reason = `GRN is ${g.status} — pending quantity is not invoice-eligible`;
    else if (ent - u.qty <= EPS) reason = `Fully allocated${u.invs.length ? ' on ' + u.invs.map(invRef).join(', ') : ''}`;
    const availQty = r2(Math.max(0, ent - u.qty));
    items.push({ kind: 'grn', refId: g.id, ref: g, label: g.number, name: `${g.number} · ${fmtD(g.date)}`, line, status: g.status, price, entQty: ent, entValue: r2(ent * price), usedQty: u.qty, usedValue: r2(u.qty * price),
      committedQty: u.committedQty, reservedQty: u.reservedQty, committedValue: r2(u.committedQty * price), reservedValue: r2(u.reservedQty * price),
      availQty, availValue: r2(availQty * price), eligible: availQty > EPS, reason, invs: u.invs });
  });
  srnsOf(po).filter(s => s.status !== 'Draft').forEach(s => {
    const line = lineOf(po, s.lineId), ent = srnEnt(s), u = usage('srn', s.id, ex);
    let reason = '';
    if (s.status === 'Rejected') reason = 'SRN rejected — nothing invoice-eligible';
    else if (!SRN_OK.includes(s.status)) reason = `SRN is ${s.status} — not yet accepted`;
    else if (ent - u.value <= EPS) reason = `Fully allocated${u.invs.length ? ' on ' + u.invs.map(invRef).join(', ') : ''}`;
    items.push({ kind: 'srn', refId: s.id, ref: s, label: s.number, name: `${s.number} · ${fmtD(s.date)}`, line, status: s.status, entQty: null, entValue: ent, usedQty: 0, usedValue: u.value, committedValue: u.committedValue, reservedValue: u.reservedValue,
      availQty: null, availValue: r2(Math.max(0, ent - u.value)), eligible: ent > 0 && ent - u.value > EPS, reason, invs: u.invs });
  });
  return items;
}

/* ---------- PO summary: received / accepted / invoiced / approved / paid are distinct ---------- */
function poSummary(po) {
  const value = poNet(po), invs = invsOf(po), live = invs.filter(isLive);
  const items = sourceItems(po);
  const invoiced = sum(live, i => i.net);
  const approved = sum(invs.filter(i => APPROVED.includes(i.status)), i => i.net);
  const paid = sum(invs.filter(i => i.status === 'Paid'), i => i.net);
  const reserved = sum(live.filter(i => !APPROVED.includes(i.status)), i => i.net);
  let received = 0;
  if (po.billingMethod === 'Milestone') received = sum(msOf(po).filter(m => ['Submitted for Acceptance', 'Approved'].includes(m.status)), m => m.amount);
  else if (poCertified(po)) received = sum(claimsOf(po).filter(c => ['Submitted', 'Certified'].includes(c.status)), c => claimView(c).current);
  else received = sum(grnsOf(po).filter(g => g.status !== 'Draft' && !g.reversed), g => g.received * lineOf(po, g.lineId).price) + sum(srnsOf(po).filter(s => s.status !== 'Draft'), s => s.serviceValue);
  const accepted = sum(items, x => x.entValue);
  const remaining = (po.billingMethod === 'Standard') ? r2(Math.max(0, accepted - invoiced)) : sum(items, x => x.availValue);
  const goods = po.lines.filter(l => l.receiptType === 'Goods');
  const gs = grnsOf(po);
  return {
    value, received, accepted, invoiced, approved, paid, reserved, remaining, remainingPO: r2(value - invoiced),
    acceptedQty: sum(gs, grnEnt), receivedQty: sum(gs.filter(g => g.status !== 'Draft' && !g.reversed), g => g.received), rejectedQty: sum(gs.filter(g => g.status !== 'Draft' && !g.reversed), g => g.rejected),
    invoicedQty: sum(live.flatMap(i => i.allocs.filter(a => a.kind === 'grn')), a => a.qty),
    remainingPOQty: goods.length ? sum(goods, l => lineReceiptStats(po, l).remaining) : 0, hasGoods: goods.length > 0,
    items,
  };
}

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
  inv.vatRate = d.vatRate ?? VAT_RATE_DEFAULT;
  const calc = r2(inv.net * inv.vatRate / 100);
  inv.vat = (d.vatManual === null || d.vatManual === undefined || d.vatManual === '') ? calc : r2(d.vatManual);
  inv.gross = r2(inv.net + inv.vat);
  return inv;
}

/* ---------- validation gate shared by form, submit and matching ---------- */
function allocErrors(inv) {
  const po = getPO(inv.poId), errs = [], ex = inv.id;
  const add = (code, msg, ref) => errs.push({ code, msg, ref });
  if (!po) return [{ code: 'PO', msg: 'Select an approved purchase order.' }];
  const net = inv.net, poVal = poNet(po);
  if (!(net > 0)) add('NET', po.billingMethod === 'Standard' ? 'Enter an invoice net amount greater than zero.' : 'Allocate a quantity/value greater than zero against at least one source.');
  const otherLive = sum(db.invoices.filter(i => i.poId === po.id && isLive(i) && i.id !== ex), i => i.net);
  if (net > 0 && r2(otherLive + net) > poVal + EPS) add('PO_BAL', `Cumulative invoicing would reach ${money(otherLive + net)}, exceeding the PO value ${money(poVal)}. Remaining PO balance: ${money(poVal - otherLive)}.`);
  const items = sourceItems(po, ex);
  if (po.billingMethod === 'Standard') {
    const accepted = sum(items, x => x.entValue);
    if (accepted <= EPS) add('NOT_ELIGIBLE', 'No accepted goods/service receipts exist against this PO. Receive and accept first — pending or rejected quantities are not invoice-eligible.');
    else if (net > 0 && net > accepted - otherLive + EPS) add('OVER_VALUE', `Invoice net ${money(net)} exceeds the accepted receipt value still unbilled. Accepted receipts: ${money(accepted)}; already invoiced / reserved: ${money(otherLive)}; eligible: ${money(accepted - otherLive)}.`);
    return errs;
  }
  const kindName = po.billingMethod === 'Milestone' ? 'milestone' : (poCertified(po) ? 'progress claim' : 'receipt');
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
      if (m.status !== 'Approved') return add('MS_NOT_APPROVED', `Milestone ${m.code} is not invoice-eligible: status is "${m.status}". Only approved milestones can be invoiced; a passed planned date does not make it eligible.`, it.label);
      if (!gate.ok) return add('SRN_GATE', `Milestone ${m.code} is approved but cannot be invoiced yet: ${gate.reason}. Milestone acceptance does not replace the service receipt.`, it.label);
      if (it.usedValue >= m.amount - EPS || (!po.partialMilestone && it.usedValue > EPS)) return add('DUP_ALLOC', `Duplicate allocation blocked: milestone ${m.code} (${money(m.amount)}) is already invoiced on ${byInv}. Only one invoice is allowed per milestone.`, it.label);
      if (a.value > it.availValue + EPS) return add('OVER_VALUE', `Invoice value exceeds the remaining balance of milestone ${m.code}. Remaining: ${money(it.availValue)}. Requested: ${money(a.value)}.`, it.label);
      if (!po.partialMilestone && Math.abs(a.value - m.amount) > EPS) return add('MS_FULL', `Milestone ${m.code} must be invoiced for its full amount (${money(m.amount)}); partial milestone billing is not enabled on this PO. Requested: ${money(a.value)}.`, it.label);
    } else if (a.kind === 'claim') {
      const c = it.ref;
      if (c.status !== 'Certified') return add('NOT_ELIGIBLE', `${c.number} is not invoice-eligible: claim status is "${c.status}". Only certified progress can be invoiced.`, it.label);
      if (it.entValue <= 0) return add('SRN_GATE', `${c.number} is certified but an accepted SRN is required before invoicing.`, it.label);
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
  C('supplier', 'Supplier match', inv.supplierId === po.supplierId ? 'pass' : 'fail', inv.supplierId === po.supplierId ? `${sup.name} (${sup.code}) matches the PO supplier.` : 'Invoice supplier differs from the PO supplier.');
  const e1 = by('NOT_ELIGIBLE', 'MS_NOT_APPROVED', 'SRN_GATE', 'NO_SOURCE', 'NO_ALLOC', 'DUP_ALLOC');
  const refs = inv.allocs.map(a => { const it = sourceItems(po, inv.id).find(x => x.kind === a.kind && x.refId === a.refId); return it ? it.label : '?'; });
  const eligLabel = po.billingMethod === 'Milestone' ? 'Milestone eligibility & acceptance' : poCertified(po) ? 'Certified progress eligibility' : 'Receipt eligibility (GRN / SRN)';
  if (e1.length) C('elig', eligLabel, 'fail', e1.map(e => e.msg).join(' '));
  else if (po.billingMethod === 'Standard') C('elig', eligLabel, 'pass', `Accepted receipts of ${money(sum(sourceItems(po, inv.id), x => x.entValue))} are available on the PO (standard receipt-based matching, no allocation schedule).`);
  else if (po.billingMethod === 'Milestone') C('elig', eligLabel, 'pass', `${refs.join(', ')} approved${inv.allocs.some(a => getMS(a.refId)?.srnRequired) ? ' and required SRN accepted' : ' — no separate SRN required for this milestone'}.`);
  else C('elig', eligLabel, 'pass', `${refs.join(', ')} accepted and unconsumed — pending and rejected quantities excluded.`);
  const e2 = by('OVER_QTY', 'OVER_VALUE', 'MS_FULL', 'NET');
  if (e2.length) C('qty', 'Quantity / value match', 'fail', e2.map(e => e.msg).join(' '));
  else if (po.billingMethod === 'Standard') C('qty', 'Quantity / value match', 'pass', `Invoice net ${money(inv.net)} ≤ accepted unbilled receipt value.`);
  else C('qty', 'Quantity / value match', 'pass', `Allocations total ${money(sum(inv.allocs, a => a.value))} = invoice net ${money(inv.net)}; every allocation is within its remaining eligible ${po.billingMethod === 'Milestone' ? 'milestone balance' : 'quantity/value'}.`);
  const dups = db.invoices.filter(i => i.id !== inv.id && i.supplierId === inv.supplierId && !['Draft', 'Cancelled'].includes(i.status) && String(i.number).trim().toLowerCase() === String(inv.number).trim().toLowerCase());
  C('dup', 'Duplicate invoice check', dups.length ? 'fail' : 'pass', dups.length ? `Supplier invoice number "${inv.number}" was already submitted by ${sup.name} as ${dups.map(d => `${invRef(d)} (${d.status})`).join(', ')}.` : `Invoice number "${inv.number}" is unique for ${sup.name}.`);
  const otherLive = sum(db.invoices.filter(i => i.poId === po.id && isLive(i) && i.id !== inv.id), i => i.net), poVal = poNet(po);
  const eb = by('PO_BAL');
  C('bal', 'PO remaining balance', eb.length ? 'fail' : 'pass', eb.length ? eb[0].msg : `PO ${money(poVal)} − other live invoices ${money(otherLive)} − this invoice ${money(inv.net)} = ${money(poVal - otherLive - inv.net)} remaining.`);
  const exp = r2(inv.net * inv.vatRate / 100), diff = Math.abs(exp - inv.vat), line = po.lines[0];
  if (inv.vatRate !== VAT_RATE_DEFAULT) C('vat', 'VAT / tax validation', 'fail', `VAT rate ${inv.vatRate}% differs from tax code ${line.taxCode} (${VAT_RATE_DEFAULT}%) on the PO.`);
  else if (diff <= 0.01) C('vat', 'VAT / tax validation', 'pass', `VAT ${money(inv.vat)} = ${inv.vatRate}% of ${money(inv.net)}; gross ${money(inv.gross)}.`);
  else if (diff <= 1) C('vat', 'VAT / tax validation', 'warn', `VAT ${money(inv.vat)} differs from the computed ${money(exp)} by ${money(diff)} (within the AED 1.00 rounding tolerance).`);
  else C('vat', 'VAT / tax validation', 'fail', `VAT ${money(inv.vat)} does not equal ${inv.vatRate}% of net ${money(inv.net)} (expected ${money(exp)}, variance ${money(diff)}).`);
  const result = checks.some(c => c.status === 'fail') ? 'Blocked' : checks.some(c => c.status === 'warn') ? 'Partially Matched' : 'Matched';
  C('appr', 'Approval status', result === 'Blocked' ? 'info' : 'pass', result === 'Blocked' ? 'Not routed — resolve the exceptions above, then re-run matching.' : 'Eligible to route to the AP Manager approval queue.');
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
  if (!d.supplierId) errs.push('Select a supplier.');
  if (!d.poDate) errs.push('PO date is required.');
  if (d.deliveryDate && d.poDate && d.deliveryDate < d.poDate) errs.push('Delivery date cannot be before the PO date.');
  if (!d.lines.length) errs.push('Add at least one PO line.');
  d.lines.forEach((l, i) => {
    if (!String(l.desc || '').trim()) errs.push(`Line ${i + 1}: description is required.`);
    if (!(+l.qty > 0)) errs.push(`Line ${i + 1}: quantity must be greater than zero.`);
    if (!(+l.price >= 0) || l.price === '') errs.push(`Line ${i + 1}: unit price is required.`);
  });
  if (!d.billingMethod) errs.push('Billing Method is required.');
  if (forSubmit) {
    if (!(v > 0)) errs.push('PO value must be greater than zero.');
    if (d.billingMethod === 'Milestone') {
      const chk = scheduleCheck(d.milestones, r2(v), d.scheduleMode, d.scheduleException);
      chk.errors.forEach(e => errs.push('Milestone schedule: ' + e));
      if (!d.scheduleFinal) errs.push('Milestone schedule must be finalized before the PO can be submitted.');
    }
  }
  return errs;
}
A.savePO = (d, submit) => {
  const errs = validatePO(d, submit);
  if (errs.length) return NO(errs, 'Please fix the highlighted issues.');
  let po = d.id && getPO(d.id), isNew = !po;
  if (isNew) {
    const next = Math.max(1041, ...db.pos.map(p => +p.number.split('-').pop())) + 1;
    po = { id: uid('po'), number: `PO-2026-${next}`, version: 1, amendments: [], approvals: [], createdBy: actor(), createdAt: nowISO() };
    db.pos.push(po);
  }
  Object.assign(po, {
    supplierId: d.supplierId, buyer: d.buyer, poDate: d.poDate, deliveryDate: d.deliveryDate, currency: 'AED', terms: d.terms, category: d.category,
    billingMethod: d.billingMethod, progressBasis: d.billingMethod === 'Progressive' ? d.progressBasis : 'Receipt', requireSrn: !!d.requireSrn, partialMilestone: !!d.partialMilestone,
    overReceiptPct: +d.overReceiptPct || 0, scheduleMode: d.scheduleMode, scheduleException: d.scheduleException, status: submit ? 'Pending Approval' : 'Draft',
    scheduleStatus: d.billingMethod === 'Milestone' ? (d.scheduleFinal ? 'Final' : 'Draft') : 'n/a',
    lines: d.lines.map((l, i) => ({ id: l.id || uid('ln'), no: i + 1, code: l.code, desc: l.desc, qty: +l.qty, uom: l.uom, price: +l.price, taxCode: l.taxCode || 'VAT5', location: l.location, receiptType: l.receiptType })),
  });
  // milestone schedule (draft state only — approved schedules change through amendments)
  db.milestones = db.milestones.filter(m => m.poId !== po.id);
  if (po.billingMethod === 'Milestone') {
    const val = poNet(po);
    d.milestones.forEach((m, i) => db.milestones.push({
      id: m.id || uid('ms'), poId: po.id, lineId: m.lineId || po.lines[0].id, seq: i + 1, code: `M${i + 1}`, name: m.name, description: m.description || '', pct: d.scheduleMode === 'percent' ? +m.pct : r2(+m.amount / val * 100),
      amount: d.scheduleMode === 'percent' ? r2(+m.pct * val / 100) : r2(+m.amount), planned: m.planned || '', criteria: m.criteria || '', evidenceReq: m.evidenceReq || '', approver: m.approver || 'Procurement Manager',
      status: 'Draft', srnRequired: !!m.srnRequired, srnId: null, evidence: [], remarks: '', actualDate: '', approvedAt: '', rejectReason: '',
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
  msOf(po).forEach(m => { if (m.status === 'Draft') m.status = 'Pending Acceptance'; });
  if (po.billingMethod === 'Milestone') po.scheduleStatus = 'Final';
  po.approvals.push({ at: nowISO(), by: actor(), action: 'Approved', note: '' });
  audit(po.id, po.number, `PO approved. Now available for GRN / SRN / invoice selection.${po.billingMethod === 'Milestone' ? ' Milestone schedule locked.' : ''}`, 'po');
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
    const o = lineOf(po, n.id), touched = grnsOf(po).some(g => g.lineId === o.id && g.status !== 'Draft') || srnsOf(po).some(s => s.lineId === o.id && s.status !== 'Draft') || invsOf(po).some(i => isLive(i));
    if (!(n.qty > 0) || !(n.price >= 0)) errs.push(`Line ${o.no}: enter a valid quantity and price.`);
    if (n.price !== o.price && touched) errs.push(`Line ${o.no}: unit price is locked because receipts or invoices already exist — historical amounts are never rewritten.`);
    if (o.receiptType === 'Goods' && n.qty < lineReceiptStats(po, { ...o, qty: 0 }).active - EPS) errs.push(`Line ${o.no}: quantity cannot drop below the quantity already received/accepted (${fmtNum(lineReceiptStats(po, { ...o, qty: 0 }).active)}).`);
    if (n.qty !== o.qty) changes.push(`Line ${o.no} quantity ${fmtNum(o.qty)} → ${fmtNum(n.qty)}`);
    if (n.price !== o.price) changes.push(`Line ${o.no} price ${fmtNum(o.price)} → ${fmtNum(n.price)}`);
  });
  const after = sum(next, l => l.qty * l.price);
  const liveInv = sum(invsOf(po).filter(isLive), i => i.net);
  if (after < liveInv - EPS) errs.push(`Amended PO value ${money(after)} cannot be lower than invoices already submitted (${money(liveInv)}).`);
  if (po.billingMethod === 'Milestone') {
    const cur = msOf(po), mode = po.scheduleMode || 'percent';
    const locked = m => usage('milestone', m.id).value > EPS || m.status === 'Approved' || m.status === 'Submitted for Acceptance';
    const merged = cur.map(m => { const n = milestones.find(x => x.id === m.id); if (!n || locked(m)) return { ...m }; return { ...m, name: n.name, pct: +n.pct, amount: +n.amount }; });
    const added = milestones.filter(x => !x.id || x.id.startsWith('new')).map((x, i) => ({ ...x, id: null }));
    const all = [...merged, ...added];
    const chk = mode === 'percent'
      ? scheduleCheck(all.map(m => locked(m) && m.id ? { ...m, pct: m.amount / after * 100 } : m), after, 'percent')
      : scheduleCheck(all, after, 'fixed', po.scheduleException);
    chk.errors.forEach(e => errs.push('Amended schedule: ' + e));
    if (!errs.length) {
      cur.forEach(m => {
        const n = merged.find(x => x.id === m.id);
        if (!locked(m)) { if (m.name !== n.name || m.amount !== (mode === 'percent' ? r2(n.pct * after / 100) : n.amount)) changes.push(`${m.code} "${m.name}" amount ${money(m.amount)} → ${money(mode === 'percent' ? r2(n.pct * after / 100) : n.amount)}`); m.name = n.name; m.pct = mode === 'percent' ? n.pct : r2(n.amount / after * 100); m.amount = mode === 'percent' ? r2(n.pct * after / 100) : n.amount; }
      });
      added.forEach(x => { const seq = msOf(po).length + 1; changes.push(`Added milestone M${seq} "${x.name}" ${money(mode === 'percent' ? r2(x.pct * after / 100) : x.amount)}`); db.milestones.push({ id: uid('ms'), poId: po.id, lineId: po.lines[0].id, seq, code: `M${seq}`, name: x.name, description: '', pct: +x.pct || 0, amount: mode === 'percent' ? r2(x.pct * after / 100) : r2(x.amount), planned: x.planned || '', criteria: '', evidenceReq: '', approver: 'Procurement Manager', status: 'Pending Acceptance', srnRequired: !!po.requireSrn, srnId: null, evidence: [], remarks: '', actualDate: '', approvedAt: '', rejectReason: '' }); });
    }
  }
  if (errs.length) return NO(errs, 'Amendment rejected — see issues.');
  next.forEach(n => { const l = lineOf(po, n.id); l.qty = n.qty; l.price = n.price; });
  po.version += 1;
  po.amendments.unshift({ id: uid('am'), version: po.version, at: nowISO(), by: actor(), reason, changes, valueBefore: before, valueAfter: poNet(po) });
  audit(po.id, po.number, `PO amended to v${po.version} (${money(before)} → ${money(poNet(po))}). ${changes.join('; ') || 'No value change.'} Historical invoice allocations preserved. Reason: ${reason}`, 'po');
  save(); return OK(`${po.number} amended to v${po.version}`);
};

/* ----- GRN ----- */
function finalizeGRN(g) {
  g.status = g.accepted >= g.received - EPS ? 'Accepted' : g.accepted > 0 ? 'Partially Accepted' : 'Rejected';
  g.inspection = g.status === 'Accepted' ? 'Passed' : g.status === 'Partially Accepted' ? 'Partially Passed' : 'Failed';
  g.decidedAt = nowISO(); g.decidedBy = actor();
}
A.createGRN = (d, mode) => {
  const errs = validateGRN(d);
  if (errs.length) return NO(errs);
  const po = getPO(d.poId), seq = db.grns.filter(g => g.poId === po.id).length + 1;
  const g = { id: uid('grn'), poId: po.id, lineId: d.lineId, seq, number: `GRN-${pad(seq)}`, date: d.date, location: d.location, received: +d.received, accepted: +d.accepted, rejected: +d.rejected, inspection: d.inspection, remarks: d.remarks || '', attachments: d.attachments || [], status: 'Draft', reversed: false, createdBy: actor(), createdAt: nowISO() };
  db.grns.push(g);
  audit(po.id, g.number, `${g.number} created: ${fmtNum(g.received)} received, ${fmtNum(g.accepted)} accepted, ${fmtNum(g.rejected)} rejected.`, 'grn');
  if (mode !== 'draft') { const r = A.submitGRN(g.id); if (!r.ok) return r; if (mode === 'accept') { const r2_ = A.acceptGRN(g.id); if (!r2_.ok) return { ...r2_, id: g.id }; } }
  save(); return OK(`${g.number} ${mode === 'accept' ? 'created and accepted' : mode === 'submit' ? 'submitted' : 'saved as draft'}`, { id: g.id });
};
A.submitGRN = id => {
  const g = getGRN(id); if (!g || g.status !== 'Draft') return NO('Only draft GRNs can be submitted.');
  g.status = (grnPending(g) > EPS || g.inspection === 'Pending') ? 'Pending Inspection' : 'Submitted';
  audit(g.poId, g.number, `${g.number} ${g.status === 'Pending Inspection' ? 'submitted — pending inspection (not invoice-eligible)' : 'submitted for acceptance'}.`, 'grn');
  save(); return OK(`${g.number} ${g.status === 'Pending Inspection' ? 'pending inspection' : 'submitted'}`);
};
A.acceptGRN = id => {
  const g = getGRN(id); if (!g || !['Submitted', 'Pending Inspection'].includes(g.status)) return NO('GRN is not awaiting acceptance.');
  if (grnPending(g) > EPS) return NO(`${fmtNum(grnPending(g))} unit(s) are still pending inspection. Record the inspection result first.`);
  finalizeGRN(g);
  audit(g.poId, g.number, `${g.number} ${g.status.toLowerCase()}: ${fmtNum(g.accepted)} units now invoice-eligible, ${fmtNum(g.rejected)} rejected. PO eligible receipt balance updated.`, g.status === 'Rejected' ? 'bad' : 'ok');
  save(); return OK(`${g.number} ${g.status.toLowerCase()}`);
};
A.recordInspection = (id, accepted, rejected) => {
  const g = getGRN(id); if (!g || !['Submitted', 'Pending Inspection'].includes(g.status)) return NO('GRN is not awaiting inspection.');
  accepted = +accepted; rejected = +rejected;
  if (accepted < 0 || rejected < 0 || r2(accepted + rejected) > g.received + EPS) return NO(`Accepted + rejected cannot exceed received quantity (${fmtNum(g.received)}).`);
  if (r2(accepted + rejected) < g.received - EPS) { g.accepted = accepted; g.rejected = rejected; audit(g.poId, g.number, `Partial inspection recorded on ${g.number}: ${fmtNum(grnPending(g))} unit(s) still pending.`, 'grn'); save(); return OK('Inspection saved — pending quantity remains'); }
  g.accepted = accepted; g.rejected = rejected; finalizeGRN(g);
  audit(g.poId, g.number, `Inspection completed on ${g.number}: ${fmtNum(accepted)} accepted, ${fmtNum(rejected)} rejected → ${g.status}.`, 'ok'); save(); return OK(`${g.number} ${g.status.toLowerCase()}`);
};
A.rejectGRN = (id, reason) => {
  const g = getGRN(id); if (!g || !['Submitted', 'Pending Inspection'].includes(g.status)) return NO('GRN is not awaiting a decision.');
  if (!String(reason || '').trim()) return NO('A rejection reason is required.');
  g.rejected = g.received; g.accepted = 0; g.status = 'Rejected'; g.inspection = 'Failed'; g.remarks = (g.remarks ? g.remarks + ' · ' : '') + 'Rejected: ' + reason;
  audit(g.poId, g.number, `${g.number} rejected: ${reason}`, 'bad'); save(); return OK(`${g.number} rejected`);
};
A.reverseGRN = (id, reason) => {
  const g = getGRN(id); if (!g || !GRN_OK.includes(g.status) || g.reversed) return NO('Only accepted GRNs can be reversed.');
  if (!String(reason || '').trim()) return NO('A reversal reason is required.');
  g.reversed = true; g.reverseReason = reason; g.reversedAt = nowISO();
  const hit = usage('grn', g.id);
  audit(g.poId, g.number, `${g.number} reversed (${reason}). Eligible balance reduced by ${fmtNum(g.accepted)} units. History preserved.${hit.invs.length ? ` In-flight invoices ${hit.invs.map(invRef).join(', ')} now rely on an invalidated receipt — re-run matching.` : ''}`, 'bad');
  save(); return OK(`${g.number} reversed`);
};

/* ----- SRN ----- */
A.createSRN = (d, mode) => {
  const errs = validateSRN(d); if (errs.length) return NO(errs);
  const po = getPO(d.poId), seq = db.srns.filter(s => s.poId === po.id).length + 1;
  const s = { id: uid('srn'), poId: po.id, lineId: d.lineId, milestoneId: d.milestoneId || null, seq, number: `SRN-${pad(seq)}`, date: d.date, description: d.description, serviceValue: r2(d.serviceValue), acceptedValue: 0, status: 'Draft', remarks: d.remarks || '', attachments: d.attachments || [], createdBy: actor(), createdAt: nowISO() };
  db.srns.push(s);
  if (s.milestoneId) { const m = getMS(s.milestoneId); if (m && !m.srnId) m.srnId = s.id; }
  audit(po.id, s.number, `${s.number} created for ${money(s.serviceValue)}${s.milestoneId ? ` (linked to milestone ${getMS(s.milestoneId).code})` : ''}.`, 'srn');
  if (mode === 'submit') A.submitSRN(s.id);
  save(); return OK(`${s.number} ${mode === 'submit' ? 'submitted for acceptance' : 'saved as draft'}`, { id: s.id });
};
A.submitSRN = id => { const s = getSRN(id); if (!s || s.status !== 'Draft') return NO('Only draft SRNs can be submitted.'); s.status = 'Pending Acceptance'; audit(s.poId, s.number, `${s.number} submitted — pending acceptance.`, 'srn'); save(); return OK(`${s.number} pending acceptance`); };
A.acceptSRN = (id, acceptedValue) => {
  const s = getSRN(id); if (!s || s.status !== 'Pending Acceptance') return NO('SRN is not awaiting acceptance.');
  const v = r2(acceptedValue ?? s.serviceValue);
  if (!(v > 0) || v > s.serviceValue + EPS) return NO(`Accepted value must be between 0 and ${money(s.serviceValue)}.`);
  s.acceptedValue = v; s.status = v >= s.serviceValue - EPS ? 'Accepted' : 'Partially Accepted'; s.decidedAt = nowISO(); s.decidedBy = actor();
  audit(s.poId, s.number, `${s.number} ${s.status.toLowerCase()} for ${money(v)}. Service receipt balance updated.${s.milestoneId ? ' (Milestone acceptance is a separate record and is unchanged.)' : ''}`, 'ok'); save(); return OK(`${s.number} ${s.status.toLowerCase()}`);
};
A.rejectSRN = (id, reason) => {
  const s = getSRN(id); if (!s || s.status !== 'Pending Acceptance') return NO('SRN is not awaiting acceptance.');
  if (!String(reason || '').trim()) return NO('A rejection reason is required.');
  s.status = 'Rejected'; s.rejectReason = reason; audit(s.poId, s.number, `${s.number} rejected: ${reason}`, 'bad'); save(); return OK(`${s.number} rejected`);
};

/* ----- Milestones ----- */
A.msSubmit = (id, { actualDate, remarks, evidence }) => {
  const m = getMS(id), po = m && getPO(m.poId);
  if (!m || !po || po.status !== 'Approved') return NO('The PO must be approved before milestones can be submitted.');
  if (!['Pending Acceptance', 'More Info Requested', 'Rejected'].includes(m.status)) return NO(`Milestone is ${m.status}.`);
  const errs = []; if (!actualDate) errs.push('Actual completion date is required.'); if (!evidence.length) errs.push('Attach at least one supporting evidence document.'); if (!String(remarks || '').trim()) errs.push('Add completion remarks.');
  if (errs.length) return NO(errs);
  Object.assign(m, { status: 'Submitted for Acceptance', actualDate, remarks, evidence: [...evidence], rejectReason: '', infoRequest: '' });
  audit(po.id, `${po.number} / ${m.code}`, `Milestone ${m.code} "${m.name}" submitted for acceptance with ${evidence.length} evidence file(s).`, 'ms'); save(); return OK(`${m.code} submitted for acceptance`);
};
A.msApprove = id => {
  const m = getMS(id), po = m && getPO(m.poId); if (!m || m.status !== 'Submitted for Acceptance') return NO('Milestone is not awaiting acceptance.');
  m.status = 'Approved'; m.approvedAt = nowISO(); m.approvedBy = actor(); const g = msGate(m, po);
  audit(po.id, `${po.number} / ${m.code}`, `Milestone ${m.code} approved. ${g.ok ? `Invoice-eligible amount ${money(m.amount)}.` : `Still NOT invoice-eligible — ${g.reason}.`}`, 'ok'); save();
  return OK(g.ok ? `${m.code} approved — ${money(m.amount)} now invoice-eligible` : `${m.code} approved — awaiting SRN acceptance before it is invoice-eligible`);
};
A.msReject = (id, reason) => {
  const m = getMS(id), po = m && getPO(m.poId); if (!m || m.status !== 'Submitted for Acceptance') return NO('Milestone is not awaiting acceptance.');
  if (!String(reason || '').trim()) return NO('A rejection reason is required.');
  m.status = 'Rejected'; m.rejectReason = reason; audit(po.id, `${po.number} / ${m.code}`, `Milestone ${m.code} rejected: ${reason}`, 'bad'); save(); return OK(`${m.code} rejected`);
};
A.msRequestInfo = (id, note) => {
  const m = getMS(id), po = m && getPO(m.poId); if (!m || m.status !== 'Submitted for Acceptance') return NO('Milestone is not awaiting acceptance.');
  if (!String(note || '').trim()) return NO('Describe the information required.');
  m.status = 'More Info Requested'; m.infoRequest = note; audit(po.id, `${po.number} / ${m.code}`, `More information requested on ${m.code}: ${note}`, 'ms'); save(); return OK(`More information requested on ${m.code}`);
};
A.msLinkSrn = (id, srnId) => {
  const m = getMS(id), po = m && getPO(m.poId); if (!m) return NO('Milestone not found.');
  const s = srnId ? getSRN(srnId) : null; if (srnId && (!s || s.poId !== m.poId)) return NO('SRN does not belong to this PO.');
  m.srnId = srnId || null; audit(po.id, `${po.number} / ${m.code}`, srnId ? `Milestone ${m.code} linked to ${s.number} (${s.status}).` : `SRN link removed from ${m.code}.`, 'ms'); save(); return OK(srnId ? `Linked ${s.number}` : 'SRN link removed');
};

/* ----- Certified progress claims ----- */
A.createClaim = (d, mode) => {
  const po = getPO(d.poId); if (!po || !poCertified(po)) return NO('Select an approved PO using Certified Work Progress.');
  const line = lineOf(po, d.lineId) || po.lines[0], contract = lineNet(line), prev = cumCertified(po), errs = [];
  const cum = r2(d.claimedCum);
  if (!String(d.period || '').trim()) errs.push('Enter the claim period.');
  if (!(cum > prev + EPS)) errs.push(`New cumulative claimed value must be greater than the previously certified cumulative value (${money(prev)}). The supplier must not re-claim value that is already certified.`);
  if (cum > contract + EPS) errs.push(`Cumulative claimed value ${money(cum)} exceeds the contract line value ${money(contract)}.`);
  if (mode !== 'draft' && !(d.evidence || []).length) errs.push('Attach supporting evidence (measurement sheets / site reports).');
  if (po.requireSrn && mode !== 'draft' && !d.srnId) errs.push('This PO category requires an accepted SRN — link one to the claim.');
  if (errs.length) return NO(errs);
  const seq = db.claims.filter(c => c.poId === po.id).length + 1;
  const c = { id: uid('pc'), poId: po.id, lineId: line.id, seq, number: `PC-${pad(seq)}`, period: d.period, prevCum: prev, claimedCum: cum, certified: 0, evidence: d.evidence || [], approver: d.approver || 'Procurement Manager', status: mode === 'draft' ? 'Draft' : 'Submitted', srnId: d.srnId || null, remarks: d.remarks || '', createdAt: nowISO() };
  db.claims.push(c);
  audit(po.id, c.number, `${c.number} ${c.status === 'Draft' ? 'saved as draft' : 'submitted for review'}: cumulative ${money(cum)} − previously certified ${money(prev)} = current claim ${money(cum - prev)}.`, 'claim'); save();
  return OK(`${c.number} ${c.status === 'Draft' ? 'saved as draft' : 'submitted for certification'}`, { id: c.id });
};
A.submitClaim = id => { const c = getClaim(id); if (!c || c.status !== 'Draft') return NO('Only draft claims can be submitted.'); if (!c.evidence.length) return NO('Attach supporting evidence first.'); const po = getPO(c.poId); if (po.requireSrn && !c.srnId) return NO('Link an SRN first.'); c.status = 'Submitted'; audit(c.poId, c.number, `${c.number} submitted for review.`, 'claim'); save(); return OK(`${c.number} submitted`); };
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
  const l = a.kind === 'grn' ? src.number : a.kind === 'milestone' ? src.code : src.number;
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
  if (!String(b.number || '').trim()) errs.push('Enter the supplier invoice number.');
  if (!b.date) errs.push('Enter the invoice date.');
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
  Object.assign(inv, { number: b.number.trim(), supplierId: po.supplierId, poId: po.id, method: po.billingMethod, date: b.date, lineId: d.lineId || null, desc: d.desc || '', net: b.net, vatRate: b.vatRate, vat: b.vat, gross: b.gross, remarks: d.remarks || '', attachments: d.attachments || [], allocs: b.allocs.map(a => ({ id: a.id || uid('al'), kind: a.kind, refId: a.refId, qty: a.qty ?? null, value: a.value })) });
  if (mode === 'draft') { audit(po.id, invRef(inv), `${invRef(inv)} saved as draft (no allocation reserved).`, 'inv'); save(); return OK(`${invRef(inv)} saved as draft`, { id: inv.id }); }
  inv.submittedAt = nowISO();
  setStatus(inv, 'Submitted', 'Submitted by supplier'); audit(po.id, invRef(inv), `${invRef(inv)} (supplier no. ${inv.number}) submitted for ${money(inv.gross)} gross.`, 'inv');
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
A.addAdjustment = (id, { type, amount, reason }) => {
  const inv = getInv(id); if (!inv || !APPROVED.includes(inv.status)) return NO('Adjustments apply to approved, posted or paid invoices.');
  amount = r2(amount); if (!(amount > 0)) return NO('Enter an amount greater than zero.'); if (!String(reason || '').trim()) return NO('A reason is required.');
  if (type === 'Credit' && amount > payable(inv) + EPS) return NO(`Credit note cannot exceed the payable amount ${money(payable(inv))}.`);
  db.adjustments.push({ id: uid('adj'), invoiceId: inv.id, type, amount, reason, at: nowISO(), by: actor() });
  audit(inv.poId, invRef(inv), `${type} note of ${money(amount)} recorded against ${invRef(inv)} (${reason}). Receipt/milestone entitlements are NOT restored automatically.`, 'inv'); save(); return OK(`${type} note recorded`);
};
