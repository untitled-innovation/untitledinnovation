/* ==========================================
   Invoice Forge — Application Logic
   ========================================== */

(function () {
    'use strict';

    const STORAGE_KEY = 'ui_invoice_state_v1';
    const PAGE_WIDTH = 794;   // A4 @ 96dpi
    const PAGE_HEIGHT = 1123;

    // ── DOM Refs ──
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ── State ──
    let state = defaultState();
    let saveTimer = null;
    let zoomMode = 'fit';   // 'fit' scales the sheet to the column, 'full' shows it 1:1

    function defaultState() {
        return {
            template: 'modern',
            accent: '#7B61FF',
            status: '',
            logo: null,
            logoName: '',
            from: { name: '', address: '', email: '', phone: '', taxId: '' },
            to: { name: '', address: '', email: '', phone: '' },
            meta: {
                number: 'INV-0001',
                po: '',
                date: today(0),
                due: today(15),
                currency: 'USD',
                symbol: ''
            },
            items: [
                { desc: '', qty: 1, rate: 0 },
                { desc: '', qty: 1, rate: 0 }
            ],
            taxLabel: 'Tax',
            taxRate: 0,
            discountType: 'percent',
            discountValue: 0,
            shipping: 0,
            amountPaid: 0,
            payment: '',
            notes: '',
            terms: ''
        };
    }

    function today(offsetDays) {
        const d = new Date();
        d.setDate(d.getDate() + (offsetDays || 0));
        return d.toISOString().slice(0, 10);
    }

    // ── Init ──
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        load();
        setupTemplates();
        setupBindings();
        setupLogo();
        setupItems();
        setupData();
        setupExport();
        setupViews();
        setupZoom();
        syncForm();
        renderItems();
        render();
        window.addEventListener('resize', fitPaper);
        window.addEventListener('orientationchange', () => setTimeout(fitPaper, 200));
    }

    /* ──────────────────────────────────────
       Persistence
       ────────────────────────────────────── */

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) state = merge(defaultState(), JSON.parse(raw));
        } catch (e) {
            /* corrupt or unavailable storage — keep defaults */
        }
    }

    function save() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch (e) {
                /* quota exceeded (usually a large logo) — preview still works */
            }
        }, 300);
    }

    // Shallow-per-section merge so new fields survive old saved payloads
    function merge(base, saved) {
        const out = Object.assign({}, base, saved);
        ['from', 'to', 'meta'].forEach(k => {
            out[k] = Object.assign({}, base[k], saved[k] || {});
        });
        if (!Array.isArray(out.items) || !out.items.length) out.items = base.items;
        return out;
    }

    /* ──────────────────────────────────────
       Form Bindings
       ────────────────────────────────────── */

    function getPath(path) {
        return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state);
    }

    function setPath(path, value) {
        const keys = path.split('.');
        const last = keys.pop();
        const target = keys.reduce((o, k) => o[k], state);
        target[last] = value;
    }

    function setupBindings() {
        $$('[data-bind]').forEach(el => {
            const path = el.dataset.bind;
            el.addEventListener('input', () => {
                const raw = el.value;
                setPath(path, el.type === 'number' ? num(raw) : raw);
                update();
            });
        });

        $('#accent-color').addEventListener('input', (e) => {
            state.accent = e.target.value;
            $('#accent-hex').textContent = e.target.value.toUpperCase();
            update();
        });

        $('#inv-status').addEventListener('change', (e) => {
            state.status = e.target.value;
            update();
        });

        $('#meta-currency').addEventListener('change', (e) => {
            state.meta.currency = e.target.value;
            $('#meta-symbol').disabled = e.target.value !== 'CUSTOM';
            update();
        });

        $('#discount-type').addEventListener('change', (e) => {
            state.discountType = e.target.value;
            update();
        });
    }

    // Push state into the form controls (after load / import / reset)
    function syncForm() {
        $$('[data-bind]').forEach(el => {
            const v = getPath(el.dataset.bind);
            el.value = (v == null || (el.type === 'number' && !v)) ? '' : v;
        });

        $('#accent-color').value = state.accent;
        $('#accent-hex').textContent = state.accent.toUpperCase();
        $('#inv-status').value = state.status;
        $('#meta-currency').value = state.meta.currency;
        $('#meta-symbol').disabled = state.meta.currency !== 'CUSTOM';
        $('#discount-type').value = state.discountType;

        $$('.tpl-btn').forEach(b => b.classList.toggle('active', b.dataset.template === state.template));
        renderLogoUI();
    }

    function setupTemplates() {
        $$('.tpl-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.tpl-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.template = btn.dataset.template;
                update();
            });
        });
    }

    /* ──────────────────────────────────────
       Logo
       ────────────────────────────────────── */

    function setupLogo() {
        const dropZone = $('#logo-drop');
        const fileInput = $('#logo-file');

        dropZone.addEventListener('click', (e) => {
            if (e.target.closest('#logo-remove')) return;
            fileInput.click();
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) readLogo(file);
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) readLogo(file);
        });

        $('#logo-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            state.logo = null;
            state.logoName = '';
            fileInput.value = '';
            renderLogoUI();
            update();
        });
    }

    function readLogo(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            state.logo = ev.target.result;
            state.logoName = file.name;
            renderLogoUI();
            update();
        };
        reader.readAsDataURL(file);
    }

    function renderLogoUI() {
        const hasLogo = !!state.logo;
        $('#logo-placeholder').classList.toggle('hidden', hasLogo);
        $('#logo-preview-wrap').classList.toggle('hidden', !hasLogo);
        $('#logo-preview-wrap').classList.toggle('flex', hasLogo);
        if (hasLogo) {
            $('#logo-thumb').src = state.logo;
            $('#logo-name').textContent = state.logoName || 'logo';
        }
    }

    /* ──────────────────────────────────────
       Line Items
       ────────────────────────────────────── */

    function setupItems() {
        $('#add-item').addEventListener('click', () => {
            state.items.push({ desc: '', qty: 1, rate: 0 });
            renderItems();
            update();
            const rows = $$('#items-list .item-row');
            const lastDesc = rows[rows.length - 1].querySelector('.item-desc');
            lastDesc.focus();
        });

        const list = $('#items-list');

        // Live edit — updates state and the row total without re-rendering (keeps focus)
        list.addEventListener('input', (e) => {
            const input = e.target;
            const row = input.closest('.item-row');
            if (!row) return;
            const item = state.items[+row.dataset.idx];
            if (!item) return;

            if (input.classList.contains('item-desc')) item.desc = input.value;
            if (input.classList.contains('item-qty')) item.qty = num(input.value);
            if (input.classList.contains('item-rate')) item.rate = num(input.value);

            row.querySelector('.item-amt').textContent = fmt(num(item.qty) * num(item.rate));
            update();
        });

        list.addEventListener('click', (e) => {
            const del = e.target.closest('.item-del');
            if (!del) return;
            const idx = +del.closest('.item-row').dataset.idx;
            state.items.splice(idx, 1);
            if (!state.items.length) state.items.push({ desc: '', qty: 1, rate: 0 });
            renderItems();
            update();
        });
    }

    function renderItems() {
        $('#items-list').innerHTML = state.items.map((item, i) => `
            <div class="item-row" data-idx="${i}">
                <input type="text" class="qr-input item-desc" placeholder="Item or service description" value="${attr(item.desc)}">
                <input type="number" class="qr-input item-qty" min="0" step="any" placeholder="Qty" value="${attr(item.qty)}">
                <input type="number" class="qr-input item-rate" min="0" step="any" placeholder="Rate" value="${attr(item.rate)}">
                <span class="item-amt">${esc(fmt(num(item.qty) * num(item.rate)))}</span>
                <button class="item-del" title="Remove line"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `).join('');
    }

    /* ──────────────────────────────────────
       Maths & Formatting
       ────────────────────────────────────── */

    function num(v) {
        const n = parseFloat(v);
        return isFinite(n) ? n : 0;
    }

    function totals() {
        const subtotal = state.items.reduce((sum, it) => sum + num(it.qty) * num(it.rate), 0);
        const discount = state.discountType === 'percent'
            ? subtotal * num(state.discountValue) / 100
            : num(state.discountValue);
        const taxable = Math.max(0, subtotal - discount);
        const tax = taxable * num(state.taxRate) / 100;
        const shipping = num(state.shipping);
        const grand = taxable + tax + shipping;
        const paid = num(state.amountPaid);
        return { subtotal, discount, taxable, tax, shipping, grand, paid, balance: grand - paid };
    }

    function fmt(n) {
        const value = isFinite(n) ? n : 0;
        if (state.meta.currency === 'CUSTOM') {
            return (state.meta.symbol || '') + value.toFixed(2);
        }
        try {
            return new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: state.meta.currency
            }).format(value);
        } catch (e) {
            return state.meta.currency + ' ' + value.toFixed(2);
        }
    }

    function fmtDate(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-').map(Number);
        if (!y || !m || !d) return iso;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${d} ${months[m - 1]} ${y}`;
    }

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function attr(str) {
        return esc(str).replace(/"/g, '&quot;');
    }

    /* ──────────────────────────────────────
       Preview Render
       ────────────────────────────────────── */

    function update() {
        render();
        save();
    }

    function render() {
        const s = state;
        const t = totals();
        const paper = $('#invoice-paper');

        paper.className = `inv-paper tpl-${s.template}`;
        paper.style.setProperty('--accent', s.accent);

        const fromLines = [s.from.address, s.from.email, s.from.phone, s.from.taxId ? 'Tax ID: ' + s.from.taxId : '']
            .filter(Boolean).join('\n');
        const toLines = [s.to.address, s.to.email, s.to.phone].filter(Boolean).join('\n');

        const metaLines = [
            `<p class="inv-meta-line"><b>Invoice #</b> ${esc(s.meta.number || '—')}</p>`,
            s.meta.date ? `<p class="inv-meta-line"><b>Issued</b> ${esc(fmtDate(s.meta.date))}</p>` : '',
            s.meta.due ? `<p class="inv-meta-line"><b>Due</b> ${esc(fmtDate(s.meta.due))}</p>` : '',
            s.meta.po ? `<p class="inv-meta-line"><b>Ref</b> ${esc(s.meta.po)}</p>` : ''
        ].join('');

        const rows = s.items
            .filter(it => it.desc || num(it.rate))
            .map(it => `
                <tr>
                    <td class="desc">${esc(it.desc) || '&nbsp;'}</td>
                    <td class="num">${esc(String(num(it.qty)))}</td>
                    <td class="num">${esc(fmt(num(it.rate)))}</td>
                    <td class="num">${esc(fmt(num(it.qty) * num(it.rate)))}</td>
                </tr>`).join('');

        const totalRows = [
            `<tr><td>Subtotal</td><td>${esc(fmt(t.subtotal))}</td></tr>`,
            t.discount ? `<tr><td>Discount${s.discountType === 'percent' ? ` (${esc(String(num(s.discountValue)))}%)` : ''}</td><td>−${esc(fmt(t.discount))}</td></tr>` : '',
            t.tax ? `<tr><td>${esc(s.taxLabel || 'Tax')} (${esc(String(num(s.taxRate)))}%)</td><td>${esc(fmt(t.tax))}</td></tr>` : '',
            t.shipping ? `<tr><td>Shipping / Fees</td><td>${esc(fmt(t.shipping))}</td></tr>` : '',
            `<tr class="grand"><td>Total</td><td>${esc(fmt(t.grand))}</td></tr>`,
            t.paid ? `<tr><td>Amount Paid</td><td>−${esc(fmt(t.paid))}</td></tr>` : '',
            t.paid ? `<tr class="balance"><td>Balance Due</td><td>${esc(fmt(t.balance))}</td></tr>` : ''
        ].join('');

        const blocks = [
            s.payment ? block('Payment Details', s.payment) : '',
            s.notes ? block('Notes', s.notes) : '',
            s.terms ? block('Terms & Conditions', s.terms) : ''
        ].join('');

        paper.innerHTML = `
            <div class="inv-band"></div>
            ${s.status ? `<div class="inv-stamp">${esc(s.status)}</div>` : ''}

            <div class="inv-head">
                <div class="inv-brand">
                    ${s.logo ? `<img class="inv-logo" src="${attr(s.logo)}" alt="">` : ''}
                    <h1 class="inv-biz-name">${esc(s.from.name) || 'Your Business Name'}</h1>
                    <p class="inv-muted">${esc(fromLines) || 'Street, City, State ZIP\nyou@business.com'}</p>
                </div>
                <div class="inv-title-block">
                    <h2 class="inv-title">Invoice</h2>
                    ${metaLines}
                </div>
            </div>

            <div class="inv-parties">
                <div class="inv-party">
                    <h4>Bill To</h4>
                    <strong>${esc(s.to.name) || 'Client Name'}</strong>
                    <p class="inv-muted">${esc(toLines)}</p>
                </div>
                <div class="inv-due">
                    <h4>${t.paid ? 'Balance Due' : 'Amount Due'}</h4>
                    <div class="inv-due-amt">${esc(fmt(t.paid ? t.balance : t.grand))}</div>
                    ${s.meta.due ? `<div class="inv-due-date">by ${esc(fmtDate(s.meta.due))}</div>` : ''}
                </div>
            </div>

            <div class="inv-table-wrap">
                <table class="inv-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th class="num" style="width:70px">Qty</th>
                            <th class="num" style="width:110px">Rate</th>
                            <th class="num" style="width:120px">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td class="desc" colspan="4" style="color:#aaa">Add your first line item…</td></tr>'}
                    </tbody>
                </table>
            </div>

            <div class="inv-totals">
                <table>${totalRows}</table>
            </div>

            ${blocks ? `<div class="inv-blocks">${blocks}</div>` : ''}

            <div class="inv-foot">
                <span>${esc(s.from.name) || 'Your Business Name'}${s.meta.number ? ' · ' + esc(s.meta.number) : ''}</span>
                <span>Thank you for your business.</span>
            </div>
        `;

        $('#mini-total').textContent = fmt(t.paid ? t.balance : t.grand);
        fitPaper();
    }

    function block(title, body) {
        return `<div class="inv-block"><h4>${esc(title)}</h4><p>${esc(body)}</p></div>`;
    }

    // Scale the A4 sheet down to whatever width the preview column has
    function fitPaper() {
        const vp = $('#paper-viewport');
        const scaler = $('#paper-scaler');
        const paper = $('#invoice-paper');

        const cs = getComputedStyle(vp);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const avail = vp.clientWidth - padX;

        if (avail <= 0) return; // column is hidden (mobile edit view) — remeasure when shown

        const scale = zoomMode === 'full' ? 1 : Math.min(1, avail / PAGE_WIDTH);
        scaler.style.transform = `scale(${scale})`;
        // Only the 1:1 view can overflow, so only it gets a pan scrollbar
        vp.classList.toggle('zoomed', PAGE_WIDTH * scale > avail);
        vp.style.height = (paper.offsetHeight * scale + padY) + 'px';

        const pages = Math.max(1, Math.ceil(paper.offsetHeight / PAGE_HEIGHT - 0.02));
        $('#page-count').textContent = pages === 1 ? '1 page' : pages + ' pages';
    }

    /* ──────────────────────────────────────
       Responsive: Edit / Preview + Zoom
       ────────────────────────────────────── */

    // Below lg the two columns share the screen, so only one is shown at a time
    function setupViews() {
        $$('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                $$('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
                document.body.classList.toggle('view-preview', view === 'preview');
                document.body.classList.toggle('view-edit', view === 'edit');
                // The preview column had no width while hidden — measure it now
                fitPaper();
                $('#view-switch').scrollIntoView({ block: 'start' });
            });
        });
    }

    function setupZoom() {
        $$('.zoom-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.zoom-btn').forEach(b => b.classList.toggle('active', b === btn));
                zoomMode = btn.dataset.zoom;
                fitPaper();
            });
        });
    }

    /* ──────────────────────────────────────
       Data: new / export / import
       ────────────────────────────────────── */

    function setupData() {
        $('#new-invoice').addEventListener('click', () => {
            if (!confirm('Start a new invoice? The current one will be cleared (your business details are kept).')) return;
            const keep = { from: state.from, logo: state.logo, logoName: state.logoName, accent: state.accent, template: state.template, meta: state.meta };
            state = defaultState();
            state.from = keep.from;
            state.logo = keep.logo;
            state.logoName = keep.logoName;
            state.accent = keep.accent;
            state.template = keep.template;
            state.meta.currency = keep.meta.currency;
            state.meta.symbol = keep.meta.symbol;
            state.meta.number = nextNumber(keep.meta.number);
            syncForm();
            renderItems();
            update();
            toast('New invoice started');
        });

        $('#export-json').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
            downloadBlob(blob, `${state.meta.number || 'invoice'}.json`);
            toast('Invoice data saved');
        });

        $('#import-json').addEventListener('click', () => $('#json-file').click());

        $('#json-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    state = merge(defaultState(), JSON.parse(ev.target.result));
                    syncForm();
                    renderItems();
                    update();
                    toast('Invoice loaded');
                } catch (err) {
                    toast('That file is not a valid invoice', true);
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        });
    }

    // INV-0007 → INV-0008, keeping the padding width
    function nextNumber(current) {
        const match = String(current || '').match(/^(.*?)(\d+)(\D*)$/);
        if (!match) return current || 'INV-0001';
        const next = String(+match[2] + 1).padStart(match[2].length, '0');
        return match[1] + next + match[3];
    }

    /* ──────────────────────────────────────
       Export: PDF / PNG / Print
       ────────────────────────────────────── */

    function setupExport() {
        $('#dl-pdf').addEventListener('click', () => withUnscaledPaper(exportPDF));
        $('#dl-png').addEventListener('click', () => withUnscaledPaper(exportPNG));
        $('#do-print').addEventListener('click', doPrint);
        $('#copy-total').addEventListener('click', () => {
            const t = totals();
            navigator.clipboard.writeText(fmt(t.paid ? t.balance : t.grand))
                .then(() => toast('Total copied to clipboard'))
                .catch(() => toast('Clipboard blocked by browser', true));
        });
    }

    // html2canvas rasterises at the element's real size, so drop the preview scale first
    async function withUnscaledPaper(fn) {
        const scaler = $('#paper-scaler');
        const prev = scaler.style.transform;
        scaler.style.transform = 'none';
        document.body.classList.add('exporting');
        try {
            await fn();
        } catch (e) {
            toast('Export failed — try the Print button', true);
        } finally {
            document.body.classList.remove('exporting');
            scaler.style.transform = prev;
            fitPaper();
        }
    }

    function exportPDF() {
        const el = $('#invoice-paper');
        return html2pdf().set({
            margin: 0,
            filename: `${state.meta.number || 'invoice'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: PAGE_WIDTH },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(el).save().then(() => toast('PDF downloaded'));
    }

    function exportPNG() {
        return html2canvas($('#invoice-paper'), {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: PAGE_WIDTH   // render the sheet full width even on a phone
        }).then(canvas => new Promise(resolve => {
            canvas.toBlob(blob => {
                downloadBlob(blob, `${state.meta.number || 'invoice'}.png`);
                toast('PNG downloaded');
                resolve();
            }, 'image/png');
        }));
    }

    // Clone the sheet into a print-only container; @media print hides everything else
    function doPrint() {
        const root = document.createElement('div');
        root.id = 'print-root';
        root.style.display = 'none';
        const clone = $('#invoice-paper').cloneNode(true);
        clone.removeAttribute('id');
        root.appendChild(clone);
        document.body.appendChild(root);

        const cleanup = () => {
            root.remove();
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);

        window.print();
        setTimeout(cleanup, 2000); // Safari does not always fire afterprint
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ──────────────────────────────────────
       Toast
       ────────────────────────────────────── */

    let toastTimer = null;
    function toast(message, isError) {
        let el = $('.toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'toast';
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.style.color = isError ? '#FF5050' : '';
        el.style.borderColor = isError ? 'rgba(255,80,80,0.3)' : '';
        el.style.background = isError ? 'rgba(255,80,80,0.12)' : '';
        requestAnimationFrame(() => el.classList.add('show'));

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }

})();
