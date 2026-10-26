/*
 * The plan itself. Signing in is required to read it, and editing is required
 * to change it.
 *
 *   GET  /api/plan            -> { ok, rev, docs, me }
 *   GET  /api/plan?rev=N      -> { ok, unchanged: true } while nothing moved
 *   GET  /api/plan?path=p     -> { ok, doc }            one document (photos)
 *   POST /api/plan            { writes: { path: body|null } } -> { ok, rev }
 */
const lib = require("./_core.js");
const exp = require("./_travel.js");

module.exports = async function handler(req, res) {
  const cfg = lib.env();
  if (cfg.missing.length) return lib.setupError(res, cfg.missing);

  const who = lib.session(req, cfg.secret);
  if (!who) return lib.json(res, 401, { ok: false, error: "signin" });

  const store = lib.db(cfg);

  try {
    const row = await lib.member(store, who.id);
    if (!row) return lib.json(res, 401, { ok: false, error: "signin" });
    const me = { name: row.name, avatar: row.avatar, canEdit: !!row.can_edit, isOwner: !!row.is_owner };

    if (req.method === "GET") {
      const url = new URL(req.url, "http://x");
      const one = url.searchParams.get("path");
      if (one) {
        if (!exp.PATH_OK.test(one) || one.indexOf("blobs/") !== 0) {
          return lib.json(res, 400, { ok: false, error: "path" });
        }
        const rows = await store.select("photos", "select=data&id=eq." + encodeURIComponent(one.slice(6)));
        return lib.json(res, 200, { ok: true, doc: rows && rows.length ? { data: rows[0].data } : null });
      }

      const rev = await store.rev();
      const since = Number(url.searchParams.get("rev") || 0);
      if (since > 0 && since === rev) return lib.json(res, 200, { ok: true, unchanged: true, rev, me });
      return lib.json(res, 200, { ok: true, rev, docs: await exp.readPlan(store), me });
    }

    if (req.method === "POST") {
      if (!row.can_edit) return lib.json(res, 403, { ok: false, error: "readonly" });

      const body = await lib.readBody(req);
      const writes = (body && body.writes) || {};
      const paths = Object.keys(writes);
      if (!paths.length) return lib.json(res, 400, { ok: false, error: "empty" });
      if (paths.length > 400) return lib.json(res, 400, { ok: false, error: "too many writes" });

      /* group first, so one import is a handful of statements, not hundreds */
      const puts = {}, dels = {};
      for (const path of paths) {
        if (!exp.PATH_OK.test(path)) return lib.json(res, 400, { ok: false, error: "path", path });
        const value = writes[path];
        if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
          return lib.json(res, 400, { ok: false, error: "body", path });
        }
        const mapped = exp.toRow(path, value || {});
        if (!mapped) return lib.json(res, 400, { ok: false, error: "path", path });
        if (value === null) (dels[mapped.table] = dels[mapped.table] || []).push(mapped.key);
        else (puts[mapped.table] = puts[mapped.table] || []).push(mapped.row);
      }

      for (const table of Object.keys(puts)) await store.upsert(table, puts[table]);
      for (const table of Object.keys(dels)) {
        for (const key of dels[table]) await store.remove(table, key);
      }

      return lib.json(res, 200, { ok: true, rev: await store.bumpRev() });
    }

    res.setHeader("allow", "GET, POST");
    return lib.json(res, 405, { ok: false, error: "method" });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "store", message: String(e.message || e).slice(0, 300) });
  }
};
