"use strict";
/* BeamClaw console engine — verified assembler + smart brain + beam (core cross-checked vs the firmware) */
const PREAMBLE=[0xAA,0xAA,0xAA,0xAA],SYNC=[0xA5,0x5A],WHITEN=0xB7,GUARD=400,GAP=160;
let BIT=90,COPIES=2,busy=false,pending=null;
const crc8=b=>{let c=0;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c&0x80)?((c<<1)^0x07)&0xFF:(c<<1)&0xFF}return c};
const prng=s=>{s=(s*2654435761)>>>0;if(!s)s=0x1234567;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s>>>0}};
const wh=a=>{const r=prng(WHITEN),o=a.slice();for(let k=0;k<o.length;k++)o[k]^=(r()&0xFF);return o};
const toBits=by=>{const o=[];for(const b of by)for(let i=7;i>=0;i--)o.push((b>>i)&1);return o};
const frameBits=p=>{const W=wh(p);return toBits([...PREAMBLE,...SYNC,W.length,...W,crc8([W.length,...W])])};
const hex=b=>b.toString(16).toUpperCase().padStart(2,'0');
const REG={R0:0,R1:1,R2:2,R3:3},SIZE={LDI:4,AR:3,CMPLT:3,CMPGT:3,JMP:3,JT:3,JF:3,DWI:3,PWMI:3,TGL:2,WAITI:3,ADD:3,SUB:3,HALT:1};
const pinNum=s=>s[0]==='A'?14+ +s.slice(1):(s[0]==='D'?+s.slice(1):+s);
function assemble(src){const L=src.split('\n').map(l=>l.replace(/;.*/,'').trim()).filter(Boolean),lab={};let ad=0;const it=[];
 for(const ln of L){if(ln.endsWith(':')){lab[ln.slice(0,-1)]=ad;continue}const[op,...a]=ln.split(/[\s,]+/);if(SIZE[op]==null)throw Error('bad op '+op);it.push({op,a});ad+=SIZE[op]}
 const o=[],r=s=>REG[s],n=s=>(lab[s]!==undefined?lab[s]:parseInt(s));
 for(const{op,a}of it){switch(op){case'LDI':o.push(1,r(a[0]),n(a[1])&255,(n(a[1])>>8)&255);break;case'AR':o.push(2,r(a[0]),pinNum(a[1]));break;case'CMPLT':o.push(3,r(a[0]),r(a[1]));break;case'CMPGT':o.push(4,r(a[0]),r(a[1]));break;case'JMP':o.push(5,n(a[0])&255,(n(a[0])>>8)&255);break;case'JT':o.push(6,n(a[0])&255,(n(a[0])>>8)&255);break;case'JF':o.push(7,n(a[0])&255,(n(a[0])>>8)&255);break;case'DWI':o.push(8,pinNum(a[0]),n(a[1])&1);break;case'PWMI':o.push(9,pinNum(a[0]),n(a[1])&255);break;case'TGL':o.push(10,pinNum(a[0]));break;case'WAITI':o.push(11,n(a[0])&255,(n(a[0])>>8)&255);break;case'ADD':o.push(12,r(a[0]),r(a[1]));break;case'SUB':o.push(13,r(a[0]),r(a[1]));break;case'HALT':o.push(255);break}}
 return Uint8Array.from(o)}
