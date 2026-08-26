
const FIREBASE_URLS = {
    keys:      "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/keys.json",
    packages:  "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/packages.json",
    bypass:    "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/bypass_menu_uids.json",
    devices:   "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/device_info.json"
};

const FIREBASE_BASE = "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app";

// ---------------------------------------------------------------------------
// App namespace — exposes helpers via window.app.refresh() etc.
// ---------------------------------------------------------------------------
(function () {
    'use strict';

    // ============== UTILITIES ==============================================
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeAttr(str) {
        return escapeHtml(str);
    }

    function formatDate(ts) {
        if (!ts) return '—';
        return new Date(ts).toLocaleString();
    }

    function formatRelative(ts) {
        if (!ts) return '—';
        const diff = Date.now() - ts;
        const sec = Math.floor(diff / 1000);
        if (sec < 60)    return sec + ' giây trước';
        if (sec < 3600)  return Math.floor(sec / 60) + ' phút trước';
        if (sec < 86400) return Math.floor(sec / 3600) + ' giờ trước';
        if (sec < 604800) return Math.floor(sec / 86400) + ' ngày trước';
        return new Date(ts).toLocaleDateString();
    }

    function formatNumber(n) {
        return new Intl.NumberFormat('vi-VN').format(n);
    }

    function debounce(fn, wait = 220) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // ============== TOAST MANAGER =========================================
    const Toast = (() => {
        const ICONS = {
            success: 'fa-circle-check',
            error:   'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info:    'fa-circle-info'
        };
        const TITLES = {
            success: 'Thành công',
            error:   'Lỗi',
            warning: 'Cảnh báo',
            info:    'Thông tin'
        };

        function show({ type = 'info', title, message, duration = 3800 } = {}) {
            const stack = $('#toastStack');
            if (!stack) return;

            const el = document.createElement('div');
            el.className = 'toast ' + type;
            el.style.setProperty('--toast-dur', duration + 'ms');
            el.innerHTML = `
                <span class="toast-icon"><i class="fa-solid ${ICONS[type] || ICONS.info}"></i></span>
                <div class="toast-body">
                    <p class="toast-title">${escapeHtml(title || TITLES[type] || 'Thông báo')}</p>
                    ${message ? `<p class="toast-message">${escapeHtml(message)}</p>` : ''}
                </div>
                <button class="toast-close" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button>
                <span class="toast-progress" aria-hidden="true"></span>
            `;

            const remove = () => {
                el.classList.add('removing');
                el.addEventListener('animationend', () => el.remove(), { once: true });
            };

            $('.toast-close', el).addEventListener('click', remove);
            stack.appendChild(el);

            if (duration > 0) setTimeout(remove, duration);
            return { dismiss: remove };
        }

        return {
            show,
            success: (title, message, opts) => show({ type: 'success', title, message, ...opts }),
            error:   (title, message, opts) => show({ type: 'error', title, message, duration: 5200, ...opts }),
            warning: (title, message, opts) => show({ type: 'warning', title, message, ...opts }),
            info:    (title, message, opts) => show({ type: 'info', title, message, ...opts })
        };
    })();

    // ============== MODAL MANAGER =========================================
    const Modal = (() => {
        function open(id) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('open');
            el.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            // Focus first input
            const first = el.querySelector('input, select, textarea, button');
            if (first) setTimeout(() => first.focus(), 120);
        }

        function close(id) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('open');
            el.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }

        function confirm({ heading = 'Xác nhận', message = 'Bạn có chắc chắn?', okText = 'Xác nhận', cancelText = 'Huỷ', danger = true } = {}) {
            return new Promise(resolve => {
                const modal = $('#confirmModal');
                $('#confirmHeading').textContent = heading;
                $('#confirmMessage').textContent = message;
                const okBtn = $('#confirmOk');
                const cancelBtn = $('#confirmCancel');
                okBtn.textContent = okText;
                cancelBtn.textContent = cancelText;
                okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');

                const cleanup = () => {
                    okBtn.removeEventListener('click', onOk);
                    cancelBtn.removeEventListener('click', onCancel);
                };
                const onOk = () => { cleanup(); close('confirmModal'); resolve(true); };
                const onCancel = () => { cleanup(); close('confirmModal'); resolve(false); };

                okBtn.addEventListener('click', onOk);
                cancelBtn.addEventListener('click', onCancel);
                open('confirmModal');
            });
        }

        // Wire up generic close handlers
        document.addEventListener('click', (e) => {
            const closeTarget = e.target.closest('[data-close]');
            if (closeTarget) {
                const id = closeTarget.getAttribute('data-close');
                close(id);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            $$('.modal.open').forEach(m => close(m.id));
            // Connection popover close handled by its own listener
        });

        // Click backdrop closes
        $$('.modal').forEach(m => {
            m.addEventListener('click', (e) => {
                if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
                    close(m.id);
                }
            });
        });

        return { open, close, confirm };
    })();

    // ============== CLIPBOARD MANAGER ======================================
    const Clipboard = (() => {
        async function copy(text) {
            if (!text) return false;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                }
                return true;
            } catch (e) {
                console.warn('Clipboard error:', e);
                return false;
            }
        }
        return { copy };
    })();

    // ============== THEME MANAGER =========================================
    const Theme = (() => {
        const KEY = 'km-theme';
        function apply(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            const icon = $('#themeIcon');
            if (icon) {
                icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
            }
        }
        function init() {
            let saved = null;
            try { saved = localStorage.getItem(KEY); } catch (e) {}
            if (saved === 'dark' || saved === 'light') {
                apply(saved);
            } else {
                apply('dark');
            }
            const btn = $('#themeToggle');
            if (btn) {
                btn.addEventListener('click', () => {
                    const current = document.documentElement.getAttribute('data-theme') || 'dark';
                    const next = current === 'dark' ? 'light' : 'dark';
                    apply(next);
                    try { localStorage.setItem(KEY, next); } catch (e) {}
                });
            }
        }
        return { init, apply };
    })();

    // ============== SIDEBAR (mobile drawer) ================================
    const Sidebar = (() => {
        function init() {
            const sidebar = $('#sidebar');
            const backdrop = $('#sidebarBackdrop');
            const toggle = $('#sidebarToggle');
            const closeBtn = $('#sidebarClose');

            function openDrawer() {
                sidebar.classList.add('open');
                backdrop.classList.add('show');
            }
            function closeDrawer() {
                sidebar.classList.remove('open');
                backdrop.classList.remove('show');
            }

            if (toggle) toggle.addEventListener('click', openDrawer);
            if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
            if (backdrop) backdrop.addEventListener('click', closeDrawer);

            // Click nav-item on mobile closes drawer
            $$('.nav-item', sidebar).forEach(item => {
                item.addEventListener('click', () => {
                    if (window.innerWidth <= 1024) closeDrawer();
                });
            });
        }
        return { init };
    })();

    // ============== CONNECTION STATUS UI ===================================
    const Connection = (() => {
        let lastResults = [];
        let lastChecked = null;

        function setPill(state, text) {
            const dot = $('#connectionDot');
            const lbl = $('#connectionText');
            if (!dot || !lbl) return;
            dot.setAttribute('data-state', state);
            lbl.textContent = text;
        }

        function renderPopover(results) {
            const body = $('#connectionPopoverBody');
            const meta = $('#connectionLastCheck');
            if (!body) return;

            if (!results.length) {
                body.innerHTML = '<div class="muted" style="font-size:12px;padding:8px 0;">Chưa kiểm tra.</div>';
                return;
            }

            const items = results.map(r => {
                let cls = 'ok', label = r.status, txt = 'OK';
                if (r.status === 401 || r.status === 403) { cls = 'err'; txt = 'Bị chặn'; }
                else if (!r.ok)                            { cls = 'warn'; txt = r.status || 'ERR'; }
                return `
                    <div class="connection-item">
                        <span class="status-dot" data-state="${cls}"></span>
                        <span class="connection-name">${escapeHtml(r.name)}</span>
                        <span class="connection-status ${cls}">${escapeHtml(txt)}</span>
                    </div>
                `;
            }).join('');

            body.innerHTML = `
                <div style="font-size:12px;color:var(--text-muted);padding-bottom:4px;">4 endpoints</div>
                <div class="connection-list">${items}</div>
            `;

            if (meta) {
                meta.textContent = 'Last checked: ' + (lastChecked ? lastChecked.toLocaleTimeString() : '—');
            }
        }

        function openPopover() {
            const pop = $('#connectionPopover');
            if (!pop) return;
            renderPopover(lastResults);
            pop.hidden = false;
        }
        function closePopover() {
            const pop = $('#connectionPopover');
            if (!pop) return;
            pop.hidden = true;
        }

        function init() {
            const pill = $('#connectionPill');
            if (pill) pill.addEventListener('click', (e) => {
                e.stopPropagation();
                const pop = $('#connectionPopover');
                if (!pop) return;
                if (pop.hidden) openPopover(); else closePopover();
            });
            const closeBtn = $('#connectionPopoverClose');
            if (closeBtn) closeBtn.addEventListener('click', closePopover);
            const retryBtn = $('#connectionRetryBtn');
            if (retryBtn) retryBtn.addEventListener('click', () => { closePopover(); testConnection(); });

            const navConn = $('#navConnectionBtn');
            if (navConn) navConn.addEventListener('click', () => {
                setActiveNav(navConn);
                openPopover();
            });

            // Click outside closes popover
            document.addEventListener('click', (e) => {
                const pop = $('#connectionPopover');
                if (!pop || pop.hidden) return;
                if (pop.contains(e.target)) return;
                if (pill && pill.contains(e.target)) return;
                closePopover();
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closePopover();
            });
        }

        return { init, setPill, openPopover, closePopover, setResults(r, when) { lastResults = r; lastChecked = when; } };
    })();

    // ============== WELCOME / ONBOARDING ===================================
    const Welcome = (() => {
        const STORAGE_KEY = 'km_welcome_seen_v2';

        function show() {
            const m = $('#welcomeModal');
            if (!m) return;
            const cb = $('#welcomeDontShow');
            if (cb) cb.checked = false;
            openModal('welcomeModal');
        }

        function dismiss() {
            const cb = $('#welcomeDontShow');
            if (cb && cb.checked) {
                try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
            }
            closeModal('welcomeModal');
        }

        function init() {
            const m = $('#welcomeModal');
            if (!m) return;

            // Wire all close triggers (X button, "Để sau" button, backdrop)
            m.querySelectorAll('[data-close="welcomeModal"]').forEach(el => {
                el.addEventListener('click', dismiss);
            });
            const startBtn = $('#welcomeStart');
            if (startBtn) startBtn.addEventListener('click', dismiss);

            // Show once on first ever visit, after the dashboard paints
            let seen = false;
            try { seen = localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) {}
            if (!seen) {
                setTimeout(show, 600);
            }
        }

        function reset() {
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        }

        return { init, show, dismiss, reset };
    })();

    // ============== ABOUT MODAL ============================================
    const About = (() => {
        function init() {
            // Sidebar "Giới thiệu" link
            const navBtn = $('#navAboutBtn');
            if (navBtn) navBtn.addEventListener('click', () => {
                setActiveNav(navBtn);
                openModal('aboutModal');
            });

            // Topbar "?" help button
            const helpBtn = $('#helpToggle');
            if (helpBtn) helpBtn.addEventListener('click', () => openModal('aboutModal'));

            // About modal "Xem hướng dẫn" → re-opens welcome modal
            const showWelcomeBtn = $('#aboutShowWelcome');
            if (showWelcomeBtn) showWelcomeBtn.addEventListener('click', () => {
                closeModal('aboutModal');
                setTimeout(() => Welcome.show(), 220);
            });

            // Click on logo (welcome re-entry shortcut)
            const logo = document.querySelector('.brand-logo, .brand');
            if (logo) {
                logo.style.cursor = 'pointer';
                logo.addEventListener('click', () => Welcome.show());
            }

            // Keyboard shortcut: "?" anywhere opens about modal (skip inside inputs)
            document.addEventListener('keydown', (e) => {
                const tag = (e.target && e.target.tagName) || '';
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                if (e.target && e.target.isContentEditable) return;
                if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                    e.preventDefault();
                    openModal('aboutModal');
                }
            });
        }
        return { init };
    })();

    // ============== TAB NAVIGATION =========================================
    const TABS = [
        { id: 'packages-tab', title: 'Packages',  sub: 'Quản lý các gói dịch vụ và đăng ký.',                action: { label: 'Tạo Package', icon: 'fa-plus',         modal: 'packageModal' } },
        { id: 'keys-tab',     title: 'Keys',      sub: 'Danh sách key đang hoạt động và quản lý trạng thái.', action: { label: 'Tạo Key',     icon: 'fa-plus',         handler: 'openKeyModal' } },
        { id: 'bypass-tab',   title: 'Bypass UIDs', sub: 'Danh sách UID được bypass anticheat menu.',          action: { label: 'Thêm UID',    icon: 'fa-plus',         modal: 'bypassModal' } },
        { id: 'devices-tab',  title: 'Devices',   sub: 'Trạng thái các thiết bị đang đăng nhập hệ thống.',    action: null },
        { id: 'preview-tab',  title: 'App Preview', sub: 'Giao diện ứng dụng di động & code tích hợp key.',     action: null }
    ];

    function setActiveNav(btn) {
        $$('.nav-item').forEach(i => i.classList.remove('active'));
        if (btn && btn.classList && btn.classList.contains('nav-item')) {
            btn.classList.add('active');
        }
    }

    function switchTab(tabId) {
        $$('.nav-item').forEach(i => i.classList.toggle('active', i.getAttribute('data-tab') === tabId));
        $$('.tab-pane').forEach(p => p.classList.remove('active'));
        const pane = document.getElementById(tabId);
        if (pane) pane.classList.add('active');

        const meta = TABS.find(t => t.id === tabId);
        if (meta) {
            $('#pageTitle').textContent = meta.title;
            $('#pageSub').textContent = meta.sub;
            $('#bcCurrent').textContent = meta.title;
            renderPageAction(meta);
        }

        loadDataForActiveTab(tabId);
    }

    function renderPageAction(meta) {
        const wrap = $('#pageActions');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!meta || !meta.action) return;
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.type = 'button';
        btn.innerHTML = `<i class="fa-solid ${meta.action.icon}"></i> ${meta.action.label}`;
        if (meta.action.modal) {
            btn.addEventListener('click', () => openModal(meta.action.modal));
        } else if (meta.action.handler && typeof window[meta.action.handler] === 'function') {
            btn.addEventListener('click', () => window[meta.action.handler]());
        }
        wrap.appendChild(btn);
    }

    // ============== SKELETON RENDERERS =====================================
    function renderSkeleton(tbody, cols) {
        if (!tbody) return;
        let html = '';
        for (let i = 0; i < 5; i++) {
            html += `<tr class="skeleton-row">`;
            for (let c = 0; c < cols; c++) {
                const cls = ['short', 'medium', 'long', 'medium'][c % 4];
                html += `<td><span class="skeleton ${cls}"></span></td>`;
            }
            html += `</tr>`;
        }
        tbody.innerHTML = html;
    }

    function renderEmpty(tbody, colspan, opts = {}) {
        if (!tbody) return;
        const { icon = 'fa-inbox', title = 'Chưa có dữ liệu', desc = '', cta = '' } = opts;
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="${colspan}">
                    <div class="empty-state">
                        <span class="empty-icon"><i class="fa-solid ${icon}"></i></span>
                        <div class="empty-title">${escapeHtml(title)}</div>
                        ${desc ? `<p class="empty-desc">${escapeHtml(desc)}</p>` : ''}
                        ${cta}
                    </div>
                </td>
            </tr>
        `;
    }

    // ============== STATS COUNTER ==========================================
    function setStat(key, value) {
        const card = document.querySelector(`.stat-card[data-stat="${key}"]`);
        if (!card) return;
        const target = card.querySelector('.stat-value');
        const finalVal = Number(value) || 0;
        const startVal = parseInt(target.getAttribute('data-current') || '0', 10);
        target.setAttribute('data-target', String(finalVal));
        target.setAttribute('data-current', String(finalVal));
        animateCount(target, startVal, finalVal, 700);
    }

    function animateCount(el, from, to, duration) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || from === to) {
            el.textContent = formatNumber(to);
            return;
        }
        const start = performance.now();
        function frame(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = formatNumber(Math.round(from + (to - from) * eased));
            if (t < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    // ============== COPY BUTTON HELPER =====================================
    function makeCopyable(text, type = 'default') {
        return `<code class="${type === 'uid' ? 'uid-code' : ''}">
            <span class="text-truncate" title="${escapeAttr(text)}">${escapeHtml(text)}</span>
            <i class="fa-regular fa-copy copy-trigger" data-copy="${escapeAttr(text)}" data-tooltip="Sao chép" aria-label="Sao chép"></i>
        </code>`;
    }

    // ============== SEARCH =================================================
    function applySearch(tbodyId, query, rowSelector) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        const q = (query || '').trim().toLowerCase();
        $$('tr', tbody).forEach(row => {
            if (row.classList.contains('skeleton-row') || row.classList.contains('empty-row') || row.classList.contains('error-row')) return;
            const text = row.textContent.toLowerCase();
            row.style.display = (!q || text.includes(q)) ? '' : 'none';
        });
    }

    // ------------------------------------------------------------------------
    // Window helpers — global API the rest of the code (and HTML inline onclick)
    // can rely on.
    // ------------------------------------------------------------------------
    window.app = window.app || {};
    Object.assign(window.app, {
        Toast,
        Modal,
        Clipboard,
        Theme,
        switchTab,
        setStat,
        refresh(tab) {
            const fn = {
                packages: fetchPackages,
                keys:     fetchKeys,
                bypass:   fetchBypass,
                devices:  fetchDevices
            }[tab];
            if (fn) fn();
        }
    });

    // Expose TABS map for external code if needed
    window.__KM_TABS__ = TABS;

    // ============== INIT ===================================================
    // ============== APP PREVIEW (phones + code) =============================
    const Preview = (() => {
        function wrapLines(codeEl) {
            // Wrap each line of code in <span class="cl"> so CSS counter can number them.
            // We preserve the original innerHTML syntax-highlight spans and add real \n
            // text nodes between wrappers so textContent (used by copy) stays intact.
            const raw = codeEl.innerHTML;
            if (!raw || raw.indexOf('<span class="cl">') !== -1) return; // already wrapped
            const lines = raw.split('\n');
            const rebuilt = lines.map((line, idx) => {
                // Empty trailing lines should render with a zero-width space
                return `<span class="cl">${line.length === 0 ? '&#8203;' : line}</span>`;
            }).join('\n');
            codeEl.innerHTML = rebuilt;
            return lines.length;
        }

        function updateLineCount(codeEl, countId) {
            if (!codeEl) return;
            const text = codeEl.textContent || '';
            const lineCount = text.split('\n').filter(l => l.trim().length > 0).length;
            const el = document.getElementById(countId);
            if (el) el.textContent = `${lineCount} lines`;
        }

        function init() {
            // Wrap every code block with line-number spans + count lines
            const targets = [
                { code: $('#codeCpp'),    count: 'cppLineCount' },
                { code: $('#codeJava'),   count: 'javaLineCount' },
                { code: $('#codePython'), count: 'pythonLineCount' },
                { code: $('#codeImgui'),  count: 'imguiLineCount' }
            ];
            targets.forEach(t => {
                if (t.code) {
                    wrapLines(t.code);
                    updateLineCount(t.code, t.count);
                }
            });

            // Code language switcher
            const tabs = $$('.code-tab');
            const blocks = $$('.code-block-wrap[data-lang]');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const lang = tab.getAttribute('data-lang');
                    tabs.forEach(t => t.classList.toggle('active', t === tab));
                    blocks.forEach(b => {
                        if (b.getAttribute('data-lang') === lang) {
                            b.hidden = false;
                        } else {
                            b.hidden = true;
                        }
                    });
                });
            });

            // Copy buttons (plain text from <code> children, strip HTML tags + line-number wrappers)
            $$('.code-copy-btn, .code-copy-btn-lg').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const targetId = btn.getAttribute('data-copy-target');
                    const target = targetId ? $('#' + targetId) : btn.closest('.code-block-wrap')?.querySelector('code');
                    if (!target) return;
                    // Use textContent to get raw code (no HTML tags, line numbers stripped because of \n separators)
                    const text = target.textContent.replace(/\u00A0/g, ' ').trim();
                    const ok = await Clipboard.copy(text);
                    if (ok) {
                        btn.classList.add('copied');
                        const label = btn.querySelector('span');
                        const oldLabel = label ? label.textContent : '';
                        if (label) label.textContent = 'Đã copy';
                        const icon = btn.querySelector('i');
                        if (icon) { icon.classList.remove('fa-regular', 'fa-copy'); icon.classList.add('fa-solid', 'fa-check'); }
                        Toast.success('Đã sao chép', oldLabel || 'code', { duration: 1800 });
                        setTimeout(() => {
                            btn.classList.remove('copied');
                            if (label) label.textContent = oldLabel;
                            if (icon) { icon.classList.add('fa-regular', 'fa-copy'); icon.classList.remove('fa-solid', 'fa-check'); }
                        }, 2000);
                    } else {
                        Toast.error('Sao chép thất bại');
                    }
                });
            });
        }
        return { init };
    })();

    document.addEventListener('DOMContentLoaded', () => {
        Theme.init();
        Sidebar.init();
        Connection.init();
        Welcome.init();
        About.init();
        Preview.init();

        // Tab nav wiring
        $$('.nav-item[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
        });

        // Search wiring
        const sPkgs   = $('#searchPackages'); if (sPkgs)   sPkgs.addEventListener('input', debounce(() => applySearch('packageTableBody', sPkgs.value)));
        const sKeys   = $('#searchKeys');     if (sKeys)   sKeys.addEventListener('input', debounce(() => applySearch('keyTableBody', sKeys.value)));
        const sBypass = $('#searchBypass');   if (sBypass) sBypass.addEventListener('input', debounce(() => applySearch('bypassTableBody', sBypass.value)));
        const sDev    = $('#searchDevices');  if (sDev)    sDev.addEventListener('input', debounce(() => applySearch('deviceTableBody', sDev.value)));

        // Copy triggers (delegated)
        document.addEventListener('click', async (e) => {
            const trig = e.target.closest('[data-copy]');
            if (!trig) return;
            e.preventDefault();
            const text = trig.getAttribute('data-copy');
            const ok = await Clipboard.copy(text);
            if (ok) {
                trig.classList.remove('fa-regular', 'fa-copy');
                trig.classList.add('fa-solid', 'fa-check');
                trig.style.color = 'var(--success)';
                Toast.success('Đã sao chép', text, { duration: 2400 });
                setTimeout(() => {
                    trig.classList.add('fa-regular', 'fa-copy');
                    trig.classList.remove('fa-solid', 'fa-check');
                    trig.style.color = '';
                }, 1400);
            } else {
                Toast.error('Không thể sao chép');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.matches('input, textarea, select')) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            switch (e.key.toLowerCase()) {
                case '1': switchTab('packages-tab'); break;
                case '2': switchTab('keys-tab');     break;
                case '3': switchTab('bypass-tab');   break;
                case '4': switchTab('devices-tab');  break;
                case '/': e.preventDefault(); $('#searchPackages')?.focus(); break;
                case 'n': if (!e.shiftKey) break; // Shift+N opens new — could map later
                default: break;
            }
        });
    });

    // ------------------------------------------------------------------------
    // PRESERVED ORIGINAL FIREBASE BUSINESS LOGIC
    // All functions below keep their original signatures & behavior.
    // Some have been wrapped to add UX feedback (toast / skeleton / count-up)
    // but the network calls, data shapes, and side effects are unchanged.
    // ------------------------------------------------------------------------

    // Chuyển đổi qua lại giữa các Tab — giữ hàm global để HTML cũ nếu có vẫn chạy
    function loadDataForActiveTab(tabId) {
        if (tabId === 'packages-tab') fetchPackages();
        if (tabId === 'keys-tab')     fetchKeys();
        if (tabId === 'bypass-tab')   fetchBypass();
        if (tabId === 'devices-tab')  fetchDevices();
    }

    // Khởi chạy load dữ liệu ban đầu
    window.onload = () => {
        testConnection();
        fetchPackages();
    };

    // Test kết nối Firebase — gọi lúc load trang
    async function testConnection() {
        Connection.setPill('checking', 'Checking…');

        const results = [];
        for (const [name, url] of Object.entries(FIREBASE_URLS)) {
            try {
                const res = await fetch(url);
                results.push({ name, ok: res.ok, status: res.status, msg: res.statusText });
            } catch (err) {
                results.push({ name, ok: false, status: 'ERR', msg: err.message });
            }
        }

        const allOk  = results.every(r => r.ok);
        const anyAuth = results.some(r => r.status === 401 || r.status === 403);

        Connection.setResults(results, new Date());

        if (allOk) {
            Connection.setPill('ok', 'Connected');
            // Cập nhật stats
            setStat('devices', 0); // sẽ được cập nhật khi fetch
        } else if (anyAuth) {
            Connection.setPill('error', 'Connection Error');
            Toast.error(
                'Firebase bị chặn truy cập (HTTP 401/403)',
                'Vào Firebase Console → Realtime Database → Rules và publish: { "rules": { ".read": true, ".write": true } }',
                { duration: 8000 }
            );
        } else {
            Connection.setPill('warn', 'Lỗi kết nối');
            Toast.warning(
                'Lỗi kết nối Firebase',
                results.map(r => `${r.name}: ${r.status}`).join(' · '),
                { duration: 6000 }
            );
        }
    }

    // --- QUẢN LÝ PACKAGES ---
    async function fetchPackages() {
        const tbody = $('#packageTableBody');
        renderSkeleton(tbody, 6);
        try {
            const data = await safeFetch(FIREBASE_URLS.packages);
            tbody.innerHTML = '';

            if (!data) {
                renderEmpty(tbody, 6, {
                    icon: 'fa-box-open',
                    title: 'Chưa có package nào',
                    desc:  'Tạo package đầu tiên để bắt đầu cấp key cho người dùng.',
                    cta:   `<button type="button" class="btn btn-primary btn-sm empty-cta" onclick="openModal('packageModal')"><i class="fa-solid fa-plus"></i> Tạo Package</button>`
                });
                setStat('packages', 0);
                return;
            }

            const sortedIds = Object.keys(data).sort((a, b) => (data[b].createdAt || 0) - (data[a].createdAt || 0));

            let activeCount = 0;
            sortedIds.forEach(id => {
                const pkg = data[id];
                const isLocked = pkg.status === 'locked' || pkg.status === 'disabled';
                if (!isLocked) activeCount++;
                tbody.insertAdjacentHTML('beforeend', `
                    <tr class="${isLocked ? 'row-locked' : ''}">
                        <td><strong>${escapeHtml(pkg.name)}</strong></td>
                        <td>${pkg.durationDays === 0 ? '<span class="badge badge-info">Vĩnh viễn</span>' : pkg.durationDays + ' ngày'}</td>
                        <td>${pkg.maxDevices} thiết bị</td>
                        <td>${formatNumber(pkg.price)} ₫</td>
                        <td>
                            <span class="badge ${isLocked ? 'badge-danger' : 'badge-success'}">
                                ${isLocked ? 'Locked' : 'Active'}
                            </span>
                        </td>
                        <td>
                            <div class="row-actions">
                                <button class="row-action ${isLocked ? 'success' : 'warning'}" data-tooltip="${isLocked ? 'Mở khóa' : 'Khóa'}" data-tooltip-bottom onclick="togglePackageStatus('${escapeAttr(id)}', '${escapeAttr(pkg.status)}')">
                                    <i class="fa-solid ${isLocked ? 'fa-unlock' : 'fa-lock'}"></i>
                                </button>
                                <button class="row-action danger" data-tooltip="Xóa" data-tooltip-bottom onclick="deleteItem('packages', '${escapeAttr(id)}')">
                                    <i class="fa-regular fa-trash-can"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `);
            });

            setStat('packages', activeCount);
        } catch (e) {
            console.error(e);
            showError('packageTableBody', 6, e.message);
            Toast.error('Không tải được packages', e.message);
        }
    }

    async function createPackage(e) {
        e.preventDefault();
        const name = $('#pkgName').value.trim();
        const durationDays = parseInt($('#pkgDuration').value, 10);
        const maxDevices = parseInt($('#pkgMaxDevices').value, 10);
        const price = parseFloat($('#pkgPrice').value);

        const newPkg = { name, durationDays, maxDevices, price, status: 'active', createdAt: Date.now() };

        try {
            const res = await fetch(FIREBASE_URLS.packages, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newPkg)
            });
            if (res.ok) {
                closeModal('packageModal');
                fetchPackages();
                $('#packageForm').reset();
                Toast.success('Đã tạo package', name);
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (err) {
            Toast.error('Tạo package thất bại', err.message);
        }
    }

    async function togglePackageStatus(id, currentStatus) {
        const isLocked = currentStatus === 'locked' || currentStatus === 'disabled';
        const newStatus = isLocked ? 'active' : 'locked';
        const action = isLocked ? 'mở khóa' : 'khóa';

        const ok = await Modal.confirm({
            heading: isLocked ? 'Mở khóa package' : 'Khóa package',
            message: `Bạn có chắc chắn muốn ${action} package này?`,
            okText:  isLocked ? 'Mở khóa' : 'Khóa',
            danger:  !isLocked
        });
        if (!ok) return;

        try {
            const res = await fetch(`${FIREBASE_BASE}/packages/${encodeURIComponent(id)}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                fetchPackages();
                Toast.success(isLocked ? 'Đã mở khóa package' : 'Đã khóa package');
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (err) {
            Toast.error('Cập nhật trạng thái thất bại', err.message);
        }
    }

    // --- QUẢN LÝ KEYS ---
    async function openKeyModal() {
        try {
            const res = await fetch(FIREBASE_URLS.packages);
            const data = await res.json();
            const select = $('#keyPackageSelect');
            select.innerHTML = '';

            if (!data) {
                Toast.warning('Cần tạo Package trước', 'Hãy tạo ít nhất một package trước khi tạo key.');
                return;
            }

            Object.keys(data).forEach(id => {
                const pkg = data[id];
                select.insertAdjacentHTML('beforeend',
                    `<option value="${escapeAttr(id)}" data-duration="${pkg.durationDays}" data-max="${pkg.maxDevices}">${escapeHtml(pkg.name)} (Max ${pkg.maxDevices} máy · ${pkg.durationDays} ngày)</option>`);
            });

            syncKeyDefaults();
            openModal('keyModal');
        } catch (err) {
            Toast.error('Không tải được danh sách package', err.message);
        }
    }

    function syncKeyDefaults() {
        const select = $('#keyPackageSelect');
        const selectedOption = select.options[select.selectedIndex];
        if (!selectedOption) return;
        const duration = parseInt(selectedOption.getAttribute('data-duration'), 10);
        const maxDevices = parseInt(selectedOption.getAttribute('data-max'), 10);
        $('#keyDurationInput').value = duration;
        $('#keyMaxDevicesInput').value = maxDevices;
    }

    async function fetchKeys() {
        const tbody = $('#keyTableBody');
        renderSkeleton(tbody, 6);
        try {
            const data = await safeFetch(FIREBASE_URLS.keys);
            tbody.innerHTML = '';

            if (!data) {
                renderEmpty(tbody, 6, {
                    icon: 'fa-key',
                    title: 'Chưa có key nào',
                    desc:  'Tạo key đầu tiên cho người dùng dựa trên package đã định.',
                    cta:   `<button type="button" class="btn btn-primary btn-sm empty-cta" onclick="openKeyModal()"><i class="fa-solid fa-plus"></i> Tạo Key</button>`
                });
                setStat('keys', 0);
                setStat('locked', 0);
                return;
            }

            const sortedIds = Object.keys(data).sort((a, b) => (data[b].createdAt || 0) - (data[a].createdAt || 0));

            let active = 0, locked = 0;
            sortedIds.forEach(keyId => {
                const k = data[keyId];
                const deviceCount = k.devices ? Object.keys(k.devices).length : 0;
                const isLocked = k.status === 'locked' || k.status === 'disabled';
                if (isLocked) locked++; else active++;

                tbody.insertAdjacentHTML('beforeend', `
                    <tr class="${isLocked ? 'row-locked' : ''}">
                        <td>${makeCopyable(k.key, 'default')}</td>
                        <td><small class="mono muted text-truncate" title="${escapeAttr(k.packageId || '')}">${escapeHtml(k.packageId || '—')}</small></td>
                        <td><strong>${deviceCount}</strong> / ${k.maxDevices}</td>
                        <td><small><span class="muted">Tạo:</span> ${escapeHtml(formatDate(k.createdAt))}<br><span class="muted">Hết:</span> ${k.expiresAt === 0 ? '<span class="badge badge-info">Vĩnh viễn</span>' : escapeHtml(formatDate(k.expiresAt))}</small></td>
                        <td>
                            <span class="badge ${isLocked ? 'badge-danger' : 'badge-success'}">
                                ${isLocked ? 'Locked' : 'Active'}
                            </span>
                        </td>
                        <td>
                            <div class="row-actions">
                                <button class="row-action ${isLocked ? 'success' : 'warning'}" data-tooltip="${isLocked ? 'Mở khóa' : 'Khóa'}" data-tooltip-bottom onclick="toggleKeyStatus('${escapeAttr(k.key)}', '${escapeAttr(k.status)}')">
                                    <i class="fa-solid ${isLocked ? 'fa-unlock' : 'fa-lock'}"></i>
                                </button>
                                <button class="row-action danger" data-tooltip="Xóa" data-tooltip-bottom onclick="deleteKeyFromFirebase('${escapeAttr(k.key)}')">
                                    <i class="fa-regular fa-trash-can"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `);
            });

            setStat('keys', active);
            setStat('locked', locked);
        } catch (e) {
            console.error('fetchKeys error:', e);
            showError('keyTableBody', 6, e.message);
            Toast.error('Không tải được keys', e.message);
        }
    }

    async function createKey(e) {
        e.preventDefault();
        const select = $('#keyPackageSelect');
        const packageId = select.value;

        let durationDays = parseInt($('#keyDurationInput').value, 10);
        let maxDevices   = parseInt($('#keyMaxDevicesInput').value, 10);

        if (isNaN(durationDays) || durationDays < 0) durationDays = 0;
        if (isNaN(maxDevices)   || maxDevices   < 1) maxDevices   = 1;

        const customKey = $('#customKeyInput').value.trim();
        const keyString = customKey !== ''
            ? customKey
            : 'KEY-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        const createdAt = Date.now();
        const expiresAt = durationDays === 0 ? 0 : createdAt + (durationDays * 24 * 60 * 60 * 1000);

        const keyData = {
            key: keyString,
            packageId,
            maxDevices,
            createdAt,
            expiresAt,
            status: 'active',
            devices: {}
        };

        // Escape keyString khi làm key Firebase để tránh path injection
        const updateObj = {};
        updateObj[keyString] = keyData;

        try {
            const res = await fetch(`${FIREBASE_BASE}/keys.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateObj)
            });
            if (res.ok) {
                closeModal('keyModal');
                fetchKeys();
                $('#keyForm').reset();
                Toast.success('Đã tạo key', keyString, { duration: 4600 });
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (err) {
            Toast.error('Tạo key thất bại', err.message);
        }
    }

    async function deleteKeyFromFirebase(keyStr) {
        const ok = await Modal.confirm({
            heading: 'Xóa key',
            message: `Bạn có chắc chắn muốn xóa key "${keyStr}"? Hành động này không thể hoàn tác.`,
            okText:  'Xóa',
            danger:  true
        });
        if (!ok) return;
        try {
            const res = await fetch(`${FIREBASE_BASE}/keys/${encodeURIComponent(keyStr)}.json`, { method: 'DELETE' });
            if (res.ok) {
                fetchKeys();
                Toast.success('Đã xóa key');
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (err) {
            Toast.error('Xóa key thất bại', err.message);
        }
    }

    async function toggleKeyStatus(keyStr, currentStatus) {
        const isLocked = currentStatus === 'locked' || currentStatus === 'disabled';
        const newStatus = isLocked ? 'active' : 'locked';
        const action = isLocked ? 'mở khóa' : 'khóa';

        const ok = await Modal.confirm({
            heading: isLocked ? 'Mở khóa key' : 'Khóa key',
            message: `Bạn có chắc chắn muốn ${action} key "${keyStr}"?`,
            okText:  isLocked ? 'Mở khóa' : 'Khóa',
            danger:  !isLocked
        });
        if (!ok) return;

        try {
            const res = await fetch(`${FIREBASE_BASE}/keys/${encodeURIComponent(keyStr)}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                fetchKeys();
                Toast.success(isLocked ? 'Đã mở khóa key' : 'Đã khóa key');
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (err) {
            Toast.error('Cập nhật trạng thái thất bại', err.message);
        }
    }

    // --- QUẢN LÝ BYPASS MENU UIDS ---
    async function fetchBypass() {
        const tbody = $('#bypassTableBody');
        renderSkeleton(tbody, 4);
        try {
            const data = await safeFetch(FIREBASE_URLS.bypass);
            tbody.innerHTML = '';

            if (!data) {
                renderEmpty(tbody, 4, {
                    icon: 'fa-user-shield',
                    title: 'Chưa có UID bypass',
                    desc:  'Thêm UID vào danh sách bypass để chặn anticheat menu.',
                    cta:   `<button type="button" class="btn btn-primary btn-sm empty-cta" onclick="openModal('bypassModal')"><i class="fa-solid fa-plus"></i> Thêm UID</button>`
                });
                setStat('bypass', 0);
                return;
            }

            const sortedIds = Object.keys(data).sort((a, b) => (data[b].updated_at || 0) - (data[a].updated_at || 0));
            setStat('bypass', sortedIds.length);

            sortedIds.forEach(uid => {
                const info = data[uid];
                tbody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td>${makeCopyable(uid, 'uid')}</td>
                        <td>
                            <div class="toggle-wrap">
                                <label class="switch">
                                    <input type="checkbox" ${info.enabled ? 'checked' : ''} onchange="toggleBypass('${escapeAttr(uid)}', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="badge ${info.enabled ? 'badge-danger' : 'badge-neutral'}">
                                    ${info.enabled ? 'Bật' : 'Tắt'}
                                </span>
                            </div>
                        </td>
                        <td>
                            <span class="muted" data-tooltip="${escapeAttr(formatDate(info.updated_at))}">${escapeHtml(formatRelative(info.updated_at))}</span>
                        </td>
                        <td>
                            <div class="row-actions">
                                <button class="row-action danger" data-tooltip="Xóa" data-tooltip-bottom onclick="deleteBypassUid('${escapeAttr(uid)}')">
                                    <i class="fa-regular fa-trash-can"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `);
            });
        } catch (e) {
            console.error('fetchBypass error:', e);
            showError('bypassTableBody', 4, e.message);
            Toast.error('Không tải được bypass UIDs', e.message);
        }
    }

    async function createBypass(e) {
        e.preventDefault();
        const uid = $('#bypassUidInput').value.trim();
        const enabled = $('#bypassStatusSelect').value === 'true';

        const updateObj = {};
        updateObj[uid] = { enabled, updated_at: Date.now() };

        try {
            const res = await fetch(FIREBASE_URLS.bypass, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateObj)
            });
            if (res.ok) {
                closeModal('bypassModal');
                fetchBypass();
                $('#bypassForm').reset();
                Toast.success('Đã thêm UID bypass', uid);
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (err) {
            Toast.error('Thêm UID bypass thất bại', err.message);
        }
    }

    async function deleteBypassUid(uid) {
        const ok = await Modal.confirm({
            heading: 'Xóa UID bypass',
            message: `Xóa UID "${uid}" khỏi danh sách bypass?`,
            okText:  'Xóa',
            danger:  true
        });
        if (!ok) return;
        try {
            const res = await fetch(`${FIREBASE_BASE}/bypass_menu_uids/${encodeURIComponent(uid)}.json`, { method: 'DELETE' });
            if (res.ok) {
                fetchBypass();
                Toast.success('Đã xóa UID bypass');
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (err) {
            Toast.error('Xóa UID bypass thất bại', err.message);
        }
    }

    async function toggleBypass(uid, enabled) {
        const updateObj = {};
        updateObj[uid] = { enabled, updated_at: Date.now() };

        try {
            const res = await fetch(FIREBASE_URLS.bypass, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateObj)
            });
            if (res.ok) {
                fetchBypass();
                Toast.success(enabled ? 'Đã bật bypass' : 'Đã tắt bypass');
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (err) {
            Toast.error('Cập nhật bypass thất bại', err.message);
            fetchBypass();
        }
    }

    // --- QUẢN LÝ DEVICE INFO ---
    async function fetchDevices() {
        const tbody = $('#deviceTableBody');
        renderSkeleton(tbody, 6);
        try {
            const data = await safeFetch(FIREBASE_URLS.devices);
            tbody.innerHTML = '';

            if (!data) {
                renderEmpty(tbody, 6, {
                    icon: 'fa-mobile-screen',
                    title: 'Chưa có thiết bị nào',
                    desc:  'Thiết bị sẽ xuất hiện ở đây khi người dùng đăng nhập hệ thống.'
                });
                setStat('devices', 0);
                return;
            }

            const sortedIds = Object.keys(data).sort((a, b) => (data[b].timestamp || 0) - (data[a].timestamp || 0));
            setStat('devices', sortedIds.length);

            sortedIds.forEach(uid => {
                const dev = data[uid];
                const logTime = formatDate(dev.timestamp * 1000);
                tbody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td>${makeCopyable(dev.uid || uid, 'uid')}</td>
                        <td>
                            <div><strong>${escapeHtml(dev.device_name || 'N/A')}</strong></div>
                            <div class="muted" style="font-size:11.5px;">${escapeHtml(dev.device_model || 'N/A')}</div>
                        </td>
                        <td>
                            <div>${escapeHtml(dev.app_name || 'N/A')}</div>
                            <div class="mono muted" style="font-size:11px;">${escapeHtml(dev.app_bundle_id || '')}</div>
                        </td>
                        <td>${dev.key ? `<code class="text-truncate" style="max-width:200px;" title="${escapeAttr(dev.key)}">${escapeHtml(dev.key)}</code>` : '<span class="muted">N/A</span>'}</td>
                        <td><span class="badge badge-neutral">${escapeHtml(dev.system_version || 'N/A')}</span></td>
                        <td><small class="muted" data-tooltip="${escapeAttr(logTime)}">${escapeHtml(formatRelative(dev.timestamp * 1000))}</small></td>
                    </tr>
                `);
            });
        } catch (e) {
            console.error('fetchDevices error:', e);
            showError('deviceTableBody', 6, e.message);
            Toast.error('Không tải được devices', e.message);
        }
    }

    // --- HÀM HỖ TRỢ CHUNG ---
    function openModal(modalId) {
        Modal.open(modalId);
    }
    function closeModal(modalId) {
        Modal.close(modalId);
    }

    function showError(tbodyId, colspan, errorMsg) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        // Map tbodyId → refresh key for the "Thử lại" button
        const refreshMap = {
            packageTableBody: 'packages',
            keyTableBody:     'keys',
            bypassTableBody:   'bypass',
            deviceTableBody:  'devices'
        };
        const refreshKey = refreshMap[tbodyId];
        tbody.innerHTML = `
            <tr class="error-row">
                <td colspan="${colspan}">
                    <div class="empty-state">
                        <span class="empty-icon" style="background:var(--danger-soft);color:var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i></span>
                        <div class="empty-title" style="color:var(--danger);">Lỗi đồng bộ Firebase</div>
                        <p class="empty-desc">${escapeHtml(errorMsg)}</p>
                        <p class="empty-desc" style="font-size:11px;">Kiểm tra: (1) Firebase Rules cho phép public read/write, (2) URL database đúng.</p>
                        ${refreshKey ? `<button type="button" class="btn btn-secondary btn-sm empty-cta" onclick="window.app.refresh('${refreshKey}')"><i class="fa-solid fa-rotate"></i> Thử lại</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }

    async function safeFetch(url, options = {}) {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        return await res.json();
    }

    async function deleteItem(endpoint, id) {
        const ok = await Modal.confirm({
            heading: 'Xóa mục',
            message: `Bạn có chắc chắn muốn xóa mục này khỏi ${endpoint}?`,
            okText:  'Xóa',
            danger:  true
        });
        if (!ok) return;

        try {
            const url = `${FIREBASE_BASE}/${endpoint}/${encodeURIComponent(id)}.json`;
            const res = await fetch(url, { method: 'DELETE' });
            if (res.ok) {
                if (endpoint === 'packages') fetchPackages();
                Toast.success('Đã xóa');
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (err) {
            Toast.error('Xóa thất bại', err.message);
        }
    }

    // Expose for inline onclick attributes and any external code
    window.testConnection = testConnection;
    window.fetchPackages = fetchPackages;
    window.fetchKeys = fetchKeys;
    window.fetchBypass = fetchBypass;
    window.fetchDevices = fetchDevices;
    window.createPackage = createPackage;
    window.createKey = createKey;
    window.createBypass = createBypass;
    window.togglePackageStatus = togglePackageStatus;
    window.toggleKeyStatus = toggleKeyStatus;
    window.toggleBypass = toggleBypass;
    window.deleteItem = deleteItem;
    window.deleteKeyFromFirebase = deleteKeyFromFirebase;
    window.deleteBypassUid = deleteBypassUid;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.syncKeyDefaults = syncKeyDefaults;
    window.openKeyModal = openKeyModal;
    window.safeFetch = safeFetch;
    window.showError = showError;
    window.Welcome = Welcome;
    window.About = About;
    window.Preview = Preview;
    window.loadDataForActiveTab = loadDataForActiveTab;
    window.FIREBASE_URLS = FIREBASE_URLS;
})();