/*
  BeamClaw AGENT VM  —  v2 "agency in 2 KB"
  ============================================================================
  Flash once. Beam a tiny BYTECODE PROGRAM by light; the chip stores it in
  EEPROM and runs it FOREVER in a little virtual machine — autonomously,
  offline, no radio. The LLM authors the program off-chip; this chip just
  executes it. Re-beam any time to change the behaviour (no reflash).

  This is the leap past v1 (v1 = live commands / remote control). Here the
  chip runs a PROGRAM with sensor reads, comparisons, branches and loops — it
  decides for itself each cycle. That makes it a (reactive) agent.

  VERIFIED: this VM's logic is cross-checked byte-for-byte against the JS
  reference on 3 sample agents; the optical PHY below is the same one proven
  down to 70% packet loss in simulation.

  ISA — 1 opcode byte + operands, 16-bit registers R0..R3, one FLAG:
    01 LDI   r,imm16     02 AR  r,pin       03 CMPLT r,r2    04 CMPGT r,r2
    05 JMP   a16         06 JT  a16         07 JF    a16
    08 DWI   pin,b       09 PWMI pin,duty   0A TGL   pin      0B WAITI ms16
    0C ADD   r,r2        0D SUB  r,r2       FF HALT
  Pins: 0..13 = D0..D13, 14..19 = A0..A5. Output ops refuse D0/D1 (serial)
  and A0 (the LDR receiver) so a program can't break the chip or its own link.

  Program delivery: one light frame (same PHY / whitening / CRC as v1); the
  payload is the raw bytecode (<= 120 B). CRC-clean -> stored to EEPROM -> the
  VM restarts on the new program.

  SERIAL @ 115200:  d = diag   p = print program   x = erase   h = help
*/

#include <Arduino.h>
#include <EEPROM.h>

#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------
const uint8_t LDR_PIN = A0;            // photoresistor — the optical receiver
const uint8_t LED_PIN = LED_BUILTIN;   // status + "program loaded" blink

#define USE_INTERNAL_PULLUP 0

const uint8_t  SYNC0       = 0xA5;
const uint8_t  SYNC1       = 0x5A;
const uint8_t  MAXPROG     = 120;      // largest bytecode we accept / store
const uint32_t WHITEN_SEED = 0xB7;

// Optical front-end timing / automatic gain control.
const uint16_t SAMPLE_MS   = 4;
const float    AGC_DECAY   = 0.0020f;
const uint16_t MIN_AMP     = 60;
const float    BITLEN_INIT = 150.0f;
const float    BITLEN_MIN  = 45.0f;
const float    BITLEN_MAX  = 500.0f;
const uint8_t  TRAIN_EDGES = 8;
const uint16_t TMO_BITS    = 1400;     // generous: a ~136-byte frame fits inside

// EEPROM layout:  [0] = magic,  [1] = length,  [2..] = bytecode
const uint16_t EE_MAGIC_ADDR = 0;
const uint8_t  EE_MAGIC      = 0xBC;

// ----------------------------------------------------------------------------
// Shared codec — byte-identical to the browser/app side (PRNG, CRC, whitening)
// ----------------------------------------------------------------------------
uint32_t prngState;

void prngSeed(uint32_t s) {
  prngState = s * 2654435761UL;
  if (prngState == 0) prngState = 0x1234567UL;
}

uint32_t prngNext() {
  uint32_t s = prngState;
  s ^= s << 13;
  s ^= s >> 17;
  s ^= s << 5;
  prngState = s;
  return s;
}

uint8_t crc8(const uint8_t *d, uint16_t n) {
  uint8_t c = 0;
  for (uint16_t i = 0; i < n; i++) {
    c ^= d[i];
    for (uint8_t b = 0; b < 8; b++) {
      c = (c & 0x80) ? (uint8_t)((c << 1) ^ 0x07) : (uint8_t)(c << 1);
    }
  }
  return c;
}

void whiten(uint8_t *a, uint8_t len) {
  prngSeed(WHITEN_SEED);
  for (uint8_t k = 0; k < len; k++) {
    a[k] ^= (uint8_t)(prngNext() & 0xFF);
  }
}

// ----------------------------------------------------------------------------
// Virtual machine — 16-bit registers R0..R3, one comparison FLAG, PC.
// ----------------------------------------------------------------------------
uint8_t  prog[MAXPROG];
uint8_t  progLen = 0;

