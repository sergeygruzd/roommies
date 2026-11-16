// Scenario run after the app script has booted against the fake DOM.
function today() { return toISO(new Date()); }
function clean(name) {
  var h = root.innerHTML;
  ok(h.length > 200, name + ': rendered');
  ok(!/undefined|NaN|\[object Object\]/.test(h), name + ': no undefined/NaN in HTML' + (/(.{60}(undefined|NaN).{60})/.exec(h) || [''])[0]);
}
ok(/Try the demo/.test(root.innerHTML), 'onboarding shown when there is no data');
click('demo');
var S0 = state();
ok(S0.members.length === 4 && S0.house.name === 'Lester St House', 'demo house loaded and persisted');
clean('home');
['money', 'chores', 'shopping', 'house', 'home'].forEach(function (t) { click('tab', { v: t }); clean('tab ' + t); });
click('tab', { v: 'money' });
['overview', 'expenses', 'bills'].forEach(function (v) { click('money-view', { v: v }); clean('money ' + v); });
['rent', 'utilities', 'groceries', 'internet', 'other', 'settlement', 'all'].forEach(function (c) { click('money-view', { v: 'expenses' }); click('exp-cat', { v: c }); clean('filter ' + c); });

var ids = S0.members.map(function (m) { return m.id; });
var b0 = computeBalances(ids, S0.expenses);
ok(sumValues(b0) === 0, 'demo balances sum to zero');
out('Demo balances: ' + ids.map(function (i) { return i.slice(2) + ' ' + fmtCAD(b0[i]); }).join(', '));
var trs = settleUp(b0);
out('Demo settle-up: ' + trs.map(function (x) { return x.from.slice(2) + '->' + x.to.slice(2) + ' ' + fmtCAD(x.amount); }).join(', '));
ok(trs.length <= 3, 'demo settles in <= 3 transfers');

// Chores: demo has someone behind
click('tab', { v: 'chores' });
ok(/behind/.test(root.innerHTML), 'fairness meter shows who is behind');
var F = choreFairness(S0.chores, ids, today());
out('Demo fairness: ' + ids.map(function (i) { var p = F.per[i]; return i.slice(2) + ' done ' + p.done + '/assigned ' + p.assigned; }).join(', '));
var mine = S0.chores.filter(function (c) { return choreAssignee(c) === 'm_sergey' && c.doneWeek !== c.anchor; })[0];
ok(!!mine, 'Sergey has an open chore this week');
click('done-chore', { id: mine.id });
var m2 = state().chores.filter(function (c) { return c.id === mine.id; })[0];
ok(m2.doneWeek === m2.anchor && m2.history[m2.history.length - 1].by === 'm_sergey', 'mark done persists');
ok(/Nice work/.test(lastToast()), 'toast after chore');
click('undo-chore', { id: mine.id });
ok(state().chores.filter(function (c) { return c.id === mine.id; })[0].doneWeek === null, 'undo chore');

// Add expense (equal)
var n0 = state().expenses.length;
openWith('add-expense');
ok(dlg.open, 'expense dialog opens');
submitDialog({ desc: 'Test groceries', amount: '100.00', date: today(), paidBy: 'm_priya', category: 'groceries', mode: 'equal' }, ids);
var S1 = state();
ok(S1.expenses.length === n0 + 1 && sumValues(S1.expenses[0].shares) === 10000 && !errEl.textContent, 'equal expense added, shares sum to total');
ok(computeBalances(ids, S1.expenses).m_priya - computeBalances(ids, S0.expenses).m_priya === 7500, 'payer credited 3/4 of $100');
// custom split, wrong total -> error, nothing added
openWith('add-expense');
submitDialog({ desc: 'Pizza', amount: '30.00', date: today(), paidBy: 'm_sergey', category: 'other', mode: 'custom', c_m_sergey: '10', c_m_priya: '10', c_m_marcus: '5' }, ['m_sergey', 'm_priya', 'm_marcus']);
ok(/add up to \$25\.00 but the total is \$30\.00/.test(errEl.textContent) && state().expenses.length === n0 + 1, 'custom split mismatch rejected: ' + errEl.textContent);
openWith('add-expense');
submitDialog({ desc: 'Pizza', amount: '30.00', date: today(), paidBy: 'm_sergey', category: 'other', mode: 'custom', c_m_sergey: '10', c_m_priya: '10', c_m_marcus: '10.00' }, ['m_sergey', 'm_priya', 'm_marcus']);
ok(state().expenses.length === n0 + 2 && state().expenses[0].splitMode === 'custom', 'custom split accepted');
openWith('add-expense');
submitDialog({ desc: 'Bad', amount: '12.345', date: today(), paidBy: 'm_sergey', category: 'other', mode: 'equal' }, ids);
ok(/max 2 decimals/.test(errEl.textContent), 'rejects 3-decimal amount');

// Recurring bill: log hydro
var hydro = state().bills.filter(function (b) { return b.name === 'Hydro'; })[0];
ok(billStatus(hydro, today()).state !== 'paid', 'hydro not yet paid this month');
openWith('post-bill', { id: hydro.id });
submitDialog({ amount: '131.07', paidBy: 'm_priya' });
var hy2 = state().bills.filter(function (b) { return b.name === 'Hydro'; })[0];
ok(billStatus(hy2, today()).state === 'paid' && state().expenses[0].amount === 13107, 'hydro logged & split');
// Add bill
openWith('add-bill');
submitDialog({ name: 'Gas (Enbridge)', amount: '85', day: '31', category: 'utilities', paidBy: 'm_lena' }, ids);
ok(state().bills.length === 4 && state().bills[3].dueDay === 31, 'bill added');

