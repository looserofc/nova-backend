const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { initDatabase, getDb } = require('./database'); // Add getDb import
const initTestData = require('./scripts/init-test-data');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'https://novadam.com',
    'https://www.novadam.com',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// CRITICAL: Add health check BEFORE initialization
// This allows Render to verify the service is running
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Nova Digital Asset Management API',
    version: '2.0.0',
    database: 'SQLite',
    status: 'Running'
  });
});

// Async initialization function
async function initializeApp() {
  try {
    // Initialize database first
    await initDatabase();
    console.log('Database initialized');

    // Initialize test data (including admin user)
    await initTestData();
    console.log('Test data initialized');

    // Import routes after database is initialized
    const authRoutes = require('./routes/auth');
    const paymentsRoutes = require('./routes/payments');
    const dashboardRoutes = require('./routes/dashboard');
    const adsRoutes = require('./routes/ads');
    const withdrawRoutes = require('./routes/withdraw');
    const referralsRoutes = require('./routes/referrals');
    const adminRoutes = require('./routes/admin');

    // Use routes
    app.use('/auth', authRoutes);
    app.use('/payments', paymentsRoutes);
    app.use('/dashboard', dashboardRoutes);
    app.use('/ads', adsRoutes);
    app.use('/withdraw', withdrawRoutes);
    app.use('/referrals', referralsRoutes);
    app.use('/admin', adminRoutes);

    // API info endpoint
    app.get('/api', (req, res) => {
      res.json({
        name: 'Nova Digital Asset Management API',
        version: '2.0.0',
        database: 'SQLite',
        endpoints: {
          auth: '/auth/*',
          payments: '/payments/*',
          dashboard: '/dashboard',
          ads: '/ads/*',
          withdrawals: '/withdraw/*',
          referrals: '/referrals/*',
          admin: '/admin/*'
        }
      });
    });

    // Handle 404 errors
    app.use((req, res, next) => {
      res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
      });
    });

    // Global error handling middleware
    app.use((error, req, res, next) => {
      console.error('Unhandled error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      });
    });

    // Start server
    app.listen(PORT, '0.0.0.0', () => {  // Add '0.0.0.0' to bind to all interfaces
      console.log(`🚀 Nova Digital API Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Database: SQLite`);
      console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    });

  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  try {
    const { closeDatabase } = require('./database');
    await closeDatabase();
    console.log('Database connections closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  try {
    const { closeDatabase } = require('./database');
    await closeDatabase();
    console.log('Database connections closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the application
initializeApp();

module.exports = app;