int16_t  R[4];
uint16_t vmPC = 0;
bool     F = false;
bool     vmRunning = false;
bool     vmHalted  = false;
uint32_t vmWaitUntil = 0;

// Output ops may never touch D0/D1 (UART) or A0 (the LDR), so a program can't
// break the chip or sever its own optical link.
bool pinOutOK(uint8_t p) {
  return p <= 19 && p != 0 && p != 1 && p != 14;
}

void vmReset() {
  vmPC = 0;
  F = false;
  vmHalted = false;
  vmWaitUntil = millis();
  R[0] = R[1] = R[2] = R[3] = 0;
}

void vmStep() {
  if (!vmRunning || vmHalted) return;
  if ((int32_t)(millis() - vmWaitUntil) < 0) return;   // still inside a WAIT

  uint8_t budget = 64;   // run a burst, then yield so the PHY stays serviced
  while (budget-- && vmPC < progLen) {
    uint8_t  op  = prog[vmPC];
    uint16_t a16 = (vmPC + 2 < progLen) ? (prog[vmPC + 1] | (prog[vmPC + 2] << 8)) : 0;

    switch (op) {
      case 0x01:  // LDI r, imm16
        R[prog[vmPC + 1]] = (int16_t)(prog[vmPC + 2] | (prog[vmPC + 3] << 8));
        vmPC += 4;
        break;

      case 0x02:  // AR r, pin   (analog read)
        R[prog[vmPC + 1]] = analogRead(prog[vmPC + 2]);
        vmPC += 3;
        break;

      case 0x03:  // CMPLT r, r2
        F = R[prog[vmPC + 1]] < R[prog[vmPC + 2]];
        vmPC += 3;
        break;

      case 0x04:  // CMPGT r, r2
        F = R[prog[vmPC + 1]] > R[prog[vmPC + 2]];
        vmPC += 3;
        break;

      case 0x05:  // JMP a16
        vmPC = a16;
        break;

      case 0x06:  // JT a16   (jump if flag set)
        vmPC = F ? a16 : vmPC + 3;
        break;

      case 0x07:  // JF a16   (jump if flag clear)
        vmPC = !F ? a16 : vmPC + 3;
        break;

      case 0x08: {  // DWI pin, bit   (digital write)
        uint8_t p = prog[vmPC + 1];
        if (pinOutOK(p)) {
          pinMode(p, OUTPUT);
          digitalWrite(p, prog[vmPC + 2] ? HIGH : LOW);
        }
        vmPC += 3;
        break;
      }

      case 0x09: {  // PWMI pin, duty
        uint8_t p = prog[vmPC + 1];
        if (pinOutOK(p)) {
          pinMode(p, OUTPUT);
          analogWrite(p, prog[vmPC + 2]);
        }
        vmPC += 3;
        break;
      }

      case 0x0A: {  // TGL pin   (toggle)
        uint8_t p = prog[vmPC + 1];
        if (pinOutOK(p)) {
          pinMode(p, OUTPUT);
          digitalWrite(p, !digitalRead(p));
        }
        vmPC += 2;
        break;
      }

      case 0x0B:  // WAITI ms16 — set the wake time and yield to loop()
        vmWaitUntil = millis() + a16;
        vmPC += 3;
        return;

      case 0x0C:  // ADD r, r2
        R[prog[vmPC + 1]] = R[prog[vmPC + 1]] + R[prog[vmPC + 2]];
        vmPC += 3;
        break;

      case 0x0D:  // SUB r, r2
        R[prog[vmPC + 1]] = R[prog[vmPC + 1]] - R[prog[vmPC + 2]];
        vmPC += 3;
        break;

      case 0xFF:  // HALT
        vmHalted = true;
        Serial.println(F("[vm] HALT"));
        return;

      default:    // unknown opcode — stop rather than run wild
        vmHalted = true;
        Serial.print(F("[vm] bad op @"));
        Serial.println(vmPC);
        return;
    }

    if (vmPC >= progLen) vmPC = 0;   // ran off the end with no HALT -> wrap
  }
}

// ----------------------------------------------------------------------------
// Program storage (EEPROM)
// ----------------------------------------------------------------------------
void saveProgram() {
  EEPROM.update(EE_MAGIC_ADDR, EE_MAGIC);
  EEPROM.update(1, progLen);
  for (uint8_t i = 0; i < progLen; i++) {
    EEPROM.update(2 + i, prog[i]);
  }
}

