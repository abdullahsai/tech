const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve report page
app.get('/report', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'report.html'));
});

// Initialize SQLite database
const db = new sqlite3.Database('./data.db', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    db.run(
      `CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        unit TEXT NOT NULL,
        cost REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supervisor TEXT,
        police_report TEXT,
        street TEXT,
        state TEXT,
        location TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS report_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        FOREIGN KEY(report_id) REFERENCES reports(id),
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`
    );
  }
});

// Endpoint to add new item
app.post('/api/items', (req, res) => {
  const { category, description, unit, cost } = req.body;
  if (!category || !description || !unit || !cost) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const stmt = db.prepare(
    'INSERT INTO items (category, description, unit, cost) VALUES (?, ?, ?, ?)'
  );
  stmt.run([category, description, unit, cost], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to add item' });
    }
    res.json({ id: this.lastID });
  });
});

// Endpoint to list distinct item categories
app.get('/api/items/categories', (req, res) => {
  db.all('SELECT DISTINCT category FROM items ORDER BY category', [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve categories' });
    }
    res.json(rows.map(r => r.category));
  });
});

// Endpoint to get all items for report page (optionally filtered by category)
app.get('/api/items/all', (req, res) => {
  const { category } = req.query;
  const params = [];
  let query = 'SELECT * FROM items';
  if (category) {
    query += ' WHERE category = ?';
    params.push(category);
  }
  query += ' ORDER BY description';
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve items' });
    }
    res.json(rows);
  });
});

// Endpoint to get last 5 items
app.get('/api/items', (req, res) => {
  db.all('SELECT * FROM items ORDER BY created_at DESC LIMIT 5', [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve items' });
    }
    res.json(rows);
  });
});

// Endpoint to add damage report entries
app.post('/api/report', (req, res) => {
  const {
    supervisor,
    police_report,
    street,
    state,
    location,
    items,
  } = req.body; // [{ itemId, quantity }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }

  db.run(
    'INSERT INTO reports (supervisor, police_report, street, state, location) VALUES (?, ?, ?, ?, ?)',
    [supervisor, police_report, street, state, location],
    function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to create report' });
    }
    const reportId = this.lastID;
    const stmt = db.prepare(
      'INSERT INTO report_items (report_id, item_id, quantity) VALUES (?, ?, ?)'
    );
    for (const entry of items) {
      const { itemId, quantity } = entry;
      if (!itemId || !quantity || isNaN(quantity) || quantity <= 0) continue;
      stmt.run(reportId, itemId, quantity);
    }
    stmt.finalize((err2) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ error: 'Failed to save report items' });
      }
      res.json({ reportId });
    });
  });
});

// Endpoint to get last 5 reports with totals
app.get('/api/report', (req, res) => {
  const query = `SELECT r.id, r.created_at,
                        SUM(ri.quantity * i.cost) AS total
                   FROM reports r
                   JOIN report_items ri ON ri.report_id = r.id
                   JOIN items i ON ri.item_id = i.id
                  GROUP BY r.id
                  ORDER BY r.created_at DESC
                  LIMIT 5`;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve reports' });
    }
    res.json(rows);
  });
});

// Endpoint to get detailed info for a single report
app.get('/api/report/:id', (req, res) => {
  const { id } = req.params;
  const infoQuery = `SELECT supervisor, police_report, street, state, location, created_at FROM reports WHERE id = ?`;
  const itemsQuery = `SELECT i.description, i.cost, i.unit, ri.quantity,
                             (ri.quantity * i.cost) AS line_total
                        FROM report_items ri
                        JOIN items i ON ri.item_id = i.id
                       WHERE ri.report_id = ?`;
  db.get(infoQuery, [id], (err, info) => {
    if (err || !info) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve report info' });
    }
    db.all(itemsQuery, [id], (err2, rows) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ error: 'Failed to retrieve report items' });
      }
      const total = rows.reduce((sum, r) => sum + r.line_total, 0);
      res.json({ ...info, items: rows, total });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
