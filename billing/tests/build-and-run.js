/* node tests/build-and-run.js — concatenates core + logic + seed + the scenario tests and runs them headless */
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const src = ['core.js', 'logic.js', 'seed.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + '\n' + fs.readFileSync(path.join(__dirname, 'scenarios.test.js'), 'utf8');
vm.runInNewContext(src, { console, Date, Math, JSON, Number, String, Array, Set, Object, Intl });
/* edge-case suite (PRD v1.3 section 5) runs in its own context */
const edge = ['core.js', 'logic.js', 'seed.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join(String.fromCharCode(10)) + String.fromCharCode(10) + fs.readFileSync(path.join(__dirname, 'edge.test.js'), 'utf8');
vm.runInNewContext(edge, { console, Date, Math, JSON, Number, String, Array, Set, Object, Intl });
