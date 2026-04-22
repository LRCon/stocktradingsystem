const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cron = require('node-cron');
const { DateTime } = require('luxon');
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

//get stocks
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

//cash routing
app.get('/api/cash', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const portfolioResult = await pool.query(
      `SELECT cash
       FROM market19.portfolios
       WHERE user_id = $1`,
      [userId]
    );

    const ordersResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM market19.orders
       WHERE user_id = $1 AND status = 'Pending'`,
      [userId]
    );

    const txResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM market19.transactions
       WHERE user_id = $1
         AND type IN ('Deposit', 'Withdrawal')`,
      [userId]
    );

    res.json({
      success: true,
      cash: portfolioResult.rows[0]?.cash ?? 0,
      pendingOrderCount: ordersResult.rows[0]?.count ?? 0,
      cashTxnCount: txResult.rows[0]?.count ?? 0
    });
  } catch (error) {
    console.error('Get cash summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});

//cash deposit routing
app.post('/api/cash/deposit', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const amount = Number(req.body.amount);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid deposit amount.'
      });
    }

    await pool.query(
      `UPDATE market19.portfolios
       SET cash = cash + $1
       WHERE user_id = $2`,
      [amount, userId]
    );

    await pool.query(
      `INSERT INTO market19.transactions (user_id, type, amount, status, description)
       VALUES ($1, 'Deposit', $2, 'Completed', 'Cash deposit')`,
      [userId, amount]
    );

    res.json({
      success: true,
      message: 'Deposit completed.'
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});

//cash withdraw routing
app.post('/api/cash/withdraw', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const amount = Number(req.body.amount);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid withdrawal amount.'
      });
    }

    const portfolioResult = await pool.query(
      `SELECT cash
       FROM market19.portfolios
       WHERE user_id = $1`,
      [userId]
    );

    const currentCash = Number(portfolioResult.rows[0]?.cash ?? 0);

    if (amount > currentCash) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient cash balance.'
      });
    }

    await pool.query(
      `UPDATE market19.portfolios
       SET cash = cash - $1
       WHERE user_id = $2`,
      [amount, userId]
    );

    await pool.query(
      `INSERT INTO market19.transactions (user_id, type, amount, status, description)
       VALUES ($1, 'Withdrawal', $2, 'Completed', 'Cash withdrawal')`,
      [userId, amount]
    );

    res.json({
      success: true,
      message: 'Withdrawal completed.'
    });
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});

