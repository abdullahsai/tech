let editingId = null;

function bufferToBase64(buf) {
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}


async function loadItems(category) {
    const url = category ? `/api/items/all?category=${encodeURIComponent(category)}` : '/api/items/all';
    const res = await fetch(url);
    const items = await res.json();
    const container = document.getElementById('itemsList');
    container.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'row g-2 align-items-center mb-2';
        row.innerHTML = `
            <div class="col-sm-6 col-md-4">
                <label class="form-label">${item.description} (${item.cost} OMR/${item.unit})</label>
            </div>
            <div class="col-sm-3 col-md-2">
                <input type="number" min="0" step="1" data-id="${item.id}" class="form-control" placeholder="الكمية">
            </div>`;
        container.appendChild(row);
    });
}

async function loadCategories() {
    const res = await fetch('/api/items/categories');
    const categories = await res.json();
    const select = document.getElementById('categorySelect');
    select.innerHTML = '';
    categories.forEach((cat, idx) => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
        if (idx === 0) select.value = cat;
    });
    if (categories.length > 0) {
        loadItems(select.value);
    } else {
        document.getElementById('itemsList').innerHTML = '<p>لا يوجد</p>';
    }
}

async function loadReport() {
    const res = await fetch('/api/report');
    const reports = await res.json();
    const tbody = document.querySelector('#reportTable tbody');
    tbody.innerHTML = '';
    reports.forEach(rep => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${rep.id}</td>
            <td>${rep.total.toFixed(2)}</td>
            <td>${new Date(rep.created_at).toLocaleString()}</td>
            <td><button class="btn btn-sm btn-outline-primary" data-id="${rep.id}">تنزيل PDF</button></td>
        `;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-id]').forEach(btn => {
        btn.addEventListener('click', () => downloadPdf(btn.dataset.id));
    });
}

const currentItems = [];

function renderCurrentItems() {
    const tbody = document.querySelector('#currentItemsTable tbody');
    tbody.innerHTML = '';
    currentItems.forEach((it, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${it.description}</td>
            <td>${it.quantity}</td>
            <td><button class="btn btn-sm btn-danger" data-idx="${idx}">&times;</button></td>
        `;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = parseInt(btn.dataset.idx);
            currentItems.splice(i, 1);
            renderCurrentItems();
        });
    });
}

function addItems() {
    document.querySelectorAll('#itemsList input[type="number"]').forEach(el => {
        const qty = parseFloat(el.value);
        if (qty && qty > 0) {
            const desc = el.closest('.row').querySelector('label').textContent;
            currentItems.push({
                itemId: parseInt(el.dataset.id),
                description: desc,
                quantity: qty
            });
            el.value = '';
        }
    });
    renderCurrentItems();
}

