"""Локальный движок роботов стадий. Исполняет дерево шагов шаблона (data/stage_robots_raw.json) на локальной копии сделки.
Ничего не пишет в Битрикс: поля и стадия меняются только в локальном наложении, внешние действия (вебхуки, сообщения,
создание элементов, запуск других БП) записываются в трассу как «выполнил бы».
Чего локально нет (формулы, значения шаблона, ответы вебхуков и списков) — UNKNOWN: поле не меняется, ветка не выбирается."""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = json.load(open(os.path.join(HERE, "data", "stage_robots_raw.json"), encoding="utf-8"))
try:
    META = json.load(open(os.path.join(HERE, "data", "field_meta.json"), encoding="utf-8"))
    SNAPU = json.load(open(os.path.join(HERE, "data", "procs_snapshot.json"), encoding="utf-8")).get("users", {})
except Exception:
    META, SNAPU = {"fields": {}, "elements": {}}, {}
try:
    _SP = json.load(open(os.path.join(HERE, "data", "sp_fields.json"), encoding="utf-8"))
    META["fields"].update(_SP.get("meta") or {})
except Exception:
    pass


def _load_lists():
    out = {}
    for fn in ("lists_full.json", "lists_a.json", "lists_b.json"):
        try:
            d = json.load(open(os.path.join(HERE, "data", fn), encoding="utf-8"))
            out.update(d)
        except Exception:
            pass
    return out


LISTS = _load_lists()


class _Unknown:
    def __repr__(self):
        return "UNKNOWN"

    def __bool__(self):
        return False


UNKNOWN = _Unknown()
WRAP = ("SequentialWorkflow", "Sequence", "Parallel", "EmptyBlock")
EXTERNAL = {"WebHook": "Исходящий вебхук", "ImMessage": "Сообщение в чат", "IMNotify": "Уведомление", "CrmTimelineCommentAdd": "Комментарий в таймлайн",
            "CrmCreateDynamic": "Создать элемент смарт-процесса", "CrmUpdateDynamic": "Изменить элемент смарт-процесса", "StartWorkflow": "Запустить другой БП",
            "StartScript": "Запустить скрипт", "Task2": "Создать задачу", "Approve": "Согласование", "RequestInformation": "Запрос информации",
            "UpdateListsDocument": "Изменить элемент списка", "CreateListsDocument": "Создать элемент списка", "CrmChangeRelations": "Изменить связи элемента",
            "RobotDelay": "Пауза робота", "CrmGenerateEntityDocument": "Сформировать документ", "DiskUpload": "Загрузить файл на диск", "DiskAddFolder": "Создать папку на диске",
            "CrmAddProductRow": "Добавить товарную позицию", "CrmRemoveProductRow": "Удалить товарную позицию", "CrmSetObserverField": "Наблюдатели сделки"}
GETTERS = {"CrmGetRelationsInfo", "CrmGetProductRow", "GetListsDocument", "GetUserInfo", "GetUser", "CrmGetDynamicInfo", "SetStateTitle"}


def _num(v):
    try:
        return float(str(v).replace(" ", "").replace(",", "."))
    except Exception:
        return None


class Ctx:
    def __init__(self, doc, enums, labels, complete=False):
        self.doc, self.enums, self.labels = dict(doc), enums, labels
        self.complete = complete       # документ прочитан целиком: отсутствие поля = поле пусто
        self.changed = {}
        self.trace = []
        self.stage = doc.get("STAGE_ID")
        self.queue = []
        self.vars = {}

    def get(self, field):
        if not re.fullmatch(r"[A-Za-z0-9_]+", field or ""):
            return UNKNOWN                       # модификаторы вида «Поле > user», пробелы и т.п.
        if field in ("ASSIGNED_BY_ID", "CREATED_BY_ID"):
            v = self.doc.get(field)
            return "user_%s" % v if v else UNKNOWN
        if field.endswith("_PRINTABLE"):
            base = field[:-10]
            v = self.doc.get(base, "" if base.startswith("UF_") else UNKNOWN)
            if v in ("", None) or v is UNKNOWN:
                return v
            m = (META.get("fields") or {}).get(base) or {}
            vs = v if isinstance(v, list) else [v]
            out = []
            for x in vs:
                if m.get("enum"):
                    lab = m["enum"].get(str(x))
                    if lab is None:
                        return UNKNOWN            # название значения списка неизвестно: подставлять номер нельзя
                    out.append(str(lab))
                elif m.get("iblock"):
                    lab = (META.get("elements") or {}).get(m["iblock"], {}).get(str(x))
                    if lab is None:
                        return UNKNOWN
                    out.append(str(lab))
                elif base in ("ASSIGNED_BY_ID", "CREATED_BY_ID"):
                    out.append(SNAPU.get(str(x), str(x)))
                else:
                    out.append(_datestr(x) if isinstance(x, str) else str(x))
            return ", ".join(out)
        known = field in self.doc or (self.complete and field.startswith(("UF_", "OPPORTUNITY", "TITLE", "STAGE", "COMPANY", "CATEGORY")))
        v = self.doc.get(field, "" if known else UNKNOWN)
        if field in self.enums and v not in ("", None, UNKNOWN):
            conv = lambda x: self.enums[field].get(str(x), str(x))
            return [conv(x) for x in v] if isinstance(v, list) else conv(v)
        return v

    def label(self, f):
        return self.labels.get(f) or f

    def log(self, depth, kind, text):
        self.trace.append({"depth": depth, "kind": kind, "text": text})


