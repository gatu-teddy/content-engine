import { useState, useEffect } from "react";

/* ═══ API ═══ */
const API_URL = import.meta.env.VITE_API_URL || 'https://content-engine-production-c201.up.railway.app';
const getJwt = () => localStorage.getItem('ce_jwt');
const setJwt = t => localStorage.setItem('ce_jwt', t);
const clearJwt = () => localStorage.removeItem('ce_jwt');
async function apiFetch(path, opts = {}) {
  const jwt = getJwt();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...(opts.headers || {}) },
  });
  if (res.status === 401) { clearJwt(); window.location.reload(); }
  return res;
}
function dbBizToUi(db, saved = {}) {
  const ic = db.intent_config || {};
  return {
    id: db.id,
    name: db.display_name,
    voice: db.brand_voice || '',
    plats: db.enabled_platforms || ['instagram', 'facebook'],
    pub: parseInt(db.published_count) || 0,
    sched: parseInt(db.scheduled_count) || 0,
    pend: parseInt(db.pending_count) || 0,
    auto: 'manual', imageModel: 'nano_banana_2', videoRatio: {}, voiceId: 'sarah',
    musicStyle: 'Luxury ambient — soft piano, aspirational', videoDur: 10, videoLangs: ['en'],
    intent: { mode: ic.mode||'off', platforms: ic.platforms||{reddit:false,x:false}, keywords: ic.keywords||[], dailyCap: ic.dailyCap||{reddit:0,x:0}, geo: ic.geo||{country:'',global:true}, discovered: ic.discovered||{reddit:[],x:[]}, platformAuto: ic.platformAuto||{}, opportunities: 0, replied: 0 },
    cadence: Object.fromEntries(Object.keys(PM).map(k => [k, 'off'])),
    connections: Object.fromEntries(Object.keys(PM).map(k => [k, { status: 'not_connected', handle: '', note: '' }])),
    ...saved,
  };
}
function credsToBizConnections(creds) {
  const out = Object.fromEntries(Object.keys(PM).map(k => [k, { status: 'not_connected', handle: '', note: '' }]));
  for (const c of creds) {
    if (!PM[c.platform]) continue;
    const exp = c.token_expires_at ? new Date(c.token_expires_at) : null;
    const days = exp ? Math.ceil((exp - Date.now()) / 86400000) : null;
    let status = c.status === 'active' ? 'connected' : 'expired';
    let note = exp ? (days <= 0 ? 'Expired' : `Expires in ${days} days`) : (c.status === 'active' ? 'No expiry' : '');
    if (status === 'connected' && days !== null && days <= 7) status = 'expiring';
    out[c.platform] = { status, handle: c.handle || '', note };
  }
  return out;
}
const uiStore = {
  get: id => { try { return JSON.parse(localStorage.getItem('ce_ui') || '{}')[id] || {}; } catch { return {}; } },
  set: (id, v) => { try { const a = JSON.parse(localStorage.getItem('ce_ui') || '{}'); a[id] = { ...a[id], ...v }; localStorage.setItem('ce_ui', JSON.stringify(a)); } catch {} },
};

/* ═══ RESPONSIVE HOOK ═══ */
function useMedia(){
  const[w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h)},[]);
  return{mob:w<640,tab:w>=640&&w<1024,desk:w>=1024,w};
}

/* ═══ DATA ═══ */
const PM = { instagram:{l:"Instagram",icon:"IG"}, x:{l:"X",icon:"X"}, facebook:{l:"Facebook",icon:"FB"}, tiktok:{l:"TikTok",icon:"TT"}, linkedin:{l:"LinkedIn",icon:"IN"}, youtube:{l:"YouTube",icon:"YT"} };
const CAD = [ {id:"3x_daily",l:"3x daily",posts:21,desc:"Morning, afternoon, evening"},{id:"2x_daily",l:"2x daily",posts:14,desc:"Morning and evening"},{id:"daily",l:"Daily",posts:7,desc:"Once per day"},{id:"5x_week",l:"5x / week",posts:5,desc:"Weekdays"},{id:"3x_week",l:"3x / week",posts:3,desc:"Mon, Wed, Fri"},{id:"2x_week",l:"2x / week",posts:2,desc:"Tue, Thu"},{id:"weekly",l:"Weekly",posts:1,desc:"Best day"},{id:"off",l:"Off",posts:0,desc:"No auto-posting"} ];
const IMGM = [ {id:"nano_banana_2",l:"Nano Banana 2",desc:"Fast, consistent, best instruction-following",cost:"~$0.07/img",rec:true},{id:"flux2_pro",l:"FLUX.2 Pro",desc:"Cinematic, best portraits and skin quality",cost:"~$0.055/img"},{id:"ideogram_v2",l:"Ideogram V2",desc:"Best text rendering in images",cost:"~$0.08/img"},{id:"gpt_image_15",l:"GPT Image 1.5",desc:"Highest prompt adherence, versatile",cost:"~$0.04/img"},{id:"recraft_v3",l:"Recraft V3",desc:"Design-oriented, brand palette support",cost:"~$0.04/img"} ];
const SMAP = { generating:"Generating", pending_review:"Pending", scheduled:"Scheduled", published:"Published", failed:"Failed" };
const AMAP = { full_auto:"Full auto", semi_auto:"Semi auto", manual:"Manual" };
const CMAP = { connected:{l:"Connected",d:"#16a34a"}, expiring:{l:"Expiring",d:"#d97706"}, expired:{l:"Expired",d:"#dc2626"}, not_connected:{l:"Not connected",d:"#9ca3af"}, refreshing:{l:"Refreshing...",d:"#6b7280"} };
const VOICES = [{id:"sarah",name:"Sarah",desc:"Warm, female, British. Luxury and aspirational.",accent:"British"},{id:"james",name:"James",desc:"Confident, male, neutral English. Professional.",accent:"Neutral"},{id:"amira",name:"Amira",desc:"Friendly, female, Middle Eastern. Approachable.",accent:"Arabic"},{id:"raj",name:"Raj",desc:"Clear, male, Indian English. Authoritative.",accent:"Indian"},{id:"custom",name:"Custom voice ID",desc:"Paste your own ElevenLabs voice ID.",accent:""}];
const MUSIC_STYLES = ["Luxury ambient — soft piano, aspirational","Upbeat pop — energetic, modern","Chill lofi — relaxed, casual","Corporate — clean, professional","Trending — match platform trends"];
const VID_DURS = [5,10,15,30];
const LANGS = [{id:"en",l:"English",on:true},{id:"ar",l:"Arabic",on:false},{id:"hi",l:"Hindi",on:false},{id:"ur",l:"Urdu",on:false},{id:"fr",l:"French",on:false}];

const initBiz=()=>[
  {id:"b1",name:"Acme Beauty Studio",voice:"Luxury beauty salon. Warm, aspirational.",plats:["x","instagram","facebook","tiktok","youtube"],pub:47,sched:3,pend:1,auto:"full_auto",imageModel:"flux2_pro",videoRatio:{instagram:70,tiktok:100,youtube:80,x:0,facebook:20,linkedin:0},voiceId:"sarah",musicStyle:"Luxury ambient — soft piano, aspirational",videoDur:10,videoLangs:["en","ar"],intent:{mode:"semi_auto",platforms:{reddit:true,x:true},keywords:["nail salon dubai","gel extensions","best manicure","nail tech dubai","wedding nails uae"],dailyCap:{reddit:5,x:8},geo:{country:"AE",global:false},discovered:{reddit:["r/dubai","r/Nails","r/RedditDubai","r/SkincareAddiction"],x:["#dubainails","#gelnails"]},opportunities:12,replied:7},cadence:{instagram:"2x_daily",x:"daily",facebook:"daily",tiktok:"3x_week",youtube:"weekly",linkedin:"off"},connections:{instagram:{status:"connected",handle:"@acmebeauty",note:"Expires in 48 days"},x:{status:"connected",handle:"@acmebeauty",note:"OAuth 1.0a — no expiry"},facebook:{status:"expiring",handle:"Acme Beauty Page",note:"Expires in 6 days"},tiktok:{status:"expired",handle:"",note:"Expired 3 days ago"},youtube:{status:"not_connected",handle:"",note:""},linkedin:{status:"not_connected",handle:"",note:""}}},
  {id:"b2",name:"Metro Property Training",voice:"Real estate training. Authoritative, tactical.",plats:["x","instagram","linkedin","facebook"],pub:23,sched:1,pend:0,auto:"semi_auto",imageModel:"nano_banana_2",videoRatio:{},voiceId:"james",musicStyle:"Corporate — clean, professional",videoDur:10,videoLangs:["en"],intent:{mode:"approval",platforms:{reddit:true,x:true},keywords:["real estate course","property training","how to become agent dubai","rera exam"],dailyCap:{reddit:3,x:5},geo:{country:"AE",global:false},discovered:{reddit:["r/dubai","r/realestateinvesting","r/RealEstate","r/DubaiRealEstate"],x:["#dubaiProperty","#RERAexam"]},opportunities:5,replied:2},cadence:{instagram:"daily",x:"3x_week",facebook:"3x_week",linkedin:"2x_week",tiktok:"off",youtube:"off"},connections:{instagram:{status:"connected",handle:"@metroproperty",note:"Expires in 34 days"},x:{status:"connected",handle:"@metroproperty",note:"No expiry"},facebook:{status:"connected",handle:"Metro Property Page",note:"Expires in 52 days"},linkedin:{status:"connected",handle:"Metro Property",note:"Expires in 41 days"},tiktok:{status:"not_connected",handle:"",note:""},youtube:{status:"not_connected",handle:"",note:""}}},
  {id:"b3",name:"HomeBase Connect",voice:"Agent-buyer marketplace. Professional.",plats:["x","linkedin","facebook"],pub:8,sched:0,pend:0,auto:"manual",imageModel:"nano_banana_2",videoRatio:{},voiceId:"james",musicStyle:"Corporate — clean, professional",videoDur:10,videoLangs:["en"],intent:{mode:"off",platforms:{reddit:false,x:false},keywords:[],dailyCap:{reddit:0,x:0},geo:{country:"",global:true},discovered:{reddit:[],x:[]},opportunities:0,replied:0},cadence:{x:"off",linkedin:"off",facebook:"off",instagram:"off",tiktok:"off",youtube:"off"},connections:{x:{status:"connected",handle:"@homebase",note:"No expiry"},linkedin:{status:"not_connected",handle:"",note:""},facebook:{status:"not_connected",handle:"",note:""},instagram:{status:"not_connected",handle:"",note:""},tiktok:{status:"not_connected",handle:"",note:""},youtube:{status:"not_connected",handle:"",note:""}}}
];

const CONTENT=[{id:"c1",brief:"Spring collection launch — seasonal colours, premium positioning.",status:"published",at:"2026-03-16T14:30Z",plats:["x","instagram","facebook"],tpl:"Product launch",imp:0,eng:0},{id:"c2",brief:"Flash promotion — 20% discount limited time offer.",status:"scheduled",at:"2026-03-17T09:00Z",sched:"2026-03-18T10:00+04:00",plats:["instagram","facebook","tiktok"],imp:0,eng:0},{id:"c3",brief:"Behind the scenes — studio tour and team introduction.",status:"pending_review",at:"2026-03-17T11:20Z",plats:["instagram","tiktok"],tpl:"Behind the scenes",imp:0,eng:0},{id:"c4",brief:"Client transformation reel — before and after showcase.",status:"published",at:"2026-03-15T08:00Z",plats:["instagram","tiktok","youtube"],tpl:"Before/after",imp:0,eng:0},{id:"c5",brief:"Team spotlight — new hire welcome.",status:"published",at:"2026-03-14T12:00Z",plats:["x","instagram","facebook"],tpl:"Team spotlight",imp:0,eng:0}];
const TPLS=[{id:"t1",name:"Before/after showcase",freq:"3x/week",active:true,perf:82,fires:34,plats:["instagram","tiktok","facebook"]},{id:"t2",name:"Behind the scenes",freq:"Weekly",active:true,perf:64,fires:12,plats:["instagram","tiktok"]},{id:"t3",name:"Team spotlight",freq:"Monthly",active:true,perf:71,fires:4,plats:["x","instagram","facebook"]},{id:"t4",name:"Client testimonial",freq:"2x/week",active:true,perf:88,fires:22,plats:["instagram","facebook"]},{id:"t5",name:"Product education",freq:"Weekly",active:false,perf:45,fires:8,plats:["instagram","linkedin"]}];
const GEN={x:{text:"Spring just got a glow-up. New collection — crafted for the season.",hashtags:["NewDrop","SpringLaunch"]},instagram:{caption:"Your next refresh is calling.\n\nSpring '26 Collection is here.\n\nLink in bio.",hashtags:["SpringCollection","NewLaunch","Premium"],video:true,voiceover:"Your next refresh is calling. The Spring twenty-six Collection is here.",videoMotion:"Slow zoom into product display, soft light flare, luxury feel",musicMood:"Luxury ambient, soft piano",assets:{video:"video_ig_spring.mp4",voiceover:"vo_ig_spring.mp3",music:"music_ig_spring.mp3",final:"final_ig_spring.mp4",dur:"0:10"}},facebook:{message:"New season, new collection! Spring '26 just landed.\n\nBook now — link in bio or DM!",hashtags:["SpringCollection","BookNow"]},tiktok:{title:"Spring collection just dropped",hashtags:["fyp","spring","newcollection"],video:true,voiceover:"Spring collection just dropped. New colours, new vibes, new you.",videoMotion:"Quick cuts between products, energetic transitions",musicMood:"Upbeat pop, trending feel",assets:{video:"video_tt_spring.mp4",voiceover:"vo_tt_spring.mp3",music:"music_tt_spring.mp3",final:"final_tt_spring.mp4",dur:"0:10"}}};
const PERMS={instagram:["Publish content","Read insights","Manage comments"],x:["Post tweets","Read metrics"],facebook:["Manage posts","Read insights","Manage engagement"],tiktok:["Post content","Access creator info","Query performance"],linkedin:["Share posts","Read profile","Access email"],youtube:["Upload videos","Manage content","View analytics"]};

/* ═══ TOKENS ═══ */
const T="#111827",M="#4b5563",U="#9ca3af",B="#e5e7eb",BL="#f3f4f6",BG="#f9fafb",W="#fff";
const cd={background:W,borderRadius:10,border:`1px solid ${B}`};
const r={display:"flex",alignItems:"center"};
const lb={fontSize:12,fontWeight:500,color:M,marginBottom:5};
const bt={padding:"8px 14px",borderRadius:7,border:`1px solid ${B}`,background:W,fontSize:12,fontWeight:500,cursor:"pointer",color:M,minHeight:36};
const btD={...bt,background:T,color:W,border:"none"};
const btR={...bt,color:"#dc2626",borderColor:"#fecaca"};

/* ═══ SMALL COMPONENTS ═══ */
const fd=d=>new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const fn=n=>n>=1000?(n/1000).toFixed(1)+"k":String(n);
const Pl=({p})=><span style={{fontSize:11,color:U}}>{p.map(x=>PM[x]?.l).filter(Boolean).join(", ")}</span>;
const Sd=({s})=>{const c=s==="published"||s==="connected"?"#16a34a":s==="expired"||s==="failed"?"#dc2626":s==="expiring"||s==="pending_review"||s==="scheduled"?"#d97706":"#9ca3af";return <span style={{...r,gap:5}}><span style={{width:6,height:6,borderRadius:3,background:c,flexShrink:0}}/><span style={{fontSize:11,color:M}}>{SMAP[s]||CMAP[s]?.l||s}</span></span>};
const Al=({m})=>{const c=m==="full_auto"?"#16a34a":m==="semi_auto"?"#d97706":"#9ca3af";return <span style={{...r,gap:5,fontSize:11}}><span style={{width:6,height:6,borderRadius:3,background:c}}/><span style={{color:M}}>{AMAP[m]}</span></span>};
const Pb=({v})=><span style={{...r,gap:6}}><span style={{fontSize:12,fontWeight:600,color:M,minWidth:20,textAlign:"right"}}>{v}</span><span style={{width:56,height:4,borderRadius:2,background:BL,display:"inline-block",position:"relative"}}><span style={{position:"absolute",left:0,top:0,height:4,borderRadius:2,width:v+"%",background:U}}/></span></span>;
const Ic=({name,size=18})=>{const p={home:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",spark:"M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",cal:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",clock:"M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",folder:"M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",gear:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",tpl:"M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z",chart:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",link:"M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",out:"M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",check:"M5 13l4 4L19 7",x:"M6 18L18 6M6 6l12 12",refresh:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",target:"M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12zm0 4a2 2 0 100 4 2 2 0 000-4z",eye:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",recycle:"M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-9L21 12m0 0l-4.5 4.5M21 12H7.5M12 3l4.5 4.5M12 3L7.5 7.5",trending:"M2 17l6-6 4 4 8-10",menu:"M4 6h16M4 12h16M4 18h16"};return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={p[name]||""}/>{name==="gear"&&<circle cx="12" cy="12" r="3"/>}{name==="eye"&&<circle cx="12" cy="12" r="3"/>}</svg>};

