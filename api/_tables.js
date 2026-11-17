/*
 * The one place that knows both the documents the page saves and the tables
 * they are kept in.
 *
 *   travel/trips/<id>                -> trips
 *   travel/trips/<id>/days/<date>    -> days
 *   travel/trips/<id>/items/<id>     -> items
 *   travel/trips/<id>/shops/<id>     -> shops
 *   travel/trips/<id>/<목록>/<id>     -> entries (kind)
 *   travel/trips/<id>/attach/<id>    -> attachments
 *   blobs/<id>                       -> photos
 *
 * The "travel/" prefix is what the browser has been saving under all along;
 * the database never sees it.
 */

const LIST_KINDS = ["flights", "stays", "books", "links", "packList", "packGroups", "notes", "wx", "tips", "clothes", "outfits"];

/* ---------------- paths <-> rows ---------------- */

const PATH_OK = /^(meta|travel|blobs)\/[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){0,4}$/;

function strip(body, keys) {
  const out = {};
  for (const key of keys) if (body[key] !== undefined && body[key] !== null) out[key] = body[key];
  return out;
}

/* 파일이 기억하는 것(조각 수 · 크기 · 종류)은 글 칸 하나에 JSON으로 든다 */
function fileMeta(text) {
  let v = {};
  try { v = JSON.parse(text || "{}") || {}; } catch (e) { v = {}; }
  return { parts: Number(v.parts) || 0, size: Number(v.size) || 0, mime: v.mime || "" };
}

