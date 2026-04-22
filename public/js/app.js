// const App = (() => {

//   // ===== Helpers =====
//   const currency = (num) => `$${Number(num).toFixed(2)}`;

//   // ===== Mock Users =====
//   const users = [
//     {
//       id: 1,
//       fullName: "Admin User",
//       username: "admin",
//       email: "admin@marketpulse.com",
//       password: "Admin123!",
//       role: "admin",
//       mfaCode: "428913"
//     },
//     {
//       id: 2,
//       fullName: "Customer User",
//       username: "customer",
//       email: "customer@marketpulse.com",
//       password: "Customer123!",
//       role: "customer",
//       mfaCode: "654321"
//     }
//   ];

//   let currentUser = JSON.parse(localStorage.getItem("currentUser")) || null;

//   // ===== Auth =====
//   function loginUser(email, password) {
//     const user = users.find(u => u.email === email && u.password === password);
//     if (!user) return { success: false };

//     currentUser = user;
//     localStorage.setItem("currentUser", JSON.stringify(user));
//     return { success: true, requiresMfa: true };
//   }

//   function verifyMfa(code) {
//     if (!currentUser) return false;
//     return currentUser.mfaCode === code;
//   }

//   function logout() {
//     currentUser = null;
//     localStorage.removeItem("currentUser");
//   }

//   function getCurrentUser() {
//     return currentUser;
//   }

//   function requireAuth(roles = []) {
//     if (!currentUser) {
//       window.location.href = "/login";
//       return null;
//     }
//     if (roles.length && !roles.includes(currentUser.role)) {
//       alert("Access denied");
//       window.location.href = "/";
//       return null;
//     }
//     return currentUser;
//   }

//   // ===== Stocks =====
//   let stocks = JSON.parse(localStorage.getItem("stocks")) || [
//     {
//       symbol: "AAPL",
//       name: "Apple Inc.",
//       price: 210,
//       openingPrice: 208,
//       high: 212,
//       low: 207,
//       volume: 1000000
//     },
//     {
//       symbol: "MSFT",
//       name: "Microsoft",
//       price: 400,
//       openingPrice: 395,
//       high: 405,
//       low: 392,
//       volume: 800000
//     }
//   ];

//   function saveStocks() {
//     localStorage.setItem("stocks", JSON.stringify(stocks));
//   }

//   function getStocks() {
//     return stocks;
//   }

//   function createStock(stock) {
//     stocks.push({
//       ...stock,
//       openingPrice: stock.price,
//       high: stock.price,
//       low: stock.price
//     });
//     saveStocks();
//   }

//   // ===== Portfolio =====
//   function getPortfolio(userId) {
//     return JSON.parse(localStorage.getItem(`portfolio_${userId}`)) || {
//       cash: 10000,
//       holdings: []
//     };
//   }

//   function savePortfolio(userId, data) {
//     localStorage.setItem(`portfolio_${userId}`, JSON.stringify(data));
//   }

//   // ===== Orders =====
//   function getOrders(userId) {
//     return JSON.parse(localStorage.getItem(`orders_${userId}`)) || [];
//   }

//   function saveOrders(userId, orders) {
//     localStorage.setItem(`orders_${userId}`, JSON.stringify(orders));
//   }

//   function placeOrder(userId, order) {
//     const orders = getOrders(userId);

//     const newOrder = {
//       id: Date.now(),
//       ...order,
//       status: "Pending",
//       date: new Date().toISOString()
//     };

//     orders.push(newOrder);
//     saveOrders(userId, orders);

//     return newOrder;
//   }

//   function cancelOrder(userId, orderId) {
//     const orders = getOrders(userId);
//     const order = orders.find(o => o.id === orderId);

//     if (order && order.status === "Pending") {
//       order.status = "Canceled";
//       saveOrders(userId, orders);

//       addTransaction(userId, {
//         type: "Order Canceled",
//         symbol: order.symbol,
//         quantity: order.quantity,
//         amount: 0,
//         status: "Canceled",
//         description: `Canceled ${order.symbol} order`
//       });
//     }
//   }

//   // ===== Transactions =====
//   function getUserTransactions(userId) {
//     return JSON.parse(localStorage.getItem(`tx_${userId}`)) || [];
//   }