/* ═══ RESPONSIVE GRID ═══ */
const RGrid=({cols=4,tabCols,mobCols=1,gap=10,children,style:s})=>{
  const{mob,tab}=useMedia();
  const c=mob?(mobCols||1):tab?(tabCols||Math.min(cols,2)):cols;
  return <div style={{display:"grid",gridTemplateColumns:`repeat(${c},1fr)`,gap,...s}}>{children}</div>;
};

/* ═══ RESPONSIVE HEADER ═══ */
const RHeader=({title,subtitle,children})=>{
  const{mob}=useMedia();
  return <div style={{...r,justifyContent:"space-between",marginBottom:mob?14:18,flexWrap:"wrap",gap:8}}>
    <div style={{minWidth:0}}><h1 style={{fontSize:mob?17:20,fontWeight:700,margin:"0 0 2px",color:T}}>{title}</h1>{subtitle&&<p style={{fontSize:mob?12:13,color:U,margin:0}}>{subtitle}</p>}</div>
    {children&&<div style={{...r,gap:8,flexWrap:"wrap"}}>{children}</div>}
  </div>;
};

/* ═══ MODAL WRAPPER ═══ */
const Modal=({onClose,width=400,children})=>{
  const{mob}=useMedia();
  return <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",...r,justifyContent:"center",alignItems:mob?"flex-end":"center",zIndex:1000,padding:mob?0:16}}>
    <div style={{width:mob?"100%":Math.min(width,460),maxWidth:"100%",borderRadius:mob?"14px 14px 0 0":14,background:W,padding:mob?"20px 18px 28px":"22px 26px",maxHeight:mob?"85vh":"90vh",overflowY:"auto"}}>{children}</div>
  </div>;
};

/* ═══ PAGE PICKER MODAL ═══ */
function PagePickerModal({token,platform,onDone,onClose}){
  const[pages,setPages]=useState(null);const[saving,setSaving]=useState(false);const[err,setErr]=useState("");
  useEffect(()=>{apiFetch(`/api/oauth/pending/${token}`).then(r=>r.ok?r.json():null).then(d=>{if(d)setPages(d.pages);else setErr("Session expired. Please connect again.");});},[token]);
  const pick=async(pageId)=>{setSaving(true);const r=await apiFetch("/api/oauth/select-page",{method:"POST",body:JSON.stringify({token,page_id:pageId})});if(r.ok){onDone();}else{setSaving(false);setErr("Failed to save. Try again.");}};
  return <Modal onClose={onClose} width={460}>
    <div style={{fontSize:16,fontWeight:700,color:T,marginBottom:4}}>Select a page</div>
    <div style={{fontSize:13,color:U,marginBottom:16}}>Choose which {PM[platform]?.l||platform} page to connect to this business.</div>
    {err&&<div style={{fontSize:13,color:"#dc2626",marginBottom:12}}>{err}</div>}
    {!pages&&!err&&<div style={{padding:"24px 0",textAlign:"center"}}><div className="ce-spin" style={{width:22,height:22,border:`2px solid ${B}`,borderTopColor:T,borderRadius:"50%",margin:"0 auto"}}/></div>}
    {pages&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
      {pages.map(p=><button key={p.id} onClick={()=>!saving&&pick(p.id)} style={{...bt,textAlign:"left",padding:"10px 14px",display:"flex",flexDirection:"column",gap:2,opacity:saving?.5:1}}>
        <span style={{fontSize:13,fontWeight:600,color:T}}>{p.name}</span>
        {p.ig_user_id&&<span style={{fontSize:11,color:U}}>Instagram: @{p.ig_user_id}</span>}
        <span style={{fontSize:11,color:U}}>Page ID: {p.id}</span>
      </button>)}
    </div>}
    {saving&&<div style={{fontSize:12,color:U,textAlign:"center",padding:"8px 0"}}>Saving...</div>}
  </Modal>;
}

/* ═══ OAUTH MODAL ═══ */
function OAuthModal({platform,bizId,onClose}){
  const{mob}=useMedia();
  const[step,setStep]=useState("login");const pm=PM[platform];const perms=PERMS[platform]||[];
  const go=async()=>{setStep("loading");try{const r=await apiFetch(`/api/businesses/${bizId}/oauth-url/${platform}`);if(!r.ok){setStep("login");alert("OAuth not configured for this platform. Check API environment variables.");return;}const{url}=await r.json();window.location.href=url;}catch{setStep("login");alert("Failed to start OAuth. Check your connection.");}};
  return(<Modal onClose={onClose} width={460}>
    <div style={{padding:"10px 16px",background:BL,borderBottom:`1px solid ${B}`,...r,gap:6,margin:mob?"-20px -18px 0":"-22px -26px 0",borderRadius:mob?"14px 14px 0 0":"14px 14px 0 0"}}>
      <div style={{...r,gap:6}}>{["#ef4444","#f59e0b","#22c55e"].map((c,i)=><div key={i} style={{width:10,height:10,borderRadius:5,background:c,cursor:i===0?"pointer":"default"}} onClick={i===0?onClose:undefined}/>)}</div>
      <div style={{flex:1,background:W,borderRadius:6,padding:"4px 12px",fontSize:11,color:U,fontFamily:"monospace",marginLeft:8,border:`1px solid ${B}`,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{platform}.com/oauth/authorize?scope=...</div>
    </div>
    <div style={{padding:"28px 0 8px",textAlign:"center"}}>
      {step==="login"&&<><div style={{width:44,height:44,borderRadius:8,background:BL,...r,justifyContent:"center",margin:"0 auto 14px",fontSize:15,fontWeight:700,color:M}}>{pm.icon}</div>
        <div style={{fontSize:17,fontWeight:700,color:T,marginBottom:4}}>Sign in to {pm.l}</div>
        <div style={{fontSize:13,color:U,marginBottom:18}}>Content Engine wants access</div>
        <div style={{textAlign:"left",background:BG,borderRadius:8,padding:"12px 16px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:600,color:M,marginBottom:6}}>Permissions:</div>
          {perms.map((p,i)=><div key={i} style={{...r,gap:8,padding:"3px 0",fontSize:13,color:M}}><Ic name="check" size={14}/>{p}</div>)}
        </div>
        <div style={{...r,gap:10,justifyContent:"center",flexWrap:"wrap"}}><button onClick={go} style={{...btD,padding:"10px 26px"}}>Authorize</button><button onClick={onClose} style={bt}>Cancel</button></div>
      </>}
      {step==="loading"&&<div style={{padding:"36px 0"}}><div className="ce-spin" style={{width:28,height:28,border:`3px solid ${B}`,borderTopColor:T,borderRadius:"50%",margin:"0 auto 14px"}}/><div style={{fontSize:14,fontWeight:600,color:T}}>Connecting...</div></div>}
      {step==="success"&&<div style={{padding:"36px 0"}}><div style={{width:40,height:40,borderRadius:"50%",background:"#f0fdf4",...r,justifyContent:"center",margin:"0 auto 12px",color:"#16a34a"}}><Ic name="check" size={22}/></div><div style={{fontSize:15,fontWeight:700,color:T}}>Connected</div><div style={{fontSize:12,color:U,marginTop:4}}>Redirecting...</div></div>}
    </div>
  </Modal>);
}

/* ═══ PAGES ═══ */
function PageHome({biz}){
  const{mob}=useMedia();
  const cn=biz.connections||{},ca=biz.cadence||{};
  const tw=Object.values(ca).reduce((s,v)=>{const o=CAD.find(c=>c.id===v);return s+(o?o.posts:0)},0);
  const ap=Object.values(ca).filter(v=>v!=="off").length;
  const warns=Object.values(cn).filter(c=>c.status==="expiring"||c.status==="expired").length;
  const im=(IMGM.find(m=>m.id===(biz.imageModel||"nano_banana_2"))||IMGM[0]).l;
  return <div>
    <div style={{...r,gap:10,marginBottom:4,flexWrap:"wrap"}}><h1 style={{fontSize:mob?17:20,fontWeight:700,margin:0,color:T}}>{biz.name}</h1><Al m={biz.auto}/></div>
    <p style={{fontSize:mob?12:13,color:U,margin:"0 0 18px"}}>{biz.voice} · {im}</p>
    <RGrid cols={4} tabCols={2} mobCols={2} gap={8} style={{marginBottom:14}}>
      {[{l:"Published",v:biz.pub},{l:"Scheduled",v:biz.sched},{l:"Posts / week",v:tw},{l:"Active platforms",v:ap}].map(s=><div key={s.l} style={{...cd,padding:mob?"10px 12px":"14px 16px"}}><div style={{fontSize:mob?18:22,fontWeight:700,color:T}}>{s.v}</div><div style={{fontSize:mob?10:11,color:U,marginTop:2}}>{s.l}</div></div>)}
    </RGrid>
    <RGrid cols={2} mobCols={1} gap={10} style={{marginBottom:10}}>
      <div style={{...cd,padding:mob?"10px 12px":"14px 16px"}}><div style={{fontSize:13,fontWeight:600,color:T,marginBottom:8}}>Posting cadence</div>
        {biz.plats.map(p=>{const cv=ca[p]||"off";const co=CAD.find(o=>o.id===cv);return <div key={p} style={{...r,justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${BL}`}}><span style={{fontSize:12,color:M}}>{PM[p]?.l}</span><span style={{fontSize:12,fontWeight:500,color:cv==="off"?U:T}}>{co?.l||"Off"}</span></div>})}
        {biz.auto==="manual"&&<div style={{marginTop:6,fontSize:11,color:"#d97706"}}>Paused — mode is manual</div>}
      </div>
      <div style={{...cd,padding:mob?"10px 12px":"14px 16px"}}><div style={{fontSize:13,fontWeight:600,color:T,marginBottom:8}}>Platform status</div>
        {biz.plats.map(p=>{const c=cn[p]||{status:"not_connected"};const d=CMAP[c.status]||CMAP.not_connected;return <div key={p} style={{...r,justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${BL}`}}><span style={{fontSize:12,color:M}}>{PM[p]?.l}</span><span style={{...r,gap:5}}><span style={{width:6,height:6,borderRadius:3,background:d.d}}/><span style={{fontSize:11,color:M}}>{d.l}</span></span></div>})}
        {warns>0&&<div style={{marginTop:6,fontSize:11,color:"#dc2626"}}>{warns} need attention</div>}
      </div>
    </RGrid>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:10}}>
      <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:8}}>Content stack</div>
      {[
        {label:"Text",provider:"Claude (Anthropic)",detail:"Platform-specific copy from briefs"},
        {label:"Images",provider:"fal.ai",detail:im+" · image-only platforms"},
        {label:"Video",provider:"ElevenCreative",detail:Object.values(biz.videoRatio||{}).some(v=>v>0)?"Direct from brief · "+Object.entries(biz.videoRatio||{}).filter(([k,v])=>v>0).map(([k,v])=>`${PM[k]?.l} ${v}%`).join(", "):"Not enabled"},
        {label:"Voiceover",provider:"ElevenLabs TTS",detail:Object.values(biz.videoRatio||{}).some(v=>v>0)?(VOICES.find(v=>v.id===biz.voiceId)||VOICES[0]).name:"Not enabled"},
        {label:"Music",provider:"ElevenLabs Music",detail:Object.values(biz.videoRatio||{}).some(v=>v>0)?(biz.musicStyle||"").split("—")[0].trim():"Not enabled"},
      ].map((s,i)=><div key={i} style={{...r,justifyContent:"space-between",padding:"4px 0",borderBottom:i<4?`1px solid ${BL}`:"none",gap:8}}>
        <span style={{fontSize:12,fontWeight:600,color:T,minWidth:60}}>{s.label}</span>
        <span style={{fontSize:11,color:M,flex:1}}>{s.provider}</span>
        <span style={{fontSize:11,color:Object.values(biz.videoRatio||{}).some(v=>v>0)||i<2?"#16a34a":U,textAlign:"right"}}>{s.detail}</span>
      </div>)}
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:10}}><div style={{fontSize:13,fontWeight:600,color:T,marginBottom:8}}>Top templates</div>
      {TPLS.filter(t=>t.active).sort((a,b)=>b.perf-a.perf).slice(0,4).map(t=><div key={t.id} style={{...r,justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${BL}`}}><span style={{fontSize:12,color:M}}>{t.name}</span><Pb v={t.perf}/></div>)}
      <div style={{marginTop:6,fontSize:11,color:U}}>AI selects by performance + rotation</div>
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px"}}><div style={{fontSize:13,fontWeight:600,color:T,marginBottom:8}}>Recent activity</div>
      {CONTENT.slice(0,4).map(c=><div key={c.id} style={{...(mob?{}:r),justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${BL}`,gap:4}}>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,color:T,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.brief}</div><div style={{...r,gap:6,marginTop:2}}><span style={{fontSize:11,color:U}}>{fd(c.at)}</span><Pl p={c.plats}/></div></div>
        <Sd s={c.status}/>
      </div>)}
    </div>
  </div>;
}

