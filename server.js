const path = require("path");
const fs = require("fs");
const express = require("express");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const dbUrl = process.env.DATABASE_URL;
const startedAt = Date.now();
const appVersion = "1.1.0";
const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : null;
const backupIntervalMin = Number(process.env.BACKUP_INTERVAL_MIN || 0);

app.use(express.json({ limit: "100mb" }));

let pool = null;
let fallbackState = sanitizeState({});
let writeQueue = Promise.resolve();
if (dbUrl) {
  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  pool.on("error", (error) => {
    console.error("Postgres pool error:", error.message);
  });
}

function isDeadlockError(error) {
  return Boolean(
    error &&
    (error.code === "40P01" || /deadlock/i.test(asString(error.message, "")))
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDeadlockRetry(fn, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isDeadlockError(error) || i === attempts - 1) {
        throw error;
      }
      await sleep(50 * (i + 1));
    }
  }
  throw lastError || new Error("Unknown write failure");
}

function enqueueWrite(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function initDb() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS snacks (
      id BIGINT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT,
      image TEXT,
      price INTEGER NOT NULL,
      cost_price INTEGER NOT NULL DEFAULT 0,
      sell_price INTEGER NOT NULL DEFAULT 0,
      total_sold INTEGER NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS customers (
      name TEXT PRIMARY KEY,
      shift TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      display_name TEXT NOT NULL,
      aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
      role TEXT NOT NULL DEFAULT 'staff'
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      actor_id BIGINT,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL DEFAULT 'staff',
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      snack_id BIGINT,
      snack_name TEXT NOT NULL,
      snack_emoji TEXT,
      snack_image TEXT,
      snack_stock INTEGER,
      price INTEGER NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      unit_cost INTEGER NOT NULL DEFAULT 0,
      unit_price INTEGER NOT NULL DEFAULT 0,
      line_revenue INTEGER NOT NULL DEFAULT 0,
      line_cost INTEGER NOT NULL DEFAULT 0,
      line_profit INTEGER NOT NULL DEFAULT 0,
      purchased_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_purchased_at ON purchases (purchased_at DESC);
    CREATE INDEX IF NOT EXISTS idx_purchases_customer ON purchases (customer_name);

    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff';
    UPDATE users SET role = 'staff' WHERE role IS NULL OR role = '';

    ALTER TABLE snacks ADD COLUMN IF NOT EXISTS cost_price INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE snacks ADD COLUMN IF NOT EXISTS sell_price INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE snacks ADD COLUMN IF NOT EXISTS total_sold INTEGER NOT NULL DEFAULT 0;
    UPDATE snacks SET sell_price = price WHERE sell_price = 0;
    UPDATE snacks SET total_sold = 0 WHERE total_sold IS NULL;

    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS qty INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS unit_cost INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS unit_price INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS line_revenue INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS line_cost INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS line_profit INTEGER NOT NULL DEFAULT 0;
    UPDATE purchases
    SET unit_price = price, line_revenue = price, line_profit = price
    WHERE unit_price = 0 AND qty = 1;

    UPDATE snacks s
    SET total_sold = sub.sold_qty
    FROM (
      SELECT snack_id, COALESCE(SUM(qty), 0)::int AS sold_qty
      FROM purchases
      WHERE snack_id IS NOT NULL
      GROUP BY snack_id
    ) sub
    WHERE s.id = sub.snack_id AND s.total_sold = 0;
  `);

  await migrateLegacyStateIfNeeded();
}

function sanitizeState(input) {
  const data = input && typeof input === "object" ? input : {};

  return {
    snacks: Array.isArray(data.snacks) ? data.snacks : [],
    customers: Array.isArray(data.customers) ? data.customers : [],
    purchases: Array.isArray(data.purchases) ? data.purchases : [],
    users: Array.isArray(data.users) ? data.users : [],
    auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : []
  };
}

function asString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeSnack(snack, idx) {
  const id = asInt(snack?.id, idx + 1);
  const sellPrice = asInt(snack?.sellPrice ?? snack?.price, 0);
  const costPrice = asInt(snack?.costPrice, 0);
  const totalSold = asInt(snack?.totalSold, 0);
  return {
    id,
    name: asString(snack?.name, `Snack ${id}`),
    emoji: snack?.emoji ? asString(snack.emoji) : null,
    image: snack?.image ? asString(snack.image) : null,
    price: Math.max(0, sellPrice),
    costPrice: Math.max(0, costPrice),
    sellPrice: Math.max(0, sellPrice),
    totalSold: Math.max(0, totalSold),
    stock: Math.max(0, asInt(snack?.stock, 0))
  };
}

function normalizeCustomer(customer) {
  return {
    name: asString(customer?.name).trim(),
    shift: asString(customer?.shift || "A").toUpperCase().slice(0, 1)
  };
}

function normalizeUser(user, idx) {
  const aliases = Array.isArray(user?.aliases)
    ? user.aliases.map((v) => asString(v).trim()).filter(Boolean)
    : [];
  const role = user?.role === "admin" ? "admin" : "staff";

  return {
    id: asInt(user?.id, idx + 1),
    displayName: asString(user?.displayName, `User ${idx + 1}`),
    aliases,
    role
  };
}

function ensureAtLeastOneAdmin(users) {
  if (!Array.isArray(users) || users.length === 0) return users;
  if (users.some((u) => u?.role === "admin")) return users;
  const cloned = users.map((u) => ({ ...u }));
  cloned[0].role = "admin";
  return cloned;
}

function normalizeAuditLog(row, idx) {
  return {
    id: asString(row?.id, `${Date.now()}_${idx}`),
    action: asString(row?.action, "unknown.action").slice(0, 80),
    detail: asString(row?.detail, "").slice(0, 400),
    actorId: row?.actorId !== undefined && row?.actorId !== null ? asInt(row.actorId, null) : null,
    actorName: asString(row?.actorName, "Unknown").slice(0, 80),
    actorRole: row?.actorRole === "admin" ? "admin" : "staff",
    meta: row?.meta && typeof row.meta === "object" ? row.meta : {},
    at: new Date(row?.at || Date.now()).toISOString()
  };
}

function validateState(state) {
  const errors = [];
  if (state.snacks.length > 3000) errors.push("snacks exceeds limit");
  if (state.customers.length > 10000) errors.push("customers exceeds limit");
  if (state.users.length > 1000) errors.push("users exceeds limit");
  if (state.purchases.length > 200000) errors.push("purchases exceeds limit");
  if (state.auditLogs.length > 200000) errors.push("auditLogs exceeds limit");

  state.snacks.forEach((s, i) => {
    if (!asString(s?.name).trim()) errors.push(`snacks[${i}] name is required`);
    if (asInt(s?.price, 0) < 0) errors.push(`snacks[${i}] price must be >= 0`);
    if (asInt(s?.stock, 0) < 0) errors.push(`snacks[${i}] stock must be >= 0`);
    if (asInt(s?.costPrice, 0) < 0) errors.push(`snacks[${i}] costPrice must be >= 0`);
    if (asInt(s?.totalSold, 0) < 0) errors.push(`snacks[${i}] totalSold must be >= 0`);
  });

  state.customers.forEach((c, i) => {
    const shift = asString(c?.shift, "").toUpperCase();
    if (!asString(c?.name).trim()) errors.push(`customers[${i}] name is required`);
    if (!["A", "B", "C", "D"].includes(shift)) errors.push(`customers[${i}] shift invalid`);
  });

  state.users.forEach((u, i) => {
    if (!asString(u?.displayName).trim()) errors.push(`users[${i}] displayName is required`);
    if (u?.role && !["admin", "staff"].includes(u.role)) errors.push(`users[${i}] role invalid`);
  });
  if (state.users.length > 0 && !state.users.some((u) => u?.role === "admin")) {
    errors.push("at least one admin user is required");
  }

  state.purchases.forEach((p, i) => {
    if (!asString(p?.customerName).trim()) errors.push(`purchases[${i}] customerName is required`);
    if (asInt(p?.price, 0) < 0) errors.push(`purchases[${i}] price must be >= 0`);
  });

  return errors;
}

function normalizePurchase(purchase, idx) {
  const snack = purchase?.snack && typeof purchase.snack === "object" ? purchase.snack : {};
  const iso = new Date(purchase?.date || Date.now()).toISOString();
  const qty = Math.max(1, asInt(purchase?.qty, 1));
  const unitPrice = Math.max(0, asInt(purchase?.unitPrice ?? purchase?.price ?? snack?.sellPrice ?? snack?.price, 0));
  const unitCost = Math.max(0, asInt(purchase?.unitCost ?? snack?.costPrice, 0));
  const lineRevenue = qty * unitPrice;
  const lineCost = qty * unitCost;
  const lineProfit = lineRevenue - lineCost;

  return {
    id: asString(purchase?.id, `${Date.now()}_${idx}`),
    customerName: asString(purchase?.customerName, "Unknown"),
    snackId: snack?.id !== undefined && snack?.id !== null ? asInt(snack.id, null) : null,
    snackName: asString(snack?.name, "Unknown"),
    snackEmoji: snack?.emoji ? asString(snack.emoji) : null,
    snackImage: snack?.image ? asString(snack.image) : null,
    snackStock: snack?.stock !== undefined && snack?.stock !== null ? asInt(snack.stock, null) : null,
    price: unitPrice,
    qty,
    unitCost,
    unitPrice,
    lineRevenue,
    lineCost,
    lineProfit,
    purchasedAt: iso
  };
}

async function writeStateTx(client, state) {
  const snacksRaw = state.snacks.map(normalizeSnack);
  const customersRaw = state.customers.map(normalizeCustomer).filter((c) => c.name);
  const usersRaw = ensureAtLeastOneAdmin(state.users).map(normalizeUser);
  const purchasesRaw = state.purchases.map(normalizePurchase);
  const auditLogsRaw = state.auditLogs.map(normalizeAuditLog).slice(0, 200000);

  const snackSeen = new Set();
  const snacks = [];
  for (const s of snacksRaw) {
    if (snackSeen.has(s.id)) continue;
    snackSeen.add(s.id);
    snacks.push(s);
  }

  const customerSeen = new Set();
  const customers = [];
  for (const c of customersRaw) {
    if (customerSeen.has(c.name)) continue;
    customerSeen.add(c.name);
    customers.push(c);
  }

  const userSeen = new Set();
  let maxUserId = usersRaw.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
  const users = [];
  for (const u of usersRaw) {
    let userId = Number(u.id) || 0;
    if (userId <= 0) userId = ++maxUserId;
    while (userSeen.has(userId)) userId = ++maxUserId;
    userSeen.add(userId);
    users.push({ ...u, id: userId });
  }

  const purchaseIdSeen = new Set();
  const purchases = purchasesRaw.map((p, idx) => {
    const baseId = asString(p.id, `purchase_${idx}`);
    let candidate = baseId;
    let n = 1;
    while (purchaseIdSeen.has(candidate)) {
      candidate = `${baseId}__dup${n}`;
      n += 1;
    }
    purchaseIdSeen.add(candidate);
    if (candidate === baseId) return p;
    return { ...p, id: candidate };
  });

  const auditIdSeen = new Set();
  const auditLogs = auditLogsRaw.map((row, idx) => {
    const baseId = asString(row.id, `audit_${idx}`);
    let candidate = baseId;
    let n = 1;
    while (auditIdSeen.has(candidate)) {
      candidate = `${baseId}__dup${n}`;
      n += 1;
    }
    auditIdSeen.add(candidate);
    if (candidate === baseId) return row;
    return { ...row, id: candidate };
  });

  await client.query("DELETE FROM audit_logs");
  await client.query("DELETE FROM purchases");
  await client.query("DELETE FROM users");
  await client.query("DELETE FROM customers");
  await client.query("DELETE FROM snacks");

  for (const snack of snacks) {
    await client.query(
      "INSERT INTO snacks (id, name, emoji, image, price, cost_price, sell_price, total_sold, stock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [snack.id, snack.name, snack.emoji, snack.image, snack.price, snack.costPrice, snack.sellPrice, snack.totalSold, snack.stock]
    );
  }

  for (const customer of customers) {
    await client.query(
      "INSERT INTO customers (name, shift) VALUES ($1, $2)",
      [customer.name, customer.shift || "A"]
    );
  }

  for (const user of users) {
    await client.query(
      "INSERT INTO users (id, display_name, aliases, role) VALUES ($1, $2, $3::jsonb, $4)",
      [user.id, user.displayName, JSON.stringify(user.aliases), user.role]
    );
  }

  for (const purchase of purchases) {
    await client.query(
      `
      INSERT INTO purchases (
        id, customer_name, snack_id, snack_name, snack_emoji, snack_image, snack_stock, price,
        qty, unit_cost, unit_price, line_revenue, line_cost, line_profit, purchased_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz)
      `,
      [
        purchase.id,
        purchase.customerName,
        purchase.snackId,
        purchase.snackName,
        purchase.snackEmoji,
        purchase.snackImage,
        purchase.snackStock,
        purchase.price,
        purchase.qty,
        purchase.unitCost,
        purchase.unitPrice,
        purchase.lineRevenue,
        purchase.lineCost,
        purchase.lineProfit,
        purchase.purchasedAt
      ]
    );
  }

  for (const row of auditLogs) {
    await client.query(
      `
      INSERT INTO audit_logs (id, action, detail, actor_id, actor_name, actor_role, meta, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
      `,
      [row.id, row.action, row.detail, row.actorId, row.actorName, row.actorRole, JSON.stringify(row.meta), row.at]
    );
  }
}

async function readState() {
  const [snackRes, customerRes, userRes, purchaseRes, auditRes] = await Promise.all([
    pool.query("SELECT id, name, emoji, image, price, cost_price, sell_price, total_sold, stock FROM snacks ORDER BY id ASC"),
    pool.query("SELECT name, shift FROM customers ORDER BY shift ASC, name ASC"),
    pool.query("SELECT id, display_name, aliases, role FROM users ORDER BY id ASC"),
    pool.query(
      `
      SELECT id, customer_name, snack_id, snack_name, snack_emoji, snack_image, snack_stock, price,
             qty, unit_cost, unit_price, line_revenue, line_cost, line_profit, purchased_at
      FROM purchases
      ORDER BY purchased_at DESC, id DESC
      `
    ),
    pool.query(
      `
      SELECT id, action, detail, actor_id, actor_name, actor_role, meta, created_at
      FROM audit_logs
      ORDER BY created_at DESC, id DESC
      LIMIT 1000
      `
    )
  ]);

  return {
    snacks: snackRes.rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      emoji: r.emoji,
      image: r.image,
      price: Number(r.sell_price ?? r.price),
      sellPrice: Number(r.sell_price ?? r.price),
      costPrice: Number(r.cost_price ?? 0),
      totalSold: Number(r.total_sold ?? 0),
      stock: Number(r.stock)
    })),
    customers: customerRes.rows.map((r) => ({
      name: r.name,
      shift: r.shift
    })),
    users: userRes.rows.map((r) => ({
      id: Number(r.id),
      displayName: r.display_name,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      role: r.role === "admin" ? "admin" : "staff"
    })),
    purchases: purchaseRes.rows.map((r) => {
      const parsedId = Number(r.id);
      return {
        id: Number.isFinite(parsedId) ? parsedId : r.id,
        customerName: r.customer_name,
        snack: {
          id: r.snack_id !== null ? Number(r.snack_id) : null,
          name: r.snack_name,
          emoji: r.snack_emoji,
          image: r.snack_image,
          stock: r.snack_stock !== null ? Number(r.snack_stock) : null,
          price: Number(r.unit_price ?? r.price),
          sellPrice: Number(r.unit_price ?? r.price),
          costPrice: Number(r.unit_cost ?? 0)
        },
        qty: Number(r.qty ?? 1),
        unitCost: Number(r.unit_cost ?? 0),
        unitPrice: Number(r.unit_price ?? r.price),
        revenue: Number(r.line_revenue ?? r.price),
        cost: Number(r.line_cost ?? 0),
        profit: Number(r.line_profit ?? Number(r.price)),
        price: Number(r.price),
        date: new Date(r.purchased_at).toISOString()
      };
    }),
    auditLogs: auditRes.rows.map((r) => ({
      id: r.id,
      action: r.action,
      detail: r.detail,
      actorId: r.actor_id !== null ? Number(r.actor_id) : null,
      actorName: r.actor_name,
      actorRole: r.actor_role === "admin" ? "admin" : "staff",
      meta: r.meta && typeof r.meta === "object" ? r.meta : {},
      at: new Date(r.created_at).toISOString()
    }))
  };
}

async function upsertSingleSnack(snackInput, idFromPath) {
  const normalized = normalizeSnack({ ...snackInput, id: idFromPath }, 0);

  if (!pool) {
    const current = sanitizeState(fallbackState);
    const idx = current.snacks.findIndex((s) => Number(s.id) === Number(normalized.id));
    if (idx >= 0) current.snacks[idx] = { ...current.snacks[idx], ...normalized };
    else current.snacks.push(normalized);
    fallbackState = current;
    return normalized;
  }

  await pool.query(
    `
    INSERT INTO snacks (id, name, emoji, image, price, cost_price, sell_price, total_sold, stock)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE
    SET
      name = EXCLUDED.name,
      emoji = EXCLUDED.emoji,
      image = EXCLUDED.image,
      price = EXCLUDED.price,
      cost_price = EXCLUDED.cost_price,
      sell_price = EXCLUDED.sell_price,
      total_sold = EXCLUDED.total_sold,
      stock = EXCLUDED.stock
    `,
    [
      normalized.id,
      normalized.name,
      normalized.emoji,
      normalized.image,
      normalized.price,
      normalized.costPrice,
      normalized.sellPrice,
      normalized.totalSold,
      normalized.stock
    ]
  );

  return normalized;
}

async function hasAnyNormalizedData() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM snacks)::int AS snacks_count,
      (SELECT COUNT(*) FROM customers)::int AS customers_count,
      (SELECT COUNT(*) FROM users)::int AS users_count,
      (SELECT COUNT(*) FROM purchases)::int AS purchases_count,
      (SELECT COUNT(*) FROM audit_logs)::int AS audit_logs_count
  `);
  const counts = rows[0];
  return (
    counts.snacks_count > 0 ||
    counts.customers_count > 0 ||
    counts.users_count > 0 ||
    counts.purchases_count > 0 ||
    counts.audit_logs_count > 0
  );
}

async function migrateLegacyStateIfNeeded() {
  const hasData = await hasAnyNormalizedData();
  if (hasData) return;

  const legacy = await pool.query("SELECT payload FROM app_state WHERE id = 1");
  if (!legacy.rows[0] || !legacy.rows[0].payload) return;

  const state = sanitizeState(legacy.rows[0].payload);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await writeStateTx(client, state);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function getMonthlyReport(state, monthText) {
  const [y, m] = asString(monthText).split("-").map((v) => Number(v));
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return { error: "Invalid month format, expected YYYY-MM" };
  }
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const monthlyPurchases = state.purchases.filter((p) => {
    const dt = new Date(p.date || p.purchasedAt || Date.now());
    return dt >= from && dt <= to;
  });

  const billingByCustomer = {};
  const productTotals = {};
  let revenue = 0;
  let cost = 0;

  for (const p of monthlyPurchases) {
    const name = asString(p.customerName, "Unknown");
    const itemName = asString(p?.snack?.name || p.snackName, "Unknown");
    const unitPrice = Math.max(0, asInt(p.unitPrice ?? p.price, 0));
    const unitCost = Math.max(0, asInt(p.unitCost ?? p?.snack?.costPrice, 0));
    const qty = Math.max(1, asInt(p.qty, 1));
    const lineRevenue = qty * unitPrice;
    const lineCost = qty * unitCost;

    revenue += lineRevenue;
    cost += lineCost;

    if (!billingByCustomer[name]) billingByCustomer[name] = { total: 0, qty: 0 };
    billingByCustomer[name].total += lineRevenue;
    billingByCustomer[name].qty += qty;

    if (!productTotals[itemName]) productTotals[itemName] = { soldQty: 0, revenue: 0, cost: 0 };
    productTotals[itemName].soldQty += qty;
    productTotals[itemName].revenue += lineRevenue;
    productTotals[itemName].cost += lineCost;
  }

  const bestSellers = Object.entries(productTotals)
    .map(([name, d]) => ({ name, soldQty: d.soldQty, revenue: d.revenue, cost: d.cost, profit: d.revenue - d.cost }))
    .sort((a, b) => b.soldQty - a.soldQty);

  return {
    month: `${y}-${String(m).padStart(2, "0")}`,
    summary: {
      transactions: monthlyPurchases.length,
      revenue,
      cost,
      profit: revenue - cost,
      marginPct: revenue > 0 ? Number((((revenue - cost) / revenue) * 100).toFixed(2)) : 0
    },
    billingByCustomer,
    bestSellers
  };
}

async function dumpBackupFile(state, reason = "manual") {
  if (!backupDir) return null;
  await fs.promises.mkdir(backupDir, { recursive: true });
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}_${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  const fileName = `snack-backup-${reason}-${stamp}.json`;
  const filePath = path.join(backupDir, fileName);
  const payload = { createdAt: now.toISOString(), reason, state };
  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

app.get("/api/health", async (_req, res) => {
  if (!pool) {
    return res.json({
      ok: true,
      db: false,
      mode: "memory",
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      version: appVersion
    });
  }

  try {
    const { rows } = await pool.query("SELECT NOW() AS now");
    res.json({
      ok: true,
      db: true,
      now: rows[0].now,
      mode: "postgres",
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      version: appVersion
    });
  } catch (_error) {
    res.status(500).json({ ok: false, db: false });
  }
});

app.get("/api/state", async (_req, res) => {
  if (!pool) {
    const state = sanitizeState(fallbackState);
    const hasData = state.snacks.length || state.customers.length || state.users.length || state.purchases.length || state.auditLogs.length;
    return res.json({ state: hasData ? state : null, mode: "memory" });
  }

  try {
    const state = await readState();
    const hasData =
      state.snacks.length ||
      state.customers.length ||
      state.users.length ||
      state.purchases.length ||
      state.auditLogs.length;
    return res.json({ state: hasData ? state : null, mode: "postgres" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read state" });
  }
});

app.put("/api/state", async (req, res) => {
  try {
    const state = sanitizeState(req.body?.state);
    state.users = ensureAtLeastOneAdmin(state.users);
    const errors = validateState(state);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: errors.slice(0, 20) });
    }

    if (!pool) {
      fallbackState = state;
      return res.json({ ok: true, mode: "memory" });
    }

    await enqueueWrite(() =>
      withDeadlockRetry(async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await writeStateTx(client, state);
          await client.query("COMMIT");
        } catch (txError) {
          await client.query("ROLLBACK");
          throw txError;
        } finally {
          client.release();
        }
      }, 4)
    );

    return res.json({ ok: true, mode: "postgres" });
  } catch (error) {
    console.error("PUT /api/state failed:", error?.message || error);
    return res.status(500).json({ error: "Failed to write state", detail: error?.message || "Unknown error" });
  }
});

