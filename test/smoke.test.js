// Smoke test: runs the real <script id="app"> against a tiny fake DOM and drives it through clicks and form submits.
// Prepended to the logic script + app script by run_tests.sh.
var out = typeof print === 'function' ? print : console.log;
var pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; out('FAIL: ' + name); } }

function el(extra) {
  var e = { value: '', hidden: false, disabled: false, checked: false, dataset: {}, style: {}, textContent: '', innerHTML: '',
    classList: { add: function () {}, remove: function () {} },
    addEventListener: function (t, f) { (this._h = this._h || {})[t] = f; },
    querySelector: function () { return el(); }, querySelectorAll: function () { return []; },
    focus: function () {}, closest: function () { return null; }, setAttribute: function () {}, removeAttribute: function () {},
    getAttribute: function () { return null; }, contains: function () { return false; } };
  for (var k in extra) e[k] = extra[k];
  return e;
}
var store = {};
var localStorage = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
var root = el(), toastEl = el(), docHandlers = {}, attrs = {};
var currentForm = null;
var dlg = el({ open: false, showModal: function () { this.open = true; }, close: function () { this.open = false; },
  querySelector: function (s) { return s === 'form' ? currentForm : el(); } });
var document = {
  activeElement: null, body: {}, hidden: false,
  documentElement: { getAttribute: function (k) { return attrs[k] || null; }, setAttribute: function (k, v) { attrs[k] = v; }, removeAttribute: function (k) { delete attrs[k]; } },
  querySelector: function (s) { return s === '#root' ? root : s === '#toast' ? toastEl : s === '#dlg' ? dlg : null; },
  querySelectorAll: function () { return []; },
  addEventListener: function (t, f) { docHandlers[t] = f; },
  createElement: function () { return el(); }, execCommand: function () { return false; }
};
var window = { addEventListener: function () {}, scrollTo: function () {}, isSecureContext: false, console: { error: function (e) { out('console.error: ' + e + '\n' + (e && e.stack)); } } };
var location = { hash: '' }, history = { replaceState: function () {} }, navigator = {};
var timers = [];
function setTimeout(f) { timers.push(f); return timers.length; }
function clearTimeout() {}
var lastToast = function () { return toastEl.textContent; };

function click(act, data) {
  var btn = { dataset: Object.assign({ act: act }, data || {}), disabled: false };
  docHandlers.click({ target: { closest: function () { return btn; } } });
}
function state() { return JSON.parse(store['roommies.v1']); }
// Build a fake <form> for the dialog. fields: name -> value; checked: list of member ids for input[name=who]
function fakeForm(fields, checked) {
  var elements = {};
  Object.keys(fields).forEach(function (k) { elements[k] = el({ value: fields[k], name: k, checked: fields[k] === true }); });
  return el({
    elements: new Proxy(elements, { get: function (t, k) { return k in t ? t[k] : el({ name: String(k) }); } }),
    querySelectorAll: function (s) { return s.indexOf('[name=who]:checked') >= 0 ? (checked || []).map(function (v) { return el({ value: v }); }) : []; },
    querySelector: function (s) { return s === '.form-error' ? errEl : el(); }
  });
}
var errEl = el();
function submitDialog(fields, checked) {
  errEl.textContent = '';
  // re-open hook: the app attached 'submit' to the form returned by dlg.querySelector('form')
  var f = currentForm;
  var src = fakeForm(fields, checked);
  f.elements = src.elements; f.querySelectorAll = src.querySelectorAll;
  f._h.submit({ preventDefault: function () {} });
  return f;
}
function openWith(act, data) {
  dlg.open = false; // like pressing Cancel on any dialog still open
  currentForm = fakeForm({});
  click(act, data);
}