function PageCreate({biz,onDone}){
  const{mob}=useMedia();
  const[brief,setBrief]=useState("");const[gen,setGen]=useState(false);const[result,setResult]=useState(null);const[imgOn,setImgOn]=useState(true);const[schedTime,setSchedTime]=useState("");
  const[selPlats,setSelPlats]=useState(biz.plats);
  const im=(IMGM.find(m=>m.id===(biz.imageModel||"nano_banana_2"))||IMGM[0]).l;
  const doGen=async()=>{if(!brief.trim())return;setGen(true);try{const r=await apiFetch("/api/generate",{method:"POST",body:JSON.stringify({business_id:biz.id,brief:brief.trim(),image_model:biz.imageModel||"nano_banana_2",generate_image:imgOn,platforms:selPlats,scheduled_at:schedTime||null})});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||"Generation failed");}const raw=await r.json();console.log("[generate] raw response:", raw);// n8n may return {variants:{...}, image_url:...} or wrap in array
      const payload=Array.isArray(raw)?raw[0]:raw;
      const variants=payload?.variants||payload;
      const image_url=payload?.image_url||null;
      // attach image_url to each platform variant so display can use it
      const enriched={};
      Object.entries(variants).forEach(([k,v])=>{if(typeof v==="object"&&v!==null&&["instagram","facebook","x","tiktok","linkedin","youtube"].includes(k)){enriched[k]={...v,image_url};}});
      setResult(Object.keys(enriched).length?enriched:variants);}catch(e){alert("Generation failed: "+e.message);}finally{setGen(false);}};
  const smartSched=()=>{const now=new Date();const dow=now.getDay();const optH={instagram:[9,10,11,10,11,10,9],x:[10,8,9,9,8,8,10],facebook:[11,9,10,10,9,9,11],tiktok:[10,14,15,14,15,14,10],linkedin:[10,8,9,8,9,8,10],youtube:[14,13,14,13,12,12,13]};const p=selPlats.find(s=>s!=="off")||"instagram";const h=(optH[p]||[])[dow]||10;const d=new Date(now);if(h<=now.getHours())d.setDate(d.getDate()+1);d.setHours(h,0,0,0);setSchedTime(d.toISOString().slice(0,16))};
  const fillFromTpl=(name)=>{const t=TPLS.find(tp=>tp.name===name);if(t&&t.brief)setBrief(t.brief)};
  const togglePlat=(k)=>setSelPlats(p=>p.includes(k)?p.filter(x=>x!==k):[...p,k]);
  if(result)return <div>
    <div style={{...(mob?{}:r),justifyContent:"space-between",marginBottom:18,gap:10}}>
      <h2 style={{fontSize:mob?17:18,fontWeight:700,margin:0,color:T}}>Generated content</h2>
      <div style={{...r,gap:8}}><button onClick={()=>setResult(null)} style={bt}>Discard</button><button onClick={()=>{setResult(null);setBrief("");onDone?.()}} style={btD}>Approve & schedule</button></div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {Object.entries(result).filter(([k,v])=>PM[k]&&typeof v==="object"&&v!==null).map(([k,v])=>{const isVideo=v.video;const platLabel=PM[k]?.l;return <div key={k} style={{...cd,overflow:"hidden"}}>
        <div style={{...r,justifyContent:"space-between",padding:"10px 16px",borderBottom:`1px solid ${BL}`}}>
          <div style={{...r,gap:8}}><span style={{fontSize:12,fontWeight:600,color:T,background:BL,padding:"2px 8px",borderRadius:4}}>{platLabel}</span>{isVideo?<span style={{fontSize:10,fontWeight:600,color:"#16a34a",background:"#f0fdf4",padding:"2px 8px",borderRadius:4}}>{k==="instagram"?"Reel":k==="youtube"?"Short":"Video"}</span>:<span style={{fontSize:10,color:U,background:BL,padding:"2px 8px",borderRadius:4}}>Image</span>}</div>
          <button onClick={()=>{setResult(null);doGen();}} style={{padding:"2px 8px",borderRadius:4,border:`1px solid ${B}`,background:W,fontSize:10,cursor:"pointer",color:U,minHeight:28}}>Regenerate</button>
        </div>
        <div style={{padding:"14px 16px"}}>
          <div style={{display:"flex",gap:14}}>
            {isVideo?<div style={{width:mob?80:120,height:mob?106:160,borderRadius:8,background:BL,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}>
              <div style={{width:28,height:28,borderRadius:14,background:W,border:`1px solid ${B}`,...r,justifyContent:"center"}}><svg width="12" height="12" viewBox="0 0 24 24" fill={T} stroke="none"><polygon points="8,5 20,12 8,19"/></svg></div>
              <span style={{fontSize:10,color:U,marginTop:4}}>Preview</span>
              <span style={{position:"absolute",bottom:6,right:6,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:9,padding:"1px 5px",borderRadius:3}}>{v.assets?.dur||"0:10"}</span>
            </div>:<div style={{width:mob?80:120,height:mob?80:120,borderRadius:8,background:BL,...r,justifyContent:"center",flexShrink:0,overflow:"hidden"}}>
              {(v.image_url||result.image_url)?<img src={v.image_url||result.image_url} alt="Generated" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:10,color:U}}>Image</span>}
            </div>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:M,whiteSpace:"pre-wrap",lineHeight:1.6}}>{v.text||v.caption||v.message||v.title}</div>
              {v.hashtags&&<div style={{marginTop:6,fontSize:11,color:"#2563eb"}}>{v.hashtags.map(h=>"#"+h).join(" ")}</div>}
              {!isVideo&&((biz.videoRatio||{})[k]||0)===0&&Object.values(biz.videoRatio||{}).some(v=>v>0)&&<div style={{marginTop:8,fontSize:10,color:U}}>Static image via fal.ai — video ratio is 0% for {platLabel}</div>}
            </div>
          </div>
          {isVideo&&<div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${BL}`}}>
            <div style={{fontSize:11,fontWeight:600,color:T,marginBottom:6}}>Generated assets</div>
            {[
              {icon:"V",color:"#16a34a",bg:"#f0fdf4",label:`Video (ElevenCreative · direct from brief · ${v.assets?.dur||"10s"})`,ok:true},
              {icon:"VO",color:"#7c3aed",bg:"#f5f3ff",label:`Voiceover (ElevenLabs TTS · ${(VOICES.find(vc=>vc.id===biz.voiceId)||VOICES[0]).name})`,ok:true},
              {icon:"M",color:"#d97706",bg:"#fffbeb",label:`Music (ElevenLabs · ${(biz.musicStyle||"ambient").split("—")[0].trim()})`,ok:true},
              {icon:"F",color:M,bg:BL,label:"Final MP4 (combined via ffmpeg)",ok:true},
            ].map((a,i)=><div key={i} style={{...r,gap:8,padding:"6px 0",borderBottom:i<3?`1px solid ${BL}`:"none"}}>
              <div style={{width:24,height:24,borderRadius:6,background:a.bg,...r,justifyContent:"center",flexShrink:0,fontSize:10,fontWeight:700,color:a.color}}>{a.icon}</div>
              <span style={{fontSize:11,color:U,flex:1}}>{a.label}</span>
              <span style={{fontSize:10,color:"#16a34a",fontWeight:600}}>Ready</span>
            </div>)}
            {v.voiceover&&<div style={{marginTop:8,padding:"8px 10px",borderRadius:6,background:BL}}>
              <div style={{fontSize:10,fontWeight:600,color:M,marginBottom:2}}>Voiceover script</div>
              <div style={{fontSize:11,color:U,lineHeight:1.5,fontStyle:"italic"}}>{v.voiceover}</div>
            </div>}
          </div>}
        </div>
      </div>})}
    </div>
    {Object.values(biz.videoRatio||{}).some(v=>v>0)&&<div style={{...r,justifyContent:"space-between",padding:"10px 14px",marginTop:10,borderRadius:8,background:BL}}>
      <span style={{fontSize:11,color:U}}>Estimated generation cost</span>
      <span style={{fontSize:11,fontWeight:600,color:T}}>~$0.38 ({Object.entries(result).filter(([k])=>(biz.videoRatio||{})[k]>0&&result[k]?.video).length} video + {Object.entries(result).filter(([k])=>!((biz.videoRatio||{})[k]>0&&result[k]?.video)).length} image)</span>
    </div>}
  </div>;
  return <div>
    <h1 style={{fontSize:mob?17:20,fontWeight:700,margin:"0 0 4px",color:T}}>Create content</h1>
    <p style={{fontSize:mob?12:13,color:U,margin:"0 0 22px"}}>{biz.name}</p>
    <div style={{maxWidth:560}}>
      <div style={{marginBottom:14}}><div style={lb}>Content brief</div><textarea value={brief} onChange={e=>setBrief(e.target.value)} placeholder="Describe what you want to post about..." style={{width:"100%",minHeight:100,padding:"10px 14px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,resize:"vertical",outline:"none",fontFamily:"inherit",lineHeight:1.5,boxSizing:"border-box"}}/></div>
      <div style={{marginBottom:14}}><div style={lb}>Template</div><select onChange={e=>{if(e.target.value)fillFromTpl(e.target.value)}} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,outline:"none"}}><option value="">Select template</option>{TPLS.filter(t=>t.active).map(t=><option key={t.id} value={t.name}>{t.name}</option>)}</select></div>
      <div style={{marginBottom:14}}><div style={lb}>Platforms</div><div style={{...r,gap:6,flexWrap:"wrap"}}>{Object.entries(PM).map(([k,p])=>{const on=selPlats.includes(k);return <span key={k} onClick={()=>togglePlat(k)} style={{padding:"6px 12px",borderRadius:6,fontSize:12,fontWeight:500,border:`1px solid ${on?T:B}`,background:on?BL:W,color:on?T:U,cursor:"pointer"}}>{p.l}</span>})}</div></div>
      <div style={{marginBottom:14,...r,gap:10}}><div onClick={()=>setImgOn(!imgOn)} style={{width:36,height:20,borderRadius:10,background:imgOn?T:"#d1d5db",position:"relative",cursor:"pointer",flexShrink:0}}><div style={{width:14,height:14,borderRadius:7,background:W,position:"absolute",top:3,left:imgOn?19:3,transition:"left .2s"}}/></div><span style={{fontSize:12,color:M}}>Generate image via {im}</span></div>
      <div style={{marginBottom:14}}><div style={lb}>Schedule</div><div style={{...r,gap:8,flexWrap:"wrap"}}><button onClick={smartSched} style={bt}>Smart schedule</button><span style={{fontSize:11,color:U}}>or</span><input type="datetime-local" value={schedTime} onChange={e=>setSchedTime(e.target.value)} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:12,outline:"none"}}/></div>{schedTime&&<div style={{fontSize:10,color:U,marginTop:4}}>Scheduled for {new Date(schedTime).toLocaleString()}</div>}</div>
      {gen?<div style={{...r,gap:10,padding:"10px 0"}}><div className="ce-spin" style={{width:14,height:14,border:`2px solid ${B}`,borderTopColor:T,borderRadius:"50%"}}/><span style={{fontSize:13,color:U}}>Generating with Claude Opus + {im}...</span></div>
        :<button onClick={doGen} disabled={!brief.trim()} style={{...btD,...r,gap:8,padding:"10px 20px",opacity:brief.trim()?1:.5}}><Ic name="spark" size={15}/> Generate</button>}
    </div></div>;
}

const SUGGESTED_TPLS = {
  beauty: [
    {name:"Before/after showcase",brief:"Show a before and after transformation featuring {technique}. Highlight quality and client reaction.",vars:[{name:"technique",values:["gel extensions","BIAB overlay","Russian manicure","classic polish","nail art"]}],img:"Close-up before/after split, studio lighting, clean background",plats:["instagram","tiktok","facebook"],freq:"3x_week",why:"Before/after content consistently gets the highest engagement for beauty businesses. Visual proof of skill builds trust."},
    {name:"Client testimonial",brief:"Share a client testimonial about their experience with {service}. Focus on how it made them feel.",vars:[{name:"service",values:["gel extensions","bridal nails","nail repair","luxury manicure"]}],img:"Elegant hands close-up, soft lighting, client perspective",plats:["instagram","facebook"],freq:"2x_week",why:"Social proof is the #1 driver for salon bookings. Real client words outperform any ad copy."},
    {name:"Behind the scenes",brief:"Take the audience behind the scenes at the studio. Show {scene}. Keep it authentic and warm.",vars:[{name:"scene",values:["morning setup routine","product shelf tour","team at work","colour mixing","client consultation"]}],img:"Candid studio moment, natural lighting, authentic feel",plats:["instagram","tiktok"],freq:"weekly",why:"BTS content humanises your brand. Shows the care and professionalism behind the final result."},
    {name:"Product education",brief:"Explain the difference between {topic}. Position as expert authority. Helpful tone.",vars:[{name:"topic",values:["gel vs BIAB vs acrylic","why nails lift","how to maintain extensions","nail health tips","seasonal colour trends"]}],img:"Clean flat-lay of products/tools on marble, educational layout",plats:["instagram","linkedin"],freq:"weekly",why:"Educational content positions you as the expert. High save rate — people bookmark these."},
    {name:"Team spotlight",brief:"Introduce {team_member} and their speciality. Share what makes them unique.",vars:[{name:"team_member",values:["Sarah — nail art specialist","Mia — bridal expert","Leila — BIAB queen","Priya — classic manicure"]}],img:"Portrait of team member at their station, warm studio lighting",plats:["instagram","facebook","x"],freq:"monthly",why:"Puts faces to the brand. Clients book specific technicians when they feel a connection."},
    {name:"Flash promotion",brief:"Limited time offer on {offer}. Create urgency. Include booking CTA.",vars:[{name:"offer",values:["20% off gel extensions","free nail art upgrade","BIAB intro price","refer a friend discount"]}],img:"Bold promotional graphic, clean typography, brand colours",plats:["instagram","facebook","x"],freq:"2x_week",why:"Drives immediate bookings. The urgency + CTA combo consistently converts."},
  ],
  saas: [
    {name:"Feature walkthrough",brief:"Walk through how {feature} works. Show the UI in action. Focus on the problem it solves.",vars:[{name:"feature",values:["dashboard analytics","one-click publishing","AI content generation","team collaboration","scheduling engine"]}],img:"AI-generated screenshot of the platform UI, clean and modern",plats:["x","linkedin"],freq:"2x_week",why:"Feature content educates prospects and reduces support load. Screenshots make the product feel real."},
    {name:"Problem/solution post",brief:"Describe the pain point of {problem}. Show how the platform solves it simply.",vars:[{name:"problem",values:["managing multiple social accounts","inconsistent posting","manual content creation","tracking analytics across platforms"]}],img:"Split graphic — chaotic left side vs clean right side",plats:["x","linkedin","facebook"],freq:"3x_week",why:"Pain-point content resonates because people see themselves in the problem before they see the solution."},
    {name:"User success story",brief:"Share how {user_type} achieved {result} using the platform. Specific numbers if possible.",vars:[{name:"user_type",values:["a solo founder","an agency","a marketing team","an e-commerce brand"]},{name:"result",values:["3x engagement","saved 10 hours/week","grew to 50k followers","doubled their leads"]}],img:"Clean quote card with metric highlight, minimal design",plats:["linkedin","x","facebook"],freq:"weekly",why:"Case studies with specific metrics are the highest-converting content type for SaaS."},
    {name:"Tip / hack",brief:"Share a quick tip about {topic}. Keep it actionable and immediately useful.",vars:[{name:"topic",values:["optimal posting times","hashtag strategy","content recycling","AI prompt writing","engagement hooks"]}],img:"Clean text-on-background graphic, single tip highlighted",plats:["x","linkedin"],freq:"daily",why:"Quick tips get high engagement because they deliver immediate value. Great for building authority."},
    {name:"Changelog / what's new",brief:"Announce {update}. Frame it as solving a real user request. Thank the community.",vars:[{name:"update",values:["new analytics dashboard","bulk scheduling","AI image generation","team permissions","API v2"]}],img:"AI-generated screenshot showing the new feature, annotated",plats:["x","linkedin"],freq:"2x_week",why:"Changelog posts show momentum. Users and prospects want to see a product that's actively improving."},
  ],
  realestate: [
    {name:"Market insight",brief:"Share a quick insight about {topic} in the Dubai real estate market. Data-driven, authoritative.",vars:[{name:"topic",values:["off-plan vs ready","ROI by area","visa changes for investors","RERA updates","rental yield trends"]}],img:"Clean infographic with data point highlighted, professional",plats:["linkedin","x","instagram"],freq:"3x_week",why:"Market insights position you as the authority. Agents and investors save and share data-driven content."},
    {name:"Common mistake",brief:"Explain why {mistake} is costing agents money. Provide the correct approach.",vars:[{name:"mistake",values:["not following up leads within 24h","ignoring off-plan inventory","underpricing listings","skipping RERA certification","poor listing photos"]}],img:"Bold text graphic with the mistake crossed out",plats:["instagram","linkedin","x"],freq:"2x_week",why:"Mistake content gets high engagement because people either recognise themselves or want to avoid the error."},
    {name:"Student success story",brief:"Share how {student} went from {before} to {after} using the training program.",vars:[{name:"student",values:["Ahmed","Sarah","James","Priya"]},{name:"before",values:["zero closings","struggling with leads","part-time agent"]},{name:"after",values:["5 closings in first month","pipeline of 20 leads","full-time top performer"]}],img:"Quote card with student photo or initials, clean design",plats:["instagram","linkedin","facebook"],freq:"weekly",why:"Social proof from students drives course enrolment more than any feature description."},
  ],
};

function PageTemplates({biz}){
  const{mob}=useMedia();
  const[view,setView]=useState("list");
  const[editing,setEditing]=useState(null);
  const[suggesting,setSuggesting]=useState(false);
  const[suggested,setSuggested]=useState(null);
  const[tpls,setTpls]=useState(TPLS);

  const bizType = biz.name.includes("Beauty")||biz.name.includes("Nail") ? "beauty" : biz.name.includes("Property")||biz.name.includes("Real") ? "realestate" : "saas";
  const suggestions = SUGGESTED_TPLS[bizType] || SUGGESTED_TPLS.saas;

  const startSuggest=()=>{setSuggesting(true);setTimeout(()=>{setSuggesting(false);setSuggested(suggestions);setView("suggest")},2000)};
  const addFromSuggestion=(s)=>{const nt={id:"t"+Date.now(),name:s.name,freq:s.freq.replace("_"," "),active:true,perf:0,fires:0,plats:s.plats,brief:s.brief,vars:s.vars,img:s.img};setTpls(p=>[...p,nt]);setView("list")};
  const startNew=()=>{setEditing({id:"t"+Date.now(),name:"",brief:"",vars:[],img:"",plats:["instagram"],freq:"weekly",active:true,perf:0,fires:0});setView("edit")};
  const startEdit=(t)=>{setEditing({...t});setView("edit")};
  const saveEdit=()=>{if(!editing.name.trim())return;setTpls(p=>{const exists=p.find(t=>t.id===editing.id);return exists?p.map(t=>t.id===editing.id?editing:t):[...p,editing]});setEditing(null);setView("list")};

  if(view==="suggest"&&suggested) return <div>
    <RHeader title="Suggested templates" subtitle={`Based on ${biz.name}'s context and industry`}>
      <button onClick={()=>setView("list")} style={bt}>Back to list</button>
    </RHeader>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {suggested.map((s,i)=><div key={i} style={{...cd,padding:mob?"12px 14px":"16px 18px"}}>
        <div style={{...(mob?{}:r),justifyContent:"space-between",marginBottom:8,gap:8}}>
          <div style={{fontSize:14,fontWeight:600,color:T}}>{s.name}</div>
          <button onClick={()=>addFromSuggestion(s)} style={{...btD,padding:"5px 14px",fontSize:11}}>Add template</button>
        </div>
        <div style={{fontSize:12,color:M,lineHeight:1.5,marginBottom:8}}>{s.brief}</div>
        {s.vars.length>0&&<div style={{marginBottom:8}}>
          {s.vars.map((v,vi)=><div key={vi} style={{marginBottom:4}}>
            <span style={{fontSize:11,fontWeight:600,color:T}}>{"{"}{v.name}{"}"}: </span>
            <span style={{fontSize:11,color:U}}>{v.values.join(", ")}</span>
          </div>)}
        </div>}
        <div style={{...r,gap:12,marginBottom:8,flexWrap:"wrap"}}>
          <div><span style={{fontSize:10,fontWeight:600,color:U}}>Image: </span><span style={{fontSize:11,color:M}}>{s.img}</span></div>
        </div>
        <div style={{...r,gap:8,marginBottom:8,flexWrap:"wrap"}}>
          <span style={{fontSize:10,fontWeight:600,color:U}}>Platforms:</span>
          {s.plats.map(p=><span key={p} style={{fontSize:11,color:M}}>{PM[p]?.l}</span>)}
          <span style={{fontSize:10,color:U}}>·</span>
          <span style={{fontSize:11,color:M}}>{s.freq.replace("_"," ")}</span>
        </div>
        <div style={{background:BL,borderRadius:6,padding:"8px 12px",fontSize:11,color:M,lineHeight:1.5}}>
          <span style={{fontWeight:600}}>Why this works: </span>{s.why}
        </div>
      </div>)}
    </div>
  </div>;

  if(view==="edit"&&editing) return <div>
    <div style={{...(mob?{}:r),justifyContent:"space-between",marginBottom:18,gap:8}}>
      <h1 style={{fontSize:mob?17:20,fontWeight:700,margin:0,color:T}}>{editing.fires===0&&!editing.name?"New template":"Edit template"}</h1>
      <div style={{...r,gap:8}}><button onClick={()=>{setEditing(null);setView("list")}} style={bt}>Cancel</button><button onClick={saveEdit} style={btD}>Save template</button></div>
    </div>
    <div style={{maxWidth:560}}>
      <div style={{marginBottom:14}}><div style={lb}>Template name</div><input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} placeholder="e.g. Before/after showcase" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
      <div style={{marginBottom:14}}><div style={lb}>Brief structure</div><div style={{fontSize:11,color:U,marginBottom:4}}>Use {"{variable_name}"} for dynamic values the AI cycles through</div><textarea value={editing.brief||""} onChange={e=>setEditing({...editing,brief:e.target.value})} placeholder="e.g. Show a before and after transformation featuring {technique}. Highlight quality..." style={{width:"100%",minHeight:80,padding:"10px 14px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,resize:"vertical",outline:"none",fontFamily:"inherit",lineHeight:1.5,boxSizing:"border-box"}}/></div>
      <div style={{marginBottom:14}}>
        <div style={lb}>Dynamic variables</div>
        <div style={{fontSize:11,color:U,marginBottom:8}}>Each variable cycles through its values so content doesn't repeat</div>
        {(editing.vars||[]).map((v,vi)=><div key={vi} style={{...cd,padding:"10px 12px",marginBottom:6}}>
          <div style={{...r,justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:600,color:T}}>{"{"}{v.name}{"}"}</span>
            <button onClick={()=>setEditing({...editing,vars:editing.vars.filter((_,i)=>i!==vi)})} style={{padding:"2px 6px",borderRadius:4,border:`1px solid ${B}`,background:W,fontSize:10,cursor:"pointer",color:U,minHeight:28}}>Remove</button>
          </div>
          <div style={{...r,gap:4,flexWrap:"wrap"}}>{v.values.map((val,vali)=><span key={vali} style={{...r,gap:3,padding:"3px 8px",borderRadius:4,background:BL,fontSize:11,color:M}}>{val}<span onClick={()=>{const nv=[...editing.vars];nv[vi]={...nv[vi],values:nv[vi].values.filter((_,i)=>i!==vali)};setEditing({...editing,vars:nv})}} style={{cursor:"pointer",color:U}}>x</span></span>)}</div>
          <input placeholder="Add value, press Enter" onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){const nv=[...editing.vars];nv[vi]={...nv[vi],values:[...nv[vi].values,e.target.value.trim()]};setEditing({...editing,vars:nv});e.target.value=""}}} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:`1px solid ${B}`,fontSize:11,outline:"none",marginTop:6,boxSizing:"border-box"}}/>
        </div>)}
        <button onClick={()=>{const name=prompt("Variable name (no braces):");if(name?.trim())setEditing({...editing,vars:[...(editing.vars||[]),{name:name.trim(),values:[]}]})}} style={{...bt,padding:"5px 12px",fontSize:11,borderStyle:"dashed"}}>+ Add variable</button>
      </div>
      <div style={{marginBottom:14}}><div style={lb}>Image prompt guidance</div><div style={{fontSize:11,color:U,marginBottom:4}}>Optional — tells the image model what to generate</div><input value={editing.img||""} onChange={e=>setEditing({...editing,img:e.target.value})} placeholder="e.g. Close-up before/after split, studio lighting" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
      <div style={{marginBottom:14}}><div style={lb}>Target platforms</div><div style={{...r,gap:6,flexWrap:"wrap"}}>{Object.entries(PM).map(([k,p])=>{const on=(editing.plats||[]).includes(k);return <span key={k} onClick={()=>setEditing({...editing,plats:on?(editing.plats||[]).filter(x=>x!==k):[...(editing.plats||[]),k]})} style={{padding:"6px 12px",borderRadius:6,fontSize:12,fontWeight:500,border:`1px solid ${on?T:B}`,background:on?BL:W,color:on?T:U,cursor:"pointer"}}>{p.l}</span>})}</div></div>
      <div style={{marginBottom:14}}><div style={lb}>Frequency</div><select value={editing.freq||"weekly"} onChange={e=>setEditing({...editing,freq:e.target.value})} style={{padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,outline:"none"}}><option value="daily">Daily</option><option value="3x_week">3x / week</option><option value="2x_week">2x / week</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
    </div>
  </div>;

  return <div>
    <div style={{...(mob?{}:r),justifyContent:"space-between",marginBottom:16,gap:8}}>
      <div><h1 style={{fontSize:mob?17:20,fontWeight:700,margin:"0 0 2px",color:T}}>Templates</h1><p style={{fontSize:mob?12:13,color:U,margin:0}}>{biz.name} · {tpls.filter(t=>t.active).length} active</p></div>
      <div style={{...r,gap:8,flexWrap:"wrap"}}>
        {suggesting?<div style={{...r,gap:8}}><div className="ce-spin" style={{width:14,height:14,border:`2px solid ${B}`,borderTopColor:T,borderRadius:"50%"}}/><span style={{fontSize:12,color:U}}>Analysing context vault...</span></div>
        :<button onClick={startSuggest} style={{...bt,...r,gap:6}}><Ic name="spark" size={14}/> Suggest templates</button>}
        <button onClick={startNew} style={btD}>+ New template</button>
      </div>
    </div>
    {tpls.map(t=><div key={t.id} style={{...cd,padding:"12px 16px",marginBottom:8}}>
      <div style={{...(mob?{display:"flex",flexDirection:"column",gap:8}:r),justifyContent:"space-between"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{...r,gap:8,marginBottom:2,flexWrap:"wrap"}}><span style={{fontSize:13,fontWeight:600,color:T}}>{t.name}</span><span style={{fontSize:10,fontWeight:500,padding:"2px 6px",borderRadius:4,color:t.active?"#16a34a":U,background:t.active?"#f0fdf4":BL}}>{t.active?"Active":"Paused"}</span></div>
          <div style={{fontSize:11,color:U}}>{t.freq} · {t.fires} fires · <Pl p={t.plats}/></div>
          {t.brief&&<div style={{fontSize:11,color:M,marginTop:4,lineHeight:1.4}}>{t.brief}</div>}
        </div>
        <div style={{...r,gap:10,flexShrink:0}}><Pb v={t.perf}/><button onClick={()=>startEdit(t)} style={bt}>Edit</button></div>
      </div>
    </div>)}
  </div>;
}

