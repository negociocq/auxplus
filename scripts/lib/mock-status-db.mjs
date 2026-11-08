export function mockStatusDb(initial = {}) {
  let sequence = 0;
  const db = { tables: structuredClone(initial), async rpc(name, { p_user, p_token }) {
    if (name !== "claim_status_delivery") throw Error("Unexpected RPC");
    const rows = db.tables.wa_status_delivery_locks ||= [], existing = rows.find(row => row.user_id === p_user);
    if (existing && Date.parse(existing.expires_at) > Date.now()) return { data: false, error: null };
    const lock = { user_id: p_user, token: p_token, expires_at: new Date(Date.now() + 360000).toISOString() };
    if (existing) Object.assign(existing, lock); else rows.push(lock);
    return { data: true, error: null };
  }, from(name) {
    const table = db.tables[name] ||= [];
    let mode = "select", payload, options, single = false, max = Infinity;
    const filters = [], orders = [];
    const q = { select() { return q; }, eq(key, value) { filters.push(row => row[key] === value); return q; },
      in(key, values) { filters.push(row => values.includes(row[key])); return q; },
      or(expression) { const tests = expression.split(",").map(part => {
        const [key, op, ...rest] = part.split("."), value = rest.join(".");
        return row => op === "is" ? row[key] == null : op === "lt" ? row[key] < value : row[key] === (value === "true" ? true : value === "false" ? false : value);
      }); filters.push(row => tests.some(test => test(row))); return q; },
      order(key, options = {}) { orders.push([key, options.ascending !== false]); return q; },
      limit(value) { max = value; return q; }, maybeSingle() { single = true; return q; },
      update(value) { mode = "update"; payload = value; return q; },
      insert(value) { mode = "insert"; payload = value; return q; },
      upsert(value, opts) { mode = "upsert"; payload = value; options = opts; return q; },
      delete() { mode = "delete"; return q; },
      then(resolve, reject) { try {
        let rows = table.filter(row => filters.every(test => test(row)));
        rows.sort((a, b) => { for (const [key, ascending] of orders) { const n = String(a[key] ?? "").localeCompare(String(b[key] ?? "")); if (n) return ascending ? n : -n; } return 0; });
        rows = rows.slice(0, max);
        if (mode === "update") rows.forEach(row => Object.assign(row, structuredClone(payload)));
        if (mode === "delete") rows.forEach(row => table.splice(table.indexOf(row), 1));
        if (["insert", "upsert"].includes(mode)) {
          for (const row of Array.isArray(payload) ? payload : [payload]) {
            const fields = options?.onConflict?.split(",") || ["user_id"];
            const existing = mode === "upsert" && table.find(old => fields.every(key => old[key] === row[key]));
            if (existing) { if (!options?.ignoreDuplicates) Object.assign(existing, structuredClone(row)); }
            else table.push({ ...(name.endsWith("settings") ? { enabled: false, send_time: "09:00", pages_per_kind: 1, lease_until: null } : { id: `mock-${++sequence}`, status: "queued", ...(name.endsWith("posts") && name.startsWith("wa_football") ? { recovery_attempts: 0 } : {}) }), ...structuredClone(row) });
          }
          rows = [];
        }
        return Promise.resolve({ data: single ? rows[0] ? structuredClone(rows[0]) : null : structuredClone(rows), error: null }).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); } },
    }; return q;
  } }; return db;
}
