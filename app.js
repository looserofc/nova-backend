const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware - SIMPLIFIED
app.use(cors({
  origin: ['http://localhost:3000', 'https://novadam.com', 'https://www.novadam.com'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// IMMEDIATE Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Nova App'
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Nova Digital Asset Management API',
    version: '2.0.0',
    status: 'Running'
  });
});

// Async initialization
async function initializeApp() {
  try {
    console.log('Starting application initialization...');
    
    // Initialize database
    const { initDatabase } = require('./database');
    await initDatabase();
    console.log('✅ Database initialized');

    // Initialize test data (optional)
    try {
      const initTestData = require('./scripts/init-test-data');
      await initTestData();
      console.log('✅ Test data initialized');
    } catch (testDataError) {
      console.warn('Test data initialization skipped:', testDataError.message);
    }

    // Load routes
    console.log('Loading routes...');
    const authRoutes = require('./routes/auth');
    const paymentsRoutes = require('./routes/payments');
    const dashboardRoutes = require('./routes/dashboard');
    const adsRoutes = require('./routes/ads');
    const withdrawRoutes = require('./routes/withdraw');
    const referralsRoutes = require('./routes/referrals');
    const adminRoutes = require('./routes/admin');

    // Register routes
    app.use('/auth', authRoutes);
    app.use('/payments', paymentsRoutes);
    app.use('/dashboard', dashboardRoutes);
    app.use('/ads', adsRoutes);
    app.use('/withdraw', withdrawRoutes);
    app.use('/referrals', referralsRoutes);
    app.use('/admin', adminRoutes);

    console.log('✅ All routes loaded');

  } catch (error) {
    console.error('❌ Application initialization failed:', error);
  }
}

// Start server
const server = app.listen(PORT, HOST, (err) => {
  if (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
  
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialize app after server starts
  initializeApp();
});

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
