// Unit tests for the pure functions in <script id="logic">. Run via test/run_tests.sh (JavaScriptCore or Node).
var out = typeof print === 'function' ? print : console.log;
var pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; out('FAIL: ' + name); } }
function eq(a, b, name) { var A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, name + ' (got ' + A + ', want ' + B + ')'); }

// ---- toCents / fmtCAD ----
eq(toCents('12.34'), 1234, 'toCents basic');
eq(toCents('0.1'), 10, 'toCents one decimal');
eq(toCents('.5'), 50, 'toCents leading dot');
eq(toCents('$1,234.56'), 123456, 'toCents $ and comma');
eq(toCents('CAD 20'), 2000, 'toCents CAD prefix');
eq(toCents('  7 '), 700, 'toCents whitespace');
ok(isNaN(toCents('12.345')), 'toCents rejects 3 decimals');
ok(isNaN(toCents('-5')), 'toCents rejects negative');
ok(isNaN(toCents('abc')), 'toCents rejects text');
ok(isNaN(toCents('')), 'toCents rejects empty');
ok(isNaN(toCents('1.2.3')), 'toCents rejects 1.2.3');
eq(toCents(0.29), 29, 'toCents number 0.29 (float trap)');
eq(toCents(1.005), 101, 'toCents number 1.005 rounds');
// classic float trap: 0.1 + 0.2 in cents is exact
eq(toCents('0.10') + toCents('0.20'), toCents('0.30'), 'cents addition exact');
eq(fmtCAD(0), '$0.00', 'fmt zero');
eq(fmtCAD(5), '$0.05', 'fmt 5c');
eq(fmtCAD(123456), '$1,234.56', 'fmt thousands');
eq(fmtCAD(-75000), '-$750.00', 'fmt negative');
eq(fmtCAD(100000000), '$1,000,000.00', 'fmt million');
eq(centsToInput(1205), '12.05', 'centsToInput');
for (var k = 0; k < 2000; k++) { var c = Math.floor(Math.random() * 1e8); if (toCents(centsToInput(c)) !== c || toCents(fmtCAD(c)) !== c) { ok(false, 'roundtrip ' + c); break; } }
ok(true, 'roundtrip 2000 random amounts');

// ---- splitEqual ----
eq(splitEqual(1000, ['a', 'b', 'c']), { a: 334, b: 333, c: 333 }, 'split $10 three ways');
eq(splitEqual(11842, ['a', 'b', 'c', 'd']), { a: 2961, b: 2961, c: 2960, d: 2960 }, 'split hydro 4 ways');
eq(splitEqual(1, ['a', 'b']), { a: 1, b: 0 }, 'split 1 cent');
eq(splitEqual(500, []), {}, 'split nobody');
for (var t = 0; t < 2000; t++) {
  var tot = Math.floor(Math.random() * 1e7), n = 1 + Math.floor(Math.random() * 9), ids = [];
  for (var j = 0; j < n; j++) ids.push('p' + j);
  var sp = splitEqual(tot, ids), vals = ids.map(function (i) { return sp[i]; });
  if (sumValues(sp) !== tot || Math.max.apply(null, vals) - Math.min.apply(null, vals) > 1 || !vals.every(Number.isInteger)) { ok(false, 'splitEqual invariant ' + tot + '/' + n); break; }
}
ok(true, 'splitEqual sums exactly, max diff 1 cent (2000 random)');

// ---- balances ----
var ex = [
  { paidBy: 'a', amount: 9000, shares: splitEqual(9000, ['a', 'b', 'c']) },
  { paidBy: 'b', amount: 3000, shares: { a: 1000, c: 2000 } },
  { paidBy: 'c', amount: 1000, shares: { b: 1000 } } // settlement c -> b
];
var bal = computeBalances(['a', 'b', 'c', 'd'], ex);
eq(bal, { a: 5000, b: -1000, c: -4000, d: 0 }, 'computeBalances');
eq(sumValues(bal), 0, 'balances sum to zero');

