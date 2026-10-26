/*
 * Shared by every endpoint. No dependencies: the repo stays build-free.
 *
 * The client speaks one shape — a flat map of document path to body — and the
 * database holds real tables you can read in the Supabase editor. The
 * translation between the two lives here, in one place, so neither side has to
 * know about the other.
 */

const crypto = require("crypto");

const COOKIE = "bemlab_s";
const SESSION_DAYS = 30;
const LIST_KINDS = ["flights", "stays", "books", "links", "packList", "notes"];

/* ---------------- environment ---------------- */

function env() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.KAKAO_REST_API_KEY) missing.push("KAKAO_REST_API_KEY");
  if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");
  return {
    url, key,
    kakaoKey: process.env.KAKAO_REST_API_KEY || "",
    kakaoSecret: process.env.KAKAO_CLIENT_SECRET || "",
    secret: process.env.SESSION_SECRET || "",
    missing
  };
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function setupError(res, missing) {
  return json(res, 200, {
    ok: false,
    error: "setup",
    message: "환경변수가 아직 없습니다: " + missing.join(", ") + ". Vercel 프로젝트 설정에 넣고 다시 배포해주세요."
  });
}

/* ---------------- signed values ---------------- */

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + mac;
}

function unsign(token, secret) {
  if (!token || typeof token !== "string" || token.indexOf(".") < 0) return null;
  const cut = token.lastIndexOf(".");
  const body = token.slice(0, cut);
  const mac = token.slice(cut + 1);
  const want = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const got = Buffer.from(mac);
  const expected = Buffer.from(want);
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  return payload;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const bit = part.trim();
    if (bit.startsWith(name + "=")) return decodeURIComponent(bit.slice(name.length + 1));
  }
  return null;
}

function setSession(res, payload, secret) {
  const token = sign(payload, secret);
  res.setHeader("set-cookie",
    COOKIE + "=" + encodeURIComponent(token) +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + SESSION_DAYS * 24 * 3600);
}

