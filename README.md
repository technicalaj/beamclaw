# BeamClaw — agents delivered by light

**Talk to a chip; it comes alive by light.** Describe a behaviour in plain words — BeamClaw
compiles a tiny, safety-checked program and **beams it through your screen's light** to a $3,
radio-less Arduino, which then runs it **forever, offline**. No IDE, no USB cable, no WiFi.

🌐 **Live:** https://beam-claw.com  ·  Not "an LLM in 2 KB" (impossible) — **LLM-compiled agency in 2 KB.**

---

## Quick start
1. **Flash once** — open [`flash.html`](flash.html) in desktop Chrome/Edge, plug in an Arduino Uno, click **Flash**. Installs the firmware over Web Serial — no Arduino IDE. You only do this once.
2. **Wire a light sensor** — a 3-pin LDR module: `S→A0`, `+→5V`, `−→GND`. Point it at your screen. (Diagram on the flash page.)
3. **Talk to it** — open [`app.html`](app.html), type e.g. *"blink when it gets dark"*. Built-ins are free; add your own Anthropic key for free-form requests. Hold the sensor to the panel and press **Beam**.

The chip stores the program and runs it offline forever. Re-beam any time to change it.

## How it works
`English → compile + safety-check (off-chip) → frame · whiten · CRC → LIGHT (screen→LDR) → chip stores to EEPROM → 2 KB virtual machine runs it forever.`
Full write-up, wiring, instruction set and limitations in [`docs.html`](docs.html).

## What's in here
```
beamclaw/
├─ index.html · app.html · flash.html · docs.html   the website (static, no build step)
├─ assets/       style.css, app.js (console engine), flash.js (Web Serial flasher),
│                fx.js, firmware.js (embedded firmware), diagrams, icons, og image
├─ firmware/     beamclaw_agent.ino (source) + beamclaw_agent.hex (compiled)
└─ _smoke/       smoke.sh — pre-deploy checks
```

## Deploy (GitHub Pages)
Push this folder to a repo, then **Settings → Pages → Deploy from branch → `main` / root**.
Add the custom domain `beam-claw.com` and point your DNS at GitHub Pages. HTTPS is automatic —
**do not buy an SSL certificate.** (Netlify / Cloudflare Pages work the same way: drag-drop, free HTTPS.)
Run `bash _smoke/smoke.sh` before shipping.

> Note: one-click flashing needs **desktop Chrome or Edge** over `https://` or `localhost`
> (Web Serial isn't available in Safari/Firefox or on phones). Everything else works anywhere.

## Status & honesty
Firmware is hardware-confirmed: **498 B RAM / 23% flash** on an ATmega328 (Uno). The optical link
decodes through 70% packet loss in simulation. Today it's slow (~10–15 bps), line-of-sight, one-way,
and unauthenticated — fine for hobby/education use; add an HMAC signature for anything sensitive.

## License
**MIT licensed** — free for anyone to use, modify, and even sell. MIT keeps your copyright notice
attached, so you always get credit; a ⭐ and a link back are appreciated. **"BeamClaw" and the logo
are trademarks of Akash Jayswal** — the name/logo aren't covered by MIT, so fork under a different
name. See [`LICENSE.md`](LICENSE.md).

## Credits
Built on the shoulders of the Claw ecosystem (OpenClaw, ESP-Claw, MimiClaw), plus ggwave,
Microvium, and the Timex Datalink — pioneers of tiny agents and data-over-light/sound.
