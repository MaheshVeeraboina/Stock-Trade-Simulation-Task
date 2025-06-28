const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const cron = require('node-cron')

const app = express()

app.use(express.json())

const db = new sqlite3.Database('stock-sim.db')

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    balance REAL DEFAULT 0,
    loan REAL DEFAULT 0
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    quantity INTEGER,
    price REAL
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS stock_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER,
    price REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    stock_id INTEGER,
    quantity INTEGER,
    type TEXT,
    price REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(
    `INSERT OR IGNORE INTO users (id, name, balance, loan) VALUES (1, 'Mahesh', 100000, 0)`,
  )
  db.run(
    `INSERT OR IGNORE INTO users (id, name, balance, loan) VALUES (2, 'Ravi', 80000, 0)`,
  )
  db.run(
    `INSERT OR IGNORE INTO users (id, name, balance, loan) VALUES (3, 'Anjali', 120000, 0)`,
  )

  db.run(
    `INSERT OR IGNORE INTO stocks (id, name, quantity, price) VALUES (1, 'TCS', 1000, 50)`,
  )
  db.run(
    `INSERT OR IGNORE INTO stocks (id, name, quantity, price) VALUES (2, 'Infosys', 500, 70)`,
  )
  db.run(
    `INSERT OR IGNORE INTO stocks (id, name, quantity, price) VALUES (3, 'Wipro', 800, 65)`,
  )
})

cron.schedule('* * * * *', () => {
  const timestamp = new Date().toISOString()

  db.all('SELECT * FROM stocks', [], (err, stocks) => {
    if (err) return console.error('DB Error:', err)

    stocks.forEach(stock => {
      const newPrice = Math.floor(Math.random() * 100) + 1

      db.run('UPDATE stocks SET price = ? WHERE id = ?', [newPrice, stock.id])
      db.run(
        'INSERT INTO stock_history (stock_id, price, timestamp) VALUES (?, ?, ?)',
        [stock.id, newPrice, timestamp],
      )

      console.log(`📊 Updated ${stock.name} price: ₹${newPrice}`)
    })

    console.log('🔁 Stock prices updated and stored in DB')
  })
})

app.post('/stocks/register', (req, res) => {
  const {name, quantity, price} = req.body
  db.run(
    'INSERT INTO stocks (name, quantity, price) VALUES (?, ?, ?)',
    [name, quantity, price],
    function (err) {
      if (err) return res.status(500).json(err)
      res.json({message: 'Stock registered', stock_id: this.lastID})
    },
  )
})

app.get('/stocks/history', (req, res) => {
  db.all('SELECT * FROM stock_history', [], (err, rows) => {
    if (err) return res.status(500).json(err)
    res.json(rows)
  })
})

app.post('/users/loan', (req, res) => {
  const {user_id, amount} = req.body
  if (amount > 100000)
    return res.status(400).json({error: 'Loan limit exceeded'})
  db.run(
    'UPDATE users SET loan = loan + ?, balance = balance + ? WHERE id = ?',
    [amount, amount, user_id],
    function (err) {
      if (err) return res.status(500).json(err)
      res.json({message: 'Loan granted'})
    },
  )
})

app.get('/stocks/top-gainer', (req, res) => {
  const sql = `
    SELECT s.id, s.name, MIN(h.price) as min_price, MAX(h.price) as max_price,
           (MAX(h.price) - MIN(h.price)) as gain
    FROM stock_history h
    JOIN stocks s ON s.id = h.stock_id
    GROUP BY s.id
    ORDER BY gain DESC
    LIMIT 1
  `
  db.get(sql, [], (err, row) => {
    if (err) return res.status(500).json({error: err.message})
    res.json(row || {message: 'No stock history found'})
  })
})

app.get('/users/most-profitable', (req, res) => {
  const sql = `
    SELECT u.id, u.name, u.balance, u.loan,
           IFNULL(SUM(CASE WHEN t.type = 'buy' THEN -t.quantity * t.price
                           WHEN t.type = 'sell' THEN t.quantity * t.price ELSE 0 END), 0) AS trade_profit,
           (u.balance - u.loan) + trade_profit AS net_profit
    FROM users u
    LEFT JOIN trades t ON t.user_id = u.id
    GROUP BY u.id
    ORDER BY net_profit DESC
    LIMIT 1
  `
  db.get(sql, [], (err, row) => {
    if (err) return res.status(500).json({error: err.message})
    res.json(row || {message: 'No trades found'})
  })
})

app.post('/users/buy', (req, res) => {
  const {user_id, stock_id, quantity} = req.body

  db.get('SELECT * FROM users WHERE id = ?', [user_id], (err, user) => {
    if (err) return res.status(500).json({error: 'DB Error', details: err})
    if (!user) return res.status(404).json({error: 'User not found'})

    db.get('SELECT * FROM stocks WHERE id = ?', [stock_id], (err2, stock) => {
      if (err2) return res.status(500).json({error: 'DB Error', details: err2})
      if (!stock) return res.status(404).json({error: 'Stock not found'})

      const cost = quantity * stock.price

      if (user.balance >= cost && stock.quantity >= quantity) {
        db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [
          cost,
          user_id,
        ])
        db.run('UPDATE stocks SET quantity = quantity - ? WHERE id = ?', [
          quantity,
          stock_id,
        ])
        db.run(
          'INSERT INTO trades (user_id, stock_id, quantity, type, price) VALUES (?, ?, ?, ?, ?)',
          [user_id, stock_id, quantity, 'buy', stock.price],
        )
        res.json({message: 'Stock bought'})
      } else {
        res.status(400).json({error: 'Insufficient balance or stock'})
      }
    })
  })
})

