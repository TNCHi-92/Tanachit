        // === Manage Modal Functions ===

        function showManageModal() {
            if (!ensureCanManageData()) return;
            document.getElementById('manageModal').classList.add('active');
            switchManageTab('snacks');
        }

        function closeManageModal() {
            document.getElementById('manageModal').classList.remove('active');
            resetSnackForm();
        }

        function switchManageTab(tab) {
            document.querySelectorAll('.manage-tab').forEach(t => t.classList.remove('active'));
            const activeBtn = document.querySelector(`.manage-tab[data-tab="${tab}"]`);
            if (activeBtn) activeBtn.classList.add('active');

            document.getElementById('manageSnacksTab').style.display = 'none';
            document.getElementById('manageCustomersTab').style.display = 'none';
            document.getElementById('manageProfitTab').style.display = 'none';

            if (tab === 'snacks') {
                document.getElementById('manageSnacksTab').style.display = 'block';
                renderManageSnackList();
            } else if (tab === 'customers') {
                document.getElementById('manageCustomersTab').style.display = 'block';
                renderManageCustomerList();
                renderManageUserRoleList();
            } else {
                document.getElementById('manageProfitTab').style.display = 'block';
                renderProfitTab();
            }
        }

        function renderProfitTab() {
            const monthValue = document.getElementById('profitMonth')?.value;
            if (!monthValue) return;

            const [year, month] = monthValue.split('-').map(Number);
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0, 23, 59, 59);

            const monthlyPurchases = purchases.filter(p => {
                const dt = new Date(p.date);
                return dt >= monthStart && dt <= monthEnd;
            });

            const rowsByProduct = new Map();
            monthlyPurchases.forEach(p => {
                const snackId = p?.snack?.id ?? p?.snack?.name ?? 'unknown';
                const snackName = p?.snack?.name || 'Unknown';
                const qty = Math.max(0.01, toMoneyNumber(p?.qty ?? 1));
                const unitSell = toMoneyNumber(p.unitPrice ?? p.price);
                const unitCost = toMoneyNumber(p.unitCost ?? p.snack?.costPrice);
                const revenue = toMoneyNumber(qty * unitSell);
                const cost = toMoneyNumber(qty * unitCost);
                const profit = toMoneyNumber(revenue - cost);

                if (!rowsByProduct.has(snackId)) {
                    rowsByProduct.set(snackId, {
                        snackName,
                        soldQty: 0,
                        revenue: 0,
                        cost: 0,
                        profit: 0
                    });
                }
                const row = rowsByProduct.get(snackId);
                row.soldQty = toMoneyNumber(row.soldQty + qty);
                row.revenue = toMoneyNumber(row.revenue + revenue);
                row.cost = toMoneyNumber(row.cost + cost);
                row.profit = toMoneyNumber(row.profit + profit);
            });

            const rows = Array.from(rowsByProduct.values())
                .map(row => ({
                    ...row,
                    marginPct: row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0
                }))
                .sort((a, b) => b.profit - a.profit);

            const totalRevenue = rows.reduce((sum, r) => toMoneyNumber(sum + r.revenue), 0);
            const totalCost = rows.reduce((sum, r) => toMoneyNumber(sum + r.cost), 0);
            const totalProfit = rows.reduce((sum, r) => toMoneyNumber(sum + r.profit), 0);
            const totalSoldQty = toMoneyNumber(rows.reduce((sum, r) => sum + r.soldQty, 0));
            const totalMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
            const soldQtyBySnackId = new Map();
            (Array.isArray(purchases) ? purchases : []).forEach((p) => {
                const snackId = Number(p?.snack?.id);
                if (!Number.isFinite(snackId)) return;
                const qty = Math.max(0.01, Number(p?.qty) || 1);
                soldQtyBySnackId.set(snackId, (soldQtyBySnackId.get(snackId) || 0) + qty);
            });

            const stockCostRows = snacks
                .map((s) => {
                    const snackId = Number(s?.id);
                    const soldByPurchases = Number(soldQtyBySnackId.get(snackId) || 0);
                    const soldByField = Math.max(0, Number(s?.totalSold) || 0);
                    const soldQty = Math.max(soldByPurchases, soldByField);
                    const stock = Math.max(0, Number(s?.stock) || 0);
                    const totalUnits = soldQty + stock;
                    const costPrice = Math.max(0, toMoneyNumber(s?.costPrice));
                    const stockCost = toMoneyNumber(totalUnits * costPrice);
                    return {
                        snackName: s?.name || 'Unknown',
                        soldQty,
                        stock,
                        totalUnits,
                        costPrice,
                        stockCost
                    };
                })
                .sort((a, b) => b.stockCost - a.stockCost || b.totalUnits - a.totalUnits || a.snackName.localeCompare(b.snackName));
            const totalStockCostAll = stockCostRows.reduce((sum, row) => toMoneyNumber(sum + row.stockCost), 0);
            const potentialProfitAllStock = snacks.reduce((sum, s) => {
                const sell = toMoneyNumber(s.price);
                const cost = toMoneyNumber(s.costPrice);
                const stock = Number(s.stock) || 0;
                return toMoneyNumber(sum + toMoneyNumber((sell - cost) * stock));
            }, 0);

            const summary = document.getElementById('profitSummaryCards');
            const stockCostList = document.getElementById('stockCostList');
            const productList = document.getElementById('profitProductList');
            const bestSellerList = document.getElementById('bestSellerList');
            const worstSellerList = document.getElementById('worstSellerList');
            const auditLogList = document.getElementById('auditLogList');
            if (!summary || !stockCostList || !productList || !bestSellerList || !worstSellerList || !auditLogList) return;

            summary.innerHTML = `
                <div class="stat-card">
                    <div class="stat-label">ยอดขายรวม</div>
                    <div class="stat-value">${formatMoneyText(totalRevenue)} &#3647;</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">ต้นทุนรวม</div>
                    <div class="stat-value">${formatMoneyText(totalCost)} &#3647;</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">กำไรรวม</div>
                    <div class="stat-value">${formatMoneyText(totalProfit)} &#3647;</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Margin</div>
                    <div class="stat-value">${totalMarginPct.toFixed(2)}%</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">จำนวนชิ้นที่ขายได้</div>
                    <div class="stat-value">${totalSoldQty}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">กำไรถ้าขายสต็อกหมด</div>
                    <div class="stat-value">${formatMoneyText(potentialProfitAllStock)} &#3647;</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">มูลค่าทุนรวม (ขายไป+คงเหลือ)</div>
                    <div class="stat-value">${formatMoneyText(totalStockCostAll)} &#3647;</div>
                </div>
            `;

            if (stockCostRows.length === 0) {
                stockCostList.innerHTML = '<div class="empty-state" style="padding: 24px;"><div class="empty-state-icon">📦</div><p>ยังไม่มีข้อมูลสินค้า</p></div>';
            } else {
                stockCostList.innerHTML = stockCostRows.map((row) => `
                    <div class="customer-detail-item">
                        <div class="customer-detail-header">
                            <div class="customer-detail-name">${row.snackName}</div>
                            <div class="customer-detail-total">${formatMoneyText(row.stockCost)} &#3647;</div>
                        </div>
                        <div class="customer-detail-info">
                            <span>ขายไป ${row.soldQty} ชิ้น</span>
                            <span>คงเหลือ ${row.stock} ชิ้น</span>
                        </div>
                        <div class="customer-detail-info">
                            <span>รวม ${row.totalUnits} ชิ้น</span>
                            <span>ทุน/ชิ้น ${formatMoneyText(row.costPrice)} &#3647;</span>
                        </div>
                    </div>
                `).join('');
            }

            if (rows.length === 0) {
                const emptyHtml = '<div class="empty-state" style="padding: 24px;"><div class="empty-state-icon">📊</div><p>ยังไม่มีรายการขายในเดือนนี้</p></div>';
                productList.innerHTML = emptyHtml;
                bestSellerList.innerHTML = emptyHtml;
            } else {
                productList.innerHTML = rows.map(r => `
                    <div class="customer-detail-item">
                        <div class="customer-detail-header">
                            <div class="customer-detail-name">${r.snackName}</div>
                            <div class="customer-detail-total">${formatMoneyText(r.profit)} &#3647;</div>
                        </div>
                        <div class="customer-detail-info">
                            <span>ขายได้ ${r.soldQty} ชิ้น</span>
                            <span>กำไร ${r.marginPct.toFixed(2)}%</span>
                        </div>
                        <div class="customer-detail-info">
                            <span>ยอดขาย ${formatMoneyText(r.revenue)} &#3647;</span>
                            <span>ต้นทุน ${formatMoneyText(r.cost)} &#3647;</span>
                        </div>
                    </div>
                `).join('');

                bestSellerList.innerHTML = [...rows]
                    .sort((a, b) => b.soldQty - a.soldQty)
                    .slice(0, 5)
                    .map((r, idx) => `
                        <div class="customer-detail-item">
                            <div class="customer-detail-header">
                                <div class="customer-detail-name">#${idx + 1} ${r.snackName}</div>
                                <div class="customer-detail-total">${r.soldQty} ชิ้น</div>
                            </div>
                            <div class="customer-detail-info">
                                <span>กำไร ${formatMoneyText(r.profit)} &#3647;</span>
                                <span>Margin ${r.marginPct.toFixed(2)}%</span>
                            </div>
                        </div>
                    `).join('');
            }

            const soldBySnackName = new Map(rows.map(r => [r.snackName, r]));
            const worstRows = snacks.map(s => {
                const name = s?.name || 'Unknown';
                const fromSales = soldBySnackName.get(name);
                const soldQty = Number(fromSales?.soldQty) || 0;
                const revenue = toMoneyNumber(fromSales?.revenue);
                const cost = toMoneyNumber(fromSales?.cost);
                const profit = toMoneyNumber(fromSales?.profit);
                return {
                    snackName: name,
                    soldQty,
                    revenue,
                    cost,
                    profit,
                    stock: Math.max(0, Number(s?.stock) || 0)
                };
            })
                .sort((a, b) => a.soldQty - b.soldQty || a.revenue - b.revenue || b.stock - a.stock || a.snackName.localeCompare(b.snackName))
                .slice(0, 5);

            if (worstRows.length === 0) {
                worstSellerList.innerHTML = '<div class="empty-state" style="padding: 24px;"><div class="empty-state-icon">📦</div><p>ยังไม่มีข้อมูลสินค้า</p></div>';
            } else {
                worstSellerList.innerHTML = worstRows.map((r, idx) => `
                    <div class="customer-detail-item">
                        <div class="customer-detail-header">
                            <div class="customer-detail-name">#${idx + 1} ${r.snackName}</div>
                            <div class="customer-detail-total">${r.soldQty} ชิ้น</div>
                        </div>
                        <div class="customer-detail-info">
                            <span>ยอดขาย ${formatMoneyText(r.revenue)} &#3647;</span>
                            <span>กำไร ${formatMoneyText(r.profit)} &#3647;</span>
                        </div>
                        <div class="customer-detail-info">
                            <span>สต็อกคงเหลือ ${r.stock}</span>
                        </div>
                    </div>
                `).join('');
            }

            const auditQuery = (document.getElementById('auditSearch')?.value || '').trim().toLowerCase();
            const auditActionFilter = (document.getElementById('auditActionFilter')?.value || '').trim();
            const auditRoleFilter = (document.getElementById('auditRoleFilter')?.value || '').trim();
            const auditRows = Array.isArray(auditLogs)
                ? auditLogs.filter(row => {
                    const action = (row.action || '').toLowerCase();
                    const detail = (row.detail || '').toLowerCase();
                    const actor = (row.actorName || '').toLowerCase();
                    const role = (row.actorRole || '').toLowerCase();
                    if (auditActionFilter && row.action !== auditActionFilter) return false;
                    if (auditRoleFilter && row.actorRole !== auditRoleFilter) return false;
                    if (!auditQuery) return true;
                    return action.includes(auditQuery) || detail.includes(auditQuery) || actor.includes(auditQuery) || role.includes(auditQuery);
                }).slice(0, 100)
                : [];
            if (auditRows.length === 0) {
                auditLogList.innerHTML = '<div class="empty-state" style="padding: 24px;"><div class="empty-state-icon">🧾</div><p>ยังไม่มี audit log</p></div>';
            } else {
                auditLogList.innerHTML = auditRows.map(row => {
                    const at = new Date(row.at).toLocaleString('th-TH');
                    return `
                        <div class="customer-detail-item">
                            <div class="customer-detail-header">
                                <div class="customer-detail-name">${row.action}</div>
                                <div class="customer-detail-total">${row.actorName}</div>
                            </div>
                            <div class="customer-detail-info">
                                <span>${row.detail}</span>
                            </div>
                            <div class="customer-detail-info">
                                <span>${at}</span>
                                <span>${(row.actorRole || 'staff').toUpperCase()}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        function refreshProfitTabIfVisible() {
            const tab = document.getElementById('manageProfitTab');
            if (tab && tab.style.display !== 'none') {
                renderProfitTab();
            }
        }

        // --- Snack CRUD ---

        // Helper: get snack display HTML (image or emoji fallback)
        function getSnackDisplayHTML(snack, size = 'grid') {
            if (snack.image) {
                const classMap = {
                    'grid': 'snack-img',
                    'manage': 'snack-img-preview',
                    'modal': 'snack-img-modal',
                    'mini': 'snack-img-mini'
                };
                return `<img src="${snack.image}" alt="${snack.name}" class="${classMap[size] || 'snack-img'}">`;
            }
            if (size === 'grid') return `<span class="snack-emoji">${snack.emoji || '🍪'}</span>`;
            if (size === 'manage') return `<span style="font-size: 1.5rem;">${snack.emoji || '🍪'}</span>`;
            if (size === 'modal') return `<span style="font-size: 2rem;">${snack.emoji || '🍪'}</span>`;
            return `<span>${snack.emoji || '🍪'}</span>`;
        }

        // Get snack display name for toast (no HTML)
        function getSnackLabel(snack) {
            return snack.emoji ? `${snack.emoji} ${snack.name}` : snack.name;
        }

        // Preview image when selected in add form
        let pendingSnackImage = null;
        let editingSnackId = null;
        let imageUploadSetupDone = false;
        let isSavingSnack = false;

        function refreshSnackFormMode() {
            const saveBtn = document.getElementById('saveSnackBtn');
            const cancelBtn = document.getElementById('cancelEditSnackBtn');
            if (!saveBtn || !cancelBtn) return;

            if (editingSnackId !== null) {
                saveBtn.textContent = '💾 บันทึกแก้ไข';
                cancelBtn.style.display = 'inline-flex';
            } else {
                saveBtn.textContent = '+ เพิ่ม';
                cancelBtn.style.display = 'none';
            }
        }

        function toMoney2(value) {
            const n = Number(value);
            if (!Number.isFinite(n)) return '';
            return n.toFixed(2);
        }

        function toMoneyNumber(value) {
            const n = Number(value);
            if (!Number.isFinite(n)) return 0;
            return Number(n.toFixed(2));
        }

        function formatMoneyText(value) {
            const n = toMoneyNumber(value);
            return Number.isInteger(n) ? String(n) : n.toFixed(2);
        }

        function formatSnackMoneyInput(inputId) {
            const input = document.getElementById(inputId);
            if (!input) return;
            if (String(input.value || '').trim() === '') return;
            const n = Number(input.value);
            if (!Number.isFinite(n)) return;
            input.value = toMoney2(Math.max(0, n));
        }

        function resetSnackForm() {
            editingSnackId = null;
            pendingSnackImage = null;
            document.getElementById('newSnackImage').value = '';
            document.getElementById('newSnackName').value = '';
            document.getElementById('newSnackPrice').value = '';
            document.getElementById('newSnackCost').value = '';
            document.getElementById('newSnackCategory').value = 'snack';
            document.getElementById('newSnackStock').value = '';
            updateImagePreview();
            refreshSnackFormMode();
        }

        function startEditSnack(id) {
            const snack = snacks.find(s => s.id === id);
            if (!snack) return;

            editingSnackId = id;
            pendingSnackImage = snack.image || null;
            document.getElementById('newSnackImage').value = '';
            document.getElementById('newSnackName').value = snack.name || '';
            document.getElementById('newSnackPrice').value = toMoney2(Number(snack.price) || 0);
            document.getElementById('newSnackCost').value = toMoney2(Number(snack.costPrice) || 0);
            document.getElementById('newSnackCategory').value = normalizeSnackCategory(snack.category, snack.name);
            document.getElementById('newSnackStock').value = snack.stock || 0;
            updateImagePreview();
            refreshSnackFormMode();
            showToast(`✏️ กำลังแก้ไข ${snack.name}`, 'info');
        }

        function cancelEditSnack() {
            resetSnackForm();
        }

        function isImageFileLike(file, mimeHint = '') {
            if (!file) return false;
            const type = String(file.type || mimeHint || '').toLowerCase();
            if (type.startsWith('image/')) return true;
            const name = String(file.name || '').toLowerCase();
            return /\.(png|jpe?g|gif|bmp|webp|svg|heic|heif|avif)$/i.test(name);
        }

        // Process image file (from file input, paste, or drag)
        function processImageFile(file, options = {}) {
            const silent = Boolean(options.silent);
            if (!isImageFileLike(file)) {
                if (!silent) showToast('⚠️ ไม่พบไฟล์รูปภาพในคลิปบอร์ด', 'warning');
                return false;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const maxSize = 280;
                    let w = img.width, h = img.height;
                    if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
                    else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.clearRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);

                    const sourceType = String(file.type || '').toLowerCase();
                    let dataUrl = '';

                    if (sourceType.includes('png')) {
                        dataUrl = canvas.toDataURL('image/png');
                    } else {
                        try {
                            dataUrl = canvas.toDataURL('image/webp', 0.92);
                        } catch (_err) {
                            dataUrl = '';
                        }
                        if (!dataUrl || dataUrl === 'data:,') {
                            dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                        }
                    }

                    pendingSnackImage = dataUrl;
                    updateImagePreview();
                };
                img.onerror = function() {
                    if (!silent) showToast('⚠️ อ่านรูปไม่สำเร็จ กรุณาลองใหม่', 'warning');
                };
                img.src = e.target.result;
            };
            reader.onerror = function() {
                if (!silent) showToast('⚠️ อ่านไฟล์รูปไม่สำเร็จ', 'warning');
            };
            reader.readAsDataURL(file);
            return true;
        }

        function updateImagePreview() {
            const dropZone = document.getElementById('imageDropZone');
            if (pendingSnackImage) {
                dropZone.innerHTML = `<img src="${pendingSnackImage}" alt="preview">`;
                dropZone.classList.add('has-image');
            } else {
                dropZone.innerHTML = '<span class="drop-icon">📷</span><span class="drop-text">วาง/เลือกรูป</span>';
                dropZone.classList.remove('has-image');
            }
        }

        // From file input
        function previewSnackImage(input) {
            processImageFile(input.files[0], { silent: false });
        }

        // Setup paste & drag-drop on the drop zone
        function isSnackManageTabActive() {
            const modal = document.getElementById('manageModal');
            const snackTab = document.getElementById('manageSnacksTab');
            return modal && modal.classList.contains('active') && snackTab && snackTab.style.display !== 'none';
        }

        function getImageFromClipboardData(data) {
            if (!data) return null;

            const items = Array.from(data.items || []);
            for (const item of items) {
                if (item.kind !== 'file') continue;
                const file = item.getAsFile();
                if (isImageFileLike(file, item.type)) return file;
            }

            const files = Array.from(data.files || []);
            if (files.length > 0) {
                for (const file of files) {
                    if (isImageFileLike(file)) return file;
                }
            }
            return null;
        }

        function getClipboardImageCandidate(data) {
            if (!data || typeof data.getData !== 'function') return null;
            const html = data.getData('text/html') || '';
            const uriList = data.getData('text/uri-list') || '';
            const plain = data.getData('text/plain') || '';

            const fromHtml = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '';
            const candidates = [fromHtml, uriList, plain]
                .map(v => String(v || '').trim())
                .filter(Boolean);

            for (const value of candidates) {
                if (/^data:image\//i.test(value)) return value;
                if (/^https?:\/\//i.test(value)) return value;
            }
            return null;
        }

        async function processImageSource(source, options = {}) {
            const silent = Boolean(options.silent);
            if (!source) return false;
            try {
                const res = await fetch(source);
                if (!res.ok) {
                    if (!silent) showToast(`⚠️ โหลดรูปไม่สำเร็จ (HTTP ${res.status})`, 'warning');
                    return false;
                }
                const contentType = String(res.headers.get('content-type') || '').toLowerCase();
                if (!contentType.startsWith('image/')) {
                    if (!silent) showToast('⚠️ ข้อมูลที่วางไม่ใช่รูปภาพ', 'warning');
                    return false;
                }
                const blob = await res.blob();
                return processImageFile(blob, { silent });
            } catch (err) {
                if (!silent) {
                    const reason = String(err?.message || err?.name || 'Unknown error');
                    showToast(`⚠️ อ่านรูปจากข้อมูลที่วางไม่ได้: ${reason}`, 'warning');
                }
                return false;
            }
        }

        function clipboardLooksLikeImage(data) {
            const types = Array.from(data?.types || []).map(t => String(t).toLowerCase());
            return types.some(t => t === 'files' || t.startsWith('image/'));
        }

        async function readImageFromNavigatorClipboard(showFailToast = true) {
            if (!navigator.clipboard || !navigator.clipboard.read) {
                if (showFailToast) showToast('⚠️ เบราว์เซอร์ไม่รองรับการอ่านคลิปบอร์ดรูป', 'warning');
                return false;
            }

            try {
                const clipboardItems = await navigator.clipboard.read();
                for (const item of clipboardItems) {
                    const imageType = item.types.find(t => t.startsWith('image/'));
                    if (!imageType) continue;

                    const blob = await item.getType(imageType);
                    const ok = processImageFile(blob, { silent: !showFailToast });
                    if (ok) return true;
                }
                if (showFailToast) showToast('⚠️ ไม่พบรูปในคลิปบอร์ด', 'warning');
                return false;
            } catch (err) {
                if (showFailToast) {
                    const reason = String(err?.message || err?.name || 'Unknown error');
                    showToast(`⚠️ อ่านรูปจากคลิปบอร์ดไม่ได้: ${reason}`, 'warning');
                }
                return false;
            }
        }

        function handlePasteImageEvent(e) {
            if (!isSnackManageTabActive()) return false;

            // 1) Try to get image directly from sync clipboardData (works for most apps)
            const file = getImageFromClipboardData(e.clipboardData);
            if (file) {
                e.preventDefault();
                var ok = processImageFile(file, { silent: false });
                if (ok) showToast('✅ วางรูปสำเร็จ!', 'success');
                return ok;
            }

            // 2) Try to extract image URL/data from HTML in clipboardData
            const source = getClipboardImageCandidate(e.clipboardData);
            if (source) {
                e.preventDefault();
                void processImageSource(source, { silent: false }).then((ok) => {
                    if (ok) showToast('✅ วางรูปสำเร็จ!', 'success');
                });
                return true;
            }

            // 3) Fallback for Excel/Office: clipboard.read() via setTimeout.
            //    Chrome blocks navigator.clipboard.read() inside a paste handler,
            //    so we let the paste complete normally first, then try async.
            //    If image is found, we clean up any text that was pasted into the input.
            var pasteTarget = document.activeElement;
            var valueBefore = (pasteTarget && (pasteTarget.tagName === 'INPUT' || pasteTarget.tagName === 'TEXTAREA'))
                ? pasteTarget.value : undefined;

            setTimeout(function() {
                readImageFromNavigatorClipboard(true).then(function(ok) {
                    if (ok) {
                        showToast('✅ วางรูปสำเร็จ!', 'success');
                        // Undo text that browser pasted into the input
                        if (pasteTarget && valueBefore !== undefined && pasteTarget.value !== valueBefore) {
                            pasteTarget.value = valueBefore;
                            pasteTarget.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                });
            }, 0);

            // Don't preventDefault — let browser paste text normally as fallback
            return false;
        }

        async function pasteImageFromClipboard() {
            if (!isSnackManageTabActive()) {
                showToast('⚠️ เปิดแท็บสินค้าแล้วลองใหม่', 'warning');
                return;
            }
            const ok = await readImageFromNavigatorClipboard(true);
            if (ok) showToast('✅ วางรูปสำเร็จ!', 'success');
        }

        function setupImageUpload() {
            if (imageUploadSetupDone) return;
            const dropZone = document.getElementById('imageDropZone');
            if (!dropZone) return;
            imageUploadSetupDone = true;

            // Catch Ctrl+V globally when snack manage tab is active (capture phase)
            document.addEventListener('paste', function(e) {
                if (handlePasteImageEvent(e)) e.stopPropagation();
            }, true);

            // Fallback for browsers that don't dispatch paste file data reliably.
            // When focus is on an input/textarea, let the paste event fire instead
            // so handlePasteImageEvent can use navigator.clipboard.read().
            document.addEventListener('keydown', function(e) {
                if (!isSnackManageTabActive()) return;
                const key = String(e.key || '').toLowerCase();
                const isPasteShortcut = (e.ctrlKey || e.metaKey) && key === 'v';
                if (!isPasteShortcut) return;

                const target = e.target;
                const tag = String(target?.tagName || '').toUpperCase();
                const isTypingTarget = target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA';
                if (isTypingTarget) return;

                e.preventDefault();
                void readImageFromNavigatorClipboard(true).then((ok) => {
                    if (ok) showToast('✅ วางรูปสำเร็จ!', 'success');
                });
            }, true);

            // Keep support when user pastes inside the modal/drop zone
            document.getElementById('manageModal').addEventListener('paste', function(e) {
                if (handlePasteImageEvent(e)) e.stopPropagation();
            }, true);

            // Drag & drop
            dropZone.addEventListener('dragover', function(e) {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });
            dropZone.addEventListener('dragleave', function() {
                dropZone.classList.remove('drag-over');
            });
            dropZone.addEventListener('drop', function(e) {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                const file = e.dataTransfer?.files[0];
                if (isImageFileLike(file)) {
                    processImageFile(file, { silent: false });
                    showToast('✅ วางรูปสำเร็จ!', 'success');
                } else {
                    showToast('⚠️ ไฟล์ที่วางไม่ใช่รูปภาพ', 'warning');
                }
            });

            // Paste when drop zone is focused
            dropZone.addEventListener('paste', function(e) {
                handlePasteImageEvent(e);
            });
        }

        function renderManageSnackList() {
            const list = document.getElementById('manageSnackList');
            if (snacks.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding: 30px;"><div class="empty-state-icon">🍪</div><p>ยังไม่มีสินค้า</p></div>';
                return;
            }
            list.innerHTML = snacks.map(s => `
                <div class="manage-item">
                    <div class="manage-item-info">
                        ${getSnackDisplayHTML(s, 'manage')}
                        <span>${s.name}</span>
                        <span class="manage-item-price">${toMoney2(Number(s.price) || 0)} ฿</span>
                        <span style="font-size: 0.85rem; color: var(--text-light);">ทุน ${toMoney2(Number(s.costPrice) || 0)} ฿</span>
                        <span style="font-size: 0.85rem; color: var(--text-light);">กลุ่ม ${snackCategoryLabel(normalizeSnackCategory(s.category, s.name))}</span>
                        <span style="font-size: 0.85rem; color: var(--text-light);">ขายสะสม ${Number(s.totalSold) || 0} ชิ้น</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.85rem; color: var(--text-light);">คลัง:</span>
                        <input type="number" class="manage-stock-input" value="${s.stock || 0}" min="0" step="0.5"
                               onchange="updateStock(${s.id}, this.value)">
                        <button class="btn-stock" onclick="addStock(${s.id}, 10)">+10</button>
                        <button class="btn-edit" onclick="startEditSnack(${s.id})">แก้ไข</button>
                        <button class="btn-delete" onclick="deleteSnack(${s.id})">ลบ</button>
                    </div>
                </div>
            `).join('');
        }

        async function addOrUpdateSnack() {
            if (isSavingSnack) return;
            const saveBtn = document.getElementById('saveSnackBtn');
            const originalLabel = saveBtn ? saveBtn.textContent : '';
            try {
                isSavingSnack = true;
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.textContent = 'กำลังบันทึก...';
                }

                if (editingSnackId !== null) {
                    await updateSnack(editingSnackId);
                    return;
                }
                await addSnack();
            } catch (err) {
                const reason = err?.message ? String(err.message) : 'ไม่ทราบสาเหตุ';
                console.error('addOrUpdateSnack failed:', err);
                showToast(`⚠️ บันทึกไม่สำเร็จ: ${reason}`, 'warning');
            } finally {
                isSavingSnack = false;
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = originalLabel || (editingSnackId !== null ? '💾 บันทึกแก้ไข' : '+ เพิ่ม');
                }
            }
        }

        async function syncSnackDbFirst(snack, options = {}) {
            const includeImage = Boolean(options?.includeImage);
            const directOk = await syncSnackNow(snack, { silent: true, includeImage });
            if (directOk) return true;
            const fullStateOk = await flushStateSync();
            return Boolean(fullStateOk);
        }

        async function addSnack() {
            if (!ensureCanManageData()) return;
            const name = document.getElementById('newSnackName').value.trim();
            const price = Number(document.getElementById('newSnackPrice').value);
            const costPrice = Number(document.getElementById('newSnackCost').value) || 0;
            const category = normalizeSnackCategory(document.getElementById('newSnackCategory').value, name);
            const stock = Number(document.getElementById('newSnackStock').value) || 0;

            if (!pendingSnackImage) { showToast('⚠️ กรุณาเลือกรูปสินค้า', 'warning'); return; }
            if (!name) { showToast('⚠️ กรุณาใส่ชื่อสินค้า', 'warning'); return; }
            if (!price || price <= 0) { showToast('⚠️ กรุณาใส่ราคาที่ถูกต้อง', 'warning'); return; }
            if (costPrice < 0) { showToast('⚠️ กรุณาใส่ราคาทุนที่ถูกต้อง', 'warning'); return; }

            const previousSnacks = JSON.parse(JSON.stringify(snacks));
            const newId = snacks.length > 0 ? Math.max(...snacks.map(s => s.id)) + 1 : 1;
            const normalizedPrice = Number(price.toFixed(2));
            const normalizedCostPrice = Number(costPrice.toFixed(2));
            snacks.push({
                id: newId,
                name,
                image: pendingSnackImage,
                emoji: '',
                price: normalizedPrice,
                sellPrice: normalizedPrice,
                costPrice: normalizedCostPrice,
                totalSold: 0,
                category,
                stock,
                createdAt: new Date().toISOString()
            });
            const newSnack = snacks.find(s => s.id === newId);
            if (!newSnack) {
                snacks = previousSnacks;
                throw new Error('ไม่พบข้อมูลสินค้าที่สร้างใหม่');
            }

            const ok = await syncSnackDbFirst(newSnack, { includeImage: true });
            if (!ok) {
                snacks = previousSnacks;
                renderManageSnackList();
                renderSnackGrid();
                refreshProfitTabIfVisible();
                throw new Error('ซิงค์ฐานข้อมูลไม่สำเร็จ');
            }

            persistSnacksLocalOnly();
            addAuditLog('snack.create', `เพิ่มสินค้า ${name}`, { id: newId, price: normalizedPrice, costPrice: normalizedCostPrice, category, stock });
            renderManageSnackList();
            renderSnackGrid();
            refreshProfitTabIfVisible();

            // Reset form
            resetSnackForm();

            showToast(`✅ เพิ่ม ${name} สำเร็จ!`, 'success');
        }

        async function updateSnack(id) {
            if (!ensureCanManageData()) return;
            const snack = snacks.find(s => s.id === id);
            if (!snack) {
                showToast('⚠️ ไม่พบสินค้าที่กำลังแก้ไข กรุณากด "แก้ไข" ใหม่อีกครั้ง', 'warning');
                resetSnackForm();
                return;
            }

            const name = document.getElementById('newSnackName').value.trim();
            const price = Number(document.getElementById('newSnackPrice').value);
            const costPrice = Number(document.getElementById('newSnackCost').value) || 0;
            const category = normalizeSnackCategory(document.getElementById('newSnackCategory').value, name);
            const stock = Number(document.getElementById('newSnackStock').value);
            const oldPrice = Number(snack.price) || 0;

            if (!name) { showToast('⚠️ กรุณาใส่ชื่อสินค้า', 'warning'); return; }
            if (!price || price <= 0) { showToast('⚠️ กรุณาใส่ราคาที่ถูกต้อง', 'warning'); return; }
            if (costPrice < 0) { showToast('⚠️ กรุณาใส่ราคาทุนที่ถูกต้อง', 'warning'); return; }
            if (!Number.isFinite(stock) || stock < 0) { showToast('⚠️ กรุณาใส่จำนวนที่ถูกต้อง', 'warning'); return; }

            const previousSnack = JSON.parse(JSON.stringify(snack));
            snack.name = name;
            const normalizedPrice = Number(price.toFixed(2));
            const normalizedCostPrice = Number(costPrice.toFixed(2));
            snack.price = normalizedPrice;
            snack.sellPrice = normalizedPrice;
            snack.costPrice = normalizedCostPrice;
            snack.category = category;
            snack.stock = stock;

            if (pendingSnackImage) {
                snack.image = pendingSnackImage;
                snack.emoji = '';
            }

            const ok = await syncSnackDbFirst(snack, { includeImage: Boolean(pendingSnackImage) });
            if (!ok) {
                Object.assign(snack, previousSnack);
                renderManageSnackList();
                renderSnackGrid();
                refreshProfitTabIfVisible();
                throw new Error('ซิงค์ฐานข้อมูลไม่สำเร็จ');
            }

            persistSnacksLocalOnly();
            if (oldPrice !== normalizedPrice) {
                addAuditLog(
                    'snack.price.change',
                    `เปลี่ยนราคา ${name}: ${oldPrice.toFixed(2)} -> ${normalizedPrice.toFixed(2)} บาท`,
                    { id, oldPrice, newPrice: normalizedPrice }
                );
            }
            addAuditLog('snack.update', `แก้ไขสินค้า ${name}`, { id, price: normalizedPrice, costPrice: normalizedCostPrice, category, stock });
            renderManageSnackList();
            renderSnackGrid();
            resetSnackForm();
            refreshProfitTabIfVisible();
            showToast(`✅ แก้ไข ${name} สำเร็จ!`, 'success');
        }

        async function updateStock(id, value) {
            if (!ensureCanManageData()) return;
            const snack = snacks.find(s => s.id === id);
            if (snack) {
                const previousStock = snack.stock;
                snack.stock = Math.max(0, Number(value) || 0);
                const ok = await syncSnackDbFirst(snack);
                if (!ok) {
                    snack.stock = previousStock;
                    showToast('⚠️ ซิงค์ฐานข้อมูลไม่สำเร็จ ยกเลิกการเปลี่ยนคลัง', 'warning');
                    renderManageSnackList();
                    return;
                }
                persistSnacksLocalOnly();
                addAuditLog('snack.stock.set', `ปรับสต็อก ${snack.name}`, { id, stock: snack.stock });
                renderSnackGrid();
                refreshProfitTabIfVisible();
            }
        }

        async function addStock(id, amount) {
            if (!ensureCanManageData()) return;
            const snack = snacks.find(s => s.id === id);
            if (snack) {
                const previousStock = snack.stock || 0;
                snack.stock = (snack.stock || 0) + amount;
                const ok = await syncSnackDbFirst(snack);
                if (!ok) {
                    snack.stock = previousStock;
                    showToast('⚠️ ซิงค์ฐานข้อมูลไม่สำเร็จ ยกเลิกการเพิ่มคลัง', 'warning');
                    renderManageSnackList();
                    return;
                }
                persistSnacksLocalOnly();
                addAuditLog('snack.stock.add', `เพิ่มสต็อก ${snack.name}`, { id, amount, stock: snack.stock });
                renderManageSnackList();
                renderSnackGrid();
                refreshProfitTabIfVisible();
                showToast(`✅ เพิ่มสต็อก ${snack.name} +${amount}`, 'success');
            }
        }

        function deleteSnack(id) {
            if (!ensureCanManageData()) return;
            const snack = snacks.find(s => s.id === id);
            if (!confirm(`ต้องการลบ "${snack.name}" หรือไม่?`)) return;

            snacks = snacks.filter(s => s.id !== id);
            saveSnacks();
            addAuditLog('snack.delete', `ลบสินค้า ${snack.name}`, { id });
            renderManageSnackList();
            renderSnackGrid();
            refreshProfitTabIfVisible();

            showToast(`🗑️ ลบ ${snack.name} แล้ว`, 'info');
        }

        function saveSnacks() {
            persistSnacksLocalOnly();
            void flushStateSync();
        }

        function persistSnacksLocalOnly() {
            snacks = normalizeSnackData(snacks);
            localStorage.setItem('snackItems', JSON.stringify(snacks));
            scheduleStateSync();
        }

        // --- Customer CRUD ---

        function renderManageCustomerList() {
            const list = document.getElementById('manageCustomerList');
            if (customers.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding: 30px;"><div class="empty-state-icon">👥</div><p>ยังไม่มีลูกค้า</p></div>';
                return;
            }
            const shifts = ['A', 'B', 'C', 'D', 'O'];
            const shiftLabel = { A: 'Shift A', B: 'Shift B', C: 'Shift C', D: 'Shift D', O: 'อื่นๆ' };
            list.innerHTML = shifts.map(shift => {
                const group = customers.filter(c => c.shift === shift);
                if (group.length === 0) return '';
                return `
                    <div style="margin-bottom: 15px;">
                        <div style="font-weight: 600; color: var(--secondary); margin-bottom: 8px; font-size: 0.95rem;">${shiftLabel[shift] || shift} (${group.length} คน)</div>
                        ${group.map(c => `
                            <div class="manage-item">
                                <div class="manage-item-info">
                                    <span>👤</span>
                                    <span>${c.name}</span>
                                    <span style="font-size: 0.8rem; color: var(--text-light); background: #f0f0f0; padding: 2px 8px; border-radius: 6px;">${shiftLabel[c.shift] || c.shift}</span>
                                </div>
                                <button class="btn-delete" onclick="deleteCustomer('${c.name}')">ลบ</button>
                            </div>
                        `).join('')}
                    </div>
                `;
            }).join('');
        }

        function renderManageUserRoleList() {
            const list = document.getElementById('manageUserRoleList');
            if (!list) return;
            if (!Array.isArray(users) || users.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding: 24px;"><div class="empty-state-icon">🧑‍💼</div><p>ยังไม่มีผู้ใช้</p></div>';
                return;
            }

            const adminCount = users.filter(u => u.role === 'admin').length;
            const roleWeight = { admin: 0, staff: 1, guest: 2 };
            list.innerHTML = users
                .slice()
                .sort((a, b) => (roleWeight[a.role] ?? 99) - (roleWeight[b.role] ?? 99) || a.displayName.localeCompare(b.displayName))
                .map(u => {
                    const isAdmin = u.role === 'admin';
                    const canDowngradeAdmin = !isAdmin || adminCount > 1;
                    const roleBadgeColor = u.role === 'admin'
                        ? 'var(--primary)'
                        : u.role === 'guest'
                            ? 'var(--warning)'
                            : 'var(--secondary)';
                    const actions = [];
                    if (u.role !== 'admin') {
                        actions.push(`<button class="btn-stock" onclick="setUserRole(${u.id}, 'admin')">เลื่อนเป็น Admin</button>`);
                    }
                    if (u.role !== 'staff') {
                        actions.push(`<button class="btn-edit" ${isAdmin && !canDowngradeAdmin ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''} onclick="setUserRole(${u.id}, 'staff')">ตั้งเป็น Staff</button>`);
                    }
                    if (u.role !== 'guest') {
                        actions.push(`<button class="btn-outline" ${isAdmin && !canDowngradeAdmin ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''} onclick="setUserRole(${u.id}, 'guest')">ตั้งเป็น Guest</button>`);
                    }
                    return `
                        <div class="manage-item">
                            <div class="manage-item-info">
                                <span>🧑</span>
                                <span>${u.displayName}</span>
                                <span style="font-size: 0.8rem; color: ${roleBadgeColor}; border: 1px solid ${roleBadgeColor}; padding: 2px 8px; border-radius: 999px; font-weight: 700;">${(u.role || 'staff').toUpperCase()}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${actions.join('')}
                            </div>
                        </div>
                    `;
                }).join('');
        }

        function setUserRole(userId, nextRole) {
            if (!ensureCanManageData()) return;
            const user = users.find(u => Number(u.id) === Number(userId));
            if (!user) return;
            const role = nextRole === 'admin' ? 'admin' : nextRole === 'guest' ? 'guest' : 'staff';
            if (user.role === role) return;

            if (user.role === 'admin' && role !== 'admin') {
                const adminCount = users.filter(u => u.role === 'admin').length;
                if (adminCount <= 1) {
                    showToast('ต้องมี Admin อย่างน้อย 1 คน', 'warning');
                    return;
                }
            }

            user.role = role;
            saveUsers();
            addAuditLog('user.role.update', `ปรับสิทธิ์ ${user.displayName} เป็น ${role.toUpperCase()}`, { userId: user.id, role });

            if (currentUser && Number(currentUser.id) === Number(user.id)) {
                currentUser.role = role;
                const roleBadge = document.getElementById('userRoleBadge');
                if (roleBadge) roleBadge.textContent = roleLabel(role);
                if (typeof applyRoleVisibility === 'function') applyRoleVisibility();
                if (!canManageData() && typeof closeManageModal === 'function') {
                    closeManageModal();
                }
            }

            renderManageUserRoleList();
            refreshProfitTabIfVisible();
            showToast(`ปรับสิทธิ์ ${user.displayName} เป็น ${role.toUpperCase()} แล้ว`, 'success');
        }

        function addCustomer() {
            if (!ensureCanManageData()) return;
            const name = document.getElementById('newCustomerName').value.trim();
            const shift = document.getElementById('newCustomerShift').value;
            const shiftLabel = { A: 'Shift A', B: 'Shift B', C: 'Shift C', D: 'Shift D', O: 'อื่นๆ' };

            if (!name) { showToast('⚠️ กรุณาใส่ชื่อลูกค้า', 'warning'); return; }
            if (customers.some(c => c.name === name)) { showToast('⚠️ ชื่อนี้มีอยู่แล้ว', 'warning'); return; }

            customers.push({ name, shift });
            saveCustomers();
            addAuditLog('customer.create', `เพิ่มลูกค้า ${name}`, { shift });
            renderManageCustomerList();

            document.getElementById('newCustomerName').value = '';

            showToast(`✅ เพิ่มลูกค้า "${name}" (${shiftLabel[shift] || shift}) สำเร็จ!`, 'success');
        }

        function deleteCustomer(name) {
            if (!ensureCanManageData()) return;
            if (!confirm(`ต้องการลบ "${name}" หรือไม่?`)) return;

            customers = customers.filter(c => c.name !== name);
            saveCustomers();
            addAuditLog('customer.delete', `ลบลูกค้า ${name}`, {});
            renderManageCustomerList();

            showToast(`🗑️ ลบลูกค้า "${name}" แล้ว`, 'info');
        }

        function saveCustomers() {
            localStorage.setItem('customerList', JSON.stringify(customers));
            scheduleStateSync();
            void flushStateSync();
        }
