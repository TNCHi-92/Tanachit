// Default snack items
        const defaultSnacks = [
            { id: 1, name: 'มาม่า', emoji: '🍜', price: 7, stock: 50 },
            { id: 2, name: 'โคคา', emoji: '🥤', price: 15, stock: 30 },
            { id: 3, name: 'น้ำดื่ม', emoji: '💧', price: 7, stock: 100 },
            { id: 4, name: 'เลย์', emoji: '🥔', price: 20, stock: 40 },
            { id: 5, name: 'ปลากราบ', emoji: '🐟', price: 10, stock: 30 },
            { id: 6, name: 'ขนมปัง', emoji: '🍞', price: 12, stock: 25 },
            { id: 7, name: 'นม', emoji: '🥛', price: 15, stock: 20 },
            { id: 8, name: 'กาแฟ', emoji: '☕', price: 25, stock: 30 },
            { id: 9, name: 'ช็อคโกแลต', emoji: '🍫', price: 30, stock: 15 },
            { id: 10, name: 'ไอศกรีม', emoji: '🍦', price: 35, stock: 10 },
            { id: 11, name: 'คุกกี้', emoji: '🍪', price: 18, stock: 20 },
            { id: 12, name: 'ขนมอบ', emoji: '🥐', price: 22, stock: 15 }
        ];

        // Default customer list with shifts
        const defaultCustomers = [
            { name: 'เอ', shift: 'A' }, { name: 'บี', shift: 'A' }, { name: 'ซี', shift: 'A' },
            { name: 'ดี', shift: 'A' }, { name: 'อี', shift: 'A' }, { name: 'เอฟ', shift: 'A' },
            { name: 'จี', shift: 'A' },
            { name: 'เอช', shift: 'B' }, { name: 'ไอ', shift: 'B' }, { name: 'เจ', shift: 'B' },
            { name: 'เค', shift: 'B' }, { name: 'แอล', shift: 'B' }, { name: 'เอ็ม', shift: 'B' },
            { name: 'เอ็น', shift: 'B' },
            { name: 'โอ', shift: 'C' }, { name: 'พี', shift: 'C' }, { name: 'คิว', shift: 'C' },
            { name: 'อาร์', shift: 'C' }, { name: 'เอส', shift: 'C' }, { name: 'ที', shift: 'C' },
            { name: 'ยู', shift: 'C' },
            { name: 'วี', shift: 'D' }, { name: 'ดับเบิ้ลยู', shift: 'D' }, { name: 'เอ็กซ์', shift: 'D' },
            { name: 'วาย', shift: 'D' }, { name: 'แซด', shift: 'D' }, { name: 'บอม', shift: 'D' },
            { name: 'นิว', shift: 'D' }
        ];

        // Load from localStorage or use defaults
        let snacks = JSON.parse(localStorage.getItem('snackItems')) || [...defaultSnacks];
        let customers = JSON.parse(localStorage.getItem('customerList')) || [...defaultCustomers];

        let purchases = [];
        let auditLogs = JSON.parse(localStorage.getItem('snackAuditLogs')) || [];
        let selectedSnack = null;
        let selectedCustomers = {}; // { name: quantity }
        let activeShift = 'all'; // 'all', 'A', 'B', 'C', 'D'

        // === Login System ===
        let users = JSON.parse(localStorage.getItem('snackUsers')) || [];
        let currentUser = null;
        let remoteSyncEnabled = false;
        let syncTimer = null;

        function normalizeSnackData(list) {
            if (!Array.isArray(list)) return [];
            return list.map(item => ({
                ...item,
                price: Math.max(0, Number(item.sellPrice ?? item.price) || 0),
                sellPrice: Math.max(0, Number(item.sellPrice ?? item.price) || 0),
                stock: Math.max(0, Number(item.stock) || 0),
                costPrice: Math.max(0, Number(item.costPrice) || 0),
                totalSold: Math.max(0, Number(item.totalSold) || 0)
            }));
        }

        snacks = normalizeSnackData(snacks);

        function buildCurrentState() {
            return { snacks, customers, purchases, users, auditLogs };
        }

        function persistStateToLocalStorage() {
            localStorage.setItem('snackItems', JSON.stringify(snacks));
            localStorage.setItem('customerList', JSON.stringify(customers));
            localStorage.setItem('snackPurchases', JSON.stringify(purchases));
            localStorage.setItem('snackUsers', JSON.stringify(users));
            localStorage.setItem('snackAuditLogs', JSON.stringify(auditLogs));
        }

        function scheduleStateSync() {
            if (!remoteSyncEnabled) return;
            if (syncTimer) clearTimeout(syncTimer);
            syncTimer = setTimeout(pushStateToServer, 400);
        }

        async function pushStateToServer(options = {}) {
            const force = options && options.force === true;
            const silent = options && options.silent === true;
            if (!remoteSyncEnabled && !force) return false;
            try {
                const res = await fetch('/api/state', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state: buildCurrentState() })
                });
                if (!res.ok) {
                    let msg = `HTTP ${res.status}`;
                    try {
                        const body = await res.json();
                        if (body?.error) msg = body.error;
                        if (body?.detail) msg = `${msg} (${body.detail})`;
                        if (Array.isArray(body?.details) && body.details.length > 0) {
                            msg = `${msg} (${body.details[0]})`;
                        }
                    } catch (_e) {
                        // ignore parse error
                    }
                    if (!silent) showToast(`⚠️ บันทึกฐานข้อมูลไม่สำเร็จ: ${msg}`, 'warning');
                    return false;
                }
                remoteSyncEnabled = true;
                return true;
            } catch (err) {
                remoteSyncEnabled = false;
                if (!silent) showToast('⚠️ ซิงค์ฐานข้อมูลไม่ได้ กำลังใช้โหมด local ชั่วคราว', 'warning');
                return false;
            }
        }

        function flushStateSync() {
            if (syncTimer) {
                clearTimeout(syncTimer);
                syncTimer = null;
            }
            return pushStateToServer({ force: true, silent: false });
        }

        async function syncSnackNow(snack) {
            if (!snack || !snack.id) return false;
            try {
                const res = await fetch(`/api/snacks/${encodeURIComponent(snack.id)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ snack })
                });
                if (!res.ok) {
                    let msg = `HTTP ${res.status}`;
                    try {
                        const body = await res.json();
                        if (body?.error) msg = body.error;
                    } catch (_e) {
                        // ignore parse error
                    }
                    showToast(`⚠️ อัปเดตราคาสินค้าไม่สำเร็จ: ${msg}`, 'warning');
                    return false;
                }
                remoteSyncEnabled = true;
                return true;
            } catch (_err) {
                showToast('⚠️ เชื่อมต่อฐานข้อมูลไม่ได้ขณะอัปเดตสินค้า', 'warning');
                return false;
            }
        }

        async function hydrateStateFromServer() {
            try {
                const res = await fetch('/api/state');
                if (!res.ok) return;
                const data = await res.json();
                if (!data || !data.state) {
                    remoteSyncEnabled = true;
                    return;
                }

                const state = data.state;
                snacks = Array.isArray(state.snacks) && state.snacks.length ? state.snacks : [...defaultSnacks];
                snacks = normalizeSnackData(snacks);
                customers = Array.isArray(state.customers) && state.customers.length ? state.customers : [...defaultCustomers];
                purchases = Array.isArray(state.purchases) ? state.purchases : [];
                users = Array.isArray(state.users) ? state.users : [];
                auditLogs = Array.isArray(state.auditLogs) ? state.auditLogs : auditLogs;

                users = users.map((u, idx) => ({
                    ...u,
                    role: u?.role === 'admin' ? 'admin' : 'staff',
                    id: Number(u?.id) || (idx + 1)
                }));
                if (users.length > 0 && !users.some(u => u.role === 'admin')) {
                    users[0].role = 'admin';
                }

                persistStateToLocalStorage();
                remoteSyncEnabled = true;
            } catch (err) {
                // Keep local-only mode.
            }
        }

        function saveUsers() {
            localStorage.setItem('snackUsers', JSON.stringify(users));
            scheduleStateSync();
            void flushStateSync();
        }

        function saveAuditLogs() {
            localStorage.setItem('snackAuditLogs', JSON.stringify(auditLogs));
            scheduleStateSync();
            void flushStateSync();
        }

        function canManageData() {
            return currentUser && currentUser.role === 'admin';
        }

        function roleLabel(role) {
            return role === 'admin' ? 'ADMIN' : 'STAFF';
        }

        function ensureCanManageData() {
            if (canManageData()) return true;
            showToast('สิทธิ์ไม่พอ: ต้องเป็น Admin', 'warning');
            return false;
        }

        function addAuditLog(action, detail, meta = {}) {
            const row = {
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                action,
                detail,
                actorId: currentUser?.id || null,
                actorName: currentUser?.displayName || 'Unknown',
                actorRole: currentUser?.role || 'staff',
                at: new Date().toISOString(),
                meta
            };
            auditLogs.unshift(row);
            if (auditLogs.length > 1000) auditLogs = auditLogs.slice(0, 1000);
            saveAuditLogs();
        }

        function checkSession() {
            users = users.map((u, idx) => ({
                ...u,
                role: u?.role === 'admin' ? 'admin' : 'staff',
                id: Number(u?.id) || (idx + 1)
            }));
            if (users.length > 0 && !users.some(u => u.role === 'admin')) {
                users[0].role = 'admin';
                saveUsers();
            }
            const savedUserId = localStorage.getItem('snackCurrentUser');
            if (savedUserId) {
                const user = users.find(u => u.id === parseInt(savedUserId));
                if (user) {
                    currentUser = user;
                    showApp();
                    return true;
                }
            }
            showLoginScreen();
            return false;
        }

        function showLoginScreen() {
            document.getElementById('loginScreen').classList.remove('hidden');
            document.querySelector('.container').style.display = 'none';
            setTimeout(() => {
                const input = document.getElementById('loginNameInput');
                if (input) input.focus();
            }, 300);
        }

        function showApp() {
            document.getElementById('loginScreen').classList.add('hidden');
            document.querySelector('.container').style.display = 'block';
            document.getElementById('userGreetingName').textContent = `สวัสดี ${currentUser.displayName} 👋`;
            const roleBadge = document.getElementById('userRoleBadge');
            if (roleBadge) roleBadge.textContent = roleLabel(currentUser.role);
            const manageBtn = document.getElementById('manageBtn');
            if (manageBtn) {
                manageBtn.style.display = canManageData() ? 'inline-flex' : 'none';
            }
            initApp();
        }

        function showLoginMessage(text, type = 'error') {
            const msg = document.getElementById('loginMessage');
            msg.textContent = text;
            msg.className = `login-message ${type}`;
            // Auto hide after 4 seconds
            setTimeout(() => { msg.className = 'login-message'; }, 4000);
        }

        function switchLoginTab(tab) {
            document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
            document.getElementById('loginMessage').className = 'login-message';
            if (tab === 'login') {
                document.querySelectorAll('.login-tab')[0].classList.add('active');
                document.getElementById('loginForm').style.display = 'flex';
                document.getElementById('registerForm').style.display = 'none';
            } else {
                document.querySelectorAll('.login-tab')[1].classList.add('active');
                document.getElementById('loginForm').style.display = 'none';
                document.getElementById('registerForm').style.display = 'flex';
            }
        }

        function loginUser() {
            const nameInput = document.getElementById('loginNameInput').value.trim();
            if (!nameInput) {
                showLoginMessage('กรุณาใส่ชื่อ');
                return;
            }

            const searchName = nameInput.toLowerCase();
            const foundUser = users.find(u =>
                u.aliases.some(alias => alias.toLowerCase() === searchName)
            );

            if (!foundUser) {
                showLoginMessage('ไม่พบชื่อนี้ในระบบ กรุณาสมัครใหม่ที่แท็บ "สมัครใหม่"');
                return;
            }

            currentUser = foundUser;
            localStorage.setItem('snackCurrentUser', foundUser.id);
            document.getElementById('loginNameInput').value = '';
            addAuditLog('user.login', `เข้าสู่ระบบ ${foundUser.displayName}`, {});
            showApp();
            showToast(`สวัสดี ${foundUser.displayName}! 🎉`, 'success');
        }

        function registerUser() {
            const displayName = document.getElementById('registerDisplayName').value.trim();
            const aliasesStr = document.getElementById('registerAliases').value.trim();

            if (!displayName) {
                showLoginMessage('กรุณาใส่ชื่อหลัก');
                return;
            }

            // Build aliases array: always include displayName + any comma-separated aliases
            const aliases = [displayName];
            if (aliasesStr) {
                aliasesStr.split(',').forEach(a => {
                    const trimmed = a.trim();
                    if (trimmed && !aliases.some(x => x.toLowerCase() === trimmed.toLowerCase())) {
                        aliases.push(trimmed);
                    }
                });
            }

            // Check for duplicate aliases with existing users
            for (const alias of aliases) {
                const conflict = users.find(u =>
                    u.aliases.some(a => a.toLowerCase() === alias.toLowerCase())
                );
                if (conflict) {
                    showLoginMessage(`ชื่อ "${alias}" มีคนใช้แล้ว (${conflict.displayName})`);
                    return;
                }
            }

            const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
            const hasAdmin = users.some(u => u.role === 'admin');
            const newUser = { id: newId, displayName, aliases, role: hasAdmin ? 'staff' : 'admin' };
            users.push(newUser);
            saveUsers();
            addAuditLog('user.register', `สมัครสมาชิก ${displayName}`, { role: newUser.role });

            // Auto login
            currentUser = newUser;
            localStorage.setItem('snackCurrentUser', newUser.id);

            document.getElementById('registerDisplayName').value = '';
            document.getElementById('registerAliases').value = '';

            showApp();
            showToast(`ยินดีต้อนรับ ${displayName}! 🎉`, 'success');
        }

        function logoutUser() {
            if (!confirm('ต้องการออกจากระบบหรือไม่?')) return;
            addAuditLog('user.logout', `ออกจากระบบ ${currentUser?.displayName || ''}`, {});
            currentUser = null;
            localStorage.removeItem('snackCurrentUser');
            showLoginScreen();
            showToast('ออกจากระบบแล้ว', 'info');
        }

        // Update customer ranking
        function updateRanking() {
            if (purchases.length === 0) {
                document.getElementById('rankingCard').style.display = 'none';
                return;
            }

            const customerTotals = {};
            purchases.forEach(p => {
                if (!customerTotals[p.customerName]) {
                    customerTotals[p.customerName] = { total: 0, count: 0 };
                }
                customerTotals[p.customerName].total += p.price;
                customerTotals[p.customerName].count += 1;
            });

            const sorted = Object.entries(customerTotals)
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 10);

            if (sorted.length === 0) {
                document.getElementById('rankingCard').style.display = 'none';
                return;
            }

            document.getElementById('rankingCard').style.display = 'block';

            const badgeClasses = ['gold', 'silver', 'bronze'];
            const medals = ['🥇', '🥈', '🥉'];

            document.getElementById('rankingList').innerHTML = sorted.map(([name, data], i) => {
                const badgeClass = i < 3 ? badgeClasses[i] : 'normal';
                const label = i < 3 ? medals[i] : (i + 1);
                return `
                    <div class="ranking-item">
                        <div class="ranking-badge ${badgeClass}">${label}</div>
                        <div class="ranking-info">
                            <div class="ranking-name">${name}</div>
                            <div class="ranking-detail">ซื้อ ${data.count} ครั้ง</div>
                        </div>
                        <div class="ranking-total">${data.total} ฿</div>
                    </div>
                `;
            }).join('');
        }

        // Initialize the app
        async function init() {
            await hydrateStateFromServer();
            checkSession();
        }

        function initApp() {
            updateCurrentDate();
            renderSnackGrid();
            loadPurchases();
            updateTodaySummary();
            updateRanking();
            setupImageUpload();

            // Set default report month to current month
            const today = new Date();
            document.getElementById('reportMonth').value =
                `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            document.getElementById('profitMonth').value =
                `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        }

        // Update current date display
        function updateCurrentDate() {
            const options = { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            };
            const dateStr = new Date().toLocaleDateString('th-TH', options);
            document.getElementById('currentDate').textContent = dateStr;
        }

        // Render snack grid
        function renderSnackGrid() {
            const grid = document.getElementById('snackGrid');
            grid.innerHTML = snacks.map(snack => {
                const stock = snack.stock || 0;
                const soldOut = stock <= 0;
                let stockClass = 'in-stock';
                let stockText = `เหลือ ${stock}`;
                if (stock <= 0) { stockClass = 'out-of-stock'; stockText = 'หมด'; }
                else if (stock <= 5) { stockClass = 'low-stock'; stockText = `เหลือ ${stock}!`; }

                return `
                    <div class="snack-item ${soldOut ? 'sold-out' : ''}" onclick="${soldOut ? '' : `selectSnack(${snack.id})`}">
                        ${getSnackDisplayHTML(snack, 'grid')}
                        <div class="snack-name">${snack.name}</div>
                        <div class="snack-price">${snack.price} ฿</div>
                        <div class="snack-sold-total">ขายสะสม ${Number(snack.totalSold) || 0} ชิ้น</div>
                        <div class="snack-stock ${stockClass}">${stockText}</div>
                    </div>
                `;
            }).join('');
        }

        // Select snack
        function selectSnack(snackId) {
            selectedSnack = snacks.find(s => s.id === snackId);
            selectedCustomers = {};
            activeShift = 'all';

            // Update modal content
            document.getElementById('selectedSnackEmoji').innerHTML = getSnackDisplayHTML(selectedSnack, 'modal');
            document.getElementById('selectedSnackName').textContent = selectedSnack.name;
            document.getElementById('selectedSnackPrice').textContent = selectedSnack.price;

            // Clear search
            document.getElementById('customerSearch').value = '';

            // Hide confirm section
            updateConfirmSection();

            // Render customer grid
            renderCustomerGrid();

            // Show modal
            document.getElementById('customerModal').classList.add('active');

            // Focus on search after modal animation
            setTimeout(() => {
                document.getElementById('customerSearch').focus();
            }, 300);
        }

        // Render customer grid
        function renderCustomerGrid(filter = '') {
            const grid = document.getElementById('customerGrid');
            const filteredCustomers = customers.filter(c => {
                const nameMatch = c.name.toLowerCase().includes(filter.toLowerCase());
                const shiftMatch = activeShift === 'all' || c.shift === activeShift;
                return nameMatch && shiftMatch;
            });

            grid.innerHTML = filteredCustomers.map(c => {
                const name = c.name;
                const qty = selectedCustomers[name] || 0;
                const isSelected = qty > 0;
                if (isSelected) {
                    return `
                        <div class="customer-btn selected" onclick="selectCustomer('${name}')">
                            <button class="qty-btn qty-btn-minus" onclick="event.stopPropagation(); changeQty('${name}', -1)">-</button>
                            <span class="customer-name-label">${name} <strong>(${qty})</strong></span>
                            <button class="qty-btn qty-btn-plus" onclick="event.stopPropagation(); changeQty('${name}', 1)">+</button>
                        </div>
                    `;
                }
                return `
                    <button class="customer-btn" onclick="selectCustomer('${name}')">
                        ${name}
                    </button>
                `;
            }).join('');

            // Update shift button active state
            document.querySelectorAll('.shift-btn').forEach(btn => btn.classList.remove('active'));
            const shiftBtns = document.querySelectorAll('.shift-btn');
            const shiftIndex = ['all', 'A', 'B', 'C', 'D'].indexOf(activeShift);
            if (shiftBtns[shiftIndex]) shiftBtns[shiftIndex].classList.add('active');
        }

        // Filter by shift
        function filterShift(shift) {
            activeShift = shift;
            const searchTerm = document.getElementById('customerSearch').value;
            renderCustomerGrid(searchTerm);
        }

        // Filter customers
        function filterCustomers() {
            const searchTerm = document.getElementById('customerSearch').value;
            renderCustomerGrid(searchTerm);
        }

        // Select customer (first click = qty 1, click again = +1)
        function selectCustomer(name) {
            if (!selectedCustomers[name]) {
                selectedCustomers[name] = 1;
            } else {
                selectedCustomers[name]++;
            }

            const searchTerm = document.getElementById('customerSearch').value;
            renderCustomerGrid(searchTerm);
            updateConfirmSection();
        }

        // Change quantity with +/- buttons
        function changeQty(name, delta) {
            const newQty = (selectedCustomers[name] || 0) + delta;
            if (newQty <= 0) {
                delete selectedCustomers[name];
            } else {
                selectedCustomers[name] = newQty;
            }

            const searchTerm = document.getElementById('customerSearch').value;
            renderCustomerGrid(searchTerm);
            updateConfirmSection();
        }

        // Update confirm section visibility and count
        function updateConfirmSection() {
            const section = document.getElementById('confirmSection');
            const customerCount = Object.keys(selectedCustomers).length;
            const totalQty = Object.values(selectedCustomers).reduce((sum, q) => sum + q, 0);

            if (customerCount > 0) {
                section.style.display = 'block';
                const totalPrice = totalQty * (selectedSnack ? selectedSnack.price : 0);
                document.getElementById('selectedCount').innerHTML =
                    `${customerCount} คน / ${totalQty} ชิ้น / รวม ${totalPrice} ฿`;
            } else {
                section.style.display = 'none';
            }
        }

        // Confirm purchase for all selected customers
        function confirmPurchase() {
            const customerCount = Object.keys(selectedCustomers).length;
            const totalQty = Object.values(selectedCustomers).reduce((sum, q) => sum + q, 0);

            if (customerCount === 0) {
                showToast('⚠️ กรุณาเลือกชื่อลูกค้า', 'warning');
                return;
            }

            if (!selectedSnack) {
                showToast('⚠️ กรุณาเลือกขนม', 'warning');
                closeCustomerModal();
                return;
            }

            // Check stock
            const snackInList = snacks.find(s => s.id === selectedSnack.id);
            if (!snackInList || snackInList.stock < totalQty) {
                showToast(`⚠️ สินค้าเหลือไม่พอ (เหลือ ${snackInList ? snackInList.stock : 0} ชิ้น, ต้องการ ${totalQty} ชิ้น)`, 'warning');
                return;
            }

            // Create purchase records for each selected customer x quantity
            const now = new Date().toISOString();
            const unitPrice = Number(selectedSnack.price) || 0;
            const unitCost = Number(selectedSnack.costPrice) || 0;
            const unitProfit = unitPrice - unitCost;
            Object.entries(selectedCustomers).forEach(([customerName, qty]) => {
                for (let i = 0; i < qty; i++) {
                    const purchase = {
                        id: Date.now() + Math.random(),
                        customerName: customerName,
                        snack: { ...selectedSnack },
                        price: unitPrice,
                        unitPrice: unitPrice,
                        unitCost: unitCost,
                        revenue: unitPrice,
                        cost: unitCost,
                        profit: unitProfit,
                        date: now
                    };
                    purchases.unshift(purchase);
                }
            });

            // Decrease stock
            snackInList.stock -= totalQty;
            snackInList.totalSold = (Number(snackInList.totalSold) || 0) + totalQty;
            saveSnacks();

            savePurchases();
            updateTodaySummary();
            renderSnackGrid();
            updateRanking();
            refreshProfitTabIfVisible();

            const names = Object.entries(selectedCustomers).map(([n, q]) => `${n}(${q})`).join(', ');
            addAuditLog('sale.create', `ขาย ${selectedSnack.name} ให้ ${names}`, { qty: totalQty, unitPrice, unitCost });
            showToast(`✅ บันทึกสำเร็จ! ${selectedSnack.name} - ${names}`, 'success');

            closeCustomerModal();
        }

        // Close customer modal
        function closeCustomerModal() {
            document.getElementById('customerModal').classList.remove('active');
            selectedSnack = null;
            selectedCustomers = {};
        }

        // Update today's summary
        function updateTodaySummary() {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayPurchases = purchases.filter(p => {
                const purchaseDate = new Date(p.date);
                purchaseDate.setHours(0, 0, 0, 0);
                return purchaseDate.getTime() === today.getTime();
            });

            const count = todayPurchases.length;
            const total = todayPurchases.reduce((sum, p) => sum + p.price, 0);

            document.getElementById('todayCount').textContent = count;
            document.getElementById('todayTotal').textContent = `${total} ฿`;

            // Render today's purchase list
            const listContainer = document.getElementById('todayPurchaseList');
            if (todayPurchases.length === 0) {
                listContainer.innerHTML = '';
                return;
            }

            const showCount = 5;
            let html = `<div class="today-purchase-header">
                <span>🛒 รายการซื้อวันนี้ (ล่าสุด ${Math.min(showCount, todayPurchases.length)}/${todayPurchases.length})</span>
            </div>`;

            todayPurchases.slice(0, showCount).forEach(p => {
                const time = new Date(p.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                html += `
                    <div class="today-purchase-item">
                        <div class="purchase-info">
                            ${getSnackDisplayHTML(p.snack, 'mini')}
                            <span><strong>${p.customerName}</strong> - ${p.snack.name}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="purchase-time">${time}</span>
                            <span class="purchase-price">${p.price} ฿</span>
                        </div>
                    </div>`;
            });

            listContainer.innerHTML = html;
        }
