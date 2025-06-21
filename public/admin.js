document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('fileInput');
    if (!input.files.length) return;
    const text = await input.files[0].text();
    const items = text.split(/\r?\n/).filter(Boolean).map(line => {
        const parts = line.split(':');
        if (parts.length < 4) return null;
        const [category, description, unit, cost] = parts.map(p => p.trim());
        return { category, description, unit, cost };
    }).filter(Boolean);
    const res = await fetch('/api/items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
    });
    const result = document.getElementById('uploadResult');
    if (res.ok) {
        result.textContent = 'تمت الإضافة بنجاح';
        input.value = '';
    } else {
        result.textContent = 'فشل رفع الملف';
    }
});
