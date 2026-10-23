/* node tests/build-and-run.js — concatenates core + logic + seed + the scenario tests and runs them headless */
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const src = ['core.js', 'logic.js', 'seed.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + '\n' + fs.readFileSync(path.join(__dirname, 'scenarios.test.js'), 'utf8');
vm.runInNewContext(src, { console, Date, Math, JSON, Number, String, Array, Set, Object, Intl });
