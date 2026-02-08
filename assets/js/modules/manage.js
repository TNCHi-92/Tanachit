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
                const sell = Number(p.unitPrice ?? p.price) || 0;
                const cost = Number(p.unitCost ?? p.snack?.costPrice) || 0;
                const profit = Number.isFinite(Number(p.profit)) ? Number(p.profit) : (sell - cost);

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
                row.soldQty += 1;
                row.revenue += sell;
                row.cost += cost;
                row.profit += profit;
            });

            const rows = Array.from(rowsByProduct.values())
                .map(row => ({
                    ...row,
                    marginPct: row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0
                }))
                .sort((a, b) => b.profit - a.profit);

            const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
            const totalCost = rows.reduce((sum, r) => sum + r.cost, 0);
            const totalProfit = rows.reduce((sum, r) => sum + r.profit, 0);
            const totalSoldQty = rows.reduce((sum, r) => sum + r.soldQty, 0);
            const totalMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
            const potentialProfitAllStock = snacks.reduce((sum, s) => {
                const sell = Number(s.price) || 0;
                const cost = Number(s.costPrice) || 0;
                const stock = Number(s.stock) || 0;
                return sum + ((sell - cost) * stock);
            }, 0);

            const summary = document.getElementById('profitSummaryCards');
            const productList = document.getElementById('profitProductList');
            const bestSellerList = document.getElementById('bestSellerList');
            const auditLogList = document.getElementById('auditLogList');
            if (!summary || !productList || !bestSellerList || !auditLogList) return;

            summary.innerHTML = `
                <div class="stat-card">
                    <div class="stat-label">ยอดขายรวม</div>
                    <div class="stat-value">${totalRevenue} &#3647;</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">ต้นทุนรวม</div>
                    <div class="stat-value">${totalCost} &#3647;</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">กำไรรวม</div>
                    <div class="stat-value">${totalProfit} &#3647;</div>
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
                    <div class="stat-value">${potentialProfitAllStock} &#3647;</div>
                </div>
            `;

            if (rows.length === 0) {
                const emptyHtml = '<div class="empty-state" style="padding: 24px;"><div class="empty-state-icon">📊</div><p>ยังไม่มีรายการขายในเดือนนี้</p></div>';
                productList.innerHTML = emptyHtml;
                bestSellerList.innerHTML = emptyHtml;
            } else {
                productList.innerHTML = rows.map(r => `
                    <div class="customer-detail-item">
                        <div class="customer-detail-header">
                            <div class="customer-detail-name">${r.snackName}</div>
                            <div class="customer-detail-total">${r.profit} &#3647;</div>
                        </div>
                        <div class="customer-detail-info">
                            <span>ขายได้ ${r.soldQty} ชิ้น</span>
                            <span>กำไร ${r.marginPct.toFixed(2)}%</span>
                        </div>
                        <div class="customer-detail-info">
                            <span>ยอดขาย ${r.revenue} &#3647;</span>
                            <span>ต้นทุน ${r.cost} &#3647;</span>
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
                                <span>กำไร ${r.profit} &#3647;</span>
                                <span>Margin ${r.marginPct.toFixed(2)}%</span>
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

        function resetSnackForm() {
            editingSnackId = null;
            pendingSnackImage = null;
            document.getElementById('newSnackImage').value = '';
            document.getElementById('newSnackName').value = '';
            document.getElementById('newSnackPrice').value = '';
            document.getElementById('newSnackCost').value = '';
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
            document.getElementById('newSnackPrice').value = snack.price || '';
            document.getElementById('newSnackCost').value = snack.costPrice || 0;
            document.getElementById('newSnackStock').value = snack.stock || 0;
            updateImagePreview();
            refreshSnackFormMode();
            showToast(`✏️ กำลังแก้ไข ${snack.name}`, 'info');
        }

        function cancelEditSnack() {
            resetSnackForm();
        }

        // Process image file (from file input, paste, or drag)
        function processImageFile(file) {
            if (!file || !file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const maxSize = 150;
                    let w = img.width, h = img.height;
                    if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
                    else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    pendingSnackImage = canvas.toDataURL('image/jpeg', 0.7);
                    updateImagePreview();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
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
            processImageFile(input.files[0]);
        }

        // Setup paste & drag-drop on the drop zone
        function isSnackManageTabActive() {
            const modal = document.getElementById('manageModal');
            const snackTab = document.getElementById('manageSnacksTab');
            return modal && modal.classList.contains('active') && snackTab && snackTab.style.display !== 'none';
        }

        function getImageFromClipboardData(data) {
            if (!data) return null;

            if (data.files && data.files.length > 0) {
                for (const file of data.files) {
                    if (file.type && file.type.startsWith('image/')) return file;
                }
            }

            const items = data.items || [];
            for (const item of items) {
                if (item.type && item.type.startsWith('image/')) {
                    return item.getAsFile();
                }
            }
            return null;
        }

        function handlePasteImageEvent(e) {
            if (!isSnackManageTabActive()) return false;

            const file = getImageFromClipboardData(e.clipboardData);
            if (!file) return false;

            e.preventDefault();
            processImageFile(file);
            showToast('✅ วางรูปสำเร็จ!', 'success');
            return true;
        }

        async function pasteImageFromClipboard() {
            if (!isSnackManageTabActive()) {
                showToast('⚠️ เปิดแท็บสินค้าแล้วลองใหม่', 'warning');
                return;
            }

            if (!navigator.clipboard || !navigator.clipboard.read) {
                showToast('⚠️ เบราว์เซอร์ไม่รองรับปุ่มนี้ ให้ใช้ Ctrl+V แทน', 'warning');
                return;
            }

            try {
                const clipboardItems = await navigator.clipboard.read();
                for (const item of clipboardItems) {
                    const imageType = item.types.find(t => t.startsWith('image/'));
                    if (!imageType) continue;

                    const blob = await item.getType(imageType);
                    processImageFile(blob);
                    showToast('✅ วางรูปสำเร็จ!', 'success');
                    return;
                }
                showToast('⚠️ ไม่พบรูปในคลิปบอร์ด', 'warning');
            } catch (err) {
                showToast('⚠️ กด Ctrl+V เพื่อวางรูปแทนปุ่มนี้', 'warning');
            }
        }

        function setupImageUpload() {
            const dropZone = document.getElementById('imageDropZone');
            if (!dropZone) return;

            // Catch Ctrl+V globally when snack manage tab is active
            document.addEventListener('paste', function(e) {
                if (handlePasteImageEvent(e)) e.stopPropagation();
            });

            // Keep support when user pastes inside the modal/drop zone
            document.getElementById('manageModal').addEventListener('paste', function(e) {
                if (handlePasteImageEvent(e)) e.stopPropagation();
            });

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
                if (file && file.type.startsWith('image/')) {
                    processImageFile(file);
                    showToast('✅ วางรูปสำเร็จ!', 'success');
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
                        <span class="manage-item-price">${s.price} ฿</span>
                        <span style="font-size: 0.85rem; color: var(--text-light);">ทุน ${Number(s.costPrice) || 0} ฿</span>
                        <span style="font-size: 0.85rem; color: var(--text-light);">ขายสะสม ${Number(s.totalSold) || 0} ชิ้น</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.85rem; color: var(--text-light);">คลัง:</span>
                        <input type="number" class="manage-stock-input" value="${s.stock || 0}" min="0"
                               onchange="updateStock(${s.id}, this.value)">
                        <button class="btn-stock" onclick="addStock(${s.id}, 10)">+10</button>
                        <button class="btn-edit" onclick="startEditSnack(${s.id})">แก้ไข</button>
                        <button class="btn-delete" onclick="deleteSnack(${s.id})">ลบ</button>
                    </div>
                </div>
            `).join('');
        }

        async function addOrUpdateSnack() {
            if (editingSnackId !== null) {
                await updateSnack(editingSnackId);
                return;
            }
            await addSnack();
        }

        async function addSnack() {
            if (!ensureCanManageData()) return;
            const name = document.getElementById('newSnackName').value.trim();
            const price = parseInt(document.getElementById('newSnackPrice').value);
            const costPrice = parseInt(document.getElementById('newSnackCost').value) || 0;
            const stock = parseInt(document.getElementById('newSnackStock').value) || 0;

            if (!pendingSnackImage) { showToast('⚠️ กรุณาเลือกรูปสินค้า', 'warning'); return; }
            if (!name) { showToast('⚠️ กรุณาใส่ชื่อสินค้า', 'warning'); return; }
            if (!price || price <= 0) { showToast('⚠️ กรุณาใส่ราคาที่ถูกต้อง', 'warning'); return; }
            if (costPrice < 0) { showToast('⚠️ กรุณาใส่ราคาทุนที่ถูกต้อง', 'warning'); return; }

            const newId = snacks.length > 0 ? Math.max(...snacks.map(s => s.id)) + 1 : 1;
            snacks.push({ id: newId, name, image: pendingSnackImage, emoji: '', price, sellPrice: price, costPrice, totalSold: 0, stock });
            const newSnack = snacks.find(s => s.id === newId);
            saveSnacks();
            if (newSnack) {
                const ok = await syncSnackNow(newSnack);
                if (!ok) {
                    void flushStateSync();
                }
            }
            addAuditLog('snack.create', `เพิ่มสินค้า ${name}`, { id: newId, price, costPrice, stock });
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
            if (!snack) return;

            const name = document.getElementById('newSnackName').value.trim();
            const price = parseInt(document.getElementById('newSnackPrice').value);
            const costPrice = parseInt(document.getElementById('newSnackCost').value) || 0;
            const stock = parseInt(document.getElementById('newSnackStock').value);
            const oldPrice = Number(snack.price) || 0;

            if (!name) { showToast('⚠️ กรุณาใส่ชื่อสินค้า', 'warning'); return; }
            if (!price || price <= 0) { showToast('⚠️ กรุณาใส่ราคาที่ถูกต้อง', 'warning'); return; }
            if (costPrice < 0) { showToast('⚠️ กรุณาใส่ราคาทุนที่ถูกต้อง', 'warning'); return; }
            if (!Number.isFinite(stock) || stock < 0) { showToast('⚠️ กรุณาใส่จำนวนที่ถูกต้อง', 'warning'); return; }

            snack.name = name;
            snack.price = price;
            snack.sellPrice = price;
            snack.costPrice = costPrice;
            snack.stock = stock;

            if (pendingSnackImage) {
                snack.image = pendingSnackImage;
                snack.emoji = '';
            }

            saveSnacks();
            const ok = await syncSnackNow(snack);
            if (!ok) {
                void flushStateSync();
            }
            if (oldPrice !== price) {
                addAuditLog(
                    'snack.price.change',
                    `เปลี่ยนราคา ${name}: ${oldPrice} -> ${price} บาท`,
                    { id, oldPrice, newPrice: price }
                );
            }
            addAuditLog('snack.update', `แก้ไขสินค้า ${name}`, { id, price, costPrice, stock });
            renderManageSnackList();
            renderSnackGrid();
            resetSnackForm();
            refreshProfitTabIfVisible();
            showToast(`✅ แก้ไข ${name} สำเร็จ!`, 'success');
        }

        function updateStock(id, value) {
            if (!ensureCanManageData()) return;
            const snack = snacks.find(s => s.id === id);
            if (snack) {
                snack.stock = Math.max(0, parseInt(value) || 0);
                saveSnacks();
                void syncSnackNow(snack);
                addAuditLog('snack.stock.set', `ปรับสต็อก ${snack.name}`, { id, stock: snack.stock });
                renderSnackGrid();
                refreshProfitTabIfVisible();
            }
        }

        function addStock(id, amount) {
            if (!ensureCanManageData()) return;
            const snack = snacks.find(s => s.id === id);
            if (snack) {
                snack.stock = (snack.stock || 0) + amount;
                saveSnacks();
                void syncSnackNow(snack);
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
            snacks = normalizeSnackData(snacks);
            localStorage.setItem('snackItems', JSON.stringify(snacks));
            scheduleStateSync();
            void flushStateSync();
        }

        // --- Customer CRUD ---

        function renderManageCustomerList() {
            const list = document.getElementById('manageCustomerList');
            if (customers.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding: 30px;"><div class="empty-state-icon">👥</div><p>ยังไม่มีลูกค้า</p></div>';
                return;
            }
            const shifts = ['A', 'B', 'C', 'D'];
            list.innerHTML = shifts.map(shift => {
                const group = customers.filter(c => c.shift === shift);
                if (group.length === 0) return '';
                return `
                    <div style="margin-bottom: 15px;">
                        <div style="font-weight: 600; color: var(--secondary); margin-bottom: 8px; font-size: 0.95rem;">Shift ${shift} (${group.length} คน)</div>
                        ${group.map(c => `
                            <div class="manage-item">
                                <div class="manage-item-info">
                                    <span>👤</span>
                                    <span>${c.name}</span>
                                    <span style="font-size: 0.8rem; color: var(--text-light); background: #f0f0f0; padding: 2px 8px; border-radius: 6px;">Shift ${c.shift}</span>
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
            list.innerHTML = users
                .slice()
                .sort((a, b) => (a.role === 'admin' ? -1 : 1) - (b.role === 'admin' ? -1 : 1) || a.displayName.localeCompare(b.displayName))
                .map(u => {
                    const canDemote = u.role === 'admin' && adminCount > 1;
                    const roleBadgeColor = u.role === 'admin' ? 'var(--primary)' : 'var(--secondary)';
                    return `
                        <div class="manage-item">
                            <div class="manage-item-info">
                                <span>🧑</span>
                                <span>${u.displayName}</span>
                                <span style="font-size: 0.8rem; color: ${roleBadgeColor}; border: 1px solid ${roleBadgeColor}; padding: 2px 8px; border-radius: 999px; font-weight: 700;">${(u.role || 'staff').toUpperCase()}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${u.role === 'admin'
                                    ? `<button class="btn-edit" ${canDemote ? '' : 'disabled style="opacity:.5;cursor:not-allowed;"'} onclick="setUserRole(${u.id}, 'staff')">ลดสิทธิ์</button>`
                                    : `<button class="btn-stock" onclick="setUserRole(${u.id}, 'admin')">เลื่อนเป็น Admin</button>`}
                            </div>
                        </div>
                    `;
                }).join('');
        }

        function setUserRole(userId, nextRole) {
            if (!ensureCanManageData()) return;
            const user = users.find(u => Number(u.id) === Number(userId));
            if (!user) return;
            const role = nextRole === 'admin' ? 'admin' : 'staff';
            if (user.role === role) return;

            if (user.role === 'admin' && role === 'staff') {
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
                const manageBtn = document.getElementById('manageBtn');
                if (manageBtn) manageBtn.style.display = canManageData() ? 'inline-flex' : 'none';
            }

            renderManageUserRoleList();
            refreshProfitTabIfVisible();
            showToast(`ปรับสิทธิ์ ${user.displayName} เป็น ${role.toUpperCase()} แล้ว`, 'success');
        }

        function addCustomer() {
            if (!ensureCanManageData()) return;
            const name = document.getElementById('newCustomerName').value.trim();
            const shift = document.getElementById('newCustomerShift').value;

            if (!name) { showToast('⚠️ กรุณาใส่ชื่อลูกค้า', 'warning'); return; }
            if (customers.some(c => c.name === name)) { showToast('⚠️ ชื่อนี้มีอยู่แล้ว', 'warning'); return; }

            customers.push({ name, shift });
            saveCustomers();
            addAuditLog('customer.create', `เพิ่มลูกค้า ${name}`, { shift });
            renderManageCustomerList();

            document.getElementById('newCustomerName').value = '';

            showToast(`✅ เพิ่มลูกค้า "${name}" (Shift ${shift}) สำเร็จ!`, 'success');
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
