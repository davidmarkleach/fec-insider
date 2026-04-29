(function(){
"use strict";
const ARTICLES_URL="https://davidmarkleach.github.io/fec-insider/articles.json";
const CHAT_API="https://fec-insider-chat.davidmarkleach.workers.dev";
const AVATAR_URL="https://davidmarkleach.github.io/fec-insider/avatar.png";
const CATEGORIES=[
  {id:"all",label:"All Updates"},
  {id:"attractions",label:"Attractions"},
  {id:"tech",label:"Technology"},
  {id:"business",label:"Business"},
  {id:"ops",label:"Operations"},
  {id:"design",label:"Design & Trends"}
];

let articles=[];
let activeCat="all";
let chatHistory=[];
let panelScrollY=0;

function esc(s){
  if(!s)return"";
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function safeHref(url){
  if(!url||typeof url!=="string")return null;
  const u=url.trim();
  if(!/^https?:\/\//i.test(u))return null;
  return esc(u);
}
function formatDate(iso){
  try{const d=new Date(iso);if(isNaN(d.getTime()))return"";
    return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})+" \u00b7 "+
    d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});}catch(e){return"";}
}

/* ---------- Build page structure ---------- */
function buildPage(){
  const target=document.getElementById("fec-app")||document.querySelector("[data-fec-app]");
  const root=target||document.body;

  if(!target){
    root.querySelectorAll(':scope > *').forEach(el=>{
      if(!el.matches('script,style,link,meta,noscript'))el.style.display='none';
    });
  }

  const app=document.createElement("div");
  app.id="fec-root";
  app.innerHTML=`
<div class="fec-hero-section">
  <div class="fec-hero-inner">
    <h1 class="fec-logo">FEC <span>Insider</span></h1>
    <p class="fec-tagline">AI-curated news for the Family Entertainment Center industry</p>
    <p class="fec-timestamp" id="fec-timestamp"></p>
    <button class="fec-hero-cta" id="fec-hero-sub">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
      Subscribe Free
    </button>
  </div>
</div>
<div class="fec-wrap">
  <div class="fec-tabs" id="fec-tabs"></div>
  <div class="fec-feed" id="fec-feed"></div>
  <div class="fec-about-section">
    <div class="fec-about-inner">
      <h2 class="fec-about-title">Powered by FEC Launch</h2>
      <p class="fec-about-text">FEC Insider is brought to you by <strong>FEC Launch</strong> — helping entrepreneurs plan, build, and grow successful Family Entertainment Centers. From feasibility studies to grand opening and beyond.</p>
      <a class="fec-about-link" href="https://feclaunch.com" target="_blank" rel="noopener noreferrer">Learn more at feclaunch.com &rarr;</a>
    </div>
  </div>
  <footer class="fec-footer">
    <p>Powered by AI &middot; <strong>FEC Insider</strong> &middot; &copy; ${new Date().getFullYear()} FEC Launch</p>
  </footer>
</div>`;
  root.appendChild(app);

  document.getElementById("fec-hero-sub").addEventListener("click",()=>openPanel("fecSubPanel"));
}

/* ---------- Tabs & Feed ---------- */
function renderTabs(){
  const el=document.getElementById("fec-tabs");
  if(!el)return;
  el.innerHTML=CATEGORIES.map(c=>
    `<button class="fec-tab${c.id===activeCat?" active":""}" data-cat="${c.id}">${c.label}</button>`
  ).join("");
  el.querySelectorAll(".fec-tab").forEach(btn=>{
    btn.addEventListener("click",()=>{activeCat=btn.dataset.cat;renderTabs();renderFeed();});
  });
}

