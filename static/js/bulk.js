/* Фича bulk: выбор карточек, панель групповых действий, отмена/повтор, контекстное меню, избранное, горячие клавиши. Всё локально. */
(function () {
  if (window.__bulkLoaded) return;
  window.__bulkLoaded = true;
  const MAXN = 200;
  const esc = s => PP.esc(s);
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  /* ---------- стили ---------- */
  const st = document.createElement("style");
  st.textContent = `
.card.bk-has{position:relative;user-select:none;-webkit-user-select:none}
.card.bk-has .t{padding-right:26px}.card.bk-has.bk-fav .t{padding-right:46px}
.bk-chk{position:absolute;top:10px;right:10px;width:18px;height:18px;border:1.5px solid #b4bec6;border-radius:50%;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transform:scale(.5);visibility:hidden;transition:transform .15s var(--ease),background-color .15s,border-color .15s,visibility 0s .15s;z-index:2;padding:0;font-size:11px;line-height:1;color:#fff;box-shadow:0 1px 2px rgba(31,41,55,.08)}
.card:hover .bk-chk,.card.bk-sel .bk-chk,body.bk-any .bk-chk,.bk-chk:focus-visible,.bk-chk-col{transform:scale(1);visibility:visible;transition-delay:0s}
@media(hover:none){.bk-chk{transform:scale(1);visibility:visible}}
.bk-chk:hover{border-color:var(--ic-accent,#8FC640)}
.bk-chk:focus-visible{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:2px}
.bk-chk[aria-checked=true],.bk-chk[aria-checked=mixed]{background:var(--ic-accent,#8FC640);border-color:var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E)}
.bk-chk[aria-checked=true]::after{content:"✓";font-weight:700}
.bk-chk[aria-checked=mixed]::after{content:"–";font-weight:700}
.bk-chk-col{position:static;flex:none;margin-top:0;margin-right:8px;border-color:rgba(255,255,255,.85);background:rgba(255,255,255,.3)}
.card.bk-sel{background:var(--ic-accent-soft,#EEF7D9);box-shadow:0 0 0 2px var(--ic-accent,#8FC640),var(--sh1)}
.bk-star{position:absolute;top:8px;right:34px;color:#d19a00;font-size:13px;line-height:1;cursor:pointer;z-index:2;background:none;border:0;padding:2px;border-radius:4px;transition:transform .15s var(--ease)}
.bk-star:hover{transform:scale(1.2)}.bk-star:focus-visible{outline:2px solid var(--ic-accent-hover,#7DB534)}
.bk-bar{position:fixed;left:0;right:0;bottom:16px;display:flex;justify-content:center;pointer-events:none;z-index:8}
.bk-bar-in{pointer-events:none;visibility:hidden;transform:translateY(calc(100% + 32px));transition:transform .2s var(--ease),visibility 0s .2s;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e3e8eb;border-radius:12px;padding:8px 8px 8px 10px;box-shadow:var(--sh3);max-width:calc(100vw - 16px);overflow-x:auto;scrollbar-width:none}
.bk-bar.on .bk-bar-in{pointer-events:auto;visibility:visible;transform:none;transition-delay:0s}
.bk-bar-in::-webkit-scrollbar{display:none}
.bk-bar-in .b{flex:none;white-space:nowrap;text-transform:none;letter-spacing:0;font-weight:500;font-size:12px;padding:7px 12px}
.bk-cnt{flex:none;display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:12px;white-space:nowrap;padding-right:10px;margin-right:2px;border-right:1px solid #e3e8eb;color:var(--ic-ink,#1A1D1E);height:28px}
.bk-cnt b{background:var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E);border-radius:999px;min-width:22px;height:22px;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.bk-cnt.bad{color:#c8372d}.bk-cnt.bad b{background:#c8372d}
.b.bk-danger{border-color:#e6b4ae;color:#c8372d}.b.bk-danger:hover{background:#fdf0ee;border-color:#c8372d}
.bk-bar-in .bk-sep{flex:none;width:1px;align-self:stretch;background:#e3e8eb;margin:2px 2px}
.bk-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:var(--ic-ink,#1A1D1E);color:#fff;border-radius:10px;padding:6px 6px 6px 16px;font-size:12px;z-index:60;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 16px);box-shadow:var(--sh2);animation:bkup .2s var(--ease)}
@keyframes bkup{from{transform:translate(-50%,10px)}to{transform:translateX(-50%)}}
.bk-toast span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bk-toast .b{flex:none;background:rgba(255,255,255,.12);border-color:transparent;color:#fff;padding:6px 12px;text-transform:none;letter-spacing:0;font-size:12px}
.bk-toast .b:hover{background:rgba(255,255,255,.22)}
.ctxmenu{min-width:200px;padding:6px}
.ctxmenu button{padding:8px 12px;font-size:12px;line-height:1.2;transition:background-color .15s}
.ctxmenu button:focus-visible{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:-2px}
.ctxmenu button.danger{margin-top:7px;position:relative}
.ctxmenu button.danger::before{content:"";position:absolute;left:6px;right:6px;top:-4px;height:1px;background:#e3e8eb}
.ctxmenu button.danger:hover{background:#fdf0ee}
.bk-ov{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:40;display:flex;align-items:center;justify-content:center;padding:12px}
.bk-md{background:#fff;border-radius:12px;width:min(460px,100%);max-height:88vh;overflow:auto;padding:22px 24px 20px;box-shadow:var(--sh3)}
.bk-md h3{margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ic-ink,#1A1D1E)}.bk-md .sub{color:var(--bx-mut);font-size:12px;margin-bottom:16px;line-height:1.4}
.bk-md select,.bk-md input,.bk-md textarea{width:100%;min-width:0;height:28px;border:1px solid var(--bx-line);background:#fff;border-radius:var(--r-sm);padding:0 10px;font:inherit;font-size:12px;margin-top:6px;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}
.bk-md textarea{resize:vertical;min-height:84px;height:auto;padding:8px 10px}
.bk-md select:focus,.bk-md input:focus,.bk-md textarea:focus{outline:2px solid var(--ic-accent-hover,#7DB534);outline-offset:-1px;border-color:var(--ic-accent,#8FC640)}
.bk-md label{display:block;font-size:12px;font-weight:600;color:var(--bx-mut);margin-top:12px}
.bk-md label:first-child{margin-top:0}
.bk-act{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:20px}
.bk-act .b{text-transform:none;letter-spacing:0;font-size:12px;font-weight:500;padding:7px 16px;min-height:34px}
.bk-act .btn-create{background:var(--ic-accent,#8FC640);border-color:var(--ic-accent,#8FC640);color:var(--ic-ink,#1A1D1E);font-weight:600}.bk-act .btn-create:hover{background:var(--ic-accent-hover,#7DB534);border-color:var(--ic-accent-hover,#7DB534)}
.bk-act .b.bk-danger{background:#c8372d;border-color:#c8372d;color:#fff;font-weight:600}.bk-act .b.bk-danger:hover{background:#b02a21}
.bk-st{display:flex;flex-direction:column;gap:4px;max-height:46vh;overflow:auto;padding:2px}
.bk-st .b{display:flex;align-items:center;gap:10px;text-align:left;width:100%;text-transform:none;letter-spacing:0;font-weight:500;font-size:12px;padding:8px 10px;border-color:transparent;box-shadow:none}
.bk-st .b:hover{background:var(--ic-hover);border-color:transparent}
.bk-st .b i{flex:none;width:10px;height:10px;border-radius:50%;background:var(--c,#c9cdc3)}
.bk-st .b.act{background:var(--ic-accent-soft,#EEF7D9);color:var(--ic-ink,#1A1D1E);border-color:var(--ic-accent,#8FC640);box-shadow:0 0 0 1px var(--ic-accent,#8FC640)}
.bk-st .b span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bk-st .b small{background:#eef2f4!important;color:var(--bx-mut)!important;margin:0}
.bk-st .b.act small{background:#fff!important;color:var(--ic-ink,#1A1D1E)!important}
.bk-sum{font-size:12px}.bk-sum ul{margin:8px 0 0;padding-left:18px;color:var(--bx-mut);font-size:12px;max-height:22vh;overflow:auto}
.bk-sum .ok{font-weight:600;display:flex;align-items:center;gap:8px}
.bk-sum .ok::before{content:"✓";display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#2e9e5b;color:#fff;font-size:12px}
.bk-sum>div+div{margin-top:6px}
.bk-keys{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:12px;align-items:center}
.bk-keys kbd{font:600 11px inherit;background:var(--bg2);border:1px solid var(--bx-line);border-bottom-width:2px;border-radius:var(--r-sm);padding:2px 8px;white-space:nowrap}
`;
  document.head.appendChild(st);

  /* ---------- состояние ---------- */
  let favs = new Set(), favOnly = false, hist = { undo: 0, redo: 0, undoLabel: "", redoLabel: "" };
  let anchor = null;                     // {s: колонка, id}
  let busy = false;
  let lastF = null;
  const favKey = id => PP.cur + ":" + id;
  const NET = "Нет связи с панелью";
  async function call(method, url, body) {
    try { return method === "get" ? await PP.api.get(url) : await PP.api.post(url, body); }
    catch (e) { console.error("bulk", url, e); return { error: NET, net: true }; }
  }
  async function refreshHist() { const h = await call("get", "/api/bulk/history"); if (h.hist) syncHist(h.hist); }

  /* ---------- окна (без alert/confirm) ---------- */
  let modal = null;
  function closeModal() { if (modal) { modal.remove(); modal = null; } }
  // opts: {title, sub, body(html), actions:[{label, primary, danger, keep, onClick(root)}], mount(root)}
  function dialog(o) {
    closeModal();
    const ov = document.createElement("div");
    ov.className = "bk-ov";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.innerHTML = `<div class="bk-md"><h3>${esc(o.title || "")}</h3>${o.sub ? `<div class="sub">${esc(o.sub)}</div>` : ""}<div class="bk-body">${o.body || ""}</div><div class="bk-act"></div></div>`;
    const bar = $(".bk-act", ov);
    (o.actions || []).forEach(a => {
      const b = document.createElement("button");
      b.className = "b" + (a.primary ? " btn-create" : "") + (a.danger ? " bk-danger" : "");
      b.textContent = a.label;
      b.onclick = async () => { if (a.onClick) { const r = await a.onClick(ov); if (r === false || a.keep) return; } closeModal(); };
      bar.appendChild(b);
    });
    ov.addEventListener("mousedown", e => { if (e.target === ov) closeModal(); });
    ov.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.stopPropagation(); closeModal(); }
      if (e.key === "Tab") {
        const f = $$("button,select,input,textarea", ov).filter(x => !x.disabled);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    document.body.appendChild(ov);
    modal = ov;
    if (o.mount) o.mount(ov);
    const first = $("select,input,textarea", ov) || $(".bk-act .b:last-child", ov) || $("button", ov);
    if (first) first.focus();
    return ov;
  }
  const setActions = (ov, actions) => {
    const bar = $(".bk-act", ov);
    bar.innerHTML = "";
    actions.forEach(a => {
      const b = document.createElement("button");
      b.className = "b" + (a.primary ? " btn-create" : "") + (a.danger ? " bk-danger" : "");
      b.textContent = a.label;
      b.onclick = async () => { if (a.onClick) { const r = await a.onClick(ov); if (r === false) return; } closeModal(); };
      bar.appendChild(b);
    });
    const last = bar.lastElementChild;
    if (last) last.focus();
  };

  /* ---------- тост «Отменить» ---------- */
  let toastEl = null, toastT = null;
  function toast(text, withUndo) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastT);
    const e = document.createElement("div");
    e.className = "bk-toast";
    e.setAttribute("role", "status");
    e.innerHTML = `<span>${esc(text)}</span>`;
    if (withUndo) {
      const b = document.createElement("button");
      b.className = "b";
      b.textContent = withUndo === "redo" ? "Повторить" : "Отменить";
      b.onclick = () => { e.remove(); withUndo === "redo" ? doRedo() : doUndo(); };
      e.appendChild(b);
    }
    document.body.appendChild(e);
    toastEl = e;
    toastT = setTimeout(() => { e.remove(); if (toastEl === e) toastEl = null; }, 9000);
  }

  /* ---------- история ---------- */
  let undoBtn, redoBtn;
  function syncHist(h) {
    if (h) hist = h;
    if (undoBtn) {
      undoBtn.disabled = !hist.undo;
      undoBtn.title = hist.undo ? "Отменить: " + hist.undoLabel + " (Ctrl/Cmd+Z)" : "Нечего отменять";
      undoBtn.innerHTML = "Отменить" + (hist.undo ? ` <small>${hist.undo}</small>` : "");
    }
    if (redoBtn) {
      redoBtn.classList.toggle("hidden", !hist.redo);
      redoBtn.title = hist.redo ? "Повторить: " + hist.redoLabel + " (Ctrl/Cmd+Shift+Z)" : "";
    }
  }
  async function stepHist(kind) {
    if (busy) return;
    busy = true;
    try {
      const r = await call("post", "/api/bulk/" + kind, { f: PP.cur });
      if (r.hist) syncHist(r.hist);
      if (r.error) { PP.toast(r.error); return; }
      await PP.reload();
      const sk = (r.skipped || []).length;
      const base = (kind === "undo" ? "Отменено: " : "Повторено: ") + r.label;
      const back = kind === "undo" ? "redo" : "undo";
      if (sk) toast(`${base}. ${sk} ${sk === 1 ? "карточка изменена" : "карточек изменены"} позже, их не трогали`, back);
      else toast(base, back);
      if (sk && !(r.ids || []).length) PP.toast("Ничего не откатилось: все карточки изменены позже");
    } finally { busy = false; }
  }
  const doUndo = () => stepHist("undo");
  const doRedo = () => stepHist("redo");

  /* ---------- выбор карточек ---------- */
  const board = () => $("#board");
  const vis = c => c.offsetParent !== null && !c.closest(".kset-hide,.kset-c");
  const cardsOf = col => col.classList.contains("kset-hide") || col.classList.contains("kset-c") ? [] : $$(".card[data-id]", col).filter(vis).map(c => c.dataset.id);
  function chkEl(cls) {
    const c = document.createElement("span");
    c.className = "bk-chk" + (cls ? " " + cls : "");
    c.setAttribute("role", "checkbox");
    c.setAttribute("aria-checked", "false");
    c.tabIndex = 0;
    return c;
  }
  function decorate() {
    const b = board();
    if (!b) return;
    $$(".col", b).forEach(col => {
      const ch = $(".ch", col);
      if (ch && !$(".bk-chk-col", ch)) {
        const c = chkEl("bk-chk-col");
        c.setAttribute("aria-label", "Выбрать все карточки в колонке");
        c.title = "Выбрать все в колонке";
        ch.insertBefore(c, ch.firstChild);
      }
      $$(".card[data-id]", col).forEach(card => {
        if (!card.classList.contains("bk-has")) {
          card.classList.add("bk-has");
          const c = chkEl("");
          c.setAttribute("aria-label", "Выбрать карточку");
          card.insertBefore(c, card.firstChild);
        }
        const fav = favs.has(favKey(card.dataset.id));
        card.classList.toggle("bk-fav", fav);
        let s = $(".bk-star", card);
        if (fav && !s) {
          s = document.createElement("button");
          s.className = "bk-star";
          s.title = "В избранном. Нажмите, чтобы открепить";
          s.setAttribute("aria-label", "Открепить из избранного");
          s.textContent = "★";
          card.appendChild(s);
        } else if (!fav && s) s.remove();
      });
    });
    paint();
  }
  function paint() {
    const b = board();
    if (!b) return;
    document.body.classList.toggle("bk-any", PP.sel.ids.size > 0);
    $$(".col", b).forEach(col => {
      const ids = cardsOf(col);
      let n = 0;
      $$(".card[data-id]", col).forEach(card => {
        const on = PP.sel.has(card.dataset.id);
        if (on) n++;
        card.classList.toggle("bk-sel", on);
        const c = $(".bk-chk", card);
        if (c) c.setAttribute("aria-checked", on ? "true" : "false");
      });
      const cc = $(".bk-chk-col", col);
      if (cc) cc.setAttribute("aria-checked", !ids.length || !n ? "false" : n === ids.length ? "true" : "mixed");
    });
  }
  function pick(id, shift) {
    const card = $(`#board .card[data-id="${CSS.escape(id)}"]`);
    const col = card && card.closest(".col");
    const on = !PP.sel.has(id);
    if (shift && anchor && col && anchor.s === col.dataset.s && anchor.id !== id) {
      const ids = cardsOf(col), a = ids.indexOf(anchor.id), z = ids.indexOf(id);
      if (a >= 0 && z >= 0) {
        const part = ids.slice(Math.min(a, z), Math.max(a, z) + 1);
        const cur = new Set(PP.sel.list());
        part.forEach(x => on ? cur.add(x) : cur.delete(x));
        PP.sel.set([...cur]);
        anchor = { s: col.dataset.s, id };
        return;
      }
    }
    PP.sel.toggle(id, on);
    if (col) anchor = { s: col.dataset.s, id };
  }
  function colToggle(col) {
    const ids = cardsOf(col);
    if (!ids.length) return;
    const all = ids.every(i => PP.sel.has(i));
    const cur = new Set(PP.sel.list());
    ids.forEach(i => all ? cur.delete(i) : cur.add(i));
    PP.sel.set([...cur]);
  }
  function wireBoard() {
    const b = board();
    if (!b || b.__bk) return;
    b.__bk = true;
    b.addEventListener("click", e => {
      const star = e.target.closest(".bk-star");
      if (star) {
        e.stopPropagation(); e.preventDefault();
        setFav([star.closest(".card").dataset.id], false);
        return;
      }
      const chk = e.target.closest(".bk-chk");
      if (chk) {
        e.stopPropagation(); e.preventDefault();
        if (chk.classList.contains("bk-chk-col")) colToggle(chk.closest(".col"));
        else pick(chk.closest(".card").dataset.id, e.shiftKey);
        return;
      }
      const card = e.target.closest(".card[data-id]");
      if (card && (e.shiftKey || e.metaKey || e.ctrlKey)) {
        e.stopPropagation(); e.preventDefault();
        pick(card.dataset.id, e.shiftKey);
      }
    }, true);
    b.addEventListener("keydown", e => {
      const chk = e.target.closest && e.target.closest(".bk-chk");
      if (chk && (e.key === " " || e.key === "Enter")) {
        e.preventDefault(); e.stopPropagation();
        if (chk.classList.contains("bk-chk-col")) colToggle(chk.closest(".col"));
        else pick(chk.closest(".card").dataset.id, e.shiftKey);
      }
    }, true);
  }

  /* ---------- избранное ---------- */
  async function setFav(ids, on) {
    const r = await call("post", "/api/bulk/fav", { f: PP.cur, ids, on });
    if (r.error) { PP.toast(r.error); return; }
    favs = new Set(r.items);
    if (favOnly) PP.refilter(); else decorate();
    PP.toast(on ? "Закреплено в избранном" : "Откреплено");
  }

  /* ---------- нижняя панель ---------- */
  let bar, cnt;
  function buildBar() {
    bar = document.createElement("div");
    bar.className = "bk-bar";
    bar.innerHTML = `<div class="bk-bar-in" role="toolbar" aria-label="Групповые действия">
      <span class="bk-cnt" id="bk-cnt"></span>
      <button class="b" data-a="move">Перенести в стадию…</button>
      <button class="b" data-a="assign">Сменить ответственного</button>
      <button class="b" data-a="field">Задать поле…</button>
      <button class="b" data-a="note">Добавить заметку всем</button>
      <span class="bk-sep" aria-hidden="true"></span>
      <button class="b bk-danger" data-a="del">Удалить</button>
      <button class="b" data-a="clear">Снять выбор</button></div>`;
    document.body.appendChild(bar);
    cnt = $("#bk-cnt", bar);
    bar.addEventListener("click", e => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      const a = b.dataset.a;
      if (a === "clear") PP.sel.clear();
      else if (a === "move") moveDialog(PP.sel.list());
      else if (a === "assign") assignDialog(PP.sel.list());
      else if (a === "field") fieldDialog(PP.sel.list());
      else if (a === "note") noteDialog(PP.sel.list());
      else if (a === "del") deleteDialog(PP.sel.list());
    });
  }
  function syncBar() {
    const n = PP.sel.ids.size;
    bar.classList.toggle("on", n > 0);
    const over = n > MAXN;
    cnt.innerHTML = over ? `Выбрано <b>${n}</b> максимум ${MAXN} за раз` : `Выбрано <b>${n}</b>`;
    cnt.classList.toggle("bad", over);
    $$("[data-a]", bar).forEach(b => { if (b.dataset.a !== "clear") b.disabled = over; });
  }

  /* ---------- итог действия ---------- */
  function summary(r, verb) {
    const parts = [`<div class="ok">${esc(verb)}: ${r.done}${r.bounced ? ", вернул робот: " + r.bounced : ""}</div>`];
    if (r.skipped && r.skipped.length) parts.push(`<div>Пропущено: ${r.skipped.length} (${esc(r.skipped[0].reason)})</div>`);
    if (r.errors && r.errors.length) parts.push(`<div style="color:#c8372d">Ошибок: ${r.errors.length}</div><ul>${r.errors.slice(0, 30).map(x => `<li>#${esc(x.id)}: ${esc(x.error)}</li>`).join("")}</ul>`);
    const odd = (r.unknown || []).length + (r.invalid || []).length;
    if (odd) parts.push(`<div style="color:var(--ic-muted)">Не найдено или неверный номер: ${odd}</div>`);
    if (r.robots) parts.push(`<div style="color:var(--ic-muted)">Роботы изменили поля у карточек: ${r.robots}</div>`);
    return `<div class="bk-sum">${parts.join("")}</div>`;
  }
  // выполнить запрос, показать итог в окне; failedKeep — оставить выбранными карточки с ошибкой
  async function execute(ov, url, payload, verb, extraActions, fix) {
    $(".bk-body", ov).innerHTML = '<div class="bk-sum" aria-live="polite">Выполняю…</div>';
    setActions(ov, []);
    const r = await call("post", url, payload);
    if (r.hist) syncHist(r.hist);
    if (r.error && !r.done) {
      $(".bk-body", ov).innerHTML = summary(Object.assign({ done: 0 }, r), verb) + `<div class="bk-sum" style="color:#c8372d;margin-top:6px">${esc(r.error)}</div>`;
      setActions(ov, [{ label: "Закрыть", primary: true }]);
      return r;
    }
    const failed = new Set((r.errors || []).map(x => x.id).concat(r.unknown || []));
    PP.sel.set(PP.sel.list().filter(i => failed.has(i)));
    await PP.reload();
    if (fix) fix(r);
    $(".bk-body", ov).innerHTML = summary(r, verb);
    const acts = (extraActions ? extraActions(r) : []).concat([{ label: "Закрыть", primary: true }]);
    setActions(ov, acts);
    if (r.done || r.bounced) toast(r.bounced ? `${r.label}. Перенесено ${r.done}, вернул робот ${r.bounced}` : `${r.label}`, r.done ? "undo" : undefined);
    return r;
  }
  const noun = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "карточка" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? "карточки" : "карточек"}`;
  const nounAcc = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "карточку" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? "карточки" : "карточек"}`;
  const stageOf = id => { const d = PP.deals().find(x => x.id === id); return d ? d.stageId : null; };

  /* ---------- диалоги ---------- */
  async function moveDialog(ids) {
    if (!ids.length) return;
    let to = null;
    const stages = PP.B.stages;
    dialog({
      title: "Перенести в стадию", sub: noun(ids.length) + ". Роботы стадии отработают локально.",
      body: `<div class="bk-st">${stages.map(s => `<button class="b" data-s="${esc(s.id)}" style="--c:${esc(s.color || "#c9cdc3")}"><i></i><span>${esc(s.name)}</span><small>${s.deals.length}</small></button>`).join("")}</div>`,
      actions: [{ label: "Отмена" }, {
        label: "Перенести", primary: true, onClick: async ov => {
          if (!to) { PP.toast("Выберите стадию"); return false; }
          const name = (stages.find(s => s.id === to) || {}).name;
          if (!(await PP.canMove({ f: PP.cur, id: ids[0], ids, to, toName: name, final: PP.stageFinal(PP.cur, to) }))) return false;
          const f0 = PP.cur;
          const res = await execute(ov, "/api/bulk/move", { f: f0, ids, to }, "Перенесено", r => r.first && (r.first.trace || []).length ? [{
            label: "Показать роботов первой карточки", keep: true,
            onClick: () => { closeModal(); window.showTrace && window.showTrace({ final: r.first.final, trace: r.first.trace, changed: r.first.changed }); return false; }
          }] : [], r => {
            // робот мог вернуть карточку обратно: считаем по итоговой стадии после перечитывания
            const ok = (r.doneIds || []).filter(i => stageOf(i) === to);
            r.bounced = (r.doneIds || []).length - ok.length; r.done = ok.length; r.doneIds = ok;
          });
          if (res && res.done) PP.emit("move:done", { f: f0, ids: res.doneIds || ids, to, r: res });
          return false;
        }
      }],
      mount: ov => $(".bk-st", ov).addEventListener("click", e => {
        const b = e.target.closest("[data-s]");
        if (!b) return;
        to = b.dataset.s;
        $$(".bk-st .b", ov).forEach(x => x.classList.toggle("act", x === b));
      })
    });
  }
  let usersCache = null;
  async function users() {
    if (!usersCache) { const r = await call("get", "/api/users"); if (r.error) { PP.toast(r.error); return []; } usersCache = r.items || []; }
    return usersCache;
  }
  async function assignDialog(ids) {
    if (!ids.length) return;
    const us = await users();
    dialog({
      title: "Сменить ответственного", sub: noun(ids.length),
      body: us.length ? `<label>Ответственный<select id="bk-who"><option value="">— выберите —</option>${us.map(u => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("")}</select></label>` : '<div class="sub">Список сотрудников пуст.</div>',
      actions: [{ label: "Отмена" }, {
        label: "Назначить", primary: true, onClick: async ov => {
          const w = $("#bk-who", ov);
          if (!w || !w.value) { PP.toast("Выберите ответственного"); return false; }
          await execute(ov, "/api/bulk/assign", { f: PP.cur, ids, who: w.value }, "Назначено");
          return false;
        }
      }]
    });
  }
  async function fieldDialog(ids) {
    if (!ids.length) return;
    const sch = await call("get", "/api/schema?f=" + encodeURIComponent(PP.cur));
    if (sch.error) { PP.toast(sch.error); return; }
    const fl = (sch && sch.fields) || [];
    if (!fl.length) { dialog({ title: "Задать поле", body: '<div class="sub">Для этой воронки нет полей для массового изменения.</div>', actions: [{ label: "Закрыть", primary: true }] }); return; }
    const input = x => {
      if (!x) return "";
      if (x.kind === "select") return `<select id="bk-val"><option value="">— очистить —</option>${x.options.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("")}</select>`;
      if (x.kind === "number") return '<input id="bk-val" type="number" step="any">';
      if (x.kind === "date") return '<input id="bk-val" type="date">';
      return '<input id="bk-val" maxlength="500">';
    };
    dialog({
      title: "Задать поле", sub: noun(ids.length) + ". Значение запишется локально.",
      body: `<label>Поле<select id="bk-fld"><option value="">— выберите —</option>${fl.map(x => `<option value="${esc(x.code)}">${esc(x.label)}</option>`).join("")}</select></label><label>Значение<span id="bk-vw"></span></label>`,
      actions: [{ label: "Отмена" }, {
        label: "Применить", primary: true, onClick: async ov => {
          const code = $("#bk-fld", ov).value, v = $("#bk-val", ov);
          if (!code) { PP.toast("Выберите поле"); return false; }
          if (!v) return false;
          await execute(ov, "/api/bulk/field", { f: PP.cur, ids, code, value: v.value }, "Изменено");
          return false;
        }
      }],
      mount: ov => $("#bk-fld", ov).addEventListener("change", e => {
        $("#bk-vw", ov).innerHTML = input(fl.find(x => x.code === e.target.value));
      })
    });
  }
  function noteDialog(ids) {
    if (!ids.length) return;
    dialog({
      title: "Заметка всем выбранным", sub: noun(ids.length),
      body: '<label>Текст заметки<textarea id="bk-note" maxlength="2000"></textarea></label>',
      actions: [{ label: "Отмена" }, {
        label: "Добавить", primary: true, onClick: async ov => {
          const t = $("#bk-note", ov).value;
          if (!t.trim()) { PP.toast("Введите текст заметки"); $("#bk-note", ov).focus(); return false; }
          await execute(ov, "/api/bulk/note", { f: PP.cur, ids, text: t }, "Заметка добавлена");
          return false;
        }
      }]
    });
  }
  function deleteDialog(ids) {
    if (!ids.length) return;
    dialog({
      title: "Удалить " + nounAcc(ids.length) + "?", sub: "Карточки скроются только в этой панели, в Битриксе они останутся. Действие можно отменить.",
      body: "",
      actions: [{ label: "Отмена" }, {
        label: "Удалить", danger: true, onClick: async ov => {
          await execute(ov, "/api/bulk/delete", { f: PP.cur, ids }, "Удалено");
          return false;
        }
      }]
    });
  }
  async function dupRun(ids) {
    const r = await call("post", "/api/bulk/duplicate", { f: PP.cur, ids });
    if (r.hist) syncHist(r.hist);
    if (r.error && !r.done) { PP.toast(r.error); return; }
    await PP.reload();
    toast(`Создано копий: ${r.done}${(r.errors || []).length ? ", ошибок: " + r.errors.length : ""}`, "undo");
  }
  function keysDialog() {
    const k = [["Delete", "удалить выбранные"], ["Ctrl/Cmd + A", "выбрать все видимые"], ["Esc", "снять выбор"], ["N", "создать карточку"], ["/", "поиск в воронке"],
      ["Ctrl/Cmd + Z", "отменить действие"], ["Ctrl/Cmd + Shift + Z", "повторить"], ["Shift + клик", "диапазон в колонке"], ["Ctrl/Cmd + клик", "выбрать карточку"], ["?", "эта подсказка"]];
    dialog({ title: "Горячие клавиши", body: `<div class="bk-keys">${k.map(x => `<kbd>${esc(x[0])}</kbd><span>${esc(x[1])}</span>`).join("")}</div>`, actions: [{ label: "Закрыть", primary: true }] });
  }

  /* ---------- контекстное меню ---------- */
  const targets = card => (PP.sel.has(card.id) && PP.sel.ids.size > 1 ? PP.sel.list() : [card.id]).slice(0, MAXN + 1);
  PP.addContextItem({ label: "Открыть", onClick: c => window.openCard(c.f, c.id) });
  PP.addContextItem({ label: "Выбрать", when: c => !PP.sel.has(c.id), onClick: c => PP.sel.toggle(c.id, true) });
  PP.addContextItem({ label: "Снять выбор", when: c => PP.sel.has(c.id), onClick: c => PP.sel.toggle(c.id, false) });
  PP.addContextItem({ label: "Дублировать", onClick: c => dupRun(targets(c)) });
  PP.addContextItem({ label: "Перенести в…", onClick: c => moveDialog(targets(c)) });
  PP.addContextItem({ label: "Закрепить", when: c => !favs.has(favKey(c.id)), onClick: c => setFav(targets(c), true) });
  PP.addContextItem({ label: "Открепить", when: c => favs.has(favKey(c.id)), onClick: c => setFav(targets(c), false) });
  PP.addContextItem({ label: "Удалить", danger: true, onClick: c => deleteDialog(targets(c)) });

  /* ---------- шапка ---------- */
  const favBtn = PP.addTopButton({ id: "bk-fav", slot: "filter", label: "★ Избранные", onClick: () => {
    favOnly = !favOnly;
    favBtn.classList.toggle("act", favOnly);
    favBtn.setAttribute("aria-pressed", favOnly ? "true" : "false");
    PP.refilter();
  } });
  favBtn.setAttribute("aria-pressed", "false");
  favBtn.title = "Показать только закреплённые карточки";
  PP.addFilter(d => !favOnly || favs.has(favKey(d.id)));
  undoBtn = PP.addTopButton({ id: "bk-undo", slot: "menu", label: "Отменить", onClick: doUndo });
  redoBtn = PP.addTopButton({ id: "bk-redo", slot: "menu", label: "Повторить", onClick: doRedo });
  redoBtn.classList.add("hidden");

  /* ---------- клавиши ---------- */
  const typing = t => t && (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) || t.isContentEditable);
  const OVER = ".ctxmenu,.kset-ov,.cal-ov,.lv-pop,.bk-ov";
  const drOpen = () => { const d = $("#dr"); return !!d && d.style.display === "block"; };
  document.addEventListener("keydown", e => {
    if (e.defaultPrevented) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      if (document.activeElement !== document.body || document.querySelector(OVER)) return;
      if (PP.sel.ids.size) PP.sel.clear();
      return;
    }
    if (modal || document.querySelector(".bk-ov")) return;
    const t = e.target;
    if (mod && !e.altKey) {
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.code === "KeyZ") { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
      if (e.code === "KeyY") { e.preventDefault(); doRedo(); return; }
      if (e.code === "KeyA") {
        if (PP.curView !== "kanban" || document.querySelector(OVER)) return;
        if (drOpen() && !(t && t.closest && t.closest("#board"))) return;
        e.preventDefault();
        PP.sel.set($$("#board .card[data-id]").filter(vis).map(c => c.dataset.id));
      }
      return;
    }
    if (mod || e.altKey) return;
    if (typing(t) || document.querySelector(".kset-ov,.cal-ov,.bk-ov")) return;
    if (e.key === "Delete") { if (PP.sel.ids.size) { e.preventDefault(); deleteDialog(PP.sel.list()); } return; }
    if (e.key === "/") { const q = $("#q"); if (q) { e.preventDefault(); q.focus(); q.select(); } return; }
    if (e.key === "?") { e.preventDefault(); keysDialog(); return; }
    if (e.code === "KeyN") { if (PP.B) { e.preventDefault(); const n = $("#newc"); if (n) n.click(); } }
  });

  /* ---------- подключение к ядру ---------- */
  buildBar();
  PP.on("selection:changed", () => { paint(); syncBar(); });
  PP.on("board:rendered", () => { wireBoard(); decorate(); syncBar(); });
  PP.on("board:loaded", B => {
    if (lastF !== null && lastF !== B.id) { PP.sel.clear(); anchor = null; }
    lastF = B.id;
    refreshHist();
    const have = new Set(B.stages.flatMap(s => s.deals.map(d => d.id)));
    const keep = PP.sel.list().filter(i => have.has(i));
    if (keep.length !== PP.sel.ids.size) PP.sel.set(keep);
  });
  (async () => {
    const [f, h] = await Promise.all([call("get", "/api/bulk/favs"), call("get", "/api/bulk/history")]);
    favs = new Set(f.items || []);
    if (h.hist) syncHist(h.hist);
    if (PP.B) { lastF = PP.B.id; wireBoard(); decorate(); syncBar(); }
  })();
  syncHist();
  if (PP.B) { lastF = PP.B.id; wireBoard(); decorate(); syncBar(); }
})();
