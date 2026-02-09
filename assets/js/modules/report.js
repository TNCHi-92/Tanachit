let productSalesView = 'monthly';

function showMonthlyReport() {
    document.getElementById('reportModal').classList.add('active');
    generateReport();
}

function closeReportModal() {
    document.getElementById('reportModal').classList.remove('active');
}

function toMoneyNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(2));
}

function sumMoney(a, b) {
    return toMoneyNumber(toMoneyNumber(a) + toMoneyNumber(b));
}

function formatMoneyText(value) {
    const n = toMoneyNumber(value);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function getQty(purchase) {
    return Math.max(1, Number(purchase?.qty) || 1);
}

function getUnitPrice(purchase) {
    return Math.max(0, toMoneyNumber(purchase?.unitPrice ?? purchase?.price));
}

function getUnitCost(purchase) {
    return Math.max(0, toMoneyNumber(purchase?.unitCost ?? purchase?.snack?.costPrice));
}

function getSnackName(purchase) {
    return purchase?.snack?.name || purchase?.snackName || 'ไม่ระบุสินค้า';
}

function getSnackKey(purchase) {
    const snackId = Number(purchase?.snack?.id);
    if (Number.isFinite(snackId) && snackId > 0) {
        return `id:${snackId}`;
    }
    return `name:${getSnackName(purchase)}`;
}

function getMonthRange(reportMonth) {
    const [year, month] = reportMonth.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);
    return { year, month, monthStart, monthEnd };
}

function isPurchaseSettled(purchase) {
    return Boolean(purchase?.settledAt);
}

function getOutstandingPurchases() {
    return (Array.isArray(purchases) ? purchases : []).filter((p) => !isPurchaseSettled(p));
}

function buildCustomerBilling(monthlyPurchases) {
    const customerBilling = {};
    monthlyPurchases.forEach((purchase) => {
        const customerName = purchase.customerName || 'ไม่ระบุชื่อ';
        const qty = getQty(purchase);
        const unitPrice = getUnitPrice(purchase);
        const lineRevenue = toMoneyNumber(qty * unitPrice);
        const snackName = getSnackName(purchase);

        if (!customerBilling[customerName]) {
            customerBilling[customerName] = {
                total: 0,
                count: 0,
                items: {}
            };
        }

        const row = customerBilling[customerName];
        row.total = sumMoney(row.total, lineRevenue);
        row.count += qty;

        if (!row.items[snackName]) {
            row.items[snackName] = { qty: 0, total: 0 };
        }
        row.items[snackName].qty += qty;
        row.items[snackName].total = sumMoney(row.items[snackName].total, lineRevenue);
    });
    return customerBilling;
}

function formatCustomerItemsLine(customerData, maxItems = 3) {
    const entries = Object.entries(customerData?.items || {})
        .sort((a, b) => b[1].total - a[1].total);
    if (entries.length === 0) return 'ยังไม่มีรายการสินค้า';

    const shown = entries.slice(0, maxItems)
        .map(([snackName, item]) => `${snackName} x${item.qty} (${formatMoneyText(item.total)} ฿)`)
        .join(' • ');
    if (entries.length <= maxItems) return shown;
    return `${shown} • +${entries.length - maxItems} รายการ`;
}

function collectProductRowsFromPurchases(sourcePurchases) {
    const rowsByProduct = new Map();
    sourcePurchases.forEach((purchase) => {
        const key = getSnackKey(purchase);
        const snackId = Number(purchase?.snack?.id);
        const name = getSnackName(purchase);
        const qty = getQty(purchase);
        const unitPrice = getUnitPrice(purchase);
        const unitCost = getUnitCost(purchase);
        const revenue = toMoneyNumber(qty * unitPrice);
        const cost = toMoneyNumber(qty * unitCost);
        const profit = toMoneyNumber(revenue - cost);

        if (!rowsByProduct.has(key)) {
            rowsByProduct.set(key, {
                key,
                snackId: Number.isFinite(snackId) && snackId > 0 ? snackId : null,
                name,
                soldQty: 0,
                revenue: 0,
                cost: 0,
                profit: 0,
                estimated: false
            });
        }

        const row = rowsByProduct.get(key);
        row.soldQty += qty;
        row.revenue = sumMoney(row.revenue, revenue);
        row.cost = sumMoney(row.cost, cost);
        row.profit = sumMoney(row.profit, profit);
    });

    return rowsByProduct;
}

