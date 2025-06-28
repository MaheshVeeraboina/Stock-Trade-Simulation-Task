3.Stock Trading Simulation Task
Design a system where multiple users can trade stocks in real-time, take loans, and track profits/losses.
Key Features:
Store trading (buy/sell) transaction data, stock registration data, user balance, stock price history, stocks available information using a database ( SQLite, MySQL, PostgreSQL, MongoDB, etc) or CSV/JSON.
Implement APIs for stock management, trading, loans, and analytics.
Simulate real-time stock price updates every 5 minutes. (stock price always between 1 to 100)
Enforce trading rules: users stop when loans are exhausted.
Generate reports on user performance and stock trends.
Task:
Develop and implement this system, ensuring efficient handling of transactions, real-time updates, and user analytics.
Implement following REST APIs for stock trading functionalities using Swagger for API documentation, implement a background function to update stocks price every 5 mins, and also implement a test function to simulate 5 to 10 users trading simultaneously.

API Endpoints:
Stock Management
POST /stocks/register → Register a new stock with stock, available quantity and price.
GET /stocks/history → Retrieve stock price history.
Loan Management
POST /users/loan → Allow users to take a loan if eligible. (max laon amount: 100000)
Trading Operations
POST /users/buy → Buy stocks based on price and availability.
POST /users/sell → Sell owned stocks.
Analytics & Reporting
GET /users/report → Fetch user profit/loss report.
GET /stocks/report → Get stock-wise performance report.
GET /users/top → List top-performing users.
GET /stocks/top → List top-performing stocks