//posting orders functions
app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { symbol, order_type, quantity } = req.body;

    const qty = Number(quantity);
    const cleanSymbol = String(symbol || '').trim().toUpperCase();
    const cleanOrderType = String(order_type || '').trim();

    if (!cleanSymbol || !cleanOrderType || !qty || qty < 1) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid order.'
      });
    }

    if (!['Buy', 'Sell'].includes(cleanOrderType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order type.'
      });
    }

    // Check market settings
    const settingsResult = await pool.query(
      `SELECT open_time, close_time, weekdays_only, trading_enabled
       FROM market19.market_settings
       ORDER BY id ASC
       LIMIT 1`
    );

    const settings = settingsResult.rows[0];

    if (!settings || !settings.trading_enabled) {
      return res.status(400).json({
        success: false,
        message: 'Trading is currently disabled.'
      });
    }

    // Use actual U.S. stock market time zone
    const now = DateTime.now().setZone('America/New_York');
    const day = now.weekday; // 1 = Monday, 7 = Sunday
    const nowMinutes = now.hour * 60 + now.minute;

    if (settings.weekdays_only && (day === 6 || day === 7)) {
      return res.status(400).json({
        success: false,
        message: 'Trading is closed on weekends.'
      });
    }

    const [openHour, openMinute] = String(settings.open_time).slice(0, 5).split(':').map(Number);
    const [closeHour, closeMinute] = String(settings.close_time).slice(0, 5).split(':').map(Number);

    const openMinutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;

    if (nowMinutes < openMinutes || nowMinutes > closeMinutes) {
      return res.status(400).json({
        success: false,
        message: 'Market is currently closed.'
      });
    }

    // Get stock price
    const stockResult = await pool.query(
      `SELECT symbol, name, price
       FROM market19.stocks
       WHERE symbol = $1`,
      [cleanSymbol]
    );

    if (stockResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stock not found.'
      });
    }

    const stock = stockResult.rows[0];
    const price = Number(stock.price);
    const total = Number((price * qty).toFixed(2));

    await pool.query('BEGIN');

    try {
      if (cleanOrderType === 'Buy') {
        const portfolioResult = await pool.query(
          `SELECT cash
           FROM market19.portfolios
           WHERE user_id = $1`,
          [userId]
        );

        const cash = Number(portfolioResult.rows[0]?.cash ?? 0);

        if (cash < total) {
          await pool.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Insufficient cash balance.'
          });
        }

        // Reserve cash immediately
        await pool.query(
          `UPDATE market19.portfolios
           SET cash = cash - $1
           WHERE user_id = $2`,
          [total, userId]
        );
      }

      if (cleanOrderType === 'Sell') {
        const holdingsResult = await pool.query(
          `SELECT quantity
           FROM market19.holdings
           WHERE user_id = $1 AND symbol = $2`,
          [userId, cleanSymbol]
        );

        const ownedShares = Number(holdingsResult.rows[0]?.quantity ?? 0);

        if (ownedShares < qty) {
          await pool.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Insufficient shares to sell.'
          });
        }
      }

      await pool.query(
        `INSERT INTO market19.orders
           (user_id, symbol, quantity, price, status, order_type, total)
         VALUES
           ($1, $2, $3, $4, 'Pending', $5, $6)`,
        [userId, cleanSymbol, qty, price, cleanOrderType, total]
      );

      await pool.query('COMMIT');

      res.json({
        success: true,
        message: `${cleanOrderType} order placed as pending.`
      });
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});
  //getting orders pending
  app.get('/api/orders/pending', requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;

      const result = await pool.query(
        `SELECT id, symbol, order_type, quantity, price, total, status, created_at
        FROM market19.orders
        WHERE user_id = $1 AND status = 'Pending'
        ORDER BY created_at DESC`,
        [userId]
      );

      res.json({
        success: true,
        orders: result.rows
      });
    } catch (error) {
      console.error('Get pending orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error.'
      });
    }
  });

  //getting orders for oders page
  app.get('/api/orders', requireAuth, async (req, res) => {
    try {
      const userId = req.session.user.id;

      const result = await pool.query(
        `SELECT id, symbol, order_type, quantity, price, total, status, created_at
        FROM market19.orders
        WHERE user_id = $1
        ORDER BY created_at DESC`,
        [userId]
      );

      res.json({
        success: true,
        orders: result.rows
      });
    } catch (error) {
      console.error('Get orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error.'
      });
    }
  });
  //check for finished pending orders after 2 minutes, pending orders are set to resolve after 5 minutes on server
  async function processPendingOrders() {
  try {
    const result = await pool.query(
      `SELECT id, user_id, symbol, quantity, price, status, created_at, order_type, total
       FROM market19.orders
       WHERE status = 'Pending'
         AND created_at <= NOW() - INTERVAL '2 minutes'
       ORDER BY created_at ASC`
    );

    for (const order of result.rows) {
      await pool.query('BEGIN');

      try {
        if (order.order_type === 'Buy') {
          // cash was already reserved at order placement
          // now just add holdings
          await pool.query(
            `INSERT INTO market19.holdings (user_id, symbol, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, symbol)
             DO UPDATE SET quantity = market19.holdings.quantity + EXCLUDED.quantity`,
            [order.user_id, order.symbol, order.quantity]
          );

          await pool.query(
            `INSERT INTO market19.transactions (user_id, type, amount, status, description)
             VALUES ($1, 'Buy', $2, 'Completed', $3)`,
            [
              order.user_id,
              order.total,
              `Bought ${order.quantity} shares of ${order.symbol}`
            ]
          );
        } else if (order.order_type === 'Sell') {
          const holdingsResult = await pool.query(
            `SELECT quantity
             FROM market19.holdings
             WHERE user_id = $1 AND symbol = $2`,
            [order.user_id, order.symbol]
          );

          const ownedShares = Number(holdingsResult.rows[0]?.quantity ?? 0);

          if (ownedShares < order.quantity) {
            await pool.query(
              `UPDATE market19.orders
               SET status = 'Canceled',
                   completed_at = NOW()
               WHERE id = $1`,
              [order.id]
            );

            await pool.query('COMMIT');
            continue;
          }

          await pool.query(
            `UPDATE market19.holdings
             SET quantity = quantity - $1
             WHERE user_id = $2 AND symbol = $3`,
            [order.quantity, order.user_id, order.symbol]
          );

          await pool.query(
            `UPDATE market19.portfolios
             SET cash = cash + $1
             WHERE user_id = $2`,
            [order.total, order.user_id]
          );

          await pool.query(
            `INSERT INTO market19.transactions (user_id, type, amount, status, description)
             VALUES ($1, 'Sell', $2, 'Completed', $3)`,
            [
              order.user_id,
              order.total,
              `Sold ${order.quantity} shares of ${order.symbol}`
            ]
          );
        }

        await pool.query(
          `UPDATE market19.orders
           SET status = 'Completed',
               completed_at = NOW()
           WHERE id = $1`,
          [order.id]
        );

        await pool.query('COMMIT');
      } catch (err) {
        await pool.query('ROLLBACK');
        console.error(`Failed to process order ${order.id}:`, err);
      }
    }
  } catch (error) {
    console.error('Error processing pending orders:', error);
  }
}

