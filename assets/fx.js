"use strict";
/* ============================================================================
   BeamClaw site-v2 - fx.js  (VISUAL-ONLY; does NOT touch app.js / flash.js logic)
   - drifting photon particle field (canvas)
   - on-scroll reveals + light hero parallax
   - mobile nav close-on-navigate
   - LiFi UPLOAD HUD: rotating quotes + transmission-plan + photon-flow + live %/pass
     It only READS #bstat / #pb that app.js already writes, and reacts to the
     `.uploading` class app.js toggles on #beamzone. It never changes beam timing,
     never writes to #pad, and lives in a dim zone far below the flashing target.
============================================================================ */
(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------------- */
  /* 1) Drifting photon particle field                                       */
  /* ---------------------------------------------------------------------- */
  function photonField(){
    var c = document.getElementById('photons');
    if(!c) return;
    var ctx = c.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W=0, H=0, parts=[], raf=null;

    function mk(){
      return {
        x: Math.random()*W,
        y: Math.random()*H,
        r: Math.random()*1.5 + 0.4,
        vx: (Math.random()-0.5)*0.16,
        vy: (Math.random()*0.22 + 0.04),   // gentle drift, like settling light
        a: Math.random()*0.5 + 0.15,
        tw: Math.random()*Math.PI*2,
        tws: Math.random()*0.02 + 0.004,
        gold: Math.random() < 0.12          // a few warm motes
      };
    }
    function resize(){
      W = window.innerWidth;
      H = window.innerHeight;
      c.width = W*dpr; c.height = H*dpr;
      c.style.width = W+'px'; c.style.height = H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      var target = Math.min(70, Math.floor(W*H/26000));
      parts = [];
      for(var i=0;i<target;i++) parts.push(mk());
    }
    function frame(){
      ctx.clearRect(0,0,W,H);
      for(var i=0;i<parts.length;i++){
        var p = parts[i];
        p.x += p.vx; p.y += p.vy; p.tw += p.tws;
        if(p.y > H+6){ p.y = -6; p.x = Math.random()*W; }
        if(p.x < -6) p.x = W+6; else if(p.x > W+6) p.x = -6;
        var tw = (Math.sin(p.tw)*0.4 + 0.6);
        var alpha = p.a * tw;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        if(p.gold){
          ctx.fillStyle = 'rgba(255,180,84,'+ (alpha*0.85) +')';
          ctx.shadowColor = 'rgba(255,180,84,0.7)';
        }else{
          ctx.fillStyle = 'rgba(150,240,225,'+ alpha +')';
          ctx.shadowColor = 'rgba(55,224,196,0.8)';
        }
        ctx.shadowBlur = p.r*4;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener('resize', resize, {passive:true});
    if(!reduce){
      frame();
    } else {
      for(var i=0;i<parts.length;i++){
        var p = parts[i];
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(150,240,225,'+(p.a*0.6)+')'; ctx.fill();
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 2) On-scroll reveals                                                    */
  /* ---------------------------------------------------------------------- */
  function reveals(){
    var els = document.querySelectorAll('.reveal');
    if(!els.length) return;
    if(reduce || !('IntersectionObserver' in window)){
      for(var i=0;i<els.length;i++) els[i].classList.add('in');
      return;
    }
    var io = new IntersectionObserver(function(ents){
      for(var i=0;i<ents.length;i++){
        if(ents[i].isIntersecting){ ents[i].target.classList.add('in'); io.unobserve(ents[i].target); }
      }
    }, {threshold:0.12, rootMargin:'0px 0px -8% 0px'});
    for(var j=0;j<els.length;j++) io.observe(els[j]);
    setTimeout(function(){for(var k=0;k<els.length;k++)els[k].classList.add('in');},1400); // failsafe: never leave content hidden
  }

  /* ---------------------------------------------------------------------- */
  /* 3) Hero parallax (subtle, pointer-driven)                               */
  /* ---------------------------------------------------------------------- */
  function parallax(){
    var stage = document.querySelector('.beam-stage');
    if(!stage || reduce) return;
    var layers = stage.querySelectorAll('[data-depth]');
    if(!layers.length) return;
    var raf=null, tx=0, ty=0, cx=0, cy=0;
    function loop(){
      cx += (tx-cx)*0.06; cy += (ty-cy)*0.06;
      for(var i=0;i<layers.length;i++){
        var d = parseFloat(layers[i].getAttribute('data-depth'))||0;
        layers[i].style.transform = 'translate('+(cx*d*18)+'px,'+(cy*d*14)+'px)';
      }
      if(Math.abs(tx-cx)>0.001 || Math.abs(ty-cy)>0.001){ raf = requestAnimationFrame(loop); }
      else raf = null;
    }
    window.addEventListener('mousemove', function(e){
      tx = (e.clientX/window.innerWidth - 0.5);
      ty = (e.clientY/window.innerHeight - 0.5);
      if(!raf) raf = requestAnimationFrame(loop);
    }, {passive:true});
  }

  /* ---------------------------------------------------------------------- */
  /* 4) Mobile nav: close after tapping a link                               */
  /* ---------------------------------------------------------------------- */
  function navClose(){
    var nl = document.getElementById('nl');
    if(!nl) return;
    var as = nl.querySelectorAll('a');
    for(var i=0;i<as.length;i++){
      as[i].addEventListener('click', function(){ nl.classList.remove('open'); });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 5) LiFi UPLOAD HUD  (the special transmission experience)               */
  /*    Injected into #stage so it survives Fullscreen on #stage.            */
  /* ---------------------------------------------------------------------- */
  var QUOTES = [
    '◈ Encoding agent to photons…',
    '◈ Modulating at ~14 b/s',
    '◈ Frame in flight',
    '◈ Preamble locked · CRC armed',
    '◈ Hold steady — line of sight',
    '◈ Painting your program in light'
  ];
  // Transmission plan mirrors app.js frame: PREAMBLE, SYNC, LEN, DATA, CRC.
  // Relative byte weights so the moving boundary roughly matches the real frame.
  var PLAN = [
    {key:'PREAMBLE', sub:'AA AA AA AA', w:4},
    {key:'SYNC',     sub:'A5 5A',       w:2},
    {key:'LEN',      sub:'1 byte',      w:1},
    {key:'DATA',     sub:'whitened',    w:14, data:true},
    {key:'CRC',      sub:'CRC-8',       w:1}
  ];

  function buildHud(stage){
    if(!stage) return null;
    var existing = stage.querySelector('.lifi-hud');
    if(existing) return existing;
    var hud = document.createElement('div');
    hud.className = 'lifi-hud';
    hud.setAttribute('aria-hidden','true');

    var total = 0;
    for(var k=0;k<PLAN.length;k++) total += PLAN[k].w;

    var segHTML = '';
    for(var s=0;s<PLAN.length;s++){
      var p = PLAN[s];
      segHTML += '<div class="tx-seg'+(p.data?' data':'')+'" data-w="'+p.w+'">'+
                 '<span class="fill"></span>'+
                 '<span class="lbl">'+p.key+'</span>'+
                 '<span class="sub">'+p.sub+'</span></div>';
    }

    hud.innerHTML =
      '<div class="hud-inner">'+
        '<div class="lifi-quote" id="lifiQuote">'+QUOTES[0]+'</div>'+
        '<div class="lifi-flow"><span class="fph"></span><span class="fph"></span>'+
          '<span class="fph"></span><span class="fph"></span></div>'+
        '<div class="lifi-plan">'+segHTML+'</div>'+
        '<div class="lifi-meta">'+
          '<span class="link">◉ OPTICAL LINK · LOS</span>'+
          '<span class="pct" id="lifiPct">0%</span>'+
          '<span class="pass">PASS <b id="lifiPass">—0</b></span>'+
        '</div>'+
      '</div>';
    stage.appendChild(hud);
    hud._segs = hud.querySelectorAll('.tx-seg');
    hud._total = total;
    return hud;
  }

  function lifiHud(){
    var beamzone = document.getElementById('beamzone');
    var stage = document.getElementById('stage');
    var bstat = document.getElementById('bstat');
    var pb = document.getElementById('pb');
    if(!beamzone || !stage || !pb) return;   // not the console page

    var hud = buildHud(stage);
    if(!hud) return;
    var quoteEl = document.getElementById('lifiQuote');
    var pctEl = document.getElementById('lifiPct');
    var passEl = document.getElementById('lifiPass');

    var qTimer=null, rafId=null, qIdx=0;

    function rotateQuote(){
      qIdx = (qIdx+1) % QUOTES.length;
      if(!quoteEl) return;
      quoteEl.classList.add('q-leave');
      setTimeout(function(){
        quoteEl.textContent = QUOTES[qIdx];
        quoteEl.classList.remove('q-leave');
      }, 180);
    }

    // Drive plan/% purely from app.js's own #pb width + #bstat text. No timing change.
    function tick(){
      var w = 0;
      var raw = pb.style.width;             // e.g. "42.13%"
      if(raw){ w = parseFloat(raw)/100; }
      if(isNaN(w)) w = 0;
      if(w < 0) w = 0; else if(w > 1) w = 1;

      if(pctEl) pctEl.textContent = Math.round(w*100) + '%';

      // pass counter parsed from #bstat ("... pass 2/3 ...")
      if(passEl && bstat){
        var m = /pass\s+(\d+)\s*\/\s*(\d+)/i.exec(bstat.textContent||'');
        if(m){ passEl.textContent = m[1] + '/' + m[2]; }
      }

      // fill segments proportionally to overall progress across the frame
      var pos = w * hud._total;
      var acc = 0;
      for(var i=0;i<hud._segs.length;i++){
        var seg = hud._segs[i];
        var sw = parseFloat(seg.getAttribute('data-w'))||1;
        var segStart = acc, segEnd = acc + sw;
        var fillEl = seg.querySelector('.fill');
        seg.classList.remove('active');
        if(pos >= segEnd){
          seg.classList.add('done');
          if(fillEl) fillEl.style.width = '100%';
        } else if(pos > segStart){
          seg.classList.remove('done');
          seg.classList.add('active');
          var frac = (pos - segStart)/sw;
          if(fillEl) fillEl.style.width = (frac*100).toFixed(1)+'%';
        } else {
          seg.classList.remove('done');
          if(fillEl) fillEl.style.width = '0%';
        }
        acc = segEnd;
      }
      rafId = requestAnimationFrame(tick);
    }

    function start(){
      hud.classList.add('lifi-active');
      if(qTimer) return;
      qIdx = 0;
      if(quoteEl) quoteEl.textContent = QUOTES[0];
      qTimer = setInterval(rotateQuote, 1500);
      if(!rafId) rafId = requestAnimationFrame(tick);
    }
    function stop(){
      hud.classList.remove('lifi-active');
      if(qTimer){ clearInterval(qTimer); qTimer=null; }
      if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
      if(pctEl) pctEl.textContent = '0%';
      if(passEl) passEl.textContent = '—0';
      for(var i=0;i<hud._segs.length;i++){
        hud._segs[i].classList.remove('active','done');
        var f = hud._segs[i].querySelector('.fill'); if(f) f.style.width='0%';
      }
    }

    // React to the .uploading class that app.js toggles (never the other way around)
    var obs = new MutationObserver(function(){
      if(beamzone.classList.contains('uploading')) start();
      else stop();
    });
    obs.observe(beamzone, {attributes:true, attributeFilter:['class']});
    if(beamzone.classList.contains('uploading')) start();
  }

  /* ---------------------------------------------------------------------- */
  /* boot                                                                    */
  /* ---------------------------------------------------------------------- */
  function init(){
    try{document.documentElement.classList.add('fx');}catch(e){}
    try{ reveals(); }catch(e){}      /* reveal FIRST so content is never trapped hidden */
    try{ photonField(); }catch(e){}
    try{ parallax(); }catch(e){}
    try{ navClose(); }catch(e){}
    try{ lifiHud(); }catch(e){}
    try{ var y=new Date().getFullYear(),s=document.querySelectorAll('[data-year]'); for(var i=0;i<s.length;i++) s[i].textContent=y; }catch(e){}
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
