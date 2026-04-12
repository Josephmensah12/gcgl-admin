const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security
app.use(helmet());

// CORS
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',');
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// API Routes
const API_BASE = '/api/v1';

app.use(`${API_BASE}/auth`, require('./routes/authRoutes'));
app.use(`${API_BASE}/dashboard`, require('./routes/dashboardRoutes'));
app.use(`${API_BASE}/customers`, require('./routes/customerRoutes'));
app.use(`${API_BASE}/pickups`, require('./routes/pickupRoutes'));
app.use(`${API_BASE}/shipments`, require('./routes/shipmentRoutes'));
app.use(`${API_BASE}/payments`, require('./routes/paymentRoutes'));
app.use(`${API_BASE}/transactions`, require('./routes/transactionRoutes'));
app.use(`${API_BASE}/invoices/:id/transactions`, require('./routes/invoiceTransactionRoutes'));
app.use(`${API_BASE}/create-invoice`, require('./routes/invoiceCreateRoutes'));
app.use(`${API_BASE}/expenses`, require('./routes/expenseRoutes'));
app.use(`${API_BASE}/bank`, require('./routes/bankRoutes'));
app.use(`${API_BASE}/fixed-costs`, require('./routes/fixedCostRoutes'));
app.use(`${API_BASE}/financial-reports`, require('./routes/financialReportRoutes'));
app.use(`${API_BASE}/settings`, require('./routes/settingsRoutes'));
app.use(`${API_BASE}/catalog`, require('./routes/catalogRoutes'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'gcgl-admin' }));

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Error handler
app.use(errorHandler);

module.exports = app;