// Shopping: add, claim, buy -> expense
docHandlers.submit({ target: { dataset: { form: 'shop-add' }, elements: { item: { value: '  Milk 2% ' } } }, preventDefault: function () {} });
var milk = state().shopping[0];
ok(milk.name === 'Milk 2%' && milk.addedBy === 'm_sergey', 'shopping item added');
click('claim', { id: milk.id });
ok(state().shopping[0].claimedBy === 'm_sergey', 'claimed');
var n1 = state().expenses.length;
openWith('bought', { id: milk.id });
submitDialog({ share: true, desc: 'Milk 2%', amount: '6.49', date: today(), paidBy: 'm_sergey', category: 'groceries', mode: 'equal' }, ids);
ok(state().expenses.length === n1 + 1 && state().shopping[0].done === true, 'bought item becomes an expense');
click('clear-bought');
ok(state().shopping.every(function (i) { return !i.done; }), 'clear bought');

// Settle everything
var Sx = state(), bx = computeBalances(ids, Sx.expenses);
settleUp(bx).forEach(function (t) {
  openWith('settle', { from: t.from, to: t.to, amt: String(t.amount) });
  submitDialog({ amount: centsToInput(t.amount) });
});
var bz = computeBalances(ids, state().expenses);
ok(ids.every(function (i) { return bz[i] === 0; }), 'after recording settle-up payments everyone is at $0.00');
click('tab', { v: 'money' }); click('money-view', { v: 'overview' });
ok(/Everyone is square/.test(root.innerHTML), 'overview shows all square');
openWith('settle', { from: 'm_lena', to: 'm_sergey', amt: '1000' });
submitDialog({ amount: '20.00' });
ok(/more than/.test(errEl.textContent), 'overpaying a transfer is rejected');
dlg.open = false; // user cancels

// House board
click('tab', { v: 'house' });
ok(!/goose-honk-2026/.test(root.innerHTML), 'wifi password masked by default');
click('toggle-pass');
ok(/goose-honk-2026/.test(root.innerHTML), 'wifi password revealed');
ok(/Lease ends/.test(root.innerHTML) && /Notice deadline/.test(root.innerHTML), 'key dates countdown');
docHandlers.submit({ target: { dataset: { form: 'rule-add' }, elements: { rule: { value: 'No <script> in rules' } } }, preventDefault: function () {} });
ok(/No &lt;script&gt; in rules/.test(root.innerHTML), 'user text is HTML-escaped');
click('invite');
ok(/roommies\.app\/join\/lester-st-house/.test(lastToast()), 'invite toast: ' + lastToast());
click('theme'); ok(attrs['data-theme'] === 'light', 'theme -> light');
click('theme'); ok(attrs['data-theme'] === 'dark', 'theme -> dark');
click('theme'); ok(!attrs['data-theme'], 'theme -> system');
// Add + remove a housemate
openWith('add-mate');
submitDialog({ name: 'Jordan', emoji: '🦊', color: 'sky' });
var jordan = state().members.filter(function (m) { return m.name === 'Jordan'; })[0];
ok(!!jordan, 'housemate added');
openWith('del-mate', { id: jordan.id });
submitDialog({});
ok(!state().members.some(function (m) { return m.name === 'Jordan'; }), 'settled housemate removed');
// Can't remove someone who owes money
openWith('add-expense');
submitDialog({ desc: 'Snacks', amount: '9.00', date: today(), paidBy: 'm_sergey', category: 'groceries', mode: 'equal' }, ids);
click('del-mate', { id: 'm_lena' });
ok(/Settle first/.test(lastToast()) && state().members.length === 4, 'cannot remove unsettled housemate');
// Activity feed
click('tab', { v: 'home' });
ok(state().activity.length > 10 && /Recent activity/.test(root.innerHTML), 'activity feed populated');
// Delete expense
var lastExp = state().expenses[0];
openWith('del-expense', { id: lastExp.id });
submitDialog({});
ok(!state().expenses.some(function (e) { return e.id === lastExp.id; }), 'expense deleted');
// Reset -> onboarding -> start fresh
openWith('reset'); submitDialog({});
ok(!store['roommies.v1'] && /Try the demo/.test(root.innerHTML), 'reset returns to onboarding');
click('start-fresh');
ok(/Set up your house/.test(root.innerHTML), 'setup form');
var fakeInputs = { '#su-name': el({ value: 'Columbia St Townhouse' }), '#su-addr': el({ value: '' }) };
var mates = [el({ value: 'Sergey', dataset: { mate: '0', field: 'name' } }), el({ value: 'Ana', dataset: { mate: '1', field: 'name' } })];
var origQ = document.querySelector, origQA = document.querySelectorAll;
document.querySelector = function (s) { return fakeInputs[s] || origQ(s); };
document.querySelectorAll = function (s) { return s === '[data-mate]' ? mates : []; };
docHandlers.submit({ target: { dataset: { form: 'setup' } }, preventDefault: function () {} });
document.querySelector = origQ; document.querySelectorAll = origQA;
var F2 = state();
ok(F2.house.name === 'Columbia St Townhouse' && F2.members.length === 2 && F2.members[0].name === 'Sergey' && F2.me === F2.members[0].id, 'start fresh creates house');
clean('fresh home');
['money', 'chores', 'shopping', 'house'].forEach(function (t) { click('tab', { v: t }); clean('fresh ' + t); });
// Fresh house: add chore via dialog
openWith('add-chore');
submitDialog({ name: 'Fridge clean-out', emoji: '🧊', first: F2.members[1].id }, F2.members.map(function (m) { return m.id; }));
ok(state().chores.length === 1 && choreAssignee(state().chores[0]) === F2.members[1].id, 'chore added with chosen first assignee');

out('\n' + pass + ' passed, ' + fail + ' failed');
if (fail && typeof quit === 'function') quit(1);
