"""Локальная панель «Процессы»: 7 воронок Битрикса досками по стадиям. Данные — слепок data/procs_snapshot.json (только чтение Битрикса).
Переносы стадий и пометки живут только в data/local_state.json и журнале data/local_journal.jsonl; в Битрикс ничего не пишется.
Запуск: python3 app.py  →  http://127.0.0.1:8890"""
import base64, json, math, os, re, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
SNAP = os.path.join(HERE, "data", "procs_snapshot.json")
STATE = os.environ.get("PP_STATE") or os.path.join(HERE, "data", "local_state.json")
JOURNAL = os.environ.get("PP_JOURNAL") or os.path.join(HERE, "data", "local_journal.jsonl")
FEATDIR = os.environ.get("PP_FEATDIR") or os.path.join(HERE, "data", "feat")
BPT = os.path.join(HERE, "data", "bpt_robots.json")
DEALF = os.path.join(HERE, "data", "deal_fields.json")
META = os.path.join(HERE, "data", "field_meta.json")
CARDF = os.path.join(HERE, "data", "card_fields.json")
STAGE_ROBOTS = os.path.join(HERE, "data", "stage_robots.json")
ROBOTS = os.path.join(HERE, "data", "procs_robots.json")
ROBOTS_DEAL = os.path.join(HERE, "data", "procs_robots_deal.json")
SP_TYPE = {"197": 1402, "195": 1400, "183": 1382, "173": 1364, "189": 1392, "119": 1232, "181": 1380, "177": 1372, "169": 1356, "163": 1344, "71": 1120, "93": 1170}
PORT = int(os.environ.get("PP_PORT", "8890"))
_lock = threading.Lock()



# Известные роботы и правила по реестру вики (agenty §5, pravila-deneg) на 21.11.2026; в Битриксе роботы стадий через REST не читаются.
KNOWN = {
    "33": ["Робот комиссий и согласования идёт от смарт-процесса «Запрос средств» (СП 1294): счёт попадает сюда, затем «Кредиторка» → «Стадия оплаты» → «Счёт оплачен».",
           "Командировки (СП 1344) и тендеры (СП 1372/1402) создают сделки в этой воронке."],
    "57": ["bp-521 «Доп. Работы»: выставление, НДС, к оплате по признаку НДС ИП из списка 109 (работает; расходится с решением 01.10)."],
    "69": ["bp-3773 «Подсчёт данных» (стадия C69:PREPARATION) выключен: суммы считает obzvon, функция calc_realizatsiya_amounts.",
           "БП «тариф × площадь» пересчитывает OPPORTUNITY без IS_MANUAL_OPPORTUNITY=Y.",
           "bp-713/719/733 пишут исполнителя, договор, факт.",
           "Счета в 1С создаёт сервис счетов (вебхук компании), стадия «Выставить счёт клиенту» — C69:UC_MLMLU7."],
    "49": ["Удержания с партнёров: «Подсчёт данных» → «Счёт выставлен» → «Партнёр оплатил»; воронку наполняет monthly-consulting и авансирование."],
    "79": ["Архив месяца: копия сделок 69 по месяцам; «Отразили ИП» = C79:EXECUTING, дальше сделки не двигаются."],
    "53": ["Оплата ФОТ: Согласование бухгалтера → руководителей → Казначей → Стадия оплаты → Заработная ведомость исполнена."],
    "81": ["bp-3459 и робот C81:PREPARATION создают сделку замечания; хук портала /complaint; аудит < 80 % открывает замечание."],
    "sp1120": ["Авансирование: вебхук робота СП 1120 /webhook/avansirovanie-smart (воронки 159 аванс и 495 КПН), cron 17-го, удержания в сделках 69/79."],
    "sp1372": ["Кнопка «Одобрить»: сделка уходит на «Кредиторку» воронки 33."],
    "sp1344": ["Командировки: счета создаются в воронке 33."],
    "sp1364": ["Робот bp-3459: создаёт отработку (сделку в воронке 81)."],
    "sp1382": ["Реестр договоров 1382: договор и ДС, код 1С; согласование договоров ведёт obzvon (СП 132)."],
}


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except (json.JSONDecodeError, UnicodeDecodeError):
        if path == STATE:                 # битый JSON состояния не затираем молча: откладываем под уникальным именем
            try:
                os.replace(path, "%s.bad.%d" % (path, int(time.time())))
            except OSError:
                pass
        return default



_cache = {}


def cached(path):
    if path not in _cache:
        v = load(path, {})
        if not v:
            return v                      # не запоминаем пустое: файл мог быть недописан
        _cache[path] = v
    return _cache[path]


def _money(v):
    """Число из значения сделки ('1 000', '12,5', '100|KZT'); нечисло, inf и nan → 0.0."""
    if v in (None, ""):
        return 0.0
    s = str(v).split("|")[0].replace(" ", "").replace("\u00a0", "").replace(",", ".")
    try:
        n = float(s)
    except ValueError:
        return 0.0
    return n if math.isfinite(n) else 0.0


STD = {"ID": "ID", "Ответственный": "ASSIGNED_BY_ID", "Наблюдатели": "OBSERVER_IDS"}


def label_code(label):
    if label in STD:
        return STD[label]
    inv = cached("inv")
    if not inv:
        for k, v in (cached(DEALF).get("labels") or {}).items():
            if v:
                inv.setdefault(v.strip(), k)
        _cache["inv"] = inv
    return inv.get(label.strip())


def fmt_val(code, v, users):
    if v in (None, "", [], "0", 0):
        return ""
    if code == "ASSIGNED_BY_ID" or code == "OBSERVER_IDS":
        vs = v if isinstance(v, list) else [v]
        return ", ".join(users.get(str(x), "#%s" % x) for x in vs)
    m = (cached(META).get("fields") or {}).get(code) or {}
    vs = v if isinstance(v, list) else [v]
    out = []
    for x in vs:
        if m.get("enum"):
            out.append(str(m["enum"].get(str(x), x)))
        elif m.get("iblock"):
            out.append(str((cached(META).get("elements") or {}).get(m["iblock"], {}).get(str(x), x)))
        elif m.get("type") == "money" or (isinstance(x, str) and re.fullmatch(r"-?\d+(?:\.\d+)?\|[A-Z]{3}", x)):
            n = str(x).split("|")[0]
            try:
                out.append("{:,.0f} ₸".format(float(n)).replace(",", " "))
            except Exception:
                out.append(str(x))
        elif isinstance(x, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T.*)?", x):
            out.append("%s.%s.%s" % (x[8:10], x[5:7], x[:4]))
        else:
            out.append(str(x))
    return ", ".join(o for o in out if o)


