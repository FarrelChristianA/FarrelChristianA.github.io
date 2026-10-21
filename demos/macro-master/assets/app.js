/* ============================================================
   MACRO MASTER — App logic
   theme · scroll-spy nav · tabs · accordions · search · tape
   ============================================================ */

/* ---------------- THEME ---------------- */
(function(){
  let stored=null;try{stored=localStorage.getItem('mm-theme');}catch(e){}
  const sys=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  document.documentElement.setAttribute('data-theme',stored||sys);
})();
function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  try{localStorage.setItem('mm-theme',t);}catch(e){}
  const b=document.querySelector('.theme-toggle');if(b)b.setAttribute('aria-pressed',t==='dark'?'true':'false');
  window.dispatchEvent(new Event('mm-theme-change'));
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  setTheme(cur==='dark'?'light':'dark');
}
// follow system if user never chose
window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{
  let chosen=null;try{chosen=localStorage.getItem('mm-theme');}catch(err){}
  if(!chosen){document.documentElement.setAttribute('data-theme',e.matches?'dark':'light');window.dispatchEvent(new Event('mm-theme-change'));}
});

/* ---------------- NAV (compat + smooth) ---------------- */
function nav(el,id){
  const t=document.getElementById(id);
  if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
  if(window.innerWidth<=980)document.body.classList.remove('nav-open');
}
function toggleNav(){document.body.classList.toggle('nav-open');}

/* collapsible sidebar: mobile slides an overlay; desktop collapses & reflows content */
function toggleSidebar(){
  if(window.innerWidth<=980){document.body.classList.toggle('nav-open');return;}
  const collapsed=document.body.classList.toggle('sb-collapsed');
  try{localStorage.setItem('mm-sb',collapsed?'1':'0');}catch(e){}
  // charts depend on container width — redraw after the reflow transition
  setTimeout(()=>window.dispatchEvent(new Event('mm-theme-change')),360);
}
// restore persisted collapsed state (desktop only)
(function(){
  try{ if(localStorage.getItem('mm-sb')==='1' && window.innerWidth>980) document.body.classList.add('sb-collapsed'); }catch(e){}
  // keyboard access: sidebar items + accordion headers are <div>s with onclick → make them focusable buttons
  function a11y(){
    document.querySelectorAll('.nav-item[data-target], .acc-hd').forEach(n=>{
      n.setAttribute('tabindex','0');n.setAttribute('role','button');
      n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click();}});
    });
    const tt=document.querySelector('.theme-toggle');
    if(tt)tt.setAttribute('aria-pressed',document.documentElement.getAttribute('data-theme')==='dark'?'true':'false');
  }
  if(document.readyState!=='loading')a11y();else document.addEventListener('DOMContentLoaded',a11y);
})();

/* ---------------- TABS ---------------- */
function tab(el,id){
  const navEl=el.closest('.tab-nav');
  navEl.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  // only toggle panels that belong to THIS tab group (direct descendants area)
  const panel=document.getElementById(id);
  if(panel){
    const container=panel.parentElement;
    container.querySelectorAll(':scope > .tab-panel').forEach(p=>p.classList.remove('active'));
    panel.classList.add('active');
  }
  el.classList.add('active');
}

/* ---------------- ACCORDION ---------------- */
function acc(el){
  el.setAttribute('aria-expanded',el.classList.toggle('open')?'true':'false');
  const body=el.nextElementSibling;
  if(body)body.classList.toggle('open');
}

/* ---------------- TICKER FILTER (within #tickers) ---------------- */
function filterTickers(){
  const inp=document.getElementById('ticker-search');if(!inp)return;
  const q=inp.value.toLowerCase();
  let shown=0;
  document.querySelectorAll('#tbl-tickers tr').forEach((row,i)=>{
    if(i===0)return;
    const hit=row.textContent.toLowerCase().includes(q);
    row.style.display=hit?'':'none'; if(hit)shown++;
  });
  // empty state instead of a silently blank table
  let note=document.getElementById('ticker-empty');
  if(!note){note=document.createElement('p');note.id='ticker-empty';note.className='ticker-empty';
    const t=document.getElementById('tbl-tickers');if(t)(t.closest('.tw')||t).after(note);}
  note.textContent=shown?'':'No tickers match “'+inp.value.trim()+'” — try a broader word like “yield”, “crypto” or “FRED”.';
  note.hidden=!!shown;
}

/* ============================================================
   SCROLL-SPY
   ============================================================ */