const RES=new Set([0,1,14]),M={LDI:1,AR:2,CMPLT:3,CMPGT:4,JMP:5,JT:6,JF:7,DWI:8,PWMI:9,TGL:10,WAITI:11,ADD:12,SUB:13,HALT:255},NM=o=>Object.keys(M).find(k=>M[k]===o);
function validate(c){const st=new Set();let p=0;while(p<c.length){const op=c[p],nm=NM(op);if(!nm)return{ok:0,why:'illegal opcode'};st.add(p);p+=SIZE[nm];if(p>c.length)return{ok:0,why:'overrun'}}
 p=0;while(p<c.length){const op=c[p];if(op===5||op===6||op===7){const t=c[p+1]|(c[p+2]<<8);if(!st.has(t))return{ok:0,why:'bad jump'}}if(op===8||op===9||op===10){const pin=c[p+1];if(RES.has(pin))return{ok:0,why:`can't drive pin ${pin} (reserved)`};if(pin>19)return{ok:0,why:`pin ${pin} doesn't exist`}}p+=SIZE[NM(op)]}
 if(c.length>120)return{ok:0,why:'program too big for the chip (>120 B)'};
 let R=[0,0,0,0],PC=0,F=0,s=0,w=0,h=0;const rd=q=>c[q]|(c[q+1]<<8);
 while(PC<c.length&&s<2000){s++;const op=c[PC];if(op===11){w=1;break}if(op===255){h=1;break}if(op===1){R[c[PC+1]]=rd(PC+2);PC+=4}else if(op===2){R[c[PC+1]]=300;PC+=3}else if(op===3){F=R[c[PC+1]]<R[c[PC+2]];PC+=3}else if(op===4){F=R[c[PC+1]]>R[c[PC+2]];PC+=3}else if(op===5){PC=rd(PC+1)}else if(op===6){PC=F?rd(PC+1):PC+3}else if(op===7){PC=!F?rd(PC+1):PC+3}else if(op===8||op===9){PC+=3}else if(op===10){PC+=2}else if(op===12||op===13){PC+=3}else break}
 if(!w&&!h)return{ok:0,why:'would never pause (tight loop)'};return{ok:1}}
