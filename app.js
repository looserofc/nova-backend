const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - SIMPLIFIED FOR DEPLOYMENT
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://novadam.com', 'https://www.novadam.com']
    : ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// IMMEDIATE Health check endpoint - CRITICAL FOR RENDER
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Nova App',
    database: 'initializing'
  });
});

// Basic route - available immediately
app.get('/', (req, res) => {
  res.json({ 
    message: 'Nova Digital Asset Management API',
    version: '2.0.0',
    status: 'Initializing...'
  });
});

// Async initialization function
async function initializeApp() {
  try {
    console.log('Starting application initialization...');
    
    // Initialize database with timeout
    console.log('Initializing database...');
    const { initDatabase } = require('./database');
    
    // Set a timeout for database initialization
    const dbInitPromise = initDatabase();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database initialization timeout')), 30000);
    });
    
    await Promise.race([dbInitPromise, timeoutPromise]);
    console.log('Database initialized successfully');

    // Initialize test data (non-blocking)
    console.log('Initializing test data...');
    try {
      const initTestData = require('./scripts/init-test-data');
      await initTestData();
      console.log('Test data initialized');
    } catch (testDataError) {
      console.warn('Test data initialization failed, continuing:', testDataError.message);
    }

    // Import routes after database is initialized
    console.log('Loading routes...');
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

    // Update health check to include database status
    app.get('/health', async (req, res) => {
      try {
        const { getDb } = require('./database');
        const db = getDb();
        // Simple query to check database connection
        db.prepare('SELECT 1 as test').get();
        res.json({ 
          status: 'OK', 
          database: 'connected',
          timestamp: new Date().toISOString(),
          version: '2.0.0'
        });
      } catch (error) {
        res.status(500).json({ 
          status: 'ERROR', 
          database: 'disconnected', 
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    });

    // Update root endpoint
    app.get('/', (req, res) => {
      res.json({ 
        message: 'Nova Digital Asset Management API',
        version: '2.0.0',
        database: 'SQLite',
        status: 'Running'
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

    console.log('🚀 Application initialized successfully');
    
  } catch (error) {
    console.error('❌ Application initialization failed:', error.message);
    
    // Don't crash the app, just log the error and continue
    app.use('*', (req, res) => {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Application is initializing, please try again shortly'
      });
    });
  }
}

// Start server IMMEDIATELY, then initialize
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  
  // Initialize app after server starts
  initializeApp().then(() => {
    console.log('✅ Application fully operational');
  }).catch(err => {
    console.error('❌ Application initialization failed:', err);
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  
  try {
    const { closeDatabase } = require('./database');
    closeDatabase();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error closing database:', error);
  }
  
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.log('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = app;