function renderFeed(){
  const el=document.getElementById("fec-feed");
  if(!el)return;
  const filtered=activeCat==="all"?articles:articles.filter(a=>a.categoryId===activeCat);
  if(!filtered.length){el.innerHTML='<div class="fec-empty">No articles in this category yet.</div>';return;}
  el.innerHTML=filtered.map((a,i)=>{
    const href=safeHref(a.url);
    const tag=href?"a":"div";
    const attrs=href?`href="${href}" target="_blank" rel="noopener noreferrer"`:"";
    const color=a.categoryColor||"#7C3AED";
    return `<${tag} class="fec-card" ${attrs} style="animation-delay:${i*0.04}s">
      <div class="fec-card-top">
        <span class="fec-card-cat" style="color:${color}">${esc(a.categoryLabel||a.categoryId)}</span>
        <span class="fec-card-source">${a.source?"via "+esc(a.source):""}</span>
      </div>
      <h3 class="fec-card-title">${esc(a.title)}</h3>
      <p class="fec-card-summary">${esc(a.summary)}</p>
    </${tag}>`;
  }).join("");
}

function renderTimestamp(iso){
  const el=document.getElementById("fec-timestamp");
  if(el&&iso)el.textContent="Updated "+formatDate(iso);
}

async function loadArticles(){
  const el=document.getElementById("fec-feed");
  if(el)el.innerHTML='<div class="fec-loading"><div class="fec-spinner"></div><p>Loading today\'s news...</p></div>';
  try{
    const r=await fetch(ARTICLES_URL+"?t="+Date.now());
    if(!r.ok)throw new Error("HTTP "+r.status);
    const data=await r.json();
    articles=data.articles||data;
    renderTimestamp(data.generated);
    renderTabs();
    renderFeed();
  }catch(e){
    console.error("FEC Insider: failed to load articles",e);
    if(el)el.innerHTML='<div class="fec-empty">Unable to load articles right now. Please try again later.</div>';
  }
}

/* ---------- Panels ---------- */
function injectPanels(){
  const overlay=document.createElement("div");
  overlay.id="fecOverlay";overlay.className="fec-overlay";
  document.body.appendChild(overlay);
  overlay.addEventListener("click",closeAllPanels);
  injectChatPanel();
  injectFeedbackPanel();
  injectSubscribePanel();
  injectActionBar();
}

function openPanel(id){
  panelScrollY=window.scrollY;
  document.body.style.overflow="hidden";
  document.getElementById("fecOverlay").classList.add("open");
  document.getElementById(id).classList.add("open");
}
function closeAllPanels(){
  document.getElementById("fecOverlay").classList.remove("open");
  document.querySelectorAll(".fec-panel").forEach(p=>p.classList.remove("open"));
  document.body.style.overflow="";
  window.scrollTo(0,panelScrollY);
}

function panelHdr(title,sub,closeId,avatar){
  return `<div class="fec-panel-header">
    ${avatar?`<img class="fec-panel-avatar" src="${AVATAR_URL}" alt="">`:""}
    <div class="fec-panel-hinfo"><div class="fec-panel-htitle">${title}</div><div class="fec-panel-hsub">${sub}</div></div>
    <button class="fec-panel-close" id="${closeId}">&times;</button>
  </div>`;
}

function injectActionBar(){
  const bar=document.createElement("nav");
  bar.className="fec-action-bar";
  bar.innerHTML=`
    <button class="fec-abtn accent" id="fecOpenSub"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg><span>Subscribe</span></button>
    <button class="fec-abtn" id="fecOpenChat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span>Chat</span></button>
    <button class="fec-abtn" id="fecOpenFb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>Feedback</span></button>`;
  document.body.appendChild(bar);
  document.getElementById("fecOpenSub").addEventListener("click",()=>openPanel("fecSubPanel"));
  document.getElementById("fecOpenChat").addEventListener("click",()=>{openPanel("fecChatPanel");setTimeout(()=>document.getElementById("fecChatIn").focus(),350);});
  document.getElementById("fecOpenFb").addEventListener("click",()=>openPanel("fecFbPanel"));
}

