# 🟡 PARTIAL — BeamClaw live smoke test (beam-claw.com)

**Verdict: PARTIAL · Score 89/100 · All 5 gates GREEN · 0 failures · Coverage 84% (11/13 cells)**
Date: 2026-06-15 · Mode: zero-tolerance · Tested live on https://beam-claw.com

It is **not** PASS for one honest reason: 2 of 13 cells are the **hardware** end-to-end paths
(flash a real Uno, beam light to a physical chip) which cannot be run without a board. Everything
that is testable from a browser **passed with evidence**. The website software itself is solid.

---

## Gates (zero-tolerance overrides)

| Gate | Result |
|---|---|
| G1 build clean (0 errors) | ✅ |
| G2 zero failed scenarios | ✅ |
| G3 every core check verified | ✅ |
| G4 no crash / regression | ✅ |
| G5 actually executed live | ✅ |

## Score breakdown

| Category | Earned | Notes |
|---|---|---|
| build_integrity | 21.1 / 21.1 | 4 pages closed, JS syntax ×4, no NUL, MIT, pin parser 10/10, IDs present |
| core_functionality | 26.3 / 26.3 | clean URLs, no-key engine, all pages render |
| matrix_coverage | 22.3 / 26.3 | 11 passed, 0 failed, 2 blocked (hardware) |
| edge_handling | 6.3 / 12.6 | 404→home verified; malformed console input not tested |
| regression_safety | 8.4 / 8.4 | blank-page bug fixed, fx.js crash fixed |
| performance | n/a | not formally benchmarked (Lighthouse) this run |
| security_safety | 5.3 / 5.3 | no secrets in source (BYOK key stays client-side) |

## Scenario matrix (channel × device × state)

| # | Channel | Device | State | Result | Evidence |
|---|---|---|---|---|---|
| 1 | web UI | desktop | happy | ✅ PASS | `/` → 200, hero render |
| 2 | web UI | desktop | redirect | ✅ PASS | `/index.html` → final URL `/` |
| 3 | web UI | desktop | redirect | ✅ PASS | `/app.html` → `/app` |
| 4 | web UI | desktop | rewrite | ✅ PASS | `/app` serves app.html |
| 5 | web UI | desktop | rewrite | ✅ PASS | `/docs` serves docs.html |
| 6 | web UI | desktop | rewrite | ✅ PASS | `/flash` serves flash.html |
| 7 | web UI | desktop | error-404 | ✅ PASS | bogus path → home (ErrorDocument) |
| 8 | assets | desktop | happy | ✅ PASS | all CSS/JS/SVG → 200, zero 404/500 |
| 9 | console engine | desktop | happy | ✅ PASS | "blink the led" → D13 2 Hz + beam stage |
| 10 | flasher (Web Serial) | desktop Chrome | capability | ✅ PASS | "Web Serial ready", Flash button enabled |
| 11 | web UI | mobile ≤720px | responsive | ✅ VERIFIED* | media query active; hamburger + column nav; grids collapse |
| 12 | flasher | real Uno | end-to-end flash | ⛔ BLOCKED | no board |
| 13 | optical beam | Uno + LDR | end-to-end beam | ⛔ BLOCKED | no hardware |

\*Mobile = verified by live DOM/CSS rule inspection; a 390px pixel screenshot was not captured
(the capture viewport didn't follow the window resize).

## Hard evidence captured
- **Clean URLs**: `/index.html` settled on `/`; `/app.html` settled on `/app`; `/app` `/docs` `/flash`
  all served their pages with the URL staying extensionless; a non-existent path served the home page.
- **No 500 from .htaccess**: every page and asset returned HTTP 200 in the network panel.
- **No blank page**: live DOM showed **0 of 30** `.reveal` elements hidden (the prior bug is fixed).
- **Console**: zero messages/errors across all page loads.
- **Engine**: typed input → correct compiled behaviour, no API key, no crash.
- **Repo integrity**: `_smoke/smoke.sh` green on §1–8; pin parser 10/10.

## What is still UNVERIFIED / BLOCKED
1. **Flashing a real Arduino over Web Serial** — browser capability confirmed, but no board was flashed.
2. **Beaming light to a physical chip → EEPROM → run forever** — the headline demo; needs hardware.
3. **Malformed/empty console input** handling — not exercised this run.
4. **Live mobile pixel render** at 390px — verified by CSS rules, not by screenshot.
5. **Formal performance** (Lighthouse) — not measured.

## Warnings / next actions
- ⚠ **HTTP, not HTTPS** ("Not secure"). Enable cPanel AutoSSL, then uncomment the force-HTTPS block
  already present in `.htaccess`. Do this before wide sharing.
- ⚠ **Nav "GitHub" link** is still the placeholder `https://github.com/` — wire to the real repo.
- To clear cells 12–13 to PASS, run the one-time flash on a real Uno + LDR and beam "blink the led".