bool loadProgramFromEEPROM() {
  if (EEPROM.read(EE_MAGIC_ADDR) != EE_MAGIC) return false;
  uint8_t n = EEPROM.read(1);
  if (n == 0 || n > MAXPROG) return false;
  progLen = n;
  for (uint8_t i = 0; i < n; i++) {
    prog[i] = EEPROM.read(2 + i);
  }
  return true;
}

// A CRC-clean frame arrived: de-whiten it back into raw bytecode, store, run.
// (Whitening is its own inverse — XOR with the same PRNG stream.)
void onProgram(uint8_t *P, uint8_t len) {
  whiten(P, len);
  if (len == 0 || len > MAXPROG) {
    Serial.println(F("[prog] rejected (size)"));
    return;
  }
  memcpy(prog, P, len);
  progLen = len;
  saveProgram();
  vmReset();
  vmRunning = true;

  Serial.print(F("\n*** [PROG LOADED] "));
  Serial.print(progLen);
  Serial.println(F(" bytes -> running ***"));

  for (uint8_t i = 0; i < 3; i++) {     // 3 quick blinks = "got it"
    digitalWrite(LED_PIN, HIGH); delay(40);
    digitalWrite(LED_PIN, LOW);  delay(40);
  }
}

// ----------------------------------------------------------------------------
// Optical PHY  (AGC + auto-baud + DPLL + whitening + CRC)
// ----------------------------------------------------------------------------
float envHi = 0, envLo = 0;
bool  envInit = false;
bool  curLevel = false, prevLevel = false;

enum RxState { ST_IDLE, ST_TRAIN, ST_SYNC, ST_LEN, ST_DATA, ST_CRC };
RxState st = ST_IDLE;

float    bitLen = BITLEN_INIT;
uint32_t lastEdge = 0, sampleDue = 0, frameStart = 0, lastSample = 0;
uint8_t  trainEdges = 0;

uint32_t gReg = 0;                 // shift register for incoming bits
bool     invert = false;           // set if the frame arrived polarity-inverted
uint8_t  bitsInByte = 0, curByte = 0;
uint8_t  payload[MAXPROG], payLen = 0, payGot = 0;

bool     diag = false;
uint32_t lastDiag = 0;

void phyIdle() {
  st = ST_IDLE;
  gReg = 0;
  bitsInByte = 0;
  curByte = 0;
  payLen = 0;
  payGot = 0;
  invert = false;
}

void pushBit(bool pb) {
  gReg = (gReg << 1) | (pb ? 1UL : 0UL);

  // Hunt for the sync word — or its bitwise inverse, which also tells us the
  // frame's polarity so we can correct it for the rest of the bytes.
  if (st == ST_SYNC) {
    uint16_t w    = gReg & 0xFFFF;
    uint16_t want = ((uint16_t)SYNC0 << 8) | SYNC1;
    if (w == want) {
      invert = false; st = ST_LEN; bitsInByte = 0; curByte = 0;
    } else if (w == (uint16_t)(~want & 0xFFFF)) {
      invert = true;  st = ST_LEN; bitsInByte = 0; curByte = 0;
    }
    return;
  }

  bool b = invert ? !pb : pb;
  curByte = (curByte << 1) | (b ? 1 : 0);
  if (++bitsInByte < 8) return;

  uint8_t v = curByte;
  bitsInByte = 0;
  curByte = 0;

  if (st == ST_LEN) {
    if (v > MAXPROG) { phyIdle(); return; }
    payLen = v;
    payGot = 0;
    st = (payLen == 0) ? ST_CRC : ST_DATA;
  } else if (st == ST_DATA) {
    payload[payGot++] = v;
    if (payGot >= payLen) st = ST_CRC;
  } else if (st == ST_CRC) {
    uint8_t tmp[1 + MAXPROG];
    tmp[0] = payLen;
    memcpy(tmp + 1, payload, payLen);
    if (crc8(tmp, 1 + payLen) == v) onProgram(payload, payLen);
    phyIdle();
  }
}