function injectChatPanel(){
  const el=document.createElement("div");el.id="fecChatPanel";el.className="fec-panel";
  el.innerHTML=panelHdr("FEC Insider","Ask me about today's FEC news","fecCloseChat",true)+
    `<div class="fec-chat-msgs" id="fecChatMsgs"><div class="fec-chat-msg bot">Hey! I'm the FEC Insider assistant. Ask me anything about today's industry news.</div></div>
    <div class="fec-chat-input-area"><input class="fec-chat-in" id="fecChatIn" type="text" placeholder="Ask about today's FEC news..." autocomplete="off">
    <button class="fec-chat-send" id="fecChatSend"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>`;
  document.body.appendChild(el);
  document.getElementById("fecCloseChat").addEventListener("click",closeAllPanels);
  const input=document.getElementById("fecChatIn"),send=document.getElementById("fecChatSend");
  async function doSend(){
    const text=input.value.trim();if(!text)return;
    input.value="";send.disabled=true;
    addMsg(text,"user");chatHistory.push({role:"user",content:text});showTyping();
    try{
      const r=await fetch(CHAT_API+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({message:text,history:chatHistory.slice(-6),articles:articles.map(a=>({title:a.title,summary:a.summary,categoryLabel:a.categoryLabel,source:a.source}))})});
      hideTyping();if(!r.ok)throw new Error();
      const d=await r.json();const reply=d.reply||"Sorry, I couldn't process that.";
      addMsg(reply,"bot");chatHistory.push({role:"assistant",content:reply});
    }catch(e){hideTyping();addMsg("Sorry, I'm having trouble connecting. Please try again later.","bot");}
    send.disabled=false;input.focus();
  }
  send.addEventListener("click",doSend);
  input.addEventListener("keydown",e=>{if(e.key==="Enter")doSend();});
}
function addMsg(text,type){
  const msgs=document.getElementById("fecChatMsgs");
  const div=document.createElement("div");div.className="fec-chat-msg "+type;div.textContent=text;
  msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;
}
function showTyping(){
  const msgs=document.getElementById("fecChatMsgs");
  const div=document.createElement("div");div.className="fec-chat-msg bot typing";div.id="fecTyping";
  div.innerHTML='<span class="td"></span><span class="td"></span><span class="td"></span>';
  msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;
}
function hideTyping(){const el=document.getElementById("fecTyping");if(el)el.remove();}

