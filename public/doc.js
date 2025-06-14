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
            <td><button class="btn btn-sm btn-outline-primary" data-id="${rep.id}">تنزيل PDF</button></td>
        `;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-id]').forEach(btn => {
        btn.addEventListener('click', () => downloadPdf(btn.dataset.id));
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
        ['المشرف / المهندس', data.supervisor || ''],
        ['رقم مرجع الشرطة', data.police_report || ''],
        ['اسم الطريق', data.street || ''],
        ['الولاية', data.state || ''],
        ['وصف موقع الحادث', data.location || '']
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
    doc.save(`report-${id}.pdf`);
}

window.addEventListener('DOMContentLoaded', loadReports);
