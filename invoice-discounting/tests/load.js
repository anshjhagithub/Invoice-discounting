/* Loads the DOM-free layers into one scope (they share top-level consts, exactly as the browser does with <script> tags). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const FILES = ['core.js', 'id-schema.js', 'id-validate.js', 'id-gateway.js', 'id-logic.js', 'id-seed.js'];
module.exports = function load(testBody) {
  const src = FILES.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n;\n');
  return vm.runInThisContext(`(function(){\n${src}\n;return (${testBody.toString()})();\n})()`);
};
