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
const tables = require("./_tables.js");

module.exports = async function handler(req, res) {
  const cfg = lib.env();
  if (cfg.missing.length) return lib.setupError(res, cfg.missing);

  const gated = lib.loginRequired();
  const who = lib.session(req, cfg.secret);
  if (!who && gated) return lib.json(res, 401, { ok: false, error: "signin" });

  const store = lib.db(cfg);

  try {
    const url = new URL(req.url, "http://x");
    const since = req.method === "GET" ? Number(url.searchParams.get("rev") || 0) : 0;
    const onePath = req.method === "GET" ? url.searchParams.get("path") : null;

    /* Everything this request needs, asked for at the same time. A poll says
       which revision it has, so it only needs the number back. */
    const [row, rev, docs] = await Promise.all([
      who ? lib.member(store, who.id) : null,
      req.method === "GET" && !onePath ? store.rev() : null,
      req.method === "GET" && !onePath && !since ? tables.readPlan(store) : null
    ]);
    if (!row && gated) return lib.json(res, 401, { ok: false, error: "signin" });

    /* With the door open there is nobody to be: everyone reads and writes. */
    const open = !gated && !row;
    const me = row
      ? { name: row.name, avatar: row.avatar, canEdit: !!row.can_edit, isOwner: !!row.is_owner }
      : null;

    if (req.method === "GET") {
      const one = onePath;
      if (one) {
        if (!tables.PATH_OK.test(one) || one.indexOf("blobs/") !== 0) {
          return lib.json(res, 400, { ok: false, error: "path" });
        }
        const rows = await store.select("photos", "select=data&id=eq." + encodeURIComponent(one.slice(6)));
        return lib.json(res, 200, { ok: true, doc: rows && rows.length ? { data: rows[0].data } : null });
      }

      if (since > 0 && since === rev) return lib.json(res, 200, { ok: true, unchanged: true, rev, me, open });
      return lib.json(res, 200, {
        ok: true, rev, me, open,
        docs: docs || (await tables.readPlan(store))
      });
    }

    if (req.method === "POST") {
      if (!open && !row.can_edit) return lib.json(res, 403, { ok: false, error: "readonly" });

      const body = await lib.readBody(req);
      const writes = (body && body.writes) || {};
      const paths = Object.keys(writes);
      if (!paths.length) return lib.json(res, 400, { ok: false, error: "empty" });
      if (paths.length > 400) return lib.json(res, 400, { ok: false, error: "too many writes" });

      /* group first, so one import is a handful of statements, not hundreds */
      const puts = {}, dels = {};
      for (const path of paths) {
        if (!tables.PATH_OK.test(path)) return lib.json(res, 400, { ok: false, error: "path", path });
        const value = writes[path];
        if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
          return lib.json(res, 400, { ok: false, error: "body", path });
        }
        const mapped = tables.toRow(path, value || {});
        if (!mapped) return lib.json(res, 400, { ok: false, error: "path", path });
        if (value === null) (dels[mapped.table] = dels[mapped.table] || []).push(mapped.key);
        else (puts[mapped.table] = puts[mapped.table] || []).push(mapped.row);
      }

      await Promise.all(Object.keys(puts).map((table) => store.upsert(table, puts[table])));
      await Promise.all(
        Object.keys(dels).flatMap((table) => dels[table].map((key) => store.remove(table, key)))
      );

      return lib.json(res, 200, { ok: true, rev: await store.bumpRev() });
    }

    res.setHeader("allow", "GET, POST");
    return lib.json(res, 405, { ok: false, error: "method" });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "store", message: String(e.message || e).slice(0, 300) });
  }
};