(function(){
  function init(){
    const sections=[...document.querySelectorAll('.section')];
    const items=[...document.querySelectorAll('.nav-item[data-target]')];
    const byId={};items.forEach(i=>byId[i.dataset.target]=i);
    const now=document.getElementById('tb-now');
    const titleMap={};sections.forEach(s=>{const t=s.querySelector('.sec-title');titleMap[s.id]=t?t.textContent:s.id;});
    let current=null;
    function setActive(id){
      if(id===current||!id)return;current=id;
      items.forEach(i=>i.classList.remove('active'));
      if(byId[id])byId[id].classList.add('active');
      if(now)now.textContent=titleMap[id]||'';
      if(byId[id]){const sb=document.querySelector('.sb-scroll');
        if(sb){const r=byId[id].getBoundingClientRect(),sr=sb.getBoundingClientRect();
          if(r.top<sr.top+40||r.bottom>sr.bottom-10)byId[id].scrollIntoView({block:'nearest'});}}
    }
    function compute(){
      // active = last section whose top has crossed the trigger line
      const css=getComputedStyle(document.documentElement);
      const line=(parseInt(css.getPropertyValue('--topbar-h'))||64)+(parseInt(css.getPropertyValue('--tape-h'))||38)+60;
      let active=sections[0]?sections[0].id:null;
      for(const s of sections){if(s.getBoundingClientRect().top<=line)active=s.id;else break;}
      // near page bottom → last section
      if(window.innerHeight+window.scrollY>=document.body.scrollHeight-4)active=sections[sections.length-1].id;
      setActive(active);
    }
    let ticking=false;
    function onScroll(){if(!ticking){ticking=true;requestAnimationFrame(()=>{compute();ticking=false;});}}
    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onScroll);
    compute();
    setTimeout(compute,300);
  }
  if(document.readyState!=='loading')init();else document.addEventListener('DOMContentLoaded',init);
})();

/* ============================================================
   REVEAL ON SCROLL
   ============================================================ */
(function(){
  function init(){
    const nodes=[...document.querySelectorAll('.content .card, .content .stat, .content .chart-box, .content .ib, .content .step, .content .acc, .content .flow, .content .tw')];
    nodes.forEach(n=>n.classList.add('reveal'));
    // hard-unhide: drop the reveal mechanism entirely so content cannot stay hidden
    const showAll=()=>nodes.forEach(n=>{n.classList.remove('reveal');n.style.opacity='1';n.style.transform='none';});
    if(!('IntersectionObserver' in window)){showAll();return;}
    const io=new IntersectionObserver((ents)=>{
      ents.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
    },{threshold:.08,rootMargin:'0px 0px -40px 0px'});
    nodes.forEach(n=>io.observe(n));
    // Feature-detect a frozen animation clock: if nodes have been marked .in but
    // their opacity never advances, the env can't animate -> unhide everything.
    setTimeout(()=>{
      const inNodes=nodes.filter(n=>n.classList.contains('in'));
      const anyVisible=inNodes.some(n=>parseFloat(getComputedStyle(n).opacity)>0.05);
      if(inNodes.length&&!anyVisible)showAll();
    },320);
    // Safety net: if IO never fires at all, reveal everything anyway.
    setTimeout(()=>nodes.forEach(n=>{if(n.classList.contains('reveal')&&!n.classList.contains('in'))n.classList.add('in');}),1400);
    // Final guarantee: nothing stays at opacity 0 regardless of cause.
    setTimeout(()=>nodes.forEach(n=>{if(parseFloat(getComputedStyle(n).opacity)<0.05){n.classList.remove('reveal');n.style.opacity='1';n.style.transform='none';}}),2200);
  }
  if(document.readyState!=='loading')init();else document.addEventListener('DOMContentLoaded',init);
})();

/* ============================================================
   SEARCH ENGINE  (sections + Q&A)
   ============================================================ */
