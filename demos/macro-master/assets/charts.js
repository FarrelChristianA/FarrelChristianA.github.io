/* ============================================================
   MACRO MASTER — Custom SVG mini-charts (no dependencies)
   Theme-aware, animated on reveal, re-render on theme change.
   ============================================================ */
(function(){
  const NS='http://www.w3.org/2000/svg';
  const el=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e;};
  function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
  function palette(){
    return {
      up:cssVar('--up'),down:cssVar('--down'),warn:cssVar('--warn'),
      info:cssVar('--info'),crypto:cssVar('--crypto'),orange:cssVar('--orange'),
      accent:cssVar('--accent'),text:cssVar('--text'),text2:cssVar('--text-2'),
      text3:cssVar('--text-3'),border:cssVar('--border'),surface:cssVar('--surface'),
      grid:cssVar('--border')
    };
  }

  /* ---- chart definitions ---- */
  const DATA={
    alloc:{type:'donut',center:['5','Asset Classes'],
      slices:[
        {label:'Equities',val:42,c:'info'},
        {label:'Bonds',val:24,c:'text2'},
        {label:'Commodities',val:12,c:'orange'},
        {label:'FX / Cash',val:10,c:'warn'},
        {label:'Crypto',val:12,c:'crypto'},
      ]},
    // static fallback; replaced by live CoinGecko numbers when reachable (see liveDominance)
    dom:{type:'donut',center:['56%','BTC Dom.'],
      slices:[
        {label:'Bitcoin',val:56,c:'orange'},
        {label:'Ethereum',val:13,c:'info'},
        {label:'Stablecoins',val:7,c:'up'},
        {label:'Altcoins',val:24,c:'crypto'},
      ]},
    roro:{type:'dbars',unit:'',
      rows:[
        {label:'Equities',val:80,c:'up'},
        {label:'Crypto',val:95,c:'crypto'},
        {label:'EM FX',val:55,c:'info'},
        {label:'Gold',val:-15,c:'warn'},
        {label:'US Bonds',val:-60,c:'down'},
        {label:'USD (DXY)',val:-70,c:'down'},
        {label:'JPY',val:-50,c:'down'},
      ]},
    cycle:{type:'phases',
      rows:[
        {label:'1 · Fed Pivot',val:30,c:'info'},
        {label:'2 · Bonds',val:50,c:'up'},
        {label:'3 · Large Caps',val:72,c:'up'},
        {label:'4 · Small Caps',val:84,c:'warn'},
        {label:'5 · Crypto',val:100,c:'crypto'},
        {label:'6 · Commodities',val:64,c:'orange'},
      ]},
    yield:{type:'line',unit:' bps',
      points:[
        {x:'Expansion',y:140},
        {x:'Late Cycle',y:55},
        {x:'Peak',y:5},
        {x:'Inversion',y:-45},
        {x:'Recession',y:30},
        {x:'Recovery',y:120},
      ]}
  };

  function colorFor(p,key){return p[key]||p.accent;}

  /* ---------- DONUT ---------- */
  function donut(host,def,p){
    const box=host.getBoundingClientRect();
    const W=box.width||300,H=box.height||200,R=Math.min(W,H)/2-6,r=R*0.62,cx=W/2,cy=H/2;
    const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,preserveAspectRatio:'xMidYMid meet'});
    const total=def.slices.reduce((s,x)=>s+x.val,0);
    let ang=-Math.PI/2;const gap=0.045;
    def.slices.forEach((s,i)=>{
      const frac=s.val/total,a0=ang+gap/2,a1=ang+frac*2*Math.PI-gap/2;ang+=frac*2*Math.PI;
      const large=(a1-a0)>Math.PI?1:0;
      const x0=cx+R*Math.cos(a0),y0=cy+R*Math.sin(a0),x1=cx+R*Math.cos(a1),y1=cy+R*Math.sin(a1);
      const xi1=cx+r*Math.cos(a1),yi1=cy+r*Math.sin(a1),xi0=cx+r*Math.cos(a0),yi0=cy+r*Math.sin(a0);
      const path=el('path',{
        d:`M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${xi1} ${yi1} A${r} ${r} 0 ${large} 0 ${xi0} ${yi0} Z`,
        fill:colorFor(p,s.c),opacity:'0',style:`transform-origin:${cx}px ${cy}px;transform:scale(.6);transition:opacity .5s ${i*0.07}s,transform .5s ${i*0.07}s cubic-bezier(.34,1.56,.64,1)`
      });
      svg.appendChild(path);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{path.setAttribute('opacity','1');path.style.transform='scale(1)';}));
    });
    host.appendChild(svg);
    // center label
    const ctr=document.createElement('div');ctr.className='mm-donut-center';
    ctr.innerHTML=`<div class="v">${def.center[0]}</div><div class="l">${def.center[1]}</div>`;
    host.parentElement.appendChild(ctr);
    // legend
    legend(host,def.slices,p,total);
  }

  function legend(host,items,p,total){
    const wrap=host.closest('.chart-box')||host.parentElement;
    const leg=document.createElement('div');leg.className='mm-legend';
    items.forEach(s=>{
      const pct=total?Math.round(s.val/total*100):s.val;
      const d=document.createElement('div');d.className='mm-leg';
      d.innerHTML=`<span class="sw" style="background:${colorFor(p,s.c)}"></span>${s.label} <span style="color:var(--text-3);font-family:var(--font-mono);margin-left:2px">${pct}%</span>`;
      leg.appendChild(d);
    });
    wrap.appendChild(leg);
  }

  /* ---------- DIVERGING BARS ---------- */
  function dbars(host,def,p){
    const box=host.getBoundingClientRect();
    const W=Math.max(box.width,300), H=Math.max(box.height,190);
    const rows=def.rows, n=rows.length;
    const gutter=104;                 // fixed left column for labels (all left-aligned)
    const rightPad=14, topPad=10, botPad=10;
    const chartX=gutter, chartW=W-gutter-rightPad;
    const cx=chartX+chartW/2;          // zero line centered in chart area
    const valSpace=30;                 // reserved room for value text at bar tip
    const scale=Math.max((chartW/2-valSpace)/100,0.2);
    const rowH=(H-topPad-botPad)/n;
    const bh=Math.min(rowH*0.5,17);
    const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,preserveAspectRatio:'xMidYMid meet'});

    // subtle divider between label gutter and plot
    svg.appendChild(el('line',{x1:chartX-10,y1:topPad,x2:chartX-10,y2:H-botPad,stroke:p.border,'stroke-width':1,opacity:.5}));
    // zero baseline
    svg.appendChild(el('line',{x1:cx,y1:topPad-2,x2:cx,y2:H-botPad+2,stroke:p.border,'stroke-width':1.5}));

    rows.forEach((row,i)=>{
      const y=topPad+i*rowH+rowH/2;
      const w=Math.abs(row.val)*scale;
      const x=row.val>=0?cx:cx-w;
      const col=colorFor(p,row.c);

      // name label — LEFT-ALIGNED in the gutter, vertically centered on the row
      const lab=el('text',{x:4,y:y+3.8,'text-anchor':'start','font-size':'11.5','font-weight':'600',
        fill:p.text2,'font-family':"'Manrope',system-ui,sans-serif"});
      lab.textContent=row.label;
      svg.appendChild(lab);

      // bar
      const rect=el('rect',{x:cx,y:y-bh/2,width:0,height:bh,rx:4.5,fill:col,
        style:`transition:width .6s ${i*0.05}s cubic-bezier(.4,0,.2,1),x .6s ${i*0.05}s cubic-bezier(.4,0,.2,1)`});
      svg.appendChild(rect);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{rect.setAttribute('width',w);rect.setAttribute('x',x);}));

      // value at the bar tip (outside)
      const vx=row.val>=0?(cx+w+7):(cx-w-7);
      const val=el('text',{x:vx,y:y+3.6,'text-anchor':row.val>=0?'start':'end','font-size':'10','font-weight':'700',
        fill:col,'font-family':"'JetBrains Mono',monospace",opacity:0,style:`transition:opacity .4s ${0.35+i*0.05}s`});
      val.textContent=(row.val>0?'+':'')+row.val;
      svg.appendChild(val);
      requestAnimationFrame(()=>requestAnimationFrame(()=>val.setAttribute('opacity','1')));
    });
    host.appendChild(svg);

    // axis caption under the zero line
    const cap=host.closest('.chart-box');
    if(cap && !cap.querySelector('.mm-axis-note')){
      const note=document.createElement('div');
      note.className='mm-legend mm-axis-note';
      note.innerHTML=`<div class="mm-leg"><span class="sw" style="background:${p.up}"></span>Rises in risk-ON</div><div class="mm-leg"><span class="sw" style="background:${p.down}"></span>Falls in risk-ON</div>`;
      cap.appendChild(note);
    }
  }

  /* ---------- PHASE BARS (horizontal, ranked) ---------- */
  function phases(host,def,p){
    const box=host.getBoundingClientRect();
    const W=Math.max(box.width,300), H=Math.max(box.height,190);
    const rows=def.rows, n=rows.length;
    const gutter=132;                 // fits "6 · Commodities"
    const rightPad=42, topPad=10, botPad=10;
    const chartX=gutter, chartW=W-gutter-rightPad;
    const rowH=(H-topPad-botPad)/n;
    const bh=Math.min(rowH*0.52,17);
    const scale=chartW/100;
    const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,preserveAspectRatio:'xMidYMid meet'});

    rows.forEach((row,i)=>{
      const y=topPad+i*rowH+rowH/2;
      const col=colorFor(p,row.c);
      // label — LEFT-ALIGNED in the gutter
      const lab=el('text',{x:4,y:y+3.8,'text-anchor':'start','font-size':'11.5','font-weight':'600',
        fill:p.text2,'font-family':"'Manrope',system-ui,sans-serif"});
      lab.textContent=row.label;
      svg.appendChild(lab);
      // track
      svg.appendChild(el('rect',{x:chartX,y:y-bh/2,width:chartW,height:bh,rx:bh/2,fill:p.border,opacity:.45}));
      // bar
      const w=row.val*scale;
      const rect=el('rect',{x:chartX,y:y-bh/2,width:0,height:bh,rx:bh/2,fill:col,
        style:`transition:width .6s ${i*0.06}s cubic-bezier(.34,1.3,.64,1)`});
      svg.appendChild(rect);
      requestAnimationFrame(()=>requestAnimationFrame(()=>rect.setAttribute('width',w)));
      // value at tip
      const val=el('text',{x:chartX+w+7,y:y+3.6,'text-anchor':'start','font-size':'10','font-weight':'700',
        fill:col,'font-family':"'JetBrains Mono',monospace",opacity:0,style:`transition:opacity .4s ${0.35+i*0.06}s`});
      val.textContent=row.val;
      svg.appendChild(val);
      requestAnimationFrame(()=>requestAnimationFrame(()=>val.setAttribute('opacity','1')));
    });
    host.appendChild(svg);
  }

  /* ---------- LINE ---------- */
  function line(host,def,p){
    const box=host.getBoundingClientRect();const W=box.width||300,H=box.height||200;
    const padL=34,padR=12,padT=14,padB=26;
    const pts=def.points,n=pts.length;
    const ys=pts.map(d=>d.y),ymin=Math.min(...ys,-60),ymax=Math.max(...ys,160);
    const X=i=>padL+(W-padL-padR)*(i/(n-1));
    const Y=v=>padT+(H-padT-padB)*(1-(v-ymin)/(ymax-ymin));
    const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,preserveAspectRatio:'none'});
    // gridlines + zero
    [ymax,(ymax+ymin)/2,ymin].forEach(v=>{
      svg.appendChild(el('line',{x1:padL,y1:Y(v),x2:W-padR,y2:Y(v),stroke:p.grid,'stroke-width':1,'stroke-dasharray':'3 4',opacity:.6}));
    });
    const zeroY=Y(0);
    svg.appendChild(el('line',{x1:padL,y1:zeroY,x2:W-padR,y2:zeroY,stroke:p.down,'stroke-width':1.2,opacity:.5}));
    svg.appendChild(el('text',{x:padL-6,y:zeroY+3,'text-anchor':'end','font-size':'8.5',fill:p.text3,'font-family':"'JetBrains Mono',monospace"})).textContent='0';
    // area + line
    let d='',area='';
    pts.forEach((pt,i)=>{const x=X(i),y=Y(pt.y);d+=(i?'L':'M')+x+' '+y+' ';area+=(i?'L':'M')+x+' '+y+' ';});
    area+=`L${X(n-1)} ${Y(ymin)} L${X(0)} ${Y(ymin)} Z`;
    const grad=el('linearGradient',{id:'mmline',x1:0,y1:0,x2:0,y2:1});
    grad.appendChild(el('stop',{offset:'0%','stop-color':p.accent,'stop-opacity':.28}));
    grad.appendChild(el('stop',{offset:'100%','stop-color':p.accent,'stop-opacity':0}));
    const defs=el('defs',{});defs.appendChild(grad);svg.appendChild(defs);
    svg.appendChild(el('path',{d:area,fill:'url(#mmline)',opacity:0,style:'transition:opacity .8s .3s'})).style.opacity='1';
    const path=el('path',{d,fill:'none',stroke:p.accent,'stroke-width':2.4,'stroke-linecap':'round','stroke-linejoin':'round'});
    svg.appendChild(path);
    const len=3000; // longer than any possible path → no dash gaps on wide screens (was 400)
    path.style.strokeDasharray=len;path.style.strokeDashoffset=len;path.style.transition='stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{path.style.strokeDashoffset=0;}));
    pts.forEach((pt,i)=>{
      const x=X(i),y=Y(pt.y);
      const dot=el('circle',{cx:x,cy:y,r:0,fill:p.surface,stroke:pt.y<0?p.down:p.up,'stroke-width':2.4,style:`transition:r .4s ${0.5+i*0.08}s cubic-bezier(.34,1.56,.64,1)`});
      svg.appendChild(dot);requestAnimationFrame(()=>requestAnimationFrame(()=>dot.setAttribute('r',4)));
      const lab=el('text',{x,y:H-9,'text-anchor':'middle','font-size':'8.5','font-weight':'600',fill:p.text3,'font-family':"'Manrope',sans-serif"});
      lab.textContent=pt.x;svg.appendChild(lab);
      const val=el('text',{x,y:y-9,'text-anchor':'middle','font-size':'9','font-weight':'700',fill:pt.y<0?p.down:p.up,'font-family':"'JetBrains Mono',monospace",opacity:0,style:`transition:opacity .4s ${0.7+i*0.08}s`});
      val.textContent=(pt.y>0?'+':'')+pt.y;svg.appendChild(val);requestAnimationFrame(()=>requestAnimationFrame(()=>val.setAttribute('opacity','1')));
    });
    host.appendChild(svg);
  }

  const RENDER={donut,dbars,phases,line};

  function renderChart(host){
    // clear prior render (theme switch)
    host.innerHTML='';
    const parent=host.parentElement;
    if(parent){parent.querySelectorAll('.mm-donut-center').forEach(n=>n.remove());}
    const box=host.closest('.chart-box');
    if(box){box.querySelectorAll('.mm-legend').forEach(n=>n.remove());}
    const key=host.dataset.chart;const def=DATA[key];if(!def)return;
    RENDER[def.type](host,def,palette());
  }

  const rendered=new WeakSet();
  function drawAll(){
    document.querySelectorAll('.mm-chart').forEach(h=>{
      if(rendered.has(h))return;
      const w=h.getBoundingClientRect().width;
      if(w<20)return; // layout not ready yet — try again on next pass
      rendered.add(h);renderChart(h);
    });
  }
  function initCharts(){
    // Render immediately (robust — no dependency on IntersectionObserver firing).
    // A short rAF lets layout settle so getBoundingClientRect() has real width.
    requestAnimationFrame(()=>requestAnimationFrame(drawAll));
    // Safety nets in case layout wasn't ready on the first frames.
    setTimeout(drawAll,500);
    setTimeout(drawAll,1300);
    window.addEventListener('load',drawAll);
  }

  // re-render all on theme change
  function redrawAll(){document.querySelectorAll('.mm-chart').forEach(h=>{ if(rendered.has(h)) renderChart(h); });}
  window.addEventListener('mm-theme-change',redrawAll);
  // charts are sized from their container at draw time → redraw after the window is resized
  let rz=null,lastW=window.innerWidth;
  window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(Math.abs(window.innerWidth-lastW)>40){lastW=window.innerWidth;redrawAll();}},250);});

  /* ---- live crypto dominance (CoinGecko /global, keyless). Static values above stay as the
         fallback and the subtitle says which one is showing. ---- */
  async function liveDominance(){
    const sub=document.getElementById('dom-sub');
    try{
      // 10-min session cache: dominance moves slowly and CoinGecko's free tier rate-limits (HTTP 429)
      let m=null;
      try{const c=JSON.parse(sessionStorage.getItem('mm-dom')||'null');if(c&&Date.now()-c.t<600000)m=c.m;}catch(e){}
      if(!m){
        const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),8000);
        const r=await fetch('https://api.coingecko.com/api/v3/global',{signal:ctl.signal}).finally(()=>clearTimeout(t));
        if(!r.ok)throw new Error('HTTP '+r.status);
        m=((await r.json()).data||{}).market_cap_percentage||{};
        try{sessionStorage.setItem('mm-dom',JSON.stringify({t:Date.now(),m}));}catch(e){}
      }
      const btc=+m.btc,eth=+m.eth,stb=(+m.usdt||0)+(+m.usdc||0);
      if(!isFinite(btc)||!isFinite(eth)||btc<=0)throw new Error('bad payload');
      const alt=Math.max(0,100-btc-eth-stb);
      DATA.dom.slices=[
        {label:'Bitcoin',val:+btc.toFixed(1),c:'orange'},
        {label:'Ethereum',val:+eth.toFixed(1),c:'info'},
        {label:'Stablecoins',val:+stb.toFixed(1),c:'up'},
        {label:'Altcoins',val:+alt.toFixed(1),c:'crypto'}];
      DATA.dom.center=[Math.round(btc)+'%','BTC Dom.'];
      const hm=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      if(sub)sub.innerHTML='<span class="live-tag">● Live</span> · CoinGecko · '+hm+' · stablecoins = USDT + USDC';
      document.querySelectorAll('.mm-chart[data-chart="dom"]').forEach(h=>{if(rendered.has(h))renderChart(h);});
    }catch(e){
      if(sub)sub.textContent='Illustrative snapshot (mid-2026) — live data unavailable right now';
    }
  }
  if(document.readyState!=='loading')liveDominance();else document.addEventListener('DOMContentLoaded',liveDominance);

  if(document.readyState!=='loading')initCharts();
  else document.addEventListener('DOMContentLoaded',initCharts);
})();