//cancel order
app.post('/api/orders/:id/cancel', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const orderId = Number(req.params.id);

    const orderResult = await pool.query(
      `SELECT id, user_id, symbol, order_type, quantity, price, total, status
       FROM market19.orders
       WHERE id = $1 AND user_id = $2`,
      [orderId, userId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    const order = orderResult.rows[0];

    if (order.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending orders can be canceled.'
      });
    }

    await pool.query('BEGIN');

    try {
      if (order.order_type === 'Buy') {
        // refund reserved cash
        await pool.query(
          `UPDATE market19.portfolios
           SET cash = cash + $1
           WHERE user_id = $2`,
          [order.total, userId]
        );
      }

      await pool.query(
        `UPDATE market19.orders
         SET status = 'Canceled',
             completed_at = NOW()
         WHERE id = $1`,
        [orderId]
      );

      await pool.query('COMMIT');

      res.json({
        success: true,
        message: 'Order canceled successfully.'
      });
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});
 
//schedules pending check ever min
cron.schedule('* * * * *', async () => {
  await processPendingOrders();
});

//holdings route
app.get('/api/holdings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const result = await pool.query(
      `SELECT h.symbol, h.quantity, s.price, s.name
       FROM market19.holdings h
       JOIN market19.stocks s ON h.symbol = s.symbol
       WHERE h.user_id = $1
         AND h.quantity > 0
       ORDER BY h.symbol ASC`,
      [userId]
    );

    res.json({
      success: true,
      holdings: result.rows
    });
  } catch (error) {
    console.error('Get holdings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});

//transactions route
app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const role = req.session.user.role;

    let result;

    if (role === 'admin') {
      result = await pool.query(
        `SELECT t.id, t.user_id, u.username, u.email, t.type, t.amount, t.status, t.description, t.created_at
         FROM market19.transactions t
         JOIN market19.users u ON t.user_id = u.id
         ORDER BY t.created_at DESC`
      );
    } else {
      result = await pool.query(
        `SELECT t.id, t.user_id, u.username, u.email, t.type, t.amount, t.status, t.description, t.created_at
         FROM market19.transactions t
         JOIN market19.users u ON t.user_id = u.id
         WHERE t.user_id = $1
         ORDER BY t.created_at DESC`,
        [userId]
      );
    }

    res.json({
      success: true,
      isAdmin: role === 'admin',
      transactions: result.rows
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});
// get market settings
app.get('/api/market-settings', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT open_time, close_time, weekdays_only, trading_enabled
       FROM market19.market_settings
       ORDER BY id ASC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Market settings not found.'
      });
    }

    res.json({
      success: true,
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Get market settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.'
    });
  }
});

//updating market settings
app.post('/api/market-settings', requireAdmin, async (req, res) => {
  try {
    let { openTime, closeTime, weekdaysOnly, tradingEnabled } = req.body;

    if (!openTime || !closeTime) {
      return res.status(400).json({
        success: false,
        message: 'Open and close times are required.'
      });
    }

    const openValue = openTime.length === 5 ? `${openTime}:00` : openTime;
    const closeValue = closeTime.length === 5 ? `${closeTime}:00` : closeTime;

    if (closeValue === '00:00:00') {
      return res.status(400).json({
        success: false,
        message: 'Use 23:59:59 for end of day, not 00:00:00.'
      });
    }

    await pool.query(
      `UPDATE market19.market_settings
       SET open_time = $1,
           close_time = $2,
           weekdays_only = $3,
           trading_enabled = $4
       WHERE id = (
         SELECT id
         FROM market19.market_settings
         ORDER BY id ASC
         LIMIT 1
       )`,
      [openValue, closeValue, weekdaysOnly, tradingEnabled]
    );

    res.json({
      success: true,
      message: 'Market schedule updated.'
    });
  } catch (error) {
    console.error('Update market settings error:', error);
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