app.put("/api/snacks/:id", async (req, res) => {
  try {
    const snackId = asInt(req.params.id, 0);
    if (!snackId || snackId <= 0) {
      return res.status(400).json({ error: "Invalid snack id" });
    }

    const payload = req.body?.snack && typeof req.body.snack === "object" ? req.body.snack : req.body;
    const snack = await enqueueWrite(() =>
      withDeadlockRetry(() => upsertSingleSnack(payload || {}, snackId), 4)
    );
    return res.json({ ok: true, snack });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update snack", detail: error?.message || "Unknown error" });
  }
});

app.get("/api/report/monthly", async (req, res) => {
  try {
    const month = asString(req.query.month, "");
    if (!month) return res.status(400).json({ error: "month is required (YYYY-MM)" });

    const state = !pool ? sanitizeState(fallbackState) : await readState();
    const report = getMonthlyReport(state, month);
    if (report.error) return res.status(400).json({ error: report.error });
    return res.json({ ok: true, report });
  } catch (_error) {
    return res.status(500).json({ error: "Failed to generate report" });
  }
});

app.get("/api/audit", async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, asInt(req.query.limit, 100)));
    const state = !pool ? sanitizeState(fallbackState) : await readState();
    const logs = Array.isArray(state.auditLogs) ? state.auditLogs.slice(0, limit) : [];
    return res.json({ ok: true, logs });
  } catch (_error) {
    return res.status(500).json({ error: "Failed to read audit logs" });
  }
});

app.get("/api/backup", async (_req, res) => {
  try {
    const state = !pool ? sanitizeState(fallbackState) : await readState();
    const filePath = await dumpBackupFile(state, "manual");
    return res.json({ ok: true, saved: Boolean(filePath), filePath: filePath || null, state });
  } catch (_error) {
    return res.status(500).json({ error: "Failed to create backup" });
  }
});

app.use(
  express.static(process.cwd(), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
      }
    }
  })
);

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.sendFile(path.join(process.cwd(), "pro.html"));
});

if (backupDir && backupIntervalMin > 0) {
  setInterval(async () => {
    try {
      const state = !pool ? sanitizeState(fallbackState) : await readState();
      await dumpBackupFile(state, "auto");
    } catch (error) {
      console.error("Auto backup failed:", error.message);
    }
  }, backupIntervalMin * 60 * 1000);
}

async function startServer(listenPort = port) {
  await initDb();
  return new Promise((resolve) => {
    const server = app.listen(listenPort, () => {
      console.log(`Snack tracker server running on http://localhost:${listenPort}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to initialize database:", error.message);
    process.exit(1);
  });
}

module.exports = { app, startServer };
