/* boot.js — load persisted demo data (or seed), then start the router */
(function boot() {
  let stored = loadStored();
  const valid = s => s && s.meta && s.pos && s.invoices && s.milestones && s.grns && s.srns && s.claims && s.audit && s.adjustments && s.seq;
  if (valid(stored)) db = stored; else seedDb('default');
  window.addEventListener('hashchange', render);
  if (!location.hash || location.hash === '#') location.hash = '#/dashboard'; else render();
  window.DICE = { get db() { return db; }, reset: () => { seedDb('default'); render(); } };   // handy for demos / debugging
})();
