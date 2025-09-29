// Shared session manager for the entire application
class SessionManager {
  constructor() {
    this.activeSessions = new Map();
  }

  // Create a new session
  createSession(sessionId, userData) {
    this.activeSessions.set(sessionId, {
      userId: userData.userId,
      username: userData.username,
      loginTime: Date.now(),
      ...userData
    });
    return sessionId;
  }

  // Get session by ID
  getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  // Check if session exists and is valid
  isValidSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    // Check if session is expired (24 hours)
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return (now - session.loginTime) < twentyFourHours;
  }

  // Terminate a session
  terminateSession(sessionId) {
    return this.activeSessions.delete(sessionId);
  }

  // Terminate all sessions for a user
  terminateAllUserSessions(userId) {
    for (let [sessionId, session] of this.activeSessions.entries()) {
      if (session.userId == userId) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  // Clean up expired sessions
  cleanupExpiredSessions() {
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    for (let [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.loginTime > twentyFourHours) {
        this.activeSessions.delete(sessionId);
      }
    }
  }
}

// Create a singleton instance
const sessionManager = new SessionManager();

// Clean up expired sessions every hour
setInterval(() => {
  sessionManager.cleanupExpiredSessions();
}, 60 * 60 * 1000);

module.exports = sessionManager;