function injectFeedbackPanel(){
  const el=document.createElement("div");el.id="fecFbPanel";el.className="fec-panel";
  el.innerHTML=panelHdr("Leave Feedback","We'd love to hear from you","fecCloseFb",false)+
    `<div class="fec-form-area"><label>What do you think of FEC Insider?</label>
    <textarea id="fecFbText" placeholder="What topics should we cover? How can we improve?"></textarea>
    <label>Email (optional)</label><input type="email" id="fecFbEmail" placeholder="your@email.com">
    <button class="fec-form-btn" id="fecFbSubmit">Send Feedback</button></div>`;
  document.body.appendChild(el);
  document.getElementById("fecCloseFb").addEventListener("click",closeAllPanels);
  document.getElementById("fecFbSubmit").addEventListener("click",async()=>{
    const text=document.getElementById("fecFbText").value.trim();
    const email=document.getElementById("fecFbEmail").value.trim();
    if(!text)return;
    try{await fetch(CHAT_API+"/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,email})});}catch(e){}
    document.querySelector("#fecFbPanel .fec-form-area").innerHTML='<div class="fec-success">\u2705 Thank you for your feedback!</div>';
  });
}

function injectSubscribePanel(){
  const el=document.createElement("div");el.id="fecSubPanel";el.className="fec-panel";
  el.innerHTML=panelHdr("Subscribe to FEC Insider","Get daily FEC industry news in your inbox","fecCloseSub",false)+
    `<div class="fec-form-area" id="fecSubArea">
    <p>Stay ahead with curated news and insights for the Family Entertainment Center industry, delivered straight to your inbox.</p>
    <label>Email address</label><input type="email" id="fecSubEmail" placeholder="your@email.com" required>
    <label>Name (optional)</label><input type="text" id="fecSubName" placeholder="Your name">
    <div class="fec-sub-status" id="fecSubStatus"></div>
    <button class="fec-form-btn accent" id="fecSubSubmit">Subscribe</button></div>`;
  document.body.appendChild(el);
  document.getElementById("fecCloseSub").addEventListener("click",closeAllPanels);
  document.getElementById("fecSubSubmit").addEventListener("click",async()=>{
    const emailEl=document.getElementById("fecSubEmail"),nameEl=document.getElementById("fecSubName");
    const statusEl=document.getElementById("fecSubStatus"),btn=document.getElementById("fecSubSubmit");
    const email=emailEl.value.trim(),name=nameEl.value.trim();
    if(!email){emailEl.focus();return;}
    statusEl.className="fec-sub-status";statusEl.style.display="none";
    btn.disabled=true;btn.textContent="Subscribing...";
    try{
      const r=await fetch(CHAT_API+"/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,name:name||undefined})});
      const d=await r.json();
      if(r.ok&&d.success){statusEl.className="fec-sub-status success";statusEl.textContent="You're subscribed! Check your inbox.";statusEl.style.display="block";btn.textContent="Subscribed";emailEl.disabled=true;nameEl.disabled=true;}
      else throw new Error(d.error||"Something went wrong");
    }catch(e){statusEl.className="fec-sub-status error";statusEl.textContent=e.message||"Failed to subscribe.";statusEl.style.display="block";btn.disabled=false;btn.textContent="Subscribe";}
  });
}

/* ---------- Styles ---------- */
function injectStyles(){
  const s=document.createElement("style");
  s.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

#fec-root,#fec-root *{box-sizing:border-box;margin:0;padding:0}
#fec-root{font-family:'Inter',system-ui,-apple-system,sans-serif;color:#fff;-webkit-font-smoothing:antialiased;line-height:1.6}

/* Hero */
.fec-hero-section{background:linear-gradient(135deg,#070714 0%,#0f0f28 50%,#1a0a3e 100%);padding:60px 20px 48px;text-align:center;border-bottom:1px solid rgba(124,58,237,.2)}
.fec-hero-inner{max-width:640px;margin:0 auto}
.fec-logo{font-size:36px;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-bottom:12px}
.fec-logo span{color:#9461F5}
.fec-tagline{font-size:17px;font-weight:400;color:rgba(255,255,255,.7);margin-bottom:8px;line-height:1.5}
.fec-timestamp{font-size:13px;color:rgba(255,255,255,.45);margin-bottom:24px}
.fec-hero-cta{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:#7C3AED;color:#fff;border:none;border-radius:100px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;box-shadow:0 4px 20px rgba(124,58,237,.4)}
.fec-hero-cta:hover{background:#6D28D9;transform:translateY(-1px);box-shadow:0 6px 28px rgba(124,58,237,.5)}

/* Main container */
.fec-wrap{max-width:740px;margin:0 auto;padding:32px 20px 120px}

/* Tabs */
.fec-tabs{display:flex;gap:6px;margin-bottom:28px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.fec-tabs::-webkit-scrollbar{display:none}
.fec-tab{background:transparent;border:1px solid transparent;border-radius:100rem;padding:8px 16px;color:rgba(255,255,255,.75);font-family:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;transition:all .2s}
.fec-tab:hover{background:rgba(255,255,255,.06);color:#fff}
.fec-tab.active{background:rgba(124,58,237,.1);color:#fff;box-shadow:inset 0 0 0 1px rgba(124,58,237,.3),inset 0 0 0 2px rgba(255,255,255,.06)}

/* Feed */
.fec-feed{display:flex;flex-direction:column;gap:14px}
.fec-card{display:block;text-decoration:none;color:inherit;background:#fff;border-radius:1.25rem;padding:22px 24px;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 2px 3px rgba(0,0,0,.1),0 16px 32px -10px rgba(0,0,0,.45);transition:transform .3s,box-shadow .3s;animation:fecFade .5s ease-out both}
a.fec-card{cursor:pointer}
.fec-card:hover{transform:translateY(-2px);box-shadow:0 0 0 1px rgba(255,255,255,.22),0 4px 6px rgba(0,0,0,.12),0 20px 40px -10px rgba(0,0,0,.55)}
a.fec-card:hover .fec-card-title{text-decoration:underline;text-decoration-color:#7C3AED;text-decoration-thickness:2px;text-underline-offset:3px}
.fec-card-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px}
.fec-card-cat{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap}
.fec-card-source{font-size:12px;color:rgba(7,7,20,.5);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fec-card-title{font-size:18px;font-weight:600;letter-spacing:-.01em;line-height:1.3;color:#070714;margin:0 0 8px}
.fec-card-summary{font-size:14px;line-height:1.65;color:rgba(7,7,20,.7);margin:0}

.fec-empty,.fec-loading{text-align:center;padding:60px 20px;color:rgba(255,255,255,.6);font-size:15px}
.fec-spinner{width:32px;height:32px;border:3px solid rgba(124,58,237,.2);border-top-color:#7C3AED;border-radius:50%;animation:fecSpin .8s linear infinite;margin:0 auto 16px}

/* About */
.fec-about-section{margin-top:48px;padding:36px 28px;background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.15);border-radius:1.25rem}
.fec-about-inner{max-width:600px;margin:0 auto;text-align:center}
.fec-about-title{font-size:20px;font-weight:700;margin-bottom:12px;color:#fff}
.fec-about-text{font-size:14px;line-height:1.7;color:rgba(255,255,255,.7);margin-bottom:16px}
.fec-about-text strong{color:#9461F5;font-weight:600}
.fec-about-link{display:inline-block;color:#9461F5;font-size:14px;font-weight:600;text-decoration:none;transition:color .2s}
.fec-about-link:hover{color:#fff}

/* Footer */
.fec-footer{margin-top:36px;padding-top:20px;border-top:1px solid rgba(255,255,255,.08);text-align:center}
.fec-footer p{font-size:13px;color:rgba(255,255,255,.5)}
.fec-footer strong{color:rgba(255,255,255,.8);font-weight:600}

/* Action Bar */
.fec-action-bar{position:fixed;bottom:0;left:0;right:0;z-index:9000;display:flex;justify-content:space-around;align-items:stretch;padding:6px 0;padding-bottom:calc(6px + env(safe-area-inset-bottom,0));background:linear-gradient(to top,rgba(7,7,20,.97) 50%,rgba(7,7,20,.85));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-top:1px solid rgba(255,255,255,.08)}
.fec-abtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1;background:none;border:none;color:rgba(255,255,255,.7);font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;padding:8px 4px;border-radius:10px;transition:color .2s,background .2s;min-height:52px;-webkit-tap-highlight-color:transparent}
.fec-abtn:hover,.fec-abtn:focus-visible{color:#fff;background:rgba(255,255,255,.06)}
.fec-abtn svg{width:22px;height:22px;flex-shrink:0}
.fec-abtn.accent{color:#9461F5}
.fec-abtn.accent:hover{color:#fff;background:rgba(124,58,237,.2)}

/* Overlay & Panels */
.fec-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .3s}
.fec-overlay.open{opacity:1;pointer-events:auto}
.fec-panel{position:fixed;left:0;right:0;bottom:0;z-index:9999;height:92vh;height:92dvh;background:#fff;border-radius:20px 20px 0 0;display:flex;flex-direction:column;transform:translateY(100%);transition:transform .35s cubic-bezier(.32,.72,0,1);overflow:hidden;box-shadow:0 -8px 40px rgba(0,0,0,.4)}
.fec-panel.open{transform:translateY(0)}
@media(min-width:641px){.fec-panel{max-width:480px;margin:0 auto;height:80vh}}
.fec-panel-header{background:linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%);padding:16px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0;border-radius:20px 20px 0 0}
.fec-panel-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.3)}
.fec-panel-hinfo{flex:1;min-width:0}
.fec-panel-htitle{font-size:15px;font-weight:600;color:#fff;line-height:1.2}
.fec-panel-hsub{font-size:12px;color:rgba(255,255,255,.75)}
.fec-panel-close{width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:22px;cursor:pointer;flex-shrink:0;transition:background .2s;display:flex;align-items:center;justify-content:center;line-height:1}
.fec-panel-close:hover{background:rgba(255,255,255,.25)}

/* Chat */
.fec-chat-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.fec-chat-msg{max-width:85%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;animation:fecFade .3s ease-out}
.fec-chat-msg.bot{align-self:flex-start;background:#f3f4f6;color:#070714;border-bottom-left-radius:4px}
.fec-chat-msg.user{align-self:flex-end;background:#7C3AED;color:#fff;border-bottom-right-radius:4px}
.fec-chat-msg.typing{display:flex;gap:4px;align-items:center;padding:12px 18px}
.td{width:8px;height:8px;border-radius:50%;background:#9ca3af;animation:fecBounce 1.4s infinite both}
.td:nth-child(2){animation-delay:.2s}.td:nth-child(3){animation-delay:.4s}
.fec-chat-input-area{padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0));border-top:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;flex-shrink:0}
.fec-chat-in{flex:1;padding:10px 14px;border:1px solid #d1d5db;border-radius:24px;font-family:inherit;font-size:16px;outline:none;color:#070714;transition:border-color .2s}
.fec-chat-in:focus{border-color:#7C3AED}
.fec-chat-in::placeholder{color:#9ca3af}
.fec-chat-send{width:40px;height:40px;border-radius:50%;border:none;background:#7C3AED;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,transform .15s;flex-shrink:0}
.fec-chat-send:hover{background:#6D28D9}
.fec-chat-send:active{transform:scale(.92)}
.fec-chat-send:disabled{opacity:.5;cursor:not-allowed}
.fec-chat-send svg{width:18px;height:18px}

/* Forms */
.fec-form-area{display:flex;flex-direction:column;gap:12px;padding:20px 16px;flex:1;overflow-y:auto;color:#070714}
.fec-form-area label{font-size:14px;font-weight:600;color:#070714}
.fec-form-area p{font-size:14px;line-height:1.6;color:rgba(7,7,20,.7)}
.fec-form-area textarea{width:100%;min-height:120px;padding:12px;border:1px solid #d1d5db;border-radius:12px;font-family:inherit;font-size:16px;resize:vertical;outline:none;color:#070714}
.fec-form-area textarea:focus,.fec-form-area input:focus{border-color:#7C3AED}
.fec-form-area input[type="email"],.fec-form-area input[type="text"]{width:100%;padding:10px 14px;border:1px solid #d1d5db;border-radius:12px;font-family:inherit;font-size:16px;outline:none;color:#070714}
.fec-form-btn{align-self:stretch;padding:14px 28px;border-radius:24px;border:none;background:#7C3AED;color:#fff;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s}
.fec-form-btn:hover{background:#6D28D9}
.fec-form-btn:disabled{opacity:.6;cursor:not-allowed}
.fec-sub-status{text-align:center;padding:8px;border-radius:8px;font-size:14px;font-weight:500;display:none}
.fec-sub-status.success{display:block;color:#10B981;background:#ecfdf5}
.fec-sub-status.error{display:block;color:#EF4444;background:#fef2f2}
.fec-success{text-align:center;padding:40px 20px;color:#10B981;font-size:15px;font-weight:600}

/* Responsive */
@media(max-width:640px){
  .fec-logo{font-size:28px}
  .fec-tagline{font-size:15px}
  .fec-hero-section{padding:40px 16px 36px}
  .fec-card{padding:18px 18px}
  .fec-card-title{font-size:16px}
}

@keyframes fecFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes fecSpin{to{transform:rotate(360deg)}}
@keyframes fecBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
`;
  document.head.appendChild(s);
}

/* ---------- Init ---------- */
function init(){
  document.body.style.backgroundColor="#070714";
  document.body.style.margin="0";
  document.body.style.padding="0";
  document.body.style.minHeight="100vh";
  injectStyles();
  buildPage();
  loadArticles();
  injectPanels();
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
else init();
})();