function PageHistory({biz}){
  const{mob}=useMedia();
  const[items,setItems]=useState([]);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    setLoading(true);
    apiFetch(`/api/content?business_id=${biz.id}&limit=50`)
      .then(r=>r.ok?r.json():{items:[]})
      .then(d=>{setItems(Array.isArray(d)?d:(d.items||[]));setLoading(false);})
      .catch(()=>setLoading(false));
  },[biz.id]);
  const approve=async(id)=>{
    await apiFetch(`/api/content/${id}`,{method:"PUT",body:JSON.stringify({status:"scheduled"})});
    setItems(prev=>prev.map(c=>c.id===id?{...c,status:"scheduled"}:c));
  };
  return <div>
    <h1 style={{fontSize:mob?17:20,fontWeight:700,margin:"0 0 16px",color:T}}>History</h1>
    {loading&&<div style={{color:U,fontSize:13,padding:"20px 0",textAlign:"center"}}>Loading…</div>}
    {!loading&&items.length===0&&<div style={{color:U,fontSize:13,padding:"20px 0",textAlign:"center"}}>No content yet. Generate your first post!</div>}
    {items.map(c=>{const plats=c.platforms||Object.keys(c.variants||{}).filter(k=>PM[k]);return <div key={c.id} style={{...cd,padding:"12px 16px",marginBottom:8}}>
      <div style={{...(mob?{display:"flex",flexDirection:"column",gap:6}:r),justifyContent:"space-between"}}>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,color:T,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.brief}</div><div style={{...r,gap:6,flexWrap:"wrap"}}><span style={{fontSize:11,color:U}}>{fd(c.created_at)}</span><Pl p={plats}/></div></div>
        <div style={{...r,gap:10,flexWrap:"wrap"}}><Sd s={c.status}/>{c.status==="pending_review"&&<button onClick={()=>approve(c.id)} style={{...btD,padding:"4px 10px",fontSize:11}}>Approve</button>}</div>
      </div>
    </div>;})}
  </div>;
}

function PageCalendar({biz}){
  const{mob}=useMedia();
  const[items,setItems]=useState([]);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    setLoading(true);
    apiFetch(`/api/content?business_id=${biz.id}&limit=50`)
      .then(r=>r.ok?r.json():{items:[]})
      .then(d=>{const rows=Array.isArray(d)?d:(d.items||[]);setItems(rows.filter(c=>c.status==="scheduled"||c.status==="published"));setLoading(false);})
      .catch(()=>setLoading(false));
  },[biz.id]);
  return <div>
    <h1 style={{fontSize:mob?17:20,fontWeight:700,margin:"0 0 4px",color:T}}>Calendar</h1>
    <p style={{fontSize:mob?12:13,color:U,margin:"0 0 16px"}}>{new Date().toLocaleString("default",{month:"long",year:"numeric"})}</p>
    {loading&&<div style={{color:U,fontSize:13,padding:"20px 0",textAlign:"center"}}>Loading…</div>}
    {!loading&&items.length===0&&<div style={{color:U,fontSize:13,padding:"20px 0",textAlign:"center"}}>No scheduled or published content.</div>}
    {items.map(c=>{const plats=c.platforms||Object.keys(c.variants||{}).filter(k=>PM[k]);return <div key={c.id} style={{...cd,padding:"12px 16px",marginBottom:8}}>
      <div style={{...(mob?{display:"flex",flexDirection:"column",gap:4}:r),justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:13,fontWeight:500,color:T}}>{c.brief}</span><Sd s={c.status}/></div>
      <div style={{...r,gap:6,flexWrap:"wrap"}}><span style={{fontSize:11,color:U}}>{c.scheduled_at?"Sched: "+fd(c.scheduled_at):fd(c.created_at)}</span><Pl p={plats}/></div>
    </div>;})}
  </div>;
}

const CODE_EXTS=["js","jsx","ts","tsx","json","csv","py","html","css"];
function PageVault({biz}){
  const{mob}=useMedia();
  const[tab,setTab]=useState("docs");
  const[loading,setLoading]=useState(true);
  const[docList,setDocList]=useState([]);
  const[imgList,setImgList]=useState([]);
  const ts=a=>({padding:"6px 14px",borderRadius:6,border:"none",fontSize:12,fontWeight:500,cursor:"pointer",background:a?W:"transparent",color:a?T:U,minHeight:32});
  const typeColor=(t)=>t==="JSX"||t==="JS"||t==="TSX"||t==="JSON"?"#7c3aed":t==="PDF"?"#dc2626":t==="MD"?"#2563eb":"#0891b2";
  const fmtSize=(b)=>b>1048576?(b/1048576).toFixed(1)+" MB":(b/1024).toFixed(0)+" KB";

  const loadVault=async()=>{
    setLoading(true);
    const[dr,ir]=await Promise.all([
      apiFetch(`/api/uploads/documents/${biz.id}`).then(r=>r.ok?r.json():[]).catch(()=>[]),
      apiFetch(`/api/uploads/images/${biz.id}`).then(r=>r.ok?r.json():[]).catch(()=>[]),
    ]);
    setDocList(dr);setImgList(ir);setLoading(false);
  };
  useEffect(()=>{loadVault();},[biz.id]);

  const uploadDoc=async(file)=>{
    const fd=new FormData();fd.append("file",file);
    const r=await apiFetch(`/api/uploads/document/${biz.id}`,{method:"POST",body:fd,headers:{}});
    if(r.ok){const d=await r.json();setDocList(p=>[d,...p]);}
  };
  const uploadImg=async(file)=>{
    const fd=new FormData();fd.append("file",file);fd.append("label",file.name.split(".")[0]);
    const r=await apiFetch(`/api/uploads/image/${biz.id}`,{method:"POST",body:fd,headers:{}});
    if(r.ok){const d=await r.json();setImgList(p=>[d,...p]);}
  };
  const remDoc=async(doc)=>{
    await apiFetch(`/api/uploads/document/${biz.id}/${doc.id}`,{method:"DELETE"});
    setDocList(p=>p.filter(d=>d.id!==doc.id));
  };
  const remImg=async(img)=>{
    await apiFetch(`/api/uploads/image/${biz.id}/${img.id}`,{method:"DELETE"});
    setImgList(p=>p.filter(d=>d.id!==img.id));
  };
  const allDocs=docList.filter(d=>!CODE_EXTS.includes(d.file_type));
  const codeList=docList.filter(d=>CODE_EXTS.includes(d.file_type));

  return <div>
    <h1 style={{fontSize:mob?17:20,fontWeight:700,margin:"0 0 2px",color:T}}>Context vault</h1>
    <p style={{fontSize:mob?12:13,color:U,margin:"0 0 16px"}}>{biz.name} · Claude reads everything here when generating content</p>
    <div style={{...r,gap:2,marginBottom:14,background:BL,borderRadius:8,padding:3,width:"fit-content",flexWrap:"wrap"}}>
      {[["docs","Documents"],["code","Code & data"],["imgs","Images"]].map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={ts(tab===k)}>{l}</button>)}
    </div>
    {loading&&<div style={{fontSize:13,color:U,padding:"20px 0"}}>Loading vault...</div>}
    {!loading&&tab==="docs"&&<div>
      {allDocs.length===0&&<div style={{fontSize:12,color:U,padding:"12px 0"}}>No documents yet.</div>}
      {allDocs.map((d)=>{const t=d.file_type?.toUpperCase();return <div key={d.id} style={{...cd,...(mob?{padding:"10px 12px"}:{...r,padding:"12px 14px"}),marginBottom:8}}>
        <div style={{width:34,height:34,borderRadius:6,background:BL,...r,justifyContent:"center",marginRight:12,flexShrink:0}}><span style={{fontSize:10,fontWeight:700,color:typeColor(t)}}>{t}</span></div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,color:T}}>{d.filename}</div><div style={{fontSize:11,color:U}}>{fmtSize(d.file_size_bytes)}</div></div>
        <button onClick={()=>remDoc(d)} style={btR}>Remove</button>
      </div>;})}
      <input type="file" id="docUp" accept=".pdf,.docx,.txt,.md" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)uploadDoc(f);e.target.value="";}}/>
      <button onClick={()=>document.getElementById("docUp").click()} style={{...bt,borderStyle:"dashed",marginTop:4}}>Upload document</button>
      <div style={{marginTop:10,fontSize:11,color:U,lineHeight:1.5}}>Supported: PDF, DOCX, TXT, MD.</div>
    </div>}
    {!loading&&tab==="code"&&<div>
      <div style={{...cd,padding:"12px 14px",marginBottom:12}}><div style={{fontSize:12,color:M,lineHeight:1.6}}>Upload source code, config files, or data files. Claude reads these to generate accurate content.</div></div>
      {codeList.length===0&&<div style={{fontSize:12,color:U,padding:"12px 0"}}>No code files yet.</div>}
      {codeList.map((d)=>{const t=d.file_type?.toUpperCase();return <div key={d.id} style={{...cd,...(mob?{padding:"10px 12px"}:{...r,padding:"12px 14px"}),marginBottom:8}}>
        <div style={{width:34,height:34,borderRadius:6,background:BL,...r,justifyContent:"center",marginRight:12,flexShrink:0}}><span style={{fontSize:9,fontWeight:700,color:typeColor(t),fontFamily:"monospace"}}>{t}</span></div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,color:T,fontFamily:"monospace"}}>{d.filename}</div><div style={{fontSize:11,color:U}}>{fmtSize(d.file_size_bytes)}</div></div>
        <button onClick={()=>remDoc(d)} style={btR}>Remove</button>
      </div>;})}
      <input type="file" id="codeUp" accept=".js,.jsx,.ts,.tsx,.json,.csv,.py,.html,.css" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)uploadDoc(f);e.target.value="";}}/>
      <button onClick={()=>document.getElementById("codeUp").click()} style={{...bt,borderStyle:"dashed",marginTop:4}}>Upload code / data file</button>
    </div>}
    {!loading&&tab==="imgs"&&<div>
      <RGrid cols={5} tabCols={3} mobCols={2} gap={8}>
        {imgList.map((img)=><div key={img.id} style={{...cd,overflow:"hidden",position:"relative"}}>
          <div style={{aspectRatio:"1",background:BL,overflow:"hidden"}}>{img.file_url&&<img src={img.file_url} alt={img.label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>
          <div style={{padding:"6px 8px",...r,justifyContent:"space-between"}}><span style={{fontSize:11,color:M,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{img.label||img.filename}</span><button onClick={()=>remImg(img)} style={{...btR,padding:"1px 6px",fontSize:10}}>×</button></div>
        </div>)}
      </RGrid>
      {imgList.length===0&&<div style={{fontSize:12,color:U,padding:"12px 0"}}>No images yet.</div>}
      <input type="file" id="imgUp" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)uploadImg(f);e.target.value="";}}/>
      <button onClick={()=>document.getElementById("imgUp").click()} style={{...bt,borderStyle:"dashed",marginTop:10}}>Upload image</button>
      <div style={{marginTop:10,fontSize:11,color:U,lineHeight:1.5}}>Reference images for the AI image generator.</div>
    </div>}
  </div>;
}