def card_fields(fid, deal_id, overlay, users):
    doc = dict((cached(DEALF).get("deals") or {}).get(deal_id) or {})
    doc.update(overlay or {})
    doc["ID"] = deal_id
    rows = []
    for label in (cached(CARDF).get(fid) or []):
        code = label_code(label)
        raw = doc.get(code) if code else None
        if isinstance(raw, dict) or (isinstance(raw, str) and raw.startswith("{'")):
            val = "файл"
        else:
            val = fmt_val(code, raw, users) if code else ""
            if val and (label.startswith(("Сумма", "Факт")) or "Изначальная" in label):
                try:
                    val = "{:,.0f} ₸".format(float(val.replace(" ", "").replace("₸", ""))).replace(",", " ")
                except Exception:
                    pass
        if val:
            rows.append({"label": label, "value": val[:80], "local": bool(overlay and code in overlay)})
    return rows


_SNAP_CACHE = {"mtime": None, "data": None}


def _snap_base():
    try:
        mt = os.path.getmtime(SNAP)
    except OSError:
        mt = None
    if _SNAP_CACHE["data"] is None or _SNAP_CACHE["mtime"] != mt:
        _SNAP_CACHE["data"] = load(SNAP, {"funnels": [], "companies": {}, "users": {}, "generated_at": ""})
        _SNAP_CACHE["mtime"] = mt
    return _SNAP_CACHE["data"]


def snapshot():
    snap = _snap_base()
    _st = load(STATE, {})
    created = _st.get("created") or []
    deleted = _st.get("deleted") or {}
    if created or deleted:
        import copy
        snap = copy.deepcopy(snap)
        if deleted:
            for _f in snap["funnels"]:
                for _s in _f["stages"]:
                    n0 = len(_s["deals"])
                    _s["deals"] = [d for d in _s["deals"] if d["ID"] not in deleted]
                    _s["count"] = max(0, _s.get("count", 0) - (n0 - len(_s["deals"])))
        for c in created:
            if c["ID"] in deleted:
                continue
            f = next((x for x in snap["funnels"] if x["id"] == c["f"]), None)
            s = next((x for x in f["stages"] if x["id"] == c["stage"]), None) if f else None
            if s is not None:
                s["deals"].insert(0, {"ID": c["ID"], "TITLE": c["TITLE"], "OPPORTUNITY": c.get("OPPORTUNITY", 0), "STAGE_ID": c["stage"],
                                      "COMPANY_ID": "", "ASSIGNED_BY_ID": c.get("ASSIGNED_BY_ID", ""), "DATE_CREATE": c.get("created", ""),
                                      "MOVED_TIME": c.get("created", ""), "_local": True})
                s["count"] = s.get("count", 0) + 1
    return snap


def board(fid):
    snap, st = snapshot(), load(STATE, {"moves": {}})
    ov = st.get("fields", {})
    f = next((x for x in snap["funnels"] if x["id"] == fid), None)
    if not f:
        return None
    moves = st["moves"]
    cols = [{"id": s["id"], "name": s["name"], "color": s["color"], "semantics": s["semantics"], "count": s["count"],
             "truncated": s["truncated"], "deals": []} for s in f["stages"]]
    by_id = {c["id"]: c for c in cols}
    for s in f["stages"]:
        for d in s["deals"]:
            target = moves.get(d["ID"], {}).get("to") or s["id"]
            c = by_id.get(target) or by_id[s["id"]]
            month = (d.get("UF_CRM_1711371065591") or "")[:7]
            if not month:  # запасной источник: «Предполагаемая дата оплаты»
                _pd = str(d.get("UF_CRM_1707146135461") or "")
                _m = re.match(r"(\d{4})-(\d{2})", _pd)
                _m2 = re.match(r"\d{2}\.(\d{2})\.(\d{4})", _pd)
                month = _m.group(1) + "-" + _m.group(2) if _m else (_m2.group(2) + "-" + _m2.group(1) if _m2 else "")
            c["deals"].append({
                "id": d["ID"], "title": (ov.get(d["ID"]) or {}).get("TITLE") or d["TITLE"],
                "sum": _money((ov.get(d["ID"]) or {}).get("OPPORTUNITY") or d.get("OPPORTUNITY")), "isLocal": bool(d.get("_local")),
                "company": snap["companies"].get(str(d.get("COMPANY_ID")), "") or (ov.get(d["ID"]) or {}).get("_COMPANY_TEXT", ""),
                "who": snap["users"].get(str((ov.get(d["ID"]) or {}).get("ASSIGNED_BY_ID") or d.get("ASSIGNED_BY_ID")), ""), "month": month,
                "created": (d.get("DATE_CREATE") or "")[:10], "moved": ((moves.get(d["ID"]) or {}).get("ts") or (d.get("MOVED_TIME") or "")[:10]),
                "fact": d.get("UF_CRM_1709622025399") or "", "toInvoice": d.get("UF_CRM_1746005933130") or "",
                "vat": d.get("UF_CRM_1746005943699") or "", "movedLocal": d["ID"] in moves,
                "from": s["id"], "fields": card_fields(fid, d["ID"], ov.get(d["ID"]), snap["users"]) if not fid.startswith("sp") else []})
    for c in cols:
        c["shown"] = len(c["deals"])
        c["sum"] = round(sum(x["sum"] for x in c["deals"]))
    return {"id": f["id"], "name": f["name"], "stages": cols, "generated_at": snap.get("generated_at", "")}




import re as _re
_STAGE_RE = _re.compile(r"(DT\d+_\d+:[A-Z0-9_]+|C\d+:[A-Z0-9_]+)")
_UF_RE = _re.compile(r"UF_CRM_(\d+)_\d+")


def _stage_names():
    names = {}
    for f in snapshot()["funnels"]:
        for s in f["stages"]:
            names[s["id"]] = "%s → %s" % (f["name"], s["name"])
    return names


def _fld(code, fields):
    return fields.get(code) or code