/* ---- built-in brain: behaviour templates (no key needed) ---- */
const pn=p=>p>=14?('A'+(p-14)):('D'+p);
const PWM=new Set([3,5,6,9,10,11]);
function findPin(t){t=(t||'').toLowerCase();let m=t.match(/\b(?:a|adc|analog)\s*#?\s*([0-5])\b/);if(m)return 14+ +m[1];m=t.match(/\b(?:pin|gpio|gp|io|port|d|digital|led|light|lamp|relay|output|out|channel|ch)\s*#?\s*(1?[0-9])\b/);if(m){const n=+m[1];if(n>=0&&n<=19)return n}m=t.match(/\b(1?[0-9])\b/);if(m&&!/\b(hz|times?|sec|seconds?|ms|milli|min|minutes?|percent|duty)\b/.test(t)){const n=+m[1];if(n>=2&&n<=19)return n}if(/\b(on ?board|built[- ]?in|onboard|led|light|lamp)\b/.test(t))return 13;if(/\b(buzz|buzzer|speaker|piezo|beep|tone|siren|alarm)\b/.test(t))return 8;return null}
function blinkA(pin,hz){const ms=Math.max(20,Math.round(1000/hz/2));return{say:`Blinking ${pn(pin)} at ${hz} Hz`,asm:`loop:\n DWI ${pn(pin)},1\n WAITI ${ms}\n DWI ${pn(pin)},0\n WAITI ${ms}\n JMP loop`}}
function darkA(pin){return{say:`${pn(pin)} blinks fast in the dark, slow in the light`,asm:`loop:\n AR R0,A0\n LDI R1,500\n CMPLT R0,R1\n JF br\n DWI ${pn(pin)},1\n WAITI 100\n DWI ${pn(pin)},0\n WAITI 100\n JMP loop\nbr:\n DWI ${pn(pin)},1\n WAITI 500\n DWI ${pn(pin)},0\n WAITI 500\n JMP loop`}}
function heartA(pin){return{say:`${pn(pin)} beats like a heart`,asm:`loop:\n DWI ${pn(pin)},1\n WAITI 60\n DWI ${pn(pin)},0\n WAITI 120\n DWI ${pn(pin)},1\n WAITI 60\n DWI ${pn(pin)},0\n WAITI 700\n JMP loop`}}
function setA(pin,v){return{say:`Set ${pn(pin)} ${v?'ON':'OFF'}`,asm:`DWI ${pn(pin)},${v}\n HALT`}}
function buzzA(pin){return{say:`Buzzing ${pn(pin)}`,asm:`loop:\n TGL ${pn(pin)}\n WAITI 1\n JMP loop`}}
function breatheA(pin){const note=PWM.has(pin)?'':` (note: ${pn(pin)} isn't a PWM pin, so it’ll step rather than fade — use D3/5/6/9/10/11 for a smooth glow)`;
 return{say:`Fading ${pn(pin)} in and out${note}`,asm:`loop:\n PWMI ${pn(pin)},0\n WAITI 60\n PWMI ${pn(pin)},40\n WAITI 60\n PWMI ${pn(pin)},120\n WAITI 60\n PWMI ${pn(pin)},255\n WAITI 140\n PWMI ${pn(pin)},120\n WAITI 60\n PWMI ${pn(pin)},40\n WAITI 60\n JMP loop`}}
function strobeA(pin){return{say:`${pn(pin)} double-flashes like a strobe`,asm:`loop:\n DWI ${pn(pin)},1\n WAITI 35\n DWI ${pn(pin)},0\n WAITI 35\n DWI ${pn(pin)},1\n WAITI 35\n DWI ${pn(pin)},0\n WAITI 450\n JMP loop`}}
function sosA(pin){const p=pn(pin),dot=t=>`DWI ${p},1\n WAITI 160\n DWI ${p},0\n WAITI ${t}`,dash=t=>`DWI ${p},1\n WAITI 460\n DWI ${p},0\n WAITI ${t}`;
 return{say:`${p} blinks SOS (··· — — — ···) in Morse, forever`,asm:`loop:\n ${dot(160)}\n ${dot(160)}\n ${dot(420)}\n ${dash(160)}\n ${dash(160)}\n ${dash(420)}\n ${dot(160)}\n ${dot(160)}\n ${dot(900)}\n JMP loop`}}
function templateFor(text){const t=text.toLowerCase(),pin=findPin(t);
 if(/heartbeat|heart beat|like a heart/.test(t))return heartA(pin??13);
 if(/\bsos\b|distress|morse|mayday/.test(t))return sosA(pin??13);
 if(/breath|fade|glow|pulse(?!\s*\d)|dim/.test(t))return breatheA(pin??9);
 if(/strobe|disco|rave|double[- ]?flash/.test(t))return strobeA(pin??13);
 if((/(blink|flash).*(dark|night|sensor|light)|dark|night ?light/.test(t))&&/blink|flash|light|dark/.test(t))return darkA(pin??13);
 if(/buzz|square|beep|tone|alarm|siren/.test(t))return buzzA(pin??8);
 if((/turn off|switch off|shut off|\boff\b|\blow\b/.test(t))&&pin!=null)return setA(pin,0);
 if((/turn on|switch on|\bon\b|\bhigh\b|light up/.test(t))&&pin!=null)return setA(pin,1);
 if(/blink|flash|wink|toggle/.test(t)){let hz=2,m=t.match(/(\d+(?:\.\d+)?)\s*hz/);if(m)hz=+m[1];else if(/fast|quick|rapid/.test(t))hz=8;else if(/slow/.test(t))hz=1.5;return blinkA(pin??13,Math.max(.5,Math.min(20,hz)))}
 return null}
async function claudeAsm(text){const key=$('key').value.trim();if(!key)return null;
 const instr='Compile the request into BeamClaw VM assembly. Regs R0-R3 + FLAG. Ops: LDI r,imm | AR r,pin | CMPLT/CMPGT r,r | JMP/JT/JF label | DWI pin,0|1 | PWMI pin,duty | TGL pin | WAITI ms | ADD/SUB r,r | HALT. Pins D0-D13,A0-A5; A0 is the sensor (read only). NEVER DWI/PWMI/TGL D0,D1,A0. Loops MUST contain WAITI. Keep under 120 bytes. Labels end ":". Output ONLY assembly.';
 const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:500,messages:[{role:'user',content:instr+'\n\nRequest: '+text}]})});
 if(!r.ok)throw Error('API '+r.status);const d=await r.json();let t=(d.content&&d.content[0]&&d.content[0].text)||'';return t.replace(/```[a-z]*|```/g,'').trim()}
