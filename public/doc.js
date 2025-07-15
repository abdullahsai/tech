function bufferToBase64(buf) {
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function loadReports() {
    const res = await fetch('/api/report/all');
    const reports = await res.json();
    const tbody = document.querySelector('#reportTable tbody');
    tbody.innerHTML = '';
    reports.forEach(rep => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${rep.id}</td>
            <td>${rep.total.toFixed(2)}</td>
            <td>${new Date(rep.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary download-btn" data-id="${rep.id}">تنزيل PDF</button>
                <button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${rep.id}"><i class="bi bi-pencil"></i></button>
                <span class="photo-links ms-1" data-id="${rep.id}"></span>
            </td>
        `;
        tbody.appendChild(tr);
        const span = tr.querySelector('span.photo-links');
        loadPhotoLinks(rep.id, span);
    });
    tbody.querySelectorAll('button.download-btn').forEach(btn => {
        btn.addEventListener('click', () => downloadPdf(btn.dataset.id));
    });
    tbody.querySelectorAll('button.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = `/report?id=${btn.dataset.id}`;
        });
    });
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
    let y = 45;
    const lineH = 6;
    headerRows.forEach(([label, value]) => {
        const labelLines = doc.splitTextToSize(label, labelW - 4);
        const valueLines = doc.splitTextToSize(value, valueW - 4);
        const lines = Math.max(labelLines.length, valueLines.length);
        const rowH = lines * lineH;
        doc.rect(startX, y, valueW, rowH);
        doc.rect(startX + valueW, y, labelW, rowH);
        labelLines.forEach((ln, idx) => {
            doc.text(ln, startX + valueW + labelW - 2, y + 5 + idx * lineH, { align: 'right' });
        });
        valueLines.forEach((ln, idx) => {
            doc.text(ln, startX + valueW - 2, y + 5 + idx * lineH, { align: 'right' });
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
        const descLines = doc.splitTextToSize(desc, colWDesc - 4);
        const lines = Math.max(descLines.length, 1);
        const rowH = lines * lineH;
        const baseY = y + rowH / 2 + 2;
        doc.rect(itemStartX, y, colWTotal, rowH);
        doc.rect(itemStartX + colWTotal, y, colWQty, rowH);
        doc.rect(itemStartX + colWTotal + colWQty, y, colWCost, rowH);
        doc.rect(itemStartX + colWTotal + colWQty + colWCost, y, colWDesc, rowH);
        doc.text(total, itemStartX + colWTotal - 2, baseY, { align: 'right' });
        doc.text(qty, itemStartX + colWTotal + colWQty - 2, baseY, { align: 'right' });
        doc.text(cost, itemStartX + colWTotal + colWQty + colWCost - 2, baseY, { align: 'right' });
        descLines.forEach((ln, idx) => {
            doc.text(ln, itemStartX + colWTotal + colWQty + colWCost + colWDesc - 2, y + 5 + idx * lineH, { align: 'right' });
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

    // Add supervisor title, signing line and signature centered at the bottom
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

            // Text above the signature
            const textY = sigY - 8;
            doc.text('المشرف / المهندس', centerX, textY, { align: 'center' });

            // Thick signing line
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

async function loadPhotoLinks(id, container) {
    try {
        const res = await fetch(`/api/report/${id}/photos`);
        if (!res.ok) return;
        const urls = await res.json();
        urls.forEach((url, idx) => {
            const a = document.createElement('a');
            a.href = url;
            a.className = 'btn btn-sm btn-outline-secondary ms-1';
            a.textContent = `صورة${idx + 1}`;
            a.target = '_blank';
            a.download = '';
            container.appendChild(a);
        });
    } catch (e) {
        console.warn('failed to load photos');
    }
}

window.addEventListener('DOMContentLoaded', loadReports);
