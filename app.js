const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { initDatabase } = require('./database');
const initTestData = require('./scripts/init-test-data');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'https://novadam.com',
    'https://www.novadam.com',
    'http://localhost:3000' // Keep for local testing
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

    // Basic route
    app.get('/', (req, res) => {
      res.json({ 
        message: 'Nova Digital Asset Management API',
        version: '2.0.0',
        database: 'SQLite',
        status: 'Running'
      });
    });

    // Health check endpoint
    // Health check endpoint
app.get('/health', (req, res) => {
  try {
    const db = getDb();
    // Simple query to check database is alive
    db.prepare('SELECT 1').get();
    
    res.status(200).json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

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
      
      // Database connection errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return res.status(503).json({ 
          error: 'Database connection failed',
          message: 'Please check database configuration'
        });
      }

      // PostgreSQL specific errors
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({ 
          error: 'Duplicate entry',
          message: 'A record with this information already exists'
        });
      }

      if (error.code === '23503') { // Foreign key violation
        return res.status(400).json({ 
          error: 'Invalid reference',
          message: 'Referenced record does not exist'
        });
      }

      if (error.code === '23502') { // Not null violation
        return res.status(400).json({ 
          error: 'Missing required field',
          message: 'Required information is missing'
        });
      }

      // Generic server error
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      });
    });

    // Start server
    app.listen(PORT, '0.0.0.0' () => {
      console.log(`🚀 Nova Digital API Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Database: SQLite`);
      console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log('');
      console.log('📋 Available endpoints:');
      console.log('   - /auth/* (Authentication)');
      console.log('   - /payments/* (Payment processing)');
      console.log('   - /dashboard (User dashboard)');
      console.log('   - /ads/* (Advertisement system)');
      console.log('   - /withdraw/* (Withdrawal system)');
      console.log('   - /referrals/* (Referral program)');
      console.log('   - /admin/* (Admin panel)');
      console.log('');
      console.log('🔧 Admin Panel: http://localhost:3000/#admin');
    });

  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    console.error('Stack trace:', error.stack);
    
    // Provide helpful error messages
    if (error.code === 'ECONNREFUSED') {
      console.error('');
      console.error('🔴 Database connection failed!');
      console.error('Make sure PostgreSQL is running and check your .env configuration:');
      console.error('   DATABASE_URL or DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
      console.error('');
    }

    if (error.message.includes('database') && error.message.includes('does not exist')) {
      console.error('');
      console.error('🔴 Database does not exist!');
      console.error('Create the database first:');
      console.error('   sudo -u postgres createdb nova_db');
      console.error('');
    }

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

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
initializeApp();

// Export for testing
module.exports = app;
