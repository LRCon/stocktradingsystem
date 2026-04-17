const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = 3000;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

//require admin
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied');
  }

  next();
}

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// routing scripts
app.get('/', requireAuth, (req, res) => {
  res.render('index');
});

app.get('/cash', requireAuth, (req, res) => {
  res.render('cash');
});

app.get('/admin-stocks', requireAdmin, (req, res) => {
  res.render('admin-stocks');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/orders', requireAuth, (req, res) => {
  res.render('orders');
});

app.get('/trade', requireAuth, (req, res) => {
  res.render('trade');
});

app.get('/transactions', requireAuth, (req, res) => {
  res.render('transactions');
});

//register scripts
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, username, email, password } = req.body;

    if (!fullName || !username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.'
      });
    }

    const existing = await pool.query(
      `SELECT id
       FROM users
       WHERE email = $1 OR username = $2`,
      [email, username]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email or username already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (full_name, username, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [fullName, username, email, passwordHash, 'customer']
    );

    res.json({
      success: true,
      message: 'Account created successfully. You can sign in now.'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});


//login & session scripts
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      `SELECT id, full_name, username, email, password_hash, role
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    req.session.user = {
      id: user.id,
      fullName: user.full_name,
      username: user.username,
      email: user.email,
      role: user.role
    };

    res.json({
      success: true,
      message: 'Login successful.'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/stocks', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, symbol, name, price, opening_price, high, low, volume
       FROM market19.stocks
       ORDER BY symbol ASC`
    );

    res.json({
      success: true,
      stocks: result.rows
    });
  } catch (error) {
    console.error('Get stocks error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});

//admin stock function
app.post('/api/stocks', requireAdmin, async (req, res) => {
  try {
    const { companyName, symbol, initialPrice, volume } = req.body;

    if (!companyName || !symbol || !initialPrice || !volume) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required.'
      });
    }

    const upperSymbol = symbol.trim().toUpperCase();

    const existing = await pool.query(
      'SELECT id FROM market19.stocks WHERE symbol = $1',
      [upperSymbol]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ticker already exists.'
      });
    }

    await pool.query(
      `INSERT INTO market19.stocks (symbol, name, price, opening_price, high, low, volume)
       VALUES ($1, $2, $3, $3, $3, $3, $4)`,
      [upperSymbol, companyName.trim(), Number(initialPrice), Number(volume)]
    );

    res.json({
      success: true,
      message: 'Stock created successfully.'
    });
  } catch (error) {
    console.error('Create stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});

//servers app on port 3000
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});