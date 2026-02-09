import { neon } from "@neondatabase/serverless";
import html from "../pro.html";

let schemaReady = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function getSql(env) {
  const url = env?.DATABASE_URL;
  if (!url) return null;
  return neon(url);
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

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toText(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeSnack(snack, idx) {
  const id = toInt(snack?.id, idx + 1);
  return {
    id,
    name: toText(snack?.name, `Snack ${id}`),
    emoji: snack?.emoji ? toText(snack.emoji) : null,
    image: snack?.image ? toText(snack.image) : null,
    price: toInt(snack?.price, 0),
    stock: Math.max(0, toInt(snack?.stock, 0))
  };
}

function normalizeCustomer(customer) {
  return {
    name: toText(customer?.name).trim(),
    shift: toText(customer?.shift || "A").toUpperCase().slice(0, 1)
  };
}

function normalizeUser(user, idx) {
  const aliases = Array.isArray(user?.aliases)
    ? user.aliases.map((v) => toText(v).trim()).filter(Boolean)
    : [];
  return {
    id: toInt(user?.id, idx + 1),
    displayName: toText(user?.displayName, `User ${idx + 1}`),
    aliases
  };
}

function normalizePurchase(purchase, idx) {
  const snack = purchase?.snack && typeof purchase.snack === "object" ? purchase.snack : {};
  const settledRaw = purchase?.settledAt ?? purchase?.settled_at ?? null;
  let settledAt = null;
  if (settledRaw) {
    const dt = new Date(settledRaw);
    if (!Number.isNaN(dt.getTime())) settledAt = dt.toISOString();
  }
  return {
    id: toText(purchase?.id, `${Date.now()}_${idx}`),
    customerName: toText(purchase?.customerName, "Unknown"),
    snackId: snack?.id !== null && snack?.id !== undefined ? toInt(snack.id, null) : null,
    snackName: toText(snack?.name, "Unknown"),
    snackEmoji: snack?.emoji ? toText(snack.emoji) : null,
    snackStock: snack?.stock !== null && snack?.stock !== undefined ? toInt(snack.stock, null) : null,
    price: toInt(purchase?.price ?? snack?.price, 0),
    purchasedAt: new Date(purchase?.date || Date.now()).toISOString(),
    settledAt
  };
}

async function ensureSchema(sql) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS snacks (
        id BIGINT PRIMARY KEY,
        name TEXT NOT NULL,
        emoji TEXT,
        image TEXT,
        price INTEGER NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        name TEXT PRIMARY KEY,
        shift TEXT NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        display_name TEXT NOT NULL,
        aliases JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        snack_id BIGINT,
        snack_name TEXT NOT NULL,
        snack_emoji TEXT,
        snack_image TEXT,
        snack_stock INTEGER,
        price INTEGER NOT NULL,
        purchased_at TIMESTAMPTZ NOT NULL,
        settled_at TIMESTAMPTZ NULL
      )
    `;
    await sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ NULL`;
    await sql`UPDATE purchases SET snack_image = NULL WHERE snack_image IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_purchases_purchased_at ON purchases (purchased_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_purchases_customer ON purchases (customer_name)`;
  })();
  return schemaReady;
}

async function readState(sql) {
  const [snacks, customers, users, purchases] = await Promise.all([
    sql`SELECT id, name, emoji, image, price, stock FROM snacks ORDER BY id ASC`,
    sql`SELECT name, shift FROM customers ORDER BY shift ASC, name ASC`,
    sql`SELECT id, display_name, aliases FROM users ORDER BY id ASC`,
    sql`
      SELECT id, customer_name, snack_id, snack_name, snack_emoji, snack_stock, price, purchased_at, settled_at
      FROM purchases
      ORDER BY purchased_at DESC, id DESC
    `
  ]);

  return {
    snacks: snacks.map((r) => ({
      id: Number(r.id),
      name: r.name,
      emoji: r.emoji,
      image: r.image,
      price: Number(r.price),
      stock: Number(r.stock)
    })),
    customers: customers.map((r) => ({ name: r.name, shift: r.shift })),
    users: users.map((r) => ({
      id: Number(r.id),
      displayName: r.display_name,
      aliases: Array.isArray(r.aliases) ? r.aliases : []
    })),
    purchases: purchases.map((r) => {
      const asNum = Number(r.id);
      return {
        id: Number.isFinite(asNum) ? asNum : r.id,
        customerName: r.customer_name,
        snack: {
          id: r.snack_id !== null ? Number(r.snack_id) : null,
          name: r.snack_name,
          emoji: r.snack_emoji,
          image: null,
          stock: r.snack_stock !== null ? Number(r.snack_stock) : null,
          price: Number(r.price)
        },
        price: Number(r.price),
        date: new Date(r.purchased_at).toISOString(),
        settledAt: r.settled_at ? new Date(r.settled_at).toISOString() : null
      };
    })
  };
}

