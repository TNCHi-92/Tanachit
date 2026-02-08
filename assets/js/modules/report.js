        // Show monthly report modal
        function showMonthlyReport() {
            document.getElementById('reportModal').classList.add('active');
            generateReport();
        }

        // Close report modal
        function closeReportModal() {
            document.getElementById('reportModal').classList.remove('active');
        }

        // Generate monthly report
        function generateReport() {
            const reportMonth = document.getElementById('reportMonth').value;
            if (!reportMonth) return;

            const [year, month] = reportMonth.split('-').map(Number);
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0, 23, 59, 59);

            const monthlyPurchases = purchases.filter(purchase => {
                const purchaseDate = new Date(purchase.date);
                return purchaseDate >= monthStart && purchaseDate <= monthEnd;
            });

            const monthlyRevenue = monthlyPurchases.reduce((sum, p) => {
                const unitPrice = Number(p.unitPrice ?? p.price) || 0;
                return sum + unitPrice;
            }, 0);
            const monthlyCost = monthlyPurchases.reduce((sum, p) => {
                const unitCost = Number(p.unitCost ?? p.snack?.costPrice) || 0;
                return sum + unitCost;
            }, 0);
            const monthlyProfit = monthlyPurchases.reduce((sum, p) => {
                if (Number.isFinite(Number(p.profit))) return sum + Number(p.profit);
                const unitPrice = Number(p.unitPrice ?? p.price) || 0;
                const unitCost = Number(p.unitCost ?? p.snack?.costPrice) || 0;
                return sum + (unitPrice - unitCost);
            }, 0);
            const customerBilling = {};

            monthlyPurchases.forEach(p => {
                const customerName = p.customerName || 'ไม่ระบุชื่อ';
                const unitPrice = Number(p.unitPrice ?? p.price) || 0;
                if (!customerBilling[customerName]) {
                    customerBilling[customerName] = { total: 0, count: 0 };
                }
                customerBilling[customerName].total += unitPrice;
                customerBilling[customerName].count += 1;
            });
            const totalTransactions = monthlyPurchases.length;
            const totalStock = snacks.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);

            const sellOutForecast = snacks.map(item => {
                const stock = Number(item.stock) || 0;
                const sellPrice = Number(item.price) || 0;
                const costPrice = Number(item.costPrice) || 0;
                const profitPerUnit = sellPrice - costPrice;
                const totalProfit = profitPerUnit * stock;
                return {
                    id: item.id,
                    name: item.name,
                    stock,
                    profitPerUnit,
                    totalProfit
                };
            });
            const potentialProfitAll = sellOutForecast.reduce((sum, row) => sum + row.totalProfit, 0);

            const reportContent = document.getElementById('reportContent');
            reportContent.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Monthly Revenue</div>
                        <div class="stat-value">${monthlyRevenue} &#3647;</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Monthly Cost</div>
                        <div class="stat-value">${monthlyCost} &#3647;</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Monthly Profit</div>
                        <div class="stat-value">${monthlyProfit} &#3647;</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Profit If Sell Out</div>
                        <div class="stat-value">${potentialProfitAll} &#3647;</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Remaining Stock</div>
                        <div class="stat-value">${totalStock}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Monthly Transactions</div>
                        <div class="stat-value">${totalTransactions}</div>
                    </div>
                </div>

                <div style="margin-top: 30px;">
                    <h4 style="font-family: 'Mitr', sans-serif; margin-bottom: 15px; color: var(--text-dark); font-size: 1.2rem;">💳 สรุปยอดที่ต้องเก็บจากลูกค้า (ราคาขาย)</h4>
                    <div class="customer-detail-list">
                        ${Object.entries(customerBilling)
                            .sort((a, b) => b[1].total - a[1].total)
                            .map(([name, data]) => `
                                <div class="customer-detail-item">
                                    <div class="customer-detail-header">
                                        <div class="customer-detail-name">${name}</div>
                                        <div class="customer-detail-total">${data.total} &#3647;</div>
                                    </div>
                                    <div class="customer-detail-info">
                                        <span>ซื้อ ${data.count} ชิ้น</span>
                                        <span>เฉลี่ย ${(data.total / Math.max(1, data.count)).toFixed(2)} &#3647;/ชิ้น</span>
                                    </div>
                                    <div class="qr-container">
                                        <button class="btn btn-secondary" style="width: 100%;" onclick="generateQRFromEncoded('${encodeURIComponent(name)}', ${data.total})">
                                            🔗 สร้าง QR Code สำหรับคิดเงิน
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                    </div>
                </div>

                <div style="margin-top: 30px;">
                    <h4 style="font-family: 'Mitr', sans-serif; margin-bottom: 15px; color: var(--text-dark); font-size: 1.2rem;">Sell-out Profit Forecast</h4>
                    <div class="customer-detail-list">
                        ${sellOutForecast
                            .sort((a, b) => b.totalProfit - a.totalProfit)
                            .map(row => `
                                <div class="customer-detail-item">
                                    <div class="customer-detail-header">
                                        <div class="customer-detail-name">${row.name}</div>
                                        <div class="customer-detail-total">${row.totalProfit} &#3647;</div>
                                    </div>
                                    <div class="customer-detail-info">
                                        <span>Stock ${row.stock}</span>
                                        <span>Profit/Unit ${row.profitPerUnit} &#3647;</span>
                                    </div>
                                </div>
                            `).join('')}
                    </div>
                </div>

                <div style="margin-top: 25px; padding: 20px; background: linear-gradient(135deg, #f8f9fa, #ffffff); border-radius: 12px; border: 2px solid var(--border);">
                    <button class="btn btn-outline" onclick="exportReport()" style="width: 100%;">
                        Export Profit Report (TXT)
                    </button>
                </div>
            `;
        }


        // Generate QR Code
        function generateQRFromEncoded(encodedName, amount) {
            const name = decodeURIComponent(encodedName || '');
            generateQR(name, amount);
        }

        function generateQR(customerName, amount) {
            const qrData = `ชำระเงินสำหรับ: ${customerName}\nจำนวนเงิน: ${amount} บาท`;
            
            showToast(`🔗 สร้าง QR Code สำเร็จ`, 'success');
            
            alert(`QR Code สำหรับ: ${customerName}\nยอดเงิน: ${amount} บาท\n\nในระบบจริง จะแสดง QR Code ที่สแกนชำระเงินได้ทันที`);
        }

        // Export report
        function exportReport() {
            const reportMonth = document.getElementById('reportMonth').value;
            if (!reportMonth) return;

            const [year, month] = reportMonth.split('-').map(Number);
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0, 23, 59, 59);

            const monthlyPurchases = purchases.filter(purchase => {
                const purchaseDate = new Date(purchase.date);
                return purchaseDate >= monthStart && purchaseDate <= monthEnd;
            });

            const monthName = new Date(year, month - 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });

            const monthlyRevenue = monthlyPurchases.reduce((sum, p) => {
                const unitPrice = Number(p.unitPrice ?? p.price) || 0;
                return sum + unitPrice;
            }, 0);
            const monthlyCost = monthlyPurchases.reduce((sum, p) => {
                const unitCost = Number(p.unitCost ?? p.snack?.costPrice) || 0;
                return sum + unitCost;
            }, 0);
            const monthlyProfit = monthlyPurchases.reduce((sum, p) => {
                if (Number.isFinite(Number(p.profit))) return sum + Number(p.profit);
                const unitPrice = Number(p.unitPrice ?? p.price) || 0;
                const unitCost = Number(p.unitCost ?? p.snack?.costPrice) || 0;
                return sum + (unitPrice - unitCost);
            }, 0);
            const customerBilling = {};

            monthlyPurchases.forEach(p => {
                const customerName = p.customerName || 'ไม่ระบุชื่อ';
                const unitPrice = Number(p.unitPrice ?? p.price) || 0;
                if (!customerBilling[customerName]) {
                    customerBilling[customerName] = { total: 0, count: 0 };
                }
                customerBilling[customerName].total += unitPrice;
                customerBilling[customerName].count += 1;
            });

            const sellOutForecast = snacks.map(item => {
                const stock = Number(item.stock) || 0;
                const sellPrice = Number(item.price) || 0;
                const costPrice = Number(item.costPrice) || 0;
                const profitPerUnit = sellPrice - costPrice;
                const totalProfit = profitPerUnit * stock;
                return { name: item.name, stock, profitPerUnit, totalProfit };
            });
            const potentialProfitAll = sellOutForecast.reduce((sum, row) => sum + row.totalProfit, 0);

            let reportText = `=== Profit report ${monthName} ===\n\n`;
            reportText += `Monthly revenue: ${monthlyRevenue} THB\n`;
            reportText += `Monthly cost: ${monthlyCost} THB\n`;
            reportText += `Monthly profit: ${monthlyProfit} THB\n`;
            reportText += `Transactions: ${monthlyPurchases.length}\n`;
            reportText += `Potential profit if all stock sold: ${potentialProfitAll} THB\n\n`;

            reportText += '--- Customer billing (sell price) ---\n';
            Object.entries(customerBilling)
                .sort((a, b) => b[1].total - a[1].total)
                .forEach(([name, data]) => {
                    reportText += `${name}: total=${data.total} THB, qty=${data.count}\n`;
                });
            reportText += '\n';

            reportText += '--- Sell-out forecast by product ---\n';

            sellOutForecast
                .sort((a, b) => b.totalProfit - a.totalProfit)
                .forEach(row => {
                    reportText += `${row.name}: stock=${row.stock}, profit/unit=${row.profitPerUnit} THB, total=${row.totalProfit} THB\n`;
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


        // Show toast notification
        function showToast(message, type = 'success') {
            const existingToast = document.querySelector('.toast');
            if (existingToast) {
                existingToast.remove();
            }
            
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            
            if (type === 'warning') {
                toast.style.background = 'linear-gradient(135deg, var(--warning), #F2B84B)';
            } else if (type === 'info') {
                toast.style.background = 'linear-gradient(135deg, var(--secondary), #3FBDB5)';
            }
            
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'slideInFromRight 0.4s ease-out reverse';
                setTimeout(() => toast.remove(), 400);
            }, 3000);
        }

        // Save purchases to localStorage
        function savePurchases() {
            localStorage.setItem('snackPurchases', JSON.stringify(purchases));
            scheduleStateSync();
        }

        // Load purchases from localStorage
        function loadPurchases() {
            const saved = localStorage.getItem('snackPurchases');
            if (saved) {
                purchases = JSON.parse(saved).map(p => {
                    const unitPrice = Number(p.unitPrice ?? p.price) || 0;
                    const unitCost = Number(p.unitCost ?? p.snack?.costPrice) || 0;
                    const profit = Number.isFinite(Number(p.profit))
                        ? Number(p.profit)
                        : (unitPrice - unitCost);
                    return {
                        ...p,
                        unitPrice,
                        unitCost,
                        revenue: Number(p.revenue ?? unitPrice) || 0,
                        cost: Number(p.cost ?? unitCost) || 0,
                        profit
                    };
                });
            }
        }