def _describe(step, names, fields=None):
    fields = fields or {}
    t, p, title = step["type"], step["props"], step["title"] or step["type"]
    if t == "CrmChangeStatus":
        st = p.get("TargetStatus", "")
        return "Сменить стадию на «%s»" % names.get(st, st)
    if t == "IfElseBranch":
        c = p.get("fieldcondition") or p.get("propertyvariablecondition") or ""
        if not c:
            return "Иначе"
        trip = _re.findall(r"'?0'?: '([^']+)', '?1'?: '([^']+)', '?2'?: '([^']*)'", c)
        txt = " и ".join("%s %s %s" % (_fld(a, fields), o, _STAGE_RE.sub(lambda m: "«%s»" % names.get(m.group(1), m.group(1)), v)) for a, o, v in trip[:4])
        return "Если " + (txt or _STAGE_RE.sub(lambda m: "«%s»" % names.get(m.group(1), m.group(1)), c))
    if t == "SetField":
        flds = _re.findall(r"'((?:UF_CRM_\w+|[A-Z_]+))':", p.get("FieldValue", ""))
        return "Записать поля: " + ", ".join(_fld(x, fields) for x in flds[:8]) if flds else title
    if t == "WebHook":
        return "Исходящий вебхук (адрес скрыт)"
    if t == "GetListsDocument":
        m = _re.search(r"iblock_(\d+)", p.get("DocumentType", ""))
        return "Прочитать элемент списка %s" % (m.group(1) if m else "")
    return title


def bpt_for(fid):
    data = load(BPT, {})
    if not data:
        return []
    names = _stage_names()
    snap = snapshot()
    f = next((x for x in snap["funnels"] if x["id"] == fid), None)
    stage_ids = {s["id"] for s in f["stages"]} if f else set()
    sp_id = fid[2:].split("_")[0] if fid.startswith("sp") else None
    out = []
    for bp, d in data.items():
        blob = json.dumps(d["steps"], ensure_ascii=False)
        stages = set(_STAGE_RE.findall(blob))
        ufs = set(_UF_RE.findall(blob))
        hit = bool(stages & stage_ids) or (sp_id and sp_id in ufs) or (not sp_id and any(s.startswith("C%s:" % fid) for s in stages))
        if not hit:
            continue
        lines = []
        for s in d["steps"]:
            if s["type"] in ("SequentialWorkflow", "IfElse", "Parallel"):
                continue
            lines.append({"depth": s["depth"], "text": _describe(s, names, d.get("fields"))})
        out.append({"bp": bp, "touches": sorted({names.get(x, x) for x in stages})[:12], "name": next((s["title"] for s in d["steps"] if s["type"] == "SequentialWorkflow" and s["title"] and "template" not in s["title"].lower() and "процесс" not in s["title"].lower()), ""), "lines": lines})
    return out



def _flatten(nodes, depth=0, out=None):
    out = out if out is not None else []
    for n in nodes:
        out.append({"type": n["type"], "title": n["title"], "depth": depth, "props": {k: (v if isinstance(v, str) else str(v)) for k, v in n["props"].items()}})
        _flatten(n["children"], depth + 1, out)
    return out


def stage_robots_for(fid):
    data = cached(os.path.join(HERE, "data", "stage_robots_raw.json"))
    snap = snapshot()
    f = next((x for x in snap["funnels"] if x["id"] == fid), None)
    if not f or not data:
        return []
    names = _stage_names()
    out = []
    for s in f["stages"]:
        d = data.get(s["id"])
        if not d:
            continue
        steps = _flatten(d["tree"])
        real = [x for x in steps if x["type"] not in ("SequentialWorkflow", "IfElse", "Parallel", "Sequence", "EmptyBlock")]
        if not real:
            continue
        lines = [{"depth": x["depth"], "text": _describe(x, names, d.get("fields"))} for x in real]
        out.append({"stage": s["name"], "stageId": s["id"], "bp": d["bp"], "count": len(real), "lines": lines})
    return out


def logic(fid):
    def clean(t):
        keep = [{"type": s["type"].replace("Activity", ""), "title": s["title"], "depth": s["depth"]} for s in t["steps"]
                if s["type"] not in ("SequentialWorkflowActivity", "IfElseActivity", "IfElseBranchActivity", "ParallelActivity")]
        return {"name": t["name"], "auto": {"0": "вручную", "1": "при создании", "2": "при изменении", "3": "при создании и изменении"}.get(str(t["auto"]), "вручную"),
                "steps": keep}
    if fid.startswith("sp"):
        et = SP_TYPE.get(fid[2:].split("_")[0])
        items = load(ROBOTS, {}).get("sp_%s" % et) or []
        known = KNOWN.get("sp%s" % et, [])
        scope = "Шаблоны бизнес-процессов этого смарт-процесса"
    else:
        items = load(ROBOTS_DEAL, {}).get("deal_all") or []
        known = KNOWN.get(fid, [])
        scope = "Шаблоны бизнес-процессов сделок (общие для всех воронок сделок)"
    return {"scope": scope, "known": known, "templates": [clean(t) for t in items if isinstance(t, dict)],
            "exports": bpt_for(fid),
            "stages": stage_robots_for(fid),
            "note": "Роботы стадий через REST не читаются: показаны шаблоны БП, разобранные экспорты bp-*.bpt и известные правила из вики."}