async function writeState(sql, input) {
  const state = sanitizeState(input);
  const snacks = state.snacks.map(normalizeSnack);
  const customers = state.customers.map(normalizeCustomer).filter((c) => c.name);
  const users = state.users.map(normalizeUser);
  const purchases = state.purchases.map(normalizePurchase);

  const tx = [
    sql`DELETE FROM purchases`,
    sql`DELETE FROM users`,
    sql`DELETE FROM customers`,
    sql`DELETE FROM snacks`
  ];

  for (const s of snacks) {
    tx.push(
      sql`
        INSERT INTO snacks (id, name, emoji, image, price, stock)
        VALUES (${s.id}, ${s.name}, ${s.emoji}, ${s.image}, ${s.price}, ${s.stock})
      `
    );
  }

  for (const c of customers) {
    tx.push(sql`INSERT INTO customers (name, shift) VALUES (${c.name}, ${c.shift || "A"})`);
  }

  for (const u of users) {
    tx.push(
      sql`
        INSERT INTO users (id, display_name, aliases)
        VALUES (${u.id}, ${u.displayName}, ${JSON.stringify(u.aliases)}::jsonb)
      `
    );
  }

  for (const p of purchases) {
    tx.push(
      sql`
        INSERT INTO purchases (
          id, customer_name, snack_id, snack_name, snack_emoji, snack_image, snack_stock, price, purchased_at, settled_at
        ) VALUES (
          ${p.id}, ${p.customerName}, ${p.snackId}, ${p.snackName}, ${p.snackEmoji},
          ${null}, ${p.snackStock}, ${p.price}, ${p.purchasedAt}::timestamptz, ${p.settledAt}::timestamptz
        )
      `
    );
  }

  await sql.transaction(tx);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sql = getSql(env);

    async function serveStaticAsset() {
      if (!env?.ASSETS || url.pathname.startsWith("/api/")) return null;
      const assetUrl = new URL(request.url);
      if (assetUrl.pathname === "/") {
        assetUrl.pathname = "/pro.html";
      }
      const assetReq = new Request(assetUrl.toString(), request);
      const assetRes = await env.ASSETS.fetch(assetReq);
      if (assetRes && assetRes.status !== 404) return assetRes;
      return null;
    }

    const staticRes = await serveStaticAsset();
    if (staticRes) return staticRes;

    if (url.pathname === "/" || url.pathname === "/pro.html") {
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    if (url.pathname === "/api/health") {
      if (!sql) return json({ ok: true, db: false, reason: "DATABASE_URL missing" });
      try {
        await ensureSchema(sql);
        const [{ now }] = await sql`SELECT NOW() AS now`;
        return json({ ok: true, db: true, now });
      } catch (error) {
        return json({ ok: false, db: false, error: "DB health check failed" }, 500);
      }
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      if (!sql) return json({ error: "DATABASE_URL is not configured" }, 503);
      try {
        await ensureSchema(sql);
        const state = await readState(sql);
        const hasData =
          state.snacks.length || state.customers.length || state.users.length || state.purchases.length;
        return json({ state: hasData ? state : null });
      } catch (error) {
        return json({ error: "Failed to read state" }, 500);
      }
    }

    if (url.pathname === "/api/state" && request.method === "PUT") {
      if (!sql) return json({ error: "DATABASE_URL is not configured" }, 503);
      try {
        const body = await request.json();
        await ensureSchema(sql);
        await writeState(sql, body?.state);
        return json({ ok: true });
      } catch (error) {
        return json({ error: "Failed to write state" }, 500);
      }
    }

    return new Response("Not Found", { status: 404 });
  }
};
