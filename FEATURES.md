# Контракт расширений локальной панели «Процессы»

Панель = `app.py` (сервер на stdlib) + `static/index.html` (ядро фронта, объект `window.PP`) + модули.
**Новая фича = два новых файла, ядро (`app.py`, `static/index.html`) НЕ править:**
- `features/<имя>.py` — бэкенд: `def register(api, core):`
- `static/js/<имя>.js` — фронт: обычный скрипт, использует `PP`. Подключается автоматически (`/api/features`).
- Стили: добавляйте из JS (`<style>` с префиксом классов `<имя>-`), глобальные правила не переопределять.

Всё работает ЛОКАЛЬНО: в Битрикс и 1С ничего не пишем, наружу не ходим (только localhost), ssh не используем.

## Бэкенд (`features/<имя>.py`)
```python
def register(api, core):
    @api.get("/api/<имя>/что-то")      # GET, req.q — dict первых значений query, req.arg("x", "")
    def handler(req): return {"ok": True}           # dict → 200; (код, dict) → другой код
    @api.post("/api/<имя>/действие")   # POST, req.body — JSON-объект
    def h2(req): return (400, {"error": "текст"})
```
`core` — модуль app.py. Полезное: `core.snapshot()` (воронки/стадии/карточки/companies/users), `core.board(fid)`,
`core.card_detail(fid, deal_id)`, `core.card_fields`, `core.edit_card(fid, deal, {код: значение})`, `core.move(fid, deal, stage)`
(запускает роботов), `core.create_card(fid, stage, title, opp, who, fields)`, `core.add_note`, `core.search_cards`,
`core.load(path, default)`, `core.STATE`, `core._save_state(st)`, `core._lock`, `core.journal({...})`, `core.cached(path)`,
`core.fmt_val`, `core._field_catalog(fid)` → (items, labels, meta), `core.label_code(label)`, `core.card_schema(fid)`, `core.HERE`.
Своё состояние: `core.feat_load("имя", default)` / `core.feat_save("имя", obj)` (атомарно, `data/feat/имя.json`).
Состояние карточек: `core.load(core.STATE, {})` — ключи `moves`, `fields`, `notes`, `created`, `robot_keys`.
Идентификаторы воронок: `"33"`, `"69"`…; смарт-процессы `"sp<ID>_<категория>"` (напр. `sp71_159`).

## Фронт (`static/js/<имя>.js`) — `window.PP`
- `PP.cur` (id воронки), `PP.B` (доска: `{id,name,stages:[{id,name,color,count,deals:[{id,title,sum,company,who,month,created,moved,fields,movedLocal,isLocal}]}]}`), `PP.funnels`, `PP.FS` (фильтры), `PP.deals()` (плоский список с `stageId/stageName`), `PP.match(d)` (проходит ли карточка текущие фильтры), `PP.ctx()`.
- `PP.api.get(url)`, `PP.api.post(url, body)` → Promise<json> (при ошибке в json есть `error`), `PP.esc(s)`, `PP.fmt(n)` (деньги), `PP.toast(текст)`, `PP.reload()` (перечитать доску), `PP.openDrawer(html, mount?)`, `PP.closeDrawer()`.
- `PP.addTopButton({id,label,onClick,primary})` — кнопка в шапке.
- `PP.addView({id,label,render(host, ctx)})` — вид рядом с «Канбан» (host — пустой div; `render` вызывается заново при каждой перерисовке доски и смене фильтров).
- `PP.addCardTab({id,label,render(host, {f,id,d})})` — вкладка в карточке (`d` = ответ `/api/card`: title, fields, notes, stage, stages…).
- `PP.addContextItem({label,danger,when(card),onClick(card)})` — пункт контекстного меню карточки (`card={f,id,deal}`).
- `PP.sel` — общий выбор карточек: `ids`, `has(id)`, `toggle(id,on?)`, `set([...])`, `clear()`, `list()`; событие `selection:changed`.
- События `PP.on(имя, fn)`: `board:loaded`, `board:rendered` (после перерисовки канбана: DOM карточек `.card[data-id]` свежий), `card:open`, `view:changed`, `selection:changed`, `features:ready`. Модуль грузится ПОСЛЕ первой отрисовки, поэтому при старте проверяйте `if(PP.B)` и делайте начальную инициализацию сразу.
- DOM канбана: `#board > .col[data-s] > .cards > .card[data-id]`. Не ломайте существующие обработчики (перетаскивание, клик по карточке).