const MM = (function(){
  function tokens(q){return q.toLowerCase().trim().split(/\s+/).filter(w=>w.length>1);}

  function searchSections(q){
    const ql=q.toLowerCase().trim();const tks=tokens(q);if(!ql)return [];
    return SECTIONS.map(s=>{
      const hay=(s.title+' '+s.sub+' '+s.kw).toLowerCase();
      let score=0;
      if(s.title.toLowerCase().includes(ql))score+=60;
      tks.forEach(t=>{if(s.title.toLowerCase().includes(t))score+=22;else if(hay.includes(t))score+=10;});
      return {s,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.s);
  }

  function searchQA(q){
    if(typeof QA==='undefined')return [];
    const ql=q.toLowerCase().trim();const tks=tokens(q);if(!ql)return [];
    return QA.map(item=>{
      let score=0;
      for(const kw of item.match){
        if(ql.includes(kw)){score=Math.max(score,95);}
        else{const kwt=kw.split(/\s+/);const overlap=tks.filter(t=>kwt.some(k=>k.includes(t)||t.includes(k))).length;score=Math.max(score,overlap*30);}
      }
      if(item.title.toLowerCase().includes(ql))score=Math.max(score,70);
      return {item,score};
    }).filter(x=>x.score>=45).sort((a,b)=>b.score-a.score).map(x=>x.item);
  }

  function hl(text,q){
    const ql=q.trim();if(!ql)return text;
    try{const re=new RegExp('('+ql.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');return text.replace(re,'<span class="hl">$1</span>');}catch(e){return text;}
  }
  return {searchSections,searchQA,tokens,hl};
})();

/* ---------- dropdown render (topbar) ---------- */
(function(){
  let sel=-1,flat=[];
  const input=()=>document.getElementById('search-input');
  const box=()=>document.getElementById('search-results');
  const clearBtn=()=>document.getElementById('search-clear');

  function go(id){
    const t=document.getElementById(id);if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
    close();input().value='';
  }
  window.mmGo=go;

  function render(q){
    const b=box();const secs=MM.searchSections(q);const qas=MM.searchQA(q);
    flat=[];let html='';
    if(!q.trim()){close();return;}
    if(qas.length){
      html+='<div class="sr-group-lbl">Instant answers</div>';
      qas.slice(0,3).forEach(item=>{
        const refs=(item.refs||[]).map(r=>`<span class="tk" onclick="event.stopPropagation();mmGo('${r.id}')">${r.label}</span>`).join(' ');
        html+=`<div class="sr-item" data-go="${(item.refs&&item.refs[0])?item.refs[0].id:'overview'}">
          <div class="sr-ic">💡</div>
          <div class="sr-body"><div class="sr-title">${item.title}</div></div>
        </div>
        <div class="sr-answer">${item.answer}<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:5px;align-items:center"><span style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px">Jump to</span> ${refs}</div></div>`;
        flat.push((item.refs&&item.refs[0])?item.refs[0].id:'overview');
      });
    }
    if(secs.length){
      html+='<div class="sr-group-lbl">Sections</div>';
      secs.slice(0,8).forEach(s=>{
        html+=`<div class="sr-item" data-go="${s.id}">
          <div class="sr-ic">${s.icon}</div>
          <div class="sr-body"><div class="sr-title">${MM.hl(s.title,q)}</div><div class="sr-sub">${s.sub}</div></div>
          <div class="sr-tag">${s.group}</div>
        </div>`;
        flat.push(s.id);
      });
    }
    if(!secs.length&&!qas.length){
      const safeQ=q.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      html=`<div class="sr-empty">No matches for <strong>"${safeQ}"</strong>.<br>Try <em>"max pain"</em>, <em>"net liquidity"</em>, <em>"DXY"</em>, or <em>"funding rate"</em>.</div>`;
    }
    b.innerHTML=html;b.classList.add('open');sel=-1;
    b.querySelectorAll('.sr-item').forEach(it=>it.addEventListener('click',()=>go(it.dataset.go)));
  }
  function close(){const b=box();if(b)b.classList.remove('open');sel=-1;}
  function moveSel(d){
    const its=[...box().querySelectorAll('.sr-item')];if(!its.length)return;
    sel=(sel+d+its.length)%its.length;
    its.forEach((it,i)=>it.classList.toggle('sel',i===sel));
    its[sel].scrollIntoView({block:'nearest'});
  }

  function init(){
    const i=input();if(!i)return;
    i.addEventListener('input',()=>{const v=i.value;clearBtn().style.display=v?'block':'none';render(v);});
    i.addEventListener('keydown',e=>{
      if(e.key==='ArrowDown'){e.preventDefault();moveSel(1);}
      else if(e.key==='ArrowUp'){e.preventDefault();moveSel(-1);}
      else if(e.key==='Enter'){const its=box().querySelectorAll('.sr-item');if(its[sel])its[sel].click();else if(flat[0])go(flat[0]);}
      else if(e.key==='Escape'){close();i.blur();}
    });
    i.addEventListener('focus',()=>{if(i.value)render(i.value);});
    document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))close();});
    // Cmd/Ctrl+K — show the right hint for the visitor's OS
    const isMac=/Mac|iPhone|iPad|iPod/.test(navigator.platform||navigator.userAgent);
    const kbd=document.querySelector('.search-kbd');if(kbd)kbd.textContent=isMac?'⌘K':'Ctrl K';
    i.setAttribute('aria-keyshortcuts',isMac?'Meta+K':'Control+K');
    document.addEventListener('keydown',e=>{
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();i.focus();i.select();}
    });
  }
  window.mmSearchClear=function(){const i=input();i.value='';document.getElementById('search-clear').style.display='none';close();i.focus();};
  if(document.readyState!=='loading')init();else document.addEventListener('DOMContentLoaded',init);
})();

/* ============================================================
   SHARED HELPERS
   ============================================================ */
// fetch with a hard timeout (AbortController works in every evergreen browser,
// unlike AbortSignal.timeout which is missing on older Safari)
function mmFetch(url,opts,ms){
  const ctl=new AbortController();
  const t=setTimeout(()=>ctl.abort(),ms||8000);
  return fetch(url,Object.assign({},opts||{},{signal:ctl.signal})).finally(()=>clearTimeout(t));
}
function mmEsc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const mmStore={
  get(k){try{return localStorage.getItem(k);}catch(e){return null;}},
  set(k,v){try{localStorage.setItem(k,v);}catch(e){}},
  del(k){try{localStorage.removeItem(k);}catch(e){}}
};

/* ============================================================
   ASK AI — docked chatbot
   · Without a key: answers instantly from the local knowledge base (search-data.js QA[])
   · With a visitor's own Groq key: open-ended answers, grounded with live data
   ============================================================ */
