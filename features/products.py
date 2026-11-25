"""Фича products: вкладки карточки «Товары», «Файлы», «Связи». Всё локально."""
import base64
import binascii
import hashlib
import json
import os
import re
import shutil
import threading
import time
import unicodedata
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import quote

MAX_ITEMS = 200
MAX_FILE = 5 * 1024 * 1024
MAX_FILES = 30
MAX_CHUNK = 700_000          # сырых байт в одном куске (в base64 + JSON < 1 МБ)
MAX_CHUNKS = 12
MAX_TOTAL = 500 * 1024 * 1024    # суммарно под все файлы
MAX_PENDING = 20                 # незавершённых загрузок одновременно
MAX_SUM = Decimal("1e13")
MAX_LINKS = 100
BLOCKED_EXT = {"exe", "bat", "cmd", "com", "scr", "msi", "sh", "js", "mjs", "html", "htm", "xhtml", "svg", "ps1",
               "vbs", "jar", "php", "py", "dll", "lnk", "app", "pl", "rb", "hta", "reg", "apk", "dmg", "swf"}
IMG_CT = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
          "bmp": "image/bmp"}
VATS = {"none": Decimal(0), "12": Decimal("0.12"), "16": Decimal("0.16")}
LINK_TYPES = {"related": "связана", "parent": "родитель", "child": "дочерняя", "duplicate": "дубль", "blocks": "блокирует"}
LINK_INV = {"related": "related", "parent": "child", "child": "parent", "duplicate": "duplicate", "blocks": "blocked_by",
            "blocked_by": "blocks"}
LINK_LABEL = dict(LINK_TYPES, blocked_by="заблокирована")
ID_RE = re.compile(r"^[A-Za-z0-9_]{1,40}$")
UP_RE = re.compile(r"^[A-Za-z0-9]{8,40}$")
CENT = Decimal("0.01")
_lock = threading.RLock()


def _q(x):
    return x.quantize(CENT, rounding=ROUND_HALF_UP)


def _dec(v, what):
    """Строгий разбор числа: без bool/nan/inf, не длиннее 24 символов."""
    if isinstance(v, bool) or v is None:
        raise ValueError("%s: нужно число" % what)
    s = str(v).strip().replace(" ", "").replace(" ", "").replace(",", ".")
    if not s or len(s) > 24 or not re.fullmatch(r"-?\d+(\.\d+)?", s):
        raise ValueError("%s: нужно число" % what)
    try:
        return Decimal(s)
    except InvalidOperation:
        raise ValueError("%s: нужно число" % what)


def _clean(s, n):
    s = unicodedata.normalize("NFC", str(s if s is not None else ""))
    s = "".join(ch for ch in s if ch >= " " and ch != "\x7f")
    return s.strip()[:n]


def _norm_item(raw, i):
    if not isinstance(raw, dict):
        raise ValueError("строка %d: неверный формат" % (i + 1))
    p = "строка %d" % (i + 1)
    name = _clean(raw.get("name"), 200)
    if not name:
        raise ValueError("%s: укажите название" % p)
    qty = _dec(raw.get("qty"), p + ", количество")
    if qty <= 0 or qty > Decimal("1e9"):
        raise ValueError("%s: количество должно быть больше 0 и не больше 1 000 000 000" % p)
    price = _dec(raw.get("price"), p + ", цена")
    if price < 0 or price > Decimal("1e12"):
        raise ValueError("%s: цена должна быть от 0 до 1 000 000 000 000" % p)
    mode = raw.get("disc_mode", "pct")
    if mode not in ("pct", "sum"):
        raise ValueError("%s: тип скидки — pct или sum" % p)
    disc = _dec(raw.get("disc", 0) if raw.get("disc") not in (None, "") else 0, p + ", скидка")
    if disc < 0:
        raise ValueError("%s: скидка не может быть отрицательной" % p)
    if mode == "pct" and disc > 100:
        raise ValueError("%s: скидка не больше 100%%" % p)
    if mode == "sum" and disc > _q(qty * price):
        raise ValueError("%s: скидка больше суммы строки" % p)
    vat = str(raw.get("vat", "none"))
    if vat not in VATS:
        raise ValueError("%s: НДС — без НДС, 12%% или 16%%" % p)
    return {"id": _clean(raw.get("id"), 24) or uuid.uuid4().hex[:10], "name": name,
            "qty": format(qty.normalize(), "f"), "unit": _clean(raw.get("unit"), 20) or "шт",
            "price": format(price.normalize(), "f"), "disc": format(disc.normalize(), "f"), "disc_mode": mode,
            "vat": vat, "vat_incl": bool(raw.get("vat_incl"))}


