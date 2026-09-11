/*
 * The shared plan, for the copy served from plain hosting.
 *
 * One endpoint, one shape: a flat map of document path to body — the same
 * paths the app uses in the artifact's own store, so both copies run the
 * identical client code.
 *
 *   GET  /api/plan            -> { ok, rev, docs, locked }
 *   GET  /api/plan?rev=N      -> { ok, unchanged: true } while nothing moved
 *   GET  /api/plan?path=p     -> { ok, doc }            one document (photos)
 *   POST /api/plan            { writes: { path: body|null } } -> { ok, rev }
 *
 * A write needs the passcode in `x-lab-key`; reading never does. Set
 * LAB_PASSCODE to turn editing on — with it unset the plan is read-only for
 * everyone, which is the safe way to be misconfigured.
 *
 * Storage is whatever the project has. Both drivers speak HTTP, so this file
 * has no dependencies and the repo needs no build step:
 *
 *   Upstash Redis  KV_REST_API_URL + KV_REST_API_TOKEN
 *                  (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 *   Supabase       SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *                  table: lab_docs(path text primary key, body jsonb,
 *                                  rev bigint)
 */

const HASH = "lab:plan";      // path -> JSON body
const REV = "lab:rev";        // bumped on every write
const TABLE = "lab_docs";
const MAX_BODY = 1 << 20;     // 1 MB per request; a photo is ~200 KB

/* ---------------- Upstash Redis over its REST API ---------------- */
function upstash() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  async function pipe(commands) {
    const res = await fetch(url.replace(/\/$/, "") + "/pipeline", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify(commands)
    });
    if (!res.ok) throw new Error("upstash " + res.status + " " + (await res.text()).slice(0, 200));
    return (await res.json()).map((r) => r.result);
  }

  return {
    name: "upstash",
    async rev() {
      const [rev] = await pipe([["GET", REV]]);
      return Number(rev) || 0;
    },
    async all() {
      const [rev, flat] = await pipe([["GET", REV], ["HGETALL", HASH]]);
      const docs = {};
      // HGETALL comes back as [field, value, field, value, ...]
      for (let i = 0; i + 1 < (flat || []).length; i += 2) {
        if (flat[i].startsWith("photos/")) continue;   // too heavy to sync
        docs[flat[i]] = JSON.parse(flat[i + 1]);
      }
      return { rev: Number(rev) || 0, docs };
    },
    async one(path) {
      const [raw] = await pipe([["HGET", HASH, path]]);
      return raw ? JSON.parse(raw) : null;
    },
    async apply(writes) {
      const commands = [];
      const gone = [];
      for (const [path, body] of Object.entries(writes)) {
        if (body === null) gone.push(path);
        else commands.push(["HSET", HASH, path, JSON.stringify(body)]);
      }
      if (gone.length) commands.push(["HDEL", HASH, ...gone]);
      commands.push(["INCR", REV]);
      const out = await pipe(commands);
      return Number(out[out.length - 1]) || 0;
    }
  };
}

/* ---------------- Supabase over PostgREST ---------------- */
function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  const base = url.replace(/\/$/, "") + "/rest/v1/" + TABLE;
  const headers = {
    apikey: key,
    authorization: "Bearer " + key,
    "content-type": "application/json"
  };

  async function call(path, init) {
    const res = await fetch(base + path, { ...init, headers: { ...headers, ...(init && init.headers) } });
    if (!res.ok) throw new Error("supabase " + res.status + " " + (await res.text()).slice(0, 200));
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    name: "supabase",
    async rev() {
      const rows = await call("?select=rev&order=rev.desc&limit=1", { method: "GET" });
      return rows && rows.length ? Number(rows[0].rev) || 0 : 0;
    },
    async all() {
      const rows = (await call("?select=path,body,rev&path=not.like.photos/*", { method: "GET" })) || [];
      const docs = {};
      let rev = 0;
      for (const row of rows) {
        docs[row.path] = row.body;
        rev = Math.max(rev, Number(row.rev) || 0);
      }
      return { rev, docs };
    },
    async one(path) {
      const rows = await call("?select=body&path=eq." + encodeURIComponent(path), { method: "GET" });
      return rows && rows.length ? rows[0].body : null;
    },
    async apply(writes) {
      const rev = (await this.rev()) + 1;
      const rows = [];
      for (const [path, body] of Object.entries(writes)) {
        if (body === null) {
          await call("?path=eq." + encodeURIComponent(path), { method: "DELETE" });
        } else {
          rows.push({ path, body, rev });
        }
      }
      if (rows.length) {
        await call("", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(rows)
        });
      }
      return rev;
    }
  };
}

function driver() {
  return upstash() || supabase() || null;
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("too big");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/* A path is ours to write only if it looks like one of our documents. */
const PATH_OK = /^(meta|trips|photos)\/[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){0,3}$/;

module.exports = async function handler(req, res) {
  const store = driver();
  if (!store) {
    return json(res, 200, {
      ok: false,
      error: "setup",
      message:
        "저장소가 아직 없습니다. Vercel 프로젝트에 Upstash Redis(KV_REST_API_URL, KV_REST_API_TOKEN) " +
        "또는 Supabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 환경변수를 넣어주세요."
    });
  }

  const passcode = process.env.LAB_PASSCODE || "";

  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://x");
      const one = url.searchParams.get("path");
      if (one) {
        if (!PATH_OK.test(one)) return json(res, 400, { ok: false, error: "path" });
        return json(res, 200, { ok: true, doc: await store.one(one) });
      }
      const since = Number(url.searchParams.get("rev") || 0);
      if (since > 0) {
        const rev = await store.rev();
        if (rev === since) return json(res, 200, { ok: true, unchanged: true, rev });
      }
      const snap = await store.all();
      return json(res, 200, { ok: true, rev: snap.rev, docs: snap.docs, locked: !passcode });
    }

    if (req.method === "POST") {
      if (!passcode) return json(res, 403, { ok: false, error: "setup", message: "LAB_PASSCODE가 설정되지 않아 편집이 잠겨 있습니다." });
      if ((req.headers["x-lab-key"] || "") !== passcode) return json(res, 401, { ok: false, error: "key" });

      const body = await readBody(req);
      const writes = (body && body.writes) || {};
      const paths = Object.keys(writes);
      if (!paths.length) return json(res, 400, { ok: false, error: "empty" });
      if (paths.length > 200) return json(res, 400, { ok: false, error: "too many writes" });
      for (const path of paths) {
        if (!PATH_OK.test(path)) return json(res, 400, { ok: false, error: "path", path });
        const value = writes[path];
        if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
          return json(res, 400, { ok: false, error: "body", path });
        }
      }
      return json(res, 200, { ok: true, rev: await store.apply(writes) });
    }

    res.setHeader("allow", "GET, POST");
    return json(res, 405, { ok: false, error: "method" });
  } catch (e) {
    return json(res, 502, { ok: false, error: "store", message: String(e && e.message || e).slice(0, 300) });
  }
};