(function(){
  /* ---- single place to change the model (Groq retired llama-3.1-8b-instant on 2026-08-16) ---- */
  const GROQ_MODEL='openai/gpt-oss-20b';
  const GROQ_BASE='https://api.groq.com/openai/v1';
  const KEY_STORE='groqApiKey';

  const CHIPS=['PCE hot → crypto?','Fed cut → BTC?','DXY pumping?','NFP beat?','Yield curve inverted?','High funding rate?','What is max pain?','Net liquidity rising'];
  let seeded=false;

  function getKey(){return mmStore.get(KEY_STORE)||'';}
  function validKeyShape(k){return /^gsk_[A-Za-z0-9]{20,}$/.test(k);}

  // model output is untrusted text → escape first, then apply a tiny markdown subset
  function mdToHtml(t){
    return mmEsc(t)
      .replace(/^[ \t]*[-*•][ \t]+/gm,'• ')            // markdown bullets → readable dots
      .replace(/^#{1,4}[ \t]+(.+)$/gm,'<strong>$1</strong>') // headings → bold line
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>')
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\n\n/g,'<br><br>')
      .replace(/\n/g,'<br>');
  }

  const SYS=`You are the macro tutor inside Macro Master, an educational macro-economics workspace.
Expertise: US Fed/FOMC policy, CPI/PCE/PPI inflation, NFP/labor, GDP/PMI/ISM, yield curves (2s10s), credit spreads, Fed balance sheet & net liquidity (WALCL - WTREGEN - RRPONTSYD), China/Indonesia macro, DXY & FX flows, risk-on/risk-off, crypto macro correlations, halving cycles, funding rates, CME gaps, max pain, on-chain data, COT positioning.
RULE: If the user message contains a [LIVE DATA] block, it was fetched seconds ago from public APIs (BLS, CoinGecko, World Bank, alternative.me). Use those exact numbers and cite the source name. Do not claim your knowledge cutoff prevents an answer when live data is provided. If no live data is provided for a number, say it should be checked at the official source instead of guessing.
Style: direct, concise, explain the cause-and-effect chain. Max 3 short paragraphs unless asked. Educational only — never personalised financial advice.`;

  /* ---------- live data fetchers (free, keyless, CORS-enabled) ---------- */
  const cache={};                       // per-page-load cache: protects BLS's small keyless quota
  function cached(key,fn){if(!cache[key])cache[key]=fn().catch(()=>null);return cache[key];}

  function fetchCrypto(){
    return cached('cg',async()=>{
      const r=await mmFetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',{},6000);
      if(!r.ok)return null;
      const d=await r.json();
      const f=c=>c&&c.usd!=null?{price:c.usd,change:(c.usd_24h_change||0).toFixed(2)}:null;
      const out={btc:f(d.bitcoin),eth:f(d.ethereum),sol:f(d.solana)};
      return out.btc?out:null;
    });
  }
  function fetchFearGreed(){
    return cached('fng',async()=>{
      const r=await mmFetch('https://api.alternative.me/fng/?limit=1',{},6000);
      if(!r.ok)return null;
      const d=await r.json();const v=d.data&&d.data[0];
      return v?{value:v.value,label:v.value_classification}:null;
    });
  }
  function fetchWorldBank(indicator,label,unit){
    return cached('wb'+indicator,async()=>{
      const r=await mmFetch(`https://api.worldbank.org/v2/country/US/indicator/${indicator}?format=json&mrv=1&per_page=1`,{},6000);
      if(!r.ok)return null;
      const d=await r.json();const row=d&&d[1]&&d[1][0];
      if(!row||row.value==null)return null;
      return {label,value:parseFloat(row.value).toFixed(2),unit,date:row.date};
    });
  }
  // BLS public API v2. A plain GET (no JSON body / custom headers) is a "simple" CORS
  // request — the old POST version triggered a preflight that BLS rejects (HTTP 405).
  // Keyless quota is small (~25 req/day/IP) → results are cached, failures return null.
  function fetchBLS(seriesId,label){
    return cached('bls'+seriesId,async()=>{
      const r=await mmFetch('https://api.bls.gov/publicAPI/v2/timeseries/data/'+seriesId,{},8000);
      if(!r.ok)return null;
      const d=await r.json();
      if(d.status!=='REQUEST_SUCCEEDED')return null;
      const series=d.Results&&d.Results.series&&d.Results.series[0]&&d.Results.series[0].data;
      if(!series||!series.length)return null;
      const rows=series.filter(x=>/^M\d\d$/.test(x.period)&&x.period!=='M13')
        .sort((a,b)=>(+b.year*100+ +b.period.slice(1))-(+a.year*100+ +a.period.slice(1)));
      const latest=rows[0];if(!latest)return null;
      const v=parseFloat(latest.value),date=`${latest.year}-${latest.period.slice(1)}`;
      const prev12=rows.find(x=>+x.year===+latest.year-1&&x.period===latest.period);
      const prev1=rows[1];
      if(seriesId==='LNS14000000')return `${label}: ${v.toFixed(1)}% (${date})`;
      if(seriesId==='CES0000000001'&&prev1)return `${label}: ${((v-parseFloat(prev1.value))>=0?'+':'')}${Math.round(v-parseFloat(prev1.value))}k jobs MoM (${date})`;
      if(prev12){
        const yoy=((v-parseFloat(prev12.value))/parseFloat(prev12.value)*100);
        const mom=prev1?((v-parseFloat(prev1.value))/parseFloat(prev1.value)*100):null;
        return `${label}: ${yoy>=0?'▲':'▼'}${Math.abs(yoy).toFixed(2)}% YoY (${date})`+(mom!=null?` | MoM ${mom>=0?'+':''}${mom.toFixed(2)}%`:'');
      }
      return `${label}: ${v} (${date})`;
    });
  }

  // decide which live data to fetch from the question's keywords
  async function getLiveContext(q){
    const ql=q.toLowerCase();
    const needs={
      crypto:/btc|eth|bitcoin|ethereum|crypto|solana|\bsol\b/,
      feargreed:/fear|greed|sentiment|fng/,
      pce:/\bpce\b|personal consumption/,
      cpi:/\bcpi\b|consumer price|inflation/,
      fedfunds:/fed funds|federal funds|interest rate|real rate/,
      nfp:/\bnfp\b|non.?farm|payroll|jobs report/,
      unemployment:/unemployment|jobless|unrate/,
      gdp:/\bgdp\b|growth rate/,
      m2:/\bm2\b|money supply|10.?year|us10y|treasury yield/
    };
    const jobs=[];
    if(needs.crypto.test(ql))jobs.push(fetchCrypto().then(d=>d?`BTC: $${d.btc.price.toLocaleString()} (${d.btc.change}% 24h)`+(d.eth?` | ETH $${d.eth.price.toLocaleString()} (${d.eth.change}%)`:'')+(d.sol?` | SOL $${d.sol.price.toLocaleString()} (${d.sol.change}%)`:''):''));
    if(needs.feargreed.test(ql))jobs.push(fetchFearGreed().then(d=>d?`Crypto Fear & Greed: ${d.value}/100 — ${d.label}`:''));
    if(needs.pce.test(ql)){
      jobs.push(fetchBLS('CUSR0000SA0L1E','Core CPI (closest public proxy for Core PCE)'));
      jobs.push(Promise.resolve('Note: official PCE → fred.stlouisfed.org/series/PCEPI'));
    }else if(needs.cpi.test(ql)){
      jobs.push(fetchBLS('CUSR0000SA0','CPI Headline'));
      jobs.push(fetchBLS('CUSR0000SA0L1E','Core CPI'));
    }
    if(needs.fedfunds.test(ql))jobs.push(fetchWorldBank('FR.INR.RINR','US Real Interest Rate (World Bank, annual)','%').then(d=>d?`${d.label}: ${d.value}${d.unit} (${d.date})`:''));
    if(needs.nfp.test(ql))jobs.push(fetchBLS('CES0000000001','US Nonfarm Payrolls'));
    if(needs.unemployment.test(ql))jobs.push(fetchBLS('LNS14000000','US Unemployment Rate'));
    if(needs.gdp.test(ql))jobs.push(fetchWorldBank('NY.GDP.MKTP.KD.ZG','US GDP Growth (World Bank, annual)','%').then(d=>d?`${d.label}: ${d.value}${d.unit} (${d.date})`:''));
    if(needs.m2.test(ql))jobs.push(Promise.resolve('Note: M2 / yields → TradingView FRED:M2SL · FRED:DGS10'));
    if(!jobs.length)return [];
    return (await Promise.allSettled(jobs)).map(r=>r.status==='fulfilled'?r.value:'').filter(Boolean);
  }

  async function callGroq(q,liveLines){
    const key=getKey();if(!key)return null;
    const userMsg=liveLines.length
      ? q+'\n\n[LIVE DATA]\n'+liveLines.join('\n')
      : q;
    let r;
    try{
      r=await mmFetch(GROQ_BASE+'/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
        body:JSON.stringify({model:GROQ_MODEL,messages:[{role:'system',content:SYS},{role:'user',content:userMsg}],
          max_completion_tokens:1200,temperature:0.5,reasoning_effort:'low',include_reasoning:false})
      },25000);
    }catch(e){throw new Error(e.name==='AbortError'?'Groq timed out':'network error');}
    if(r.status===401)throw new Error('key rejected (401) — use “Disconnect key” and paste a new one');
    if(r.status===429)throw new Error('Groq rate limit reached — try again in a minute');
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error((e.error&&e.error.message)||('Groq HTTP '+r.status));}
    const d=await r.json();
    const out=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
    if(!out)throw new Error('empty response');
    return out;
  }

  function localAnswer(q){
    const qas=(typeof MM!=='undefined')?MM.searchQA(q):[];
    if(qas.length){
      const item=qas[0];
      const refs=(item.refs||[]).map(r=>`<span class="chat-ref" data-go="${r.id}" role="button" tabindex="0">${r.label}</span>`).join('');
      let html=`<strong>${item.title}</strong><br>${item.answer}`;
      if(refs)html+=`<div class="chat-refs"><span class="lbl">Read</span>${refs}</div>`;
      return html;
    }
    const secs=(typeof MM!=='undefined')?MM.searchSections(q):[];
    if(secs.length){
      const refs=secs.slice(0,4).map(s=>`<span class="chat-ref" data-go="${s.id}" role="button" tabindex="0">${s.title}</span>`).join('');
      return `These sections cover it:<div class="chat-refs"><span class="lbl">Open</span>${refs}</div>`;
    }
    return `I couldn't find that in the knowledge base. Try: <em>"yield curve"</em>, <em>"max pain"</em>, <em>"funding rate"</em>, or <em>"Fed cut"</em>.`
      +(getKey()?'':'<br><span class="chat-note">Connect a free Groq key (optional) for open-ended questions.</span>');
  }

  function body(){return document.getElementById('chat-body');}
  function scrollDown(){const b=body();if(b)b.scrollTop=b.scrollHeight;}

  function addMsg(role,html){
    const b=body();if(!b)return null;
    const m=document.createElement('div');m.className='chat-msg '+role;
    const av=role==='bot'?'<div class="chat-mav" aria-hidden="true">🤖</div>':'<div class="chat-mav" aria-hidden="true">🧑‍💻</div>';
    m.innerHTML=av+'<div class="chat-bub">'+html+'</div>';
    b.appendChild(m);scrollDown();return m;
  }
  function addTyping(){
    const b=body();if(!b)return null;
    const m=document.createElement('div');m.className='chat-msg bot';
    m.innerHTML='<div class="chat-mav" aria-hidden="true">🤖</div><div class="chat-bub chat-typing" aria-label="Thinking"><span></span><span></span><span></span></div>';
    b.appendChild(m);scrollDown();return m;
  }

  function renderChips(){
    const c=document.getElementById('chat-chips');if(!c)return;
    c.innerHTML=CHIPS.map(t=>`<button type="button" class="chat-chip">${t}</button>`).join('');
    c.querySelectorAll('.chat-chip').forEach((el,i)=>el.addEventListener('click',()=>{send(CHIPS[i]);}));
  }

  function setStatus(){
    const s=document.querySelector('#chat-panel .chat-status');
    const k=getKey();
    if(s)s.innerHTML='<span class="dot"></span>'+(k?'Groq · '+GROQ_MODEL:'Built-in knowledge base');
    const dc=document.getElementById('chat-disconnect');
    if(dc)dc.hidden=!k;
    const cn=document.getElementById('chat-connect');
    if(cn)cn.hidden=!!k;
  }

  function showSetup(){
    const b=body();if(!b||document.getElementById('groq-setup'))return;
    const m=document.createElement('div');m.className='chat-msg bot';
    m.innerHTML='<div class="chat-mav" aria-hidden="true">🤖</div><div class="chat-bub"><div id="groq-setup" class="groq-setup">'
      +'<div class="gs-title">Optional · connect Groq for open-ended answers</div>'
      +'<div class="gs-text">Get a free key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>, then paste it here.</div>'
      +'<div class="gs-row">'
      +'<input id="groq-inp" type="password" autocomplete="off" spellcheck="false" aria-label="Groq API key" placeholder="gsk_…">'
      +'<button type="button" id="groq-btn">Connect</button>'
      +'</div><div class="gs-err" id="groq-err" role="alert"></div>'
      +'<div class="gs-note">🔒 Your key stays in this browser (localStorage) and calls go directly from your browser to Groq — no server in between. Remove it anytime with “Disconnect key”.</div>'
      +'</div></div>';
    b.appendChild(m);scrollDown();
    const inp=document.getElementById('groq-inp');
    document.getElementById('groq-btn').addEventListener('click',()=>groqConnect());
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();groqConnect();}});
  }

  function seed(){
    if(seeded)return;seeded=true;
    if(getKey()){
      addMsg('bot','Hi — I\'m your <strong>Macro AI</strong> (Groq · '+GROQ_MODEL+'). Ask anything about macro, crypto, or how a data release moves markets. Questions about CPI, jobs, GDP or crypto prices get live data injected.');
    }else{
      addMsg('bot','Hi — I\'m <strong>Macro AI</strong>. I answer instantly from this page\'s built-in knowledge base — tap a chip below or ask e.g. <em>"Fed cut → BTC?"</em>');
      showSetup();
    }
    renderChips();setStatus();
  }

  async function groqConnect(){
    const inp=document.getElementById('groq-inp');const err=document.getElementById('groq-err');
    if(!inp)return;
    const key=inp.value.trim();
    const fail=msg=>{if(err)err.textContent=msg;inp.focus();};
    if(!key)return fail('Paste your key first.');
    if(!validKeyShape(key))return fail('That doesn\'t look like a Groq key — it should start with “gsk_”.');
    if(err)err.textContent='Checking key…';
    try{
      // cheap check that costs no tokens: list models with this key
      const r=await mmFetch(GROQ_BASE+'/models',{headers:{'Authorization':'Bearer '+key}},10000);
      if(r.status===401||r.status===403)return fail('Groq rejected this key. Create a new one at console.groq.com/keys.');
      if(!r.ok)return fail('Groq returned HTTP '+r.status+'. Try again in a moment.');
      const d=await r.json().catch(()=>({}));
      const ids=(d.data||[]).map(m=>m.id);
      if(ids.length&&!ids.includes(GROQ_MODEL))console.info('Macro Master: model',GROQ_MODEL,'not in this account\'s model list');
    }catch(e){return fail('Could not reach Groq ('+(e.name==='AbortError'?'timeout':'network')+'). Check your connection.');}
    mmStore.set(KEY_STORE,key);
    const setup=document.getElementById('groq-setup');
    if(setup)setup.closest('.chat-msg').remove();
    addMsg('bot','✅ <strong>Groq connected.</strong> Ask anything — answers about CPI, jobs, GDP or crypto prices get live data injected first.');
    setStatus();
  }
  window.groqConnect=groqConnect;

  window.groqDisconnect=function(){
    mmStore.del(KEY_STORE);
    addMsg('bot','Key removed from this browser. I\'ll keep answering from the built-in knowledge base.');
    setStatus();showSetup();
  };
  window.groqShowSetup=function(){showSetup();const i=document.getElementById('groq-inp');if(i)i.focus();};

  function wireRefs(msgEl){
    if(!msgEl)return;
    msgEl.querySelectorAll('.chat-ref').forEach(r=>{
      const go=()=>{const t=document.getElementById(r.dataset.go);if(t)t.scrollIntoView({behavior:'smooth',block:'start'});if(window.innerWidth<=560)close();};
      r.addEventListener('click',go);
      r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
    });
  }

  function buildDataCard(lines){
    const rows=lines.map(l=>{
      const colon=l.indexOf(':');
      if(colon<0)return `<div class="ld-note">${mmEsc(l)}</div>`;
      return `<div class="ld-row"><span>${mmEsc(l.slice(0,colon).trim())}</span><b>${mmEsc(l.slice(colon+1).trim())}</b></div>`;
    }).join('');
    return `<div class="live-data"><div class="ld-hd">📡 LIVE DATA</div>${rows}<div class="ld-src">Sources: BLS · CoinGecko · World Bank · alternative.me</div></div>`;
  }

  async function send(text){
    const input=document.getElementById('chat-text');
    const q=(text!=null?text:input.value).trim().slice(0,600);
    if(!q)return;
    addMsg('user',mmEsc(q));
    if(input)input.value='';
    const typing=addTyping();
    if(getKey()){
      let live=[];
      try{
        live=await getLiveContext(q).catch(()=>[]);
        const raw=await callGroq(q,live);
        if(typing)typing.remove();
        const msg=addMsg('bot',(live.length?buildDataCard(live):'')+mdToHtml(raw));
        wireRefs(msg);
      }catch(e){
        if(typing)typing.remove();
        const msg=addMsg('bot','<span class="chat-note">⚠️ Groq unavailable: '+mmEsc(e.message)+'. Answering from the knowledge base instead.</span><br><br>'+localAnswer(q));
        wireRefs(msg);
      }
    }else{
      setTimeout(()=>{
        if(typing)typing.remove();
        const msg=addMsg('bot',localAnswer(q));
        wireRefs(msg);
      },350);
    }
  }
  window.chatSend=function(){send();};

  function open(){
    document.body.classList.add('chat-open');
    const p=document.getElementById('chat-panel');
    p.classList.add('open');p.setAttribute('aria-hidden','false');
    const fab=document.getElementById('ask-fab');if(fab)fab.setAttribute('aria-expanded','true');
    seed();
    setTimeout(()=>{const i=document.getElementById('chat-text');if(i)i.focus();},120);
  }
  function close(){
    document.body.classList.remove('chat-open');
    const p=document.getElementById('chat-panel');
    p.classList.remove('open');p.setAttribute('aria-hidden','true');
    const fab=document.getElementById('ask-fab');if(fab)fab.setAttribute('aria-expanded','false');
  }
  window.chatToggle=function(){
    const p=document.getElementById('chat-panel');
    if(p.classList.contains('open'))close();else open();
  };
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const p=document.getElementById('chat-panel');if(p&&p.classList.contains('open'))close();}});
})();