_REF = re.compile(r"\{=([^}:]+):([^}]+)\}")


def _datestr(x):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?", str(x))
    return "%s.%s.%s" % (m.group(3), m.group(2), m.group(1)) if m else str(x)


def _ref_value(ctx, kind, name):
    import datetime
    if kind == "Document":
        return ctx.get(name)
    if kind not in ("Document", "System", "Template", "User") and kind in ctx.vars:
        d = ctx.vars[kind]
        return UNKNOWN if d is UNKNOWN else d.get(name, UNKNOWN)
    if kind == "System" and name in ("Date", "Now", "NowLocal"):
        n = datetime.datetime.now()
        return n.strftime("%d.%m.%Y") if name == "Date" else n.strftime("%d.%m.%Y %H:%M:%S")
    return UNKNOWN


_SAFE = re.compile(r"^[\d\.\+\-\*/\(\)\s,]*$")


def ev(ctx, x):
    if isinstance(x, dict):
        return {k: ev(ctx, v) for k, v in x.items()}
    if isinstance(x, list):
        return [ev(ctx, v) for v in x]
    if not isinstance(x, str):
        return x
    s = x.strip()
    m = _REF.fullmatch(s)
    if m:
        return _ref_value(ctx, m.group(1), m.group(2))
    if "{=" not in s and "{{" not in s:
        return x
    formula = s.startswith("{{=") and s.endswith("}}") or s.startswith("=")
    if not formula:                                    # текст со вставками {=...}
        bad = []

        def sub_t(mm):
            v = _ref_value(ctx, mm.group(1), mm.group(2))
            if v is UNKNOWN:
                bad.append(1)
                return ""
            return _datestr(v) if isinstance(v, str) else ("" if v is None else str(v))
        out = _REF.sub(sub_t, s)
        return UNKNOWN if (bad or "{{" in out or "}}" in out) else out
    body = s[3:-2] if s.startswith("{{=") else s[1:]
    funcs = {"substr": lambda t, a, b: str(t)[int(a):int(a) + int(b)]}
    unknown = []

    def sub(mm):
        v = _ref_value(ctx, mm.group(1), mm.group(2))
        if v is UNKNOWN:
            unknown.append(1)
            return "0"
        if "substr(" in body:                          # текстовый контекст: даты как ДД.ММ.ГГГГ
            if v in ("", None):
                return "''"
            if isinstance(v, list):
                v = ", ".join(str(x) for x in v)
            n2 = _num(v) if not isinstance(v, str) else None
            return repr(_datestr(v) if isinstance(v, str) else (("%g" % n2) if n2 is not None else str(v)))
        if v in ("", None):
            return "0"
        n = _num(v)
        if n is None:
            unknown.append(1)
            return "0"
        return repr(n)
    body = _REF.sub(sub, body)
    if unknown:
        return UNKNOWN
    body = re.sub(r"(\d+(?:\.\d+)?)%", r"(\1/100)", body)
    if "**" in body or len(body) > 500 or re.search(r"'\s*\*|\*\s*'", body):
        return UNKNOWN                                 # возведение в степень и умножение строк не вычисляем
    probe = re.sub(r"substr|'[^']*'", "", body)
    if not _SAFE.match(probe):
        return UNKNOWN                                 # datediff/dateadd и прочее — не поддержано
    try:
        v = eval(body, {"__builtins__": {}}, funcs)
        return round(v, 2) if isinstance(v, float) else v
    except Exception:
        return UNKNOWN


_NUMRE = re.compile(r"-?\d+(?:[.,]\d+)?")
_DATERE = re.compile(r"^(?:\d{4}-\d{2}-\d{2}(?:T.*)?|\d{2}\.\d{2}\.\d{4}.*)$")