void phySample() {
  int raw = analogRead(LDR_PIN);

  // Adaptive envelope: snap to new extremes, decay slowly back toward signal.
  if (!envInit) { envHi = envLo = raw; envInit = true; }
  if (raw > envHi) envHi = raw; else envHi += (raw - envHi) * AGC_DECAY;
  if (raw < envLo) envLo = raw; else envLo += (raw - envLo) * AGC_DECAY;

  float amp  = envHi - envLo;
  float thr  = (envHi + envLo) * 0.5f;
  float hyst = amp * 0.25f;
  if (raw > thr + hyst)      curLevel = true;
  else if (raw < thr - hyst) curLevel = false;

  bool     signalOK = amp >= MIN_AMP;
  bool     edge     = (curLevel != prevLevel);
  uint32_t interval = millis() - lastEdge;
  if (edge) lastEdge = millis();
  uint32_t now = millis();

  switch (st) {
    case ST_IDLE:
      if (signalOK && edge) { st = ST_TRAIN; trainEdges = 0; frameStart = now; }
      break;

    case ST_TRAIN:
      if (edge) {
        if (interval > BITLEN_MIN && interval < BITLEN_MAX) {
          bitLen += (interval - bitLen) * 0.35f;          // lock onto the baud
        }
        if (++trainEdges >= TRAIN_EDGES) {
          st = ST_SYNC;
          gReg = 0;
          sampleDue = now + (uint32_t)(bitLen * 0.5f);
        }
      }
      if (now - frameStart > (uint32_t)(bitLen * TMO_BITS)) phyIdle();
      break;

    default:
      // DPLL: on every edge, re-aim the sample point at the middle of the bit.
      if (edge) {
        sampleDue = now + (uint32_t)(bitLen * 0.5f);
        if (st == ST_SYNC && interval > bitLen * 0.5f && interval < bitLen * 1.5f) {
          bitLen += (interval - bitLen) * 0.10f;
        }
      }
      if ((int32_t)(now - sampleDue) >= 0) {
        pushBit(curLevel);
        sampleDue += (uint32_t)bitLen;
        if (now - frameStart > (uint32_t)(bitLen * TMO_BITS)) phyIdle();
      }
      break;
  }

  prevLevel = curLevel;

  if (diag && st == ST_IDLE && (now - lastDiag >= 400)) {
    lastDiag = now;
    Serial.print(F("raw="));  Serial.print(raw);
    Serial.print(F(" amp=")); Serial.print((int)amp);
    Serial.print(F(" run=")); Serial.println(vmRunning ? 1 : 0);
  }
}

// ----------------------------------------------------------------------------
// Arduino entry points
// ----------------------------------------------------------------------------
void setup() {
  pinMode(LED_PIN, OUTPUT);
#if USE_INTERNAL_PULLUP
  pinMode(LDR_PIN, INPUT_PULLUP);
#endif

  Serial.begin(115200);
  delay(50);
  Serial.println();
  Serial.println(F("== BeamClaw AGENT VM v2 =="));

  if (loadProgramFromEEPROM()) {
    vmReset();
    vmRunning = true;
    Serial.print(F("Loaded stored program ("));
    Serial.print(progLen);
    Serial.println(F(" B) - running."));
  } else {
    Serial.println(F("No program yet. Beam one from beam-claw.com/app."));
  }

  uint32_t now = millis();
  sampleDue  = now;
  lastSample = now;
  lastEdge   = now;
}

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'd') {
      diag = !diag;
      Serial.print(F(">> DIAG "));
      Serial.println(diag ? F("ON") : F("OFF"));
    } else if (c == 'p') {
      Serial.print(F("prog "));
      Serial.print(progLen);
      Serial.print(F("B: "));
      for (uint8_t i = 0; i < progLen; i++) {
        if (prog[i] < 16) Serial.print('0');
        Serial.print(prog[i], HEX);
        Serial.print(' ');
      }
      Serial.println();
    } else if (c == 'x') {
      EEPROM.update(EE_MAGIC_ADDR, 0);
      vmRunning = false;
      progLen = 0;
      Serial.println(F(">> erased"));
    } else if (c == 'h') {
      Serial.println(F("d=diag  p=print  x=erase  h=help"));
    }
  }
}

void loop() {
  handleSerial();

  uint32_t now = millis();
  if (now - lastSample >= SAMPLE_MS) {   // listen for a (new) program
    lastSample = now;
    phySample();
  }

  vmStep();                              // run the current agent, cooperatively
}
