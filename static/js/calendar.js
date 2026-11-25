/* Фича calendar: виды «Календарь» и «Мои дела». Дела хранит фича timeline (/api/activities*), здесь только чтение и правка срока/статуса. */
(function(){
if(!window.PP||PP.__calendar)return;PP.__calendar=1;
const esc=PP.esc;
const MONTHS=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const MONTHS_G=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const DOW=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const DOWF=["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
const TYPES=PP.TYPES;
const OVER="#c8372d";
const EMPTY_SVG='<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="10" width="34" height="31" rx="4"/><path d="M7 19h34M16 6v7M32 6v7M17 28l5 5 9-10"/></svg>';
const NOMOD="Модуль дел (timeline) ещё не подключён: показать нечего.";

/* ---------- даты ---------- */
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const pd=s=>{const m=/^(\d{4})-(\d\d)-(\d\d)/.exec(s||"");return m?new Date(+m[1],+m[2]-1,+m[3]):null};
const ptime=s=>{const m=/T(\d\d):(\d\d)/.exec(s||"");return m?m[1]+":"+m[2]:""};
const addDays=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const monday=d=>addDays(d,-((d.getDay()+6)%7));
const dowIdx=d=>(d.getDay()+6)%7;
const dueDate=s=>{const d=pd(s);if(!d)return null;const t=ptime(s);if(t)d.setHours(+t.slice(0,2),+t.slice(3,5));else d.setHours(23,59,59);return d};
const isOver=a=>{if(a.done||!a.due)return false;const d=dueDate(a.due);return !!d&&d<new Date()};
const fmtDay=d=>d.getDate()+" "+MONTHS_G[d.getMonth()];
const fmtDue=s=>{const d=pd(s);if(!d)return "без срока";const t=ptime(s);return DOW[dowIdx(d)]+", "+fmtDay(d)+(t?" "+t:"")};
const shiftDue=(s,n)=>{const d=pd(s)||new Date();const x=addDays(d,n);return ymd(x)+(ptime(s)?"T"+ptime(s):"")};
const toDay=(s,day)=>day+(ptime(s)?"T"+ptime(s):"");

/* ---------- настройки и пользователи ---------- */
let prefs=null,prefP=null,USERS=[],usersP=null;
const loadPrefs=()=>prefP||(prefP=PP.api.get("/api/calendar/prefs").then(r=>{prefs=r.prefs||{}}).catch(()=>{prefs={}}));
const savePrefs=o=>{
  if(!prefs)prefs={};
  Object.keys(o).forEach(k=>{if(k==="dateField"){prefs.dateFields=prefs.dateFields||{};if(o.dateField)prefs.dateFields[o.f]=o.dateField;else delete prefs.dateFields[o.f]}else if(k!=="f")prefs[k]=o[k]});
  PP.api.post("/api/calendar/prefs",o).then(r=>{if(r&&r.error)PP.toast(r.error)}).catch(()=>PP.toast("Не удалось сохранить настройки: нет связи с панелью"))};
const loadUsers=()=>usersP||(usersP=PP.api.get("/api/users").then(r=>{USERS=r.items||[]}).catch(()=>{}));
const uname=id=>{const u=USERS.find(x=>String(x.id)===String(id));return u?u.name:(id?String(id):"")};

/* ---------- API дел ---------- */
const clean=a=>{const x={...a};delete x.dealTitle;delete x.funnelName;return x};
async function fetchActs(q){
  let r;try{r=await PP.api.get("/api/activities?"+q)}catch(e){return {error:"Нет связи с панелью"}}
  if(r.error){const nf=/not found|404/i.test(r.error);return {error:nf?NOMOD:r.error,nomod:nf}}
  return {items:r.items||[]}}
async function act(p,okMsg){
  let r;try{r=await p}catch(e){return false}
  if(r&&r.error){PP.toast(r.error);return false}
  if(okMsg)PP.toast(okMsg);return true}
const saveAct=a=>act(PP.api.post("/api/activities/save",{item:clean(a)}));
const doneAct=(id,done)=>act(PP.api.post("/api/activities/done",{id,done}));
const openCardOf=(f,id)=>{if(!f||!id){PP.toast("У дела нет карточки");return}if(window.openCard)window.openCard(f,id)};

/* ---------- стили ---------- */
const css=document.createElement("style");
css.textContent=`
.cal{display:flex;flex-direction:column;gap:12px;min-height:100%;font-variant-numeric:tabular-nums}
.cal-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cal-bar .sp{flex:1}
.cal-seg{display:inline-flex;gap:4px}
.cal-per{font-weight:600;font-size:16px;letter-spacing:0;margin:0 8px;min-width:0}
.cal .b[aria-pressed=true]{border-color:var(--ic-accent,#8FC640);background:var(--ic-accent-soft,#EEF7D9);color:var(--ic-ink)}
.cal-sel,.cal-in{box-sizing:border-box;height:30px;border:1px solid var(--bx-line,#d5dde0);background:#fff;border-radius:8px;padding:0 12px;font-size:12px;font-weight:500;min-width:0;max-width:100%;box-shadow:none;transition:border-color .15s,box-shadow .15s}
.cal-sel:focus,.cal-in:focus{border-color:var(--ic-accent,#8FC640);box-shadow:var(--focus)}
.cal button:focus-visible,.cal-sel:focus-visible,.cal-in:focus-visible,.cal-dlg button:focus-visible,.cal-dlg input:focus-visible,.cal-dlg select:focus-visible{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:1px}
.cal-st{color:var(--bx-mut,var(--ic-muted));font-size:12px;min-height:16px}
.cal-st.err{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--bx-red,#c8372d);background:#fdf1f0;border:1px solid #f3cfcb;border-radius:var(--r-sm,6px);padding:6px 10px}
.cal-empty{display:flex;flex-direction:column;align-items:center;gap:6px;background:#fff;border:1px dashed var(--bx-line,#d5dde0);border-radius:var(--r,8px);padding:40px 22px;color:var(--bx-mut,var(--ic-muted));text-align:center;font-size:12px}
.cal-empty svg{width:48px;height:48px;color:#b4bcc3;margin-bottom:4px}
.cal-empty b{font-size:13px;font-weight:600;color:var(--ic-ink)}
.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:#e8edf0;border:1px solid var(--bx-line,#d5dde0);border-radius:var(--r,8px);box-shadow:var(--sh1);overflow:hidden}
.cal-grid.one{grid-template-columns:minmax(0,1fr)}
.cal-hd{background:var(--ic-hover);padding:8px 10px;font-size:11px;font-weight:600;color:var(--bx-mut,var(--ic-muted));text-transform:none}
.cal-hd.we{color:#a0a8af}
.cal-cell{background:#fff;min-height:116px;padding:6px;display:flex;flex-direction:column;gap:4px;min-width:0;transition:background .15s}
.cal-cell:hover{background:#fbfcfd}
.cal-grid.wk .cal-cell{min-height:260px}.cal-grid.one .cal-cell{min-height:240px}
.cal-cell.we{background:#f9fafb}
.cal-cell.out{background:#f6f8f9}.cal-cell.out .cal-dn>span{color:#b4bcc3}
.cal-cell.today{background:var(--ic-accent-soft,#EEF7D9)}
.cal-cell.dropt{outline:2px dashed var(--ic-accent,#8FC640);outline-offset:-2px;background:var(--ic-accent-soft,#EEF7D9)}
.cal-dn{display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:24px}
.cal-dn>span{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;font-size:12px;font-weight:600;border-radius:12px;padding:0 4px;color:var(--ic-ink)}
.cal-cell.today .cal-dn>span{background:var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E)}
.cal-add{border:1px solid var(--bx-line,#d5dde0);background:#fff;border-radius:var(--r-sm,6px);padding:1px 8px;font-size:11px;font-weight:600;color:var(--bx-mut,var(--ic-muted));cursor:pointer;transform:translateY(2px) scale(.96);visibility:hidden;transition:transform .15s var(--ease),border-color .15s,color .15s}
.cal-cell:hover .cal-add,.cal-add:focus-visible{visibility:visible;transform:none}
.cal-add:hover{border-color:var(--ic-accent,#8FC640);color:var(--bx-link,#4A7A12)}
@media(hover:none){.cal-add{visibility:visible;transform:none}}
.cal-ev{display:flex;align-items:baseline;gap:6px;width:100%;text-align:left;background:color-mix(in srgb,var(--c) 12%,#fff);border:0;border-left:3px solid var(--c);border-radius:var(--r-sm,6px);padding:3px 8px;font-size:11px;font-weight:500;color:var(--ic-ink);cursor:pointer;min-width:0;transition:background .15s,box-shadow .15s,transform .15s var(--ease)}
.cal-ev:hover{background:color-mix(in srgb,var(--c) 22%,#fff);box-shadow:var(--sh1)}
.cal-ev b{font-weight:600;flex:none;font-size:11px;color:var(--bx-mut,var(--ic-muted))}
.cal-ev .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.cal-ev.over{color:#9e2a22}.cal-ev.over b{color:var(--bx-red,#c8372d)}
.cal-ev.done{background:var(--ic-hover);border-left-color:var(--ic-line);color:var(--bx-mut,var(--ic-muted))}.cal-ev.done .t{text-decoration:line-through}
.cal-ev.d{background:#fff;box-shadow:inset 0 0 0 1px var(--bx-line,#d5dde0);border-left:3px dashed var(--ic-muted);--c:var(--ic-muted)}
.cal-ev[draggable=true]{cursor:grab}.cal-ev.drag{transform:scale(.97);box-shadow:var(--sh2)}
.cal-grid.one .cal-ev,.cal-grid.wk .cal-ev{flex-wrap:wrap}
.cal-sub{flex-basis:100%;color:var(--bx-mut,var(--ic-muted));font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal-more{border:0;background:none;color:var(--bx-link,#4A7A12);font-size:11px;font-weight:600;cursor:pointer;text-align:left;padding:1px 4px;border-radius:4px;transition:background .15s}
.cal-more:hover{background:var(--ic-accent-soft,#EEF7D9)}
.cal-list{display:none;flex-direction:column;gap:8px}
.cal-ld{background:#fff;border:1px solid var(--bx-line,#d5dde0);border-radius:var(--r,8px);box-shadow:var(--sh1);padding:10px}
.cal-ld.today{border-color:var(--ic-accent,#8FC640);background:var(--ic-accent-soft,#EEF7D9)}
.cal-ld h4{margin:0 0 8px;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:6px}
.cal-ld .cal-ev{margin-bottom:4px}
.cal-ld .cal-add{visibility:visible;transform:none}
@media(max-width:640px){.cal-grid{display:none}.cal-list{display:flex}.cal-per{flex:1 1 100%;order:-1;margin:0}.cal-bar .sp{display:none}}
.cal-leg{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11px;color:var(--bx-mut,var(--ic-muted))}
.cal-leg span{display:inline-flex;align-items:center}
.cal-leg i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);margin-right:5px}
.cal-skel{height:360px;border:1px solid var(--bx-line,#d5dde0);border-radius:var(--r,8px);background:linear-gradient(90deg,#f6f8f9 25%,#e9edf0 50%,#f6f8f9 75%);background-size:200% 100%;animation:calsh 1.3s linear infinite}
@keyframes calsh{from{background-position:200% 0}to{background-position:-200% 0}}
@media(prefers-reduced-motion:reduce){.cal-skel{animation:none}}
/* окно */
.cal-ov{position:fixed;inset:0;background:rgba(26,29,30,.4);z-index:25;display:flex;align-items:center;justify-content:center;padding:12px}
.cal-dlg{background:#fff;border-radius:var(--r,8px);box-shadow:var(--sh3);width:min(460px,100%);max-height:calc(100vh - 24px);overflow:auto;padding:20px}
.cal-dh{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.cal-dh b{font-size:15px;font-weight:600;line-height:1.35;word-break:break-word}
.cal-db{display:flex;flex-direction:column;gap:12px}
.cal-fl{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:600;color:var(--bx-mut,var(--ic-muted))}
.cal-fl .cal-in,.cal-fl .cal-sel{width:100%;color:var(--ic-ink)}
.cal-2{display:grid;grid-template-columns:1fr 110px;gap:8px}
.cal-meta{font-size:12px;color:var(--bx-mut,var(--ic-muted));display:flex;flex-direction:column;gap:4px}
.cal-meta strong{color:var(--ic-ink);font-weight:600}
.cal-acts{display:flex;gap:8px;flex-wrap:wrap}
.cal-res{display:flex;flex-direction:column;gap:4px;max-height:150px;overflow:auto}
.cal-res button{text-align:left;border:1px solid var(--bx-line,#d5dde0);background:#fff;border-radius:var(--r-sm,6px);padding:6px 10px;font-size:12px;cursor:pointer;transition:background .15s,border-color .15s}
.cal-res button:hover{background:var(--ic-hover);border-color:var(--ic-accent,#8FC640)}
.cal-res small{color:var(--bx-mut,var(--ic-muted));display:block}
.cal-pick{display:flex;align-items:center;gap:6px;background:var(--ic-accent-soft,#EEF7D9);border-radius:var(--r-sm,6px);padding:5px 6px 5px 12px;font-size:12px;font-weight:600;color:var(--ic-ink)}
.cal-pick span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal-err{color:var(--bx-red,#c8372d);font-size:12px}
/* Мои дела */
.cal-bar [data-search]{width:170px!important}.cal-bar [data-me]{max-width:150px}.cal-bar [data-who]{max-width:180px}
.cal-mb{display:flex;flex-direction:column;gap:12px}
.cal-gr{background:#fff;border:1px solid var(--bx-line,#d5dde0);border-radius:var(--r,8px);box-shadow:var(--sh1);overflow:hidden}
.cal-gr>h3,.cal-gr>summary{margin:0;padding:10px 14px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;background:var(--ic-hover);cursor:default;list-style:none}
.cal-gr>summary{cursor:pointer;transition:background .15s}.cal-gr>summary:hover{background:#eef1f4}.cal-gr>summary::-webkit-details-marker{display:none}
.cal-gr>summary::before{content:"›";color:var(--bx-mut,var(--ic-muted));font-size:13px;line-height:1;transition:transform .15s var(--ease)}.cal-gr[open]>summary::before{transform:rotate(90deg)}
.cal-gr h3 small,.cal-gr summary small{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:18px;background:#dfe5e9;color:var(--ic-ink);border-radius:9px;padding:0 6px;font-size:11px;font-weight:600}
.cal-gr.over>h3{color:#9e2a22;background:#fdf1f0}.cal-gr.over h3 small{background:var(--bx-red,#c8372d);color:#fff}
.cal-row{display:flex;align-items:flex-start;gap:12px;padding:10px 14px;border-top:1px solid #e8edf0;flex-wrap:wrap;transition:background .15s}
.cal-row:hover{background:#f7f9fa}
.cal-dot{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid var(--c);background:color-mix(in srgb,var(--c) 14%,#fff);margin-top:1px;position:relative}
.cal-dot::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;border-radius:50%;background:var(--c);transform:translate(-50%,-50%) scale(0);transition:transform .15s var(--ease)}
.cal-row:hover .cal-dot::after{transform:translate(-50%,-50%) scale(1)}
.cal-row.done .cal-dot{border-color:#8FC640;background:#8FC640}
.cal-row.done .cal-dot::after{width:7px;height:4px;border-radius:0;background:none;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:translate(-50%,-62%) rotate(-45deg) scale(1)}
.cal-rm{flex:1 1 260px;min-width:0}
.cal-tt{display:block;border:0;background:none;padding:0;font-size:12px;font-weight:600;color:var(--ic-ink);text-align:left;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .15s}
.cal-tt:hover{color:var(--bx-link,#4A7A12)}
.cal-rs{font-size:11px;color:var(--bx-mut,var(--ic-muted));margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal-row.over .cal-rs .dd{color:var(--bx-red,#c8372d);font-weight:600}
.cal-row.done .cal-tt{text-decoration:line-through;color:var(--bx-mut,var(--ic-muted))}
.cal-ra{display:flex;gap:4px;flex-wrap:wrap}
.cal-ra .b{padding:3px 10px;font-size:11px}
`;
document.head.appendChild(css);

/* ---------- окно ---------- */
let closeCur=null;
function modal(title,body,mount){
  if(closeCur)closeCur();
  const prev=document.activeElement;
  const ov=document.createElement("div");ov.className="cal-ov";
  ov.innerHTML=`<div class="cal-dlg" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="cal-dh"><b>${esc(title)}</b><button class="b" data-x>Закрыть</button></div><div class="cal-db">${body}</div></div>`;
  const close=()=>{document.removeEventListener("keydown",key,true);ov.remove();closeCur=null;if(prev&&prev.focus&&document.contains(prev))try{prev.focus()}catch(e){}};
  const key=e=>{if(e.key==="Escape"){e.stopPropagation();close()}else if(e.key==="Tab"){const f=[...ov.querySelectorAll("button,input,select,textarea")].filter(x=>!x.disabled&&x.offsetParent);if(!f.length)return;const i=f.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}};
  ov.addEventListener("mousedown",e=>{if(e.target===ov)close()});
  ov.querySelector("[data-x]").onclick=close;
  document.addEventListener("keydown",key,true);
  document.body.appendChild(ov);closeCur=close;
  const dlg=ov.querySelector(".cal-dlg");if(mount)mount(dlg,close);
  const first=dlg.querySelector("input:not([type=hidden]),select")||dlg.querySelector(".cal-acts button")||dlg.querySelector("button");if(first)first.focus();
  return close}

function cardLine(a){return [a.funnelName,a.dealTitle].filter(Boolean).join(" · ")}

/* окно дела */
function openAct(a,after){
  const t=TYPES[a.type]||TYPES.other,over=isOver(a);
  const body=`<div class="cal-meta">
    <span><strong>${esc(t.n)}</strong>${a.done?" · выполнено":(over?" · просрочено":"")}</span>
    <span>Срок: <strong>${esc(fmtDue(a.due))}</strong></span>
    ${a.responsible?`<span>Ответственный: <strong>${esc(uname(a.responsible))}</strong></span>`:""}
    ${cardLine(a)?`<span>Карточка: <strong>${esc(cardLine(a))}</strong></span>`:""}
    ${a.comment?`<span>${esc(a.comment)}</span>`:""}</div>
    <div class="cal-acts"><button class="b btn-create" data-do="done">${a.done?"Вернуть в работу":"Выполнить"}</button>${a.deal?`<button class="b" data-do="card">Открыть карточку</button>`:""}</div>
    <div class="cal-fl">Перенести срок<div class="cal-2"><input class="cal-in" type="date" data-nd value="${esc((a.due||"").slice(0,10))}" aria-label="Новая дата"><input class="cal-in" type="time" data-nt value="${esc(ptime(a.due))}" aria-label="Новое время"></div></div>
    <div class="cal-acts"><button class="b" data-do="move">Перенести</button><button class="b" data-do="p1">+1 день</button><button class="b" data-do="p7">+1 неделя</button></div>
    <div class="cal-err" data-e></div>`;
  modal(a.title||"Дело",body,(dlg,close)=>{
    const done=async(fn)=>{if(await fn){close();after&&after()}};
    dlg.querySelector(".cal-db").addEventListener("click",async e=>{
      const b=e.target.closest("[data-do]");if(!b)return;const k=b.dataset.do;
      if(k==="done")return done(doneAct(a.id,!a.done));
      if(k==="card"){close();return openCardOf(a.f,a.deal)}
      if(k==="p1")return done(saveAct({...a,due:shiftDue(a.due,1)}));
      if(k==="p7")return done(saveAct({...a,due:shiftDue(a.due,7)}));
      if(k==="move"){const d=dlg.querySelector("[data-nd]").value,tm=dlg.querySelector("[data-nt]").value;
        if(!d){dlg.querySelector("[data-e]").textContent="Выберите дату";return}
        return done(saveAct({...a,due:d+"T"+(tm||ptime(a.due)||"09:00")}))}})})}

/* окно создания */
function openCreate(o,after){
  o=o||{};let card=o.deal||null,timer=null,seq=0;
  const me=(PP.me&&PP.me.id)||(prefs&&prefs.me)||"";
  const tOpts=Object.keys(TYPES).map(k=>`<option value="${k}">${esc(TYPES[k].n)}</option>`).join("");
  const uOpts=`<option value="">— не назначен —</option>`+USERS.map(u=>`<option value="${esc(u.id)}"${String(u.id)===String(me)?" selected":""}>${esc(u.name)}</option>`).join("");
  const body=`<div class="cal-fl">Тип<select class="cal-sel" data-type>${tOpts}</select></div>
    <label class="cal-fl">Название<input class="cal-in" data-title maxlength="200" placeholder="Что нужно сделать"></label>
    <div class="cal-fl">Срок<div class="cal-2"><input class="cal-in" type="date" data-d value="${esc(o.day||ymd(new Date()))}" aria-label="Дата"><input class="cal-in" type="time" data-t value="09:00" aria-label="Время"></div></div>
    <label class="cal-fl">Ответственный<select class="cal-sel" data-who>${uOpts}</select></label>
    <div class="cal-fl">Карточка<div data-cardbox></div></div>
    <div class="cal-err" data-e></div>
    <div class="cal-acts"><button class="b btn-create" data-save>Создать дело</button></div>`;
  modal("Новое дело",body,(dlg,close)=>{
    const box=dlg.querySelector("[data-cardbox]");
    const showCard=()=>{
      if(card){box.innerHTML=`<div class="cal-pick"><span>${esc((card.funnel?card.funnel+" · ":"")+(card.title||"#"+card.id))}</span><button class="b" data-clr>Сбросить</button></div>`;box.querySelector("[data-clr]").onclick=()=>{card=null;showCard()}}
      else{box.innerHTML=`<input class="cal-in" data-q placeholder="Найти карточку: название, компания, номер" aria-label="Поиск карточки"><div class="cal-res" data-res></div>`;
        const q=box.querySelector("[data-q]"),res=box.querySelector("[data-res]");
        q.addEventListener("input",()=>{clearTimeout(timer);const v=q.value.trim();if(v.length<2){res.innerHTML="";return}
          timer=setTimeout(async()=>{const my=++seq;let r;try{r=await PP.api.get("/api/search?q="+encodeURIComponent(v))}catch(e){r={error:"Нет связи с панелью"}}
            if(my!==seq)return;if(r&&r.error){res.innerHTML=`<div class="cal-err">${esc(r.error)} <button class="b" data-sretry>Повторить</button></div>`;return}const it=r.items||[];window.__calres=it;
            res.innerHTML=it.length?it.slice(0,20).map((c,i)=>`<button data-i="${i}">${esc(c.title)}<small>${esc(c.funnel)} · ${esc(c.stage)}${c.company?" · "+esc(c.company):""}</small></button>`).join(""):`<div class="cal-st">Ничего не найдено</div>`},250)});
        res.addEventListener("click",e=>{if(e.target.closest("[data-sretry]")){q.dispatchEvent(new Event("input"));return}const b=e.target.closest("[data-i]");if(!b)return;const c=(window.__calres||[])[+b.dataset.i];if(!c)return;card={f:c.f,id:c.id,title:c.title,funnel:c.funnel};showCard()})}};
    showCard();
    const err=dlg.querySelector("[data-e]"),btn=dlg.querySelector("[data-save]");
    btn.onclick=async()=>{
      const title=dlg.querySelector("[data-title]").value.trim(),d=dlg.querySelector("[data-d]").value,tm=dlg.querySelector("[data-t]").value;
      if(!title){err.textContent="Введите название";dlg.querySelector("[data-title]").focus();return}
      if(!d){err.textContent="Выберите дату";return}
      btn.disabled=true;err.textContent="";
      const item={type:dlg.querySelector("[data-type]").value,title,due:d+"T"+(tm||"09:00"),responsible:dlg.querySelector("[data-who]").value,done:false,comment:""};
      if(card){item.f=card.f;item.deal=card.id}
      let r;try{r=await PP.api.post("/api/activities/save",{item})}catch(e){btn.disabled=false;err.textContent="Нет связи с панелью";return}
      if(r&&r.error){btn.disabled=false;err.textContent=/not found|404/i.test(r.error)?NOMOD:/нужны f и deal/.test(r.error)?"Выберите карточку для дела":r.error;return}
      PP.toast("Дело создано");close();after&&after()}})}

/* ====================== КАЛЕНДАРЬ ====================== */
const S={anchor:new Date(),tok:0};
const DF={};
const dfList=f=>DF[f]||(DF[f]=PP.api.get("/api/calendar/datefields?f="+encodeURIComponent(f)).then(r=>{if(!r||r.error||!r.items){delete DF[f];return []}return r.items}).catch(()=>{delete DF[f];return []}));
const mode=()=>(prefs&&prefs.mode)||"month";
const showActs=()=>!prefs||prefs.showActs!==false;
const showDates=()=>!!(prefs&&prefs.showDates);

function range(){
  const m=mode(),a=S.anchor;
  if(m==="day")return [new Date(a.getFullYear(),a.getMonth(),a.getDate()),new Date(a.getFullYear(),a.getMonth(),a.getDate())];
  if(m==="week"){const s=monday(a);return [s,addDays(s,6)]}
  const f=new Date(a.getFullYear(),a.getMonth(),1),l=new Date(a.getFullYear(),a.getMonth()+1,0);
  return [monday(f),addDays(monday(l),6)]}
function period(){
  const m=mode(),a=S.anchor;
  if(m==="month")return MONTHS[a.getMonth()]+" "+a.getFullYear();
  if(m==="day")return DOWF[dowIdx(a)]+", "+fmtDay(a)+" "+a.getFullYear();
  const [s,e]=range();return s.getMonth()===e.getMonth()?s.getDate()+" – "+fmtDay(e)+" "+e.getFullYear():fmtDay(s)+" – "+fmtDay(e)+" "+e.getFullYear()}
function nav(dir){
  const m=mode(),a=S.anchor;
  if(m==="month")S.anchor=new Date(a.getFullYear(),a.getMonth()+dir,1);
  else S.anchor=addDays(a,(m==="week"?7:1)*dir)}

function evChip(e,m){
  const c=e.color;
  return `<button class="cal-ev ${e.cls}" style="--c:${c}" data-ev="${e.k}" data-id="${esc(e.id)}"${e.k==="a"?' draggable="true"':""} title="${esc(e.tip)}">${e.time?`<b>${esc(e.time)}</b>`:""}<span class="t">${esc(e.title)}</span>${(m==="day"||m==="week")&&e.sub?`<span class="cal-sub">${esc(e.sub)}</span>`:""}</button>`}

function buildEvents(acts,dates,dealMap){
  const out=[];
  acts.forEach(a=>{const d=(a.due||"").slice(0,10);if(!d)return;const t=TYPES[a.type]||TYPES.other,over=isOver(a);
    out.push({k:"a",id:a.id,day:d,time:ptime(a.due),title:a.title||"(без названия)",sub:cardLine(a),color:over?OVER:t.c,cls:(over?"over ":"")+(a.done?"done":""),tip:t.n+": "+(a.title||"")+(cardLine(a)?" — "+cardLine(a):""),a})});
  dates.forEach(x=>{out.push({k:"d",id:x.id,f:x.f,day:x.date,time:"",title:x.title,sub:[x.company,x.stage].filter(Boolean).join(" · "),color:"#1A1D1E",cls:"d",tip:x.title+(x.company?" — "+x.company:"")})});
  out.sort((a,b)=>a.day<b.day?-1:a.day>b.day?1:(a.time||"99")<(b.time||"99")?-1:(a.time||"99")>(b.time||"99")?1:0);
  return out}

function drawCal(root,host){
  const tok=++S.tok;
  const f=PP.cur,m=mode(),[r0,r1]=range();
  const today=ymd(new Date());
  const dfSel=prefs&&prefs.dateFields&&prefs.dateFields[f]||"";
  root.innerHTML=`<div class="cal-bar">
    <div class="cal-seg" role="group" aria-label="Режим">${[["month","Месяц"],["week","Неделя"],["day","День"]].map(x=>`<button class="b" data-mode="${x[0]}" aria-pressed="${m===x[0]}">${x[1]}</button>`).join("")}</div>
    <button class="b" data-nav="-1" aria-label="Назад">‹</button><button class="b" data-nav="0">Сегодня</button><button class="b" data-nav="1" aria-label="Вперёд">›</button>
    <span class="cal-per">${esc(period())}</span><span class="sp"></span>
    <div class="cal-seg" role="group" aria-label="Источники"><button class="b" data-src="showActs" aria-pressed="${showActs()}">Дела</button><button class="b" data-src="showDates" aria-pressed="${showDates()}">Даты карточек</button></div>
    ${showDates()?`<select class="cal-sel" data-df aria-label="Поле даты карточки"><option value="">Поле даты…</option></select>`:""}
    <button class="b btn-create" data-add="">+ Дело</button></div>
    <div class="cal-leg">${Object.keys(TYPES).map(k=>`<span><i style="--c:${TYPES[k].c}"></i>${TYPES[k].n}</span>`).join("")}<span><i style="--c:${OVER}"></i>Просрочено</span></div>
    <div class="cal-st" data-st>Загрузка…</div><div data-body><div class="cal-skel" role="status" aria-label="Загрузка"></div></div>`;
  const st=root.querySelector("[data-st]"),bodyEl=root.querySelector("[data-body]");
  // поле даты
  if(showDates()){const sel=root.querySelector("[data-df]");
    dfList(f).then(list=>{if(tok!==S.tok)return;sel.innerHTML=`<option value="">${list.length?"Поле даты…":"Нет полей с датами"}</option>`+list.map(x=>`<option value="${esc(x.code)}"${x.code===dfSel?" selected":""}>${esc(x.label)} (${x.count})</option>`).join("")})}
  const p=[];
  const q="from="+ymd(r0)+"&to="+ymd(r1)+"&done=all&f="+encodeURIComponent(f);
  p.push(showActs()?fetchActs(q):Promise.resolve({items:[]}));
  p.push(showDates()&&dfSel?PP.api.get("/api/calendar/dates?f="+encodeURIComponent(f)+"&code="+encodeURIComponent(dfSel)+"&from="+ymd(r0)+"&to="+ymd(r1)).catch(()=>({error:"Нет связи с панелью"})):Promise.resolve({items:[]}));
  Promise.all(p).then(([ra,rd])=>{
    if(tok!==S.tok)return;
    S.acts=ra.items||[];
    const dealMap={};(PP.deals?PP.deals():[]).forEach(d=>dealMap[d.id]=d);
    let dates=(rd.items||[]).filter(x=>{const d=dealMap[x.id];return d?PP.match(d):false});
    const errs=[];if(ra.error)errs.push(ra.error);if(rd.error)errs.push(rd.error);
    const events=buildEvents(S.acts,dates);
    const by={};events.forEach(e=>(by[e.day]=by[e.day]||[]).push(e));
    const days=[];for(let d=new Date(r0);d<=r1;d=addDays(d,1))days.push(new Date(d));
    let msg;
    if(errs.length){msg=errs.join(" · ");st.classList.add("err")}
    else if(!showActs()&&!showDates())msg="Включите источник: «Дела» или «Даты карточек».";
    else if(showDates()&&!dfSel&&!showActs())msg="Выберите поле даты карточки.";
    else if(!events.length)msg=(showDates()&&!dfSel?"Дат карточек нет: выберите поле даты. ":"")+"В этом периоде событий нет.";
    else msg="Событий: "+events.length+(showDates()&&!dfSel?" · выберите поле даты, чтобы увидеть даты карточек":"");
    st.textContent=msg;
    if(errs.length&&!(ra.nomod&&!rd.error)){const rb=document.createElement("button");rb.className="b";rb.dataset.retry="1";rb.textContent="Повторить";rb.style.marginLeft="8px";st.appendChild(rb)}
    const LIM=m==="month"?3:999;
    const cell=d=>{const k=ymd(d),ev=by[k]||[],out=m==="month"&&d.getMonth()!==S.anchor.getMonth();
      return `<div class="cal-cell${out?" out":""}${dowIdx(d)>4?" we":""}${k===today?" today":""}" data-day="${k}"><div class="cal-dn"><span>${d.getDate()}</span><button class="cal-add" data-add="${k}" aria-label="Добавить дело на ${esc(fmtDay(d))}">+ Дело</button></div>${ev.slice(0,LIM).map(e=>evChip(e,m)).join("")}${ev.length>LIM?`<button class="cal-more" data-more="${k}">+${ev.length-LIM} ещё</button>`:""}</div>`};
    const head=m==="day"?"":DOW.map((x,i)=>`<div class="cal-hd${i>4?" we":""}">${x}</div>`).join("");
    const grid=`<div class="cal-grid ${m==="week"?"wk":m==="day"?"one":""}">${head}${days.map(cell).join("")}</div>`;
    const lst=`<div class="cal-list">${days.filter(d=>m!=="month"||by[ymd(d)]||ymd(d)===today).filter(d=>m!=="month"||d.getMonth()===S.anchor.getMonth()||by[ymd(d)]).map(d=>{const k=ymd(d);return `<div class="cal-ld${k===today?" today":""}" data-day="${k}"><h4>${DOW[dowIdx(d)]}, ${esc(fmtDay(d))}<button class="b" data-add="${k}" aria-label="Добавить дело на ${esc(fmtDay(d))}">+ Дело</button></h4>${(by[k]||[]).map(e=>evChip(e,"day")).join("")||`<div class="cal-st">Нет событий</div>`}</div>`}).join("")}</div>`;
    bodyEl.innerHTML=grid+lst;
    S.events=events;S.dates=dates})}

function renderCalendar(host){
  host.innerHTML="";
  const root=document.createElement("div");root.className="cal";root.innerHTML=`<div class="cal-skel" role="status" aria-label="Загрузка"></div>`;host.appendChild(root);
  const redraw=()=>drawCal(root,host);
  root.addEventListener("click",e=>{
    const t=e.target;let b;
    if(t.closest("[data-retry]")){return redraw()}
    if((b=t.closest("[data-mode]"))){prefs.mode=b.dataset.mode;savePrefs({mode:b.dataset.mode});return redraw()}
    if((b=t.closest("[data-nav]"))){const v=+b.dataset.nav;if(v===0)S.anchor=new Date();else nav(v);return redraw()}
    if((b=t.closest("[data-src]"))){const k=b.dataset.src,v=k==="showActs"?!showActs():!showDates();savePrefs({[k]:v});return redraw()}
    if((b=t.closest("[data-add]"))){return openCreate({day:b.dataset.add||ymd(S.anchor)},redraw)}
    if((b=t.closest("[data-more]"))){S.anchor=pd(b.dataset.more);prefs.mode="day";savePrefs({mode:"day"});return redraw()}
    if((b=t.closest("[data-ev]"))){
      if(b.dataset.ev==="a"){const a=(S.acts||[]).find(x=>String(x.id)===b.dataset.id);if(a)openAct(a,redraw)}
      else{openCardOf(PP.cur,b.dataset.id)}}});
  root.addEventListener("change",e=>{const s=e.target.closest("[data-df]");if(!s)return;savePrefs({f:PP.cur,dateField:s.value});redraw()});
  // перетаскивание дел
  let dragId=null;
  root.addEventListener("dragstart",e=>{const b=e.target.closest&&e.target.closest("[data-ev=a]");if(!b)return;dragId=b.dataset.id;e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",dragId)}catch(x){}b.classList.add("drag")});
  root.addEventListener("dragend",e=>{dragId=null;root.querySelectorAll(".drag,.dropt").forEach(x=>x.classList.remove("drag","dropt"))});
  root.addEventListener("dragover",e=>{if(dragId===null)return;const c=e.target.closest("[data-day]");if(!c)return;e.preventDefault();root.querySelectorAll(".dropt").forEach(x=>x!==c&&x.classList.remove("dropt"));c.classList.add("dropt")});
  root.addEventListener("drop",async e=>{if(dragId===null)return;const c=e.target.closest("[data-day]");if(!c)return;e.preventDefault();
    const a=(S.acts||[]).find(x=>String(x.id)===String(dragId));dragId=null;if(!a)return;
    const day=c.dataset.day;if((a.due||"").slice(0,10)===day)return redraw();
    if(await saveAct({...a,due:toDay(a.due,day)},"Срок перенесён: "+fmtDay(pd(day))))S.keep=1;redraw()});
  Promise.all([loadPrefs(),loadUsers()]).then(()=>{if(!root.isConnected)return;if(!S.init){S.init=1;S.anchor=new Date()}redraw()})}

/* ====================== МОИ ДЕЛА ====================== */
const M={type:"",who:undefined,q:"",items:null,err:"",nomod:false,doneOpen:false};

function groupOf(a,now){
  if(!a.due)return "none";
  if(isOver(a))return "over";
  const d=pd(a.due),t0=new Date(now.getFullYear(),now.getMonth(),now.getDate()),diff=Math.round((d-t0)/864e5);
  if(diff<=0)return "today";if(diff===1)return "tom";
  const toSun=6-dowIdx(now);if(diff<=toSun)return "week";return "later"}
const GROUPS=[["over","Просрочено"],["today","Сегодня"],["tom","Завтра"],["week","На этой неделе"],["later","Позже"],["none","Без срока"]];

function rowHtml(a){
  const t=TYPES[a.type]||TYPES.other,over=isOver(a);
  const meta=[t.n,`<span class="dd">${esc(fmtDue(a.due))}</span>`,a.responsible?esc(uname(a.responsible)):"",cardLine(a)?esc(cardLine(a)):""].filter(Boolean).join(" · ");
  return `<div class="cal-row${over?" over":""}${a.done?" done":""}" style="--c:${over?OVER:t.c}"><span class="cal-dot"></span><div class="cal-rm"><button class="cal-tt" data-open="${esc(a.id)}">${esc(a.title||"(без названия)")}</button><div class="cal-rs">${meta}</div></div>
    <div class="cal-ra"><button class="b" data-q="done" data-id="${esc(a.id)}">${a.done?"Вернуть":"Выполнить"}</button>${a.done?"":`<button class="b" data-q="p1" data-id="${esc(a.id)}">+1 день</button><button class="b" data-q="p7" data-id="${esc(a.id)}">+1 неделя</button>`}${a.deal?`<button class="b" data-q="card" data-id="${esc(a.id)}">Карточка</button>`:""}</div></div>`}

function drawMineBody(root){
  const body=root.querySelector("[data-mbody]"),st=root.querySelector("[data-st]");
  if(M.items===null){body.innerHTML='<div class="cal-skel" role="status" aria-label="Загрузка"></div>';st.className="cal-st";st.textContent="Загрузка…";return}
  if(M.err){st.className="cal-st err";st.textContent=M.err;body.innerHTML=M.nomod?"":`<div class="cal-acts"><button class="b" data-retry>Повторить</button></div>`;return}
  const me=(PP.me&&PP.me.id)||(prefs&&prefs.me)||"",q=M.q.trim().toLowerCase();
  let items=M.items.filter(a=>{
    if(M.type&&(a.type||"other")!==M.type)return false;
    if(M.who){const w=M.who==="me"?me:M.who;if(String(a.responsible||"")!==String(w))return false}
    if(q&&!((a.title||"")+" "+(a.dealTitle||"")+" "+(a.funnelName||"")).toLowerCase().includes(q))return false;
    return true});
  const now=new Date(),g={};GROUPS.forEach(x=>g[x[0]]=[]);const done=[];
  items.forEach(a=>{if(a.done)done.push(a);else g[groupOf(a,now)].push(a)});
  const open=items.length-done.length;
  st.className="cal-st";st.textContent=open?"Открытых дел: "+open:"Открытых дел нет.";
  let h="";
  GROUPS.forEach(([k,n])=>{const l=g[k];if(!l.length)return;l.sort((a,b)=>(a.due||"9")<(b.due||"9")?-1:1);
    h+=`<section class="cal-gr${k==="over"?" over":""}"><h3>${n}<small>${l.length}</small></h3>${l.map(rowHtml).join("")}</section>`});
  if(done.length){done.sort((a,b)=>String(b.done_at||b.due||"")<String(a.done_at||a.due||"")?-1:1);
    h+=`<details class="cal-gr" data-doned${M.doneOpen?" open":""}><summary>Выполнено<small>${done.length}</small></summary>${done.slice(0,100).map(rowHtml).join("")}</details>`}
  if(!h)h=`<div class="cal-empty">${EMPTY_SVG}<b>${M.items.length?"Ничего не найдено":"Дел пока нет"}</b><span>${M.items.length?"Измените фильтры или поиск.":"Создайте первое кнопкой «+ Дело»."}</span></div>`;
  body.innerHTML=h}

async function loadMine(root){
  M.items=null;M.err="";drawMineBody(root);
  const r=await fetchActs("done=all");
  if(!root.isConnected)return;
  if(r.error){M.err=r.error;M.nomod=!!r.nomod;M.items=[]}else{M.items=r.items}
  drawMineBody(root)}

function renderMine(host){
  host.innerHTML="";
  const root=document.createElement("div");root.className="cal";root.innerHTML=`<div class="cal-st">Загрузка…</div>`;host.appendChild(root);
  Promise.all([loadPrefs(),loadUsers()]).then(()=>{
    if(!root.isConnected)return;
    const me=(PP.me&&PP.me.id)||(prefs&&prefs.me)||"";
    if(M.who===undefined)M.who=me?"me":"";
    const uo=sel=>`<option value="">— не выбран —</option>`+USERS.map(u=>`<option value="${esc(u.id)}"${String(u.id)===String(sel)?" selected":""}>${esc(u.name)}</option>`).join("");
    const wo=`<option value=""${M.who===""?" selected":""}>Все ответственные</option>`+(me?`<option value="me"${M.who==="me"?" selected":""}>Я (${esc(uname(me))})</option>`:"")+USERS.map(u=>`<option value="${esc(u.id)}"${M.who===String(u.id)?" selected":""}>${esc(u.name)}</option>`).join("");
    root.innerHTML=`<div class="cal-bar"><input class="cal-in" data-search placeholder="Поиск по названию" aria-label="Поиск по названию" value="${esc(M.q)}" style="width:220px">
      <div class="cal-seg" role="group" aria-label="Тип">${[["","Все"]].concat(Object.keys(TYPES).map(k=>[k,TYPES[k].n])).map(x=>`<button class="b" data-type="${x[0]}" aria-pressed="${M.type===x[0]}">${x[1]}</button>`).join("")}</div>
      <select class="cal-sel" data-who aria-label="Ответственный">${wo}</select><span class="sp"></span>
      <select class="cal-sel" data-me aria-label="Кто я" title="Кто я">${uo(me).replace("— не выбран —","Я — не выбран")}</select>
      <button class="b btn-create" data-new>+ Дело</button></div>
      <div class="cal-st" data-st>Загрузка…</div><div data-mbody class="cal-mb"></div>`;
    const reload=()=>loadMine(root);
    root.addEventListener("input",e=>{if(e.target.matches("[data-search]")){M.q=e.target.value;drawMineBody(root)}});
    root.addEventListener("change",e=>{const t=e.target;
      if(t.matches("[data-who]")){M.who=t.value;drawMineBody(root)}
      else if(t.matches("[data-me]")){savePrefs({me:t.value});PP.setMe(t.value);if(!t.value&&M.who==="me")M.who="";renderMine(host)}});
    root.addEventListener("toggle",e=>{if(e.target.matches&&e.target.matches("[data-doned]"))M.doneOpen=e.target.open},true);
    root.addEventListener("click",async e=>{
      const t=e.target;let b;
      if((b=t.closest("[data-type]"))){M.type=b.dataset.type;root.querySelectorAll("[data-type]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.type===M.type)));return drawMineBody(root)}
      if(t.closest("[data-new]"))return openCreate({},reload);
      if(t.closest("[data-retry]"))return reload();
      if((b=t.closest("[data-open]"))){const a=(M.items||[]).find(x=>String(x.id)===b.dataset.open);if(a)openAct(a,reload);return}
      if((b=t.closest("[data-q]"))){
        const a=(M.items||[]).find(x=>String(x.id)===b.dataset.id);if(!a)return;const k=b.dataset.q;
        if(k==="card")return openCardOf(a.f,a.deal);
        b.disabled=true;let ok;
        if(k==="done")ok=await doneAct(a.id,!a.done);
        else ok=await saveAct({...a,due:shiftDue(a.due,k==="p1"?1:7)});
        if(ok)reload();else b.disabled=false}});
    loadMine(root)})}

PP.addView({id:"calendar",label:"Календарь",render:renderCalendar});
PP.addView({id:"mytasks",label:"Мои дела",render:renderMine});
})();