function clearSession(res) {
  res.setHeader("set-cookie", COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

function session(req, secret) {
  return unsign(readCookie(req, COOKIE), secret);
}

/* ---------------- the database ---------------- */

function db(cfg) {
  const headers = {
    apikey: cfg.key,
    authorization: "Bearer " + cfg.key,
    "content-type": "application/json"
  };

  async function call(path, init) {
    const res = await fetch(cfg.url + "/rest/v1/" + path, {
      ...init,
      headers: { ...headers, ...((init && init.headers) || {}) }
    });
    const text = await res.text();
    if (!res.ok) throw new Error("db " + res.status + " " + path + " " + text.slice(0, 300));
    return text ? JSON.parse(text) : null;
  }

  return {
    select: (table, query) => call(table + "?" + (query || "select=*"), { method: "GET" }),
    upsert: (table, rows) => rows.length
      ? call(table, {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(rows)
        })
      : Promise.resolve(null),
    remove: (table, query) => call(table + "?" + query, { method: "DELETE", headers: { prefer: "return=minimal" } }),
    async rev() {
      const rows = await call("meta?key=eq.rev&select=body", { method: "GET" });
      return (rows && rows.length && Number(rows[0].body.n)) || 0;
    },
    async bumpRev() {
      const next = (await this.rev()) + 1;
      await this.upsert("meta", [{ key: "rev", body: { n: next } }]);
      return next;
    }
  };
}

/* ---------------- members ---------------- */

/* The first person to sign in owns the plan; everyone after that can look, and
   edits only once the owner says so. Nobody has to be named in a config file. */
async function touchMember(store, profile) {
  const existing = await store.select("members", "select=*&kakao_id=eq." + encodeURIComponent(profile.id));
  if (existing && existing.length) {
    const row = existing[0];
    await store.upsert("members", [{
      kakao_id: row.kakao_id,
      name: profile.name || row.name,
      avatar: profile.avatar || row.avatar,
      can_edit: row.can_edit,
      is_owner: row.is_owner,
      joined_at: row.joined_at,
      seen_at: new Date().toISOString()
    }]);
    return row;
  }
  const all = await store.select("members", "select=kakao_id&limit=1");
  const first = !all || !all.length;
  const row = {
    kakao_id: profile.id,
    name: profile.name || "",
    avatar: profile.avatar || "",
    can_edit: first,
    is_owner: first,
    seen_at: new Date().toISOString()
  };
  await store.upsert("members", [row]);
  return row;
}

async function member(store, kakaoId) {
  const rows = await store.select("members", "select=*&kakao_id=eq." + encodeURIComponent(kakaoId));
  return rows && rows.length ? rows[0] : null;
}

/* ---------------- paths <-> rows ---------------- */

const PATH_OK = /^(meta|trips|photos)\/[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){0,3}$/;

function strip(body, keys) {
  const out = {};
  for (const key of keys) if (body[key] !== undefined && body[key] !== null) out[key] = body[key];
  return out;
}

/* one document -> {table, row} or null when the path is not ours */
function toRow(path, body) {
  const p = path.split("/");
  if (p[0] === "photos" && p.length === 2) {
    return { table: "photos", key: "id=eq." + p[1], row: { id: p[1], data: String(body.data || "") } };
  }
  if (p[0] === "meta" && p.length === 2) {
    return { table: "meta", key: "key=eq." + p[1], row: { key: p[1], body: body } };
  }
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
function toDocs(tables) {
  const docs = {};
  for (const row of tables.trips || []) {
    docs["trips/" + row.id] = {
      emoji: row.emoji || "", city: row.city || "", country: row.country || "",
      start: isoDate(row.start_date), end: isoDate(row.end_date)
    };
  }
  for (const row of tables.days || []) {
    docs["trips/" + row.trip_id + "/days/" + isoDate(row.day_date)] = {
      theme: row.theme || "", route: row.route || []
    };
  }
  for (const row of tables.items || []) {
    docs["trips/" + row.trip_id + "/items/" + row.id] = strip({
      dayDate: isoDate(row.day_date), s: row.start_time, e: row.end_time,
      cat: row.category, meal: row.meal, title: row.title, emo: row.emoji,
      tag: row.tag, places: row.places || [], lines: row.lines || [], ord: row.ord
    }, ["dayDate", "s", "e", "cat", "meal", "title", "emo", "tag", "places", "lines", "ord"]);
  }
  for (const row of tables.shops || []) {
    docs["trips/" + row.trip_id + "/shops/" + row.id] = strip({
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
    docs["trips/" + row.trip_id + "/" + row.kind + "/" + row.id] = strip(body, Object.keys(body));
  }
  for (const row of tables.attachments || []) {
    docs["trips/" + row.trip_id + "/attach/" + row.id] = strip({
      itemId: row.item_id, type: row.kind, title: row.title,
      text: row.text, url: row.url, pid: row.photo_id, ord: row.ord
    }, ["itemId", "type", "title", "text", "url", "pid", "ord"]);
  }
  return docs;
}

const PLAN_TABLES = ["trips", "days", "items", "shops", "entries", "attachments"];

async function readPlan(store) {
  const tables = {};
  for (const table of PLAN_TABLES) tables[table] = (await store.select(table)) || [];
  return toDocs(tables);
}

async function readBody(req, limit) {
  if (req.body) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > (limit || 1 << 20)) throw new Error("too big");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function origin(req) {
  /* Behind Vercel the proxy says; locally the socket does. Guessing https for
     a plain connection would send Kakao to a callback that cannot answer. */
  const proto = req.headers["x-forwarded-proto"] ||
    (req.socket && req.socket.encrypted ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return proto + "://" + host;
}

module.exports = {
  COOKIE, LIST_KINDS, PATH_OK, PLAN_TABLES,
  env, json, setupError, sign, unsign, readCookie, setSession, clearSession, session,
  db, touchMember, member, toRow, toDocs, readPlan, readBody, origin
};