def _eq(x, y):
    sx, sy = str(x).strip(), str(y).strip()
    if _NUMRE.fullmatch(sx) and _NUMRE.fullmatch(sy):
        return float(sx.replace(",", ".")) == float(sy.replace(",", "."))
    if _DATERE.match(sx) and _DATERE.match(sy):
        return _datestr(sx)[:10] == _datestr(sy)[:10]
    return sx == sy


def _cmp(a, op, b):
    if a is UNKNOWN or b is UNKNOWN:
        return UNKNOWN
    empty = lambda v: v in ("", None, [], {}, "0", 0)
    if op == "empty":
        return empty(a)
    if op == "!empty":
        return not empty(a)
    A = a if isinstance(a, list) else [a]
    if op == "=":
        return any(_eq(x, b) for x in a) if isinstance(a, list) else _eq(a, b)
    if op == "!=":
        return not _cmp(a, "=", b)
    if op in ("in", "!in"):
        bl = list(b.values()) if isinstance(b, dict) else (b if isinstance(b, list) else [b])
        r = any(_eq(x, y) for x in A for y in bl)
        return r if op == "in" else not r
    if op in ("contain", "!contain"):
        r = str(b).lower() in " ".join(map(str, A)).lower()
        return r if op == "contain" else not r
    if op in (">", "<", ">=", "<="):
        x, y = _num(a), _num(b)
        if x is None or y is None:
            return UNKNOWN
        return {">": x > y, "<": x < y, ">=": x >= y, "<=": x <= y}[op]
    return UNKNOWN


def cond(ctx, node):
    p = node["props"]
    k = next((q for q in ("fieldcondition", "propertyvariablecondition", "mixedcondition", "truecondition") if q in p), None)
    if k is None:
        return None
    if k == "truecondition":
        return True
    c = p[k]
    items = [c[i] for i in sorted(c, key=lambda z: int(z))] if isinstance(c, dict) else []
    res, desc = None, []
    for it in items:
        if k == "mixedcondition":
            field, op, val, join = it.get("field"), it.get("operator"), it.get("value"), str(it.get("joiner", "0"))
            ov = ctx.vars.get(it.get("object"), UNKNOWN)
            r = UNKNOWN if ov is UNKNOWN else _cmp(ov.get(field, UNKNOWN), op, ev(ctx, val))
        else:
            field, op, val, join = it.get("0"), it.get("1"), it.get("2"), str(it.get("3", "0"))
            r = UNKNOWN if k == "propertyvariablecondition" else _cmp(ctx.get(field), op, ev(ctx, val))
        desc.append("%s %s %s" % (ctx.label(field or ""), op, val if not isinstance(val, dict) else ""))
        if res is None:
            res = r
        elif join == "1":
            res = True if (res is True or r is True) else (UNKNOWN if (res is UNKNOWN or r is UNKNOWN) else False)
        else:
            res = False if (res is False or r is False) else (UNKNOWN if (res is UNKNOWN or r is UNKNOWN) else True)
    node["_desc"] = " и ".join(desc)
    return res if res is not None else UNKNOWN


