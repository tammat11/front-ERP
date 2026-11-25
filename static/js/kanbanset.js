/* kanbanset: настройка канбана и стадий, WIP-лимиты, диалог закрытия сделки. Локально, в Битрикс ничего не пишется. */
(function(){
if(!window.PP||PP._kset)return;PP._kset=1;
const $=s=>document.querySelector(s),esc=s=>PP.esc(s);
const panelOpen=()=>document.querySelector("#dr").style.display==="block"&&document.querySelector(".kset-panel");
const PAL=["#4C8BF5","#8FC640","#F5A524","#E5484D","#9B6BDF","#18B8A6","#E56BA6","#8B6B4A","#5B6CFF","#C7B300","#2E9E5B","#F07A3A"];
const GREY="#C9CDC3";
const DENS=[["compact","Компактная"],["normal","Обычная"],["full","Подробная"]];
const SORTS=[["","Как есть"],["sumd","По сумме"],["title","По названию"],["new","Сначала новые"]];
const DEF_REASONS=["Дорого","Выбрали конкурента","Нет бюджета","Не отвечает","Дубль","Другое"];
let CFG={},LOADING={},VAL={},PEND={},SCH={},reasons=DEF_REASONS.slice(),q=Promise.resolve(),warned={};

/* ---------- стили ---------- */
const st=document.createElement("style");st.textContent=`
#board.kset-d-compact .card{padding:6px 10px}
#board.kset-d-compact .card .m,#board.kset-d-compact .card .chips{display:none}
#board.kset-d-compact .card .cf{margin-top:4px}
#board.kset-d-full .card .t{-webkit-line-clamp:4}
#board.kset-d-full .card .chip{white-space:normal}
#board.kset-nochips .card .chips{display:none!important}
#board.kset-nosum .card .s,#board.kset-nosum .card .sm{display:none}
#board.kset-nowho .card .who{display:none}
#board.kset-nowho .card .cf{justify-content:flex-end}
#board.kset-nowho.kset-nosum .card .cf{display:none}
#board .card[data-kset-lc]{box-shadow:inset 4px 0 0 var(--kset-lc),var(--sh1)}
#board .card[data-kset-lc]:hover{box-shadow:inset 4px 0 0 var(--kset-lc),var(--sh2)}
#board .col.kset-hide{display:none}
#board .col .kset-tog{margin-left:auto}
#board .col .kset-n{display:none}
#board .col.kset-c{flex:0 0 46px;width:46px;min-width:46px;max-width:46px;padding:0 4px 8px;cursor:pointer}
#board .col.kset-c .ch{flex-direction:column;align-items:center;gap:6px;margin:0 -4px;padding:10px 4px 8px}
#board .col.kset-c .chm{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-height:0;overflow:hidden}
#board .col.kset-c .chm b{writing-mode:vertical-rl;max-height:56vh;display:block}
#board .col.kset-c .chm span,#board .col.kset-c .kset-wip{display:none}
#board .col.kset-c .cards,#board .col.kset-c [data-add]{display:none}
#board .col.kset-c .kset-n{display:inline-block;background:var(--ic-ink,#1A1D1E);color:#fff;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600}
#board .col.kset-c .kset-tog{margin-left:0}
.kset-wip{font-style:normal;margin:3px 0 0;background:rgba(255,255,255,.88);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;color:var(--ic-ink,#1A1D1E);white-space:nowrap;display:table;box-shadow:0 0 0 1px rgba(31,41,55,.06)}
#board .col.kset-over .cards{box-shadow:inset 0 0 0 2px rgba(200,55,45,.55);border-radius:10px}
.col.kset-over .kset-wip{background:#c8372d;color:#fff}
#kset-legend{display:flex;flex-wrap:wrap;gap:6px;padding:0 24px 8px}#kset-legend:empty,#kset-legend[hidden]{display:none}
.kset-lg{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #e3e8eb;border-radius:999px;padding:3px 10px 3px 8px;font-size:11px;font-weight:500;color:#3b4247;box-shadow:var(--sh1)}
.kset-lg i{width:8px;height:8px;border-radius:50%;flex:none}.kset-lg small{color:var(--bx-mut);font-weight:600;background:#eef2f4;border-radius:999px;padding:0 6px;font-size:11px}
.kset-panel{font-size:12px;color:var(--ic-ink,#1A1D1E)}
.kset-panel h3{margin:0 0 2px}
.kset-panel .kset-sub{color:var(--bx-mut);font-size:12px}
#dr .kset-panel h4{margin:0 0 8px;font-size:12px;font-weight:600;color:var(--bx-mut);letter-spacing:0;text-transform:none}
.kset-panel .kset-hint{color:var(--bx-mut);font-size:12px;margin:4px 0;line-height:1.4}
.kset-sec{background:#fff;border:1px solid #e3e8eb;border-radius:var(--r);padding:12px 14px;margin-top:12px;box-shadow:var(--sh1)}
.kset-sec:first-of-type{margin-top:14px}
.kset-row{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;padding:5px 0;border-bottom:1px solid #f0f3f5}
.kset-row:last-child{border-bottom:0}
.kset-row .kset-nm{flex:1 1 0;min-width:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kset-row small{color:var(--bx-mut);font-weight:600;font-size:11px}
.kset-panel .b{padding:0 10px;font-size:12px;min-height:30px;text-transform:none;letter-spacing:0;font-weight:500}
.kset-panel .b.kset-ic{width:30px;padding:0;flex:none;font-size:13px;line-height:1}
#dr .kset-panel .seg{margin:0;display:flex;gap:4px;background:var(--bg2);border-radius:var(--r);padding:3px}
.kset-panel .seg button{flex:1;padding:6px 10px;border-radius:var(--r-sm);font-size:12px;border:0;background:none;cursor:pointer;transition:background-color .15s;font-family:inherit}
.kset-panel .seg button.on{background:#fff;box-shadow:var(--sh1),inset 0 0 0 1px var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E);font-weight:600}
#dr .kset-panel select{height:28px;box-sizing:border-box;border:1px solid var(--bx-line);border-radius:var(--r-sm);padding:0 8px;font:inherit;font-size:12px;background:#fff;max-width:100%}
#dr .kset-panel select[data-k=fadd],#dr .kset-panel select[data-k=ccode]{width:100%}
.kset-tg-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;cursor:pointer;font-size:12px}
.kset-tg-row+.kset-tg-row{border-top:1px solid #f0f3f5}
#dr .kset-tg-row input{position:absolute;opacity:0;width:0;height:0;margin:0;padding:0;border:0}
.kset-tg{position:relative;flex:none;width:34px;height:20px;border-radius:999px;background:var(--ic-line);transition:background-color .15s}
.kset-tg::after{content:"";position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(31,41,55,.3);transition:transform .15s var(--ease)}
.kset-tg-row input:checked+.kset-tg{background:var(--ic-accent,#8FC640)}
.kset-tg-row input:checked+.kset-tg::after{transform:translateX(14px)}
.kset-tg-row input:focus-visible+.kset-tg{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:2px}
.kset-st{display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #f0f3f5}
.kset-st:last-of-type{border-bottom:0}
.kset-st .kset-sw{flex:none;width:6px;align-self:stretch;border-radius:3px}
#dr .kset-panel .kset-st input[type=text]{flex:1 1 0;min-width:0;width:0;box-sizing:border-box;height:30px;border:1px solid var(--bx-line);border-radius:var(--r-sm);padding:0 8px;font:inherit;font-size:12px}
#dr .kset-panel input[type=color]{width:30px;min-width:30px;max-width:30px;box-sizing:border-box;height:30px;padding:2px;border:1px solid var(--bx-line);border-radius:var(--r-sm);background:#fff;flex:none;cursor:pointer}
#dr .kset-panel input[type=number]{width:56px;min-width:56px;box-sizing:border-box;height:30px;flex:none;border:1px solid var(--bx-line);border-radius:var(--r-sm);padding:0 6px;font:inherit;font-size:12px}
.kset-panel .kset-st .kset-tg-row{padding:0;gap:6px;font-size:11px;color:var(--bx-mut);flex:none;border:0}
.kset-panel .kset-st .kset-tg-row+.kset-tg-row{border:0}
.kset-swr{display:flex;align-items:center;gap:8px}
.kset-swr .kset-dot{width:10px;height:10px;border-radius:50%;flex:none;box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(31,41,55,.12)}
.kset-reasons{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.kset-rchip{display:inline-flex;align-items:center;gap:2px;background:var(--bg2);border:1px solid #e3e8eb;border-radius:999px;padding:2px 2px 2px 10px;font-size:12px}
.kset-rchip button{border:0;background:none;width:20px;height:20px;border-radius:50%;cursor:pointer;color:var(--bx-mut);font-size:13px;line-height:1;transition:background-color .15s}
.kset-rchip button:hover:not(:disabled){background:#dfe5e9;color:#c8372d}.kset-rchip button:disabled{opacity:.4;cursor:default}
.kset-panel :is(input,select,textarea):focus-visible,.kset-panel button:focus-visible{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:1px}
.kset-ov{position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:12px}
.kset-dlg{background:#fff;border-radius:12px;box-shadow:var(--sh3);width:min(460px,100%);max-height:100%;overflow:auto;padding:22px 24px 20px}
.kset-dlg h3{margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ic-ink,#1A1D1E)}.kset-dlg .sub{color:var(--bx-mut);font-size:12px;margin-bottom:16px;word-break:break-word;line-height:1.4}
.kset-dlg label{display:block;font-size:12px;color:var(--bx-mut);margin:12px 0 6px;font-weight:600}
.kset-dlg textarea{width:100%;box-sizing:border-box;border:1px solid var(--bx-line);border-radius:var(--r-sm);padding:8px 10px;font:inherit;font-size:12px;background:#fff;min-height:84px;resize:vertical}
.kset-dlg textarea:focus{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:-1px;border-color:var(--ic-accent,#8FC640)}
.kset-ch{display:flex;flex-wrap:wrap;gap:6px}
.kset-ch button{border:1px solid var(--bx-line);background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;cursor:pointer;color:var(--ic-ink,#1A1D1E);transition:background-color .15s,border-color .15s}
.kset-ch button:hover{background:var(--bg2)}
.kset-ch button[aria-pressed=true]{background:var(--ic-accent-soft,#EEF7D9);border-color:var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E);font-weight:600;box-shadow:0 0 0 1px var(--ic-accent,#8FC640)}
.kset-ch button:focus-visible{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:2px}
.kset-dlg .err{color:#c8372d;font-size:12px;margin-top:8px;min-height:16px}
.kset-dlg .act{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
.kset-dlg .act .b{text-transform:none;letter-spacing:0;font-size:12px;font-weight:500;padding:7px 16px;min-height:34px}
.kset-dlg .act .btn-create{background:var(--ic-accent,#8FC640);border-color:var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E);font-weight:600}.kset-dlg .act .btn-create:hover{background:var(--ic-accent-hover,#7DB534)}
`;
document.head.appendChild(st);

/* ---------- конфиг ---------- */
function norm(c){c=c||{};return {fields:Array.isArray(c.fields)?c.fields.slice(0,6):[],density:c.density||"normal",
  show:Object.assign({who:true,sum:true,company:true,chips:true},c.show||{}),
  color:{code:(c.color&&c.color.code)||"",map:Object.assign({},c.color&&c.color.map)},
  collapsed:c.collapsed||[],hidden:c.hidden||[],order:c.order||[],colsum:c.colsum!==false,sort:c.sort||"",
  stages:c.stages||{},wip:c.wip||{}}}
function loadCfg(fid){
  if(LOADING[fid])return LOADING[fid];
  return LOADING[fid]=PP.api.get("/api/kanbanset/config?f="+encodeURIComponent(fid)).then(r=>{
    if(r&&r.error){CFG[fid]=norm();warnOnce("cfg","Настройки канбана не загрузились: "+r.error)}
    else{CFG[fid]=norm(r.cfg);if(Array.isArray(r.reasons)&&r.reasons.length)reasons=r.reasons}
  }).catch(()=>{CFG[fid]=norm()});
}
function warnOnce(k,t){if(warned[k])return;warned[k]=1;PP.toast(t)}
function cfg(){return CFG[PP.cur]||norm()}
function persist(){const fid=PP.cur,c=CFG[fid];if(!c)return;
  q=q.then(()=>PP.api.post("/api/kanbanset/config",{f:fid,cfg:c})).then(r=>{if(r&&r.error)PP.toast("Не сохранилось: "+r.error)}).catch(()=>{})}
function commit(mut,noRender){const c=cfg();CFG[PP.cur]=c;mut(c);persist();if(!noRender)PP.refilter();if(panelOpen())panel()}
function effOrder(c){const ids=PP.B.stages.map(s=>s.id),o=c.order.filter(x=>ids.includes(x));return o.concat(ids.filter(x=>!o.includes(x)))}
function hex(c){c=String(c||"").trim();if(/^#[0-9a-f]{6}$/i.test(c))return c;if(/^#[0-9a-f]{3}$/i.test(c))return "#"+c.slice(1).split("").map(x=>x+x).join("");return GREY}

/* ---------- значения полей ---------- */
function codesOf(c){const a=c.fields.slice();if(c.color.code&&!a.includes(c.color.code))a.push(c.color.code);return a}
function stats(v,code){v._d=v._d||{};if(v._d[code])return v._d[code];const n={};
  Object.values(v.values||{}).forEach(r=>{if(r[code])n[r[code]]=(n[r[code]]||0)+1});
  return v._d[code]=Object.keys(n).sort((a,b)=>n[b]-n[a]||a.localeCompare(b,"ru")).map(k=>({v:k,n:n[k]}))}
function colorOf(c,v,val){if(c.color.map[val])return c.color.map[val];const i=stats(v,c.color.code).findIndex(x=>x.v===val);return i>=0&&i<PAL.length?PAL[i]:GREY}
function fetchVals(fid,key,codes){if(PEND[key])return;PEND[key]=1;
  PP.api.get("/api/kanbanset/values?f="+encodeURIComponent(fid)+"&codes="+encodeURIComponent(codes.join(","))).then(r=>{
    if(r&&r.error){VAL[key]={values:{},labels:{}};warnOnce("val","Значения полей не загрузились: "+r.error)}else VAL[key]=r;
  }).catch(()=>{VAL[key]={values:{},labels:{}}}).finally(()=>{delete PEND[key];if(PP.cur===fid){apply();if(panelOpen())panel()}})}

/* ---------- применение к DOM ---------- */
function apply(){
  const fid=PP.cur,board=$("#board");if(!PP.B||!fid||!board)return;
  if(!CFG[fid]){loadCfg(fid).then(()=>{if(PP.cur===fid)apply()});return}
  const c=CFG[fid];
  board.classList.toggle("kset-d-compact",c.density==="compact");board.classList.toggle("kset-d-full",c.density==="full");
  board.classList.toggle("kset-nochips",!c.show.chips);board.classList.toggle("kset-nosum",!c.show.sum);board.classList.toggle("kset-nowho",!c.show.who);
  stages(c,board);
  const dmap={};PP.B.stages.forEach(s=>s.deals.forEach(d=>dmap[d.id]=d));
  board.querySelectorAll(".card").forEach(el=>{const m=el.querySelector(".m"),d=dmap[el.dataset.id];
    if(m&&d){if(m.dataset.ko===undefined)m.dataset.ko=m.textContent;m.textContent=c.show.company?m.dataset.ko:"#"+d.id+(d.month?" · "+d.month:"")}});
  sortCols(c,board,dmap);
  const codes=codesOf(c);let v=null;
  if(codes.length){const key=fid+"|"+codes.join(",");v=VAL[key];if(!v){fetchVals(fid,key,codes);legend(c,null);return}}
  paint(c,v,board);legend(c,v);
}
function stages(c,board){
  const ord=effOrder(c);
  ord.forEach(id=>{const col=board.querySelector('.col[data-s="'+CSS.escape(id)+'"]');if(col)board.appendChild(col)});
  PP.B.stages.forEach(s=>{
    const col=board.querySelector('.col[data-s="'+CSS.escape(s.id)+'"]');if(!col)return;
    const ov=c.stages[s.id]||{},ch=col.querySelector(".ch"),b=col.querySelector(".chm b"),sp=col.querySelector(".chm span");
    if(b){b.textContent=ov.name||s.name;b.title=ov.name||s.name}
    if(ch)ch.style.setProperty("--c",ov.color||s.color||GREY);
    col.classList.toggle("kset-hide",c.hidden.includes(s.id));
    const coll=c.collapsed.includes(s.id);col.classList.toggle("kset-c",coll);
    const n=s.deals.filter(PP.match).length,lim=c.wip[s.id]||0;
    if(sp){if(sp.dataset.ko===undefined)sp.dataset.ko=sp.textContent;sp.textContent=c.colsum?sp.dataset.ko:sp.dataset.ko.replace(/\s·\s[^·]*₸\s*$/,"")}
    let w=col.querySelector(".kset-wip");if(w)w.remove();
    if(lim&&sp){w=document.createElement("em");w.className="kset-wip";w.textContent=n+"/"+lim;w.title="WIP-лимит стадии: "+lim;sp.after(w)}
    col.classList.toggle("kset-over",!!lim&&n>lim);
    if(ch){
      let nn=ch.querySelector(".kset-n");if(!nn){nn=document.createElement("span");nn.className="kset-n";ch.insertBefore(nn,ch.querySelector(".chm").nextSibling)}nn.textContent=n;
      let t=ch.querySelector(".kset-tog");if(!t){t=document.createElement("button");t.type="button";t.className="ib kset-tog";t.dataset.ksetTog=s.id;const add=ch.querySelector("[data-add]");add?ch.insertBefore(t,add):ch.appendChild(t)}
      t.textContent=coll?"›":"‹";t.setAttribute("aria-expanded",coll?"false":"true");
      const nm=ov.name||s.name;t.title=coll?"Развернуть колонку":"Свернуть колонку";t.setAttribute("aria-label",(coll?"Развернуть колонку «":"Свернуть колонку «")+nm+"»");
    }
  });
}
function sortCols(c,board,dmap){
  if(!c.sort||(PP.FS&&PP.FS.sort))return;
  board.querySelectorAll(".cards").forEach(box=>{
    const cards=[...box.children].filter(x=>x.classList.contains("card"));if(cards.length<2)return;
    const anchor=[...box.children].find(x=>!x.classList.contains("card"))||null;
    const g=el=>dmap[el.dataset.id]||{sum:0,title:"",created:""};
    if(c.sort==="sumd")cards.sort((a,b)=>g(b).sum-g(a).sum);
    else if(c.sort==="title")cards.sort((a,b)=>String(g(a).title).localeCompare(String(g(b).title),"ru"));
    else if(c.sort==="new")cards.sort((a,b)=>String(g(b).created||"").localeCompare(String(g(a).created||"")));
    cards.forEach(el=>box.insertBefore(el,anchor));
  });
}
function paint(c,v,board){
  const rows=(v&&v.values)||{},labels=(v&&v.labels)||{};
  board.querySelectorAll(".card").forEach(el=>{
    const row=rows[el.dataset.id]||{};
    if(c.fields.length){
      let ch=el.querySelector(".chips");
      const html=c.fields.filter(k=>row[k]).map(k=>`<span class="chip" title="${esc(labels[k]||k)}: ${esc(row[k])}">${esc(row[k])}</span>`).join("");
      if(html){if(!ch){ch=document.createElement("div");ch.className="chips";const cf=el.querySelector(".cf");cf?el.insertBefore(ch,cf):el.appendChild(ch)}ch.innerHTML=html}
      else if(ch)ch.remove();
    }
    const val=c.color.code?row[c.color.code]:"";
    if(val){el.style.setProperty("--kset-lc",colorOf(c,v,val));el.dataset.ksetLc="1"}
    else{el.style.removeProperty("--kset-lc");delete el.dataset.ksetLc}
  });
}
function legend(c,v){
  let el=$("#kset-legend");
  if(!el){el=document.createElement("div");el.id="kset-legend";el.setAttribute("aria-label","Легенда цветовой метки");$("#board").before(el)}
  el.hidden=PP.curView!=="kanban";
  if(!c.color.code||!v){el.innerHTML="";return}
  const label=(v.labels&&v.labels[c.color.code])||"Метка";
  const shown=new Set(PP.deals().filter(PP.match).map(d=>d.id)),cnt={};
  Object.entries(v.values||{}).forEach(([id,r])=>{if(shown.has(id)&&r[c.color.code])cnt[r[c.color.code]]=(cnt[r[c.color.code]]||0)+1});
  const top=stats(v,c.color.code).slice(0,PAL.length);
  const rest=stats(v,c.color.code).length-top.length;
  el.innerHTML=top.map(x=>`<span class="kset-lg"><i style="background:${esc(colorOf(c,v,x.v))}"></i>${esc(x.v)} <small>${cnt[x.v]||0}</small></span>`).join("")+
    (rest>0?`<span class="kset-lg"><i style="background:${GREY}"></i>Прочие значения <small>${rest}</small></span>`:"")+
    (!top.length?`<span class="kset-lg">${esc(label)}: значений нет</span>`:"");
  el.hidden=PP.curView!=="kanban";
}

/* ---------- сворачивание колонок ---------- */
$("#board").addEventListener("click",e=>{
  const t=e.target.closest("[data-kset-tog]"),hd=e.target.closest(".kset-c .ch");
  const sid=t?t.dataset.ksetTog:(hd?hd.closest(".col").dataset.s:null);if(!sid)return;
  e.stopPropagation();
  commit(c=>{c.collapsed=c.collapsed.includes(sid)?c.collapsed.filter(x=>x!==sid):c.collapsed.concat(sid)});
});

/* ---------- панель настроек ---------- */
function getSchema(fid){
  if(SCH[fid])return Promise.resolve(SCH[fid]);
  return PP.api.get("/api/kanbanset/schema?f="+encodeURIComponent(fid)).then(r=>SCH[fid]=r);
}
function curVals(c){const codes=codesOf(c);return codes.length?VAL[PP.cur+"|"+codes.join(",")]:null}
function panel(){
  const fid=PP.cur;if(!PP.B)return;
  const sch=SCH[fid];
  if(!sch){PP.openDrawer('<div class="kset-panel"><h3>Настройка канбана</h3><p class="kset-hint">Загрузка полей…</p></div>');
    getSchema(fid).then(()=>{if(PP.cur===fid&&panelOpen())panel()}).catch(()=>{});return}
  const c=cfg(),fields=(sch.fields||[]),lab=k=>(fields.find(x=>x.code===k)||{}).label||k;
  const ae=document.activeElement,fk=ae&&ae.dataset?ae.dataset.k:null,scr=$("#dr")?$("#dr").scrollTop:0;
  const free=fields.filter(x=>!c.fields.includes(x.code));
  const fl=c.fields.map((k,i)=>`<div class="kset-row"><span class="kset-nm" title="${esc(lab(k))}">${esc(lab(k))}</span>
    <button class="b kset-ic" data-ks="fup" data-i="${i}" data-k="fup${i}"${i?"":" disabled"} aria-label="Выше">↑</button>
    <button class="b kset-ic" data-ks="fdn" data-i="${i}" data-k="fdn${i}"${i<c.fields.length-1?"":" disabled"} aria-label="Ниже">↓</button>
    <button class="b kset-ic" data-ks="frm" data-i="${i}" data-k="frm${i}" aria-label="Убрать поле">×</button></div>`).join("")||'<div class="kset-hint">Не выбрано: на карточках остаются штатные поля.</div>';
  const cv=curVals(c);let sw="";
  if(c.color.code){
    if(cv)sw=stats(cv,c.color.code).slice(0,PAL.length).map((x,i)=>`<div class="kset-row"><input type="color" data-ks="cmap" data-v="${esc(x.v)}" data-k="cm${i}" value="${esc(hex(colorOf(c,cv,x.v)))}" aria-label="Цвет: ${esc(x.v)}"><span class="kset-dot" style="background:${esc(hex(colorOf(c,cv,x.v)))}"></span><span class="kset-nm">${esc(x.v)}</span><small>${x.n}</small></div>`).join("")||'<div class="kset-hint">В этом поле пока нет значений.</div>';
    else sw='<div class="kset-hint">Загрузка значений…</div>';
  }
  const ord=effOrder(c),sn=Object.fromEntries(PP.B.stages.map(s=>[s.id,s]));
  const stg=ord.map((id,i)=>{const s=sn[id],ov=c.stages[id]||{};return `<div class="kset-st"><span class="kset-sw" style="background:${esc(hex(ov.color||s.color))}"></span>
    <button class="b kset-ic" data-ks="sup" data-id="${esc(id)}" data-k="sup${i}"${i?"":" disabled"} aria-label="Выше">↑</button>
    <button class="b kset-ic" data-ks="sdn" data-id="${esc(id)}" data-k="sdn${i}"${i<ord.length-1?"":" disabled"} aria-label="Ниже">↓</button>
    <input type="text" data-ks="sname" data-id="${esc(id)}" data-k="sn${i}" value="${esc(ov.name||"")}" placeholder="${esc(s.name)}" maxlength="60" aria-label="Название стадии «${esc(s.name)}»">
    <input type="color" data-ks="scol" data-id="${esc(id)}" data-k="sc${i}" value="${esc(hex(ov.color||s.color))}" aria-label="Цвет стадии «${esc(s.name)}»">
    <input type="number" min="1" max="9999" data-ks="wip" data-id="${esc(id)}" data-k="sw${i}" value="${c.wip[id]||""}" placeholder="WIP" aria-label="WIP-лимит стадии «${esc(s.name)}»">
    <label class="kset-tg-row"><span>Скрыть</span><input type="checkbox" data-ks="shide" data-id="${esc(id)}" data-k="sh${i}"${c.hidden.includes(id)?" checked":""}><span class="kset-tg"></span></label></div>`}).join("");
  const rs='<div class="kset-reasons">'+reasons.map((r,i)=>`<span class="kset-rchip">${esc(r)}<button data-ks="rrm" data-i="${i}" data-k="rr${i}"${reasons.length>1?"":" disabled"} aria-label="Убрать причину «${esc(r)}»" title="Убрать">×</button></span>`).join("")+"</div>";
  const chk=(k,t)=>`<label class="kset-tg-row"><span>${t}</span><input type="checkbox" data-ks="show" data-w="${k}" data-k="sh_${k}"${c.show[k]?" checked":""}><span class="kset-tg"></span></label>`;
  PP.openDrawer(`<div class="kset-panel"><h3>Настройка канбана</h3><span class="kset-sub">${esc(PP.B.name)}</span>
   <p class="kset-hint">Только отображение: данные и стадии в Битриксе не меняются. Переименование и порядок стадий влияют только на доску. Настройки хранятся отдельно для каждой воронки.</p>
   <section class="kset-sec"><h4>Поля на карточке (до 6)</h4>${fl}
   ${c.fields.length<6?`<div class="kset-row"><select data-ks="fadd" data-k="fadd" aria-label="Добавить поле"><option value="">Добавить поле…</option>${free.map(x=>`<option value="${esc(x.code)}">${esc(x.label)}</option>`).join("")}</select></div>`:'<div class="kset-hint">Достигнут максимум: 6 полей.</div>'}
   ${fields.length?"":'<div class="kset-hint">Для этой воронки нет полей для выбора.</div>'}
   ${c.fields.length?'<div style="margin-top:6px"><button class="b" data-ks="fclr" data-k="fclr">Вернуть штатные поля</button></div>':""}</section>
   <section class="kset-sec"><h4>Плотность карточек</h4><div class="seg">${DENS.map(([k,t])=>`<button data-ks="dens" data-d="${k}" data-k="d_${k}" class="${c.density===k?"on":""}">${t}</button>`).join("")}</div></section>
   <section class="kset-sec"><h4>Показывать на карточке</h4>${chk("who","Ответственного")}${chk("sum","Сумму")}${chk("company","Клиента")}${chk("chips","Поля")}</section>
   <section class="kset-sec"><h4>Цветовая метка</h4>
   <select data-ks="ccode" data-k="ccode" aria-label="Поле для цветовой метки"><option value="">Без метки</option>${fields.map(x=>`<option value="${esc(x.code)}"${c.color.code===x.code?" selected":""}>${esc(x.label)}</option>`).join("")}</select>
   ${sw}</section>
   <section class="kset-sec"><h4>Колонки</h4>${`<label class="kset-tg-row"><span>Суммы по колонкам</span><input type="checkbox" data-ks="colsum" data-k="colsum"${c.colsum?" checked":""}><span class="kset-tg"></span></label>`}
   <div class="kset-row"><span class="kset-nm">Сортировка внутри колонки</span><select data-ks="csort" data-k="csort" aria-label="Сортировка внутри колонки">${SORTS.map(([k,t])=>`<option value="${k}"${c.sort===k?" selected":""}>${t}</option>`).join("")}</select></div>
   ${PP.FS&&PP.FS.sort?'<div class="kset-hint">Сейчас включён общий порядок в шапке, он главнее.</div>':""}
   <div class="kset-hint">Свернуть колонку: шеврон в её шапке.${c.collapsed.length?` Свёрнуто: ${c.collapsed.length}.`:""}</div></section>
   <section class="kset-sec"><h4>Стадии и WIP-лимиты</h4>
   <div class="kset-hint">Название и цвет — локально. Лимит: при превышении колонка подсвечивается.</div>${stg}
   <div style="margin-top:8px"><button class="b" data-ks="sreset" data-k="sreset">Сбросить к исходным</button></div></section>
   <section class="kset-sec"><h4>Причины проигрыша</h4>${rs}
   <div class="kset-row"><input type="text" id="kset-nr" data-k="nr" maxlength="60" placeholder="Новая причина" aria-label="Новая причина" style="flex:1 1 0;width:0;min-width:0;box-sizing:border-box;height:30px;border:1px solid var(--bx-line);border-radius:6px;padding:0 8px;font:inherit;font-size:12px"><button class="b" data-ks="radd" data-k="radd">Добавить</button><button class="b" data-ks="rdef" data-k="rdef">По умолчанию</button></div></section>
   </div>`,host=>{const root=host.querySelector(".kset-panel");root.onclick=onClick;root.onchange=onChange;
     root.querySelector("#kset-nr").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();addReason()}}});
  if($("#dr"))$("#dr").scrollTop=scr;
  if(fk){const t=document.querySelector('.kset-panel [data-k="'+CSS.escape(fk)+'"]');if(t&&!t.disabled)t.focus()}
}
function move(arr,i,d){const j=i+d;if(j<0||j>=arr.length)return;const t=arr[i];arr[i]=arr[j];arr[j]=t}
function saveReasons(list){return PP.api.post("/api/kanbanset/reasons",{reasons:list}).then(r=>{if(r&&r.error){PP.toast(r.error);return}reasons=r.reasons;if(panelOpen())panel()})}
function addReason(){const el=$("#kset-nr");const v=(el.value||"").trim();if(!v){PP.toast("Введите причину");el.focus();return}
  if(reasons.includes(v)){PP.toast("Такая причина уже есть");return}saveReasons(reasons.concat(v))}
function onClick(e){
  const b=e.target.closest("[data-ks]");if(!b||b.tagName!=="BUTTON")return;const a=b.dataset.ks,i=+b.dataset.i;
  if(a==="fup")commit(c=>move(c.fields,i,-1));else if(a==="fdn")commit(c=>move(c.fields,i,1));
  else if(a==="frm")commit(c=>c.fields.splice(i,1));else if(a==="fclr")commit(c=>{c.fields=[]});
  else if(a==="dens")commit(c=>{c.density=b.dataset.d});
  else if(a==="sup"||a==="sdn")commit(c=>{const o=effOrder(c),k=o.indexOf(b.dataset.id);move(o,k,a==="sup"?-1:1);c.order=o});
  else if(a==="sreset"){b.dataset.ks="sreset2";b.textContent="Точно сбросить?"}
  else if(a==="sreset2")commit(c=>{c.stages={};c.order=[];c.hidden=[]});
  else if(a==="rrm"){saveReasons(reasons.filter((_,k)=>k!==i))}
  else if(a==="radd")addReason();
  else if(a==="rdef")saveReasons(DEF_REASONS.slice());
}
function onChange(e){
  const el=e.target.closest("[data-ks]");if(!el)return;const a=el.dataset.ks,id=el.dataset.id;
  if(a==="fadd"){if(el.value)commit(c=>{if(c.fields.length<6&&!c.fields.includes(el.value))c.fields.push(el.value)})}
  else if(a==="show")commit(c=>{c.show[el.dataset.w]=el.checked});
  else if(a==="ccode")commit(c=>{c.color.code=el.value;c.color.map={}});
  else if(a==="cmap")commit(c=>{c.color.map[el.dataset.v]=el.value});
  else if(a==="colsum")commit(c=>{c.colsum=el.checked});
  else if(a==="csort")commit(c=>{c.sort=el.value});
  else if(a==="sname")commit(c=>{const o=c.stages[id]||{};const t=el.value.trim();if(t)o.name=t;else delete o.name;c.stages[id]=o});
  else if(a==="scol")commit(c=>{const o=c.stages[id]||{};o.color=el.value;c.stages[id]=o});
  else if(a==="wip")commit(c=>{const n=parseInt(el.value,10);if(n>0)c.wip[id]=Math.min(n,9999);else delete c.wip[id]});
  else if(a==="shide")commit(c=>{c.hidden=el.checked?c.hidden.concat(id):c.hidden.filter(x=>x!==id)});
}

/* ---------- диалог закрытия сделки ---------- */
const CLOSE={};   /* id карточки → {kind,reason,comment,toName,to} до подтверждения переноса */
function askClose(a,ids){
  const lost=!/(WON|SUCCESS)$/.test(a.to);
  const d=PP.deals().find(x=>x.id===ids[0]);
  const what=ids.length>1?"Карточек: "+ids.length:(d?d.title:"Карточка #"+ids[0]);
  return loadCfg(a.f||PP.cur).then(()=>new Promise(res=>{
    const prev=document.activeElement,ov=document.createElement("div");ov.className="kset-ov";
    ov.innerHTML=`<div class="kset-dlg" role="dialog" aria-modal="true" aria-labelledby="kset-dt">
      <h3 id="kset-dt">${lost?"Закрытие сделки: проигрыш":"Закрытие сделки: успешно"}</h3>
      <div class="sub">${esc(what)} → ${esc(a.toName||a.to)}</div>
      ${lost?`<label id="kset-rl">Причина проигрыша *</label><div class="kset-ch" id="kset-rs" role="group" aria-labelledby="kset-rl">${reasons.map(r=>`<button type="button" aria-pressed="false" data-r="${esc(r)}">${esc(r)}</button>`).join("")}</div>`:""}
      <label for="kset-cm">Комментарий${lost?"":" (необязательно)"}</label><textarea id="kset-cm" maxlength="1000"></textarea>
      <div class="err" id="kset-er" role="alert"></div>
      <div class="act"><button class="b" id="kset-no" type="button">Отмена</button><button class="b btn-create" id="kset-ok" type="button">Подтвердить</button></div></div>`;
    document.body.appendChild(ov);
    const rs=ov.querySelector("#kset-rs");if(rs){rs.value="";rs.onclick=e=>{const t=e.target.closest("[data-r]");if(!t)return;rs.value=t.dataset.r;rs.querySelectorAll("[data-r]").forEach(x=>x.setAttribute("aria-pressed",x===t?"true":"false"));er.textContent=""}}
    const cm=ov.querySelector("#kset-cm"),er=ov.querySelector("#kset-er"),ok=ov.querySelector("#kset-ok"),no=ov.querySelector("#kset-no");
    let done=false;
    const fin=v=>{if(done)return;done=true;document.removeEventListener("keydown",key,true);ov.remove();try{prev&&prev.focus&&prev.focus()}catch(x){}res(v)};
    function key(e){
      if(e.key==="Escape"){e.stopPropagation();e.preventDefault();fin(false);return}
      if(e.key==="Tab"){const f=[...ov.querySelectorAll("textarea,button:not(:disabled)")];if(!f.length)return;
        const i=f.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&(i===f.length-1||i<0)){e.preventDefault();f[0].focus()}}}
    document.addEventListener("keydown",key,true);
    no.onclick=()=>fin(false);
    ok.onclick=()=>{
      const reason=rs?rs.value:"",comment=cm.value.trim();
      if(lost&&!reason){er.textContent="Выберите причину из списка.";const f0=rs.querySelector("button");if(f0)f0.focus();return}
      fin({kind:lost?"lost":"won",reason,comment,to:a.to,toName:a.toName||""});
    };
    (rs?rs.querySelector("button")||cm:cm).focus();
  }));
}
PP.addBeforeMove(async a=>{
  const ids=(Array.isArray(a.ids)&&a.ids.length?a.ids:[a.id]).map(String).filter(x=>x&&x!=="undefined");
  if(!a.final||!ids.length)return true;
  const all=PP.deals();
  const todo=ids.filter(id=>{const x=all.find(y=>y.id===id);return !(x&&x.stageId===a.to)});
  if(!todo.length)return true;
  const r=await askClose(a,todo);
  if(!r)return false;
  todo.forEach(id=>{CLOSE[id]=r});
  return true;
});
PP.on("move:done",async e=>{
  if(!e||!Array.isArray(e.ids))return;
  const jobs=[];
  e.ids.map(String).forEach(id=>{if(CLOSE[id]){jobs.push([id,CLOSE[id]]);delete CLOSE[id]}});
  for(const [id,r] of jobs){
    const lost=r.kind==="lost";
    const text="Закрытие: "+(lost?"причина «"+r.reason+"»":"успешно")+(r.toName?" ("+r.toName+")":"")+(r.comment?". Комментарий: "+r.comment:"");
    try{
      const n=await PP.api.post("/api/card/note",{f:e.f,deal:id,text});
      if(n&&n.error)throw new Error(n.error);
      const k=await PP.api.post("/api/kanbanset/closure",{f:e.f,deal:id,to:r.to,toName:r.toName,kind:r.kind,reason:r.reason,comment:r.comment});
      if(k&&k.error)throw new Error(k.error);
    }catch(x){PP.toast("Перенос выполнен, но запись о закрытии #"+id+" не сохранилась")}
  }
});

/* ---------- запуск ---------- */
PP.addTopButton({id:"kset-btn",slot:"menu",label:"Настроить канбан",onClick:()=>{if(PP.curView!=="kanban")PP.setView("kanban");panel()}});
PP.on("board:rendered",apply);
PP.on("board:loaded",()=>{VAL={};PEND={};apply();if(panelOpen())panel()});
PP.on("view:changed",()=>{const el=$("#kset-legend");if(el)el.hidden=PP.curView!=="kanban"});
/* неосуществлённые переносы не оставляют записей: чистим решения при следующей загрузке доски (после move:done они уже сняты) */
PP.on("board:loaded",()=>{Object.keys(CLOSE).forEach(k=>delete CLOSE[k])});
/* панель закрыта (#dr скрыт) — очищаем содержимое, чтобы она не всплывала сама */
new MutationObserver(()=>{const dr=$("#dr");if(dr&&dr.style.display!=="block"){const p=dr.querySelector(".kset-panel");if(p)$("#drc").innerHTML=""}}).observe($("#dr"),{attributes:true,attributeFilter:["style","class"]});
/* имена и скрытие стадий для других модулей (необязательно к использованию) */
PP.stageName=id=>{const c=CFG[PP.cur],o=c&&c.stages[id];if(o&&o.name)return o.name;const s=PP.B&&PP.B.stages.find(x=>x.id===id);return s?s.name:id};
PP.stageHidden=id=>{const c=CFG[PP.cur];return !!(c&&c.hidden.includes(id))};
if(PP.B)apply();
})();