/* ---- UI ---- */
const $=id=>document.getElementById(id);
const chat=$('chat'),pad=$('pad'),stage=$('stage'),beamzone=$('beamzone');
function bubble(who,html,dev){const d=document.createElement('div');d.className='msg '+who;d.innerHTML=html;if(dev){const e=document.createElement('div');e.className='dev';e.textContent=dev;d.appendChild(e)}chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d}
function botSuggest(html,list){const d=bubble('bot',html);const w=document.createElement('div');w.className='chips';w.style.marginTop='10px';list.forEach(q=>{const c=document.createElement('span');c.className='chip';c.textContent=q;c.onclick=()=>{$('say').value=q;send()};w.appendChild(c)});d.appendChild(w);chat.scrollTop=chat.scrollHeight}
function zone(on){$('beamzone').classList.toggle('on',on)}
const QUICK=['blink the led','blink fast in the dark','heartbeat on the led','breathe pin 9','strobe the led','SOS on the led','buzz pin 8','turn on pin 12'];
QUICK.forEach(q=>{const c=document.createElement('span');c.className='chip';c.textContent=q;c.onclick=()=>{$('say').value=q;send()};$('chips').appendChild(c)});
async function decide(text){let asm=null,label=null,src='built-in';const tpl=templateFor(text);
 if(tpl){asm=tpl.asm;label=tpl.say}
 else if($('key').value.trim()){bubble('bot','<span class="dim">thinking with Claude…</span>');try{asm=await claudeAsm(text);label='Here’s your custom behaviour';src='Claude'}catch(e){bubble('bot','The AI call failed ('+e.message+'). Check your key in ⚙, or tap a built-in below.');botSuggest('No key needed for these:',QUICK);return}}
 else{botSuggest("I didn’t spot a behaviour I know in that. I can do these <b>free, no key</b> — tap one, or add your Anthropic key in ⚙ to compile <i>anything</i> you can describe:",QUICK);return}
 if(!asm){bubble('bot','I couldn’t turn that into a program — try rephrasing, or tap a built-in.');return}
 let code;try{code=assemble(asm)}catch(e){bubble('bot','That didn’t compile cleanly. Try simpler phrasing.','('+src+') '+asm);return}
 const v=validate(code),dev='['+src+'] assembly:\n'+asm+'\n\nbytecode ('+code.length+' B): '+[...code].map(hex).join(' ');
 if(!v.ok){bubble('bot','I built that, but the safety check stopped it: <b>'+v.why+'</b>. Try a different pin or behaviour.',dev);return}
 pending={code,label};bubble('bot','✓ '+label+'. Hold your board’s sensor to the panel below and press <b>Beam it</b>.',dev);
 zone(true);hideConfirm();$('beamBtn').disabled=false;$('bstat').textContent='Ready — '+code.length+' bytes to beam.'}