function PageConnections({biz,onUpdate}){
  const{mob}=useMedia();
  const[oauthTarget,setOauthTarget]=useState(null);const[disc,setDisc]=useState(null);
  const cn=biz.connections||{};const connected=Object.values(cn).filter(c=>c.status==="connected").length;const warns=Object.values(cn).filter(c=>c.status==="expiring"||c.status==="expired").length;
  const refreshCreds=async()=>{const r=await apiFetch(`/api/businesses/${biz.id}/credentials`);if(r.ok){const creds=await r.json();onUpdate({...biz,connections:credsToBizConnections(creds)});}};
  useEffect(()=>{refreshCreds();const p=new URLSearchParams(window.location.search);if(p.get("connected")||p.get("error"))window.history.replaceState({},"",window.location.pathname);}, [biz.id]);
  const refresh=p=>{onUpdate({...biz,connections:{...cn,[p]:{...cn[p],status:"refreshing"}}});apiFetch(`/api/oauth/refresh/${p}/${biz.id}`,{method:"POST"}).then(()=>refreshCreds());};
  const disconnect=async p=>{await apiFetch(`/api/businesses/${biz.id}/credentials/${p}`,{method:"DELETE"});onUpdate({...biz,connections:{...cn,[p]:{status:"not_connected",handle:"",note:""}}});setDisc(null)};
  return <div>
    <RHeader title="Connections" subtitle={biz.name}>
      <span style={{fontSize:12,color:M}}>{connected}/6</span>
      {warns>0&&<span style={{fontSize:11,fontWeight:600,color:"#dc2626"}}>{warns} need attention</span>}
    </RHeader>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {Object.entries(PM).map(([k,pm])=>{const c=cn[k]||{status:"not_connected",handle:"",note:""};const d=CMAP[c.status]||CMAP.not_connected;return <div key={k} style={{...cd,padding:mob?"10px 12px":"12px 16px"}}>
        <div style={{...(mob?{display:"flex",flexDirection:"column",gap:8}:r)}}>
          <div style={{...r,flex:1,minWidth:0}}>
            <div style={{width:34,height:34,borderRadius:7,background:BL,...r,justifyContent:"center",marginRight:12,flexShrink:0,fontSize:11,fontWeight:700,color:M}}>{pm.icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{...r,gap:8,flexWrap:"wrap"}}><span style={{fontSize:13,fontWeight:600,color:T}}>{pm.l}</span><span style={{...r,gap:4}}><span style={{width:6,height:6,borderRadius:3,background:d.d}}/><span style={{fontSize:11,color:M}}>{d.l}</span></span></div>
              <div style={{fontSize:11,color:c.status==="expired"?"#dc2626":c.status==="expiring"?"#d97706":U,marginTop:1}}>{c.handle?c.handle+" · ":""}{c.note||"Click connect"}</div>
            </div>
          </div>
          <div style={{...r,gap:6,flexShrink:0,flexWrap:"wrap"}}>
            {c.status==="connected"&&<><button onClick={()=>refresh(k)} style={bt}>Refresh</button><button onClick={()=>setDisc(k)} style={btR}>Disconnect</button></>}
            {c.status==="expiring"&&<><button onClick={()=>refresh(k)} style={{...bt,color:"#d97706",borderColor:"#fde68a"}}>Refresh now</button><button onClick={()=>setDisc(k)} style={btR}>Disconnect</button></>}
            {c.status==="expired"&&<button onClick={()=>setOauthTarget(k)} style={{...bt,color:"#dc2626",borderColor:"#fecaca"}}>Reconnect</button>}
            {c.status==="not_connected"&&<button onClick={()=>setOauthTarget(k)} style={bt}>Connect</button>}
            {c.status==="refreshing"&&<div style={{...r,gap:6,padding:"7px 12px"}}><div className="ce-spin" style={{width:12,height:12,border:`2px solid ${B}`,borderTopColor:T,borderRadius:"50%"}}/><span style={{fontSize:11,color:U}}>Refreshing...</span></div>}
          </div>
        </div>
      </div>})}
    </div>
    <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:BL,fontSize:12,color:U,lineHeight:1.6}}>Tokens are encrypted per-business. OAuth 2.0 tokens expire after 60 days.</div>
    {oauthTarget&&<OAuthModal platform={oauthTarget} bizId={biz.id} onClose={()=>setOauthTarget(null)}/>}
    {disc&&<Modal onClose={()=>setDisc(null)} width={380}>
      <div style={{fontSize:16,fontWeight:700,color:T,marginBottom:6}}>Disconnect {PM[disc]?.l}?</div><p style={{fontSize:13,color:M,marginBottom:4}}>Scheduled posts will fail.</p><p style={{fontSize:12,color:"#dc2626",marginBottom:18}}>Requires re-authentication.</p><div style={{...r,gap:8,justifyContent:"flex-end"}}><button onClick={()=>setDisc(null)} style={bt}>Cancel</button><button onClick={()=>disconnect(disc)} style={{...btD,background:"#dc2626"}}>Disconnect</button></div>
    </Modal>}
  </div>;
}

function PageSettings({biz,onUpdate}){
  const{mob}=useMedia();
  const[saved,setSaved]=useState(false);const ca=biz.cadence||{};
  const[expandedAI,setExpandedAI]=useState(null);
  const save=()=>{setSaved(true);setTimeout(()=>setSaved(false),2000)};
  const setCad=(p,v)=>onUpdate({...biz,cadence:{...ca,[p]:v}});
  const tw=Object.values(ca).reduce((s,v)=>{const o=CAD.find(c=>c.id===v);return s+(o?o.posts:0)},0);
  return <div style={{maxWidth:580}}>
    <h1 style={{fontSize:mob?17:20,fontWeight:700,margin:"0 0 18px",color:T}}>Settings</h1>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{...r,gap:8,marginBottom:8,flexWrap:"wrap"}}><span style={{fontSize:13,fontWeight:600,color:T}}>Automation mode</span><Al m={biz.auto}/></div>
      <div style={{...r,gap:6,flexWrap:"wrap"}}>{Object.entries(AMAP).map(([k,l])=><button key={k} onClick={()=>onUpdate({...biz,auto:k})} style={{...bt,background:biz.auto===k?BL:W,color:biz.auto===k?T:U,borderColor:biz.auto===k?T:B}}>{l}</button>)}</div>
      <p style={{fontSize:11,color:U,marginTop:6}}>{biz.auto==="full_auto"?"Auto-generate and publish. Review after.":biz.auto==="semi_auto"?"Auto-generate, hold for approval.":"Manual only. Cadence paused."}</p>
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{...r,justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div><div style={{fontSize:13,fontWeight:600,color:T}}>Posting cadence</div><div style={{fontSize:11,color:U,marginTop:1}}>Per-platform. AI selects templates.</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:20,fontWeight:700,color:T}}>{tw}</div><div style={{fontSize:10,color:U}}>posts / week</div></div>
      </div>
      {biz.auto==="manual"&&<div style={{marginBottom:10,fontSize:11,color:"#d97706",background:"#fffbeb",padding:"6px 10px",borderRadius:6}}>Inactive — switch to Full auto or Semi auto.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {Object.entries(PM).map(([k,pm])=>{const cv=ca[k]||"off";const co=CAD.find(o=>o.id===cv);const posts=co?co.posts:0;
          const warn=k==="youtube"&&posts>7?"YouTube API allows ~6 uploads/day. Request quota increase for higher cadence.":k==="linkedin"&&posts>14?"LinkedIn limits to 100 share API calls/day. High cadence with multiple businesses may hit limits.":null;
          const isOpen=expandedAI===k;
          const features=[{k:"hookTest",l:"Hook testing",d:"3 hook variants, pick randomly"},{k:"cannibal",l:"Cannibalisation detection",d:"Skip similar recent content"},{k:"crossPost",l:"Smart cross-posting",d:"Adapt top posts from other platforms"}];
          if(k!=="x"&&k!=="youtube") features.push({k:"captionLen",l:"Caption length",d:"Alternate short vs long"});
          const aiCount=features.filter(f=>(biz.aiOpt||{})[`${k}_${f.k}`]!==false).length;
          return <div key={k} style={{borderRadius:8,border:`1px solid ${warn?"#fde68a":B}`,overflow:"hidden",opacity:biz.auto==="manual"?.4:1}}>
          <div style={{...r,padding:mob?"8px 10px":"9px 12px",flexWrap:"wrap",gap:8}}>
            <div style={{width:30,height:30,borderRadius:6,background:BL,...r,justifyContent:"center",flexShrink:0,fontSize:10,fontWeight:700,color:M}}>{pm.icon}</div>
            <div style={{flex:1,minWidth:80}}><span style={{fontSize:12,fontWeight:600,color:T}}>{pm.l}</span>{co&&cv!=="off"&&<div style={{fontSize:11,color:U}}>{co.desc} · {co.posts}/wk</div>}</div>
            <select value={cv} onChange={e=>setCad(k,e.target.value)} disabled={biz.auto==="manual"} style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,color:cv!=="off"?T:U,background:W,outline:"none",cursor:"pointer"}}>{CAD.map(o=><option key={o.id} value={o.id}>{o.l}</option>)}</select>
          </div>
          <div onClick={()=>setExpandedAI(isOpen?null:k)} style={{...r,gap:6,padding:"0 12px 0 52px",cursor:"pointer",borderTop:`1px solid ${BL}`,height:30,background:isOpen?BL:"transparent"}}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={U} strokeWidth="2" style={{transform:isOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform .15s"}}><path d="M9 5l7 7-7 7"/></svg>
            <span style={{fontSize:10,color:U}}>AI optimisation</span>
            <span style={{fontSize:9,color:U,background:BL,padding:"1px 6px",borderRadius:4}}>{aiCount}/{features.length} on</span>
          </div>
          {isOpen&&<div style={{padding:"8px 12px 10px 52px",background:BL,borderTop:`1px solid ${B}`}}>
            {features.map(opt=>{
              const key=`${k}_${opt.k}`;
              const on=(biz.aiOpt||{})[key]!==false;
              return <div key={key} style={{...r,gap:8,padding:"4px 0"}}>
                <div onClick={e=>{e.stopPropagation();onUpdate({...biz,aiOpt:{...(biz.aiOpt||{}),[key]:!on}})}} style={{width:28,height:14,borderRadius:7,background:on?T:"#d1d5db",position:"relative",cursor:"pointer",flexShrink:0}}><div style={{width:9,height:9,borderRadius:5,background:W,position:"absolute",top:2.5,left:on?16:3,transition:"left .2s"}}/></div>
                <span style={{fontSize:11,fontWeight:500,color:on?T:U}}>{opt.l}</span>
                <span style={{fontSize:10,color:U}}>{opt.d}</span>
              </div>;
            })}
          </div>}
          {warn&&<div style={{fontSize:10,color:"#d97706",padding:"4px 12px 6px 52px",background:isOpen?BL:"transparent"}}>{warn}</div>}
        </div>})}
      </div>
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:3}}>Content recycling</div>
      <div style={{fontSize:11,color:U,marginBottom:10}}>Automatically rewrites top-performing posts (30+ days old) with a fresh angle.</div>
      <div style={{...r,gap:12,flexWrap:"wrap"}}>
        <div style={{...r,gap:10}}>
          <div onClick={()=>onUpdate({...biz,recycleEnabled:!(biz.recycleEnabled!==false)})} style={{width:36,height:20,borderRadius:10,background:biz.recycleEnabled!==false?T:"#d1d5db",position:"relative",cursor:"pointer",flexShrink:0}}><div style={{width:14,height:14,borderRadius:7,background:W,position:"absolute",top:3,left:biz.recycleEnabled!==false?19:3,transition:"left .2s"}}/></div>
          <span style={{fontSize:12,color:M}}>{biz.recycleEnabled!==false?"Enabled":"Disabled"}</span>
        </div>
        {biz.recycleEnabled!==false&&<div style={{...r,gap:6}}>
          <span style={{fontSize:11,color:U}}>Recycle ratio:</span>
          <select value={biz.recycleRatio||30} onChange={e=>onUpdate({...biz,recycleRatio:parseInt(e.target.value)})} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none",color:T}}>
            <option value={10}>10%</option><option value={20}>20%</option><option value={30}>30%</option><option value={40}>40%</option><option value={50}>50%</option>
          </select>
        </div>}
      </div>
      {biz.recycleEnabled!==false&&<div style={{marginTop:8,fontSize:11,color:U}}>At {biz.recycleRatio||30}% — roughly {Math.round((biz.recycleRatio||30)/100*tw)} of your {tw} weekly posts will be recycled</div>}
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:3}}>Image model (fal.ai)</div>
      <div style={{fontSize:11,color:U,marginBottom:10}}>For image-only platforms. Video platforms use ElevenCreative directly — this model is not involved.</div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {IMGM.map(m=>{const a=(biz.imageModel||"nano_banana_2")===m.id;return <div key={m.id} onClick={()=>onUpdate({...biz,imageModel:m.id})} style={{...r,padding:mob?"8px 10px":"9px 12px",borderRadius:8,border:`1px solid ${a?T:B}`,background:a?BL:W,cursor:"pointer",flexWrap:"wrap",gap:8}}>
          <div style={{width:14,height:14,borderRadius:7,border:a?`4px solid ${T}`:`2px solid #d1d5db`,flexShrink:0,boxSizing:"border-box"}}/>
          <div style={{flex:1,minWidth:100}}><div style={{...r,gap:6,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:600,color:T}}>{m.l}</span>{m.rec&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background:BL,color:U}}>Default</span>}</div><div style={{fontSize:11,color:U}}>{m.desc}</div></div>
          <span style={{fontSize:11,color:U,flexShrink:0}}>{m.cost}</span>
        </div>})}
      </div>
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:3}}>Video content (ElevenCreative)</div>
      <div style={{fontSize:11,color:U,marginBottom:12}}>Set the video-to-image ratio per platform. 0% = all images via fal.ai. 100% = all video via ElevenCreative. The engine picks randomly each post based on the ratio.</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {Object.entries(PM).map(([k,pm])=>{const ratio=(biz.videoRatio||{})[k]||0;const label=ratio===0?"Image only":ratio===100?"All video":`${ratio}% video`;const color=ratio===0?U:ratio===100?"#16a34a":"#2563eb";const vidLabel=k==="instagram"?"Reel":k==="youtube"?"Short":"Video";return <div key={k} style={{...cd,padding:"10px 14px"}}>
          <div style={{...r,justifyContent:"space-between",marginBottom:6}}>
            <div style={{...r,gap:8}}><div style={{width:28,height:28,borderRadius:6,background:BL,...r,justifyContent:"center",flexShrink:0,fontSize:9,fontWeight:700,color:M}}>{pm.icon}</div><span style={{fontSize:12,fontWeight:600,color:T}}>{pm.l}</span></div>
            <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:4,color,background:ratio>0?"#f0fdf4":BL}}>{label}</span>
          </div>
          <div style={{...r,gap:10}}>
            <span style={{fontSize:10,color:U,width:30,flexShrink:0}}>IMG</span>
            <input type="range" min="0" max="100" step="10" value={ratio} onChange={e=>{const vr={...(biz.videoRatio||{}),[k]:parseInt(e.target.value)};onUpdate({...biz,videoRatio:vr})}} style={{flex:1,height:4,cursor:"pointer"}}/>
            <span style={{fontSize:10,color:U,width:30,flexShrink:0,textAlign:"right"}}>{vidLabel.toUpperCase()}</span>
          </div>
          <div style={{...r,justifyContent:"space-between",marginTop:4}}>
            <span style={{fontSize:10,color:U}}>0%</span>
            <span style={{fontSize:10,fontWeight:600,color}}>{ratio}%</span>
            <span style={{fontSize:10,color:U}}>100%</span>
          </div>
        </div>})}
      </div>
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:3}}>Brand voice (ElevenLabs)</div>
      <div style={{fontSize:11,color:U,marginBottom:10}}>Used for voiceovers on all video content. Pick from the library or use a custom voice ID.</div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {VOICES.filter(v=>v.id!=="custom").map(v=>{const a=biz.voiceId===v.id;return <div key={v.id} onClick={()=>onUpdate({...biz,voiceId:v.id})} style={{...r,padding:"8px 12px",borderRadius:8,border:`1px solid ${a?T:B}`,background:a?BL:W,cursor:"pointer",gap:10}}>
          <div style={{width:32,height:32,borderRadius:16,background:a?"#dbeafe":BL,...r,justifyContent:"center",flexShrink:0,fontSize:12,fontWeight:600,color:a?"#1d4ed8":M}}>{v.name[0]}</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:T}}>{v.name}</div><div style={{fontSize:10,color:U}}>{v.desc}</div></div>
          {a&&<span style={{fontSize:10,fontWeight:600,color:"#16a34a",background:"#f0fdf4",padding:"1px 6px",borderRadius:4}}>Selected</span>}
        </div>})}
      </div>
      <input placeholder="Or paste a custom ElevenLabs voice ID..." defaultValue={VOICES.find(v=>v.id===biz.voiceId)?"":biz.voiceId} onBlur={e=>{if(e.target.value.trim())onUpdate({...biz,voiceId:e.target.value.trim()})}} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:`1px solid ${B}`,fontSize:11,outline:"none",marginTop:8,boxSizing:"border-box"}}/>
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:3}}>Music style</div>
      <div style={{fontSize:11,color:U,marginBottom:8}}>Background music generated to match this mood. Claude can override per-post if needed.</div>
      <select value={biz.musicStyle||MUSIC_STYLES[0]} onChange={e=>onUpdate({...biz,musicStyle:e.target.value})} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none",color:T}}>{MUSIC_STYLES.map(s=><option key={s} value={s}>{s}</option>)}</select>
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{...r,justifyContent:"space-between",marginBottom:8}}><div><div style={{fontSize:13,fontWeight:600,color:T}}>Video duration</div><div style={{fontSize:10,color:U,marginTop:1}}>Applies to image-to-video and music length</div></div></div>
      <div style={{...r,gap:6}}>
        {VID_DURS.map(d=><button key={d} onClick={()=>onUpdate({...biz,videoDur:d})} style={{padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:500,border:`1px solid ${(biz.videoDur||10)===d?T:B}`,background:(biz.videoDur||10)===d?T:W,color:(biz.videoDur||10)===d?W:U,cursor:"pointer"}}>{d}s</button>)}
      </div>
      <div style={{fontSize:10,color:U,marginTop:6}}>Longer videos use more credits. 10s recommended for Reels and TikTok.</div>
    </div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:3}}>Localisation</div>
      <div style={{fontSize:11,color:U,marginBottom:4}}>Auto-dub video content into additional languages using the same brand voice.</div>
      <div style={{fontSize:10,color:"#d97706",background:"#fffbeb",padding:"3px 8px",borderRadius:4,marginBottom:8,display:"inline-block"}}>Phase 3 — config saved, dubbing pipeline in development</div>
      <div style={{...r,gap:6,flexWrap:"wrap",marginBottom:6}}>
        {LANGS.map(l=>{const on=(biz.videoLangs||["en"]).includes(l.id);return <span key={l.id} onClick={()=>{if(l.id==="en")return;const vl=biz.videoLangs||["en"];onUpdate({...biz,videoLangs:on?vl.filter(x=>x!==l.id):[...vl,l.id]})}} style={{fontSize:11,fontWeight:500,padding:"3px 10px",borderRadius:4,cursor:l.id==="en"?"default":"pointer",color:on?"#16a34a":U,background:on?"#f0fdf4":BL}}>{on?l.l:"+ "+l.l}</span>})}
      </div>
      <div style={{fontSize:10,color:U}}>Each language adds one extra video variant per post. ~$0.05/language/post.</div>
    </div>
    <div style={{marginBottom:12}}><div style={lb}>Business name</div><input defaultValue={biz.name} onBlur={e=>{if(e.target.value.trim())onUpdate({...biz,name:e.target.value.trim()})}} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
    <div style={{marginBottom:12}}><div style={lb}>Brand voice</div><textarea defaultValue={biz.voice} onBlur={e=>onUpdate({...biz,voice:e.target.value})} style={{width:"100%",minHeight:56,padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:12,resize:"vertical",outline:"none",fontFamily:"inherit",lineHeight:1.5,boxSizing:"border-box"}}/></div>
    <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:3}}>Alex integration</div>
      <div style={{fontSize:11,color:U,marginBottom:10}}>All notifications delivered through Alex via WhatsApp. Conversational control over the engine.</div>
      <div style={{...r,gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <div onClick={()=>onUpdate({...biz,alexEnabled:!biz.alexEnabled})} style={{width:36,height:20,borderRadius:10,background:biz.alexEnabled?T:"#d1d5db",position:"relative",cursor:"pointer",flexShrink:0}}><div style={{width:14,height:14,borderRadius:7,background:W,position:"absolute",top:3,left:biz.alexEnabled?19:3,transition:"left .2s"}}/></div>
        <span style={{fontSize:12,color:M}}>{biz.alexEnabled?"Connected":"Disabled"}</span>
        {!biz.alexEnabled&&<span style={{fontSize:11,color:"#d97706"}}>No notifications without Alex</span>}
      </div>
      {biz.alexEnabled&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{...r,gap:6,flexWrap:"wrap"}}><span style={{fontSize:11,color:U}}>Webhook:</span><input defaultValue={biz.alexWebhookUrl||"https://alex.yourdomain.com/webhooks/content-engine"} onBlur={e=>onUpdate({...biz,alexWebhookUrl:e.target.value})} style={{flex:1,minWidth:mob?"100%":200,padding:"5px 8px",borderRadius:6,border:`1px solid ${B}`,fontSize:11,outline:"none",fontFamily:"monospace"}}/></div>
        <div style={{...r,gap:12,flexWrap:"wrap"}}>
          <div style={{...r,gap:6}}><span style={{fontSize:11,color:U}}>Daily summary:</span><select value={biz.alexSummaryTime||"8:00 AM"} onChange={e=>onUpdate({...biz,alexSummaryTime:e.target.value})} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none",color:T}}><option>7:00 AM</option><option>8:00 AM</option><option>9:00 AM</option><option>10:00 AM</option></select></div>
          <div style={{...r,gap:6}}><span style={{fontSize:11,color:U}}>Weekly report:</span><select value={biz.alexReportTime||"Sunday 9 AM"} onChange={e=>onUpdate({...biz,alexReportTime:e.target.value})} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none",color:T}}><option>Sunday 9 AM</option><option>Monday 9 AM</option><option>Friday 6 PM</option></select></div>
        </div>
        <div style={{background:BL,borderRadius:6,padding:"8px 12px"}}>
          <div style={{fontSize:11,fontWeight:600,color:M,marginBottom:4}}>What Alex handles:</div>
          <div style={{fontSize:11,color:U,lineHeight:1.6}}>Daily + weekly summaries · Alert batching · Live data queries · Pause commands · Token expiry warnings · Top performer highlights</div>
        </div>
      </div>}
    </div>
    <div style={{...r,gap:8,padding:"10px 0",fontSize:12,color:U}}><Ic name="check" size={14}/> All changes save automatically</div>
  </div>;
}

