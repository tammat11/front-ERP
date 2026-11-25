/* Таймлайн, комментарии и дела карточки. Бэкенд: features/timeline.py */
(function(){
if(!window.PP||PP._tlLoaded)return;PP._tlLoaded=true;
const esc=PP.esc;
const TYPES=Object.entries(PP.TYPES).map(([k,v])=>[k,v.n,v.c]);
const TCOL=Object.fromEntries(TYPES.map(t=>[t[0],t[2]])),TNAME=Object.fromEntries(TYPES.map(t=>[t[0],t[1]]));
const EV=[["all","Все",null],["move","Стадии","#1A1D1E"],["edit","Поля","#4A7A12"],["robot","Роботы","#8B5CC6"],["note","Заметки","#5A645E"],["activity","Дела","#8FC640"],["create","Создание","#1A1D1E"],["undo","Отмена","#8a8f94"],["delete","Удаление","#D6453D"]];
const ECOL=Object.fromEntries(EV.map(e=>[e[0],e[2]]));

const css=document.createElement("style");css.textContent=`
.tl-w{--tl-line:var(--ic-line,#E7E9E2);--tl-mut:var(--bx-mut,var(--ic-muted));--tl-ink:var(--ic-ink,#1A1D1E);font-size:12px;color:var(--tl-ink)}
.tl-w *{box-sizing:border-box}
.tl-w button:focus-visible,.tl-w input:focus-visible,.tl-w select:focus-visible,.tl-w textarea:focus-visible,.tl-ck:focus-visible{outline:2px solid #1A1D1E;outline-offset:1px}
.tl-chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
.tl-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:14px;text-transform:none;letter-spacing:0;font-weight:500;font-size:12px;color:#3c4650;box-shadow:none}
.tl-chip em{font-style:normal;font-size:11px;color:var(--tl-mut);font-weight:600;font-variant-numeric:tabular-nums}
.tl-chip.on{background:var(--ic-accent-soft,#EEF7D9);border-color:var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E)}
.tl-chip.on em{color:#4d7a14}
.tl-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--c,#8a8f94)}
.tl-day{position:relative;display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;color:var(--tl-mut);margin:16px 0 8px;padding-left:2px}
.tl-day:first-of-type{margin-top:4px}
.tl-day span{background:var(--ic-bg,#F7F8F4);border-radius:10px;padding:2px 10px;position:relative;z-index:1}
.tl-day::after{content:"";flex:1;height:1px;background:var(--tl-line)}
.tl-feed{position:relative}
.tl-feed::before{content:"";position:absolute;left:13px;top:0;bottom:0;width:2px;background:#D3D8C8;border-radius:1px}
.tl-ev{position:relative;display:flex;gap:10px;margin:0 0 8px;align-items:flex-start}
.tl-ev:last-child::after{content:"";position:absolute;left:0;width:28px;top:34px;bottom:-8px;background:#fff}
.tl-ic{position:relative;z-index:1;flex:none;width:28px;height:28px;border-radius:50%;background:var(--c,#8a8f94);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 0 0 3px #fff}
.tl-ic svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.tl-card{flex:1;min-width:0;background:#fff;border:1px solid #e6ebee;border-radius:var(--r,8px);padding:8px 12px;box-shadow:var(--sh1);transition:box-shadow .18s var(--ease),border-color .18s}
.tl-card:hover{box-shadow:var(--sh2);border-color:var(--ic-accent,#8FC640)}
.tl-h{display:flex;gap:8px;align-items:baseline}
.tl-t{font-weight:600;font-size:12px;flex:1;min-width:0}
.tl-time{color:var(--tl-mut);font-size:11px;font-weight:500;flex:none;font-variant-numeric:tabular-nums}
.tl-tx{font-size:12px;margin-top:3px;white-space:pre-wrap;word-break:break-word;line-height:1.45}
.tl-det{font-size:11px;color:var(--tl-mut);margin-top:3px;word-break:break-word}
.tl-det b{color:var(--tl-ink);font-weight:600}
.tl-chg{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px}
.tl-from,.tl-to{border-radius:var(--r-sm,6px);padding:2px 8px;font-size:11px;font-weight:600;max-width:100%;word-break:break-word}
.tl-from{background:#f1f3f5;color:var(--ic-muted);text-decoration:line-through;text-decoration-color:#b8c0c6}
.tl-to{background:#e5f4d2;color:#3f6b0f}
.tl-arr{color:#9aa4ad;font-size:12px}
.tl-empty,.tl-emp{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;color:var(--tl-mut);font-size:12px;padding:28px 12px;border:1px dashed #cfd7dc;border-radius:var(--r,8px);background:rgba(255,255,255,.6)}
.tl-emp svg,.tl-empty svg{width:40px;height:40px;stroke:#b5bfc7;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.tl-load{color:var(--tl-mut);font-size:12px;padding:14px 0;background:linear-gradient(90deg,transparent 25%,#eef2f4 50%,transparent 75%);background-size:200% 100%;animation:tlshim 1.2s linear infinite}
@keyframes tlshim{from{background-position:200% 0}to{background-position:-200% 0}}
.tl-err{display:flex;align-items:center;gap:10px;color:var(--bx-red,#c8372d);font-size:12px;padding:12px;border:1px solid #f1c9c5;background:#fdf1f0;border-radius:var(--r,8px)}
.tl-err span{flex:1}
.tl-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tl-form{display:flex;flex-direction:column;gap:10px;border:1px solid #e6ebee;border-radius:var(--r,8px);padding:12px;background:#fff;margin-bottom:12px;box-shadow:var(--sh1)}
.tl-form input,.tl-form select,.tl-form textarea{border:1px solid var(--tl-line);border-radius:var(--r-sm,6px);padding:7px 10px;font-size:12px;background:#fff;min-width:0;max-width:100%;font-family:inherit;transition:border-color .15s,box-shadow .15s}
.tl-form input:focus,.tl-form select:focus,.tl-form textarea:focus{border-color:var(--ic-accent,#8FC640);box-shadow:0 0 0 3px var(--ic-accent-soft,#EEF7D9)}
.tl-form textarea{width:100%;resize:vertical;min-height:40px}
.tl-form input.tl-grow{flex:1;min-width:140px}
.tl-grid{display:grid;grid-template-columns:96px 1fr;gap:8px 10px;align-items:center}
.tl-pill{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:14px;text-transform:none;letter-spacing:0;font-weight:500;font-size:12px;box-shadow:none}
.tl-pill.on{background:var(--ic-accent-soft,#EEF7D9);border-color:var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E)}
.tl-lbl{font-size:11px;color:var(--tl-mut);font-weight:600}
.tl-q{display:flex;gap:6px;flex-wrap:wrap}
.tl-q .b,.tl-btns .b,.tl-sug .b{padding:4px 11px;font-size:11px;text-transform:none;letter-spacing:0}
.tl-act{position:relative;display:flex;gap:10px;padding:10px 12px;margin:0 0 8px;background:#fff;border:1px solid #e6ebee;border-radius:var(--r,8px);box-shadow:var(--sh1);transition:box-shadow .18s var(--ease);border-left:3px solid var(--c,#8a8f94)}
.tl-act:hover{box-shadow:var(--sh2)}
.tl-act>div{min-width:0;flex:1}
.tl-ck{flex:none;width:22px;height:22px;margin-top:1px;border-radius:50%;border:2px solid #b8c0c6;background:#fff;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;color:transparent;transition:border-color .15s,background .15s,color .15s}
.tl-ck svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.tl-ck:hover{border-color:var(--ic-accent,#8FC640);color:var(--ic-accent-hover,#7DB534)}
.tl-act.done .tl-ck{background:var(--ic-accent,#8FC640);border-color:var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E)}
.tl-act.done .tl-t{text-decoration:line-through;color:var(--tl-mut)}
.tl-act.done{border-left-color:#d5dde0;box-shadow:none;background:#fafbfc}
.tl-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:3px;font-size:11px;color:var(--tl-mut)}
.tl-type{display:inline-flex;align-items:center;gap:5px;font-weight:600;color:#3c4650}
.tl-due{font-size:11px;color:var(--tl-mut);font-weight:500}
.tl-due.over{color:var(--bx-red,#c8372d);font-weight:700}
.tl-due.today{color:#3f8f12;font-weight:700}
.tl-btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.tl-btns .b.tl-danger{color:var(--bx-red,#c8372d)}
.tl-btns .b.tl-danger:hover{border-color:var(--bx-red,#c8372d)}
.tl-btns .b.tl-danger.arm{background:var(--bx-red,#c8372d);border-color:var(--bx-red,#c8372d);color:#fff}
.tl-sec{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--tl-ink);margin:16px 0 8px}
.tl-sec em{font-style:normal;font-size:11px;font-weight:600;color:var(--tl-mut);background:var(--ic-bg,#F7F8F4);border:1px solid var(--ic-line,#E7E9E2);border-radius:9px;padding:0 7px}
.tl-men{color:#4d7a14;background:var(--ic-accent-soft,#EEF7D9);border-radius:4px;padding:0 3px;font-weight:600}
.tl-sug{display:flex;gap:6px;flex-wrap:wrap}
.tl-sug:empty{display:none}
.tl-badge{display:inline-block;margin-top:4px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;background:var(--ic-paper);color:var(--ic-muted);border:1px solid var(--ic-line);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl-badge.over{background:#FCE9E7;color:#D6453D;border-color:#F3C7C2}
.tl-badge.today{background:var(--ic-green-soft);color:var(--ic-green-dark);border-color:#CFE5AE}
.tl-msg{display:flex;gap:10px;margin:0 0 10px;align-items:flex-start}
.tl-av{flex:none;width:32px;height:28px;border-radius:50%;background:var(--c,#7DB534);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;letter-spacing:0;}
.tl-bub{flex:1;min-width:0;background:#fff;border:1px solid #e6ebee;border-radius:2px var(--r,8px) var(--r,8px) var(--r,8px);padding:8px 12px;box-shadow:var(--sh1)}
.tl-bub:hover .tl-btns{visibility:visible}
.tl-bub .tl-btns{margin-top:6px}
.tl-compose{display:flex;gap:10px;align-items:flex-start;margin-bottom:14px}
.tl-compose .tl-form{flex:1;margin:0;gap:8px;padding:10px}
.tl-compose textarea{border:0;box-shadow:none;padding:2px;min-height:44px}
.tl-compose textarea:focus{box-shadow:none}
.tl-cbar{display:flex;gap:8px;align-items:center;border-top:1px solid #eef1f3;padding-top:8px}
.tl-cbar small{color:var(--tl-mut);font-size:11px;flex:1}
.tl-ut{display:flex;align-items:center;gap:10px;background:#1A1D1E;color:#fff;border-radius:8px;padding:8px 8px 8px 16px;font-size:12px;box-shadow:var(--sh2)}
.tl-ut .b{padding:4px 12px;font-size:11px;text-transform:none;letter-spacing:0;background:transparent;color:#fff;border-color:#5A645E}
.tl-ut .b:hover{border-color:var(--ic-accent,#8FC640)}
.tl-act:hover .tl-ck{transform:scale(1.08)}.tl-ck{transition:transform .15s,border-color .15s,background .15s,color .15s}
.tl-hint{color:var(--tl-mut);font-size:11px}.tl-hint kbd{font:inherit;font-weight:600;background:var(--ic-bg,#F7F8F4);border:1px solid var(--ic-line,#E7E9E2);border-radius:4px;padding:0 4px}
@media(max-width:480px){.tl-grid{grid-template-columns:1fr}.tl-form input.tl-grow{min-width:0;width:100%}.tl-row>input[type=date],.tl-row>input[type=time]{flex:1}.tl-av{width:28px;height:28px}}
#dr .tl-form input[type=date],#dr .tl-form input[type=time],#dr .tl-form select,#dr .tl-form input.tl-grow{width:auto}
#dr .tl-form input.tl-grow{flex:1}
#dr .tl-form select{max-width:100%}
`;document.head.appendChild(css);

/* ---------- даты ---------- */
const p2=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
const today=()=>ymd(new Date());
const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return ymd(d)};
const dayNum=s=>{const [y,m,d]=s.slice(0,10).split("-").map(Number);return Date.UTC(y,m-1,d)/864e5};
const MON=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const MONS=["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
function dayLabel(s){const n=dayNum(s),t=dayNum(today());if(n===t)return"Сегодня";if(n===t-1)return"Вчера";const [y,m,d]=s.split("-").map(Number);return d+" "+MON[m-1]+(y!==new Date().getFullYear()?" "+y:"")}
function dueInfo(due){const diff=dayNum(due)-dayNum(today());
  if(diff<0)return{cls:"over",short:"просрочено "+(-diff)+" дн.",full:"Просрочено на "+(-diff)+" дн. · "+due.replace("T"," ")};
  if(diff===0)return{cls:"today",short:"сегодня",full:"Сегодня, "+due.slice(11)};
  const [,m,d]=due.slice(0,10).split("-").map(Number);
  return{cls:"",short:diff===1?"завтра":d+" "+MONS[m-1],full:(diff===1?"Завтра":d+" "+MON[m-1])+", "+due.slice(11)}}

/* ---------- пользователи ---------- */
let USERS=null;
async function users(){if(USERS)return USERS;try{const r=await PP.api.get("/api/users");USERS=((r&&r.items)||[]).filter(u=>u.name)}catch(e){USERS=[]}return USERS}
const uname=id=>{const u=(USERS||[]).find(x=>String(x.id)===String(id));return u?u.name:""};
const IC={move:'<path d="M5 12h14M13 6l6 6-6 6"/>',edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',robot:'<rect x="5" y="8" width="14" height="10" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',note:'<path d="M5 5h14v10H9l-4 4z"/>',activity:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',create:'<path d="M12 5v14M5 12h14"/>',undo:'<path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 8"/>',delete:'<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'};
const svg=(d,cls)=>`<svg viewBox="0 0 24 24" aria-hidden="true"${cls?` class="${cls}"`:""}>${d}</svg>`;
const EMPTY={hist:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',cmt:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',act:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M9 15l2 2 4-4"/>'};
const emptyBox=(k,t)=>`<div class="tl-emp">${svg(EMPTY[k])}<div>${t}</div></div>`;
const errBox=m=>`<div class="tl-err"><span>${esc(m||"Не удалось загрузить")}</span><button class="b" data-retry>Повторить</button></div>`;
const AVC=["#7DB534","#4A7A12","#6b9a1f","#8b5cc6","#5A645E","#2a9d8f","#c8372d","#1A1D1E"];
const initials=n=>(n||"Я").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join("")||"Я";
function undoToast(text,fn){let h=document.getElementById("toasts");if(!h){h=document.createElement("div");h.id="toasts";h.setAttribute("role","status");h.setAttribute("aria-live","polite");document.body.appendChild(h)}
  const e=document.createElement("div");e.className="toast tl-ut";e.innerHTML='<span></span><button class="b" type="button">Отменить</button>';e.firstChild.textContent=text+" · ";
  e.firstChild.textContent=text;h.appendChild(e);const k=setTimeout(()=>e.remove(),6000);
  e.querySelector("button").onclick=async()=>{clearTimeout(k);e.remove();try{await fn()}catch(x){PP.toast("Не удалось отменить")}};}
function tabCount(id,label,n){document.querySelectorAll('.ctabs button[data-t="'+id+'"]').forEach(b=>{b.textContent=label+(n?" · "+n:"")})}
const showErr=(r,fb)=>PP.toast((r&&r.error)||fb||"Ошибка");

/* ---------- кеш дел для значков и счётчиков ---------- */
const AC={f:null,ts:0,map:{},busy:null};
function nearestMap(items){const m={};for(const a of items){if(!m[a.deal]||a.due<m[a.deal].due)m[a.deal]=a}return m}
function paintBadges(){
  const b=document.getElementById("board");if(!b||!PP.B)return;
  b.querySelectorAll(".card[data-id]").forEach(c=>{
    const old=c.querySelector(".tl-badge");const a=AC.f===PP.cur?AC.map[c.dataset.id]:null;
    if(!a){if(old)old.remove();return}
    const di=dueInfo(a.due);let el=old;
    if(!el){el=document.createElement("div");el.className="tl-badge";const m=c.querySelector(".m");(m||c.firstChild).after(el)}
    el.className="tl-badge "+di.cls;el.textContent=(a.type?TNAME[a.type]+" · ":"")+di.short;el.title=a.title+" — "+di.full;
  });
}
function refreshBadges(force){
  const f=PP.cur;if(!f)return Promise.resolve();
  if(AC.f===f&&!force&&Date.now()-AC.ts<20000)return Promise.resolve();
  if(AC.busy&&AC.busyF===f&&!force)return AC.busy;
  AC.busyF=f;
  const p=PP.api.get("/api/activities?done=0&f="+encodeURIComponent(f)).then(r=>{
    if(PP.cur!==f||!r||r.error)return;
    AC.f=f;AC.ts=Date.now();AC.map=nearestMap(r.items||[]);paintBadges();
  }).catch(()=>{}).finally(()=>{if(AC.busy===p)AC.busy=null});
  AC.busy=p;return p;
}
PP.on("board:rendered",()=>{paintBadges();refreshBadges(false)});
if(PP.B){paintBadges();refreshBadges(false)}

/* ---------- текущая карточка в дроуэре ---------- */
let CURCARD=null;
PP.on("card:open",({f,id})=>{CURCARD={f,id:String(id)}});
const sameCard=(f,id)=>!!CURCARD&&CURCARD.f===f&&CURCARD.id===String(id);

/* ---------- вкладка «История» ---------- */
PP.addCardTab({id:"tl-hist",label:"История",render(host,{f,id}){
  const tok=host._tl=Symbol();const dead=()=>host._tl!==tok||!host.isConnected;
  let all=[],flt="all";
  host.innerHTML='<div class="tl-w"><div class="tl-load">Загрузка…</div></div>';
  const draw=()=>{
    const cnt={all:all.length};all.forEach(e=>cnt[e.type]=(cnt[e.type]||0)+1);
    const chips=EV.filter(e=>e[0]==="all"||cnt[e[0]]).map(e=>`<button class="b tl-chip${flt===e[0]?" on":""}" data-k="${e[0]}">${e[2]?`<i class="tl-dot" style="--c:${e[2]}"></i>`:""}${e[1]} <em>${cnt[e[0]]||0}</em></button>`).join("");
    const list=flt==="all"?all:all.filter(e=>e.type===flt);
    let html=`<div class="tl-w"><div class="tl-chips">${chips}</div>`;
    if(!list.length)html+=emptyBox("hist","Событий пока нет.<br>Переносы, правки, заметки и дела появятся здесь.");
    let day="",open=false;
    for(const e of list){const dd=e.ts.slice(0,10);
      if(dd!==day){if(open)html+="</div>";day=dd;open=true;html+=`<div class="tl-day"><span>${esc(dayLabel(dd))}</span></div><div class="tl-feed">`}
      const col=ECOL[e.type]||"#8a8f94",ds=e.details||[];
      const was=ds.find(x=>x.label==="Было"),now=ds.find(x=>x.label==="Стало");
      const det=(was&&now?`<div class="tl-chg"><span class="tl-from">${esc(was.value||"—")}</span><span class="tl-arr">→</span><span class="tl-to">${esc(now.value||"—")}</span></div>`:"")
        +ds.filter(x=>!(was&&now&&(x===was||x===now))).map(x=>`<div class="tl-det">${x.value!==""?`${esc(x.label)}: <b>${esc(x.value)}</b>`:`<b>${esc(x.label)}</b>`}</div>`).join("");
      html+=`<div class="tl-ev"><i class="tl-ic" style="--c:${col}">${svg(IC[e.type]||IC.note)}</i><div class="tl-card">
        <div class="tl-h"><div class="tl-t">${esc(e.title)}</div><span class="tl-time">${esc(e.ts.slice(11,16))}</span></div>
        ${e.text?`<div class="tl-tx">${esc(e.text)}</div>`:""}${det}</div></div>`}
    if(open)html+="</div>";
    html+="</div>";
    host.innerHTML=html;
  };
  const fail=m=>{if(!dead())host.innerHTML='<div class="tl-w">'+errBox(m)+'</div>'};
  const load=()=>{host.innerHTML='<div class="tl-w"><div class="tl-load">Загрузка…</div></div>';
  PP.api.get("/api/timeline?f="+encodeURIComponent(f)+"&deal="+encodeURIComponent(id)).then(r=>{
    if(dead())return;
    if(!r||r.error){fail(r&&r.error);return}all=r.events||[];tabCount("tl-hist","История",all.length);draw()
  }).catch(()=>fail())};
  host.onclick=e=>{if(e.target.closest("[data-retry]"))return load();const b=e.target.closest("[data-k]");if(b){flt=b.dataset.k;draw()}};
  load();
}});

/* ---------- вкладка «Комментарии» ---------- */
function mentions(text){
  const names=(USERS||[]).map(u=>u.name).filter(Boolean).sort((a,b)=>b.length-a.length);
  const re=new RegExp("@("+names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).concat(["[\\wА-Яа-яЁё]+"]).join("|")+")","giu");
  let out="",last=0,m;
  while((m=re.exec(text))){out+=esc(text.slice(last,m.index))+`<span class="tl-men">${esc(m[0])}</span>`;last=m.index+m[0].length}
  return out+esc(text.slice(last));
}
function suggest(ta,box){
  const m=/@([^\s@]*)$/.exec(ta.value.slice(0,ta.selectionStart));
  if(!m){box.innerHTML="";return}
  const q=m[1].toLowerCase();
  const hit=(USERS||[]).filter(u=>u.name&&u.name.toLowerCase().includes(q)).slice(0,6);
  box.innerHTML=hit.map(u=>`<button type="button" class="b" data-u="${esc(u.name)}">@${esc(u.name)}</button>`).join("");
  box.onclick=e=>{const b=e.target.closest("[data-u]");if(!b)return;const pos=ta.selectionStart,pre=ta.value.slice(0,pos).replace(/@([^\s@]*)$/,"@"+b.dataset.u+" ");ta.value=pre+ta.value.slice(pos);ta.focus();ta.selectionStart=ta.selectionEnd=pre.length;box.innerHTML=""};
}
PP.addCardTab({id:"tl-cmt",label:"Комментарии",render(host,{f,id}){
  const tok=host._tl=Symbol();const dead=()=>host._tl!==tok||!host.isConnected;
  host.innerHTML='<div class="tl-w"><div class="tl-load">Загрузка…</div></div>';
  let items=[],editIdx=null,arm=null,armT=0;
  const load=async()=>{
    await users();if(dead())return;
    const r=await PP.api.get("/api/timeline/notes?f="+encodeURIComponent(f)+"&deal="+encodeURIComponent(id)).catch(()=>null);
    if(dead())return;
    if(!r||r.error){host.innerHTML='<div class="tl-w">'+errBox(r&&r.error)+'</div>';return}
    items=r.items||[];tabCount("tl-cmt","Комментарии",items.length);draw();
  };
  const draw=()=>{
    const av=n=>`<i class="tl-av" style="--c:${AVC[0]}" title="Вы">Я</i>`;
    const list=items.length?items.map(n=>{
      if(editIdx===n.idx)return `<div class="tl-msg">${av(n)}<div class="tl-bub tl-form tl-cmt" style="gap:8px"><textarea data-e aria-label="Текст заметки" maxlength="2000">${esc(n.text)}</textarea>
        <div class="tl-btns" style="margin:0"><button class="b btn-create" data-save="${n.idx}">Сохранить</button><button class="b" data-cancel>Отмена</button></div></div></div>`;
      return `<div class="tl-msg">${av(n)}<div class="tl-bub">
        <div class="tl-h"><div class="tl-t">Вы</div><span class="tl-time">${esc(n.ts)}${n.edited?" · изменено":""}</span></div>
        <div class="tl-tx">${mentions(n.text)}</div>
        <div class="tl-btns"><button class="b" data-edit="${n.idx}">Изменить</button><button class="b tl-danger${arm===n.idx?" arm":""}" data-del="${n.idx}">${arm===n.idx?"Точно удалить?":"Удалить"}</button></div></div></div>`}).join(""):emptyBox("cmt","Комментариев пока нет.<br>Напишите первый, @имя упомянет коллегу.");
    host.innerHTML=`<div class="tl-w"><div class="tl-compose"><i class="tl-av" style="--c:${AVC[0]}">Я</i><div class="tl-form tl-cmt"><textarea id="tl-new" placeholder="Комментарий. @имя — упомянуть коллегу" maxlength="2000" aria-label="Новый комментарий"></textarea>
      <div class="tl-sug" id="tl-sug"></div><div class="tl-cbar"><small class="tl-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> отправить · Только локально</small><button class="b btn-create" id="tl-add">Добавить</button></div></div></div>${list}</div>`;
    const ta=host.querySelector("#tl-new");
    ta.oninput=()=>suggest(ta,host.querySelector("#tl-sug"));
    ta.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();host.querySelector("#tl-add").click()}};
    host.querySelector("#tl-add").onclick=async e=>{
      const t=ta.value.trim();if(!t){PP.toast("Введите текст");ta.focus();return}
      const btn=e.target;btn.disabled=true;let ok=false;
      try{
        const r=await PP.api.post("/api/card/note",{f,deal:id,text:t});
        if(r.error)showErr(r);else ok=true;
      }catch(x){}
      finally{if(!ok&&!dead())btn.disabled=false}
      if(ok&&!dead()){await load();const n=items[0];
        undoToast("Сохранено",async()=>{if(!n)return;await PP.api.post("/api/timeline/note/delete",{f,deal:id,idx:n.idx,ts:n.ts});if(!dead())load()})}
    };
    const ex=host.querySelector("[data-e]");if(ex)ex.onkeydown=e=>{if(e.key==="Escape"){e.stopPropagation();editIdx=null;draw()}else if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();host.querySelector("[data-save]").click()}};
  };
  host.onclick=async e=>{
    const t=e.target.closest("button");if(!t)return;
    if(dead())return;
    if(t.hasAttribute("data-retry")){host.innerHTML='<div class="tl-w"><div class="tl-load">Загрузка…</div></div>';return load()}
    const find=k=>items.find(n=>String(n.idx)===t.dataset[k]);
    if(t.dataset.edit!==undefined){editIdx=Number(t.dataset.edit);arm=null;draw();const x=host.querySelector("[data-e]");if(x)x.focus()}
    else if(t.hasAttribute("data-cancel")){editIdx=null;draw()}
    else if(t.dataset.save!==undefined){
      const n=find("save"),ev=host.querySelector("[data-e]");if(!n||!ev)return;const v=ev.value.trim();
      if(!v){PP.toast("Текст не может быть пустым");return}
      t.disabled=true;let ok=false;
      try{
        const r=await PP.api.post("/api/timeline/note/edit",{f,deal:id,idx:n.idx,ts:n.ts,text:v});
        if(r.error)showErr(r);else ok=true;
      }catch(x){}
      finally{if(!ok&&!dead())t.disabled=false}
      if(ok&&!dead()){editIdx=null;load()}
    }else if(t.dataset.del!==undefined){
      const n=find("del");if(!n)return;
      if(arm!==n.idx){arm=n.idx;draw();clearTimeout(armT);armT=setTimeout(()=>{if(dead())return;arm=null;draw()},3500);return}
      t.disabled=true;let ok=false;
      try{
        const r=await PP.api.post("/api/timeline/note/delete",{f,deal:id,idx:n.idx,ts:n.ts});
        if(r.error)showErr(r);else ok=true;
      }catch(x){}
      finally{arm=null;if(!ok&&!dead()){t.disabled=false;draw()}}
      if(ok&&!dead())load();
    }
  };
  load();
}});

