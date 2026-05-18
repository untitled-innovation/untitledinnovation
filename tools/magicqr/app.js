/* ==========================================
   Magic QR — Application Logic
   ========================================== */

(function () {
    'use strict';

    // ── State ──
    let currentTab = 'url';
    let currentDotStyle = 'square';
    let currentEyeStyle = 'square';
    let logoImage = null;
    let qrInstance = null;
    let debounceTimer = null;

    // ── DOM Refs ──
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ── Init ──
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        setupTabs();
        setupDotStyles();
        setupEyeStyles();
        setupColors();
        setupGradient();
        setupLogo();
        setupSliders();
        setupAdvanced();
        setupExport();
        setupHistory();
        generateQR();
    }

    // ── Content Tabs ──
    function setupTabs() {
        $$('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $$('.tab-content').forEach(c => c.classList.remove('active'));
                currentTab = btn.dataset.tab;
                $(`#input-${currentTab}`).classList.add('active');
                scheduleGenerate();
            });
        });

        // Live typing
        $$('.qr-input').forEach(input => {
            input.addEventListener('input', () => scheduleGenerate());
        });
    }

    // ── Dot Styles ──
    function setupDotStyles() {
        $$('#dot-styles .style-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('#dot-styles .style-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentDotStyle = btn.dataset.dot;
                scheduleGenerate();
            });
        });
    }

    // ── Eye Styles ──
    function setupEyeStyles() {
        $$('#eye-styles .style-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('#eye-styles .style-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentEyeStyle = btn.dataset.eye;
                scheduleGenerate();
            });
        });
    }

    // ── Colors ──
    function setupColors() {
        $('#fg-color').addEventListener('input', (e) => {
            $('#fg-hex').textContent = e.target.value.toUpperCase();
            scheduleGenerate();
        });
        $('#bg-color').addEventListener('input', (e) => {
            $('#bg-hex').textContent = e.target.value.toUpperCase();
            scheduleGenerate();
        });
    }

    // ── Gradient ──
    function setupGradient() {
        $('#gradient-toggle').addEventListener('change', (e) => {
            $('#gradient-opts').classList.toggle('hidden', !e.target.checked);
            scheduleGenerate();
        });
        $('#grad-color').addEventListener('input', (e) => {
            $('#grad-hex').textContent = e.target.value.toUpperCase();
            scheduleGenerate();
        });
        $('#grad-type').addEventListener('change', () => scheduleGenerate());
    }

    // ── Logo ──
    function setupLogo() {
        const dropZone = $('#logo-drop');
        const fileInput = $('#logo-file');

        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleLogoFile(e.dataTransfer.files[0]);
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) handleLogoFile(fileInput.files[0]);
        });

        $('#logo-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeLogo();
        });
    }

    function handleLogoFile(file) {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            logoImage = e.target.result;
            $('#logo-thumb').src = logoImage;
            $('#logo-name').textContent = file.name;
            $('#logo-placeholder').classList.add('hidden');
            $('#logo-preview-wrap').classList.remove('hidden');
            $('#logo-preview-wrap').classList.add('flex');
            scheduleGenerate();
        };
        reader.readAsDataURL(file);
    }

    function removeLogo() {
        logoImage = null;
        $('#logo-file').value = '';
        $('#logo-placeholder').classList.remove('hidden');
        $('#logo-preview-wrap').classList.add('hidden');
        $('#logo-preview-wrap').classList.remove('flex');
        scheduleGenerate();
    }

    // ── Sliders ──
    function setupSliders() {
        $('#logo-size').addEventListener('input', (e) => {
            $('#logo-size-val').textContent = e.target.value + '%';
            scheduleGenerate();
        });
        $('#qr-margin').addEventListener('input', (e) => {
            $('#margin-val').textContent = e.target.value;
            scheduleGenerate();
        });
        $('#qr-size').addEventListener('change', () => scheduleGenerate());
        $('#ec-level').addEventListener('change', () => scheduleGenerate());
    }

    // ── Advanced Toggle ──
    function setupAdvanced() {
        $('#adv-toggle').addEventListener('click', () => {
            const body = $('#adv-body');
            const chevron = $('#adv-chevron');
            body.classList.toggle('hidden');
            chevron.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)';
        });
    }

    // ── Build QR Data String ──
    function getQRData() {
        switch (currentTab) {
            case 'url':
                return $('#qr-url').value || 'https://untitledinnovations.com';
            case 'text':
                return $('#qr-text').value || 'Hello from Magic QR!';
            case 'wifi': {
                const ssid = $('#wifi-ssid').value;
                const pass = $('#wifi-pass').value;
                const enc = $('#wifi-enc').value;
                return `WIFI:T:${enc};S:${ssid};P:${pass};;`;
            }
            case 'vcard': {
                const name = $('#vc-name').value;
                const phone = $('#vc-phone').value;
                const email = $('#vc-email').value;
                const org = $('#vc-org').value;
                return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL:${phone}\nEMAIL:${email}\nORG:${org}\nEND:VCARD`;
            }
            case 'email': {
                const to = $('#em-to').value;
                const sub = $('#em-sub').value;
                const body = $('#em-body').value;
                return `mailto:${to}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`;
            }
            case 'sms': {
                const num = $('#sms-num').value;
                const body = $('#sms-body').value;
                return `smsto:${num}:${body}`;
            }
            default:
                return 'https://untitledinnovations.com';
        }
    }

    // ── Generate QR ──
    function scheduleGenerate() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(generateQR, 200);
    }

    function generateQR() {
        const data = getQRData();
        if (!data.trim()) return;

        const fgColor = $('#fg-color').value;
        const bgColor = $('#bg-color').value;
        const useGradient = $('#gradient-toggle').checked;
        const gradColor = $('#grad-color').value;
        const gradType = $('#grad-type').value;
        const logoSizePct = parseInt($('#logo-size').value) / 100;
        const margin = parseInt($('#qr-margin').value);
        const size = parseInt($('#qr-size').value);
        const ecLevel = $('#ec-level').value;

        // Build dot color options
        let dotsOptions = { type: currentDotStyle };
        if (useGradient) {
            dotsOptions.gradient = {
                type: gradType,
                colorStops: [
                    { offset: 0, color: fgColor },
                    { offset: 1, color: gradColor }
                ]
            };
        } else {
            dotsOptions.color = fgColor;
        }

        // Corner square and dot options
        let cornerSquareOpts = { type: currentEyeStyle };
        let cornerDotOpts = { type: currentEyeStyle === 'extra-rounded' ? 'dot' : currentEyeStyle };

        if (useGradient) {
            cornerSquareOpts.gradient = dotsOptions.gradient;
            cornerDotOpts.gradient = dotsOptions.gradient;
        } else {
            cornerSquareOpts.color = fgColor;
            cornerDotOpts.color = fgColor;
        }

        const config = {
            width: size,
            height: size,
            type: 'canvas',
            data: data,
            margin: margin,
            qrOptions: {
                errorCorrectionLevel: ecLevel
            },
            dotsOptions: dotsOptions,
            backgroundOptions: {
                color: bgColor
            },
            cornersSquareOptions: cornerSquareOpts,
            cornersDotOptions: cornerDotOpts
        };

        // Logo
        if (logoImage) {
            config.image = logoImage;
            config.imageOptions = {
                crossOrigin: 'anonymous',
                margin: 4,
                imageSize: logoSizePct,
                hideBackgroundDots: true
            };
        }

        // Clear & render
        const container = $('#qr-preview');
        container.innerHTML = '';

        qrInstance = new QRCodeStyling(config);
        qrInstance.append(container);

        // Update scannability badge
        updateScanBadge(logoSizePct, fgColor, bgColor);
    }

    // ── Scannability Indicator ──
    function updateScanBadge(logoSize, fg, bg) {
        const badge = $('#scan-badge');
        const contrast = getContrast(fg, bg);
        const hasLogo = !!logoImage;

        if (hasLogo && logoSize > 0.35) {
            badge.className = 'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border error';
            badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>Logo too large</span>';
        } else if (contrast < 3) {
            badge.className = 'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border warn';
            badge.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>Low contrast</span>';
        } else if (hasLogo && logoSize > 0.28) {
            badge.className = 'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border warn';
            badge.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>Borderline</span>';
        } else {
            badge.className = 'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-terminal/30 bg-terminal/10 text-terminal';
            badge.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Scannable</span>';
        }
    }

    function getContrast(hex1, hex2) {
        const lum1 = getLuminance(hex1);
        const lum2 = getLuminance(hex2);
        const brightest = Math.max(lum1, lum2);
        const darkest = Math.min(lum1, lum2);
        return (brightest + 0.05) / (darkest + 0.05);
    }

    function getLuminance(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    }

    // ── Export ──
    function setupExport() {
        $$('.export-btn[data-format]').forEach(btn => {
            btn.addEventListener('click', () => {
                const format = btn.dataset.format;
                if (!qrInstance) return;
                const name = `magic-qr-${Date.now()}`;
                qrInstance.download({ name, extension: format });
                saveToHistory();
            });
        });

        $('#copy-btn').addEventListener('click', async () => {
            if (!qrInstance) return;
            try {
                const blob = await qrInstance.getRawData('png');
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                showToast('Copied to clipboard!');
            } catch (e) {
                // Fallback: download instead
                qrInstance.download({ name: 'magic-qr', extension: 'png' });
                showToast('Downloaded instead (clipboard unavailable)');
            }
        });
    }

    // ── Toast ──
    function showToast(msg) {
        let toast = $('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // ── History (localStorage) ──
    const HISTORY_KEY = 'magicqr_history';
    const MAX_HISTORY = 10;

    function setupHistory() {
        renderHistory();
        $('#clear-history').addEventListener('click', () => {
            localStorage.removeItem(HISTORY_KEY);
            renderHistory();
        });
    }

    function saveToHistory() {
        if (!qrInstance) return;
        const canvas = $('#qr-preview canvas');
        if (!canvas) return;

        try {
            const thumbUrl = canvas.toDataURL('image/png', 0.5);
            const data = getQRData();
            const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

            history.unshift({ thumb: thumbUrl, data: data, ts: Date.now() });
            if (history.length > MAX_HISTORY) history.pop();

            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
            renderHistory();
        } catch (e) {
            // Canvas tainted or storage full — silently ignore
        }
    }

    function renderHistory() {
        const grid = $('#history-grid');
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const empty = $('#history-empty');

        // Remove old items
        grid.querySelectorAll('.history-item').forEach(el => el.remove());

        if (history.length === 0) {
            if (empty) empty.classList.remove('hidden');
            return;
        }

        if (empty) empty.classList.add('hidden');

        history.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.title = item.data.substring(0, 60);
            div.innerHTML = `<img src="${item.thumb}" alt="QR">`;
            div.addEventListener('click', () => {
                // Load this QR data into URL tab
                $$('.tab-btn').forEach(b => b.classList.remove('active'));
                $$('.tab-content').forEach(c => c.classList.remove('active'));
                const urlTab = document.querySelector('.tab-btn[data-tab="url"]');
                urlTab.classList.add('active');
                $('#input-url').classList.add('active');
                currentTab = 'url';
                $('#qr-url').value = item.data;
                generateQR();
            });
            grid.appendChild(div);
        });
    }

})();
