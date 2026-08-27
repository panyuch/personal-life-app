/*
 * run-all.js — 依次运行所有阶段测试子进程并汇总。
 * 用法：node tests/run-all.js
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const files = [
  'phase0.test.js',
  'phase1.test.js',
  'phase2.test.js',
  'phase3.test.js',
  'phase4.test.js',
  'phase5.test.js',
  'diet-modules.test.js',
  'phase6.test.js',
  'chart-seam.test.js',
  'theming.test.js',
  'acceptance.test.js',
];

const node = process.execPath;
const results = [];
for (const f of files) {
  const p = path.join(__dirname, f);
  process.stdout.write('\n========== 运行 ' + f + ' ==========\n');
  let out = '';
  let code = 0;
  try {
    out = execFileSync(node, [p], { encoding: 'utf8' });
  } catch (e) {
    code = e.status || 1;
    out = (e.stdout || '') + '\n' + (e.stderr || '');
  }
  process.stdout.write(out);
  const m = out.match(/通过 (\d+) 项，失败 (\d+) 项/);
  const passed = m ? +m[1] : 0;
  const failed = m ? +m[2] : (code ? '?' : 0);
  results.push({ file: f, passed: passed, failed: failed, ok: code === 0 });
}

console.log('\n\n══════════════════════════════════════');
console.log('阶段测试汇总');
console.log('══════════════════════════════════════');
let totalPass = 0, totalFail = 0, allOk = true;
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.file + '  —  通过 ' + r.passed + '，失败 ' + r.failed);
  totalPass += r.passed; totalFail += (typeof r.failed === 'number' ? r.failed : 999);
  if (!r.ok) allOk = false;
}
console.log('────────────────────────────────────────');
console.log('合计：通过 ' + totalPass + ' 项，失败 ' + totalFail + ' 项');
console.log(allOk ? '✅ 全部阶段测试通过' : '❌ 存在失败，请检查');
process.exit(allOk ? 0 : 1);