def _calc_line(it):
    qty, price, disc = Decimal(it["qty"]), Decimal(it["price"]), Decimal(it["disc"])
    base = _q(qty * price)
    d = _q(base * disc / 100) if it["disc_mode"] == "pct" else _q(disc)
    after = base - d
    r = VATS[it["vat"]]
    if r == 0:
        net, vat, total = after, Decimal(0), after
    elif it["vat_incl"]:
        total = after
        net = _q(total / (1 + r))
        vat = total - net
    else:
        net = after
        vat = _q(net * r)
        total = net + vat
    return {"base": base, "discount": d, "net": net, "vat": vat, "total": total}


def _calc(items):
    lines, tn, tv, tt = [], Decimal(0), Decimal(0), Decimal(0)
    for it in items:
        c = _calc_line(it)
        lines.append({k: format(v, "f") for k, v in c.items()})
        tn, tv, tt = tn + c["net"], tv + c["vat"], tt + c["total"]
    return lines, {"net": format(tn, "f"), "vat": format(tv, "f"), "total": format(tt, "f")}


def _safe_name(name):
    name = unicodedata.normalize("NFC", str(name or ""))
    name = name.replace("\\", "/").split("/")[-1]
    out = []
    for ch in name:
        if ch.isalnum() or ch in "._-()":
            out.append(ch)
        elif ch in " \t":
            out.append("_")
        elif ch >= " " and ch != "\x7f" and not unicodedata.category(ch).startswith("C"):
            out.append("_")
    s = "".join(out).lstrip(".").strip("_ ") or "file"
    if len(s) > 100:
        base, dot, ext = s.rpartition(".")
        s = (base[:80] + "." + ext[:15]) if dot and len(ext) <= 15 else s[:100]
    return s


def _bad_ext(name):
    parts = name.lower().split(".")
    return any(p in BLOCKED_EXT for p in parts[1:])


