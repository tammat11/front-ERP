"""Таймлайн, комментарии и дела карточки. Всё локально, в Битрикс не пишем.

Состояние:
  feat «activities» — {"items":[{id,f,deal,type,title,due,responsible,done,done_at,comment,created}]}
  feat «timeline»   — {"notes":{deal:{"<idx>|<ts>":{"text":…,"edited":…,"hidden":bool}}}}  правки/удаления заметок
"""
import json
import time
from collections import deque
from datetime import datetime

TYPES = ("call", "meeting", "task", "email", "other")
TYPE_RU = {"call": "Звонок", "meeting": "Встреча", "task": "Задача", "email": "Письмо", "other": "Другое"}
JOURNAL_TAIL = 20000      # сколько последних строк журнала читаем


def _now():
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _date_ok(s):
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def _due_ok(s):
    try:
        datetime.strptime(s, "%Y-%m-%dT%H:%M")
        return isinstance(s, str) and len(s) == 16
    except (ValueError, TypeError):
        return False


def register(api, core):
    # ---------- общие помощники ----------
    def acts():
        d = core.feat_load("activities", {"items": []})
        if not isinstance(d, dict) or not isinstance(d.get("items"), list):
            d = {"items": []}
        return d

    def funnel_of(fid):
        return next((x for x in core.snapshot()["funnels"] if x["id"] == fid), None)

    def deal_titles(fid):
        f = funnel_of(fid)
        if not f:
            return {}, ""
        st = core.load(core.STATE, {})
        ov = st.get("fields") or {}
        out = {}
        for s in f["stages"]:
            for d in s["deals"]:
                out[d["ID"]] = (ov.get(d["ID"]) or {}).get("TITLE") or d["TITLE"]
        return out, f["name"]

    def stage_names(fid):
        f = funnel_of(fid)
        return {s["id"]: s["name"] for s in f["stages"]} if f else {}

    def user_ids():
        return set(core.snapshot().get("users", {}).keys())

    def s(v, n):
        return v.strip()[:n] if isinstance(v, str) else ""

    def note_key(idx, ts):
        return "%s|%s" % (idx, ts)

    def overlay(raw, deal):
        """Заметки с правками и скрытием: [{idx, ts, text, edited}]. idx — позиция в исходном списке."""
        ov = ((core.feat_load("timeline", {}) or {}).get("notes") or {}).get(deal) or {}
        out = []
        for i, n in enumerate(raw or []):
            o = ov.get(note_key(i, n.get("ts", ""))) or {}
            if o.get("hidden"):
                continue
            out.append({"idx": i, "ts": n.get("ts", ""), "text": o.get("text", n.get("text", "")), "edited": o.get("edited", "")})
        return out

    def tl_notes(deal):
        return overlay((core.load(core.STATE, {}).get("notes") or {}).get(deal), deal)

    def note_filter(notes, deal_id):
        """Фильтр ядра для card_detail («Общее»): изменённые тексты и без удалённых."""
        ov = ((core.feat_load("timeline", {}) or {}).get("notes") or {}).get(deal_id) or {}
        if not ov:
            return notes
        out = []
        for i, n in enumerate(notes or []):
            o = ov.get(note_key(i, n.get("ts", ""))) or {}
            if o.get("hidden"):
                continue
            out.append(dict(n, text=o["text"]) if "text" in o else n)
        return out
    core.NOTE_FILTERS.append(note_filter)

    def reset_hook():
        def a(d):
            if isinstance(d.get("items"), list):
                d["items"] = [x for x in d["items"] if not str(x.get("deal", "")).startswith("L")]
        core.feat_update("activities", a, {"items": []})

        def n(d):
            nt = d.get("notes")
            if isinstance(nt, dict):
                for k in [k for k in nt if str(k).startswith("L")]:
                    del nt[k]
        core.feat_update("timeline", n, {})
    core.RESET_HOOKS.append(reset_hook)

    # ---------- История ----------
    @api.get("/api/timeline")
    def timeline(req):
        fid, deal = req.arg("f"), req.arg("deal")
        if not deal:
            return (400, {"error": "нужен параметр deal"})
        stages = stage_names(fid)
        labels = core._field_catalog(fid)[1] if fid else {}
        events = []

        def add(ts, typ, title, text="", details=None):
            events.append({"ts": ts, "type": typ, "title": title, "text": text, "details": details or []})

        try:
            with open(core.JOURNAL, encoding="utf-8", errors="replace") as fh:
                lines = deque(fh, maxlen=JOURNAL_TAIL)
        except OSError:
            lines = []
        for ln in lines:
            try:
                r = json.loads(ln)
            except ValueError:
                continue
            if not isinstance(r, dict) or str(r.get("deal")) != deal:
                continue
            rf = r.get("funnel")
            if rf and fid and str(rf) != fid:
                continue
            ev, ts = r.get("event"), r.get("ts", "")
            if ev == "move_local":
                a, b, fin = r.get("from"), r.get("to"), r.get("final")
                an, bn = stages.get(a, a or "—"), stages.get(b, b or "—")
                add(ts, "move", "Перенос по стадиям", "", [{"label": "Было", "value": an}, {"label": "Стало", "value": bn}])
                if fin and fin != b:
                    add(ts, "robot", "Робот перенёс дальше", "", [{"label": "Итоговая стадия", "value": stages.get(fin, fin)}])
                ch = r.get("changed") or []
                if ch:
                    add(ts, "robot", "Роботы изменили поля", "", [{"label": labels.get(c) or c, "value": ""} for c in ch])
            elif ev == "edit_local":
                ch = r.get("changed") or {}
                add(ts, "edit", "Правка полей", "", [{"label": k, "value": str(v)} for k, v in ch.items()] if isinstance(ch, dict) else [])
            elif ev == "create_local":
                add(ts, "create", "Карточка создана", r.get("note", ""), [{"label": "Стадия", "value": stages.get(r.get("to"), r.get("to") or "")}] if r.get("to") else [])
            elif ev == "delete_local":
                add(ts, "delete", "Карточка скрыта", "Локально, в Битриксе осталась")
            elif ev == "restore_local":
                add(ts, "delete", "Карточка восстановлена")
            elif ev in ("undo_local", "redo_local"):
                add(ts, "undo", "Отмена действия" if ev == "undo_local" else "Повтор действия", str(r.get("note") or ""))
            # note_local не берём: заметки идут из состояния (с правками и скрытием)
        for n in tl_notes(deal):
            add(n["ts"], "note", "Заметка", n["text"] + ("  (изменено)" if n["edited"] else ""))
        for a in acts()["items"]:
            if str(a.get("deal")) != deal or (fid and a.get("f") != fid):
                continue
            tr = TYPE_RU.get(a.get("type"), "Дело")
            add(a.get("created", ""), "activity", "Дело создано · " + tr, a.get("title", ""),
                [{"label": "Срок", "value": (a.get("due") or "").replace("T", " ")}])
            if a.get("done") and a.get("done_at"):
                add(a["done_at"], "activity", "Дело выполнено · " + tr, a.get("title", ""))
        events = [e for e in events if e["ts"]]
        for i, e in enumerate(events):
            e["_i"] = i
        events.sort(key=lambda e: (e["ts"], e["_i"]), reverse=True)
        for e in events:
            e.pop("_i")
        return {"events": events}

    # ---------- Комментарии ----------
    @api.get("/api/timeline/notes")
    def notes(req):
        deal = req.arg("deal")
        if not deal:
            return (400, {"error": "нужен параметр deal"})
        return {"items": tl_notes(deal)[::-1]}

    def _note_op(req, hide):
        b = req.body
        deal, ts = str(b.get("deal") or ""), str(b.get("ts") or "")
        try:
            idx = int(b.get("idx"))
        except (TypeError, ValueError):
            return (400, {"error": "нужен idx"})
        text = s(b.get("text"), 2000)
        if not hide and not text:
            return (400, {"error": "пустой текст"})
        def fn(d):
            raw = (core.load(core.STATE, {}).get("notes") or {}).get(deal) or []
            if idx < 0 or idx >= len(raw) or raw[idx].get("ts") != ts:
                return False
            if not isinstance(d.get("notes"), dict):
                d["notes"] = {}
            slot = d["notes"].setdefault(deal, {}).setdefault(note_key(idx, ts), {})
            if hide:
                slot["hidden"] = True
            else:
                slot["text"], slot["edited"] = text, _now()
            return True
        if not core.feat_update("timeline", fn, {}):
            return (404, {"error": "заметка не найдена"})
        return {"ok": True}

    @api.post("/api/timeline/note/edit")
    def note_edit(req):
        return _note_op(req, False)

    @api.post("/api/timeline/note/delete")
    def note_delete(req):
        return _note_op(req, True)

    # ---------- Дела ----------
    @api.get("/api/activities")
    def act_list(req):
        frm, to, done = req.arg("from"), req.arg("to"), req.arg("done", "all")
        fid, deal = req.arg("f"), req.arg("deal")
        if frm and not _date_ok(frm) or to and not _date_ok(to):
            return (400, {"error": "from/to в формате YYYY-MM-DD"})
        if done not in ("0", "1", "all"):
            return (400, {"error": "done: 0, 1 или all"})
        items = []
        for a in acts()["items"]:
            if fid and a.get("f") != fid or deal and str(a.get("deal")) != deal:
                continue
            if done != "all" and bool(a.get("done")) != (done == "1"):
                continue
            day = (a.get("due") or "")[:10]
            if frm and day < frm or to and day > to:
                continue
            items.append(dict(a))
        cache = {}
        for a in items:
            if a["f"] not in cache:
                cache[a["f"]] = deal_titles(a["f"])
            t, fname = cache[a["f"]]
            a["dealTitle"], a["funnelName"] = t.get(str(a["deal"]), ""), fname
        items.sort(key=lambda a: (a.get("due") or "9", a.get("id", "")))
        return {"items": items}

    @api.post("/api/activities/save")
    def act_save(req):
        it = req.body.get("item")
        if not isinstance(it, dict):
            return (400, {"error": "нужен объект item"})
        typ = it.get("type")
        if typ not in TYPES:
            return (400, {"error": "тип дела: " + ", ".join(TYPES)})
        title = s(it.get("title"), 10000)
        if not title:
            return (400, {"error": "нужно название"})
        if len(title) > 200:
            return (400, {"error": "название длиннее 200 символов"})
        due = it.get("due")
        if not isinstance(due, str) or not _due_ok(due):
            return (400, {"error": "срок в формате YYYY-MM-DDTHH:MM"})
        resp = str(it.get("responsible") or "")
        if resp and resp not in user_ids():
            return (400, {"error": "нет такого ответственного"})
        comment = it.get("comment")
        if comment is not None and not isinstance(comment, str):
            return (400, {"error": "комментарий должен быть строкой"})
        comment = (comment or "").strip()
        if len(comment) > 2000:
            return (400, {"error": "комментарий длиннее 2000 символов"})
        iid = it.get("id")
        if not iid:
            fid, deal = str(it.get("f") or ""), str(it.get("deal") or "")
            if not fid or not deal:
                return (400, {"error": "нужны f и deal"})
            if not funnel_of(fid):
                return (400, {"error": "нет такой воронки"})
            if not core._find_card(fid, deal)[2]:
                return (400, {"error": "карточка не найдена"})

        def fn(d):
            if not isinstance(d.get("items"), list):
                d["items"] = []
            old = next((a for a in d["items"] if a.get("id") == iid), None) if iid else None
            if iid and not old:
                return (404, {"error": "дело не найдено"})
            rec = old if old else {"f": fid, "deal": deal, "created": _now(), "done": False, "done_at": ""}
            rec.update({"type": typ, "title": title, "due": due, "responsible": resp, "comment": comment})
            if "done" in it and not old:
                rec["done"] = bool(it["done"])
                rec["done_at"] = _now() if rec["done"] else ""
            if old is None:
                n = int(time.time() * 1000)
                ids = {a.get("id") for a in d["items"]}
                while "a%d" % n in ids:
                    n += 1
                rec = {"id": "a%d" % n, **rec}
                d["items"].append(rec)
            return rec
        rec = core.feat_update("activities", fn, {"items": []})
        if isinstance(rec, tuple):
            return rec
        return {"ok": True, "item": rec}

    @api.post("/api/activities/done")
    def act_done(req):
        iid, done = req.body.get("id"), req.body.get("done")
        if not isinstance(iid, str) or not isinstance(done, bool):
            return (400, {"error": "нужны id (строка) и done (true/false)"})
        def fn(d):
            a = next((x for x in (d.get("items") or []) if x.get("id") == iid), None)
            if not a:
                return None
            a["done"] = done
            a["done_at"] = _now() if done else ""
            return dict(a)
        a = core.feat_update("activities", fn, {"items": []})
        if not a:
            return (404, {"error": "дело не найдено"})
        return {"ok": True, "item": a}

    @api.post("/api/activities/delete")
    def act_delete(req):
        iid = req.body.get("id")
        if not isinstance(iid, str):
            return (400, {"error": "нужен id"})
        def fn(d):
            items = d.get("items") or []
            d["items"] = [x for x in items if x.get("id") != iid]
            return len(d["items"]) != len(items)
        if not core.feat_update("activities", fn, {"items": []}):
            return (404, {"error": "дело не найдено"})
        return {"ok": True}