//   function saveTransactions(userId, tx) {
//     localStorage.setItem(`tx_${userId}`, JSON.stringify(tx));
//   }

//   function addTransaction(userId, tx) {
//     const transactions = getUserTransactions(userId);

//     const newTx = {
//       id: Date.now(),
//       date: new Date().toISOString(),
//       ...tx
//     };

//     transactions.unshift(newTx);
//     saveTransactions(userId, transactions);
//   }

//   // ===== Cash =====
//   function depositCash(userId, amount) {
//     const portfolio = getPortfolio(userId);
//     portfolio.cash += amount;
//     savePortfolio(userId, portfolio);

//     addTransaction(userId, {
//       type: "Deposit",
//       amount,
//       status: "Completed",
//       description: "Cash deposit"
//     });
//   }

//   function withdrawCash(userId, amount) {
//     const portfolio = getPortfolio(userId);

//     if (amount > portfolio.cash) return false;

//     portfolio.cash -= amount;
//     savePortfolio(userId, portfolio);

//     addTransaction(userId, {
//       type: "Withdrawal",
//       amount,
//       status: "Completed",
//       description: "Cash withdrawal"
//     });

//     return true;
//   }

//   // ===== Market Settings =====
//   let marketSettings = JSON.parse(localStorage.getItem("marketSettings")) || {
//     open: "09:30",
//     close: "16:00",
//     holidays: []
//   };

//   function getMarketSettings() {
//     return marketSettings;
//   }

//   function saveMarketSettings(settings) {
//     marketSettings = settings;
//     localStorage.setItem("marketSettings", JSON.stringify(settings));
//   }

//   // ===== Public API =====
//   return {
//     loginUser,
//     verifyMfa,
//     logout,
//     getCurrentUser,
//     requireAuth,
//     getStocks,
//     createStock,
//     getPortfolio,
//     placeOrder,
//     cancelOrder,
//     getOrders,
//     depositCash,
//     withdrawCash,
//     getUserTransactions,
//     addTransaction,
//     getMarketSettings,
//     saveMarketSettings,
//     currency
//   };

// })();

const App = (() => {

  //login
  async function loginUser(email, password) {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    return await response.json();
  }
  //register
  async function registerUser(userData) {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    return await response.json();
  }
  //get stocks
  async function getStocks() {
    const response = await fetch('/api/stocks');
    return await response.json();
  }
  //create stocks
  async function createStock(stockData) {
    const response = await fetch('/api/stocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockData)
    });

    return await response.json();
  }
  //get cash
  async function getCashSummary() {
    const response = await fetch('/api/cash');
    return await response.json();
  }
  //deposit cash
  async function depositCash(amount) {
    const response = await fetch('/api/cash/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });

    return await response.json();
  }
  //widthraw cash
  async function withdrawCash(amount) {
    const response = await fetch('/api/cash/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });

    return await response.json();
  }

  //place order
  async function placeOrder(orderData) {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
  });

    return await response.json();
  }

  //get orders
  async function getOrders() {
    const response = await fetch('/api/orders');
    return await response.json();
  }

  //pending orders
  async function getPendingOrders() {
    const response = await fetch('/api/orders/pending');
    return await response.json();
    }
  
  //cancel order
  async function cancelOrder(orderId) {
    const response = await fetch(`/api/orders/${orderId}/cancel`, {
      method: 'POST'
    });

    return await response.json();
  }
  //get holdings
  async function getHoldings() {
    const response = await fetch('/api/holdings');
    return await response.json();
  }

  //get transactions
  async function getTransactions() {
    const response = await fetch('/api/transactions');
    return await response.json();
  }

  //get market settings
  async function getMarketSettings() {
  const response = await fetch('/api/market-settings');
  return await response.json();
}
//update market settings
async function updateMarketSettings(settingsData) {
  const response = await fetch('/api/market-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsData)
  });

  return await response.json();
}

  //logout
  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return {
    loginUser,
    registerUser,
    getStocks,
    getHoldings,
    createStock,
    getCashSummary,
    depositCash,
    withdrawCash,
    getPendingOrders,
    getOrders,
    placeOrder,
    cancelOrder,
    getTransactions,
    getMarketSettings,
    updateMarketSettings,
    logout
  };
})();
