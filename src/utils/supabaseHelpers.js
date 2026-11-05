// Shared helpers for talking to Supabase/PostgREST.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const toSnake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// DB rows use snake_case; the API contract stays camelCase.
// customer_ref / order_ref are exposed as `customer` / `order` like the old API.
const mapRow = (row) => {
  if (!row) return row;
  const out = {};
  for (const key of Object.keys(row)) {
    out[toCamel(key)] = row[key];
  }
  if ('customerRef' in out) {
    out.customer = out.customerRef;
    delete out.customerRef;
  }
  if ('orderRef' in out) {
    out.order = out.orderRef;
    delete out.orderRef;
  }
  return out;
};

const mapRows = (rows) => (rows || []).map(mapRow);

// Strip characters that would break a PostgREST `or=(...)` filter string.
const sanitizeSearch = (value) =>
  String(value || '')
    .replace(/[%(),*]/g, '')
    .trim();

const RESERVED_FIELDS = new Set(['id', '_id', 'createdAt', 'updatedAt']);

const toSnakeFields = (obj) => {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (RESERVED_FIELDS.has(key) || value === undefined) continue;
    out[toSnake(key)] = value;
  }
  return out;
};

const throwIfError = (error) => {
  if (!error) return;
  const err = new Error(error.message);
  err.code = error.code;
  err.details = error.details;
  throw err;
};

module.exports = {
  isUuid,
  toCamel,
  toSnake,
  mapRow,
  mapRows,
  sanitizeSearch,
  toSnakeFields,
  throwIfError
};