// ---- settleUp ----
function applyTransfers(b, tr) {
  var r = Object.assign({}, b);
  tr.forEach(function (x) { r[x.from] += x.amount; r[x.to] -= x.amount; });
  return r;
}
function allZero(b) { return Object.keys(b).every(function (k) { return b[k] === 0; }); }
// independent optimum: n_nonzero - (max number of disjoint zero-sum groups), by brute-force recursion
function optimalCount(b) {
  var v = Object.keys(b).map(function (k) { return b[k]; }).filter(function (x) { return x !== 0; });
  function maxGroups(arr) {
    if (!arr.length) return 0;
    var first = arr[0], rest = arr.slice(1), best = 0, m = rest.length;
    for (var mask = 0; mask < (1 << m); mask++) {
      var s = first, grp = [], others = [];
      for (var i = 0; i < m; i++) { if (mask & (1 << i)) { s += rest[i]; } else others.push(rest[i]); }
      if (s === 0) best = Math.max(best, 1 + maxGroups(others));
    }
    return best;
  }
  return v.length - maxGroups(v);
}
eq(settleUp({ a: 0, b: 0 }), [], 'settle nothing');
eq(settleUp({ a: 500, b: -500 }), [{ from: 'b', to: 'a', amount: 500 }], 'settle pair');
var r1 = settleUp(bal);
ok(allZero(applyTransfers(bal, r1)), 'settle clears computeBalances case');
eq(r1.length, 2, 'settle 3-person case uses 2 transfers');
// Greedy-trap case: two independent pairs hidden in a larger set. Optimal = 4 transfers for 6 people, greedy would use 5.
var trap = { a: 1000, b: 700, c: -300, d: -1400, e: 600, f: -600 };
var rt = settleUp(trap);
ok(allZero(applyTransfers(trap, rt)), 'trap cleared');
eq(rt.length, optimalCount(trap), 'trap optimal count');
var trap2 = { a: 500, b: 300, c: -500, d: -300, e: 200, f: -100, g: -100 };
eq(settleUp(trap2).length, 4, 'three zero-sum groups -> 4 transfers');
var threw = false; try { settleUp({ a: 1, b: 0 }); } catch (e) { threw = true; }
ok(threw, 'settleUp rejects non-zero-sum input');
// randomized: always clears, never more than n-1, always optimal (n <= 8), only positive integer amounts, no self-transfers
var randFail = null;
for (var it = 0; it < 1500 && !randFail; it++) {
  var n2 = 2 + Math.floor(Math.random() * 7), b2 = {}, s2 = 0;
  for (var q = 0; q < n2 - 1; q++) {
    var v = Math.random() < 0.3 ? (Math.floor(Math.random() * 5) - 2) * 500 : Math.floor(Math.random() * 200001) - 100000;
    b2['p' + q] = v; s2 += v;
  }
  b2['p' + (n2 - 1)] = -s2;
  var tr = settleUp(b2), nz = Object.keys(b2).filter(function (k) { return b2[k] !== 0; }).length;
  if (!allZero(applyTransfers(b2, tr))) randFail = 'not cleared ' + JSON.stringify(b2);
  else if (tr.length > Math.max(0, nz - 1)) randFail = 'too many ' + JSON.stringify(b2);
  else if (tr.length !== optimalCount(b2)) randFail = 'not optimal ' + JSON.stringify(b2) + ' got ' + tr.length + ' want ' + optimalCount(b2);
  else if (!tr.every(function (x) { return Number.isInteger(x.amount) && x.amount > 0 && x.from !== x.to; })) randFail = 'bad transfer ' + JSON.stringify(tr);
}
ok(!randFail, 'settleUp randomized 1500 cases: cleared, optimal, valid' + (randFail ? ' -> ' + randFail : ''));
// realistic end-to-end: many random expenses -> balances -> settle
var people = ['s', 'p', 'm', 'l'], exps = [];
for (var e = 0; e < 300; e++) {
  var amt = 1 + Math.floor(Math.random() * 50000), who = people.filter(function () { return Math.random() < 0.7; });
  if (!who.length) who = ['s'];
  exps.push({ paidBy: people[e % 4], amount: amt, shares: splitEqual(amt, who) });
}
var bigBal = computeBalances(people, exps);
eq(sumValues(bigBal), 0, '300 random expenses: balances sum to exactly 0');
ok(allZero(applyTransfers(bigBal, settleUp(bigBal))), '300 random expenses: settle-up clears');
// larger house (greedy fallback path, n > 16)
var big = {}, sb = 0;
for (var z = 0; z < 19; z++) { big['x' + z] = (z - 9) * 1234; sb += big['x' + z]; }
big.x0 -= sb;
var tb = settleUp(big);
ok(allZero(applyTransfers(big, tb)) && tb.length <= 18, 'n=19 fallback clears with <= n-1 transfers');