async function loadExistingReport(id) {
    const res = await fetch(`/api/report/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('supervisor').value = data.supervisor || '';
    document.getElementById('policeNumber').value = data.police_report || '';
    document.getElementById('street').value = data.street || '';
    document.getElementById('state').value = data.state || '';
    document.getElementById('location').value = data.location || '';
    document.getElementById('coordinates').value = data.coordinates || '';
    currentItems.length = 0;
    data.items.forEach(it => {
        currentItems.push({ itemId: it.item_id, description: it.description, quantity: it.quantity });
    });
    renderCurrentItems();
}

async function handleSubmit(e) {
    e.preventDefault();
    if (currentItems.length === 0) {
        alert('الرجاء إضافة الأصناف قبل حفظ التقرير');
        return;
    }
    const payload = currentItems.map(it => ({ itemId: it.itemId, quantity: it.quantity }));
    const supervisor = document.getElementById('supervisor').value;
    const police_report = document.getElementById('policeNumber').value;
    const street = document.getElementById('street').value;
    const state = document.getElementById('state').value;
    const location = document.getElementById('location').value;
    const coordinates = document.getElementById('coordinates').value;
    const url = editingId ? `/api/report/${editingId}` : '/api/report';
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            supervisor,
            police_report,
            street,
            state,
            location,
            coordinates,
            items: payload
        })
    });
    if (res.ok) {
        if (editingId) {
            window.location.href = '/doc';
        } else {
            currentItems.length = 0;
            renderCurrentItems();
            document.getElementById('reportForm').reset();
            loadItems(document.getElementById('categorySelect').value);
            loadReport();
        }
    } else {
        alert('فشل حفظ التقرير');
    }
}

function discardReport() {
    currentItems.length = 0;
    renderCurrentItems();
    document.getElementById('reportForm').reset();
    loadItems(document.getElementById('categorySelect').value);
}

let geoWatchId = null;

function getCoords() {
    const coordsInput = document.getElementById('coordinates');
    const accuracyEl = document.getElementById('accuracyCounter');
    const olc = new OpenLocationCode();
    if (!navigator.geolocation) {
        alert('المتصفح لا يدعم تحديد الموقع');
        return;
    }
    if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
    }
    accuracyEl.textContent = '...';
    geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const acc = pos.coords.accuracy;
            accuracyEl.textContent = `الدقة ${acc.toFixed(1)}م`;
            if (acc <= 5) {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                const code = olc.encode(lat, lon);
                coordsInput.value = code;
                accuracyEl.textContent = '';
                navigator.geolocation.clearWatch(geoWatchId);
                geoWatchId = null;
            }
        },
        () => {
            alert('فشل الحصول على الإحداثيات');
            accuracyEl.textContent = '';
            if (geoWatchId !== null) {
                navigator.geolocation.clearWatch(geoWatchId);
                geoWatchId = null;
            }
        },
        { enableHighAccuracy: true }
    );
}

async function downloadPdf(id) {
    const res = await fetch(`/api/report/${id}`);
    const data = await res.json();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fontRes = await fetch('/amiri.ttf');
    const fontBuf = await fontRes.arrayBuffer();
    const base64 = bufferToBase64(fontBuf);
    doc.addFileToVFS('amiri.ttf', base64);
    doc.addFont('amiri.ttf', 'Amiri', 'normal');
    doc.setFont('Amiri');
    try {
        const logoRes = await fetch('/logo.png');
        const logoBuf = await logoRes.arrayBuffer();
        const logoBase64 = bufferToBase64(logoBuf);
        doc.addImage('data:image/png;base64,' + logoBase64, 'PNG', 160, 10, 30, 30);
    } catch (e) {
        console.warn('logo missing or failed to load');
    }
    doc.setFontSize(16);
    doc.text('إستمارة تقييم أضرار', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    const headerRows = [
        ['رقم التقرير', String(id)],
        ['المشرف / المهندس', data.supervisor || ''],
        ['رقم مرجع الشرطة', data.police_report || ''],
        ['اسم الطريق', data.street || ''],
        ['الولاية', data.state || ''],
        ['وصف موقع الحادث', data.location || ''],
        ['الإحداثيات', data.coordinates || '']
    ];
    const startX = 10;
    const labelW = 60;
    const valueW = 130;
    let y = 45;
    headerRows.forEach(([label, value]) => {
        doc.rect(startX, y, valueW, 8);
        doc.rect(startX + valueW, y, labelW, 8);
        doc.text(value, startX + valueW - 2, y + 5, { align: 'right' });
        doc.text(label, startX + valueW + labelW - 2, y + 5, { align: 'right' });
        y += 8;
    });
    y += 5;
    doc.setLineWidth(0.8);
    doc.line(10, y, 200, y);
    doc.setLineWidth(0.200025);
    y += 5;

    const colWTotal = 50;
    const colWQty = 30;
    const colWCost = 30;
    const colWDesc = 70;
    const tableW = colWTotal + colWQty + colWCost + colWDesc;
    const itemStartX = (doc.internal.pageSize.getWidth() - tableW) / 2;

    function drawItemRow(desc, cost, qty, total) {
        doc.rect(itemStartX, y, colWTotal, 8);
        doc.rect(itemStartX + colWTotal, y, colWQty, 8);
        doc.rect(itemStartX + colWTotal + colWQty, y, colWCost, 8);
        doc.rect(itemStartX + colWTotal + colWQty + colWCost, y, colWDesc, 8);
        doc.text(total, itemStartX + colWTotal - 2, y + 5, { align: 'right' });
        doc.text(qty, itemStartX + colWTotal + colWQty - 2, y + 5, { align: 'right' });
        doc.text(cost, itemStartX + colWTotal + colWQty + colWCost - 2, y + 5, { align: 'right' });
        doc.text(desc, itemStartX + colWTotal + colWQty + colWCost + colWDesc - 2, y + 5, { align: 'right' });
        y += 8;
    }

    drawItemRow('الوصف', 'التكلفة', 'الكمية', 'المجموع');
    data.items.forEach(it => {
        drawItemRow(it.description, it.cost.toFixed(2), String(it.quantity), it.line_total.toFixed(2));
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
    });
    y += 8;
    doc.text(`المجموع الكلي: OMR${data.total.toFixed(2)}`, 200 - 10, y, { align: 'right' });

    // Add approval text and signature at the bottom center if available
    try {
        const sigRes = await fetch('/sig.png');
        if (sigRes.ok) {
            const sigBuf = await sigRes.arrayBuffer();
            const sigBase64 = bufferToBase64(sigBuf);
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const sigW = 30;
            const sigH = 15;
            const centerX = pageWidth / 2;
            const sigX = centerX - sigW / 2;
            const sigY = pageHeight - sigH - 10;

            // Engineer title above the signature with a little space
            const textY = sigY - 8; // space between text and line
            doc.text('المهندس / مشرف الصيانة', centerX, textY, { align: 'center' });

            // Thick line for signing
            const lineY = sigY - 3;
            doc.setLineWidth(1);
            doc.line(centerX - sigW / 2, lineY, centerX + sigW / 2, lineY);
            doc.setLineWidth(0.200025);

            // Signature image
            doc.addImage('data:image/png;base64,' + sigBase64, 'PNG', sigX, sigY, sigW, sigH);
        }
    } catch (e) {
        console.warn('signature missing or failed to load');
    }

    doc.save(`report-${id}.pdf`);
}

window.addEventListener('DOMContentLoaded', async () => {
    editingId = new URLSearchParams(window.location.search).get('id');
    await loadCategories();
    document.getElementById('categorySelect').addEventListener('change', (e) => {
        loadItems(e.target.value);
    });
    if (editingId) {
        await loadExistingReport(editingId);
        document.querySelector('#reportForm button[type="submit"]').textContent = 'حفظ التعديلات';
    } else {
        loadReport();
    }
    document.getElementById('reportForm').addEventListener('submit', handleSubmit);
    document.getElementById('addItemsBtn').addEventListener('click', addItems);
    document.getElementById('discardBtn').addEventListener('click', discardReport);
    document.getElementById('getCoordsBtn').addEventListener('click', getCoords);
});
