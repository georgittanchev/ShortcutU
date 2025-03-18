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

const JWT_SECRET = ''; 

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

// Enhanced login endpoint with better error handling and logging
app.post('/login', async (req, res) => {
  console.log('Login request received:', { 
    username: req.body?.username ? '(provided)' : '(missing)',
    password: req.body?.password ? '(provided)' : '(missing)',
    headers: req.headers
  });

  try {
    // Input validation
    const { username, password } = req.body;
    if (!username || !password) {
      console.log('Missing credentials:', { username: !!username, password: !!password });
      return res.status(400).json({ 
        error: 'Username and password are required',
        details: 'Both fields must be provided'
      });
    }

    // Database query with timeout
    const query = 'SELECT * FROM users WHERE username = ?';
    const queryPromise = new Promise((resolve, reject) => {
      pool.query(query, [username], (err, results) => {
        if (err) {
          console.error('Database query error:', err);
          reject(new Error('Database error'));
          return;
        }
        resolve(results);
      });
    });

    // Add timeout to query
    const results = await Promise.race([
      queryPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database timeout')), 5000)
      )
    ]);

    console.log('Query completed. Results found:', results.length > 0);

    if (results.length === 0) {
      console.log('No user found for username:', username);
      return res.status(401).json({ 
        error: 'Invalid credentials',
        details: 'User not found'
      });
    }

    const user = results[0];

    // Password validation with timeout
    const validationPromise = bcrypt.compare(password, user.password);
    const isValidPassword = await Promise.race([
      validationPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Password validation timeout')), 5000)
      )
    ]);

    console.log('Password validation completed:', isValidPassword);

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        details: 'Incorrect password'
      });
    }

    // Generate JWT
    const token = jwt.sign({ 
      id: user.id,
      username: user.username,
      iat: Math.floor(Date.now() / 1000)
    }, JWT_SECRET, { 
      expiresIn: '24h'
    });

    // Send successful response
    console.log('Login successful for user:', username);
    res.json({ 
      token,
      user_id: user.id,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
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
  ca: [
    fs.readFileSync('chain.pem'),
    fs.readFileSync('isrgrootx1.pem'),
    fs.readFileSync('r10.pem')
  ]
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