/* one document -> {table, row} or null when the path is not ours */
function toRow(path, body) {
  let p = path.split("/");
  if (p[0] === "blobs" && p.length === 2) {
    return { table: "photos", key: "id=eq." + p[1], row: { id: p[1], data: String(body.data || "") } };
  }
  if (p[0] === "meta" && p.length === 2) {
    return { table: "meta", key: "key=eq." + p[1], row: { key: p[1], body: body } };
  }
  /* the plan's documents live under travel/trips/... */
  if (p[0] !== "travel") return null;
  p = p.slice(1);
  if (p[0] !== "trips" || !p[1]) return null;
  const trip = p[1];

  if (p.length === 2) {
    return { table: "trips", key: "id=eq." + trip, row: {
      id: trip,
      title: body.title || "",
      emoji: body.emoji || "",
      city: body.city || "",
      country: body.country || "",
      start_date: body.start || null,
      end_date: body.end || null,
      /* 0 = 핀 없음. 핀을 꽂은 여행끼리는 이 번호 순서로 맨 위에 선다. */
      ord: Number(body.pin) || 0
    } };
  }
  if (p.length !== 4) return null;
  const group = p[2], id = p[3];

  if (group === "days") {
    return { table: "days", key: "trip_id=eq." + trip + "&day_date=eq." + id, row: {
      trip_id: trip, day_date: id, theme: body.theme || "", route: body.route || []
    } };
  }
  if (group === "items") {
    return { table: "items", key: "id=eq." + id, row: {
      id, trip_id: trip,
      day_date: body.dayDate,
      start_time: body.s || null,
      end_time: body.e || null,
      category: body.cat || "",     /* 분류는 안 골라도 된다 */
      meal: body.meal || null,
      mode: body.mode || null,          /* 이동 수단 */
      map_url: body.mapUrl || null,     /* 직접 적은 구글 지도 주소 */
      buys: body.buys || [],            /* 쇼핑 리스트 [{id, text, got}] */
      title: body.title || "",
      emoji: body.emo || "",
      tag: body.tag || null,
      marks: body.marks || [],          /* 예약 확정 · 현금 Only · 카드 Only — 태그와는 따로다 */
      places: body.places || [],
      lines: body.lines || [],
      ord: body.ord || 0
    } };
  }
  if (group === "shops") {
    return { table: "shops", key: "id=eq." + id, row: {
      id, trip_id: trip,
      day_date: body.dayDate || null,
      at_time: body.time || null,
      area: body.area || "",
      name: body.name || "",
      map_query: body.map || "",
      buy_list: body.items || [],
      ord: body.ord || 0
    } };
  }
  if (group === "attach") {
    /* 새 칸 없이: 모양이 있는 메모(rich)는 title이 그것을 말하고, 파일은 이름이 title · 조각 id가 photo_id ·
       조각 수 · 크기 · 종류가 text에 든다 */
    const kind = body.type || "note";
    return { table: "attachments", key: "id=eq." + id, row: {
      id, trip_id: trip,
      item_id: body.itemId || "",
      kind,
      title: kind === "note" ? (body.rich ? "rich" : null) : body.title || null,
      text: kind === "file"
        ? JSON.stringify({ parts: body.parts || 0, size: body.size || 0, mime: body.mime || "" })
        : body.text || null,
      url: body.url || null,
      photo_id: body.pid || null,
      ord: body.ord || 0
    } };
  }
  if (LIST_KINDS.indexOf(group) >= 0) {
    const row = { id, trip_id: trip, kind: group, ord: body.ord || 0,
                  tag: null, label: "", sub: null, detail: null, url: null, done: false };
    if (group === "flights") { row.tag = body.label || null; row.label = body.airline || ""; row.sub = body.no || null; row.detail = body.detail || null; }
    /* 숙소: 이름 · 지역 · 타입(룸) · 기간 · 메모. 새 칸은 period 하나뿐이다 — 타입은 tag, 메모는 detail에 얹는다. */
    else if (group === "stays") {
      row.label = body.name || ""; row.sub = body.area || null; row.tag = body.room || null;
      row.period = body.period == null ? "" : body.period; row.detail = body.memo || null;
      row.perks = body.perks || [];
      row.url = body.mapUrl || null;       /* 직접 적은 구글 지도 주소 */
      row.checkin_time = body.inAt || null;     /* 체크인 · 체크아웃 예상 시간 */
      row.checkout_time = body.outAt || null;
      /* 예약 플랫폼 — 화면이 보낸 때만 쓴다(고른 적 없는 숙소는 이 칸 없이도 저장된다). 비우면 null */
      if (body.platform !== undefined && body.platform !== null) row.platform = body.platform || null;
    }
    else if (group === "books") { row.label = body.name || ""; row.sub = body.when || null; row.detail = body.detail || null; }
    else if (group === "links") { row.label = body.title || ""; row.url = body.url || null; }
    /* 준비물: sub=묶음 id. 묶음(packGroups): label=이름 — 새 칸 없이 */
    else if (group === "packList") { row.label = body.text || ""; row.done = !!body.on; row.sub = body.grp || null; }
    else if (group === "packGroups") { row.label = body.name || ""; }
    /* 착장 탭 — 새 칸 없이. 옷: label=이름, tag=종류, sub=사진 id, detail=메모. 착장: label=상황, tag=날짜, detail=JSON[{kind, cloth}] */
    else if (group === "clothes") { row.label = body.name || ""; row.tag = body.kind || "etc"; row.sub = body.pid || null; row.detail = body.memo || null; }
    else if (group === "outfits") { row.label = body.label || ""; row.tag = body.dayDate || null; row.detail = JSON.stringify(body.slots || []); }
    /* 메모 탭의 링크 · 사진 · 파일: tag=종류(link|photo|file), label=제목(파일 이름), url=주소, sub=사진 · 파일 id,
       detail=사진의 메모(파일이면 조각 수 · 크기 · 종류) — 새 칸 없이 */
    else if (group === "tips") {
      row.tag = body.type === "photo" ? "photo" : body.type === "file" ? "file" : "link"; row.label = body.title || "";
      row.url = body.url || null; row.sub = body.pid || null;
      row.detail = body.type === "file"
        ? JSON.stringify({ parts: body.parts || 0, size: body.size || 0, mime: body.mime || "" })
        : body.memo || null;
    }
    /* 지나간 날의 날씨 기록: tag=날짜, label=도시, detail={hi,lo,code} — 새 칸 없이 */
    else if (group === "wx") { row.tag = body.date || id; row.label = body.city || ""; row.detail = JSON.stringify({ hi: body.hi, lo: body.lo, code: body.code }); }
    /* 메모: 모양이 있는 글이면(rich) detail에 걸러 낸 HTML이 들어 있고 tag가 그것을 말한다 */
    else { row.detail = body.text || ""; row.tag = body.rich ? "rich" : null; }
    return { table: "entries", key: "id=eq." + id, row };
  }
  return null;
}

function isoDate(value) {
  return value ? String(value).slice(0, 10) : value;
}

/* every row the plan is made of -> the document map the client reads */
const PREFIX = "travel/";

