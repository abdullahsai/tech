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
                <label class="form-label">${item.description} ($${item.cost}/${item.unit})</label>
            </div>
            <div class="col-sm-3 col-md-2">
                <input type="number" min="0" step="1" data-id="${item.id}" class="form-control" placeholder="Qty">
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
        tr.innerHTML = `<td>${it.description}</td><td>${it.quantity}</td>`;
        tbody.appendChild(tr);
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
    const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            supervisor,
            police_report,
            street,
            state,
            location,
            items: payload
        })
    });
    if (res.ok) {
        currentItems.length = 0;
        renderCurrentItems();
        document.getElementById('reportForm').reset();
        loadItems(document.getElementById('categorySelect').value);
        loadReport();
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
    if (!navigator.geolocation) {
        alert('المتصفح لا يدعم تحديد الموقع');
        return;
    }
    if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
    }
    accuracyEl.textContent = 'جاري تحديد الدقة...';
    geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const acc = pos.coords.accuracy;
            accuracyEl.textContent = `الدقة ${acc.toFixed(1)}م`;
            if (acc <= 5) {
                const lat = pos.coords.latitude.toFixed(6);
                const lon = pos.coords.longitude.toFixed(6);
                coordsInput.value = `${lat}, ${lon}`;
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
        ['وصف موقع الحادث', data.location || '']
    ];
    const labelW = 60;
    const valueW = 130;
    const headerTableW = labelW + valueW;
    const startXHeader = (210 - headerTableW) / 2;
    let y = 45;
    headerRows.forEach(([label, value]) => {
        doc.rect(startXHeader, y, valueW, 8);
        doc.rect(startXHeader + valueW, y, labelW, 8);
        doc.text(value, startXHeader + valueW - 2, y + 5, { align: 'right' });
        doc.text(label, startXHeader + valueW + labelW - 2, y + 5, { align: 'right' });
        y += 8;
    });
    const maxTableW = Math.max(headerTableW, 180);
    const startXLine = (210 - maxTableW) / 2;
    const lineSpacing = 6;
    y += lineSpacing / 2;
    doc.setLineWidth(0.8);
    doc.line(startXLine, y, startXLine + maxTableW, y);
    doc.setLineWidth(0.2);
    y += lineSpacing / 2;

    const colWTotal = 50;
    const colWQty = 30;
    const colWCost = 30;
    const colWDesc = 70;
    const itemsTableW = colWTotal + colWQty + colWCost + colWDesc;
    const startXItems = (210 - itemsTableW) / 2;

    function drawItemRow(desc, cost, qty, total) {
        doc.rect(startXItems, y, colWTotal, 8);
        doc.rect(startXItems + colWTotal, y, colWQty, 8);
        doc.rect(startXItems + colWTotal + colWQty, y, colWCost, 8);
        doc.rect(startXItems + colWTotal + colWQty + colWCost, y, colWDesc, 8);
        doc.text(total, startXItems + colWTotal - 2, y + 5, { align: 'right' });
        doc.text(qty, startXItems + colWTotal + colWQty - 2, y + 5, { align: 'right' });
        doc.text(cost, startXItems + colWTotal + colWQty + colWCost - 2, y + 5, { align: 'right' });
        doc.text(desc, startXItems + colWTotal + colWQty + colWCost + colWDesc - 2, y + 5, { align: 'right' });
        y += 8;
    }

    drawItemRow('الوصف', 'التكلفة', 'الكمية', 'المجموع');
    data.items.forEach(it => {
        drawItemRow(it.description, `${it.cost.toFixed(2)} OMR`, String(it.quantity), `${it.line_total.toFixed(2)} OMR`);
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
    });
    y += 8;
    doc.text(`المجموع الكلي: ${data.total.toFixed(2)} OMR`, startXItems + itemsTableW - 2, y, { align: 'right' });
    doc.save(`report-${id}.pdf`);
}

window.addEventListener('DOMContentLoaded', () => {
    loadCategories();
    loadReport();
    document.getElementById('categorySelect').addEventListener('change', (e) => {
        loadItems(e.target.value);
    });
    document.getElementById('reportForm').addEventListener('submit', handleSubmit);
    document.getElementById('addItemsBtn').addEventListener('click', addItems);
    document.getElementById('discardBtn').addEventListener('click', discardReport);
    document.getElementById('getCoordsBtn').addEventListener('click', getCoords);
});