// DEMO DATA — in production, fetched from GET /api/intent/opportunities/:business_id
const INTENT_OPPS=[
  {id:"i1",source:"reddit",sub:"r/dubai",title:"Best nail salon in Business Bay?",snippet:"Moving to Business Bay next month and looking for a reliable nail salon. Budget isn't an issue — I want quality gel extensions that last. Any recommendations?",score:"high",status:"replied",reply:"There are a few solid options in Business Bay. For gel extensions specifically, look for salons that use BIAB or hard gel systems — they last 3-4 weeks vs 2 weeks for regular gel...",at:"2026-03-17T08:20Z",url:"reddit.com/r/dubai/comments/abc123"},
  {id:"i2",source:"reddit",sub:"r/Nails",title:"Gel extensions keep lifting after 1 week — what am I doing wrong?",snippet:"I've been to three different salons and my gel extensions always lift at the cuticle within a week. Is this a prep issue or a product issue?",score:"high",status:"pending",reply:"Lifting within a week is almost always a prep issue, not a product issue. The nail plate needs to be properly dehydrated and the cuticle area pushed back...",at:"2026-03-17T11:45Z",url:"reddit.com/r/Nails/comments/def456"},
  {id:"i3",source:"x",sub:"",title:"",snippet:"Anyone know a good nail tech in Dubai that does Russian manicure? Tired of places that just paint and go",score:"high",status:"pending",reply:"Russian manicure is all about the cuticle work — it's a specific technique that not every salon trains for...",at:"2026-03-17T14:10Z",url:"x.com/user/status/789"},
  {id:"i4",source:"reddit",sub:"r/RedditDubai",title:"Wedding in April — where to get bridal nails done?",snippet:"Getting married in April in Dubai. Need somewhere that does really intricate nail art for bridal.",score:"high",status:"queued",reply:"",at:"2026-03-18T06:30Z",url:"reddit.com/r/RedditDubai/comments/ghi789"},
  {id:"i5",source:"x",sub:"",title:"",snippet:"Looking for nail salon recommendations in Dubai Marina or JBR area?",score:"medium",status:"dismissed",reply:"",at:"2026-03-16T19:00Z",url:"x.com/user/status/012"},
  {id:"i6",source:"reddit",sub:"r/SkincareAddiction",title:"Do gel nails damage your natural nails?",snippet:"I've been getting gel polish every 3 weeks for a year and my nails feel thin. Is this normal?",score:"medium",status:"queued",reply:"",at:"2026-03-18T09:15Z",url:"reddit.com/r/SkincareAddiction/comments/jkl012"},
];