function toDocs(tables) {
  const docs = {};
  for (const row of tables.trips || []) {
    docs[PREFIX + "trips/" + row.id] = {
      pin: Number(row.ord) || 0, title: row.title || "",
      emoji: row.emoji || "", city: row.city || "", country: row.country || "",
      start: isoDate(row.start_date), end: isoDate(row.end_date)
    };
  }
  for (const row of tables.days || []) {
    docs[PREFIX + "trips/" + row.trip_id + "/days/" + isoDate(row.day_date)] = {
      theme: row.theme || "", route: row.route || []
    };
  }
  for (const row of tables.items || []) {
    docs[PREFIX + "trips/" + row.trip_id + "/items/" + row.id] = strip({
      dayDate: isoDate(row.day_date), s: row.start_time, e: row.end_time,
      cat: row.category, meal: row.meal, mode: row.mode, mapUrl: row.map_url,
      buys: row.buys || [], title: row.title, emo: row.emoji,
      tag: row.tag, marks: row.marks, places: row.places || [], lines: row.lines || [], ord: row.ord
    }, ["dayDate", "s", "e", "cat", "meal", "mode", "mapUrl", "buys", "title", "emo", "tag", "marks",
        "places", "lines", "ord"]);
  }
  for (const row of tables.shops || []) {
    docs[PREFIX + "trips/" + row.trip_id + "/shops/" + row.id] = strip({
      dayDate: isoDate(row.day_date), time: row.at_time, area: row.area,
      name: row.name, map: row.map_query, items: row.buy_list || [], ord: row.ord
    }, ["dayDate", "time", "area", "name", "map", "items", "ord"]);
  }
  for (const row of tables.entries || []) {
    let body;
    if (row.kind === "flights") body = { label: row.tag, airline: row.label, no: row.sub, detail: row.detail };
    else if (row.kind === "stays") {
      /* period 칸이 없던 때의 숙소는 기간과 메모가 detail 한 칸에 있다 — 화면이 갈라 읽는다 */
      const old = row.period === undefined || row.period === null;
      body = { name: row.label, area: row.sub, room: row.tag, period: row.period, perks: row.perks, mapUrl: row.url,
               inAt: row.checkin_time, outAt: row.checkout_time, platform: row.platform || undefined,
               memo: old ? undefined : row.detail, detail: old ? row.detail : undefined };
    }
    else if (row.kind === "books") body = { name: row.label, when: row.sub, detail: row.detail };
    else if (row.kind === "links") body = { title: row.label, url: row.url };
    else if (row.kind === "packList") body = { text: row.label, on: !!row.done, grp: row.sub || undefined };
    else if (row.kind === "packGroups") body = { name: row.label };
    else if (row.kind === "clothes") body = { name: row.label, kind: row.tag || "etc", pid: row.sub || undefined, memo: row.detail || undefined };
    else if (row.kind === "outfits") {
      let slots = [];
      try { slots = JSON.parse(row.detail || "[]") || []; } catch (e) { slots = []; }
      body = { label: row.label, dayDate: row.tag, slots: Array.isArray(slots) ? slots : [] };
    }
    else if (row.kind === "tips") {
      if (row.tag === "file") body = Object.assign({ type: "file", title: row.label, pid: row.sub }, fileMeta(row.detail));
      else body = { type: row.tag === "photo" ? "photo" : "link", title: row.label, url: row.url, pid: row.sub, memo: row.detail };
    }
    else if (row.kind === "wx") {
      let v = {};
      try { v = JSON.parse(row.detail || "{}") || {}; } catch (e) { v = {}; }
      body = { date: row.tag, city: row.label, hi: v.hi, lo: v.lo, code: v.code };
    }
    else body = { text: row.detail, rich: row.tag === "rich" ? true : undefined };
    body.ord = row.ord;
    docs[PREFIX + "trips/" + row.trip_id + "/" + row.kind + "/" + row.id] = strip(body, Object.keys(body));
  }
  for (const row of tables.attachments || []) {
    const base = { itemId: row.item_id, type: row.kind, title: row.title,
      text: row.text, url: row.url, pid: row.photo_id, ord: row.ord };
    if (row.kind === "note") { base.title = null; base.rich = row.title === "rich" ? true : null; }
    if (row.kind === "file") { base.text = null; Object.assign(base, fileMeta(row.text)); }
    docs[PREFIX + "trips/" + row.trip_id + "/attach/" + row.id] = strip(base,
      ["itemId", "type", "title", "text", "url", "pid", "ord", "rich", "parts", "size", "mime"]);
  }
  return docs;
}

const PLAN_TABLES = ["trips", "days", "items", "shops", "entries", "attachments"];

/* Six tables, asked for at once. In a row they cost six round trips to a
   database that may be a continent away, and the page waits for all of them. */
async function readPlan(store) {
  const got = await Promise.all(PLAN_TABLES.map((table) => store.select(table)));
  const tables = {};
  PLAN_TABLES.forEach((table, i) => { tables[table] = got[i] || []; });
  return toDocs(tables);
}

module.exports = { LIST_KINDS, PATH_OK, PLAN_TABLES, toRow, toDocs, readPlan };
