/* boot.js — load persisted demo data (or seed), then start the router */
(function boot() {
  const stored = loadStored();
  const valid = s => s && s.meta && s.meta.settings && s.programmes && s.profiles && s.invoices && s.requests && s.psb && s.vendors && s.events && s.seq && s.cache;
  if (valid(stored)) db = stored; else { seedDb('default'); save(); }
  sweepHolds();                                                  // flag (never auto-release) requests with no partner status for too long
  window.addEventListener('storage', e => { if (e.key === STORE_KEY && e.newValue) { const s2 = loadStored(); if (valid(s2)) db = s2; } });
  window.addEventListener('hashchange', render);
  if (!location.hash || location.hash === '#') location.hash = '#/avail'; else render();
  window.DICE = { get db() { return db; }, reset: () => { seedDb('default'); save(); render(); } };   // handy for demos / debugging
})();