/* ============================================================
   LIVE TICKER TAPE — keyless, CORS-enabled sources only
   · CoinGecko: BTC ETH SOL BNB + PAXG (tokenised gold, 1 token = 1 troy oz)
   · Frankfurter (ECB reference rates, daily): EUR/USD, USD/JPY, USD/CNY, USD/IDR
     + DXY* computed from the ICE basket formula
   A source that fails is hidden (never a row of dashes); if everything fails the tape
   says so in one line. The Yahoo-via-allorigins route was removed: the proxy returned
   HTTP 522 during the 2026-10 audit.
   ============================================================ */
(function(){
  const INSTR=[
    {sym:'BTC',  dp:0, src:'cg', id:'bitcoin',     tip:'Bitcoin · CoinGecko · 24h change'},
    {sym:'ETH',  dp:2, src:'cg', id:'ethereum',    tip:'Ethereum · CoinGecko · 24h change'},
    {sym:'SOL',  dp:2, src:'cg', id:'solana',      tip:'Solana · CoinGecko · 24h change'},
    {sym:'BNB',  dp:2, src:'cg', id:'binancecoin', tip:'BNB · CoinGecko · 24h change'},
    {sym:'GOLD', dp:0, src:'cg', id:'pax-gold',    tip:'Gold via PAX Gold (PAXG) token, USD per troy oz · CoinGecko · 24h change'},
    {sym:'DXY*', dp:2, src:'fx', id:'DXY',         tip:'US Dollar Index computed from ECB reference rates (ICE formula) · daily close · vs prior day'},
    {sym:'EURUSD',dp:4,src:'fx', id:'EURUSD',      tip:'EUR/USD · ECB reference rate · daily'},
    {sym:'USDJPY',dp:2,src:'fx', id:'USDJPY',      tip:'USD/JPY · ECB reference rate · daily'},
    {sym:'USDCNY',dp:4,src:'fx', id:'USDCNY',      tip:'USD/CNY · ECB reference rate · daily'},
    {sym:'USDIDR',dp:0,src:'fx', id:'USDIDR',      tip:'USD/IDR · ECB reference rate · daily'},
  ];
  INSTR.forEach(x=>{x.px=null;x.chg=0;x.state='loading';});

  function fmt(x){return x.px==null?'—':x.px.toLocaleString('en-US',{minimumFractionDigits:x.dp,maximumFractionDigits:x.dp});}
  function itemHTML(x){
    return `<span class="tape-item${x.state==='loading'?' loading':''}" data-sym="${x.sym}" data-src="${x.src}" title="${x.tip}">
      <span class="tape-sym">${x.sym}</span><span class="tape-px">${fmt(x)}</span><span class="tape-chg">…</span></span>`;
  }
  function build(){
    const track=document.getElementById('tape-track');if(!track)return;
    const one=INSTR.map(itemHTML).join('');
    track.innerHTML=one+one;               // duplicated for the seamless marquee loop
  }
  function updateNode(x){
    const up=(x.chg||0)>=0;
    document.querySelectorAll(`.tape-item[data-sym="${x.sym}"]`).forEach(node=>{
      node.classList.remove('loading');node.hidden=false;
      node.querySelector('.tape-px').textContent=fmt(x);
      const c=node.querySelector('.tape-chg');
      c.className='tape-chg '+(up?'up':'down');
      c.textContent=(up?'▲':'▼')+' '+Math.abs(x.chg||0).toFixed(2)+'%';
    });
  }
  function hideSource(src){
    INSTR.filter(x=>x.src===src&&x.px==null).forEach(x=>{
      x.state='failed';
      document.querySelectorAll(`.tape-item[data-sym="${x.sym}"]`).forEach(n=>n.hidden=true);
    });
    if(INSTR.every(x=>x.state==='failed')){
      const track=document.getElementById('tape-track');
      if(track)track.innerHTML='<span class="tape-offline">Live market feed unavailable right now — all lessons work offline.</span>';
      const live=document.querySelector('.tape-live');if(live)live.classList.add('off');
    }
  }

  async function fetchCG(){
    try{
      const ids=INSTR.filter(x=>x.src==='cg').map(x=>x.id).join(',');
      const r=await mmFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,{},8000);
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();
      INSTR.filter(x=>x.src==='cg').forEach(x=>{
        const row=d[x.id];if(!row||row.usd==null)return;
        x.px=row.usd;x.chg=row.usd_24h_change||0;x.state='ok';updateNode(x);
      });
    }catch(e){console.info('Macro Master tape: CoinGecko unavailable ('+e.message+')');}
    hideSource('cg');
  }

  // ICE U.S. Dollar Index weights (EUR 57.6%, JPY 13.6%, GBP 11.9%, CAD 9.1%, SEK 4.2%, CHF 3.6%)
  function dxy(r){ // r = USD-based rates {EUR,JPY,GBP,CAD,SEK,CHF}
    const eurusd=1/r.EUR,gbpusd=1/r.GBP;
    return 50.14348112*Math.pow(eurusd,-0.576)*Math.pow(r.JPY,0.136)*Math.pow(gbpusd,-0.119)*Math.pow(r.CAD,0.091)*Math.pow(r.SEK,0.042)*Math.pow(r.CHF,0.036);
  }
  async function fetchFX(){
    try{
      const start=new Date(Date.now()-10*864e5).toISOString().slice(0,10);
      const r=await mmFetch(`https://api.frankfurter.dev/v1/${start}..?from=USD&symbols=EUR,JPY,GBP,CAD,SEK,CHF,CNY,IDR`,{},8000);
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();
      const days=Object.keys(d.rates||{}).sort();
      if(days.length<2)throw new Error('not enough history');
      const cur=d.rates[days[days.length-1]],prev=d.rates[days[days.length-2]];
      const vals={
        DXY:[dxy(cur),dxy(prev)],
        EURUSD:[1/cur.EUR,1/prev.EUR],
        USDJPY:[cur.JPY,prev.JPY],
        USDCNY:[cur.CNY,prev.CNY],
        USDIDR:[cur.IDR,prev.IDR]
      };
      INSTR.filter(x=>x.src==='fx').forEach(x=>{
        const v=vals[x.id];if(!v||!isFinite(v[0]))return;
        x.px=v[0];x.chg=(v[0]-v[1])/v[1]*100;x.state='ok';
        x.tip=x.tip.replace(/ · as of .*/,'')+' · as of '+days[days.length-1];
        updateNode(x);
        document.querySelectorAll(`.tape-item[data-sym="${x.sym}"]`).forEach(n=>n.title=x.tip);
      });
    }catch(e){console.info('Macro Master tape: ECB/Frankfurter unavailable ('+e.message+')');}
    hideSource('fx');
  }

  function init(){
    build();
    fetchCG();fetchFX();
    setInterval(fetchCG,60000);            // crypto: every minute
    setInterval(fetchFX,30*60000);         // ECB reference rates only change once a day
  }
  if(document.readyState!=='loading')init();else document.addEventListener('DOMContentLoaded',init);
})();

/* ============================================================
   CLOCK (ET)
   ============================================================ */
(function(){
  function init(){
    const c=document.getElementById('tb-clock');if(!c)return;
    function upd(){
      const t=new Date().toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
      c.innerHTML=t+'<span class="zone">ET</span>';
    }
    upd();setInterval(upd,1000);
  }
  if(document.readyState!=='loading')init();else document.addEventListener('DOMContentLoaded',init);
})();