// ---- dates & bills ----
eq(weekStart('2026-11-12'), '2026-11-09', 'weekStart Thursday -> Monday');
eq(weekStart('2026-11-09'), '2026-11-09', 'weekStart Monday');
eq(weekStart('2026-11-15'), '2026-11-09', 'weekStart Sunday');
eq(addDays('2026-10-31', 7), '2026-11-07', 'addDays across DST change (Nov 1)');
eq(daysBetween('2026-11-12', '2027-04-30'), 169, 'daysBetween to lease end');
eq(daysBetween('2026-03-01', '2026-03-15'), 14, 'daysBetween across spring DST');
eq(dueDateInMonth(31, 2027, 1), '2027-02-28', 'due day 31 clamps in Feb');
eq(dueDateInMonth(5, 2026, 12), '2027-01-05', 'month overflow to next year');
eq(billStatus({ dueDay: 18, lastPosted: '2026-10' }, '2026-11-12'), { state: 'due', due: '2026-11-18', days: 6 }, 'bill due in 6 days');
eq(billStatus({ dueDay: 1, lastPosted: '2026-11' }, '2026-11-12'), { state: 'paid', due: '2026-12-01', days: 19 }, 'bill paid, next due');
eq(billStatus({ dueDay: 5, lastPosted: '2026-10' }, '2026-11-12'), { state: 'overdue', due: '2026-11-05', days: -7 }, 'bill overdue');
eq(billStatus({ dueDay: 3, lastPosted: '2026-12' }, '2026-12-20'), { state: 'paid', due: '2027-01-03', days: 14 }, 'December -> January');

// ---- chores ----
var ch = { id: 'c1', name: 'Kitchen', rotation: ['a', 'b', 'c'], idx: 0, anchor: '2026-11-02', doneWeek: null, streak: 0, history: [], missLog: [] };
var c1 = markChoreDone(ch, 'a', '2026-11-04');
eq([c1.doneWeek, c1.streak, choreAssignee(c1)], ['2026-11-02', 1, 'a'], 'mark done');
eq(markChoreDone(c1, 'a', '2026-11-05'), c1, 'mark done twice is a no-op');
var c2 = rollChore(c1, '2026-11-12');
eq([c2.anchor, choreAssignee(c2), c2.missLog.length, c2.streak], ['2026-11-09', 'b', 0, 1], 'rotates to b, keeps streak');
var c3 = rollChore(c2, '2026-11-26'); // b and c both missed their weeks
eq([c3.anchor, choreAssignee(c3), c3.missLog.map(function (m) { return m.id; }), c3.streak], ['2026-11-23', 'a', ['b', 'c'], 0], 'two missed weeks (b, c) rotate back to a and log misses');
eq(rollChore(c3, '2026-11-26'), c3, 'roll is idempotent within a week');
var c4 = markChoreDone(c3, 'b', '2026-11-25'); // b covers for a this week
var c5 = undoChore(c4);
eq([c5.doneWeek, c5.history.length, c5.streak], [null, 1, 0], 'undo removes this week only');
var f = choreFairness([c4], ['a', 'b', 'c'], '2026-11-26');
eq(f.per, { a: { done: 1, assigned: 2, missed: 0, balance: -1 }, b: { done: 1, assigned: 1, missed: 1, balance: 0 }, c: { done: 0, assigned: 1, missed: 1, balance: -1 } }, 'fairness: covering counts for the doer, misses for the assignee');
eq(f.behind, [{ id: 'a', by: 1 }, { id: 'c', by: 1 }], 'who is behind');
var c6 = markChoreDone(ch, 'a', '2026-11-04'), lots = rollChore(c6, '2027-11-04');
eq([lots.anchor, lots.missLog.length], ['2027-11-01', 51], 'a year away: 51 misses (first week was done) logged, anchor caught up');
var streakChores = [{ rotation: ['a'], history: [{ by: 'a', date: '2026-10-20' }, { by: 'a', date: '2026-10-28' }, { by: 'a', date: '2026-11-03' }], missLog: [] }];
eq(personStreak(streakChores, 'a', '2026-11-12'), 3, 'streak counts back from last week if this week is open');
streakChores[0].history.push({ by: 'a', date: '2026-11-10' });
eq(personStreak(streakChores, 'a', '2026-11-12'), 4, 'streak includes current week once done');
streakChores[0].missLog.push({ id: 'a', week: '2026-10-26' });
eq(personStreak(streakChores, 'a', '2026-11-12'), 2, 'a miss breaks the streak');

out('\n' + pass + ' passed, ' + fail + ' failed');
if (fail && typeof quit === 'function') quit(1);
if (fail && typeof process !== 'undefined') process.exit(1);
