/* Фича products: вкладки карточки «Товары», «Файлы», «Связи» + метки на канбане. Всё локально. */
(function () {
  "use strict";
  if (!window.PP) return;
  const esc = PP.esc;
  const q = encodeURIComponent;
  const css = document.createElement("style");
  css.textContent = `
.products-wrap{--pl:var(--ic-line,#E7E9E2);--pm:var(--bx-mut,var(--ic-muted));--pi:var(--ic-ink,#1A1D1E);display:flex;flex-direction:column;gap:12px;font-size:12px;color:var(--pi)}
.products-wrap *{box-sizing:border-box}
.products-wrap input,.products-wrap select{width:100%;min-width:0;height:28px;border:1px solid var(--pl);background:#fff;border-radius:var(--r-sm,6px);padding:0 9px;font-size:12px;font-family:inherit;color:var(--pi);transition:border-color .15s,box-shadow .15s}
.products-wrap input:hover,.products-wrap select:hover{border-color:#b9c3c9}
.products-wrap input:focus,.products-wrap select:focus{border-color:var(--ic-accent,#8FC640);box-shadow:0 0 0 3px var(--ic-accent-soft,#EEF7D9);outline:none}
.products-wrap input:focus-visible,.products-wrap select:focus-visible,.products-wrap button:focus-visible,.products-wrap a.b:focus-visible,.products-drop:focus-visible{outline:2px solid #1A1D1E;outline-offset:1px}
.products-wrap input[data-k=qty],.products-wrap input[data-k=price],.products-wrap input[data-k=disc]{text-align:right;font-variant-numeric:tabular-nums}
.products-wrap label{display:flex;flex-direction:column;gap:4px;color:var(--pm);font-size:11px;font-weight:600;min-width:0}
.products-list{display:flex;flex-direction:column;background:#fff;border:1px solid #e6ebee;border-radius:var(--r,8px);box-shadow:var(--sh1);overflow:hidden}
.products-line{padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #eef1f3;transition:background .15s}
.products-line:last-child{border-bottom:0}
.products-line:hover,.products-line:focus-within{background:var(--ic-hover,#F8F9F4)}
.products-r1{display:flex;gap:8px;align-items:center}
.products-r1 input{flex:1;font-weight:600}
.products-lt{flex:none;min-width:96px;text-align:right;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.products-acts{display:flex;gap:2px;flex:none}
.products-acts .b{width:28px;height:28px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:12px;text-transform:none;letter-spacing:0;border-color:transparent;background:transparent;box-shadow:none;color:var(--pm)}
.products-acts .b:hover{background:#eef2f4;color:var(--pi);border-color:transparent}
.products-acts .b[data-a=del]:hover{background:#fdecea;color:var(--bx-red,#c8372d)}
.products-acts .b svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.products-grid{display:grid;grid-template-columns:70px 72px minmax(80px,1fr) minmax(104px,1.2fr) minmax(86px,1fr);gap:8px;align-items:end}
.products-disc{display:flex;gap:4px}
.products-disc input{flex:1}
.products-disc .b{height:28px;width:32px;padding:0;text-transform:none;letter-spacing:0;flex:none}
.products-chk{flex-direction:row!important;align-items:center;gap:6px!important;font-size:11px!important;font-weight:500!important;color:var(--pi)!important;grid-column:1/-1;cursor:pointer}
#dr .products-wrap .products-chk input[type=checkbox]{width:16px;height:16px;flex:none;padding:0;accent-color:var(--ic-accent,#8FC640)}
#dr .products-wrap input[type=file]{width:auto}
#dr .products-wrap .products-disc input{width:auto;flex:1}
.products-hd{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600}
.products-hd em{font-style:normal;font-size:11px;color:var(--pm);background:var(--ic-bg,#F7F8F4);border:1px solid var(--pl);border-radius:9px;padding:0 7px}
.products-tot{align-self:flex-end;width:min(320px,100%);background:#fff;border:1px solid #e6ebee;border-radius:var(--r,8px);box-shadow:var(--sh1);padding:12px 14px;display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-variant-numeric:tabular-nums}
.products-tot span{color:var(--pm)}
.products-tot b{text-align:right;font-weight:600}
.products-tot .big{font-size:20px;font-weight:700;letter-spacing:0;color:var(--pi)}
.products-tot .tl{border-top:1px solid #eef1f3;padding-top:8px;color:var(--pi);font-weight:600;align-self:end}
.products-tot .tl+b{border-top:1px solid #eef1f3;padding-top:8px;line-height:1.1}
.products-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.products-bar .b,.products-wrap .b.sm{text-transform:none;letter-spacing:0}
.products-wrap .b.sm{padding:4px 10px;font-size:11px}
.products-st{color:var(--pm);font-size:11px;margin-left:auto}
.products-err{display:flex;align-items:center;gap:10px;color:var(--bx-red,#c8372d);font-size:11px;font-weight:600}
.products-errbox{padding:12px;border:1px solid #f1c9c5;background:#fdf1f0;border-radius:var(--r,8px)}
.products-errbox span{flex:1}
.products-empty{display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--pm);padding:26px 12px;border:1px dashed #cfd7dc;border-radius:var(--r,8px);text-align:center;background:rgba(255,255,255,.6)}
.products-empty svg{width:40px;height:40px;fill:none;stroke:#b5bfc7;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.products-load{color:var(--pm);padding:14px 0;background:linear-gradient(90deg,transparent 25%,#eef2f4 50%,transparent 75%);background-size:200% 100%;animation:pshim 1.2s linear infinite}
@keyframes pshim{from{background-position:200% 0}to{background-position:-200% 0}}
.products-ask{background:var(--ic-accent-soft,#EEF7D9);border:1px solid var(--ic-accent,#8FC640);border-radius:var(--r,8px);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.products-drop{display:flex;flex-direction:column;align-items:center;gap:4px;border:2px dashed #c3ccd2;border-radius:10px;padding:20px 12px;text-align:center;color:var(--pm);cursor:pointer;background:#fbfcfd;transition:border-color .18s,background .18s}
.products-drop svg{width:32px;height:28px;fill:none;stroke:#9aa7b0;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;transition:transform .18s var(--ease)}
.products-drop b{color:var(--pi);font-size:12px;font-weight:600}
.products-drop small{font-size:11px}
.products-drop.on,.products-drop:hover{border-color:var(--ic-accent,#8FC640);background:var(--ic-accent-soft,#EEF7D9)}
.products-drop.on svg,.products-drop:hover svg{transform:translateY(-2px);stroke:var(--ic-accent-hover,#7DB534)}
.products-rows{display:flex;flex-direction:column;gap:8px}
.products-row{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #e6ebee;border-radius:var(--r,8px);padding:8px 12px;box-shadow:var(--sh1);transition:box-shadow .18s var(--ease)}
.products-row:hover{box-shadow:var(--sh2)}
.products-th{width:40px;height:40px;border-radius:var(--r-sm,6px);background:var(--c,#8a8f94);flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;overflow:hidden;text-transform:none;letter-spacing:0;}
.products-th img{width:100%;height:100%;object-fit:cover}
.products-main{flex:1;min-width:0}
.products-main .n{font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.products-main .m{color:var(--pm);font-size:11px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.products-rb{display:flex;gap:6px;flex:none;flex-wrap:wrap;justify-content:flex-end}
.products-pill{display:inline-block;background:var(--ic-accent-soft,#EEF7D9);color:#4d7a14;border-radius:var(--r-sm,6px);padding:1px 8px;font-size:11px;font-weight:600;margin-right:6px;vertical-align:1px}
.products-stage{display:inline-block;background:#eef2f4;color:#3c4650;border-radius:var(--r-sm,6px);padding:0 7px;font-size:11px;font-weight:600;margin-right:4px}
.products-prog{height:6px;border-radius:99px;background:#e6ebee;overflow:hidden;margin-top:6px}.products-prog i{display:block;height:100%;background:var(--ic-accent,#8FC640);width:0;transition:width .2s}
.products-res{display:flex;flex-direction:column;gap:8px;max-height:260px;overflow:auto}
.products-find{display:flex;gap:8px;flex-wrap:nowrap}
.products-bd{display:flex;gap:8px;margin-top:5px;color:var(--ic-muted);font-size:11px;font-weight:600}
.products-bd span{display:inline-flex;align-items:center;gap:3px}
.products-bd svg{width:11px;height:11px}
#dr .products-wrap .products-hint{color:var(--pm);font-size:11px}
.products-ut{display:flex;align-items:center;gap:10px;background:#1A1D1E;color:#fff;border-radius:8px;padding:8px 8px 8px 16px;font-size:12px;box-shadow:var(--sh2)}
.products-ut .b{padding:4px 12px;font-size:11px;text-transform:none;letter-spacing:0;background:transparent;color:#fff;border-color:#5A645E}
.products-ut .b:hover{border-color:var(--ic-accent,#8FC640)}
.products-th{border-radius:8px}
.products-row:hover{border-color:var(--ic-accent,#8FC640)}
@media(max-width:480px){.products-grid{grid-template-columns:1fr 72px 1fr}.products-row{flex-wrap:wrap}.products-rb{width:100%;justify-content:flex-start}.products-lt{min-width:0}.products-find{flex-wrap:wrap}.products-tot{align-self:stretch;width:auto}}
`;
  document.head.appendChild(css);

  const ruMoney = n => (Number.isFinite(n) ? n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—") + " ₸";
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const num = s => { const v = parseFloat(String(s == null ? "" : s).replace(/\s| /g, "").replace(",", ".")); return Number.isFinite(v) ? v : NaN; };
  const VAT = { none: 0, "12": 0.12, "16": 0.16 };
  const rid = () => Math.random().toString(36).slice(2, 12);
  const bump = () => { sumCache = null; };
  const svg = (d, c) => `<svg viewBox="0 0 24 24" aria-hidden="true"${c ? ` class="${c}"` : ""}>${d}</svg>`;
  const EI = { box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>', file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>' };
  const emptyBox = (k, t) => `<div class="products-empty">${svg(EI[k])}<div>${t}</div></div>`;
  const errBox = t => `<div class="products-err products-errbox"><span>${esc(t)}</span><button class="b" data-retry>Повторить</button></div>`;
  const LOAD = '<div class="products-load">Загрузка…</div>';
  function undoToast(text, fn) { let h = document.getElementById("toasts"); if (!h) { h = document.createElement("div"); h.id = "toasts"; h.setAttribute("role", "status"); h.setAttribute("aria-live", "polite"); document.body.appendChild(h); }
    const e = document.createElement("div"); e.className = "toast products-ut"; e.innerHTML = '<span></span><button class="b" type="button">Отменить</button>'; e.firstChild.textContent = text; h.appendChild(e);
    const k = setTimeout(() => e.remove(), 6000);
    e.querySelector("button").onclick = async () => { clearTimeout(k); e.remove(); try { await fn(); } catch (x) { PP.toast("Не удалось отменить"); } }; }
  const tabCount = (id, label, n) => document.querySelectorAll('.ctabs button[data-t="' + id + '"]').forEach(b => { b.textContent = label + (n ? " · " + n : ""); });
  const card = ctx => ({ f: ctx.f, deal: ctx.id });

  /* ---------------- Товары ---------------- */
  function calcLine(it) {
    const qty = num(it.qty), price = num(it.price), disc = num(it.disc === "" ? 0 : it.disc);
    if (!(qty > 0) || !(price >= 0) || !(disc >= 0)) return null;
    const base = r2(qty * price);
    const d = it.disc_mode === "pct" ? r2(base * disc / 100) : r2(disc);
    const after = r2(base - d);
    const r = VAT[it.vat] || 0;
    if (!r) return { net: after, vat: 0, total: after };
    if (it.vat_incl) { const net = r2(after / (1 + r)); return { net, vat: r2(after - net), total: after }; }
    const vat = r2(after * r); return { net: after, vat, total: r2(after + vat) };
  }
  function calcAll(items) {
    let n = 0, v = 0, t = 0, bad = false;
    const lines = items.map(it => { const c = calcLine(it); if (!c) { bad = true; return null; } n += c.net; v += c.vat; t += c.total; return c; });
    return { lines, tot: { net: r2(n), vat: r2(v), total: r2(t) }, bad };
  }

  function renderProducts(host, ctx) {
    host.innerHTML = '<div class="products-wrap">' + LOAD + '</div>';
    const wrap = host.firstChild;
    let items = [], names = [], max = 200, ver = 0, timer = null, dirty = false, lastSaved = "", errMsg = "", asking = false;
    const live = () => host.isConnected && wrap.isConnected;

    const lineHtml = (it, i) => `<div class="products-line" data-i="${i}">
      <div class="products-r1"><input data-k="name" list="products-names" placeholder="Название товара или услуги" value="${esc(it.name)}" maxlength="200" aria-label="Название"><b class="products-lt" data-sum></b>
        <div class="products-acts"><button class="b" data-a="up" title="Выше" aria-label="Выше"${i === 0 ? " disabled" : ""}>${svg('<path d="M12 19V5M6 11l6-6 6 6"/>')}</button><button class="b" data-a="down" title="Ниже" aria-label="Ниже"${i === items.length - 1 ? " disabled" : ""}>${svg('<path d="M12 5v14M6 13l6 6 6-6"/>')}</button><button class="b" data-a="dup" title="Дублировать" aria-label="Дублировать">${svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>')}</button><button class="b" data-a="del" title="Удалить" aria-label="Удалить">${svg('<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>')}</button></div></div>
      <div class="products-grid"><label>Кол-во<input data-k="qty" inputmode="decimal" value="${esc(it.qty)}"></label>
        <label>Ед.<select data-k="unit">${[...new Set(["шт", "усл.", "м", "м²", "кг", "л", "час", "мес.", it.unit])].map(u => `<option${u === it.unit ? " selected" : ""}>${esc(u)}</option>`).join("")}</select></label>
        <label>Цена, ₸<input data-k="price" inputmode="decimal" value="${esc(it.price)}"></label>
        <label>Скидка<span class="products-disc"><input data-k="disc" inputmode="decimal" value="${esc(it.disc)}"><button class="b sm" data-a="mode" title="Переключить: проценты или сумма">${it.disc_mode === "pct" ? "%" : "₸"}</button></span></label>
        <label>НДС<select data-k="vat"><option value="none"${it.vat === "none" ? " selected" : ""}>Без НДС</option><option value="12"${it.vat === "12" ? " selected" : ""}>12%</option><option value="16"${it.vat === "16" ? " selected" : ""}>16%</option></select></label>
        <label class="products-chk"><input type="checkbox" data-k="vat_incl"${it.vat_incl ? " checked" : ""}${it.vat === "none" ? " disabled" : ""}> Цена включает НДС</label></div></div>`;

    function paintNums(server) {
      const c = server || calcAll(items);
      wrap.querySelectorAll(".products-line").forEach((el, i) => {
        const v = c.lines[i];
        el.querySelector("[data-sum]").textContent = v ? ruMoney(+v.total) : "—";
      });
      const t = c.tot, set = (k, v) => { const e = wrap.querySelector('[data-t="' + k + '"]'); if (e) e.textContent = ruMoney(+v); };
      set("net", t.net); set("vat", t.vat); set("total", t.total);
      tabCount("products", "Товары", items.length);
      const st = wrap.querySelector(".products-st");
      if (st) st.textContent = dirty ? "Сохраняется…" : (items.length ? "✓ Сохранено" : "");
    }
    function paintErr() { const e = wrap.querySelector(".products-err"); if (e) { e.textContent = errMsg; e.style.display = errMsg ? "" : "none"; } }

    function draw() {
      const rows = items.length ? `<div class="products-hd">Позиции <em>${items.length}</em></div><div class="products-list">${items.map(lineHtml).join("")}</div>` : emptyBox("box", "Товарных позиций пока нет.<br>Добавьте первую.");
      wrap.innerHTML = `<datalist id="products-names">${names.map(n => `<option value="${esc(n)}">`).join("")}</datalist>${rows}
        <div class="products-bar"><button class="b btn-create" data-a="add"${items.length >= max ? " disabled" : ""}>+ Добавить позицию</button><span class="products-st"></span></div>
        <div class="products-err" style="display:none" role="alert"></div>
        <div class="products-tot"><span>Итого без НДС</span><b data-t="net"></b><span>НДС</span><b data-t="vat"></b><span class="tl">Всего</span><b class="big" data-t="total"></b></div>
        <div class="products-bar"><button class="b" data-a="apply"${items.length ? "" : " disabled"} title="${items.length ? "Записать итог по товарам в сумму карточки (локально)" : "Нет товаров: сначала добавьте хотя бы одну позицию"}">Применить сумму к карточке</button></div>
        <div data-ask></div>`;
      paintNums(); paintErr(); if (asking) askUi();
    }
    function askUi() {
      const box = wrap.querySelector("[data-ask]"); if (!box) return;
      const c = calcAll(items);
      if (!asking) { box.innerHTML = ""; return; }
      if (c.bad) { box.innerHTML = '<div class="products-err">Исправьте значения в строках, затем применяйте сумму.</div>'; asking = false; return; }
      const cur = (PP.deals().find(d => d.id === ctx.id) || {}).sum;
      box.innerHTML = `<div class="products-ask"><div>Сумма карточки станет <b>${ruMoney(c.tot.total)}</b>${cur != null ? ` (сейчас ${ruMoney(+cur)})` : ""}. Правка только локальная, в Битрикс не пишется.</div>
        <div class="products-bar"><button class="b btn-create" data-a="apply-yes">Применить</button><button class="b" data-a="apply-no">Отмена</button></div></div>`;
      box.querySelector("[data-a=apply-yes]").focus();
    }

    async function save() {
      clearTimeout(timer);
      const my = ++ver, payload = items;
      let r;
      try { r = await PP.api.post("/api/products/save", { f: ctx.f, deal: ctx.id, items: payload }); }
      catch (e) { r = { error: "Нет связи, изменения не сохранены" }; }
      if (my !== ver || !live()) return;
      dirty = false;
      if (r.error) { errMsg = r.error; paintErr(); const st = wrap.querySelector(".products-st"); if (st) st.textContent = "Не сохранено"; return; }
      errMsg = ""; paintErr(); lastSaved = JSON.stringify(r.items); bump();
      r.items.forEach((x, i) => { if (items[i]) items[i].id = x.id; });
      paintNums(r); refreshBadges();
    }
    function changed() { dirty = true; errMsg = ""; paintErr(); paintNums(); clearTimeout(timer); timer = setTimeout(save, 450); }
    const flushNow = () => { if (dirty) save(); };

    wrap.addEventListener("input", e => {
      const el = e.target.closest("[data-k]"); if (!el) return;
      const it = items[+el.closest(".products-line").dataset.i]; if (!it) return;
      const k = el.dataset.k;
      it[k] = el.type === "checkbox" ? el.checked : el.value;
      if (k === "vat") { const cb = el.closest(".products-line").querySelector('[data-k="vat_incl"]'); cb.disabled = it.vat === "none"; if (cb.disabled) { cb.checked = false; it.vat_incl = false; } }
      changed();
    });
    wrap.addEventListener("click", async e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = b.dataset.a, ln = b.closest(".products-line"), i = ln ? +ln.dataset.i : -1;
      if (a === "add") {
        if (items.length >= max) return;
        items.push({ id: rid(), name: "", qty: "1", unit: "шт", price: "0", disc: "0", disc_mode: "pct", vat: "none", vat_incl: false });
        draw(); const inp = wrap.querySelectorAll('.products-line [data-k="name"]'); inp[inp.length - 1].focus(); dirty = true; paintNums();
        errMsg = "Заполните название новой позиции"; paintErr(); return;   // пустое имя сервер не примет, пока не заполнят
      }
      if (a === "del") { const gone = items.splice(i, 1)[0]; asking = false; draw(); changed();
        undoToast("Позиция удалена", () => { if (!live()) return; items.splice(Math.min(i, items.length), 0, gone); draw(); changed(); }); return; }
      if (a === "dup") { if (items.length >= max) { errMsg = "Не больше " + max + " позиций"; return paintErr(); } items.splice(i + 1, 0, { ...items[i], id: rid() }); draw(); return changed(); }
      if (a === "up" && i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); return changed(); }
      if (a === "down" && i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); return changed(); }
      if (a === "mode") { const it = items[i]; it.disc_mode = it.disc_mode === "pct" ? "sum" : "pct"; b.textContent = it.disc_mode === "pct" ? "%" : "₸"; return changed(); }
      if (a === "apply") { await (dirty ? save() : 0); if (!live()) return; asking = !errMsg; askUi(); return; }
      if (a === "apply-no") { asking = false; askUi(); return; }
      if (a === "apply-yes") {
        b.disabled = true;
        let r;
        try { r = await PP.api.post("/api/products/apply", { f: ctx.f, deal: ctx.id }); }
        catch (e) { r = { error: "Нет связи, сумма не применена" }; }
        if (!live()) return;
        asking = false; askUi();
        if (r.error) { errMsg = r.error; return paintErr(); }
        PP.toast("Сумма карточки: " + ruMoney(+r.total)); await PP.reload(); if (typeof openCard === "function") openCard(ctx.f, ctx.id);
      }
    });
    wrap.addEventListener("keydown", e => { if (e.key === "Escape" && asking) { e.stopPropagation(); asking = false; askUi(); } });
    wrap.addEventListener("focusout", () => setTimeout(flushNow, 0));

    const loadP = () => {
      wrap.innerHTML = LOAD;
      PP.api.get("/api/products/get?f=" + q(ctx.f) + "&deal=" + q(ctx.id)).then(r => {
        if (!live()) return;
        if (r.error) { wrap.innerHTML = errBox(r.error); return; }
        items = r.items; names = r.names || []; max = r.max || 200; lastSaved = JSON.stringify(items); draw();
      }).catch(() => { if (live()) wrap.innerHTML = errBox("Не удалось загрузить товары"); });
    };
    wrap.addEventListener("click", e => { if (e.target.closest("[data-retry]")) loadP(); });
    loadP();
  }

  /* ---------------- Файлы ---------------- */
  const MAXF = 5 * 1024 * 1024, CH = 500000, BADEXT = ["exe", "bat", "cmd", "com", "scr", "msi", "sh", "js", "mjs", "html", "htm", "xhtml", "svg", "ps1", "vbs", "jar", "php", "py", "dll", "lnk", "app", "pl", "rb", "hta", "reg", "apk", "dmg", "swf"];
  const fsize = n => n < 1024 ? n + " Б" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " КБ" : (n / 1048576).toFixed(1) + " МБ";
  const toB64 = blob => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1] || ""); fr.onerror = no; fr.readAsDataURL(blob); });

  const FEXT = { pdf: "#c8372d", doc: "#2067b0", docx: "#2067b0", xls: "#3f8f12", xlsx: "#3f8f12", csv: "#3f8f12", ppt: "#d98a2b", pptx: "#d98a2b", zip: "#8b5cc6", rar: "#8b5cc6", "7z": "#8b5cc6", txt: "#5A645E" };
  function renderFiles(host, ctx) {
    host.innerHTML = `<div class="products-wrap"><div class="products-drop" tabindex="0" role="button" aria-label="Добавить файл">${svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>')}<b>Перетащите файлы сюда или нажмите</b><small>до 5 МБ, не больше 30 файлов на карточку</small></div>
      <input type="file" multiple hidden>
      <div class="products-err" style="display:none" role="alert"></div><div data-up></div><div data-list>${LOAD}</div></div>`;
    const wrap = host.firstChild, drop = wrap.querySelector(".products-drop"), inp = wrap.querySelector("input[type=file]"),
      err = wrap.querySelector(".products-err"), upBox = wrap.querySelector("[data-up]"), listBox = wrap.querySelector("[data-list]");
    let files = [], max = 30, ask = null;
    const live = () => host.isConnected && wrap.isConnected;
    const setErr = t => { err.textContent = t || ""; err.style.display = t ? "" : "none"; };

    function paint() {
      tabCount("pfiles", "Файлы", files.length);
      if (!files.length) { listBox.innerHTML = emptyBox("file", "Файлов пока нет.<br>Добавьте договор, счёт или фото."); return; }
      listBox.innerHTML = '<div class="products-rows">' + files.map(f => {
        const url = "/api/files/download?f=" + q(ctx.f) + "&deal=" + q(ctx.id) + "&id=" + q(f.id);
        const ext = (f.name.split(".").pop() || "").slice(0, 4);
        const th = f.img ? `<img src="${url}&inline=1" alt="" loading="lazy">` : esc(ext);
        return `<div class="products-row" data-id="${esc(f.id)}"><div class="products-th" style="--c:${FEXT[ext.toLowerCase()] || "#8a8f94"}">${th}</div><div class="products-main"><div class="n" title="${esc(f.name)}">${esc(f.name)}</div><div class="m">${fsize(f.size)} · ${esc(f.ts)}</div></div>
          <div class="products-rb"><a class="b sm" href="${url}" download="${esc(f.name)}">Скачать</a>${ask === f.id ? `<button class="b sm btn-create" data-a="del-yes">Удалить?</button><button class="b sm" data-a="del-no">Отмена</button>` : `<button class="b sm" data-a="del">Удалить</button>`}</div></div>`;
      }).join("") + "</div>";
    }
    async function load() {
      listBox.innerHTML = LOAD;
      let r;
      try { r = await PP.api.get("/api/files/list?f=" + q(ctx.f) + "&deal=" + q(ctx.id)); } catch (e) { r = { error: "Не удалось загрузить файлы" }; }
      if (!live()) return;
      if (r.error) { listBox.innerHTML = errBox(r.error); return; }
      files = r.items; max = r.max || 30; paint();
    }
    async function send(file) {
      const name = file.name || "file", ext = name.toLowerCase().split(".").slice(1);
      if (ext.some(x => BADEXT.includes(x))) return "«" + name + "»: этот тип файла запрещён";
      if (file.size === 0) return "«" + name + "»: файл пустой";
      if (file.size > MAXF) return "«" + name + "»: больше 5 МБ";
      if (files.length >= max) return "Не больше " + max + " файлов на карточку";
      const el = document.createElement("div"); el.className = "products-row"; el.style.marginBottom = "8px";
      el.innerHTML = `<div class="products-main"><div class="n">${esc(name)}</div><div class="products-prog"><i></i></div></div>`;
      upBox.appendChild(el);
      const total = Math.ceil(file.size / CH), upload = rid() + rid() + rid();
      try {
        for (let i = 0; i < total; i++) {
          const b64 = await toB64(file.slice(i * CH, (i + 1) * CH));
          const r = await PP.api.post("/api/files/chunk", { f: ctx.f, deal: ctx.id, upload, idx: i, total, name, data: b64 });
          if (r.error) { el.remove(); return "«" + name + "»: " + r.error; }
          el.querySelector("i").style.width = Math.round((i + 1) / total * 100) + "%";
          if (r.done) files.push(r.file);
        }
      } catch (e) { el.remove(); return "«" + name + "»: ошибка загрузки"; }
      el.remove(); return "";
    }
    async function addAll(list) {
      setErr(""); const errs = [];
      for (const f of Array.from(list)) { const e = await send(f); if (e) errs.push(e); }
      if (!live()) return;
      bump(); paint(); refreshBadges(); setErr(errs.join("; "));
    }
        drop.onclick = () => inp.click();
    drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
    inp.onchange = () => { const l = Array.from(inp.files); inp.value = ""; addAll(l); };
    ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("on"); }));
    ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("on"); }));
    drop.addEventListener("drop", e => { if (e.dataTransfer && e.dataTransfer.files.length) addAll(e.dataTransfer.files); });
    listBox.addEventListener("click", async e => {
      if (e.target.closest("[data-retry]")) return load();
      const b = e.target.closest("[data-a]"); if (!b) return;
      const id = b.closest(".products-row").dataset.id;
      if (b.dataset.a === "del") { ask = id; return paint(); }
      if (b.dataset.a === "del-no") { ask = null; return paint(); }
      if (b.dataset.a === "del-yes") {
        let r;
        try { r = await PP.api.post("/api/files/delete", { f: ctx.f, deal: ctx.id, id }); } catch (e) { r = { error: "Нет связи, файл не удалён" }; }
        if (!live()) return;
        ask = null; if (r.error) setErr(r.error); else { files = files.filter(x => x.id !== id); bump(); refreshBadges(); }
        paint();
      }
    });
    load();
  }

  /* ---------------- Связи ---------------- */
  async function gotoCard(f, id) {
    PP.closeDrawer();
    if (f !== PP.cur && typeof window.open === "function") await window.open(f);
    if (typeof openCard === "function") openCard(f, id);
  }

  function renderLinks(host, ctx) {
    host.innerHTML = `<div class="products-wrap"><div class="products-err" style="display:none" role="alert"></div><div data-list>${LOAD}</div>
      <div><div class="products-hd" style="margin-bottom:8px">Связать с карточкой</div>
      <div class="products-find"><input data-q placeholder="Название, компания или номер (от 2 символов)" aria-label="Поиск карточки" style="flex:1"><select data-t style="width:140px;flex:none" aria-label="Тип связи"></select></div>
      <div class="products-res" data-res style="margin-top:8px"></div></div></div>`;
    const wrap = host.firstChild, listBox = wrap.querySelector("[data-list]"), res = wrap.querySelector("[data-res]"),
      qi = wrap.querySelector("[data-q]"), ts = wrap.querySelector("[data-t]"), err = wrap.querySelector(".products-err");
    let links = [], timer = null, seq = 0, found = [];
    const live = () => host.isConnected && wrap.isConnected;
    const setErr = t => { err.textContent = t || ""; err.style.display = t ? "" : "none"; };

    const meta = l => (l.ok ? (l.funnel ? esc(l.funnel) + " · " : "") + (l.stage ? `<span class="products-stage">${esc(l.stage)}</span>` : "") + (l.company ? esc(l.company) + " · " : "") + "#" + esc(l.id) : "#" + esc(l.id));
    function paint() {
      tabCount("plinks", "Связи", links.length);
      if (!links.length) { listBox.innerHTML = emptyBox("link", "Связанных карточек нет.<br>Найдите карточку ниже и свяжите."); return; }
      listBox.innerHTML = '<div class="products-rows">' + links.map((l, i) => `<div class="products-row" data-i="${i}">
        <div class="products-main"><div class="n" title="${esc(l.title)}"><span class="products-pill">${esc(l.label)}</span>${esc(l.title)}</div><div class="m">${meta(l)}</div></div>
        <div class="products-rb">${l.ok ? '<button class="b sm" data-a="open">Открыть</button>' : ""}<button class="b sm" data-a="del">Убрать</button></div></div>`).join("") + "</div>";
    }
    async function load() {
      let r;
      try { r = await PP.api.get("/api/links/list?f=" + q(ctx.f) + "&deal=" + q(ctx.id)); } catch (e) { r = { error: "Не удалось загрузить связи" }; }
      if (!live()) return;
      if (r.error) { listBox.innerHTML = errBox(r.error); return; }
      links = r.items; ts.innerHTML = r.types.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join(""); paint();
    }
    listBox.addEventListener("click", async e => {
      if (e.target.closest("[data-retry]")) { listBox.innerHTML = LOAD; return load(); }
      const b = e.target.closest("[data-a]"); if (!b) return;
      const l = links[+b.closest(".products-row").dataset.i];
      if (b.dataset.a === "open") return gotoCard(l.f, l.id);
      if (!l) return;
      let r;
      try { r = await PP.api.post("/api/links/delete", { f: ctx.f, deal: ctx.id, tf: l.f, tid: l.id }); } catch (e) { return live() && setErr("Нет связи, связь не убрана"); }
      if (!live()) return;
      if (r.error) return setErr(r.error);
      setErr(""); await load(); drawRes();
    });
    function drawRes() {
      const have = new Set(links.map(l => l.f + "|" + l.id));
      const rows = found.filter(x => !(x.f === ctx.f && x.id === ctx.id));
      if (qi.value.trim().length < 2) { res.innerHTML = ""; return; }
      res.innerHTML = rows.length ? rows.map((x, i) => `<div class="products-row" data-i="${i}"><div class="products-main"><div class="n" title="${esc(x.title)}">${esc(x.title)}</div><div class="m">${esc(x.funnel)} · <span class="products-stage">${esc(x.stage)}</span>${x.company ? esc(x.company) + " · " : ""}#${esc(x.id)}</div></div>
        <div class="products-rb"><button class="b sm" data-a="link">${have.has(x.f + "|" + x.id) ? "Изменить тип" : "Связать"}</button></div></div>`).join("") : '<div class="products-empty">Ничего не найдено</div>';
      res._rows = rows;
    }
    res.addEventListener("click", async e => {
      const b = e.target.closest("[data-a=link]"); if (!b) return;
      const x = res._rows[+b.closest(".products-row").dataset.i];
      b.disabled = true;
      let r;
      try { r = await PP.api.post("/api/links/add", { f: ctx.f, deal: ctx.id, tf: x.f, tid: x.id, type: ts.value }); } catch (e) { r = { error: "Нет связи, связь не добавлена" }; }
      if (!live()) return;
      if (r.error) { b.disabled = false; return setErr(r.error); }
      setErr(""); await load(); drawRes(); PP.toast("Связь добавлена");
    });
    qi.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const v = qi.value.trim(), my = ++seq;
        if (v.length < 2) { found = []; return drawRes(); }
        let r;
        try { r = await PP.api.get("/api/search?q=" + q(v)); } catch (e) { return; }
        if (my !== seq || !live()) return;
        found = r.items || []; drawRes();
      }, 250);
    });
    load();
  }

  /* ---------------- Метки на канбане ---------------- */
  let sumCache = null, badgeSeq = 0;
  const CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/></svg>';
  async function paintBadges() {
    const f = PP.cur, my = ++badgeSeq;
    if (!f || !document.querySelector("#board .card[data-id]")) return;
    if (!sumCache || sumCache.f !== f || Date.now() - sumCache.t > 20000) {
      const r = await PP.api.get("/api/products/summary?f=" + q(f));
      if (r.error) return;
      sumCache = { f, t: Date.now(), items: r.items || {} };
    }
    if (my !== badgeSeq || PP.cur !== f) return;
    document.querySelectorAll("#board .card[data-id]").forEach(c => {
      c.querySelectorAll(".products-bd").forEach(x => x.remove());
      const s = sumCache.items[c.dataset.id]; if (!s) return;
      const d = document.createElement("div"); d.className = "products-bd";
      d.innerHTML = (s.fl ? `<span title="Файлов: ${s.fl}">${CLIP}${s.fl}</span>` : "") + (s.p ? `<span title="Товарных позиций: ${s.p}">товаров ${s.p}</span>` : "");
      c.appendChild(d);
    });
  }
  function refreshBadges() { sumCache = null; paintBadges().catch(() => {}); }

  PP.addCardTab({ id: "products", label: "Товары", render: renderProducts });
  PP.addCardTab({ id: "pfiles", label: "Файлы", render: renderFiles });
  PP.addCardTab({ id: "plinks", label: "Связи", render: renderLinks });
  PP.on("card:open", ({ f, id }) => {
    const u = "?f=" + q(f) + "&deal=" + q(id), cur = () => !!document.querySelector('.ctabs button[data-t="products"]');
    [["/api/products/get", "products", "Товары"], ["/api/files/list", "pfiles", "Файлы"], ["/api/links/list", "plinks", "Связи"]].forEach(([url, tid, lb]) =>
      setTimeout(() => PP.api.get(url + u).then(r => { if (r && !r.error && cur()) tabCount(tid, lb, (r.items || []).length); }).catch(() => {}), 0));
  });
  PP.on("board:rendered", () => { paintBadges().catch(() => {}); });
  if (PP.B) paintBadges().catch(() => {});
})();
