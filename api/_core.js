/*
 * The site's own server side: who is signed in, who may edit, and how to reach
 * the database. It knows nothing about any experiment — the translation from
 * one experiment's documents to its tables lives in api/_<experiment>.js.
 *
 * No dependencies: the repo stays build-free.
 */

const crypto = require("crypto");

const COOKIE = "bemlab_s";
const SESSION_DAYS = 30;

/*
 * The door.
 *
 * Off: no sign-in screen, and anyone who has the address can read and write.
 * On: Kakao sign-in is required to read, and editing is granted per person.
 *
 * The whole sign-in path — /api/auth/*, the members table, the screen — is
 * still here and still works; this only decides whether anyone is stopped at
 * it. Turn it back on with LOGIN_REQUIRED=1 in the host's environment, or by
 * flipping the default below.
 */
function loginRequired() {
  const want = String(process.env.LOGIN_REQUIRED || "").toLowerCase();
  if (want === "1" || want === "true" || want === "on") return true;
  if (want === "0" || want === "false" || want === "off") return false;
  return false;   /* 지금은 닫혀 있다 */
}

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


/* ---------------- requests ---------------- */
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
  COOKIE,
  env, json, setupError, loginRequired,
  sign, unsign, readCookie, setSession, clearSession, session,
  db, touchMember, member, readBody, origin
};
