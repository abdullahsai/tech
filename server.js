const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve report page
app.get('/report', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'report.html'));
});

// Serve archive page showing all stored reports
app.get('/doc', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'doc.html'));
});

// Initialize SQLite database in ./data/data.db
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'data.db');
const db = new sqlite3.Database(dbPath, (err) => {
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
        description TEXT,
        unit TEXT,
        cost REAL,
        quantity REAL NOT NULL,
        FOREIGN KEY(report_id) REFERENCES reports(id),
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`
    );

    // Add snapshot columns if database was created with old schema
    db.all('PRAGMA table_info(report_items)', (err, rows) => {
      if (err) return;
      const cols = rows.map(r => r.name);
      if (!cols.includes('description')) {
        db.run('ALTER TABLE report_items ADD COLUMN description TEXT');
      }
      if (!cols.includes('unit')) {
        db.run('ALTER TABLE report_items ADD COLUMN unit TEXT');
      }
      if (!cols.includes('cost')) {
        db.run('ALTER TABLE report_items ADD COLUMN cost REAL');
      }
    });
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

// Endpoint to update an existing item
app.put('/api/items/:id', (req, res) => {
  const { category, description, unit, cost } = req.body;
  if (!category || !description || !unit || !cost) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  db.run(
    'UPDATE items SET category = ?, description = ?, unit = ?, cost = ? WHERE id = ?',
    [category, description, unit, cost, req.params.id],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to update item' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }
      res.json({ success: true });
    }
  );
});

// Endpoint to delete an item
app.delete('/api/items/:id', (req, res) => {
  db.run('DELETE FROM items WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to delete item' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ success: true });
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
        'INSERT INTO report_items (report_id, item_id, description, unit, cost, quantity) VALUES (?, ?, ?, ?, ?, ?)'
      );
      let pending = 0;

      function done() {
        pending--;
        if (pending === 0) finalize();
      }

      function finalize() {
        stmt.finalize((err2) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: 'Failed to save report items' });
          }
          res.json({ reportId });
        });
      }

      for (const entry of items) {
        const { itemId, quantity } = entry;
        if (!itemId || !quantity || isNaN(quantity) || quantity <= 0) continue;
        pending++;
        db.get(
          'SELECT description, unit, cost FROM items WHERE id = ?',
          [itemId],
          (err2, itemRow) => {
            if (!err2 && itemRow) {
              stmt.run(
                reportId,
                itemId,
                itemRow.description,
                itemRow.unit,
                itemRow.cost,
                quantity,
                done
              );
            } else {
              done();
            }
          }
        );
      }
      if (pending === 0) finalize();
    }
  );
});

// Endpoint to get last 5 reports with totals
app.get('/api/report', (req, res) => {
  const query = `SELECT r.id, r.created_at,
                        SUM(ri.quantity * ri.cost) AS total
                   FROM reports r
                   JOIN report_items ri ON ri.report_id = r.id
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

// Endpoint to get all reports with totals
app.get('/api/report/all', (req, res) => {
  const query = `SELECT r.id, r.created_at,
                        SUM(ri.quantity * ri.cost) AS total
                   FROM reports r
                   JOIN report_items ri ON ri.report_id = r.id
                  GROUP BY r.id
                  ORDER BY r.created_at DESC`;
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
  const itemsQuery = `SELECT description, cost, unit, quantity,
                             (quantity * cost) AS line_total
                        FROM report_items
                       WHERE report_id = ?`;
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
