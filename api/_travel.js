/*
 * 여행 계획 (travel) — the one place that knows both the documents the page
 * saves and the tables they are kept in.
 *
 *   travel/trips/<id>                -> trips
 *   travel/trips/<id>/days/<date>    -> days
 *   travel/trips/<id>/items/<id>     -> items
 *   travel/trips/<id>/shops/<id>     -> shops
 *   travel/trips/<id>/<목록>/<id>     -> entries (kind)
 *   travel/trips/<id>/attach/<id>    -> attachments
 *   blobs/<id>                       -> photos
 *
 * Another experiment gets its own file like this one; nothing here is shared.
 */

const LIST_KINDS = ["flights", "stays", "books", "links", "packList", "notes"];

/* ---------------- paths <-> rows ---------------- */

const PATH_OK = /^(meta|travel|blobs)\/[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){0,4}$/;

function strip(body, keys) {
  const out = {};
  for (const key of keys) if (body[key] !== undefined && body[key] !== null) out[key] = body[key];
  return out;
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
  /* 여행 계획's documents live under travel/trips/... */
  if (p[0] !== "travel") return null;
  p = p.slice(1);
  if (p[0] !== "trips" || !p[1]) return null;
  const trip = p[1];

  if (p.length === 2) {
    return { table: "trips", key: "id=eq." + trip, row: {
      id: trip,
      emoji: body.emoji || "",
      city: body.city || "",
      country: body.country || "",
      start_date: body.start || null,
      end_date: body.end || null
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
      category: body.cat || "todo",
      meal: body.meal || null,
      title: body.title || "",
      emoji: body.emo || "",
      tag: body.tag || null,
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
    return { table: "attachments", key: "id=eq." + id, row: {
      id, trip_id: trip,
      item_id: body.itemId || "",
      kind: body.type || "note",
      title: body.title || null,
      text: body.text || null,
      url: body.url || null,
      photo_id: body.pid || null,
      ord: body.ord || 0
    } };
  }
  if (LIST_KINDS.indexOf(group) >= 0) {
    const row = { id, trip_id: trip, kind: group, ord: body.ord || 0,
                  tag: null, label: "", sub: null, detail: null, url: null, done: false };
    if (group === "flights") { row.tag = body.label || null; row.label = body.airline || ""; row.sub = body.no || null; row.detail = body.detail || null; }
    else if (group === "stays") { row.label = body.name || ""; row.sub = body.area || null; row.detail = body.detail || null; }
    else if (group === "books") { row.label = body.name || ""; row.sub = body.when || null; row.detail = body.detail || null; }
    else if (group === "links") { row.label = body.title || ""; row.url = body.url || null; }
    else if (group === "packList") { row.label = body.text || ""; row.done = !!body.on; }
    else { row.detail = body.text || ""; }
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
      cat: row.category, meal: row.meal, title: row.title, emo: row.emoji,
      tag: row.tag, places: row.places || [], lines: row.lines || [], ord: row.ord
    }, ["dayDate", "s", "e", "cat", "meal", "title", "emo", "tag", "places", "lines", "ord"]);
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
    else if (row.kind === "stays") body = { name: row.label, area: row.sub, detail: row.detail };
    else if (row.kind === "books") body = { name: row.label, when: row.sub, detail: row.detail };
    else if (row.kind === "links") body = { title: row.label, url: row.url };
    else if (row.kind === "packList") body = { text: row.label, on: !!row.done };
    else body = { text: row.detail };
    body.ord = row.ord;
    docs[PREFIX + "trips/" + row.trip_id + "/" + row.kind + "/" + row.id] = strip(body, Object.keys(body));
  }
  for (const row of tables.attachments || []) {
    docs[PREFIX + "trips/" + row.trip_id + "/attach/" + row.id] = strip({
      itemId: row.item_id, type: row.kind, title: row.title,
      text: row.text, url: row.url, pid: row.photo_id, ord: row.ord
    }, ["itemId", "type", "title", "text", "url", "pid", "ord"]);
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
