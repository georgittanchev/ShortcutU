// Load a .env file next to this script if one exists (no extra dependency).
const path = require('path');
const fs = require('fs');
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch (e) {
  // No .env file: use the real environment.
}

const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const NodeCache = require('node-cache');
const http = require('http');
const https = require('https');

// All configuration comes from the environment (see .env.example).
// JWT_SECRET is required: a hard-coded secret lets anyone who reads the
// source forge a login token.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be set to a random string of at least 32 characters.');
  process.exit(1);
}

const app = express();
// The extension sends a Bearer token, not cookies, so credentials are not
// needed. CORS_ORIGIN can limit which origins may call the API.
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '1mb' }));

// Root route for connection testing
app.get('/', (req, res) => {
  res.json({ message: 'Shortcuts API is running' });
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  connectionLimit: 10
});

// Per-process cache. Run a single instance (see ecosystem.config.js): with
// several cluster workers, an edit only clears the cache of the worker that
// handled it, and the others keep serving the old shortcuts for up to 24 h.
const shortcutCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) {
    return res.sendStatus(401);
  }
  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
    if (err) {
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const results = await withTimeout(new Promise((resolve, reject) => {
      pool.query('SELECT id, username, password FROM users WHERE username = ?', [username], (err, rows) => {
        if (err) return reject(new Error('Database error'));
        resolve(rows);
      });
    }), 5000, 'Database timeout');

    // Same answer for an unknown user and a wrong password, so the API does
    // not reveal which usernames exist.
    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = results[0];
    const isValidPassword = await withTimeout(
      bcrypt.compare(password, user.password), 5000, 'Password validation timeout'
    );
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '24h'
    });

    res.json({ token, user_id: user.id, message: 'Login successful' });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign-up from the extension's registration form. Off unless
// ALLOW_REGISTRATION=true, so a private server doesn't accept strangers.
app.post('/register', async (req, res) => {
  if (process.env.ALLOW_REGISTRATION !== 'true') {
    return res.status(403).json({ error: 'Registration is disabled on this server' });
  }
  try {
    const { username, email, password } = req.body || {};
    if (typeof username !== 'string' || !/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
      return res.status(400).json({ error: 'Username: 3-50 letters, digits, _ . -' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await new Promise((resolve, reject) => {
      pool.query(
        'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
        [username, hash, email],
        (err, r) => (err ? reject(err) : resolve(r))
      );
    });

    const token = jwt.sign({ id: result.insertId, username }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '24h'
    });
    res.json({ token, user_id: result.insertId, message: 'Registration successful' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already registered' });
    }
    console.error('Registration error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Every shortcut route acts on the logged-in user taken from the verified
// token. The user_id the extension still sends is ignored: trusting it let
// any logged-in user read, change or delete another user's shortcuts.

app.post('/addShortcut', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const { shortcut, expansion } = req.body || {};
  if (typeof shortcut !== 'string' || typeof expansion !== 'string' || !shortcut) {
    return res.status(400).json({ error: 'shortcut and expansion are required' });
  }
  const query = 'INSERT INTO shortcuts (user_id, shortcut, expansion) VALUES (?, ?, ?)';
  pool.query(query, [user_id, shortcut, expansion], (err, result) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    shortcutCache.del(`shortcuts_${user_id}`);
    res.json({ message: 'Shortcut added successfully', id: result.insertId });
  });
});

// :user_id stays in the route for compatibility with the extension.
app.get('/getShortcuts/:user_id', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const cacheKey = `shortcuts_${user_id}`;
  const cachedShortcuts = shortcutCache.get(cacheKey);
  if (cachedShortcuts) {
    return res.json(cachedShortcuts);
  }
  const query = 'SELECT id, shortcut, expansion FROM shortcuts WHERE user_id = ?';
  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    shortcutCache.set(cacheKey, results);
    res.json(results);
  });
});

// PUT/DELETE are kept for API clients, but the extension uses the POST aliases:
// the OWASP Core Rule Set (default ModSecurity on CyberPanel/cPanel hosts) only
// allows GET, HEAD, POST and OPTIONS and answers PUT/DELETE with a 403.
function updateShortcut(req, res) {
  const user_id = req.user.id;
  const { id, shortcut, expansion } = req.body || {};
  if (!id || typeof shortcut !== 'string' || typeof expansion !== 'string' || !shortcut) {
    return res.status(400).json({ error: 'id, shortcut and expansion are required' });
  }
  const query = 'UPDATE shortcuts SET shortcut = ?, expansion = ? WHERE id = ? AND user_id = ?';
  pool.query(query, [shortcut, expansion, id, user_id], (err, result) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Shortcut not found' });
    }
    shortcutCache.del(`shortcuts_${user_id}`);
    res.json({ message: 'Shortcut updated successfully' });
  });
}
app.put('/updateShortcut', authenticateToken, updateShortcut);
app.post('/updateShortcut', authenticateToken, updateShortcut);

function deleteShortcut(req, res) {
  const { id } = req.params;
  const user_id = req.user.id;
  const query = 'DELETE FROM shortcuts WHERE id = ? AND user_id = ?';
  pool.query(query, [id, user_id], (err, result) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Shortcut not found' });
    }
    shortcutCache.del(`shortcuts_${user_id}`);
    res.json({ message: 'Shortcut deleted successfully' });
  });
}
app.delete('/deleteShortcut/:id', authenticateToken, deleteShortcut);
app.post('/deleteShortcut/:id', authenticateToken, deleteShortcut);

app.post('/verifyToken', authenticateToken, (req, res) => {
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3222;

// HTTPS directly when TLS_KEY and TLS_CERT are set; otherwise plain HTTP on
// HOST (127.0.0.1 by default) behind a reverse proxy that terminates TLS,
// such as the included .htaccess.
if (process.env.TLS_KEY && process.env.TLS_CERT) {
  const options = {
    key: fs.readFileSync(process.env.TLS_KEY),
    cert: fs.readFileSync(process.env.TLS_CERT)
  };
  if (process.env.TLS_CA) {
    options.ca = process.env.TLS_CA.split(',').map((f) => fs.readFileSync(f.trim()));
  }
  https.createServer(options, app).listen(PORT, () => {
    console.log(`HTTPS server running on port ${PORT}`);
  });
} else {
  const HOST = process.env.HOST || '127.0.0.1';
  http.createServer(app).listen(PORT, HOST, () => {
    console.log(`HTTP server running on ${HOST}:${PORT}`);
  });
}

// Check the database connection at startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
    return;
  }
  console.log('Connected to the database');
  connection.release();
});