function finalizeProductRows(rows) {
    return rows
        .map((row) => ({
            ...row,
            marginPct: row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0,
            avgSellPrice: row.soldQty > 0 ? toMoneyNumber(row.revenue / row.soldQty) : 0
        }))
        .sort((a, b) => b.soldQty - a.soldQty || b.revenue - a.revenue);
}

function buildMonthlyProductRows(monthlyPurchases) {
    const map = collectProductRowsFromPurchases(monthlyPurchases);
    return finalizeProductRows(Array.from(map.values()));
}

function buildCumulativeProductRows() {
    const allPurchasesMap = collectProductRowsFromPurchases(Array.isArray(purchases) ? purchases : []);
    const rows = [];

    snacks.forEach((item) => {
        const snackId = Number(item?.id);
        const key = Number.isFinite(snackId) && snackId > 0
            ? `id:${snackId}`
            : `name:${item?.name || ''}`;
        const fromPurchases = allPurchasesMap.get(key);
        const soldFromSnack = Math.max(0, Number(item?.totalSold) || 0);
        const soldQty = Math.max(soldFromSnack, fromPurchases?.soldQty || 0);
        const sellPrice = Math.max(0, toMoneyNumber(item?.price));
        const costPrice = Math.max(0, toMoneyNumber(item?.costPrice));
        const estimated = !fromPurchases && soldQty > 0;
        const revenue = fromPurchases ? toMoneyNumber(fromPurchases.revenue) : toMoneyNumber(soldQty * sellPrice);
        const cost = fromPurchases ? toMoneyNumber(fromPurchases.cost) : toMoneyNumber(soldQty * costPrice);
        const profit = toMoneyNumber(revenue - cost);

        rows.push({
            key,
            snackId: Number.isFinite(snackId) && snackId > 0 ? snackId : null,
            name: item?.name || fromPurchases?.name || 'ไม่ระบุสินค้า',
            soldQty,
            revenue,
            cost,
            profit,
            estimated
        });

        allPurchasesMap.delete(key);
    });

    allPurchasesMap.forEach((row) => {
        rows.push({
            ...row,
            estimated: false
        });
    });

    return finalizeProductRows(rows);
}

function renderProductRows(rows, emptyText) {
    if (!rows || rows.length === 0) {
        return `<div class="empty-state" style="padding: 24px;"><div class="empty-state-icon">📦</div><p>${emptyText}</p></div>`;
    }

    return rows.map((row) => `
        <div class="customer-detail-item">
            <div class="customer-detail-header">
                <div class="customer-detail-name">${row.name}</div>
                <div class="customer-detail-total">ขาย ${row.soldQty} ชิ้น</div>
            </div>
            <div class="customer-detail-info">
                <span>ยอดขาย ${formatMoneyText(row.revenue)} &#3647;</span>
                <span>ต้นทุน ${formatMoneyText(row.cost)} &#3647;</span>
                <span>กำไร ${formatMoneyText(row.profit)} &#3647;</span>
            </div>
            <div class="customer-detail-info">
                <span>กำไร ${row.marginPct.toFixed(2)}%</span>
                <span>ราคาขายเฉลี่ย ${row.avgSellPrice.toFixed(2)} &#3647;/ชิ้น</span>
                ${row.estimated ? '<span style="color: var(--warning);">*คำนวณจากราคาปัจจุบัน</span>' : ''}
            </div>
        </div>
    `).join('');
}

function showProductSalesView(view) {
    productSalesView = view === 'cumulative' ? 'cumulative' : 'monthly';

    const monthlyPanel = document.getElementById('productSalesMonthlyPanel');
    const cumulativePanel = document.getElementById('productSalesCumulativePanel');
    const monthlyBtn = document.getElementById('productSalesMonthlyBtn');
    const cumulativeBtn = document.getElementById('productSalesCumulativeBtn');

    if (!monthlyPanel || !cumulativePanel || !monthlyBtn || !cumulativeBtn) return;

    monthlyPanel.style.display = productSalesView === 'monthly' ? 'block' : 'none';
    cumulativePanel.style.display = productSalesView === 'cumulative' ? 'block' : 'none';

    monthlyBtn.classList.toggle('btn-secondary', productSalesView === 'monthly');
    monthlyBtn.classList.toggle('btn-outline', productSalesView !== 'monthly');
    cumulativeBtn.classList.toggle('btn-secondary', productSalesView === 'cumulative');
    cumulativeBtn.classList.toggle('btn-outline', productSalesView !== 'cumulative');
}

