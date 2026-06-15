#!/usr/bin/env bash
# BeamClaw deployable smoke test — run from the site root:  bash _smoke/smoke.sh
cd "$(dirname "$0")/.." || exit 1
P=0; F=0
ok(){ echo "  PASS $1"; P=$((P+1)); }
bad(){ echo "  FAIL $1"; F=$((F+1)); }

echo "== 1. pages complete (end with </html>) =="
for p in index app flash docs; do
  case "$(tail -c 24 "$p.html" | tr -d '\n ')" in *"</html>") ok "$p.html closed";; *) bad "$p.html NOT closed";; esac
done

echo "== 2. required scripts present =="
grep -q 'assets/fx.js' index.html && ok "index loads fx.js" || bad "index fx.js"
grep -q 'assets/fx.js' app.html && grep -q 'assets/app.js' app.html && ok "app loads fx+app" || bad "app scripts"
grep -q 'assets/firmware.js' flash.html && grep -q 'assets/flash.js' flash.html && grep -q 'assets/fx.js' flash.html && ok "flash loads fx+firmware+flash" || bad "flash scripts"

echo "== 3. assets exist =="
for a in assets/style.css assets/app.js assets/flash.js assets/firmware.js assets/fx.js assets/og.png assets/logo.svg assets/favicon.svg assets/wiring-diagram.svg assets/architecture.svg firmware/beamclaw_agent.hex firmware/beamclaw_agent.ino robots.txt sitemap.xml; do
  [ -f "$a" ] && ok "$a" || bad "$a MISSING"; done

echo "== 4. JS syntax =="
for j in assets/app.js assets/flash.js assets/fx.js assets/firmware.js; do node --check "$j" 2>/dev/null && ok "syntax $j" || bad "syntax $j"; done

echo "== 5. reveal failsafe (no blank page) =="
grep -q "html:not(.fx) .reveal" assets/style.css && ok "css failsafe" || bad "css failsafe"
grep -q "classList.add('fx')" assets/fx.js && ok "fx flag" || bad "fx flag"

echo "== 6. required element IDs =="
miss=0; for id in pad stage beamBtn bstat pb confirm copies remember say send chat chips key bit devBtn setBtn; do grep -q "id=\"$id\"" app.html || miss=1; done; [ $miss = 0 ] && ok "app.html IDs" || bad "app.html IDs"
miss=0; for id in flashBtn wsStatus fprog fstat log done fhelp fhelpToggle; do grep -q "id=\"$id\"" flash.html || miss=1; done; [ $miss = 0 ] && ok "flash.html IDs" || bad "flash.html IDs"

echo "== 7. license = MIT, no stale NC =="
{ grep -q "MIT License" LICENSE.md && ! grep -rqi --exclude-dir=_smoke "Noncommercial\|PolyForm" .; } && ok "MIT, no stale NC" || bad "license inconsistent"

echo "== 8. no NUL bytes in pages =="
n=0; for p in index app flash docs; do [ "$(tr -cd '\000' < $p.html | wc -c)" != "0" ] && n=$((n+1)); done
[ "$n" = "0" ] && ok "no NUL corruption" || bad "$n page(s) have NUL bytes"

echo "== 9. pin parser (the reported bug) =="
cat > /tmp/_pintest.js <<'JS'
const fs=require("fs");
const s=fs.readFileSync(process.argv[1],"utf8");
const m=s.match(/function findPin\(t\)\{[\s\S]*?return null\}/);
if(!m){console.log("  findPin not found"); process.exit(2);}
eval(m[0]);
const C=[["blink pin 8",8],["blink led 8",8],["read a2",16],["d8",8],["gpio 9",9],["turn off pin 12",12],["relay 7",7],["blink the led",13]];
let p=0; for(const x of C){ if(findPin(x[0])===x[1]) p++; else console.log("    miss:",x[0],"->",findPin(x[0]),"exp",x[1]); }
console.log("  pin-parser "+p+"/"+C.length);
process.exit(p===C.length?0:3);
JS
node /tmp/_pintest.js assets/app.js && ok "pin parser" || bad "pin parser"

echo ""; echo "==== RESULT: $P passed, $F failed ===="
exit $F
