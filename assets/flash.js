"use strict";
/* ===================================================================
   BeamClaw one-click flasher — Intel HEX + STK500v1 (Optiboot) over Web Serial.
   Flashes an Arduino Uno from the browser, no IDE. Desktop Chrome/Edge (incl. on macOS).
=================================================================== */
const HEX_URL='firmware/beamclaw_agent.hex';
const BAUD=115200, PAGE=128;                       // ATmega328P flash page = 128 bytes
const STK_OK=0x10, STK_INSYNC=0x14, CRC_EOP=0x20;

const $=id=>document.getElementById(id);
const supported = ('serial' in navigator);
let port=null, reader=null, writer=null, rbuf=[], readLoopOn=false;

function log(msg,cls){const e=$('log');if(!e)return;const s=document.createElement('span');if(cls)s.className=cls;s.textContent=msg+'\n';e.appendChild(s);e.scrollTop=e.scrollHeight;}
function setProg(p){const e=$('fprog');if(e)e.style.width=Math.round(p*100)+'%';}
function showHelp(){const h=$('fhelp');if(h)h.style.display='block';}
function hideHelp(){const h=$('fhelp');if(h)h.style.display='none';}
const delay=ms=>new Promise(r=>setTimeout(r,ms));

/* ---- turn any failure into a plain-English fix ---- */
function explain(e){
  const m=((e&&e.message)||String(e||'')), n=(e&&e.name)||'';
  if(n==='NotFoundError'||/No port selected|no port chosen|cancell?ed/i.test(m))
    return "No board was selected. Plug your Arduino in with a DATA USB cable (not charge-only), click Flash, and pick its port in the popup.";
  if(n==='SecurityError')
    return "The browser blocked serial access. Open this page over https:// (or localhost) in Chrome or Edge — not as a double-clicked local file.";
  if(n==='InvalidStateError'||n==='NetworkError'||/in use|already open|busy|failed to open|access is denied|denied|cannot open/i.test(m))
    return "The port is busy — another app is holding it. This is almost always the Arduino IDE's Serial Monitor: close the Arduino IDE (and any serial terminal), unplug-replug the board, then click Flash again.";
  if(/timeout|sync|bootloader|unexpected reply|no response/i.test(m))
    return "The board didn't answer the bootloader. Make sure it's a genuine Uno on the right port, try another USB cable/port, or press the board's RESET button right as flashing starts.";
  return m;
}

/* ---- Intel HEX -> flat byte image (0xFF fill) ---- */
function parseHex(text){
  let base=0,max=0;const recs=[];
  for(const raw of text.split(/\r?\n/)){
    const ln=raw.trim(); if(ln[0]!==':')continue;
    const len=parseInt(ln.substr(1,2),16), addr=parseInt(ln.substr(3,4),16), type=parseInt(ln.substr(7,2),16);
    let sum=0; for(let i=1;i<ln.length-1;i+=2) sum=(sum+parseInt(ln.substr(i,2),16))&0xFF;
    if(sum!==0) throw Error('HEX checksum error');
    if(type===0){const a=base+addr,b=[];for(let i=0;i<len;i++)b.push(parseInt(ln.substr(9+i*2,2),16));recs.push({a,b});if(a+len>max)max=a+len;}
    else if(type===2)base=parseInt(ln.substr(9,4),16)<<4;
    else if(type===4)base=parseInt(ln.substr(9,4),16)<<16;
    else if(type===1)break;
  }
  const data=new Uint8Array(max).fill(0xFF);
  for(const r of recs)for(let i=0;i<r.b.length;i++)data[r.a+i]=r.b[i];
  return data;
}

/* ---- serial I/O ---- */
async function startRead(){readLoopOn=true;(async()=>{try{while(readLoopOn){const{value,done}=await reader.read();if(done)break;if(value)for(const b of value)rbuf.push(b);}}catch(e){}})();}
async function wr(bytes){await writer.write(new Uint8Array(bytes));}
async function rd(n,timeout){const t0=performance.now();while(rbuf.length<n){if(performance.now()-t0>timeout)throw Error('no response from board (timeout)');await delay(4);}return rbuf.splice(0,n);}
async function cmd(bytes,timeout=2000){rbuf.length=0;await wr(bytes);const r=await rd(2,timeout);if(r[0]!==STK_INSYNC||r[1]!==STK_OK)throw Error('unexpected reply 0x'+r[0].toString(16)+' 0x'+r[1].toString(16));}

