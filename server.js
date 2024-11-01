const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const NodeCache = require('node-cache');
const https = require('https');
const fs = require('fs');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

const JWT_SECRET = 'BJH03C89x2BNJ3Ie'; // Replace with a secure, randomly generated key

const pool = mysql.createPool({
  host: 'localhost',
  user: 'advokati_shortcuts',
  password: 'advokati_shortcuts',
  database: 'advokati_shortcuts',
  connectionLimit: 10
});

const shortcutCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 }); // Cache for 24 hours, check every hour

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) {
    console.log('No token provided');
    return res.sendStatus(401);
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('Token verification failed:', err);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

app.post('/login', (req, res) => {
  console.log('Login request received:', req.body);
  const { username, password } = req.body;
  if (!username || !password) {
    console.log('Missing username or password');
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const query = 'SELECT * FROM users WHERE username = ?';
  pool.query(query, [username], async (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    console.log('Query results:', results);
    if (results.length === 0) {
      console.log('User not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = results[0];
    try {
      console.log('Stored hashed password:', user.password);
      const validPassword = await bcrypt.compare(password, user.password);
      console.log('Password validation result:', validPassword);
      if (!validPassword) {
        console.log('Invalid password');
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign({ id: user.id }, JWT_SECRET);
      console.log('Login successful, token generated:', token);
      res.json({ token });
    } catch (bcryptError) {
      console.error('Bcrypt error:', bcryptError);
      res.status(500).json({ error: 'Error validating password' });
    }
  });
});

app.post('/addShortcut', authenticateToken, (req, res) => {
  const { user_id, shortcut, expansion } = req.body;
  console.log('Received addShortcut request:', { user_id, shortcut, expansion });
  const query = 'INSERT INTO shortcuts (user_id, shortcut, expansion) VALUES (?, ?, ?)';
  pool.query(query, [user_id, shortcut, expansion], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
    } else {
      console.log('Shortcut added successfully');
      shortcutCache.del(`shortcuts_${user_id}`); // Invalidate cache
      res.json({ message: 'Shortcut added successfully', id: result.insertId });
    }
  });
});

app.get('/getShortcuts/:user_id', authenticateToken, (req, res) => {
  const { user_id } = req.params;
  const cacheKey = `shortcuts_${user_id}`;
  const cachedShortcuts = shortcutCache.get(cacheKey);
  if (cachedShortcuts) {
    return res.json(cachedShortcuts);
  }
  console.log('Received request for shortcuts, user_id:', user_id);
  const query = 'SELECT id, shortcut, expansion FROM shortcuts WHERE user_id = ?';
  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
    } else {
      console.log('Sending shortcuts:', results);
      shortcutCache.set(cacheKey, results, 86400); // Cache for 24 hours
      res.json(results);
    }
  });
});

app.put('/updateShortcut', authenticateToken, (req, res) => {
  const { id, user_id, shortcut, expansion } = req.body;
  console.log('Received updateShortcut request:', { id, user_id, shortcut, expansion });
  const query = 'UPDATE shortcuts SET shortcut = ?, expansion = ? WHERE id = ? AND user_id = ?';
  pool.query(query, [shortcut, expansion, id, user_id], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
    } else {
      console.log('Shortcut updated successfully');
      shortcutCache.del(`shortcuts_${user_id}`); // Invalidate cache
      res.json({ message: 'Shortcut updated successfully' });
    }
  });
});

app.delete('/deleteShortcut/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;
  console.log('Received deleteShortcut request:', { id, user_id });
  const query = 'DELETE FROM shortcuts WHERE id = ? AND user_id = ?';
  pool.query(query, [id, user_id], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
    } else {
      console.log('Shortcut deleted successfully');
      shortcutCache.del(`shortcuts_${user_id}`); // Invalidate cache
      res.json({ message: 'Shortcut deleted successfully' });
    }
  });
});

app.post('/verifyToken', authenticateToken, (req, res) => {
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3222;

const options = {
  key: fs.readFileSync('key.key'),
  cert: fs.readFileSync('crt.crt'),
  ca: fs.readFileSync('r11.pem')
};

https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS Server running on port ${PORT}`);
});

// Check database connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Successfully connected to the database');
  connection.release();
});