function PageIntent({biz,onUpdate}){
  const{mob}=useMedia();
  const it=biz.intent||{mode:"off",platforms:{},keywords:[],dailyCap:{},geo:{country:"",global:true},discovered:{reddit:[],x:[]},platformAuto:{},opportunities:0,replied:0};
  const[tab,setTab]=useState("feed");
  const[newKw,setNewKw]=useState("");
  const[opps,setOpps]=useState([]);
  const[loadingOpps,setLoadingOpps]=useState(false);
  const[scanning,setScanning]=useState(false);
  const[scanMsg,setScanMsg]=useState("");
  const[savingSettings,setSavingSettings]=useState(false);
  const[settingsSaved,setSettingsSaved]=useState(false);
  const[generatingId,setGeneratingId]=useState(null);
  const[postingId,setPostingId]=useState(null);
  const[redditCreds,setRedditCreds]=useState({client_id:"",client_secret:"",username:"",password:""});
  const[savingCreds,setSavingCreds]=useState(false);
  const[credsSaved,setCredsSaved]=useState(false);

  const anyOn=it.platforms.reddit||it.platforms.x;
  const pending=opps.filter(o=>o.status==="pending").length;
  const queued=opps.filter(o=>o.status==="queued").length;

  // Load opportunities from API
  const loadOpps=async()=>{
    setLoadingOpps(true);
    try{
      const r=await apiFetch(`/api/intent/opportunities/${biz.id}`);
      if(r.ok){const d=await r.json();setOpps(d.opportunities||[]);}
    }catch(_){}
    setLoadingOpps(false);
  };
  useEffect(()=>{loadOpps();},[biz.id]);

  // Settings helpers (update local state + flag unsaved)
  const setMode=m=>onUpdate({...biz,intent:{...it,mode:m}});
  const togglePlat=p=>onUpdate({...biz,intent:{...it,platforms:{...it.platforms,[p]:!it.platforms[p]}}});
  const toggleAuto=p=>onUpdate({...biz,intent:{...it,platformAuto:{...(it.platformAuto||{}),[p]:!(it.platformAuto||{})[p]}}});
  const addKw=()=>{if(newKw.trim()&&!it.keywords.includes(newKw.trim())){onUpdate({...biz,intent:{...it,keywords:[...it.keywords,newKw.trim()]}});setNewKw("")}};
  const removeKw=k=>onUpdate({...biz,intent:{...it,keywords:it.keywords.filter(x=>x!==k)}});
  const setCap=(p,v)=>onUpdate({...biz,intent:{...it,dailyCap:{...it.dailyCap,[p]:parseInt(v)||0}}});

  // Save settings to DB
  const saveSettings=async()=>{
    setSavingSettings(true);
    const r=await apiFetch(`/api/intent/settings/${biz.id}`,{method:"PUT",body:JSON.stringify({keywords:it.keywords,platforms:it.platforms,dailyCap:it.dailyCap,geo:it.geo,mode:it.mode,platformAuto:it.platformAuto||{}})});
    setSavingSettings(false);
    if(r.ok){setSettingsSaved(true);setTimeout(()=>setSettingsSaved(false),2500);}
  };

  // Save Reddit credentials
  const saveRedditCreds=async()=>{
    if(!redditCreds.client_id||!redditCreds.client_secret||!redditCreds.username||!redditCreds.password)return alert("Fill in all four Reddit fields");
    setSavingCreds(true);
    const r=await apiFetch(`/api/intent/credentials/${biz.id}`,{method:"PUT",body:JSON.stringify({reddit_client_id:redditCreds.client_id,reddit_client_secret:redditCreds.client_secret,reddit_username:redditCreds.username,reddit_password:redditCreds.password})});
    setSavingCreds(false);
    if(r.ok){setCredsSaved(true);setTimeout(()=>setCredsSaved(false),2500);}else{alert("Failed to save credentials");}
  };

  // Scan Reddit for new opportunities
  const doScan=async()=>{
    setScanning(true);
    const r=await apiFetch(`/api/intent/scan/${biz.id}`,{method:"POST"});
    if(r.ok){const d=await r.json();setScanMsg(d.message||`Scan complete: ${d.stored} new opportunities found.`);await loadOpps();}
    else{const d=await r.json().catch(()=>({}));setScanMsg("Scan failed: "+(d.error||"Unknown error"));}
    setScanning(false);
    setTimeout(()=>setScanMsg(""),6000);
  };

  // Generate reply for an opportunity
  const genReply=async(id)=>{
    setGeneratingId(id);
    const r=await apiFetch(`/api/intent/generate-reply/${id}`,{method:"POST"});
    if(r.ok){const d=await r.json();setOpps(p=>p.map(o=>o.id===id?d.opportunity:o));}
    else{alert("Failed to generate reply");}
    setGeneratingId(null);
  };

  // Post reply to Reddit/X
  const postReply=async(id)=>{
    setPostingId(id);
    const r=await apiFetch(`/api/intent/post-reply/${id}`,{method:"POST"});
    if(r.ok){setOpps(p=>p.map(o=>o.id===id?{...o,status:"posted"}:o));}
    else{const d=await r.json().catch(()=>({}));alert("Failed to post: "+(d.error||"Unknown error"));}
    setPostingId(null);
  };

  // Dismiss opportunity
  const dismissOpp=async(id)=>{
    await apiFetch(`/api/intent/opportunities/${id}`,{method:"PATCH",body:JSON.stringify({status:"dismissed"})});
    setOpps(p=>p.map(o=>o.id===id?{...o,status:"dismissed"}:o));
  };



  const tabStyle=a=>({padding:"6px 14px",borderRadius:6,border:"none",fontSize:12,fontWeight:500,cursor:"pointer",background:a?W:"transparent",color:a?T:U,minHeight:32});

  return <div>
    <RHeader title="Intent sniping" subtitle={`${biz.name} · Monitors Reddit and X for opportunities`}>
      {pending>0&&<span style={{fontSize:11,fontWeight:600,color:"#d97706"}}>{pending} pending</span>}
      {queued>0&&<span style={{fontSize:11,color:U}}>{queued} queued</span>}
    </RHeader>

    <div style={{...r,gap:2,marginBottom:16,background:BL,borderRadius:8,padding:3,width:"fit-content"}}>
      {[["feed","Opportunities"],["settings","Settings"]].map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={tabStyle(tab===k)}>{l}</button>)}
    </div>

    {tab==="feed"?<div>
      {!anyOn&&<div style={{...cd,padding:"32px 20px",textAlign:"center"}}><div style={{fontSize:14,fontWeight:600,color:T,marginBottom:4}}>Intent sniping is off</div><div style={{fontSize:12,color:U,marginBottom:14}}>Switch to Settings to enable Reddit or X monitoring.</div><button onClick={()=>{togglePlat("reddit");setTab("settings")}} style={btD}>Enable</button></div>}
      {anyOn&&<>
        <div style={{...r,gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <button onClick={doScan} disabled={scanning} style={{...btD,padding:"6px 16px",fontSize:12,opacity:scanning?.6:1}}>{scanning?"Scanning…":"🔍 Scan now"}</button>
          <button onClick={loadOpps} disabled={loadingOpps} style={{...bt,padding:"6px 12px",fontSize:12}}>{loadingOpps?"Loading…":"Refresh"}</button>
          {scanMsg&&<span style={{fontSize:11,color:scanMsg.includes("failed")?"#dc2626":"#16a34a",fontWeight:500}}>{scanMsg}</span>}
        </div>
        <RGrid cols={4} tabCols={2} mobCols={2} gap={8} style={{marginBottom:10}}>
          {[{l:"Opportunities",v:opps.filter(o=>o.status!=="dismissed").length},{l:"Pending",v:pending},{l:"Queued",v:queued},{l:"Posted",v:opps.filter(o=>o.status==="posted").length}].map(s=><div key={s.l} style={{...cd,padding:mob?"10px 12px":"12px 14px"}}><div style={{fontSize:mob?18:20,fontWeight:700,color:T}}>{s.v}</div><div style={{fontSize:mob?10:11,color:U,marginTop:1}}>{s.l}</div></div>)}
        </RGrid>
        {opps.length===0&&!loadingOpps&&<div style={{...cd,padding:"24px 20px",textAlign:"center",color:U,fontSize:13}}>No opportunities yet. Click "Scan now" to search Reddit for relevant posts.</div>}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {opps.filter(o=>o.status!=="dismissed").map(o=>{
            const score=parseFloat(o.relevance_score)||0;
            const isHigh=score>=0.7;
            const isGenerating=generatingId===o.id;
            const isPosting=postingId===o.id;
            return <div key={o.id} style={{...cd,padding:mob?"12px 14px":"14px 16px"}}>
            <div style={{...(mob?{display:"flex",flexDirection:"column",gap:4}:r),justifyContent:"space-between",marginBottom:6}}>
              <div style={{...r,gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:11,fontWeight:600,color:T,background:BL,padding:"2px 8px",borderRadius:4}}>{o.platform==="reddit"?"Reddit":"X"}</span>
                {o.source_subreddit&&<span style={{fontSize:11,color:U}}>{o.source_subreddit}</span>}
                <span style={{...r,gap:4}}><span style={{width:6,height:6,borderRadius:3,background:isHigh?"#16a34a":"#d97706"}}/><span style={{fontSize:11,color:M}}>{isHigh?"high":"medium"} intent</span></span>
              </div>
              <div style={{...r,gap:6}}>
                <span style={{fontSize:10,color:o.status==="posted"?"#16a34a":o.status==="pending"?"#d97706":U}}>{o.status}</span>
                <a href={o.source_url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:U}}>↗ view</a>
                <span style={{fontSize:10,color:U}}>{fd(o.created_at)}</span>
              </div>
            </div>
            <div style={{fontSize:12,color:M,lineHeight:1.5,marginBottom:o.generated_reply?10:8}}>{o.source_text?.slice(0,300)}{o.source_text?.length>300?"…":""}</div>
            {o.generated_reply&&<div style={{background:BL,borderRadius:8,padding:"10px 14px",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:600,color:M,marginBottom:4}}>Generated reply:</div>
              <div style={{fontSize:12,color:M,lineHeight:1.5}}>{o.generated_reply}</div>
            </div>}
            <div style={{...r,gap:6,flexWrap:"wrap"}}>
              {o.status==="pending"&&<><button onClick={()=>postReply(o.id)} disabled={isPosting} style={{...btD,padding:"5px 14px",fontSize:11,opacity:isPosting?.6:1}}>{isPosting?"Posting…":"Approve & post"}</button><button onClick={()=>dismissOpp(o.id)} style={{...bt,padding:"5px 14px",fontSize:11,color:U}}>Dismiss</button></>}
              {o.status==="queued"&&<><button onClick={()=>genReply(o.id)} disabled={isGenerating} style={{...btD,padding:"5px 14px",fontSize:11,opacity:isGenerating?.6:1}}>{isGenerating?"Generating…":"Generate reply"}</button><button onClick={()=>dismissOpp(o.id)} style={{...bt,padding:"5px 14px",fontSize:11,color:U}}>Dismiss</button></>}
              {o.status==="posted"&&<span style={{fontSize:11,color:"#16a34a",fontWeight:500}}>✓ Posted to {o.platform}</span>}
            </div>
          </div>;})}
        </div>
      </>}
    </div>

    :<div style={{maxWidth:560}}>
      <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:3}}>Geographic scope</div>
        <div style={{fontSize:11,color:U,marginBottom:10}}>Set a country for local businesses, or toggle global.</div>
        <div style={{...r,gap:12,flexWrap:"wrap"}}>
          <div style={{...r,gap:10}}>
            <div onClick={()=>onUpdate({...biz,intent:{...it,geo:{...it.geo,global:!it.geo?.global}}})} style={{width:36,height:20,borderRadius:10,background:it.geo?.global?T:"#d1d5db",position:"relative",cursor:"pointer",flexShrink:0}}><div style={{width:14,height:14,borderRadius:7,background:W,position:"absolute",top:3,left:it.geo?.global?19:3,transition:"left .2s"}}/></div>
            <span style={{fontSize:12,color:M}}>{it.geo?.global?"Global":"Country-specific"}</span>
          </div>
          {!it.geo?.global&&<select value={it.geo?.country||""} onChange={e=>onUpdate({...biz,intent:{...it,geo:{...it.geo,country:e.target.value}}})} style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none",color:T}}>
            <option value="">Select country</option>
            <option value="AE">UAE</option><option value="US">United States</option><option value="UK">United Kingdom</option><option value="SA">Saudi Arabia</option><option value="IN">India</option><option value="AU">Australia</option><option value="CA">Canada</option><option value="SG">Singapore</option><option value="DE">Germany</option><option value="FR">France</option>
          </select>}
        </div>
      </div>

      <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:4}}>Platforms</div>
        <div style={{fontSize:11,color:U,marginBottom:12}}>Only Reddit and X support intent monitoring via their APIs.</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[["reddit","Reddit","Searches posts in relevant subreddits","100 queries/min, reply limit: 5/day"],["x","X","Searches recent tweets by keyword","Requires Basic tier ($200/mo), reply limit: 10/day"]].map(([k,l,d,apiNote])=>{
            const on=it.platforms[k];const auto=it.platformAuto?.[k];
            return <div key={k} style={{...cd,padding:"12px 14px"}}>
              <div style={{...(mob?{display:"flex",flexDirection:"column",gap:8}:r),justifyContent:"space-between",marginBottom:on?8:0}}>
                <div style={{...r,gap:10}}>
                  <div onClick={()=>togglePlat(k)} style={{width:36,height:20,borderRadius:10,background:on?T:"#d1d5db",position:"relative",cursor:"pointer",flexShrink:0}}><div style={{width:14,height:14,borderRadius:7,background:W,position:"absolute",top:3,left:on?19:3,transition:"left .2s"}}/></div>
                  <div><div style={{fontSize:12,fontWeight:600,color:on?T:U}}>{l}</div><div style={{fontSize:11,color:U}}>{d}</div></div>
                </div>
              </div>
              {on&&<div style={{paddingTop:8,borderTop:`1px solid ${BL}`}}>
                <div style={{...(mob?{display:"flex",flexDirection:"column",gap:8}:r),justifyContent:"space-between",marginBottom:6}}>
                  <div style={{...r,gap:10}}>
                    <div onClick={()=>toggleAuto(k)} style={{width:36,height:20,borderRadius:10,background:auto?"#16a34a":"#d1d5db",position:"relative",cursor:"pointer",flexShrink:0}}><div style={{width:14,height:14,borderRadius:7,background:W,position:"absolute",top:3,left:auto?19:3,transition:"left .2s"}}/></div>
                    <div><div style={{fontSize:11,fontWeight:600,color:auto?"#16a34a":U}}>{auto?"Auto-reply on":"Auto-reply off"}</div><div style={{fontSize:10,color:U}}>{auto?"High-confidence replies post immediately":"Queue for approval"}</div></div>
                  </div>
                  <div style={{...r,gap:4,flexShrink:0}}><span style={{fontSize:10,color:U}}>Cap:</span><input type="number" value={it.dailyCap[k]||0} onChange={e=>setCap(k,parseInt(e.target.value)||0)} min={0} style={{width:40,padding:"3px 6px",borderRadius:4,border:`1px solid ${B}`,fontSize:11,textAlign:"center",outline:"none"}}/><span style={{fontSize:10,color:U}}>/day</span></div>
                </div>
                <div style={{fontSize:10,color:U,background:BL,padding:"3px 8px",borderRadius:4,marginTop:4}}>API: {apiNote}</div>
              </div>}
            </div>})}
        </div>
      </div>

      <div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:8}}>Keywords & topics</div>
        <div style={{fontSize:11,color:U,marginBottom:8}}>The engine searches for posts matching these keywords.</div>
        <div style={{...r,flexWrap:"wrap",gap:6,marginBottom:10}}>
          {it.keywords.map(k=><span key={k} style={{...r,gap:4,padding:"4px 10px",borderRadius:6,background:BL,fontSize:11,color:M}}>{k}<span onClick={()=>removeKw(k)} style={{cursor:"pointer",color:U,marginLeft:2}}>x</span></span>)}
        </div>
        <div style={{...r,gap:6}}><input value={newKw} onChange={e=>setNewKw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addKw()} placeholder="Add keyword..." style={{flex:1,padding:"6px 10px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none"}}/><button onClick={addKw} style={{...bt,padding:"6px 12px",fontSize:11}}>Add</button></div>
      </div>

      {it.platforms.reddit&&<div style={{...cd,padding:mob?"10px 12px":"14px 16px",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,color:T,marginBottom:3}}>Reddit credentials</div>
        <div style={{fontSize:11,color:U,marginBottom:10}}>Required to post replies. Scanning works without credentials. App type must be <strong>script</strong> at reddit.com/prefs/apps</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{...r,gap:8,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:mob?"100%":140}}><div style={lb}>Client ID</div><input value={redditCreds.client_id} onChange={e=>setRedditCreds(p=>({...p,client_id:e.target.value}))} placeholder="Under app name on Reddit" style={{width:"100%",padding:"6px 10px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none",boxSizing:"border-box",fontFamily:"monospace"}}/></div>
            <div style={{flex:1,minWidth:mob?"100%":140}}><div style={lb}>Client Secret</div><input type="password" value={redditCreds.client_secret} onChange={e=>setRedditCreds(p=>({...p,client_secret:e.target.value}))} placeholder="secret field" style={{width:"100%",padding:"6px 10px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none",boxSizing:"border-box",fontFamily:"monospace"}}/></div>
          </div>
          <div style={{...r,gap:8,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:mob?"100%":140}}><div style={lb}>Reddit username</div><input value={redditCreds.username} onChange={e=>setRedditCreds(p=>({...p,username:e.target.value}))} placeholder="u/yourname" style={{width:"100%",padding:"6px 10px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
            <div style={{flex:1,minWidth:mob?"100%":140}}><div style={lb}>Reddit password</div><input type="password" value={redditCreds.password} onChange={e=>setRedditCreds(p=>({...p,password:e.target.value}))} placeholder="account password" style={{width:"100%",padding:"6px 10px",borderRadius:6,border:`1px solid ${B}`,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
          </div>
          <div style={{...r,gap:8}}>
            <button onClick={saveRedditCreds} disabled={savingCreds} style={{...btD,padding:"6px 16px",fontSize:12,opacity:savingCreds?.6:1}}>{savingCreds?"Saving…":"Save credentials"}</button>
            {credsSaved&&<span style={{fontSize:11,color:"#16a34a"}}>✓ Saved</span>}
          </div>
        </div>
      </div>}

      <div style={{padding:"10px 14px",borderRadius:8,background:BL,fontSize:12,color:U,lineHeight:1.6,marginBottom:14}}>
        Scanning uses Reddit's public search API — no credentials needed. Credentials only required to post replies.
      </div>

      <div style={{...r,gap:8,paddingTop:4}}>
        <button onClick={saveSettings} disabled={savingSettings} style={{...btD,padding:"8px 20px",fontSize:13,opacity:savingSettings?.6:1}}>{savingSettings?"Saving…":"Save settings"}</button>
        {settingsSaved&&<span style={{fontSize:12,color:"#16a34a",fontWeight:500}}>✓ Settings saved</span>}
      </div>
    </div>}
  </div>;
}

/* ═══ TRENDING TOPICS ═══ */
// DEMO DATA — in production, fetched from GET /api/trending/:business_id
const MOCK_TRENDS = {
  beauty: [
    {topic:"Coquette nails",source:"TikTok",volume:"2.3M views this week",relevance:"high",status:"used",usedIn:"Before/after showcase — 17 Mar",suggestion:"Incorporate coquette aesthetic (bows, soft pink, pearls) into your next before/after post"},
    {topic:"Nail health awareness",source:"Instagram",volume:"Trending hashtag #NailHealthMatters",relevance:"high",status:"queued",usedIn:"Next Product education post",suggestion:"Create an educational post about how BIAB protects natural nails"},
    {topic:"Summer 2026 nail colours",source:"Pinterest",volume:"180% increase in saves",relevance:"medium",status:"queued",usedIn:"Next Before/after showcase",suggestion:"Preview summer colour palette — position as early trend-setter"},
    {topic:"Wedding season Dubai",source:"Reddit r/dubai",volume:"3x increase in bridal posts",relevance:"high",status:"used",usedIn:"Flash promotion — 16 Mar",suggestion:"Push bridal nail content — package deals, group bookings"},
    {topic:"Chrome nails trend",source:"TikTok",volume:"890k views this week",relevance:"medium",status:"detected",usedIn:"",suggestion:"Showcase chrome finish options — trending aesthetic"},
  ],
  realestate: [
    {topic:"Dubai golden visa changes 2026",source:"X",volume:"Trending in UAE",relevance:"high",status:"used",usedIn:"Market insight — 17 Mar",suggestion:"Create explainer post about new golden visa rules"},
    {topic:"Off-plan payment plans",source:"Reddit",volume:"Rising search interest",relevance:"medium",status:"queued",usedIn:"Next Market insight post",suggestion:"Break down typical off-plan payment structures"},
  ],
  saas: [
    {topic:"AI content automation",source:"LinkedIn",volume:"Trending topic",relevance:"high",status:"detected",usedIn:"",suggestion:"Share behind-the-scenes of how the platform auto-generates content"},
  ],
};

function PageTrending({biz,onUpdate}){
  const{mob}=useMedia();
  const bizType=biz.name.includes("Beauty")||biz.name.includes("Nail")?"beauty":biz.name.includes("Property")||biz.name.includes("Real")?"realestate":"saas";
  const trends=MOCK_TRENDS[bizType]||[];
  const[scanning,setScanning]=useState(false);
  const doScan=()=>{setScanning(true);setTimeout(()=>setScanning(false),2000)};
  const used=trends.filter(t=>t.status==="used").length;
  const queued=trends.filter(t=>t.status==="queued").length;
  const detected=trends.filter(t=>t.status==="detected").length;
  const trendEnabled=biz.trendingEnabled!==false;

  return <div>
    <RHeader title="Trending topics" subtitle={`${biz.name} · Detected from Reddit and Google Trends`}>
      {scanning?<div style={{...r,gap:8}}><div className="ce-spin" style={{width:14,height:14,border:`2px solid ${B}`,borderTopColor:T,borderRadius:"50%"}}/><span style={{fontSize:12,color:U}}>Scanning...</span></div>
      :<button onClick={doScan} style={{...bt,...r,gap:6}}><Ic name="refresh" size={14}/> Scan now</button>}
    </RHeader>

    <RGrid cols={4} tabCols={2} mobCols={2} gap={8} style={{marginBottom:14}}>
      {[{l:"Detected",v:trends.length},{l:"Auto-used",v:used},{l:"Queued",v:queued},{l:"Unmatched",v:detected}].map(s=><div key={s.l} style={{...cd,padding:mob?"10px 12px":"12px 14px"}}><div style={{fontSize:mob?18:20,fontWeight:700,color:T}}>{s.v}</div><div style={{fontSize:mob?10:11,color:U,marginTop:1}}>{s.l}</div></div>)}
    </RGrid>

    <div style={{...cd,padding:"12px 16px",marginBottom:14,...r,justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
      <div style={{...r,gap:10}}>
        <div onClick={()=>onUpdate({...biz,trendingEnabled:!trendEnabled})} style={{width:36,height:20,borderRadius:10,background:trendEnabled?T:"#d1d5db",position:"relative",cursor:"pointer",flexShrink:0}}><div style={{width:14,height:14,borderRadius:7,background:W,position:"absolute",top:3,left:trendEnabled?19:3,transition:"left .2s"}}/></div>
        <div><div style={{fontSize:12,fontWeight:600,color:T}}>Auto-inject trends</div><div style={{fontSize:11,color:U}}>Auto incorporates high-relevance trends into next cycle</div></div>
      </div>
    </div>

    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {trends.map((t,i)=> <div key={i} style={{...cd,padding:mob?"12px 14px":"14px 16px"}}>
        <div style={{...(mob?{display:"flex",flexDirection:"column",gap:4}:r),justifyContent:"space-between",marginBottom:6}}>
          <div style={{...r,gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:14,fontWeight:600,color:T}}>{t.topic}</span>
            <span style={{fontSize:10,fontWeight:500,padding:"2px 6px",borderRadius:4,color:t.relevance==="high"?"#16a34a":U,background:t.relevance==="high"?"#f0fdf4":BL}}>{t.relevance}</span>
            <span style={{fontSize:10,fontWeight:500,padding:"2px 6px",borderRadius:4,
              color:t.status==="used"?"#16a34a":t.status==="queued"?"#d97706":U,
              background:t.status==="used"?"#f0fdf4":t.status==="queued"?"#fffbeb":BL
            }}>{t.status==="used"?"Auto-used":t.status==="queued"?"Queued":"Detected"}</span>
          </div>
          <span style={{fontSize:11,color:U}}>{t.source} · {t.volume}</span>
        </div>
        {t.usedIn&&<div style={{fontSize:11,color:t.status==="used"?"#16a34a":"#d97706",marginBottom:6}}>
          {t.status==="used"?"Used in: ":"Will be used in: "}{t.usedIn}
        </div>}
        <div style={{background:BL,borderRadius:6,padding:"8px 12px"}}>
          <div style={{fontSize:11,color:M,lineHeight:1.5}}>{t.suggestion}</div>
        </div>
      </div>)}
    </div>

    <div style={{marginTop:14,padding:"10px 14px",borderRadius:8,background:BL,fontSize:12,color:U,lineHeight:1.6}}>
      Engine scans Reddit hot posts and Google Trends every 6 hours. Claude scores relevance against your business context. High-relevance trends are auto-incorporated into the next content cycle.
    </div>
  </div>;
}

/* ═══ REMOVE MODAL ═══ */
function RemoveModal({name,onClose,onConfirm}){
  const[val,setVal]=useState("");
  const ok=val.toLowerCase()==="remove";
  return <Modal onClose={onClose} width={380}>
    <div style={{fontSize:16,fontWeight:700,color:T,marginBottom:6}}>Remove {name}?</div>
    <p style={{fontSize:13,color:M,marginBottom:4}}>This deletes all content, templates, and context data.</p>
    <p style={{fontSize:12,color:"#dc2626",marginBottom:14}}>This cannot be undone.</p>
    <div style={{marginBottom:14}}>
      <div style={{fontSize:12,color:M,marginBottom:5}}>Type <span style={{fontWeight:600,color:T}}>remove</span> to confirm</div>
      <input value={val} onChange={e=>setVal(e.target.value)} placeholder="remove" autoFocus style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${ok?"#dc2626":B}`,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
    </div>
    <div style={{...r,gap:8,justifyContent:"flex-end"}}>
      <button onClick={onClose} style={bt}>Cancel</button>
      <button onClick={ok?onConfirm:undefined} style={{...btD,background:ok?"#dc2626":"#d1d5db",cursor:ok?"pointer":"not-allowed"}}>Remove</button>
    </div>
  </Modal>;
}

/* ═══ MAIN APP ═══ */
export default function App(){
  const{mob,tab}=useMedia();
  const[loggedIn,setLoggedIn]=useState(false);
  const[bizList,setBizList]=useState([]);const[bizId,setBizId]=useState(null);const[page,setPage]=useState("home");const[addModal,setAddModal]=useState(false);const[removeModal,setRemoveModal]=useState(false);
  const[sideOpen,setSideOpen]=useState(false);
  const[authLoading,setAuthLoading]=useState(true);
  const[loginErr,setLoginErr]=useState("");
  const[pagePicker,setPagePicker]=useState(null); // {token,platform}

  const loadCreds=async(id,list)=>{const r=await apiFetch(`/api/businesses/${id}/credentials`);if(r.ok){const creds=await r.json();setBizList(prev=>(prev.length?prev:list).map(b=>b.id===id?{...b,connections:credsToBizConnections(creds)}:b));}};
  const loadBusinesses=async(gotoConnections=false)=>{const r=await apiFetch("/api/businesses");if(!r.ok)return;const data=await r.json();const mapped=data.map(db=>dbBizToUi(db,uiStore.get(db.id)));setBizList(mapped);const first=mapped[0]?.id;setBizId(prev=>prev||(first||null));if(gotoConnections)setPage("connections");for(const b of mapped)loadCreds(b.id,mapped);};

  useEffect(()=>{const p=new URLSearchParams(window.location.search);const connected=p.get("connected");const err=p.get("error");const pick=p.get("pick");const pickPlatform=p.get("platform");if(connected||err||pick){window.history.replaceState({},"",window.location.pathname);if(connected||pick)setPage("connections");if(pick&&pickPlatform)setPagePicker({token:pick,platform:pickPlatform});}if(getJwt()){setLoggedIn(true);loadBusinesses(!!(connected||pick)).finally(()=>setAuthLoading(false));}else{setAuthLoading(false);}}, []);

  const doLogin=async()=>{const em=document.getElementById("ce-email")?.value?.trim();const pw=document.getElementById("ce-pw")?.value;if(!em||!pw){setLoginErr("Enter email and password");return;}setLoginErr("Signing in…");const r=await fetch(`${API_URL}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:em,password:pw})});if(!r.ok){setLoginErr("Invalid email or password");return;}const data=await r.json();setJwt(data.token);setLoggedIn(true);setLoginErr("");setAuthLoading(true);await loadBusinesses();setAuthLoading(false);};

  if(authLoading)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}><style>{`.ce-spin{animation:ce-sp .8s linear infinite}@keyframes ce-sp{to{transform:rotate(360deg)}}`}</style><div className="ce-spin" style={{width:28,height:28,border:`3px solid ${B}`,borderTopColor:T,borderRadius:"50%"}}/></div>;

  if(!loggedIn)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:20}}>
    <style>{`.ce-spin{animation:ce-sp .8s linear infinite}@keyframes ce-sp{to{transform:rotate(360deg)}}`}</style>
    <div style={{maxWidth:360,width:"100%",textAlign:"center"}}>
      <div style={{fontSize:20,fontWeight:700,color:T,marginBottom:4}}>Content Engine</div>
      <p style={{fontSize:12,color:U,marginBottom:20}}>Sign in to manage your content</p>
      <input id="ce-email" placeholder="Email" style={{width:"100%",padding:"9px 14px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,marginBottom:8,outline:"none",boxSizing:"border-box"}} onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
      <input id="ce-pw" type="password" placeholder="Password" style={{width:"100%",padding:"9px 14px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,marginBottom:14,outline:"none",boxSizing:"border-box"}} onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
      {loginErr&&<p style={{fontSize:12,color:"#dc2626",marginBottom:8}}>{loginErr}</p>}
      <button onClick={doLogin} style={{...btD,width:"100%",padding:"10px 0"}}>Sign in</button>
    </div>
  </div>;

  const biz=bizList.find(b=>b.id===bizId)||bizList[0];
  if(!biz)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:12}}>
    <p style={{color:U,fontSize:13}}>No businesses yet.</p>
    <button onClick={()=>setAddModal(true)} style={btD}>Add business</button>
    {addModal&&<Modal onClose={()=>setAddModal(false)} width={400}><h2 style={{fontSize:16,fontWeight:700,margin:"0 0 16px",color:T}}>Add business</h2><div style={{marginBottom:12}}><div style={lb}>Name</div><input id="nn" placeholder="e.g. My Coffee Shop" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div><div style={{marginBottom:12}}><div style={lb}>Brand voice</div><textarea id="nv" placeholder="Tone, audience..." style={{width:"100%",minHeight:56,padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:12,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/></div><div style={{...r,gap:8,justifyContent:"flex-end"}}><button onClick={()=>setAddModal(false)} style={bt}>Cancel</button><button onClick={async()=>{const n=document.getElementById("nn")?.value?.trim();const v=document.getElementById("nv")?.value?.trim();if(!n)return;const slug=n.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Date.now();const res=await apiFetch("/api/businesses",{method:"POST",body:JSON.stringify({display_name:n,slug,brand_voice:v||""})});if(!res.ok){alert("Failed to create business");return;}const db=await res.json();const nb=dbBizToUi(db);setBizList(p=>[...p,nb]);setBizId(nb.id);setAddModal(false);setPage("connections");}} style={btD}>Add</button></div></Modal>}
  </div>;

  const upd=u=>{const{id,name,voice,plats,pub,sched,pend,connections,...ui}=u;uiStore.set(u.id,ui);setBizList(p=>p.map(b=>b.id===u.id?u:b));};
  const pc=biz.pend||0;const wc=Object.values(biz.connections||{}).filter(c=>c.status==="expiring"||c.status==="expired").length;const ib=0; // loaded dynamically inside PageIntent
  const nav=[{id:"home",label:"Overview",icon:"home"},{id:"create",label:"Create",icon:"spark"},{id:"templates",label:"Templates",icon:"tpl"},{id:"calendar",label:"Calendar",icon:"cal"},{id:"history",label:"History",icon:"clock",badge:pc},{id:"intent",label:"Intent sniping",icon:"target",badge:ib>0?ib:0},{id:"trending",label:"Trending",icon:"trending"},{id:"connections",label:"Connections",icon:"link",dot:wc>0},{id:"vault",label:"Context vault",icon:"folder"},{id:"settings",label:"Settings",icon:"gear"}];
  const addBiz=async(name,voice)=>{const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Date.now();const res=await apiFetch("/api/businesses",{method:"POST",body:JSON.stringify({display_name:name,slug,brand_voice:voice||"",enabled_platforms:["instagram","facebook"]})});if(!res.ok){alert("Failed to create business");return;}const db=await res.json();const nb=dbBizToUi(db);setBizList(p=>[...p,nb]);setBizId(nb.id);setAddModal(false);setPage("connections");};
  const removeBiz=async()=>{if(bizList.length<=1)return;await apiFetch(`/api/businesses/${bizId}`,{method:"DELETE"});const nx=bizList.find(b=>b.id!==bizId)?.id;setBizList(p=>p.filter(b=>b.id!==bizId));setBizId(nx);setRemoveModal(false);setPage("home")};
  const rp=()=>{switch(page){case"home":return <PageHome biz={biz}/>;case"create":return <PageCreate biz={biz}/>;case"templates":return <PageTemplates biz={biz}/>;case"calendar":return <PageCalendar biz={biz}/>;case"history":return <PageHistory biz={biz}/>;case"intent":return <PageIntent biz={biz} onUpdate={upd}/>;case"trending":return <PageTrending biz={biz} onUpdate={upd}/>;case"connections":return <PageConnections biz={biz} onUpdate={upd}/>;case"vault":return <PageVault biz={biz}/>;case"settings":return <PageSettings biz={biz} onUpdate={upd}/>;default:return <PageHome biz={biz}/>}};
  const goPage=(id)=>{setPage(id);setSideOpen(false)};

  const showSidebar=!mob||sideOpen;
  const sideW=mob?"100%":tab?200:210;

  return(<div style={{display:"flex",height:"100vh",fontFamily:"system-ui,-apple-system,sans-serif",overflow:"hidden"}}>
    <style>{`
      .ce-spin{animation:ce-sp .8s linear infinite}@keyframes ce-sp{to{transform:rotate(360deg)}}
      *{-webkit-tap-highlight-color:transparent}
      input,select,textarea,button{font-size:16px}
      @media(min-width:640px){input,select,textarea,button{font-size:inherit}}
    `}</style>

    {/* Mobile top bar */}
    {mob&&<div style={{position:"fixed",top:0,left:0,right:0,height:48,background:"#111827",color:"#fff",...r,justifyContent:"space-between",padding:"0 14px",zIndex:900}}>
      <button onClick={()=>setSideOpen(!sideOpen)} style={{background:"none",border:"none",color:"#fff",padding:4,cursor:"pointer"}}><Ic name="menu" size={20}/></button>
      <div style={{fontSize:13,fontWeight:600}}>{biz.name}</div>
      <div style={{width:28}}/>
    </div>}

    {/* Sidebar overlay on mobile */}
    {mob&&sideOpen&&<div onClick={()=>setSideOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:950}}/>}

    {/* Sidebar */}
    {showSidebar&&<div style={{
      width:sideW,height:"100vh",background:"#111827",color:"#fff",display:"flex",flexDirection:"column",flexShrink:0,
      ...(mob?{position:"fixed",left:0,top:0,bottom:0,zIndex:960,width:"75%",maxWidth:280}:{})
    }}>
      <div style={{padding:"16px 14px 10px",borderBottom:"1px solid #1f2937"}}><div style={{fontSize:14,fontWeight:700}}>Content Engine</div><div style={{fontSize:10,color:"#6b7280",marginTop:1}}>v2</div></div>
      <div style={{padding:"8px 10px"}}>
        <select value={bizId} onChange={e=>{setBizId(e.target.value);setPage("home");setSideOpen(false)}} style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #374151",background:"#1f2937",color:"#fff",fontSize:12,outline:"none"}}>{bizList.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </div>
      <nav style={{flex:1,padding:"4px 6px",overflowY:"auto"}}>
        {nav.map(n=><button key={n.id} onClick={()=>goPage(n.id)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:mob?"9px 10px":"7px 10px",borderRadius:6,border:"none",background:page===n.id?"#1f2937":"transparent",color:page===n.id?"#fff":"#9ca3af",fontSize:12,fontWeight:500,cursor:"pointer",marginBottom:1,textAlign:"left"}}><span style={{width:16,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic name={n.icon} size={14}/></span>{n.label}{n.badge>0&&<span style={{marginLeft:"auto",background:"#374151",color:"#d1d5db",fontSize:10,padding:"1px 5px",borderRadius:4}}>{n.badge}</span>}{n.dot&&<span style={{marginLeft:"auto",width:6,height:6,borderRadius:3,background:"#dc2626"}}/>}</button>)}
      </nav>
      <div style={{padding:"6px 10px",borderTop:"1px solid #1f2937"}}>
        <div style={{display:"flex",gap:4,marginBottom:4}}><button onClick={()=>setAddModal(true)} style={{flex:1,padding:"3px 0",borderRadius:4,border:"none",background:"transparent",color:"#6b7280",fontSize:10,cursor:"pointer",minHeight:32}}>+ Add</button><button onClick={()=>bizList.length>1&&setRemoveModal(true)} style={{flex:1,padding:"3px 0",borderRadius:4,border:"none",background:"transparent",color:"#6b7280",fontSize:10,cursor:"pointer",opacity:bizList.length<=1?.3:1,minHeight:32}}>Remove</button></div>
        <button onClick={()=>{clearJwt();setLoggedIn(false);setBizList([]);setBizId(null);}} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"6px 8px",borderRadius:6,border:"none",background:"transparent",color:"#9ca3af",fontSize:12,cursor:"pointer",minHeight:36}}><Ic name="out" size={14}/> Sign out</button>
      </div>
    </div>}

    <main style={{flex:1,padding:mob?"60px 14px 20px":tab?"18px 20px":"22px 28px",overflowY:"auto",background:BG,width:"100%"}}>{rp()}</main>

    {addModal&&<Modal onClose={()=>setAddModal(false)} width={400}>
      <h2 style={{fontSize:16,fontWeight:700,margin:"0 0 16px",color:T}}>Add business</h2>
      <div style={{marginBottom:12}}><div style={lb}>Name</div><input id="nn" placeholder="e.g. My Coffee Shop" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
      <div style={{marginBottom:12}}><div style={lb}>Brand voice</div><textarea id="nv" placeholder="Tone, audience..." style={{width:"100%",minHeight:56,padding:"8px 12px",borderRadius:8,border:`1px solid ${B}`,fontSize:12,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
      <div style={{...r,gap:8,justifyContent:"flex-end"}}><button onClick={()=>setAddModal(false)} style={bt}>Cancel</button><button onClick={()=>{const n=document.getElementById("nn")?.value;const v=document.getElementById("nv")?.value;if(n?.trim())addBiz(n.trim(),v?.trim()||"")}} style={btD}>Add</button></div>
    </Modal>}

    {removeModal&&<RemoveModal name={biz.name} onClose={()=>setRemoveModal(false)} onConfirm={removeBiz}/>}
    {pagePicker&&<PagePickerModal token={pagePicker.token} platform={pagePicker.platform} onClose={()=>setPagePicker(null)} onDone={()=>{setPagePicker(null);loadBusinesses(true);}}/>}
  </div>);
}
