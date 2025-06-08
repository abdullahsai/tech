async function fetchItems() {
    const res = await fetch('/api/items');
    const items = await res.json();
    const tbody = document.querySelector('#itemsTable tbody');
    tbody.innerHTML = '';
    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.category}</td>
            <td>${item.description}</td>
            <td>${item.unit}</td>
            <td>${item.cost}</td>
            <td>${new Date(item.created_at).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
        category: form.category.value,
        description: form.description.value,
        unit: form.unit.value,
        cost: form.cost.value
    };
    const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (res.ok) {
        form.reset();
        fetchItems();
    } else {
        alert('فشل إضافة العنصر');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('itemForm').addEventListener('submit', handleSubmit);
    fetchItems();
});