async function pulseReset(){
  try{
    await port.setSignals({dataTerminalReady:true,requestToSend:true}); await delay(120);
    await port.setSignals({dataTerminalReady:false,requestToSend:false}); await delay(120);
  }catch(e){log('  (setSignals not fully supported: '+e.message+')','d');}
  rbuf.length=0;
}
async function sync(){for(let i=0;i<8;i++){try{rbuf.length=0;await wr([0x30,CRC_EOP]);const r=await rd(2,350);if(r[0]===STK_INSYNC&&r[1]===STK_OK){return true;}}catch(e){}await delay(120);}throw Error('could not sync with the bootloader');}

/* ---- pick the port reliably (no filter = no board is ever hidden) ---- */
async function pickPort(){
  const granted=await navigator.serial.getPorts();
  if(granted.length===1){ log('  auto-detected your board (already authorised)','ok'); return granted[0]; }
  if(granted.length>1) log('  multiple authorised ports — pick the right one','d');
  log('Choose your board in the browser popup. All serial ports are shown so none is hidden — pick the USB / Arduino one.');
  return await navigator.serial.requestPort();
}

async function flash(){
  if(busyFlag())return; setBusy(true); $('log').innerHTML=''; setProg(0); hideHelp();
  try{
    log('Loading built-in firmware…');
    if(!window.FW_B64) throw Error('embedded firmware missing (assets/firmware.js not loaded)');
    const _bin=atob(window.FW_B64); const image=new Uint8Array(_bin.length);
    for(let i=0;i<_bin.length;i++) image[i]=_bin.charCodeAt(i);
    log('  firmware: '+image.length+' bytes ('+Math.ceil(image.length/PAGE)+' pages) — built in, nothing to download','d');

    port=await pickPort();
    try{ await port.open({baudRate:BAUD}); }
    catch(eo){ const er=new Error(explain(eo)); er._handled=true; throw er; }
    writer=port.writable.getWriter(); reader=port.readable.getReader(); await startRead();
    log('Port open @ '+BAUD+' baud.','ok');

    log('Resetting board into bootloader…'); await pulseReset();
    log('Syncing…'); await sync(); log('  in sync','ok');
    log('Entering programming mode…'); await cmd([0x50,CRC_EOP]);

    let addr=0;
    while(addr<image.length){
      const n=Math.min(PAGE,image.length-addr);
      const word=addr>>1;
      await cmd([0x55,word&0xFF,(word>>8)&0xFF,CRC_EOP]);
      const page=[]; for(let i=0;i<n;i++)page.push(image[addr+i]);
      await cmd([0x64,(n>>8)&0xFF,n&0xFF,0x46,...page,CRC_EOP]);
      addr+=n; setProg(addr/image.length);
      log('  wrote page @ '+(word*2)+' ('+addr+'/'+image.length+')','d');
    }
    log('Leaving programming mode…'); await cmd([0x51,CRC_EOP]);
    setProg(1);
    log('FLASHED. Your board is now running BeamClaw — wire the LDR and go beam an agent.','ok');
    $('done').style.display='block';
  }catch(e){
    log('x '+(e&&e._handled?e.message:explain(e)),'err');
    showHelp();
  }finally{
    try{readLoopOn=false;if(reader){await reader.cancel();reader.releaseLock()}}catch(e){}
    try{if(writer)writer.releaseLock()}catch(e){}
    try{if(port){await port.close()}}catch(e){}
    port=null;reader=null;writer=null;rbuf=[];
    setBusy(false);
  }
}
let _busy=false; const busyFlag=()=>_busy;
function setBusy(b){_busy=b;const btn=$('flashBtn');if(btn){btn.disabled=b||!supported;btn.textContent=b?'Flashing…':'⚡ Flash my Arduino';}}

window.addEventListener('DOMContentLoaded',()=>{
  const tag=$('wsStatus'),btn=$('flashBtn');
  if(supported){ tag.textContent='Web Serial ready'; tag.classList.add('ok'); if(btn)btn.disabled=false; if($('fstat'))$('fstat').textContent='Plug your Uno in via USB, then click Flash. First time you pick the port once — after that it is automatic.'; }
  else{ tag.textContent='not available in this browser'; if(btn)btn.disabled=true; if($('fstat'))$('fstat').textContent='One-click flashing needs desktop Chrome or Edge (on macOS too — Safari cannot do it; nor can Firefox, iPhone/iPad or Android). Do this once from a Chrome/Edge desktop, or use the IDE method below.'; showHelp(); }
  if(btn)btn.onclick=flash;
  const t=$('fhelpToggle'); if(t)t.onclick=(ev)=>{ev.preventDefault();const h=$('fhelp');if(h)h.style.display=(h.style.display==='block'?'none':'block');};
});