/* ---------- вкладка «Дела» ---------- */
let actHost=null;
function setActCount(n){document.querySelectorAll('.ctabs button[data-t="tl-act"]').forEach(b=>{b.textContent="Дела"+(n?" · "+n:"")})}
PP.on("card:open",({f,id})=>{
  PP.api.get("/api/activities?done=0&f="+encodeURIComponent(f)+"&deal="+encodeURIComponent(id)).then(r=>{
    if(r&&!r.error){const n=(r.items||[]).length;setTimeout(()=>{if(sameCard(f,id))setActCount(n)},0)}
  }).catch(()=>{});
});
PP.on("card:open",({f,id})=>{
  const u="&f="+encodeURIComponent(f)+"&deal="+encodeURIComponent(id);
  PP.api.get("/api/timeline/notes?"+u.slice(1)).then(r=>{if(r&&!r.error)setTimeout(()=>{if(sameCard(f,id))tabCount("tl-cmt","Комментарии",(r.items||[]).length)},0)}).catch(()=>{});
  PP.api.get("/api/timeline?"+u.slice(1)).then(r=>{if(r&&!r.error)setTimeout(()=>{if(sameCard(f,id))tabCount("tl-hist","История",(r.events||[]).length)},0)}).catch(()=>{});
});
PP.addCardTab({id:"tl-act",label:"Дела",render(host,{f,id}){
  const tok=host._tl=Symbol();const dead=()=>host._tl!==tok||!host.isConnected;
  host.innerHTML='<div class="tl-w"><div class="tl-load">Загрузка…</div></div>';
  let items=[],edit=null,showDone=false,arm=null,armT=0,form={type:"call",due:addDays(0),time:"12:00"};
  const load=async()=>{
    await users();if(dead())return;
    const r=await PP.api.get("/api/activities?done=all&f="+encodeURIComponent(f)+"&deal="+encodeURIComponent(id)).catch(()=>null);
    if(dead())return;
    if(!r||r.error){host.innerHTML='<div class="tl-w">'+errBox(r&&r.error)+'</div>';return}
    items=r.items||[];if(sameCard(f,id))setActCount(items.filter(a=>!a.done).length);draw();
    const ti=host.querySelector("#tl-title");if(ti&&edit)ti.focus();
  };
  const changed=()=>{AC.ts=0;refreshBadges(true);load()};
  const formHtml=a=>{
    const v=a||{type:form.type,title:"",due:form.due+"T"+form.time,responsible:"",comment:""};
    const d=v.due.slice(0,10),tm=v.due.slice(11,16);
    return `<div class="tl-form" id="tl-f">
      <div class="tl-row" role="group" aria-label="Тип дела">${TYPES.map(t=>`<button type="button" class="b tl-pill${v.type===t[0]?" on":""}" data-type="${t[0]}"><i class="tl-dot" style="--c:${t[2]}"></i>${t[1]}</button>`).join("")}</div>
      <input class="tl-grow" id="tl-title" maxlength="200" placeholder="Что нужно сделать" aria-label="Название дела" value="${esc(v.title)}">
      <div class="tl-grid"><span class="tl-lbl">Срок</span><div class="tl-row"><input type="date" id="tl-d" value="${esc(d)}" aria-label="Дата"><input type="time" id="tl-tm" value="${esc(tm)}" aria-label="Время"><div class="tl-q"><button type="button" class="b" data-q="0">Сегодня</button><button type="button" class="b" data-q="1">Завтра</button><button type="button" class="b" data-q="7">Через неделю</button></div></div>
        <span class="tl-lbl">Ответственный</span><select id="tl-r" aria-label="Ответственный"><option value="">—</option>${(USERS||[]).map(u=>`<option value="${esc(u.id)}"${String(u.id)===String(v.responsible)?" selected":""}>${esc(u.name)}</option>`).join("")}</select></div>
      <textarea id="tl-c" maxlength="2000" placeholder="Комментарий (необязательно)" aria-label="Комментарий">${esc(v.comment||"")}</textarea>
      <div class="tl-row"><button class="b btn-create" id="tl-ok">${a?"Сохранить":"Добавить дело"}</button>${a?'<button class="b" id="tl-no">Отмена</button>':""}</div></div>`;
  };
  const CHECK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const row=a=>{
    const di=a.done?{cls:"",full:"Выполнено "+(a.done_at||"").slice(0,16)}:dueInfo(a.due);const c=TCOL[a.type]||"#8a8f94";
    return `<div class="tl-act${a.done?" done":""}" style="--c:${c}"><button class="tl-ck" ${a.done?`data-undo="${a.id}" aria-label="Вернуть в работу" title="Вернуть в работу"`:`data-done="${a.id}" aria-label="Выполнить" title="Выполнить"`}>${CHECK}</button><div>
      <div class="tl-t">${esc(a.title)}</div>
      <div class="tl-meta"><span class="tl-type"><i class="tl-dot" style="--c:${c}"></i>${esc(TNAME[a.type]||"Дело")}</span><span class="tl-due ${di.cls}">${esc(di.full)}</span>${a.responsible?`<span>${esc(uname(a.responsible)||"#"+a.responsible)}</span>`:""}</div>
      ${a.comment?`<div class="tl-tx">${esc(a.comment)}</div>`:""}
      <div class="tl-btns">${a.done?"":`<button class="b" data-edit="${a.id}">Изменить</button>`}
      <button class="b tl-danger${arm===a.id?" arm":""}" data-del="${a.id}">${arm===a.id?"Точно удалить?":"Удалить"}</button></div></div></div>`;
  };
  const draw=()=>{
    const open=items.filter(a=>!a.done),done=items.filter(a=>a.done).sort((a,b)=>(b.done_at||"").localeCompare(a.done_at||""));
    const ed=edit&&items.find(a=>a.id===edit);
    let html=ed?"":formHtml(null);
    html+=`<div class="tl-sec">Невыполненные <em>${open.length}</em></div>`;
    html+=open.length?open.map(a=>a.id===edit?formHtml(a):row(a)).join(""):emptyBox("act","Нет открытых дел.<br>Добавьте звонок, встречу или задачу выше.");
    if(done.length){html+=`<div class="tl-btns"><button class="b" data-toggle>${showDone?"Скрыть выполненные":"Выполненные · "+done.length}</button></div>`;if(showDone)html+=`<div style="margin-top:8px">`+done.map(row).join("")+`</div>`}
    host.innerHTML='<div class="tl-w">'+html+'</div>';
  };
  const readForm=()=>({type:(host.querySelector(".tl-pill.on")||{dataset:{type:"call"}}).dataset.type,title:host.querySelector("#tl-title").value.trim(),
    due:host.querySelector("#tl-d").value+"T"+host.querySelector("#tl-tm").value,responsible:host.querySelector("#tl-r").value,comment:host.querySelector("#tl-c").value.trim()});
  host.onclick=async e=>{
    const t=e.target.closest("button");if(!t||dead())return;
    const ds=t.dataset;
    if(t.hasAttribute("data-retry")){host.innerHTML='<div class="tl-w"><div class="tl-load">Загрузка…</div></div>';return load()}
    if(ds.type){t.parentNode.querySelectorAll(".tl-pill").forEach(x=>x.classList.toggle("on",x===t));if(!edit)form.type=ds.type}
    else if(ds.q!==undefined){host.querySelector("#tl-d").value=addDays(Number(ds.q))}
    else if(t.id==="tl-ok"){
      const it=readForm();
      if(!it.title){PP.toast("Введите название");host.querySelector("#tl-title").focus();return}
      if(it.due.length!==16){PP.toast("Укажите дату и время");return}
      if(edit)it.id=edit;else{it.f=f;it.deal=id}
      t.disabled=true;let ok=false,r={};
      try{
        r=await PP.api.post("/api/activities/save",{item:it});
        if(r.error)showErr(r);else ok=true;
      }catch(x){}
      finally{if(!ok&&!dead())t.disabled=false}
      if(!ok)return;
      if(dead()){AC.ts=0;refreshBadges(true);return}
      if(!edit){form.due=it.due.slice(0,10);form.time=it.due.slice(11)}
      const wasEdit=!!edit;edit=null;changed();
      if(!wasEdit&&r.item&&r.item.id){const nid=r.item.id;undoToast("Сохранено",async()=>{await PP.api.post("/api/activities/delete",{id:nid});changed()})}else PP.toast("Сохранено");
    }
    else if(t.id==="tl-no"){edit=null;draw()}
    else if(ds.edit){edit=ds.edit;draw();const x=host.querySelector("#tl-title");if(x)x.focus()}
    else if(ds.done||ds.undo){
      t.disabled=true;let ok=false;
      try{
        const r=await PP.api.post("/api/activities/done",{id:ds.done||ds.undo,done:!!ds.done});
        if(r.error)showErr(r);else ok=true;
      }catch(x){}
      finally{if(!ok&&!dead())t.disabled=false}
      if(!ok)return;
      if(ds.done)PP.toast("Выполнено — в истории");
      if(dead()){AC.ts=0;refreshBadges(true);return}
      changed();
    }
    else if(ds.del){
      if(arm!==ds.del){arm=ds.del;draw();clearTimeout(armT);armT=setTimeout(()=>{if(dead())return;arm=null;draw()},3500);return}
      t.disabled=true;let ok=false;
      try{
        const r=await PP.api.post("/api/activities/delete",{id:ds.del});
        if(r.error)showErr(r);else ok=true;
      }catch(x){}
      finally{arm=null;if(!ok&&!dead()){t.disabled=false;draw()}}
      if(!ok)return;
      if(dead()){AC.ts=0;refreshBadges(true);return}
      changed();
    }
    else if(ds.toggle!==undefined){showDone=!showDone;draw()}
  };
  host.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&edit){e.stopPropagation();edit=null;draw();return}
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&e.target.closest("#tl-f")){e.preventDefault();const ok=host.querySelector("#tl-ok");if(ok)ok.click()}
    if(e.key==="Enter"&&e.target.id==="tl-title"){e.preventDefault();const ok=host.querySelector("#tl-ok");if(ok)ok.click()}
  });
  load();
}});
})();
