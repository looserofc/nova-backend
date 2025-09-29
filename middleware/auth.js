const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const sessionManager = require('../utils/sessionManager');

const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }

      // Check if session is still active using the shared session manager
      if (!sessionManager.isValidSession(decoded.sessionId)) {
        return res.status(403).json({ error: 'Session has been terminated' });
      }

      // Verify user still exists in database
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE _id = ?').get(decoded.userId);
      
      if (!user) {
        // Remove session if user no longer exists
        sessionManager.terminateAllUserSessions(decoded.userId);
        return res.status(403).json({ error: 'User no longer exists' });
      }

      req.user = user; // Attach full user object to request
      req.sessionId = decoded.sessionId; // Attach session ID for logging
      next();
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const requirePaidSubscription = (req, res, next) => {
  if (req.user.payment_status !== 'paid') {
    return res.status(403).json({ error: 'Paid subscription required' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { 
  authenticateToken, 
  requirePaidSubscription, 
  requireAdmin 
};