### Дополнительно в ядре
- `PP.addFilter(fn)`: `fn(deal)→bool`, подключается к `PP.match` (канбан и все виды); после смены условий вызвать `PP.refilter()`. `PP.setFilters({q,who,mon,co,min,max,sort,loc})` меняет штатные фильтры панели и перерисовывает.
- `PP.addBeforeMove(async ({f,id,to,toName,final}) => false|true)` — перехват переноса по стадиям (перетаскивание и кнопка «Перенести»); `false` отменяет. `final` — перенос в финальную стадию.
- Локальное «удаление»: `POST /api/card/delete {f,deal}` прячет карточку из всех видов, `POST /api/card/restore {deal}`, `GET /api/deleted`; в Битриксе карточка остаётся. Бэкенд: `core.delete_card(fid, deal)`, `core.restore_card(deal)`. Состояние: ключ `deleted` в `core.STATE`.
- Для чтения полного набора значений карточки: `core._field_catalog(fid)` → `(items, labels, meta)`, `items[deal_id][CODE]`; правки человека лежат в `core.load(core.STATE,{})["fields"][deal_id]`.
- Глобальные функции страницы: `openCard(f,id)` открывает карточку; `open(fid)` открывает воронку; `createDialog(stageId)` — форма создания.

## Вкус (обязательно)
Русский интерфейс. Светлая тема, шрифт Montserrat (уже подключён), палитра: ink `#1A1D1E`, зелёный `#8FC640`, бумага `#F6F7F2`, линии `#E7E9E2`, приглушённый текст `#5A645E`.
Плотно, одна сетка, всё влево, без шума. Действия — ТОЛЬКО кнопками-«таблетками» (`class="b"`, главная `b btn-create`), НИКОГДА подчёркнутыми ссылками вместо кнопок.
Есть пустые и ошибочные состояния, фокус виден, на ширине 375px ничего не ломается, нет `alert()`.

## Проверка
Свой экземпляр, чтобы не мешать другим: `PP_PORT=<ваш порт> PP_STATE=/tmp/pp_<имя>_state.json PP_JOURNAL=/tmp/pp_<имя>_journal.jsonl PP_FEATDIR=/tmp/pp_<имя>_feat python3 app.py`
(запускать в фоне, из папки панели; по окончании остановить свой процесс). Тестируйте `curl` и `node --check static/js/<имя>.js`. Браузер не обязателен.
Не создавайте и не меняйте файлы вне своих `features/<имя>.py`, `static/js/<имя>.js` и временных файлов в /tmp.

## Палитра IC (ядро, `static/index.html`)
Модули берут цвет только из CSS-переменных `:root`, свои hex для акцента/активного не заводят.
- `--ic-accent #8FC640` акцент и главная кнопка; `--ic-accent-hover #7DB534`; `--ic-accent-soft #EEF7D9` активное/выбранное (фон, с границей `--ic-accent`).
- `--ic-ink #1A1D1E` текст и тёмная кнопка; `--ic-line #E7E9E2` границы; `--ic-bg #F7F8F4` фон; `--ic-hover #F8F9F4` hover строк и кнопок; `--ic-muted #5A645E` приглушённый текст.
- Красный `--bx-red #C8372D`. Старые имена переопределены на IC: `--bx-blue`/`--bx-green` = акцент, `--bx-gdark` = hover, `--bx-link #4A7A12`, `--ic-green(-dark/-soft)`, `--focus` (зелёное кольцо). Цвета стадий (`--c`) остаются как в Битриксе.
- Белый текст на `--bx-blue` нечитаем (зелёный светлый): на акценте ставить `--ic-ink`.
- Кнопки: `.b` пилюля, `.b.sm`, `.btn-create` зелёная, `.b.dark`, `.b.danger`. Обычный регистр везде (ядро глобально отключает uppercase и letter-spacing).
- Утилиты ядра: `toastMsg(текст, {label, fn})`/`PP.toast`, `askConfirm({title,text,ok,danger})` (Promise<bool>), `menuAt(x,y,[{label,onClick,danger,color}])`, `copyNum(id)`, `openCard(f,id,{keep,tab,code})`. Подсказки: достаточно `title`, ядро показывает быстрый тултип.
- Карточка справа теперь оверлей (доска не сжимается), поля в режиме просмотра по секциям, правки копятся и сохраняются кнопкой «Сохранить» (Ctrl+Enter). Вкладки модулей: кнопки `.ctabs button[data-t=id]`, счётчик пишется в textContent как раньше.
- Горячие клавиши: Ctrl/Cmd+K палитра, `/` поиск, `N` создать, `1…9` вид, `?` справка. Хранится в localStorage: pp_f, pp_view, pp_drw, pp_sec, pp_recent, pp_tour.

## Карточка (ядро, как в Битрикс24)
Открытая карточка: центральное окно 92vw×92vh (`#dr:has(.dr-head)`), полоса стадий цветами колонок, вкладки, слева поля «подпись | значение» по секциям (кнопка «изменить» у раздела), справа лента: форма Дело/Комментарий + события из `/api/timeline` и открытые дела `/api/activities`. Сохранить: кнопка в шапке или Ctrl+Enter, Esc отменяет правки. Вкладки модулей рендерятся на всю ширину вместо двух колонок. Масштаб через `--fs 12px`, `--fs-s 11px`, `--h 20px`, `--btn-h 26px` в `:root`.