def register(api, core):
    FILES = os.path.join(core.FEATDIR, "files")
    TMP = os.path.join(FILES, "_tmp")

    # ---------- общее ----------
    def _ids(req):
        f, d = str(req.body.get("f", "")), str(req.body.get("deal", ""))
        if not ID_RE.match(f) or not ID_RE.match(d):
            return None, None, (400, {"error": "неверный номер воронки или карточки"})
        return f, d, None

    def _ids_q(req):
        f, d = req.arg("f", ""), req.arg("deal", "")
        if not ID_RE.match(f) or not ID_RE.match(d):
            return None, None, (400, {"error": "неверный номер воронки или карточки"})
        return f, d, None

    def _exists(f, d):
        return bool(core._find_card(f, d)[2])

    def _lookup(pairs):
        """{(f,id): {title, funnel, stage, company}} для существующих карточек, один проход по снимку."""
        want = set(pairs)
        out = {}
        if not want:
            return out
        snap = core.snapshot()
        st = core.load(core.STATE, {})
        ov, mv = st.get("fields") or {}, st.get("moves") or {}
        for fn in snap["funnels"]:
            names = {x["id"]: x["name"] for x in fn["stages"]}
            for s in fn["stages"]:
                for dl in s["deals"]:
                    k = (fn["id"], dl["ID"])
                    if k in want:
                        cur = (mv.get(dl["ID"]) or {}).get("to") or s["id"]
                        out[k] = {"title": (ov.get(dl["ID"]) or {}).get("TITLE") or dl["TITLE"], "funnel": fn["name"],
                                  "stage": names.get(cur, s["name"]),
                                  "company": snap["companies"].get(str(dl.get("COMPANY_ID")), "")}
        return out

    # ---------- Товары ----------
    def _pr_all():
        d = core.feat_load("products", {})
        return d if isinstance(d, dict) else {}

    @api.get("/api/products/get")
    def products_get(req):
        f, d, err = _ids_q(req)
        if err:
            return err
        allp = _pr_all()
        items = allp.get(f + "|" + d) or []
        lines, tot = _calc(items)
        names = []
        seen = set()
        for lst in allp.values():
            for it in lst:
                n = it.get("name", "")
                if n and n.lower() not in seen:
                    seen.add(n.lower())
                    names.append(n)
        return {"items": items, "lines": lines, "totals": tot, "names": sorted(names)[:300], "max": MAX_ITEMS}

    @api.post("/api/products/save")
    def products_save(req):
        f, d, err = _ids(req)
        if err:
            return err
        raw = req.body.get("items")
        if not isinstance(raw, list):
            return 400, {"error": "items должен быть списком"}
        if len(raw) > MAX_ITEMS:
            return 400, {"error": "не больше %d позиций на карточку" % MAX_ITEMS}
        try:
            items = [_norm_item(x, i) for i, x in enumerate(raw)]
        except ValueError as e:
            return 400, {"error": str(e)}
        seen = set()
        for x in items:
            if x["id"] in seen:
                x["id"] = uuid.uuid4().hex[:10]
            seen.add(x["id"])
        if not _exists(f, d):
            return 404, {"error": "карточка не найдена"}
        def fn(allp):
            if items:
                allp[f + "|" + d] = items
            else:
                allp.pop(f + "|" + d, None)
        core.feat_update("products", fn, {})
        lines, tot = _calc(items)
        return {"ok": True, "items": items, "lines": lines, "totals": tot}

    @api.post("/api/products/apply")
    def products_apply(req):
        f, d, err = _ids(req)
        if err:
            return err
        items = _pr_all().get(f + "|" + d) or []
        if not items:
            return 400, {"error": "нет товарных позиций"}
        total = _calc(items)[1]["total"]
        if abs(Decimal(total)) > MAX_SUM:
            return 400, {"error": "сумма больше 10 000 000 000 000, примените меньшую"}
        try:
            r = core.edit_card(f, d, {"OPPORTUNITY": total})
        except Exception:      # noqa: BLE001
            r = {}
        if not isinstance(r, dict) or not r.get("ok"):
            return 400, {"error": "не удалось применить сумму к карточке"}
        return {"ok": True, "total": total}

    def _summary_files():
        d = core.feat_load("files", {})
        return d if isinstance(d, dict) else {}

    @api.get("/api/products/summary")
    def products_summary(req):
        f = req.arg("f", "")
        if not ID_RE.match(f):
            return 400, {"error": "неверная воронка"}
        pre = f + "|"
        out = {}
        for k, lst in _pr_all().items():
            if k.startswith(pre) and lst:
                out.setdefault(k[len(pre):], {})["p"] = len(lst)
        for k, lst in _summary_files().items():
            if k.startswith(pre) and lst:
                out.setdefault(k[len(pre):], {})["fl"] = len(lst)
        return {"items": out}

    # ---------- Файлы ----------
    def _fdir(f, d):
        return os.path.join(FILES, f + "." + d)

    def _fl_list(f, d):
        lst = _summary_files().get(f + "|" + d)
        return lst if isinstance(lst, list) else []

    def _pub(e):
        return {"id": e["id"], "name": e["name"], "size": e["size"], "ts": e["ts"],
                "img": e["name"].lower().rpartition(".")[2] in IMG_CT}

    def _cleanup_tmp():
        try:
            now = time.time()
            for fn in os.listdir(TMP):
                p = os.path.join(TMP, fn)
                if now - os.path.getmtime(p) > 3600:
                    os.remove(p)
        except OSError:
            pass

    def _drop_tmp(key):
        for ext in (".part", ".json"):
            try:
                os.remove(os.path.join(TMP, key + ext))
            except OSError:
                pass

    def _pending():
        """Метаданные незавершённых загрузок: [(key, meta)]."""
        out = []
        try:
            names = os.listdir(TMP)
        except OSError:
            return out
        for fn in names:
            if not fn.endswith(".json"):
                continue
            try:
                with open(os.path.join(TMP, fn), encoding="utf-8") as fh:
                    out.append((fn[:-5], json.load(fh)))
            except (OSError, ValueError):
                continue
        return out

    def _used_bytes(pend):
        used = 0
        for lst in _summary_files().values():
            if isinstance(lst, list):
                used += sum(int(x.get("size", 0)) for x in lst if isinstance(x, dict))
        return used + sum(int(m.get("size", 0)) for _k, m in pend)

    @api.get("/api/files/list")
    def files_list(req):
        f, d, err = _ids_q(req)
        if err:
            return err
        return {"items": [_pub(e) for e in _fl_list(f, d)], "max": MAX_FILES, "max_size": MAX_FILE}

    @api.post("/api/files/chunk")
    def files_chunk(req):
        b = req.body
        f, d, err = _ids(req)
        if err:
            return err
        up = str(b.get("upload", ""))
        if not UP_RE.match(up):
            return 400, {"error": "неверный идентификатор загрузки"}
        try:
            idx, total = int(b.get("idx")), int(b.get("total"))
        except (TypeError, ValueError):
            return 400, {"error": "неверный номер части"}
        if total < 1 or total > MAX_CHUNKS or idx < 0 or idx >= total:
            return 400, {"error": "неверное число частей"}
        name = _safe_name(b.get("name"))
        if _bad_ext(name):
            return 400, {"error": "этот тип файла запрещён (исполняемые и веб-файлы)"}
        data = b.get("data")
        if not isinstance(data, str):
            return 400, {"error": "нет данных"}
        try:
            raw = base64.b64decode(data, validate=True)
        except (binascii.Error, ValueError):
            return 400, {"error": "данные не base64"}
        if len(raw) > MAX_CHUNK:
            return 413, {"error": "часть слишком большая"}
        os.makedirs(TMP, exist_ok=True)
        key = hashlib.sha1(("%s|%s|%s" % (f, d, up)).encode()).hexdigest()
        meta_p, part_p = os.path.join(TMP, key + ".json"), os.path.join(TMP, key + ".part")
        with _lock:
            if idx == 0:
                _cleanup_tmp()
                if not _exists(f, d):
                    return 404, {"error": "карточка не найдена"}
                if len(_fl_list(f, d)) >= MAX_FILES:
                    return 400, {"error": "не больше %d файлов на карточку" % MAX_FILES}
                _drop_tmp(key)
                pend = _pending()
                if len(pend) >= MAX_PENDING:
                    return 429, {"error": "слишком много незавершённых загрузок, подождите"}
                if _used_bytes(pend) + MAX_FILE > MAX_TOTAL:
                    return 507, {"error": "на диске нет места под файлы (лимит 500 МБ)"}
                st = {"f": f, "d": d, "total": total, "next": 0, "size": 0, "name": name}
            else:
                try:
                    with open(meta_p, encoding="utf-8") as fh:
                        st = json.load(fh)
                except (OSError, ValueError):
                    return 400, {"error": "загрузка не найдена, начните заново"}
                if st.get("f") != f or st.get("d") != d or st.get("total") != total or st.get("name") != name:
                    return 400, {"error": "части не от одного файла"}
            if idx != st["next"]:
                _drop_tmp(key)
                return 400, {"error": "части пришли не по порядку, начните заново"}
            if st["size"] + len(raw) > MAX_FILE:
                _drop_tmp(key)
                return 413, {"error": "файл больше 5 МБ"}
            with open(part_p, "ab") as fh:
                fh.write(raw)
            st["next"] += 1
            st["size"] += len(raw)
            if st["next"] < total:
                with open(meta_p, "w", encoding="utf-8") as fh:
                    json.dump(st, fh)
                return {"ok": True, "done": False}
            # последняя часть: проверка и перенос на место
            if st["size"] == 0:
                _drop_tmp(key)
                return 400, {"error": "пустой файл"}
            fid = uuid.uuid4().hex[:12]
            stored = fid + "_" + name
            e = {"id": fid, "name": name, "stored": stored, "size": st["size"], "ts": time.strftime("%Y-%m-%d %H:%M")}
            os.makedirs(_fdir(f, d), exist_ok=True)
            dest = os.path.join(_fdir(f, d), stored)
            os.replace(part_p, dest)
            _drop_tmp(key)

            def fn(allf):
                lst = allf.get(f + "|" + d)
                lst = lst if isinstance(lst, list) else []
                if len(lst) >= MAX_FILES:
                    return False
                allf[f + "|" + d] = lst + [e]
                return True
            if not core.feat_update("files", fn, {}):
                try:
                    os.remove(dest)
                except OSError:
                    pass
                return 400, {"error": "не больше %d файлов на карточку" % MAX_FILES}
            return {"ok": True, "done": True, "file": _pub(e)}

    @api.get("/api/files/download")
    def files_download(req):
        f, d, err = _ids_q(req)
        if err:
            return err
        fid = req.arg("id", "")
        e = next((x for x in _fl_list(f, d) if x["id"] == fid), None)
        if not e:
            return 404, {"error": "файл не найден"}
        base = os.path.realpath(_fdir(f, d))
        p = os.path.realpath(os.path.join(base, e["stored"]))
        if not p.startswith(base + os.sep) or not os.path.isfile(p):
            return 404, {"error": "файл не найден"}
        with open(p, "rb") as fh:
            data = fh.read()
        ext = e["name"].lower().rpartition(".")[2]
        inline = req.arg("inline") == "1" and ext in IMG_CT
        ctype = IMG_CT[ext] if inline else "application/octet-stream"
        h = req.handler
        orig_sh, orig_eh = h.send_header, h.end_headers

        def sh(k, v):
            orig_sh(k, ctype if k.lower() == "content-type" else v)

        def eh():
            ascii_name = re.sub(r"[^A-Za-z0-9._-]", "_", e["name"]) or "file"
            orig_sh("Content-Disposition", "%s; filename=\"%s\"; filename*=UTF-8''%s" %
                    ("inline" if inline else "attachment", ascii_name, quote(e["name"], safe="")))
            orig_sh("X-Content-Type-Options", "nosniff")
            orig_sh("Content-Security-Policy", "default-src 'none'; sandbox")
            orig_sh("Cache-Control", "private, no-store")
            orig_eh()

        h.send_header, h.end_headers = sh, eh
        return 200, data

    @api.post("/api/files/delete")
    def files_delete(req):
        f, d, err = _ids(req)
        if err:
            return err
        fid = str(req.body.get("id", ""))
        removed = []

        def fn(allf):
            lst = allf.get(f + "|" + d)
            lst = lst if isinstance(lst, list) else []
            e = next((x for x in lst if x.get("id") == fid), None)
            if not e:
                return False
            rest = [x for x in lst if x.get("id") != fid]
            if rest:
                allf[f + "|" + d] = rest
            else:
                allf.pop(f + "|" + d, None)
            removed.append(e)
            return True
        with _lock:
            if not core.feat_update("files", fn, {}):
                return 404, {"error": "файл не найден"}
            e = removed[0]
            base = os.path.realpath(_fdir(f, d))
            p = os.path.realpath(os.path.join(base, e["stored"]))
            if p.startswith(base + os.sep):
                try:
                    os.remove(p)
                except OSError:
                    pass
        return {"ok": True}

    # ---------- Связи ----------
    def _edges():
        d = core.feat_load("links", {})
        e = d.get("edges") if isinstance(d, dict) else None
        return e if isinstance(e, list) else []

    def _mine(edges, key):
        out = []
        for e in edges:
            if e["a"] == key:
                out.append((e["b"], e["t"], e))
            elif e["b"] == key:
                out.append((e["a"], LINK_INV[e["t"]], e))
        return out

    @api.get("/api/links/list")
    def links_list(req):
        f, d, err = _ids_q(req)
        if err:
            return err
        mine = _mine(_edges(), f + "|" + d)
        info = _lookup([tuple(k.split("|", 1)) for k, _, _ in mine])
        items = []
        for k, t, _ in mine:
            tf, tid = k.split("|", 1)
            i = info.get((tf, tid))
            items.append({"f": tf, "id": tid, "type": t, "label": LINK_LABEL[t], "ok": bool(i),
                          "title": i["title"] if i else "карточка недоступна", "funnel": i["funnel"] if i else "",
                          "stage": i["stage"] if i else "", "company": i["company"] if i else ""})
        return {"items": items, "types": [{"id": k, "label": v} for k, v in LINK_TYPES.items()], "max": MAX_LINKS}

    @api.post("/api/links/add")
    def links_add(req):
        f, d, err = _ids(req)
        if err:
            return err
        tf, tid = str(req.body.get("tf", "")), str(req.body.get("tid", ""))
        t = str(req.body.get("type", "related"))
        if not ID_RE.match(tf) or not ID_RE.match(tid):
            return 400, {"error": "неверная связанная карточка"}
        if t not in LINK_TYPES:
            return 400, {"error": "неизвестный тип связи"}
        a, b = f + "|" + d, tf + "|" + tid
        if a == b:
            return 400, {"error": "нельзя связать карточку с самой собой"}
        if not _exists(f, d) or not _exists(tf, tid):
            return 404, {"error": "карточка не найдена"}
        def fn(dd):
            e0 = dd.get("edges")
            edges = [e for e in (e0 if isinstance(e0, list) else []) if {e["a"], e["b"]} != {a, b}]   # одна связь на пару: новая заменяет старую
            if len(_mine(edges, a)) >= MAX_LINKS or len(_mine(edges, b)) >= MAX_LINKS:
                return False
            edges.append({"a": a, "b": b, "t": t})
            dd.clear()
            dd["edges"] = edges
            return True
        if not core.feat_update("links", fn, {}):
            return 400, {"error": "не больше %d связей на карточку" % MAX_LINKS}
        return {"ok": True}

    @api.post("/api/links/delete")
    def links_delete(req):
        f, d, err = _ids(req)
        if err:
            return err
        tf, tid = str(req.body.get("tf", "")), str(req.body.get("tid", ""))
        if not ID_RE.match(tf) or not ID_RE.match(tid):
            return 400, {"error": "неверная связанная карточка"}
        a, b = f + "|" + d, tf + "|" + tid
        def fn(dd):
            e0 = dd.get("edges")
            edges = e0 if isinstance(e0, list) else []
            rest = [e for e in edges if {e["a"], e["b"]} != {a, b}]
            if len(rest) == len(edges):
                return False
            dd.clear()
            dd["edges"] = rest
            return True
        if not core.feat_update("links", fn, {}):
            return 404, {"error": "связь не найдена"}
        return {"ok": True}

    # ---------- сброс локального состояния ----------
    def _is_local(key):
        return str(key).split("|", 1)[-1].startswith("L")

    def reset_hook():
        def p(allp):
            for k in [k for k in allp if _is_local(k)]:
                del allp[k]
        core.feat_update("products", p, {})

        def lk(dd):
            e0 = dd.get("edges")
            if isinstance(e0, list):
                dd["edges"] = [e for e in e0 if not (_is_local(e.get("a")) or _is_local(e.get("b")))]
        core.feat_update("links", lk, {})
        gone = []

        def fl(allf):
            for k in [k for k in allf if _is_local(k)]:
                gone.append(k)
                del allf[k]
        with _lock:
            core.feat_update("files", fl, {})
            for k in gone:
                ff, _, dd = k.partition("|")
                if ID_RE.match(ff) and ID_RE.match(dd):
                    shutil.rmtree(_fdir(ff, dd), ignore_errors=True)
            for key, m in _pending():
                if str(m.get("d", "")).startswith("L"):
                    _drop_tmp(key)
    core.RESET_HOOKS.append(reset_hook)
