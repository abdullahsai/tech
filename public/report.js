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
    let y = 45;
    doc.text(`رقم التقرير: ${id}`, 200 - 10, y, { align: 'right' });
    y += 6;
    doc.text(`المشرف / المهندس: ${data.supervisor || ''}`, 200 - 10, y, { align: 'right' });
    y += 6;
    doc.text(`رقم مرجع الشرطة: ${data.police_report || ''}`, 200 - 10, y, { align: 'right' });
    y += 6;
    doc.text(`اسم الطريق: ${data.street || ''}`, 200 - 10, y, { align: 'right' });
    y += 6;
    doc.text(`الولاية: ${data.state || ''}`, 200 - 10, y, { align: 'right' });
    y += 6;
    doc.text(`وصف موقع الحادث: ${data.location || ''}`, 200 - 10, y, { align: 'right' });
    y += 8;
    doc.line(10, y, 200, y);
    y += 6;
    doc.text('الوصف', 190, y, { align: 'right' });
    doc.text('التكلفة', 120, y, { align: 'right' });
    doc.text('الكمية', 90, y, { align: 'right' });
    doc.text('المجموع', 60, y, { align: 'right' });
    y += 6;
    data.items.forEach(it => {
        doc.text(it.description, 190, y, { align: 'right' });
        doc.text(it.cost.toFixed(2), 120, y, { align: 'right' });
        doc.text(String(it.quantity), 90, y, { align: 'right' });
        doc.text(it.line_total.toFixed(2), 60, y, { align: 'right' });
        y += 6;
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
    });
    y += 6;
    doc.text(`المجموع الكلي: $${data.total.toFixed(2)}`, 200 - 10, y, { align: 'right' });
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
});
