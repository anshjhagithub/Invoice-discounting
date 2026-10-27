/* boot.js — load persisted demo data (or seed), then start the router */
(function boot() {
  let stored = loadStored();
  const valid = s => s && s.meta && s.pos && s.invoices && s.milestones && s.grns && s.srns && s.claims && s.audit && s.adjustments && s.seq && s.pos.every(p => p.type && p.office);
  if (valid(stored)) db = stored; else seedDb('default');
  A.sweep();                                                      // E23: invoices stuck in matching for > 24h fail and release their hold
  window.addEventListener('storage', e => { if (e.key === STORE_KEY && e.newValue) { const s2 = loadStored(); if (valid(s2)) db = s2; } });   // E21: another tab changed balances — this tab sees them at submit (STALE check)
  window.addEventListener('hashchange', render);
  if (!location.hash || location.hash === '#') location.hash = '#/pos'; else render();
  window.DICE = { get db() { return db; }, reset: () => { seedDb('default'); render(); } };   // handy for demos / debugging
})();