def journal(rec):
    with _lock, open(JOURNAL, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")



import subprocess


_CALC_SRC = os.path.join(HERE, "calc_remote.py")


_CALC_SEM = threading.Semaphore(1)       # не более одного ssh-расчёта одновременно


def calc_remote(deals):
    """Серверная calc_realizatsiya_amounts (obzvon) только на расчёт: ничего не пишет ни в Битрикс, ни в 1С. {id: {fields, comment|error}}"""
    def fail(msg):
        return {k: {"error": msg} for k in deals}
    try:
        b64 = base64.b64encode(json.dumps(deals).encode()).decode()
        if len(b64) > 100000:
            return fail("слишком большой документ для расчёта")
        with _CALC_SEM:
            r = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "tammat@185.98.7.103",
                                "cd ~/obzvon-app && venv/bin/python3 - '%s'" % b64],
                               input=open(_CALC_SRC, encoding="utf-8").read(), capture_output=True, text=True, timeout=90)
        if r.returncode != 0 or "@@JSON@@" not in r.stdout:
            journal({"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "event": "calc_remote_fail", "rc": r.returncode, "stderr": (r.stderr or "")[:300]})
            return fail("расчёт на сервере не выполнился")
        return json.loads(r.stdout.split("@@JSON@@")[1])
    except subprocess.TimeoutExpired:
        return fail("таймаут расчёта на сервере")
    except Exception:      # noqa: BLE001
        return fail("ответ сервера расчёта не разобран")


HELD = ("UF_CRM_1742971726491", "UF_CRM_1793876181")      # удержан аванс / КПН


def apply_calc(deal_id, doc, changed, trace, labels):
    merged = dict(doc)
    merged.update(changed)
    res = calc_remote({deal_id: merged}).get(deal_id) or {}
    if res.get("error"):
        trace.append({"depth": 1, "kind": "unknown", "text": "Расчёт сумм: %s" % res["error"]})
        return
    if any(_money(merged.get(h)) != 0.0 for h in HELD):
        trace.append({"depth": 1, "kind": "unknown", "text": "⚠ В сделке удержан аванс или КПН: расчёт не применён (в боевом Битриксе пересчёт вернул бы удержанное)."})
        return
    new = {}
    for k, v in (res.get("fields") or {}).items():
        old = merged.get(k)
        a_, b_ = (_money(old) if _NUMLIKE(old) else None), (_money(v) if _NUMLIKE(v) else None)
        if a_ is not None and b_ is not None:
            if abs(a_ - b_) < 0.005:
                continue
        elif str(old) == str(v) or (v in ("", None) and old in ("", None)):
            continue
        new[k] = v
    changed.update(new)
    trace.append({"depth": 1, "kind": "ok", "text": "Суммы посчитаны функцией calc_realizatsiya_amounts (obzvon), локально:"})
    for k, v in new.items():
        trace.append({"depth": 2, "kind": "ok", "text": "«%s» = %s" % (labels.get(k) or k, v)})
    if not new:
        trace.append({"depth": 2, "kind": "skip", "text": "значения уже совпадают с расчётом"})
    if res.get("comment"):
        trace.append({"depth": 1, "kind": "effect", "text": "Комментарий расчёта: %s" % str(res["comment"])[:140]})


def _NUMLIKE(v):
    return v in (None, "") or bool(re.fullmatch(r"-?\d+(?:[.,]\d+)?(?:\|[A-Z]{3})?", str(v).strip().replace(" ", "")))


def _doc_for(fid, f, deal_id, st):
    """(документ для роботов, справочники, документ прочитан целиком?)"""
    if fid.startswith("sp"):
        rec = next((x for s in f["stages"] for x in s["deals"] if x["ID"] == deal_id), {})
        spf = cached(os.path.join(HERE, "data", "sp_fields.json"))
        et = {"197": "1402", "195": "1400", "183": "1382", "173": "1364", "189": "1392", "119": "1232", "181": "1380", "177": "1372",
              "169": "1356", "163": "1344", "71": "1120", "93": "1170"}.get(fid[2:].split("_")[0], "")
        full = ((spf.get("items") or {}).get(et) or {}).get(deal_id)
        doc = {"ID": deal_id, "TITLE": rec.get("TITLE", ""), "OPPORTUNITY": rec.get("OPPORTUNITY", 0), "COMPANY_ID": rec.get("COMPANY_ID", ""),
               "ASSIGNED_BY_ID": rec.get("ASSIGNED_BY_ID", "")}
        doc.update(full or {})
        dd = {"enums": spf.get("enums") or {}, "labels": spf.get("labels") or {}}
        complete = bool(full) or deal_id.startswith("L")
    else:
        dd = cached(DEALF)
        full = (dd.get("deals") or {}).get(deal_id)
        doc = dict(full or {})
        complete = bool(full) or deal_id.startswith("L")
    doc.update((st.get("fields") or {}).get(deal_id) or {})
    return doc, dd, complete


def move(fid, deal_id, to, calc=True):
    snap = snapshot()
    f = next((x for x in snap["funnels"] if x["id"] == fid), None)
    if not f or to not in {s["id"] for s in f["stages"]}:
        return {"error": "нет такой стадии"}
    st0 = load(STATE, {"moves": {}})
    origin = next((s["id"] for s in f["stages"] if any(d["ID"] == deal_id for d in s["deals"])), None)
    if not origin:
        return {"error": "сделки нет в слепке"}
    cur = (st0.get("moves") or {}).get(deal_id, {}).get("to") or origin
    stage_ids = {s["id"] for s in f["stages"]}
    trace, changed, final = [], {}, to
    if to != origin:
        # роботы и серверный расчёт считаем ВНЕ блокировки: ssh может идти десятки секунд
        try:
            import engine
            doc, dd, complete = _doc_for(fid, f, deal_id, st0)
            changed, final, trace = engine.simulate(doc, to, dd.get("enums") or {}, dd.get("labels") or {}, complete)
            _sn = {s["id"]: s["name"] for s in f["stages"]}
            for t in trace:
                t["text"] = re.sub(r"(DT\d+_\d+:[A-Z0-9_]+|C\d+:[A-Z0-9_]+)", lambda m: "«%s»" % _sn.get(m.group(1), m.group(1)), t["text"])
            if calc and fid == "69" and any(t["kind"] == "unknown" and ("Сумма" in t["text"] or "Факт" in t["text"]) for t in trace):
                apply_calc(deal_id, doc, changed, trace, dd.get("labels") or {})
        except Exception as e:       # noqa: BLE001
            trace = [{"depth": 0, "kind": "unknown", "text": "движок роботов: ошибка %s" % str(e)[:120]}]
    with _lock:
        st = load(STATE, {"moves": {}})
        if to == origin:
            st.setdefault("moves", {}).pop(deal_id, None)
            rk = (st.get("robot_keys") or {}).pop(deal_id, [])       # откатываем только то, что записали роботы; правки человека остаются
            flds = (st.get("fields") or {}).get(deal_id) or {}
            for k in rk:
                flds.pop(k, None)
            if not flds:
                (st.get("fields") or {}).pop(deal_id, None)
        else:
            st.setdefault("moves", {})[deal_id] = {"to": final if final in stage_ids else to, "ts": time.strftime("%Y-%m-%d")}
            if changed:
                st.setdefault("fields", {}).setdefault(deal_id, {}).update(changed)
                keys = set(st.setdefault("robot_keys", {}).get(deal_id, []))
                keys.update(changed)
                st["robot_keys"][deal_id] = sorted(keys)
        _save_state(st)
    journal({"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "event": "move_local", "funnel": fid, "deal": deal_id, "from": cur, "to": to,
             "final": final, "changed": list(changed), "note": "только локально, Битрикс не менялся"})
    labels = (cached(os.path.join(HERE, "data", "sp_fields.json")).get("labels") or {}) if fid.startswith("sp") else (cached(DEALF).get("labels") or {})
    return {"ok": True, "final": final, "trace": trace, "changed": {labels.get(k) or k: str(v)[:60] for k, v in changed.items()}}


# ---------------- рабочие операции панели (всё локально, в Битрикс не пишем) ----------------
def _save_state(st):
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False)
    os.replace(tmp, STATE)


def _find_card(fid, deal_id):
    snap = snapshot()
    f = next((x for x in snap["funnels"] if x["id"] == fid), None)
    if not f:
        return None, None, None, snap
    for s in f["stages"]:
        for d in s["deals"]:
            if d["ID"] == deal_id:
                return f, s, d, snap
    return f, None, None, snap


def _field_catalog(fid):
    if fid.startswith("sp"):
        spf = cached(os.path.join(HERE, "data", "sp_fields.json"))
        et = {"197": "1402", "195": "1400", "183": "1382", "173": "1364", "189": "1392", "119": "1232", "181": "1380", "177": "1372",
              "169": "1356", "163": "1344", "71": "1120", "93": "1170"}.get(fid[2:].split("_")[0], "")
        return (spf.get("items") or {}).get(et) or {}, spf.get("labels") or {}, spf.get("meta") or {}
    dd = cached(DEALF)
    return dd.get("deals") or {}, dd.get("labels") or {}, (cached(META).get("fields") or {})


def _apply_note_filters(notes, deal_id):
    for fn in NOTE_FILTERS:
        try:
            notes = fn(notes, deal_id)
        except Exception:      # noqa: BLE001
            traceback.print_exc()
    return notes


def card_detail(fid, deal_id):
    f, s, d, snap = _find_card(fid, deal_id)
    if not d:
        return None
    st = load(STATE, {})
    items, labels, meta = _field_catalog(fid)
    doc = dict(items.get(deal_id) or {})
    ov = (st.get("fields") or {}).get(deal_id) or {}
    doc.update(ov)
    doc.setdefault("TITLE", d["TITLE"])
    doc.setdefault("OPPORTUNITY", d.get("OPPORTUNITY", 0))
    doc.setdefault("ASSIGNED_BY_ID", d.get("ASSIGNED_BY_ID", ""))
    users = snap["users"]
    rows = []
    for code, raw in doc.items():
        if code.startswith("_") or raw in ("", None, [], {}, "0", 0) and code not in ov:
            continue
        label = labels.get(code) or code
        # служебное и пустое («<none>», utm, кто менял) в карточке не показываем, кроме полей, правленных здесь
        if code not in ov and (str(raw) == "<none>" or label == code and not code.startswith("UF_") or
                               re.match(r"^(LAST_|MOVED_BY|CREATED_BY|MODIFY_BY|rs_|UTM_|ORIGINATOR|ORIGIN_|ADDITIONAL_INFO|IS_|OPENED|CLOSED|PROBABILITY|TAX_VALUE|EXCH_RATE|LEAD_ID|SOURCE_|PRODUCT_ID|SEARCH_CONTENT|ACCOUNT_CURRENCY|OPPORTUNITY_ACCOUNT|CATEGORY_ID|STAGE_SEMANTIC)", code)):
            continue
        m = meta.get(code) or {}
        kind = "text"
        opts = None
        if code == "ASSIGNED_BY_ID":
            kind, opts = "select", [{"v": k, "t": v} for k, v in users.items()]
        elif m.get("enum"):
            kind, opts = "select", [{"v": k, "t": v} for k, v in m["enum"].items()]
        elif m.get("iblock"):
            els = (cached(META).get("elements") or {}).get(m["iblock"], {})
            if len(els) <= 300:
                kind, opts = "select", [{"v": k, "t": v} for k, v in els.items()]
            else:
                kind = "readonly"
        elif isinstance(raw, (dict, list)) or code in ("ID", "STAGE_ID", "CATEGORY_ID", "DATE_CREATE", "MOVED_TIME"):
            kind = "readonly"
        elif code in ("OPPORTUNITY",) or m.get("type") in ("double", "integer"):
            kind = "number"
        rows.append({"code": code, "label": label, "raw": raw if not isinstance(raw, (dict, list)) else str(raw)[:80],
                     "value": fmt_val(code, raw, users) if kind != "readonly" or code not in ("ID",) else str(raw),
                     "kind": kind, "options": opts, "local": code in ov})
    rows.sort(key=lambda r: (r["kind"] == "readonly", r["label"]))
    cur_stage = (st.get("moves") or {}).get(deal_id, {}).get("to") or s["id"]
    cur_name = next((x["name"] for x in f["stages"] if x["id"] == cur_stage), s["name"])
    return {"id": deal_id, "funnel": fid, "stage": cur_stage, "stageName": cur_name, "title": doc["TITLE"],
            "isLocal": bool(d.get("_local")), "fields": rows, "notes": _apply_note_filters((st.get("notes") or {}).get(deal_id, []), deal_id),
            "stages": [{"id": x["id"], "name": x["name"]} for x in f["stages"]]}


_STD_EDIT = {"TITLE", "OPPORTUNITY", "ASSIGNED_BY_ID", "_COMPANY_TEXT"}


def _clean_fields(fid, changes, limit=50):
    """Только известные поля, значения str/int/float ≤1000 знаков, не больше limit ключей. → (dict, error)"""
    if not isinstance(changes, dict):
        return None, "fields должен быть объектом"
    labels = _field_catalog(fid)[1]
    out = {}
    for k, v in changes.items():
        if not isinstance(k, str) or not re.fullmatch(r"[A-Za-z0-9_]{1,80}", k):
            continue
        if k not in labels and k not in _STD_EDIT:
            continue
        if isinstance(v, bool) or not isinstance(v, (str, int, float)):
            return None, "значение поля «%s» должно быть строкой или числом" % k
        if isinstance(v, float) and not math.isfinite(v):
            return None, "значение поля «%s» не число" % k
        if isinstance(v, str) and len(v) > 1000:
            return None, "значение поля «%s» длиннее 1000 знаков" % k
        out[k] = v
        if len(out) > limit:
            return None, "слишком много полей за раз (до %d)" % limit
    return out, None


def edit_card(fid, deal_id, changes):
    changes, err = _clean_fields(fid, changes)
    if err:
        return {"error": err}
    f, s, d, snap = _find_card(fid, deal_id)
    if not d:
        return {"error": "карточка не найдена"}
    with _lock:
        st = load(STATE, {"moves": {}})
        cur = st.setdefault("fields", {}).setdefault(deal_id, {})
        done = {}
        for k, v in (changes or {}).items():
            if not isinstance(k, str) or not k.replace("_", "").isalnum():
                continue
            if k == "OPPORTUNITY":
                if v in (None, "") or not _NUMLIKE(v):
                    return {"error": "сумма должна быть числом"}
                v = _money(v)
            cur[k] = v
            done[k] = v
            rk = (st.get("robot_keys") or {}).get(deal_id)
            if rk and k in rk:
                rk.remove(k)
        _save_state(st)
    labels = _field_catalog(fid)[1]
    journal({"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "event": "edit_local", "funnel": fid, "deal": deal_id,
             "changed": {labels.get(k) or k: str(v)[:60] for k, v in done.items()}, "note": "только локально"})
    return {"ok": True, "changed": list(done)}


def add_note(fid, deal_id, text):
    if not isinstance(text, str):
        return {"error": "text должен быть строкой"}
    text = text.strip()
    if not text:
        return {"error": "пустая заметка"}
    with _lock:
        st = load(STATE, {"moves": {}})
        if len(st.get("notes", {}).get(deal_id, [])) >= 200:
            return {"error": "у карточки уже 200 заметок"}
        st.setdefault("notes", {}).setdefault(deal_id, []).append({"ts": time.strftime("%Y-%m-%d %H:%M"), "text": text[:2000]})
        _save_state(st)
    journal({"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "event": "note_local", "funnel": fid, "deal": deal_id, "note": text[:80]})
    return {"ok": True}


def create_card(fid, stage, title, opportunity, who, fields):
    snap = snapshot()
    f = next((x for x in snap["funnels"] if x["id"] == fid), None)
    if not f or stage not in {s["id"] for s in f["stages"]}:
        return {"error": "нет такой воронки или стадии"}
    if not isinstance(title, str):
        return {"error": "название должно быть строкой"}
    title = title.strip()
    if not title:
        return {"error": "нужно название"}
    fields, ferr = _clean_fields(fid, fields or {})
    if ferr:
        return {"error": ferr}
    with _lock:
        st = load(STATE, {"moves": {}})
        if len(st.get("created") or []) >= 5000:
            return {"error": "создано слишком много локальных карточек (до 5000)"}
        n = int(st.get("next_local", 1))
        st["next_local"] = n + 1
        cid = "L%d" % n
        st.setdefault("created", []).append({"f": fid, "stage": stage, "ID": cid, "TITLE": title[:200],
                                              "OPPORTUNITY": _money(opportunity), "ASSIGNED_BY_ID": str(who or ""),
                                              "created": time.strftime("%Y-%m-%dT%H:%M:%S")})
        if fields:
            st.setdefault("fields", {})[cid] = {k: v for k, v in fields.items() if isinstance(k, str)}
        _save_state(st)
    journal({"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "event": "create_local", "funnel": fid, "deal": cid, "to": stage, "note": title[:80]})
    res = {"ok": True, "id": cid, "trace": [], "changed": {}, "final": stage}
    # роботы стадии создания: тот же движок, что и при переносе
    try:
        import engine
        items, labels, _ = _field_catalog(fid)
        doc = {"ID": cid, "TITLE": title, "OPPORTUNITY": _money(opportunity), "ASSIGNED_BY_ID": str(who or "")}
        doc.update((load(STATE, {}).get("fields") or {}).get(cid) or {})
        dd = cached(DEALF) if not fid.startswith("sp") else (cached(os.path.join(HERE, "data", "sp_fields.json")))
        changed, final, trace = engine.simulate(doc, stage, dd.get("enums") or {}, dd.get("labels") or {}, True)
        res.update({"trace": trace, "changed": {(labels.get(k) or k): str(v)[:60] for k, v in changed.items()}, "final": final})
        with _lock:
            st = load(STATE, {"moves": {}})
            if changed:
                st.setdefault("fields", {}).setdefault(cid, {}).update(changed)
            if final != stage:
                st.setdefault("moves", {})[cid] = {"to": final}
            _save_state(st)
    except Exception as e:      # noqa: BLE001
        res["trace"] = [{"depth": 0, "kind": "unknown", "text": "движок роботов: %s" % str(e)[:100]}]
    return res



_TECH_RE = re.compile(r"^(LAST_|MOVED_BY|CREATED_BY|MODIFY_BY|rs_|UTM_|ORIGINATOR|ORIGIN_|ADDITIONAL_INFO|IS_|OPENED|CLOSED|PROBABILITY|TAX_VALUE|EXCH_RATE|LEAD_ID|SOURCE_|PRODUCT_ID|SEARCH_CONTENT|ACCOUNT_CURRENCY|OPPORTUNITY_ACCOUNT|CATEGORY_ID|STAGE_SEMANTIC|STAGE_ID|ID$|TITLE$|OPPORTUNITY$|ASSIGNED_BY_ID$|DATE_|BEGINDATE|CLOSEDATE|MOVED_TIME|CURRENCY|CREATED_TIME|UPDATED_TIME|PREVIOUS_STAGE|COMPANY_ID|CONTACT|MYCOMPANY|XML_ID|WEBFORM|OBSERVER|PARENT_ID|LAST_)")


def card_schema(fid):
    """Поля для формы создания: сначала те, что показаны на карточке воронки в Битриксе, затем самые заполняемые по реальным сделкам воронки."""
    snap = snapshot()
    f = next((x for x in snap["funnels"] if x["id"] == fid), None)
    if not f:
        return None
    items, labels, meta = _field_catalog(fid)
    freq = {}
    n = 0
    for s in f["stages"]:
        for d in s["deals"][:150]:
            doc = items.get(d["ID"])
            if not doc:
                continue
            n += 1
            for code, raw in doc.items():
                if raw in ("", None, [], {}, "0", 0) or isinstance(raw, (dict, list)) or code.startswith("_") or _TECH_RE.match(code):
                    continue
                if not labels.get(code) or str(raw) == "<none>":
                    continue
                freq[code] = freq.get(code, 0) + 1
    layout = [label_code(l) for l in (cached(CARDF).get(fid) or [])]
    order = [c for c in layout if c and c in freq] + [c for c, _ in sorted(freq.items(), key=lambda kv: -kv[1]) if c not in layout]
    out = []
    for code in order[:60]:
        m = meta.get(code) or {}
        kind, opts = "text", None
        if m.get("enum"):
            kind, opts = "select", [{"v": k, "t": v} for k, v in m["enum"].items()]
        elif m.get("iblock"):
            els = (cached(META).get("elements") or {}).get(m["iblock"], {})
            if len(els) > 300:
                continue                       # слишком длинные списки (адреса, товары) в форме не показываем
            kind, opts = "select", [{"v": k, "t": v} for k, v in els.items()]
        elif m.get("type") in ("double", "integer", "money"):
            kind = "number"
        elif m.get("type") in ("date", "datetime"):
            kind = "date"
        out.append({"code": code, "label": labels.get(code), "kind": kind, "options": opts, "main": code in layout, "freq": freq[code]})
    return {"fields": out, "sample": n}


def delete_card(fid, deal_id):
    """Локально «удалить» карточку (спрятать из всех видов); в Битриксе она остаётся. Возвращается restore_card."""
    f, s, d, snap = _find_card(fid, deal_id)
    if not d:
        return {"error": "карточка не найдена"}
    with _lock:
        st = load(STATE, {"moves": {}})
        st.setdefault("deleted", {})[deal_id] = {"f": fid, "title": d["TITLE"], "stage": s["id"], "ts": time.strftime("%Y-%m-%d %H:%M:%S")}
        _save_state(st)
    journal({"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "event": "delete_local", "funnel": fid, "deal": deal_id, "note": "скрыта локально, в Битриксе осталась"})
    return {"ok": True}


def restore_card(deal_id):
    with _lock:
        st = load(STATE, {"moves": {}})
        rec = (st.get("deleted") or {}).pop(deal_id, None)
        if rec is None:
            return {"error": "карточка не удалялась"}
        _save_state(st)
    journal({"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "event": "restore_local", "funnel": rec.get("f"), "deal": deal_id})
    return {"ok": True}


def search_cards(q):
    q = (q or "").strip().lower()
    if len(q) < 2:
        return []
    snap = snapshot()
    st = load(STATE, {})
    ov, mv = st.get("fields") or {}, st.get("moves") or {}
    out = []
    for f in snap["funnels"]:
        names = {x["id"]: x["name"] for x in f["stages"]}
        for s in f["stages"]:
            for d in s["deals"]:
                co = snap["companies"].get(str(d.get("COMPANY_ID")), "")
                title = (ov.get(d["ID"]) or {}).get("TITLE") or d["TITLE"]
                if q in ("%s %s %s" % (d["ID"], title, co)).lower():
                    cur = (mv.get(d["ID"]) or {}).get("to") or s["id"]
                    out.append({"f": f["id"], "funnel": f["name"], "stage": names.get(cur, s["name"]), "id": d["ID"], "title": title, "company": co})
                    if len(out) >= 60:
                        return out
    return out


def changes_summary():
    st = load(STATE, {})
    return {"moves": st.get("moves") or {}, "fields": st.get("fields") or {}, "created": st.get("created") or [], "notes": st.get("notes") or {}, "deleted": st.get("deleted") or {}}


# ---------------- ядро расширений: модули features/*.py и static/js/*.js ----------------
import importlib.util, traceback, sys as _sys
_feat_lock = threading.Lock()


class Req:
    """Запрос для обработчика фичи: .q — первые значения query, .qs — списки, .body — JSON-объект (POST)."""
    def __init__(self, handler, qs, body):
        self.handler, self.qs, self.body = handler, qs, body or {}
        self.q = {k: v[0] for k, v in qs.items() if v}

    def arg(self, name, default=""):
        return self.q.get(name, default)


class Api:
    def __init__(self):
        self.routes = {"GET": {}, "POST": {}}

    def get(self, path):
        def deco(fn):
            self.routes["GET"][path] = fn
            return fn
        return deco

    def post(self, path):
        def deco(fn):
            self.routes["POST"][path] = fn
            return fn
        return deco


API = Api()
FEATURES_LOADED = []
RESET_HOOKS = []       # модули добавляют сюда функции очистки (например, стек отмены)
NOTE_FILTERS = []      # fn(notes: list, deal_id) -> list: модули правят заметки в card_detail (скрытые, изменённые)


def feat_update(name, fn, default=None):
    """Атомарный цикл «прочитал → изменил fn(obj) → записал» для состояния фичи."""
    os.makedirs(FEATDIR, exist_ok=True)
    path = os.path.join(FEATDIR, name + ".json")
    with _feat_lock:
        try:
            with open(path, encoding="utf-8") as f:
                obj = json.load(f)
        except Exception:
            obj = {} if default is None else default
        res = fn(obj)
        with open(path + ".tmp", "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
        os.replace(path + ".tmp", path)
    return res


def feat_load(name, default=None):
    """Состояние фичи: data/feat/<name>.json (или PP_FEATDIR). Только для локальных данных панели."""
    try:
        with open(os.path.join(FEATDIR, name + ".json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {} if default is None else default


def feat_save(name, obj):
    os.makedirs(FEATDIR, exist_ok=True)
    path = os.path.join(FEATDIR, name + ".json")
    with _feat_lock:
        with open(path + ".tmp", "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
        os.replace(path + ".tmp", path)


def load_features():
    d = os.path.join(HERE, "features")
    if not os.path.isdir(d):
        return
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".py") or fn.startswith("_"):
            continue
        try:
            spec = importlib.util.spec_from_file_location("ppfeat_" + fn[:-3], os.path.join(d, fn))
            m = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(m)
            m.register(API, _sys.modules[__name__])
            FEATURES_LOADED.append(fn)
        except Exception:      # noqa: BLE001
            print("feature %s не загружена:\n%s" % (fn, traceback.format_exc()), file=_sys.stderr)


_CT = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
       ".png": "image/png", ".svg": "image/svg+xml", ".html": "text/html; charset=utf-8"}


class H(BaseHTTPRequestHandler):
    timeout = 15           # медленный клиент не держит поток вечно
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _static(self, rel):
        root = os.path.realpath(os.path.join(HERE, "static"))
        p = os.path.realpath(os.path.join(root, rel))
        if not (p.startswith(os.path.join(root, "js") + os.sep) or p.startswith(os.path.join(root, "css") + os.sep)) or os.path.basename(p).startswith("_") or not os.path.isfile(p):
            return self._send(404, {"error": "not found"})
        return self._send(200, open(p, "rb").read(), _CT.get(os.path.splitext(p)[1].lower(), "application/octet-stream"))

    def _dispatch(self, fn, qs, body):
        try:
            r = fn(Req(self, qs, body))
            code = 200
            if isinstance(r, tuple):
                code, r = r
            return self._send(code, r if r is not None else {"ok": True})
        except Exception:      # noqa: BLE001
            print("ошибка обработчика %s:\n%s" % (self.path, traceback.format_exc()), file=_sys.stderr)
            return self._send(500, {"error": "внутренняя ошибка обработчика"})

    def do_GET(self):
        try:
            return self._do_get()
        except Exception:      # noqa: BLE001
            print("ошибка GET %s:\n%s" % (self.path, traceback.format_exc()), file=_sys.stderr)
            try:
                self._send(500, {"error": "внутренняя ошибка"})
            except Exception:      # noqa: BLE001
                pass

    def _do_get(self):
        if not self._guard():
            return
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/":
            return self._send(200, open(os.path.join(HERE, "static", "index.html"), "rb").read(), "text/html; charset=utf-8")
        if u.path == "/ic-logo.png":
            return self._send(200, open(os.path.join(HERE, "static", "ic-logo.png"), "rb").read(), "image/png")
        if u.path == "/api/funnels":
            s = snapshot()
            return self._send(200, {"generated_at": s.get("generated_at"),
                                    "funnels": [{"id": f["id"], "name": f["name"], "total": sum(x["count"] for x in f["stages"])} for f in s["funnels"]]})
        if u.path == "/api/board":
            b = board((q.get("f") or [""])[0])
            return self._send(200 if b else 404, b or {"error": "нет воронки"})
        if u.path == "/api/card":
            r = card_detail((q.get("f") or [""])[0], (q.get("deal") or [""])[0])
            return self._send(200 if r else 404, r or {"error": "карточка не найдена"})
        if u.path == "/api/schema":
            r = card_schema((q.get("f") or [""])[0])
            return self._send(200 if r else 404, r or {"error": "нет воронки"})
        if u.path == "/api/users":
            return self._send(200, {"items": [{"id": k, "name": v} for k, v in sorted(snapshot()["users"].items(), key=lambda kv: kv[1]) if (v or "").strip()]})
        if u.path == "/api/deleted":
            d = load(STATE, {}).get("deleted") or {}
            return self._send(200, {"items": [{"id": k, **v} for k, v in d.items()]})
        if u.path == "/api/search":
            return self._send(200, {"items": search_cards((q.get("q") or [""])[0])})
        if u.path == "/api/changes":
            return self._send(200, changes_summary())
        if u.path == "/api/logic":
            return self._send(200, logic((q.get("f") or [""])[0]))
        if u.path == "/api/journal":
            rows = []
            try:
                import collections
                with open(JOURNAL, encoding="utf-8") as _jf:
                    rows = [json.loads(l) for l in collections.deque(_jf, 200)]
            except Exception:
                pass
            return self._send(200, {"rows": rows[::-1]})
        if u.path == "/api/features":
            js = sorted(x for x in os.listdir(os.path.join(HERE, "static", "js")) if x.endswith(".js") and not x.startswith("_")) if os.path.isdir(os.path.join(HERE, "static", "js")) else []
            return self._send(200, {"scripts": ["/js/" + x for x in js], "features": FEATURES_LOADED})
        if u.path.startswith(("/js/", "/css/")):
            return self._static(u.path.lstrip("/"))
        fn = API.routes["GET"].get(u.path)
        if fn:
            return self._dispatch(fn, q, {})
        self._send(404, {"error": "not found"})

    def _guard(self, post=False):
        port = PORT
        if (self.headers.get("Host") or "") not in ("127.0.0.1:%d" % port, "localhost:%d" % port):
            self._send(403, {"error": "host"})
            return False
        org = self.headers.get("Origin")
        if org and org not in ("http://127.0.0.1:%d" % port, "http://localhost:%d" % port):
            self._send(403, {"error": "origin"})
            return False
        sfs = self.headers.get("Sec-Fetch-Site")
        if sfs and sfs not in ("same-origin", "none"):
            self._send(403, {"error": "cross-site"})
            return False
        if post and (self.headers.get("Content-Type") or "").split(";")[0].strip().lower() != "application/json":
            self._send(415, {"error": "нужен Content-Type: application/json"})
            return False
        return True

    def do_POST(self):
        try:
            return self._do_post()
        except Exception:      # noqa: BLE001
            print("ошибка POST %s:\n%s" % (self.path, traceback.format_exc()), file=_sys.stderr)
            try:
                self._send(500, {"error": "внутренняя ошибка"})
            except Exception:      # noqa: BLE001
                pass

    def _do_post(self):
        if not self._guard(post=True):
            return
        u = urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n < 0 or n > 1_000_000:
                raise ValueError
            p = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(p, dict):
                raise ValueError
        except Exception:      # noqa: BLE001
            return self._send(400, {"error": "тело запроса должно быть JSON-объектом"})
        if u.path == "/api/move":
            r = move(str(p.get("f")), str(p.get("deal")), str(p.get("to")))
            return self._send(200 if r.get("ok") else 400, r)
        if u.path == "/api/card/edit":
            r = edit_card(str(p.get("f")), str(p.get("deal")), p.get("fields") or {})
            return self._send(200 if r.get("ok") else 400, r)
        if u.path == "/api/card/delete":
            r = delete_card(str(p.get("f")), str(p.get("deal")))
            return self._send(200 if r.get("ok") else 400, r)
        if u.path == "/api/card/restore":
            r = restore_card(str(p.get("deal")))
            return self._send(200 if r.get("ok") else 400, r)
        if u.path == "/api/card/note":
            r = add_note(str(p.get("f")), str(p.get("deal")), p.get("text"))
            return self._send(200 if r.get("ok") else 400, r)
        if u.path == "/api/card/create":
            r = create_card(str(p.get("f")), str(p.get("stage")), p.get("title"), p.get("opportunity"), p.get("who"), p.get("fields") or {})
            return self._send(200 if r.get("ok") else 400, r)
        if u.path == "/api/reset":
            if p.get("confirm") != "RESET":
                return self._send(400, {"error": "для сброса нужен confirm=RESET"})
            with _lock:
                old = load(STATE, {})
                if os.path.exists(STATE):
                    import shutil
                    shutil.copy2(STATE, "%s.reset-%d" % (STATE, int(time.time())))     # копия до сброса
                _save_state({"moves": {}, "next_local": int(old.get("next_local", 1))})   # номера L не повторяются
            for hook in RESET_HOOKS:
                try:
                    hook()
                except Exception:      # noqa: BLE001
                    traceback.print_exc()
            journal({"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "event": "reset_local"})
            return self._send(200, {"ok": True})
        fn = API.routes["POST"].get(u.path)
        if fn:
            return self._dispatch(fn, parse_qs(u.query), p)
        self._send(404, {"error": "not found"})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    load_features()
    print("http://127.0.0.1:%d" % PORT, "модули:", FEATURES_LOADED)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