app.post('/users/sell', (req, res) => {
  const {user_id, stock_id, quantity} = req.body
  db.get(
    'SELECT SUM(quantity) as total FROM trades WHERE user_id = ? AND stock_id = ? AND type = "buy"',
    [user_id, stock_id],
    (err, result) => {
      const owned = result.total || 0
      if (owned < quantity)
        return res.status(400).json({error: 'Not enough stock to sell'})
      db.get(
        'SELECT price FROM stocks WHERE id = ?',
        [stock_id],
        (err2, stock) => {
          const gain = quantity * stock.price
          db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [
            gain,
            user_id,
          ])
          db.run(
            'INSERT INTO trades (user_id, stock_id, quantity, type, price) VALUES (?, ?, ?, ?, ?)',
            [user_id, stock_id, quantity, 'sell', stock.price],
          )
          db.run('UPDATE stocks SET quantity = quantity + ? WHERE id = ?', [
            quantity,
            stock_id,
          ])
          res.json({message: 'Stock sold'})
        },
      )
    },
  )
})

app.get('/users/report', (req, res) => {
  db.all(
    'SELECT id, name, balance + loan AS net_worth FROM users',
    [],
    (err, rows) => {
      res.json(rows)
    },
  )
})

app.get('/stocks/report', (req, res) => {
  db.all('SELECT * FROM stocks', [], (err, rows) => {
    res.json(rows)
  })
})

app.get('/users/top', (req, res) => {
  db.all(
    'SELECT id, name, balance + loan AS net_worth FROM users ORDER BY net_worth DESC LIMIT 5',
    [],
    (err, rows) => {
      res.json(rows)
    },
  )
})

app.get('/stocks/top', (req, res) => {
  db.all(
    `SELECT s.name, COUNT(t.id) as trades FROM trades t
          JOIN stocks s ON s.id = t.stock_id
          GROUP BY s.id ORDER BY trades DESC LIMIT 5`,
    [],
    (err, rows) => {
      res.json(rows)
    },
  )
})

function simulateUserTrading() {
  db.all('SELECT id FROM users', [], (err, users) => {
    if (err || users.length === 0) return

    db.all('SELECT * FROM stocks', [], (err2, stocks) => {
      if (err2 || stocks.length === 0) return

      const traders = users
        .sort(() => 0.5 - Math.random())
        .slice(0, 5 + Math.floor(Math.random() * 5))

      traders.forEach(user => {
        const stock = stocks[Math.floor(Math.random() * stocks.length)]
        const action = Math.random() > 0.5 ? 'buy' : 'sell'
        const quantity = Math.floor(Math.random() * 5) + 1

        if (action === 'buy') {
          db.get('SELECT * FROM users WHERE id = ?', [user.id], (errU, u) => {
            if (
              u.balance >= quantity * stock.price &&
              stock.quantity >= quantity
            ) {
              db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [
                quantity * stock.price,
                u.id,
              ])
              db.run('UPDATE stocks SET quantity = quantity - ? WHERE id = ?', [
                quantity,
                stock.id,
              ])
              db.run(
                'INSERT INTO trades (user_id, stock_id, quantity, type, price) VALUES (?, ?, ?, ?, ?)',
                [u.id, stock.id, quantity, 'buy', stock.price],
              )
              console.log(
                `User ${u.id} bought ${quantity} of ${stock.name} @ ₹${stock.price}`,
              )
            }
          })
        } else {
          db.get(
            'SELECT SUM(quantity) as total FROM trades WHERE user_id = ? AND stock_id = ? AND type = "buy"',
            [user.id, stock.id],
            (errT, result) => {
              const owned = result?.total || 0
              if (owned >= quantity) {
                db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [
                  quantity * stock.price,
                  user.id,
                ])
                db.run(
                  'UPDATE stocks SET quantity = quantity + ? WHERE id = ?',
                  [quantity, stock.id],
                )
                db.run(
                  'INSERT INTO trades (user_id, stock_id, quantity, type, price) VALUES (?, ?, ?, ?, ?)',
                  [user.id, stock.id, quantity, 'sell', stock.price],
                )
                console.log(
                  ` User ${user.id} sold ${quantity} of ${stock.name} @ ₹${stock.price}`,
                )
              }
            },
          )
        }
      })
    })
  })
}

app.get('/users/highest-profit', (req, res) => {
  const sql = `-- (use highest profit query here)`
  db.get(sql, [], (err, row) => {
    if (err) return res.status(500).json({error: err.message})
    res.json(row || {message: 'No trades found'})
  })
})

app.get('/users/lowest-profit', (req, res) => {
  const sql = `-- (use lowest profit query here)`
  db.get(sql, [], (err, row) => {
    if (err) return res.status(500).json({error: err.message})
    res.json(row || {message: 'No trades found'})
  })
})

setInterval(simulateUserTrading, 10000)

const PORT = 3000
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`)
})