function send(){const t=$('say').value.trim();if(!t||busy)return;bubble('you',t.replace(/</g,'&lt;'));$('say').value='';decide(t)}
$('send').onclick=send;$('say').addEventListener('keydown',e=>{if(e.key==='Enter')send()});
$('devBtn').onclick=()=>$('console').classList.toggle('show-dev');
$('setBtn').onclick=()=>$('settings').classList.toggle('on');
$('bit').addEventListener('input',e=>BIT=Math.max(40,Math.min(300,+e.target.value||90)));
if($('copies'))$('copies').addEventListener('input',e=>COPIES=Math.max(1,Math.min(5,+e.target.value||2)));
/* ---- remember key (this browser only) ---- */
try{const sk=localStorage.getItem('bc_key');if(sk){$('key').value=sk;if($('remember'))$('remember').checked=true}}catch(e){}
function saveKey(){try{if($('remember')&&$('remember').checked)localStorage.setItem('bc_key',$('key').value.trim());else localStorage.removeItem('bc_key')}catch(e){}}
if($('remember'))$('remember').addEventListener('change',saveKey);
if($('key'))$('key').addEventListener('change',saveKey);
/* ---- beam + upload feedback ---- */
function setPad(on){pad.style.background=on?'#fff':'#000'}
function hideConfirm(){const c=$('confirm');if(c)c.style.display='none'}
function showConfirm(){const c=$('confirm');if(c)c.style.display='block'}
function endBeam(m,ok){busy=false;setPad(0);$('pb').style.width='0%';$('beamBtn').disabled=!pending;$('stopBtn').disabled=true;$('bstat').textContent=m;pad.textContent='▣ hold your board’s sensor here · tap = fullscreen';beamzone.classList.remove('uploading');try{if(document.fullscreenElement)document.exitFullscreen();else if(document.webkitFullscreenElement)document.webkitExitFullscreen()}catch(e){}if(ok)showConfirm()}
function playFrame(bits,done){const t0=performance.now()+GUARD,tE=t0+bits.length*BIT;(function fr(n){if(!busy){setPad(0);return}if(n<t0){setPad(0);requestAnimationFrame(fr);return}if(n>=tE){setPad(0);done();return}setPad(bits[Math.floor((n-t0)/BIT)]);$('pb').style.width=((n-t0)/(bits.length*BIT)*100)+'%';requestAnimationFrame(fr)})(performance.now())}
function beam(){if(busy||!pending)return;hideConfirm();const bits=frameBits([...pending.code]);busy=true;$('beamBtn').disabled=true;$('stopBtn').disabled=false;pad.textContent='';beamzone.classList.add('uploading');let i=0;
 const go=()=>{(function nc(){if(!busy)return;if(i>=COPIES){endBeam('✓ Uploaded by light · '+COPIES+'× sent ('+BIT+' ms/bit).',true);return}$('bstat').textContent='↑ Uploading by light · pass '+(i+1)+'/'+COPIES+' · hold steady (Esc cancels)';playFrame(bits,()=>{i++;setTimeout(nc,GAP)})})()};
 let fs=null;try{fs=stage.requestFullscreen?stage.requestFullscreen():(stage.webkitRequestFullscreen?stage.webkitRequestFullscreen():null)}catch(e){}
 if(fs&&fs.then)fs.then(()=>setTimeout(go,250)).catch(()=>setTimeout(go,120));else setTimeout(go,120)}
$('beamBtn').onclick=beam;$('stopBtn').onclick=()=>{if(busy)endBeam('Stopped.',false)};
['fullscreenchange','webkitfullscreenchange'].forEach(ev=>document.addEventListener(ev,()=>{if(!(document.fullscreenElement||document.webkitFullscreenElement)&&busy)endBeam('Upload cancelled.',false)}));
if($('fbWorked'))$('fbWorked').onclick=()=>{hideConfirm();$('bstat').textContent='Running on your board ✓';bubble('bot','🎉 That’s it running on your chip — offline, no cable. Re-beam any time to change it.')};
if($('fbRetry'))$('fbRetry').onclick=()=>{hideConfirm();BIT=Math.min(300,BIT+40);if($('bit'))$('bit').value=BIT;bubble('bot','Slowing the beam to <b>'+BIT+' ms/bit</b> (steadier, more reliable). Hold the sensor close and flat to the panel — beaming again…');beam()};
pad.onclick=()=>{if(busy)return;try{if(!(document.fullscreenElement||document.webkitFullscreenElement)){stage.requestFullscreen?stage.requestFullscreen():(stage.webkitRequestFullscreen&&stage.webkitRequestFullscreen())}else{document.exitFullscreen?document.exitFullscreen():(document.webkitExitFullscreen&&document.webkitExitFullscreen())}}catch(e){}};
bubble('bot','Hey — I’m BeamClaw. Tell me what your board should do and I’ll beam it over by light. Tap a chip below, or type something like <i>“blink fast when it gets dark”.</i>');
