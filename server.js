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

// Serve admin page for bulk item upload
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Initialize SQLite database in ./data/data.db
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'data.db');
const db = new sqlite3.Database(dbPath, err => {
  if (err) {
    console.error('Error opening database', err.message);
    return;
  }

  // Ensure sequential execution of setup queries to avoid race conditions
  db.serialize(() => {
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
        coordinates TEXT,
        notes TEXT,
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

    // Table for storing simple key/value settings
    db.run(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`
    );

    // Ensure accuracy setting exists with a default of 5 meters
    db.get(
      'SELECT value FROM settings WHERE key = ?',
      ['accuracyThreshold'],
      (err, row) => {
        if (err) return;
        if (!row) {
          db.run(
            'INSERT INTO settings (key, value) VALUES (?, ?)',
            ['accuracyThreshold', '5']
          );
        }
      }
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

    // Add coordinates column to reports if missing
    db.all('PRAGMA table_info(reports)', (err, rows) => {
      if (err) return;
      const cols = rows.map(r => r.name);
      if (!cols.includes('coordinates')) {
        db.run('ALTER TABLE reports ADD COLUMN coordinates TEXT');
      }
      if (!cols.includes('notes')) {
        db.run('ALTER TABLE reports ADD COLUMN notes TEXT');
      }
    });
  });
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

// Endpoint to add many items at once
app.post('/api/items/bulk', (req, res) => {
  const { items } = req.body; // [{ category, description, unit, cost }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }
  const stmt = db.prepare(
    'INSERT INTO items (category, description, unit, cost) VALUES (?, ?, ?, ?)'
  );
  for (const it of items) {
    if (!it.category || !it.description || !it.unit || !it.cost) continue;
    stmt.run([it.category, it.description, it.unit, it.cost]);
  }
  stmt.finalize(err => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to save items' });
    }
    res.json({ success: true });
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

// Endpoint to list distinct item categories preserving insertion order
app.get('/api/items/categories', (req, res) => {
  // order by first appearance using MIN(id) rather than alphabetical
  db.all('SELECT category FROM items GROUP BY category ORDER BY MIN(id)', [], (err, rows) => {
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
  // Preserve insertion order instead of alphabetical
  query += ' ORDER BY id';
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve items' });
    }
    res.json(rows);
  });
});

// Endpoint to retrieve a setting by key
app.get('/api/settings/:key', (req, res) => {
  const { key } = req.params;
  db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve setting' });
    }
    res.json({ value: row ? row.value : null });
  });
});

// Endpoint to update or create a setting
app.post('/api/settings/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (typeof value === 'undefined') {
    return res.status(400).json({ error: 'value is required' });
  }
  db.run(
    'REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, String(value)],
    err => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to save setting' });
      }
      res.json({ success: true });
    }
  );
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
    coordinates,
    notes,
    items,
  } = req.body; // [{ itemId, quantity }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }

  db.run(
    'INSERT INTO reports (supervisor, police_report, street, state, location, coordinates, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [supervisor, police_report, street, state, location, coordinates, notes],
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
  const infoQuery = `SELECT supervisor, police_report, street, state, location, coordinates, notes, created_at FROM reports WHERE id = ?`;
  const itemsQuery = `SELECT item_id, description, cost, unit, quantity,
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

// Endpoint to update a report
app.put('/api/report/:id', (req, res) => {
  const reportId = req.params.id;
  const {
    supervisor,
    police_report,
    street,
    state,
    location,
    coordinates,
    notes,
    items,
  } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }

  db.serialize(() => {
    db.run(
      'UPDATE reports SET supervisor = ?, police_report = ?, street = ?, state = ?, location = ?, coordinates = ?, notes = ? WHERE id = ?',
      [supervisor, police_report, street, state, location, coordinates, notes, reportId],
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to update report' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Report not found' });
        }
        db.run('DELETE FROM report_items WHERE report_id = ?', [reportId], err2 => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: 'Failed to update report items' });
          }
          const stmt = db.prepare(
            'INSERT INTO report_items (report_id, item_id, description, unit, cost, quantity) VALUES (?, ?, ?, ?, ?, ?)'
          );
          let pending = 0;

          function done() {
            pending--;
            if (pending === 0) finalize();
          }

          function finalize() {
            stmt.finalize(err3 => {
              if (err3) {
                console.error(err3);
                return res.status(500).json({ error: 'Failed to save report items' });
              }
              res.json({ success: true });
            });
          }

          for (const entry of items) {
            const { itemId, quantity } = entry;
            if (!itemId || !quantity || isNaN(quantity) || quantity <= 0) continue;
            pending++;
            db.get(
              'SELECT description, unit, cost FROM items WHERE id = ?',
              [itemId],
              (err4, itemRow) => {
                if (!err4 && itemRow) {
                  stmt.run(reportId, itemId, itemRow.description, itemRow.unit, itemRow.cost, quantity, done);
                } else {
                  done();
                }
              }
            );
          }
          if (pending === 0) finalize();
        });
      }
    );
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
