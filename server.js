const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const dbUrl = process.env.DATABASE_URL;

app.use(express.json({ limit: "25mb" }));

let pool = null;
if (dbUrl) {
  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  pool.on("error", (error) => {
    console.error("Postgres pool error:", error.message);
  });
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
      stock INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS customers (
      name TEXT PRIMARY KEY,
      shift TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      display_name TEXT NOT NULL,
      aliases JSONB NOT NULL DEFAULT '[]'::jsonb
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
    ALTER TABLE snacks ADD COLUMN IF NOT EXISTS cost_price INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE snacks ADD COLUMN IF NOT EXISTS sell_price INTEGER NOT NULL DEFAULT 0;
    UPDATE snacks SET sell_price = price WHERE sell_price = 0;

    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS qty INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS unit_cost INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS unit_price INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS line_revenue INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS line_cost INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS line_profit INTEGER NOT NULL DEFAULT 0;
    UPDATE purchases
    SET unit_price = price, line_revenue = price, line_profit = price
    WHERE unit_price = 0 AND qty = 1;
  `);

  await migrateLegacyStateIfNeeded();
}

function sanitizeState(input) {
  const data = input && typeof input === "object" ? input : {};

  return {
    snacks: Array.isArray(data.snacks) ? data.snacks : [],
    customers: Array.isArray(data.customers) ? data.customers : [],
    purchases: Array.isArray(data.purchases) ? data.purchases : [],
    users: Array.isArray(data.users) ? data.users : []
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
  return {
    id,
    name: asString(snack?.name, `Snack ${id}`),
    emoji: snack?.emoji ? asString(snack.emoji) : null,
    image: snack?.image ? asString(snack.image) : null,
    price: sellPrice,
    costPrice: Math.max(0, costPrice),
    sellPrice: Math.max(0, sellPrice),
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

  return {
    id: asInt(user?.id, idx + 1),
    displayName: asString(user?.displayName, `User ${idx + 1}`),
    aliases
  };
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
  const snacks = state.snacks.map(normalizeSnack);
  const customers = state.customers.map(normalizeCustomer).filter((c) => c.name);
  const users = state.users.map(normalizeUser);
  const purchases = state.purchases.map(normalizePurchase);

  await client.query("DELETE FROM purchases");
  await client.query("DELETE FROM users");
  await client.query("DELETE FROM customers");
  await client.query("DELETE FROM snacks");

  for (const snack of snacks) {
    await client.query(
      "INSERT INTO snacks (id, name, emoji, image, price, cost_price, sell_price, stock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [snack.id, snack.name, snack.emoji, snack.image, snack.price, snack.costPrice, snack.sellPrice, snack.stock]
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
      "INSERT INTO users (id, display_name, aliases) VALUES ($1, $2, $3::jsonb)",
      [user.id, user.displayName, JSON.stringify(user.aliases)]
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
}

async function readState() {
  const [snackRes, customerRes, userRes, purchaseRes] = await Promise.all([
    pool.query("SELECT id, name, emoji, image, price, cost_price, sell_price, stock FROM snacks ORDER BY id ASC"),
    pool.query("SELECT name, shift FROM customers ORDER BY shift ASC, name ASC"),
    pool.query("SELECT id, display_name, aliases FROM users ORDER BY id ASC"),
    pool.query(
      `
      SELECT id, customer_name, snack_id, snack_name, snack_emoji, snack_image, snack_stock, price,
             qty, unit_cost, unit_price, line_revenue, line_cost, line_profit, purchased_at
      FROM purchases
      ORDER BY purchased_at DESC, id DESC
      `
    )
  ]);

  return {
    snacks: snackRes.rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      emoji: r.emoji,
      image: r.image,
      price: Number(r.price),
      sellPrice: Number(r.sell_price ?? r.price),
      costPrice: Number(r.cost_price ?? 0),
      stock: Number(r.stock)
    })),
    customers: customerRes.rows.map((r) => ({
      name: r.name,
      shift: r.shift
    })),
    users: userRes.rows.map((r) => ({
      id: Number(r.id),
      displayName: r.display_name,
      aliases: Array.isArray(r.aliases) ? r.aliases : []
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
    })
  };
}

async function hasAnyNormalizedData() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM snacks)::int AS snacks_count,
      (SELECT COUNT(*) FROM customers)::int AS customers_count,
      (SELECT COUNT(*) FROM users)::int AS users_count,
      (SELECT COUNT(*) FROM purchases)::int AS purchases_count
  `);
  const counts = rows[0];
  return (
    counts.snacks_count > 0 ||
    counts.customers_count > 0 ||
    counts.users_count > 0 ||
    counts.purchases_count > 0
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

app.get("/api/health", async (_req, res) => {
  if (!pool) return res.json({ ok: true, db: false });

  try {
    const { rows } = await pool.query("SELECT NOW() AS now");
    res.json({ ok: true, db: true, now: rows[0].now });
  } catch (_error) {
    res.status(500).json({ ok: false, db: false });
  }
});

app.get("/api/state", async (_req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "DATABASE_URL is not configured" });
  }

  try {
    const state = await readState();
    const hasData =
      state.snacks.length ||
      state.customers.length ||
      state.users.length ||
      state.purchases.length;
    return res.json({ state: hasData ? state : null });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read state" });
  }
});

app.put("/api/state", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "DATABASE_URL is not configured" });
  }

  try {
    const state = sanitizeState(req.body?.state);
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

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to write state" });
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

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Snack tracker server running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error.message);
    process.exit(1);
  });
