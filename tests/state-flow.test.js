const assert = require('node:assert/strict');

process.env.DATABASE_URL = '';
const { startServer } = require('../server');

const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;

async function run() {
  const server = await startServer(PORT);
  try {
    const state = {
      snacks: [
        { id: 1, name: 'มาม่า', price: 7, costPrice: 5, stock: 48, emoji: '🍜' }
      ],
      customers: [{ name: 'เอ', shift: 'A' }],
      users: [{ id: 1, displayName: 'Admin', aliases: ['admin'], role: 'admin' }],
      purchases: [
        {
          id: 'p1',
          customerName: 'เอ',
          snack: { id: 1, name: 'มาม่า', price: 7, costPrice: 5 },
          price: 7,
          qty: 2,
          unitPrice: 7,
          unitCost: 5,
          date: '2026-02-08T12:00:00.000Z'
        }
      ],
      auditLogs: []
    };

    const putRes = await fetch(`${BASE}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    assert.equal(putRes.status, 200, 'PUT /api/state should return 200');

    const getRes = await fetch(`${BASE}/api/state`);
    assert.equal(getRes.status, 200, 'GET /api/state should return 200');
    const getJson = await getRes.json();
    assert.ok(getJson.state, 'state should exist');
    assert.equal(getJson.state.snacks[0].name, 'มาม่า');

    const reportRes = await fetch(`${BASE}/api/report/monthly?month=2026-02`);
    assert.equal(reportRes.status, 200, 'GET /api/report/monthly should return 200');
    const reportJson = await reportRes.json();
    assert.equal(reportJson.report.summary.revenue, 14);
    assert.equal(reportJson.report.summary.cost, 10);
    assert.equal(reportJson.report.summary.profit, 4);
    assert.equal(reportJson.report.billingByCustomer['เอ'].total, 14);
    assert.equal(reportJson.report.bestSellers[0].name, 'มาม่า');

    const auditRes = await fetch(`${BASE}/api/audit?limit=10`);
    assert.equal(auditRes.status, 200, 'GET /api/audit should return 200');
    const auditJson = await auditRes.json();
    assert.ok(Array.isArray(auditJson.logs), 'audit logs should be an array');

    const backupRes = await fetch(`${BASE}/api/backup`);
    assert.equal(backupRes.status, 200, 'GET /api/backup should return 200');
    const backupJson = await backupRes.json();
    assert.equal(backupJson.ok, true);
    assert.ok(backupJson.state, 'backup should include state');

    const badState = {
      snacks: [{ id: 1, name: '', price: -1, stock: -5 }],
      customers: [],
      users: [],
      purchases: [],
      auditLogs: []
    };

    const badRes = await fetch(`${BASE}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: badState })
    });
    assert.equal(badRes.status, 400, 'invalid state should return 400');

    console.log('OK: state flow test passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
