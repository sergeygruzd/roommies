#!/bin/sh
# Extracts the inline scripts from index.html and runs the tests with Node if present,
# otherwise with macOS's built-in JavaScriptCore (jsc).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$HERE/.build"
mkdir -p "$BUILD"
python3 -I - "$HERE/../index.html" "$BUILD" <<'EOF'
import re, sys
html = open(sys.argv[1], encoding='utf-8').read()
def grab(i):
    m = re.search(r'<script id="%s">(.*?)</script>' % i, html, re.S)
    assert m, 'missing script ' + i
    return m.group(1)
open(sys.argv[2] + '/logic.js', 'w', encoding='utf-8').write(grab('logic'))
open(sys.argv[2] + '/app.js', 'w', encoding='utf-8').write(grab('app'))
EOF
cat "$BUILD/logic.js" "$HERE/logic.test.js" > "$BUILD/unit.js"
cat "$HERE/smoke.test.js" "$BUILD/logic.js" "$BUILD/app.js" "$HERE/smoke.after.js" > "$BUILD/smoke.js"
# Storage that throws on every access: the app must still boot and render.
{ cat "$HERE/smoke.test.js"
  echo "localStorage = { getItem: function () { throw new Error('denied'); }, setItem: function () { throw new Error('denied'); }, removeItem: function () { throw new Error('denied'); } };"
  cat "$BUILD/logic.js" "$BUILD/app.js"
  echo "ok(/Try the demo/.test(root.innerHTML) && /Storage is unavailable/.test(root.innerHTML), 'boots with blocked storage');"
  echo "click('demo'); ok(/Lester St House/.test(root.innerHTML) && /Storage is unavailable/.test(root.innerHTML), 'demo works in memory with blocked storage');"
  echo "click('tab', { v: 'money' }); ok(/Settle up/.test(root.innerHTML), 'money tab renders without storage');"
  echo "out(pass + ' passed, ' + fail + ' failed'); if (fail && typeof quit === 'function') quit(1);"
} > "$BUILD/nostorage.js"
# Corrupted saved data must not brick the app.
{ cat "$HERE/smoke.test.js"
  echo "store['roommies.v1'] = '{\"house\":{},\"board\":{},\"members\":[{\"id\":\"x\"}],\"expenses\":[{\"paidBy\":\"x\",\"amount\":5,\"shares\":{\"y\":5}}],\"bills\":[],\"chores\":[{\"rotation\":[]}],\"shopping\":[],\"activity\":[]}';"
  cat "$BUILD/logic.js" "$BUILD/app.js"
  echo "ok(root.innerHTML.length > 100, 'renders something with odd saved data');"
  echo "store['roommies.v1'] = '{not json'; out(pass + ' passed, ' + fail + ' failed'); if (fail && typeof quit === 'function') quit(1);"
} > "$BUILD/corrupt.js"

if command -v node >/dev/null 2>&1; then RUN="node"; else
  RUN="/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"; fi
echo "Runtime: $RUN"
status=0
for t in unit smoke nostorage corrupt; do
  echo "== $t =="
  "$RUN" "$BUILD/$t.js" || status=1
done
exit $status