def run_node(ctx, n, depth):
    t, p = n["type"], n["props"]
    if t in WRAP:
        for c in n["children"]:
            run_node(ctx, c, depth + (1 if t != "SequentialWorkflow" else 0))
    elif t == "IfElse":
        taken, ambiguous = False, False
        for br in n["children"]:
            r = cond(ctx, br)
            d = br.get("_desc") or ""
            if r is None:
                if taken:
                    continue
                if ambiguous:
                    ctx.log(depth, "skip", "Иначе: пропущено, предыдущие условия не определены локально")
                    continue
                ctx.log(depth, "ok", "Иначе")
                for c in br["children"]:
                    run_node(ctx, c, depth + 1)
                taken = True
            elif r is UNKNOWN:
                ambiguous = True
                ctx.log(depth, "unknown", "Если %s — не определено локально, ветка пропущена" % d)
            elif r and not taken and not ambiguous:
                ctx.log(depth, "ok", "Если %s — выполнено" % d)
                for c in br["children"]:
                    run_node(ctx, c, depth + 1)
                taken = True
    elif t == "IfElseBranch":
        for c in n["children"]:
            run_node(ctx, c, depth)
    elif t == "SetField":
        for f, expr in (p.get("FieldValue") or {}).items():
            v = ev(ctx, expr)
            bad = v is UNKNOWN or (isinstance(v, dict) and any(x is UNKNOWN for x in v.values())) or (isinstance(v, list) and any(x is UNKNOWN for x in v))
            if bad:
                ctx.log(depth, "unknown", "Поле «%s»: значение считается формулой/шаблоном, локально не вычислено" % ctx.label(f))
            else:
                ctx.doc[f] = v
                ctx.changed[f] = v
                ctx.log(depth, "ok", "Поле «%s» = %s" % (ctx.label(f), v if v != "" else "(пусто)"))
    elif t == "CrmChangeStatus":
        tgt = p.get("TargetStatus")
        ctx.stage = ctx.doc["STAGE_ID"] = tgt
        ctx.queue.append(tgt)
        ctx.log(depth, "ok", "Смена стадии → %s" % tgt)
    elif t == "GetListsDocument":
        ib = (re.search(r"iblock_(\d+)", json.dumps(p.get("DocumentType") or {})) or [None, None])[1]
        eid = ev(ctx, p.get("ElementId"))
        L = LISTS.get(ib or "")
        el = (L["elements"].get(str(eid)) if (L and eid is not UNKNOWN and eid not in ("", None)) else None)
        if not L or el is None:
            ctx.vars[n.get("name") or ""] = UNKNOWN
            ctx.log(depth, "unknown", "Список %s: элемент %s не найден локально" % (ib, eid if eid is not UNKNOWN else "?"))
        else:
            fm = p.get("FieldsMap") or {}
            vals = {"NAME": el["NAME"], "ID": str(eid), "SORT": el.get("SORT")}
            for fid, v in el["props"].items():
                f = L["fields"].get(fid) or {}
                code = f.get("code")
                opts = f.get("options") or {}
                def conv(x, f=f, opts=opts, code=code):
                    if f.get("type") == "L":
                        lab = opts.get(str(x), x)
                        om = (fm.get("PROPERTY_%s" % code) or {}).get("Options") or {}
                        return next((h for h, l in om.items() if l == lab), lab)
                    return x
                vv = [conv(x) for x in (v if isinstance(v, list) else [v])]
                val = vv if (f.get("multiple") == "Y" or len(vv) > 1) else (vv[0] if vv else "")
                vals[fid] = val
                if code:
                    vals["PROPERTY_%s" % code] = val
            ctx.vars[n.get("name") or ""] = vals
            ctx.log(depth, "ok", "Прочитан элемент списка %s: %s" % (ib, str(el["NAME"])[:60]))
    elif t in GETTERS:
        ctx.log(depth, "skip", "%s: данные из Битрикса, локально недоступны" % (n["title"] or t))
    elif t in EXTERNAL:
        extra = ""
        if t in ("ImMessage", "IMNotify"):
            mf = p.get("MessageFields") or {}
            extra = ": «%s»" % str(mf.get("MessageText") or p.get("MessageSite") or "")[:100]
        elif t == "StartWorkflow":
            extra = ": шаблон %s" % p.get("TemplateId")
        elif t == "CrmCreateDynamic":
            extra = ": тип %s" % p.get("DynamicTypeId")
        elif t == "CrmSetObserverField":
            extra = ": %s %s" % (p.get("ActionOnObservers"), ", ".join(str(v) for v in (p.get("Observers") or {}).values()))
        ctx.log(depth, "effect", "Выполнил бы: %s%s" % (EXTERNAL[t], extra))
    elif t in ("Delay", "RobotDelay"):
        ctx.log(depth, "skip", "%s: ожидание локально пропущено" % (n["title"] or t))
        for c in n["children"]:
            run_node(ctx, c, depth + 1)
    elif t in ("While", "ForEach"):
        ctx.log(depth, "skip", "%s: цикл локально не исполняется" % (n["title"] or t))
    elif t.startswith("rest_"):
        ctx.log(depth, "effect", "Выполнил бы: действие приложения «%s»" % (n["title"] or t))
    else:
        ctx.log(depth, "skip", "%s: не поддержано" % (n["title"] or t))


def run_stage(ctx, stage, depth=0, guard=0, seen=frozenset()):
    if stage in seen:
        ctx.log(depth, "unknown", "Цикл стадий (%s уже выполнялась), остановлено" % stage)
        return
    seen = seen | {stage}
    d = RAW.get(stage)
    ctx.log(depth, "stage", "Роботы стадии %s%s" % (stage, " (шаблон %s)" % d["bp"] if d else " — нет роботов"))
    if not d:
        return
    if guard > 6:
        ctx.log(depth, "unknown", "Слишком длинная цепочка смен стадии, остановлено")
        return
    ctx.queue = []
    for root in d["tree"]:
        run_node(ctx, root, depth + 1)
    for nxt in ctx.queue[:]:
        run_stage(ctx, nxt, depth + 1, guard + 1, seen)


def simulate(doc, stage, enums, labels, complete=False):
    """Локально перевести сделку на стадию и выполнить роботы: (изменения полей, итоговая стадия, трасса)."""
    ctx = Ctx(dict(doc, STAGE_ID=stage), enums, labels, complete)
    run_stage(ctx, stage)
    return ctx.changed, ctx.stage, ctx.trace
