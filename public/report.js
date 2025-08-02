let editingId = null;

let accuracyThreshold = 5;

const MAX_PHOTOS = 4;
const photoFiles = [];
const existingPhotos = [];

async function loadAccuracySetting() {
    try {
        const res = await fetch('/api/settings/accuracyThreshold');
        if (res.ok) {
            const data = await res.json();
            const val = parseFloat(data.value);
            if (!isNaN(val)) accuracyThreshold = val;
        }
    } catch (e) {
        console.warn('failed to load accuracy setting');
    }
}

function bufferToBase64(buf) {
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function wrapText(text, maxWidth, doc) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${doc.getFontSize()}px Amiri`;
    const words = text.split(' ');
    const lines = [];
    let line = words[0] || '';
    for (let i = 1; i < words.length; i++) {
        const testLine = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(testLine).width <= maxWidth) {
            line = testLine;
        } else {
            if (line) lines.push(line);
            line = words[i];
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

async function compressImage(file) {
    if (file.size <= 1024 * 1024) {
        return file;
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
            let w = img.width;
            let h = img.height;
            const maxDim = 1280;
            const scale = Math.min(1, maxDim / Math.max(w, h));
            w = Math.round(w * scale);
            h = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            let quality = 0.8;
            let blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
            while (blob.size > 1024 * 1024 && quality > 0.5) {
                quality -= 0.1;
                blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
            }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        };
        img.onerror = () => reject(new Error('img load error'));
        img.src = URL.createObjectURL(file);
    });
}

function renderPhotoPreview() {
    const container = document.getElementById('photoPreview');
    container.innerHTML = '';
    existingPhotos.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = 'position-relative';
        const img = document.createElement('img');
        img.src = p.url;
        img.className = 'img-thumbnail';
        img.style.width = '100px';
        img.style.height = '100px';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-danger position-absolute top-0 end-0';
        btn.innerHTML = '&times;';
        btn.addEventListener('click', async () => {
            if (editingId) {
                await fetch(`/api/report/${editingId}/photos/${encodeURIComponent(p.name)}`, { method: 'DELETE' });
            }
            existingPhotos.splice(idx, 1);
            renderPhotoPreview();
        });
        div.appendChild(img);
        div.appendChild(btn);
        container.appendChild(div);
    });
    photoFiles.forEach((file, idx) => {
        const url = URL.createObjectURL(file);
        const div = document.createElement('div');
        div.className = 'position-relative';
        const img = document.createElement('img');
        img.src = url;
        img.className = 'img-thumbnail';
        img.style.width = '100px';
        img.style.height = '100px';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-danger position-absolute top-0 end-0';
        btn.innerHTML = '&times;';
        btn.addEventListener('click', () => {
            photoFiles.splice(idx, 1);
            renderPhotoPreview();
        });
        div.appendChild(img);
        div.appendChild(btn);
        container.appendChild(div);
    });
}

async function handlePhotoInput(e) {
    const files = Array.from(e.target.files).slice(0, MAX_PHOTOS - photoFiles.length - existingPhotos.length);
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
            const compressed = await compressImage(file);
            photoFiles.push(compressed);
        } catch {}
    }
    e.target.value = '';
    renderPhotoPreview();
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
    document.getElementById('notes').value = data.notes || '';
    currentItems.length = 0;
    data.items.forEach(it => {
        currentItems.push({ itemId: it.item_id, description: it.description, quantity: it.quantity });
    });
    renderCurrentItems();
    try {
        const pRes = await fetch(`/api/report/${id}/photos`);
        if (pRes.ok) {
            const urls = await pRes.json();
            existingPhotos.length = 0;
            urls.forEach(u => {
                const name = u.split('/').pop();
                existingPhotos.push({ url: u, name });
            });
            renderPhotoPreview();
        }
    } catch (e) {
        console.warn('failed to load photos');
    }
}

const requiredFieldIds = ['supervisor', 'policeNumber', 'street', 'state', 'location'];

function validateRequiredFields() {
    let firstInvalid = null;
    requiredFieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!el.value.trim()) {
            el.classList.add('is-invalid');
            if (!firstInvalid) firstInvalid = el;
        } else {
            el.classList.remove('is-invalid');
        }
    });
    if (firstInvalid) {
        firstInvalid.focus();
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
    }
    return true;
}

async function handleSubmit(e) {
    e.preventDefault();
    if (!validateRequiredFields()) {
        return;
    }
    const payload = currentItems.map(it => ({ itemId: it.itemId, quantity: it.quantity }));
    const supervisor = document.getElementById('supervisor').value;
    const police_report = document.getElementById('policeNumber').value;
    const street = document.getElementById('street').value;
    const state = document.getElementById('state').value;
    const location = document.getElementById('location').value;
    const coordinates = document.getElementById('coordinates').value;
    const notes = document.getElementById('notes').value;
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
            notes,
            items: payload
        })
    });
    if (res.ok) {
        const data = await res.json();
        const uploadId = editingId ? editingId : data.reportId;
        if (uploadId && photoFiles.length > 0) {
            const fd = new FormData();
            photoFiles.forEach(f => fd.append('images', f, f.name));
            await fetch(`/api/report/${uploadId}/photos`, { method: 'POST', body: fd });
        }
        if (editingId) {
            window.location.href = '/doc';
        } else {
            currentItems.length = 0;
            renderCurrentItems();
            photoFiles.length = 0;
            renderPhotoPreview();
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
            if (acc <= accuracyThreshold) {
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
        ['التاريخ', new Date(data.created_at).toLocaleDateString('en-GB')],
        ['المشرف / المهندس', data.supervisor || ''],
        ['رقم مرجع الشرطة', data.police_report || ''],
        ['اسم الطريق', data.street || ''],
        ['الولاية', data.state || ''],
        ['وصف موقع الحادث', data.location || ''],
        ['الإحداثيات', data.coordinates || ''],
        ['الملاحظات', data.notes || '']
    ];
    const startX = 10;
    const labelW = 60;
    const valueW = 130;
    const verticalPad = 0.5;
    const horizontalPad = 3;
    let y = 45;
    const lineH = 6;
    headerRows.forEach(([label, value]) => {
        const labelLines = wrapText(label, labelW - horizontalPad * 2, doc);
        const valueLines = wrapText(value, valueW - horizontalPad * 2, doc);
        const lines = Math.max(labelLines.length, valueLines.length);
        const rowH = lines * lineH + verticalPad * 2;
        doc.rect(startX, y, valueW, rowH);
        doc.rect(startX + valueW, y, labelW, rowH);
        labelLines.forEach((ln, idx) => {
            const lineY = y + rowH / 2 + (idx - (labelLines.length - 1) / 2) * lineH;
            doc.text(ln, startX + valueW + labelW - horizontalPad, lineY, { align: 'right', baseline: 'middle' });
        });
        valueLines.forEach((ln, idx) => {
            const lineY = y + rowH / 2 + (idx - (valueLines.length - 1) / 2) * lineH;
            doc.text(ln, startX + valueW - horizontalPad, lineY, { align: 'right', baseline: 'middle' });
        });
        y += rowH;
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
        const descLines = wrapText(desc, colWDesc - horizontalPad * 2, doc);
        const lines = Math.max(descLines.length, 1);
        const rowH = lines * lineH + verticalPad * 2;
        doc.rect(itemStartX, y, colWTotal, rowH);
        doc.rect(itemStartX + colWTotal, y, colWQty, rowH);
        doc.rect(itemStartX + colWTotal + colWQty, y, colWCost, rowH);
        doc.rect(itemStartX + colWTotal + colWQty + colWCost, y, colWDesc, rowH);
        const baseY = y + rowH / 2;
        doc.text(total, itemStartX + colWTotal - horizontalPad, baseY, { align: 'right', baseline: 'middle' });
        doc.text(qty, itemStartX + colWTotal + colWQty - horizontalPad, baseY, { align: 'right', baseline: 'middle' });
        doc.text(cost, itemStartX + colWTotal + colWQty + colWCost - horizontalPad, baseY, { align: 'right', baseline: 'middle' });
        descLines.forEach((ln, idx) => {
            const lineY = y + rowH / 2 + (idx - (descLines.length - 1) / 2) * lineH;
            doc.text(ln, itemStartX + colWTotal + colWQty + colWCost + colWDesc - horizontalPad, lineY, { align: 'right', baseline: 'middle' });
        });
        y += rowH;
    }

    if (data.items.length === 0) {
        doc.text('لا يوجد أضرار', 105, y + 4, { align: 'center' });
        y += 8;
    } else {
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
    }

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
    await loadAccuracySetting();
    editingId = new URLSearchParams(window.location.search).get('id');
    await loadCategories();
    document.getElementById('categorySelect').addEventListener('change', (e) => {
        loadItems(e.target.value);
    });
    if (editingId) {
        await loadExistingReport(editingId);
        document.querySelector('#reportForm button[type="submit"]').textContent = 'حفظ التعديلات';
        // Allow manual editing of coordinates when updating a report
        const coordsInput = document.getElementById('coordinates');
        if (coordsInput) {
            coordsInput.removeAttribute('readonly');
        }
    } else {
        loadReport();
    }
    document.getElementById('reportForm').addEventListener('submit', handleSubmit);
    document.getElementById('addItemsBtn').addEventListener('click', addItems);
    document.getElementById('discardBtn').addEventListener('click', discardReport);
    document.getElementById('getCoordsBtn').addEventListener('click', getCoords);
    const photoInput = document.getElementById('photoInput');
    if (photoInput) {
        photoInput.addEventListener('change', handlePhotoInput);
    }

    requiredFieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                if (el.value.trim()) {
                    el.classList.remove('is-invalid');
                }
            });
        }
    });
});