function generateReport() {
    const reportMonth = document.getElementById('reportMonth').value;
    if (!reportMonth) return;

    const { year, month, monthStart, monthEnd } = getMonthRange(reportMonth);
    const monthlyPurchases = purchases.filter((purchase) => {
        const purchaseDate = new Date(purchase.date);
        return purchaseDate >= monthStart && purchaseDate <= monthEnd;
    });

    const monthlyProductRows = buildMonthlyProductRows(monthlyPurchases);
    const cumulativeProductRows = buildCumulativeProductRows();

    const monthlyRevenue = monthlyProductRows.reduce((sum, row) => sumMoney(sum, row.revenue), 0);
    const monthlyCost = monthlyProductRows.reduce((sum, row) => sumMoney(sum, row.cost), 0);
    const monthlyProfit = toMoneyNumber(monthlyRevenue - monthlyCost);
    const totalStock = snacks.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
    const soldPiecesThisMonth = monthlyProductRows.reduce((sum, row) => sum + row.soldQty, 0);

    const customerBilling = buildCustomerBilling(getOutstandingPurchases());

    const sellOutForecast = snacks.map((item) => {
        const stock = Number(item.stock) || 0;
        const sellPrice = toMoneyNumber(item.price);
        const costPrice = toMoneyNumber(item.costPrice);
        const profitPerUnit = toMoneyNumber(sellPrice - costPrice);
        const totalProfit = toMoneyNumber(profitPerUnit * stock);
        return {
            id: item.id,
            name: item.name,
            stock,
            profitPerUnit,
            totalProfit
        };
    });
    const potentialProfitAll = sellOutForecast.reduce((sum, row) => sumMoney(sum, row.totalProfit), 0);

    const monthlyTopRows = monthlyProductRows.slice(0, 5);
    const cumulativeTopRows = cumulativeProductRows.slice(0, 5);

    const reportContent = document.getElementById('reportContent');
    reportContent.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">ยอดขายเดือนนี้</div>
                <div class="stat-value">${formatMoneyText(monthlyRevenue)} &#3647;</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">ต้นทุนเดือนนี้</div>
                <div class="stat-value">${formatMoneyText(monthlyCost)} &#3647;</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">กำไรเดือนนี้</div>
                <div class="stat-value">${formatMoneyText(monthlyProfit)} &#3647;</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">ชิ้นที่ขายได้เดือนนี้</div>
                <div class="stat-value">${soldPiecesThisMonth}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">กำไรถ้าขายสต็อกหมด</div>
                <div class="stat-value">${formatMoneyText(potentialProfitAll)} &#3647;</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">สต็อกคงเหลือ</div>
                <div class="stat-value">${totalStock}</div>
            </div>
        </div>

        <div style="margin-top: 30px;">
            <h4 style="font-family: 'Mitr', sans-serif; margin-bottom: 15px; color: var(--text-dark); font-size: 1.2rem;">💳 ยอดค้างที่ต้องเก็บจากลูกค้า</h4>
            <div class="customer-detail-list">
                ${Object.entries(customerBilling).length === 0
                    ? '<div class="empty-state" style="padding: 24px;"><div class="empty-state-icon">✅</div><p>ไม่มีบิลค้างชำระ</p></div>'
                    : Object.entries(customerBilling)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([name, data]) => `
                        <div class="customer-detail-item">
                            <div class="customer-detail-header">
                                <div class="customer-detail-name">${name}</div>
                                <div class="customer-detail-total">${formatMoneyText(data.total)} &#3647;</div>
                            </div>
                            <div class="customer-detail-info">
                                <span>ซื้อ ${data.count} ชิ้น</span>
                                <span>เฉลี่ย ${(data.total / Math.max(1, data.count)).toFixed(2)} &#3647;/ชิ้น</span>
                            </div>
                            <div class="customer-detail-info">
                                <span>รายการ: ${formatCustomerItemsLine(data, 3)}</span>
                            </div>
                            <div class="qr-container">
                                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    <button class="btn btn-secondary" style="flex: 1;" onclick="generateQRFromEncoded('${encodeURIComponent(name)}', ${data.total})">
                                        🔗 สร้าง QR Code สำหรับคิดเงิน
                                    </button>
                                    <button class="btn btn-primary" style="flex: 1;" onclick="settleCustomerBillingFromEncoded('${encodeURIComponent(name)}')">
                                        ✅ ปิดบิลแล้ว
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
            </div>
        </div>

        <div style="margin-top: 30px;">
            <h4 style="font-family: 'Mitr', sans-serif; margin-bottom: 15px; color: var(--text-dark); font-size: 1.2rem;">📦 รายงานยอดขายรายสินค้า</h4>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;">
                <button id="productSalesMonthlyBtn" class="btn btn-outline" onclick="showProductSalesView('monthly')">ยอดขายรายเดือน</button>
                <button id="productSalesCumulativeBtn" class="btn btn-outline" onclick="showProductSalesView('cumulative')">ยอดขายสะสมทั้งหมด</button>
            </div>

            <div id="productSalesMonthlyPanel" class="customer-detail-list">
                <h5 style="font-family: 'Mitr', sans-serif; margin-bottom: 12px; color: var(--text-dark);">เดือน ${new Date(year, month - 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</h5>
                ${renderProductRows(monthlyProductRows, 'เดือนนี้ยังไม่มีรายการขาย')}
            </div>

            <div id="productSalesCumulativePanel" class="customer-detail-list" style="display: none;">
                <h5 style="font-family: 'Mitr', sans-serif; margin-bottom: 12px; color: var(--text-dark);">ยอดขายสะสมตั้งแต่เริ่มใช้ระบบ</h5>
                ${renderProductRows(cumulativeProductRows, 'ยังไม่มีข้อมูลยอดขายสะสม')}
            </div>
        </div>

        <div style="margin-top: 30px;">
            <h4 style="font-family: 'Mitr', sans-serif; margin-bottom: 15px; color: var(--text-dark); font-size: 1.2rem;">🔥 สินค้าขายดี</h4>
            <div class="customer-detail-list">
                <div class="customer-detail-item">
                    <div class="customer-detail-header">
                        <div class="customer-detail-name">Top 5 เดือนนี้</div>
                    </div>
                    ${monthlyTopRows.length > 0
                        ? monthlyTopRows.map((row, idx) => `<div class="customer-detail-info"><span>#${idx + 1} ${row.name}</span><span>${row.soldQty} ชิ้น</span></div>`).join('')
                        : '<div class="customer-detail-info"><span>ยังไม่มีข้อมูล</span></div>'}
                </div>
                <div class="customer-detail-item">
                    <div class="customer-detail-header">
                        <div class="customer-detail-name">Top 5 สะสมทั้งหมด</div>
                    </div>
                    ${cumulativeTopRows.length > 0
                        ? cumulativeTopRows.map((row, idx) => `<div class="customer-detail-info"><span>#${idx + 1} ${row.name}</span><span>${row.soldQty} ชิ้น</span></div>`).join('')
                        : '<div class="customer-detail-info"><span>ยังไม่มีข้อมูล</span></div>'}
                </div>
            </div>
        </div>

        <div style="margin-top: 30px;">
            <h4 style="font-family: 'Mitr', sans-serif; margin-bottom: 15px; color: var(--text-dark); font-size: 1.2rem;">📈 กำไรหากขายสต็อกหมด</h4>
            <div class="customer-detail-list">
                ${sellOutForecast
                    .sort((a, b) => b.totalProfit - a.totalProfit)
                    .map((row) => `
                        <div class="customer-detail-item">
                            <div class="customer-detail-header">
                                <div class="customer-detail-name">${row.name}</div>
                                <div class="customer-detail-total">${formatMoneyText(row.totalProfit)} &#3647;</div>
                            </div>
                            <div class="customer-detail-info">
                                <span>สต็อก ${row.stock}</span>
                                <span>กำไร/ชิ้น ${formatMoneyText(row.profitPerUnit)} &#3647;</span>
                            </div>
                        </div>
                    `).join('')}
            </div>
        </div>

        <div style="margin-top: 25px; padding: 20px; background: linear-gradient(135deg, #f8f9fa, #ffffff); border-radius: 12px; border: 2px solid var(--border); display: flex; gap: 12px; flex-wrap: wrap;">
            <button class="btn btn-outline" onclick="exportReport()" style="flex: 1; min-width: 200px;">
                Export Profit Report (TXT)
            </button>
            <button class="btn btn-secondary" onclick="exportReportExcel()" style="flex: 1; min-width: 200px;">
                Export Profit Report (Excel)
            </button>
        </div>
    `;

    showProductSalesView(productSalesView);
}

function generateQRFromEncoded(encodedName, amount) {
    const name = decodeURIComponent(encodedName || '');
    generateQR(name, amount);
}

function settleCustomerBillingFromEncoded(encodedName) {
    const name = decodeURIComponent(encodedName || '');
    settleCustomerBilling(name);
}

function settleCustomerBilling(customerName) {
    const name = String(customerName || '').trim();
    if (!name) return;

    const unsettledRows = (Array.isArray(purchases) ? purchases : [])
        .filter((p) => String(p?.customerName || '').trim() === name && !isPurchaseSettled(p));
    if (unsettledRows.length === 0) {
        showToast(`ไม่มีบิลค้างของ ${name}`, 'info');
        return;
    }

    const settledAt = new Date().toISOString();
    const totalAmount = unsettledRows.reduce((sum, row) => {
        const line = Number.isFinite(Number(row?.revenue))
            ? toMoneyNumber(row.revenue)
            : toMoneyNumber(getQty(row) * getUnitPrice(row));
        return sumMoney(sum, line);
    }, 0);

    purchases.forEach((p) => {
        if (String(p?.customerName || '').trim() === name && !isPurchaseSettled(p)) {
            p.settledAt = settledAt;
        }
    });

    if (typeof savePurchases === 'function') savePurchases();
    if (typeof addAuditLog === 'function') {
        addAuditLog('billing.settle', `ปิดบิล ${name}`, {
            purchases: unsettledRows.length,
            total: totalAmount,
            settledAt
        });
    }

    generateReport();
    showToast(`✅ ปิดบิล ${name} (${formatMoneyText(totalAmount)} บาท)`, 'success');
}

function generateQR(customerName, amount) {
    showToast('🔗 สร้าง QR Code สำเร็จ', 'success');
    alert(`QR Code สำหรับ: ${customerName}\nยอดเงิน: ${formatMoneyText(amount)} บาท\n\nในระบบจริง จะแสดง QR Code ที่สแกนชำระเงินได้ทันที`);
}

function exportProductRowsText(title, rows) {
    let text = `--- ${title} ---\n`;
    if (!rows || rows.length === 0) {
        return `${text}(ไม่มีข้อมูล)\n\n`;
    }
    rows.forEach((row) => {
        text += `${row.name}: sold=${row.soldQty}, revenue=${formatMoneyText(row.revenue)} THB, cost=${formatMoneyText(row.cost)} THB, profit=${formatMoneyText(row.profit)} THB, margin=${row.marginPct.toFixed(2)}%\n`;
    });
    return `${text}\n`;
}

function exportReport() {
    const reportMonth = document.getElementById('reportMonth').value;
    if (!reportMonth) return;

    const { year, month, monthStart, monthEnd } = getMonthRange(reportMonth);
    const monthlyPurchases = purchases.filter((purchase) => {
        const purchaseDate = new Date(purchase.date);
        return purchaseDate >= monthStart && purchaseDate <= monthEnd;
    });

    const monthName = new Date(year, month - 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
    const monthlyProductRows = buildMonthlyProductRows(monthlyPurchases);
    const cumulativeProductRows = buildCumulativeProductRows();
    const monthlyRevenue = monthlyProductRows.reduce((sum, row) => sumMoney(sum, row.revenue), 0);
    const monthlyCost = monthlyProductRows.reduce((sum, row) => sumMoney(sum, row.cost), 0);
    const monthlyProfit = toMoneyNumber(monthlyRevenue - monthlyCost);

    const customerBilling = buildCustomerBilling(getOutstandingPurchases());

    const sellOutForecast = snacks.map((item) => {
        const stock = Number(item.stock) || 0;
        const sellPrice = toMoneyNumber(item.price);
        const costPrice = toMoneyNumber(item.costPrice);
        const profitPerUnit = toMoneyNumber(sellPrice - costPrice);
        const totalProfit = toMoneyNumber(profitPerUnit * stock);
        return { name: item.name, stock, profitPerUnit, totalProfit };
    });
    const potentialProfitAll = sellOutForecast.reduce((sum, row) => sumMoney(sum, row.totalProfit), 0);

    let reportText = `=== Profit report ${monthName} ===\n\n`;
    reportText += `Monthly revenue: ${formatMoneyText(monthlyRevenue)} THB\n`;
    reportText += `Monthly cost: ${formatMoneyText(monthlyCost)} THB\n`;
    reportText += `Monthly profit: ${formatMoneyText(monthlyProfit)} THB\n`;
    reportText += `Transactions: ${monthlyPurchases.length}\n`;
    reportText += `Potential profit if all stock sold: ${formatMoneyText(potentialProfitAll)} THB\n\n`;

    reportText += '--- Customer billing (sell price) ---\n';
    Object.entries(customerBilling)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([name, data]) => {
            reportText += `${name}: total=${formatMoneyText(data.total)} THB, qty=${data.count}\n`;
            Object.entries(data.items || {})
                .sort((a, b) => b[1].total - a[1].total)
                .forEach(([snackName, item]) => {
                    reportText += `  - ${snackName}: qty=${item.qty}, amount=${formatMoneyText(item.total)} THB\n`;
                });
        });
    reportText += '\n';

    reportText += exportProductRowsText('Product sales (monthly)', monthlyProductRows);
    reportText += exportProductRowsText('Product sales (cumulative)', cumulativeProductRows);

    reportText += '--- Sell-out forecast by product ---\n';
    sellOutForecast
        .sort((a, b) => b.totalProfit - a.totalProfit)
        .forEach((row) => {
            reportText += `${row.name}: stock=${row.stock}, profit/unit=${formatMoneyText(row.profitPerUnit)} THB, total=${formatMoneyText(row.totalProfit)} THB\n`;
        });

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit_report_${reportMonth}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('✅ ส่งออกรายงานสำเร็จ!', 'success');
}

function exportReportExcel() {
    if (typeof XLSX === 'undefined') {
        showToast('⚠️ ไม่สามารถโหลด SheetJS library ได้', 'warning');
        return;
    }

    const reportMonth = document.getElementById('reportMonth').value;
    if (!reportMonth) return;

    const { year, month, monthStart, monthEnd } = getMonthRange(reportMonth);
    const monthName = new Date(year, month - 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
    const monthlyPurchases = purchases.filter((purchase) => {
        const purchaseDate = new Date(purchase.date);
        return purchaseDate >= monthStart && purchaseDate <= monthEnd;
    });

    const monthlyProductRows = buildMonthlyProductRows(monthlyPurchases);
    const cumulativeProductRows = buildCumulativeProductRows();
    const monthlyRevenue = monthlyProductRows.reduce((sum, row) => sumMoney(sum, row.revenue), 0);
    const monthlyCost = monthlyProductRows.reduce((sum, row) => sumMoney(sum, row.cost), 0);
    const monthlyProfit = toMoneyNumber(monthlyRevenue - monthlyCost);
    const totalStock = snacks.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
    const soldPiecesThisMonth = monthlyProductRows.reduce((sum, row) => sum + row.soldQty, 0);
    const customerBilling = buildCustomerBilling(getOutstandingPurchases());
    const sellOutForecast = snacks.map((item) => {
        const stock = Number(item.stock) || 0;
        const sellPrice = toMoneyNumber(item.price);
        const costPrice = toMoneyNumber(item.costPrice);
        const profitPerUnit = toMoneyNumber(sellPrice - costPrice);
        const totalProfit = toMoneyNumber(profitPerUnit * stock);
        return { name: item.name, stock, sellPrice, costPrice, profitPerUnit, totalProfit };
    });
    const potentialProfitAll = sellOutForecast.reduce((sum, row) => sumMoney(sum, row.totalProfit), 0);

    const wb = XLSX.utils.book_new();

    // --- Helper: apply column widths ---
    function autoWidth(ws, data) {
        if (!data || data.length === 0) return;
        const colWidths = [];
        data.forEach(row => {
            row.forEach((cell, ci) => {
                const len = cell != null ? String(cell).length : 0;
                if (!colWidths[ci] || len > colWidths[ci]) colWidths[ci] = len;
            });
        });
        ws['!cols'] = colWidths.map(w => ({ wch: Math.min(Math.max(w + 2, 8), 40) }));
    }

    // ===== Sheet 1: Summary =====
    const summaryData = [
        ['Snack Tracker - Profit Report'],
        [monthName],
        [],
        ['รายการ', 'มูลค่า'],
        ['ยอดขายรวม (บาท)', monthlyRevenue],
        ['ต้นทุนรวม (บาท)', monthlyCost],
        ['กำไรรวม (บาท)', monthlyProfit],
        ['จำนวนรายการขาย', monthlyPurchases.length],
        ['จำนวนชิ้นที่ขายได้', soldPiecesThisMonth],
        ['สต็อกคงเหลือ (ชิ้น)', totalStock],
        ['กำไรถ้าขายสต็อกหมด (บาท)', potentialProfitAll],
        [],
        ['Margin รวม (%)', monthlyRevenue > 0 ? toMoneyNumber((monthlyProfit / monthlyRevenue) * 100) : 0],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    autoWidth(wsSummary, summaryData);
    // Merge title row
    wsSummary['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปภาพรวม');

    // ===== Sheet 2: Customer Billing =====
    const billingHeader = ['ลำดับ', 'ชื่อลูกค้า', 'จำนวน (ชิ้น)', 'ยอดรวม (บาท)', 'เฉลี่ย/ชิ้น (บาท)', 'รายการสินค้า'];
    const billingRows = Object.entries(customerBilling)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, data], idx) => {
            const itemsText = Object.entries(data.items || {})
                .sort((a, b) => b[1].total - a[1].total)
                .map(([sn, item]) => `${sn} x${item.qty} (${formatMoneyText(item.total)})`)
                .join(', ');
            return [
                idx + 1,
                name,
                data.count,
                data.total,
                toMoneyNumber(data.total / Math.max(1, data.count)),
                itemsText
            ];
        });
    const billingTotal = billingRows.reduce((sum, r) => sum + r[3], 0);
    const billingQtyTotal = billingRows.reduce((sum, r) => sum + r[2], 0);
    const billingData = [
        ['ยอดค้างชำระ - ' + monthName],
        [],
        billingHeader,
        ...billingRows,
        [],
        ['', 'รวมทั้งหมด', billingQtyTotal, billingTotal, '', '']
    ];
    const wsBilling = XLSX.utils.aoa_to_sheet(billingData);
    autoWidth(wsBilling, billingData);
    wsBilling['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    XLSX.utils.book_append_sheet(wb, wsBilling, 'ยอดค้างลูกค้า');

    // ===== Sheet 3: Product Sales Monthly =====
    const prodMonthlyHeader = ['ลำดับ', 'สินค้า', 'ขายได้ (ชิ้น)', 'ยอดขาย (บาท)', 'ต้นทุน (บาท)', 'กำไร (บาท)', 'Margin (%)', 'ราคาขายเฉลี่ย (บาท)'];
    const prodMonthlyRows = monthlyProductRows.map((row, idx) => [
        idx + 1,
        row.name,
        row.soldQty,
        row.revenue,
        row.cost,
        row.profit,
        toMoneyNumber(row.marginPct),
        row.avgSellPrice
    ]);
    const prodMonthlyData = [
        ['ยอดขายรายสินค้า (เดือน) - ' + monthName],
        [],
        prodMonthlyHeader,
        ...prodMonthlyRows,
        [],
        ['', 'รวม', soldPiecesThisMonth, monthlyRevenue, monthlyCost, monthlyProfit, monthlyRevenue > 0 ? toMoneyNumber((monthlyProfit / monthlyRevenue) * 100) : 0, '']
    ];
    const wsProdMonthly = XLSX.utils.aoa_to_sheet(prodMonthlyData);
    autoWidth(wsProdMonthly, prodMonthlyData);
    wsProdMonthly['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    XLSX.utils.book_append_sheet(wb, wsProdMonthly, 'ยอดขายรายเดือน');

    // ===== Sheet 4: Product Sales Cumulative =====
    const prodCumHeader = ['ลำดับ', 'สินค้า', 'ขายได้ (ชิ้น)', 'ยอดขาย (บาท)', 'ต้นทุน (บาท)', 'กำไร (บาท)', 'Margin (%)', 'ราคาขายเฉลี่ย (บาท)'];
    const prodCumRows = cumulativeProductRows.map((row, idx) => [
        idx + 1,
        row.name,
        row.soldQty,
        row.revenue,
        row.cost,
        row.profit,
        toMoneyNumber(row.marginPct),
        row.avgSellPrice
    ]);
    const cumRevenue = cumulativeProductRows.reduce((sum, r) => sumMoney(sum, r.revenue), 0);
    const cumCost = cumulativeProductRows.reduce((sum, r) => sumMoney(sum, r.cost), 0);
    const cumProfit = toMoneyNumber(cumRevenue - cumCost);
    const cumQty = cumulativeProductRows.reduce((sum, r) => sum + r.soldQty, 0);
    const prodCumData = [
        ['ยอดขายสะสมทั้งหมด'],
        [],
        prodCumHeader,
        ...prodCumRows,
        [],
        ['', 'รวม', cumQty, cumRevenue, cumCost, cumProfit, cumRevenue > 0 ? toMoneyNumber((cumProfit / cumRevenue) * 100) : 0, '']
    ];
    const wsProdCum = XLSX.utils.aoa_to_sheet(prodCumData);
    autoWidth(wsProdCum, prodCumData);
    wsProdCum['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    XLSX.utils.book_append_sheet(wb, wsProdCum, 'ยอดขายสะสม');

    // ===== Sheet 5: Sell-out Forecast =====
    const forecastHeader = ['ลำดับ', 'สินค้า', 'สต็อก (ชิ้น)', 'ราคาขาย (บาท)', 'ต้นทุน (บาท)', 'กำไร/ชิ้น (บาท)', 'กำไรรวม (บาท)'];
    const forecastRows = sellOutForecast
        .sort((a, b) => b.totalProfit - a.totalProfit)
        .map((row, idx) => [
            idx + 1,
            row.name,
            row.stock,
            row.sellPrice,
            row.costPrice,
            row.profitPerUnit,
            row.totalProfit
        ]);
    const forecastData = [
        ['พยากรณ์กำไร - ถ้าขายสต็อกหมด'],
        [],
        forecastHeader,
        ...forecastRows,
        [],
        ['', 'รวม', forecastRows.reduce((s, r) => s + r[2], 0), '', '', '', potentialProfitAll]
    ];
    const wsForecast = XLSX.utils.aoa_to_sheet(forecastData);
    autoWidth(wsForecast, forecastData);
    wsForecast['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    XLSX.utils.book_append_sheet(wb, wsForecast, 'พยากรณ์กำไร');

    // ===== Sheet 6: Customer Detail (all purchases this month) =====
    const custDetailHeader = ['ลำดับ', 'วันที่', 'เวลา', 'ลูกค้า', 'สินค้า', 'ราคา (บาท)', 'ต้นทุน (บาท)', 'กำไร (บาท)'];
    const sortedMonthly = [...monthlyPurchases].sort((a, b) => new Date(b.date) - new Date(a.date));
    const custDetailRows = sortedMonthly.map((p, idx) => {
        const dt = new Date(p.date);
        const dateStr = dt.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const unitPrice = getUnitPrice(p);
        const unitCost = getUnitCost(p);
        return [
            idx + 1,
            dateStr,
            timeStr,
            p.customerName || '',
            getSnackName(p),
            unitPrice,
            unitCost,
            toMoneyNumber(unitPrice - unitCost)
        ];
    });
    const custDetailData = [
        ['รายการขายทั้งหมด - ' + monthName],
        [],
        custDetailHeader,
        ...custDetailRows,
        [],
        ['', '', '', '', 'รวม', monthlyRevenue, monthlyCost, monthlyProfit]
    ];
    const wsCustDetail = XLSX.utils.aoa_to_sheet(custDetailData);
    autoWidth(wsCustDetail, custDetailData);
    wsCustDetail['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    XLSX.utils.book_append_sheet(wb, wsCustDetail, 'รายการขายทั้งหมด');

    // Write and download
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit_report_${reportMonth}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('✅ ส่งออก Excel สำเร็จ!', 'success');
}
