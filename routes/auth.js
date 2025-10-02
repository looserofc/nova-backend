const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const sessionManager = require('../utils/sessionManager');

// Email transporter setup (optional - only if configured)
let transporter = null;
if (process.env.EMAIL && process.env.EMAIL_PASSWORD) {
  try {
    transporter = nodemailer.createTransport({
      service: 'smtp.hostinger.com',         //gmail
      host: 'smtp.hostinger.com',   //smtp.gmail.com
      port: 465,                //587
      secure: true,            //false
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // Verify transporter configuration
    transporter.verify(function(error, success) {
      if (error) {
        console.log('Email transporter setup failed:', error.message);
        transporter = null;
      } else {
        console.log('Email transporter configured successfully');
      }
    });
  } catch (error) {
    console.log('Email transporter setup failed:', error.message);
    transporter = null;
  }
} else {
  console.log('Email credentials not configured - email verification will be skipped');
}

// Generate verification token
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate session ID
const generateSessionId = () => {
  return crypto.randomBytes(16).toString('hex');
};

// Send verification email
const sendVerificationEmail = async (email, token) => {
  if (!transporter) {
    console.log('Email not configured - skipping verification email');
    return { success: false, error: 'Email not configured' };
  }

  const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || 'http://localhost:5000';
  const verificationLink = `${backendUrl}/auth/verify-email?token=${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: 'Verify Your Nova Digital Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2C3E50;">Welcome to Nova Digital!</h2>
        <p>Thank you for registering. Please verify your email address to activate your account.</p>
        <a href="${verificationLink}" 
           style="background-color: #2C3E50; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 5px; display: inline-block;">
          Verify Email Address
        </a>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all;">${verificationLink}</p>
        <p>This link will expire in 24 hours.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    console.error('Failed to send verification email:', error.message);
    return { success: false, error: error.message };
  }
};

// Register endpoint with email verification
router.post('/register', async (req, res) => {
  try {
    const { email, username, phone, password, confirmPassword, referralId } = req.body;

    // Validation
    if (!email || !username || !phone || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();

    // Check if user already exists
    const existingEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const existingUsername = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Check referral ID if provided
    let referrerId = null;
    if (referralId) {
      const referrer = db.prepare('SELECT _id FROM users WHERE username = ? OR _id = ?').get(referralId, referralId);
      if (referrer) {
        referrerId = referrer._id;
      }
    }

    // For development/testing: auto-verify if no email configured
    const isVerified = !transporter ? 1 : 0;

    // Insert user with verification token
    const insertUser = db.prepare(`
      INSERT INTO users (email, username, phone_number, password, referrer_id, verification_token, token_expiry, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertUser.run(email, username, phone, hashedPassword, referrerId, verificationToken, tokenExpiry, isVerified);
    
    let emailSent = false;
    let emailError = null;

    // Send verification email if configured
    if (transporter) {
      try {
        const emailResult = await sendVerificationEmail(email, verificationToken);
        if (emailResult.success) {
          emailSent = true;
          console.log('Verification email sent to:', email);
        } else {
          emailError = emailResult.error;
          console.log('Email sending failed, but user registered:', emailError);
        }
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Continue with registration even if email fails
      }
    } else {
      console.log('Email not configured - user auto-verified for development');
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: result.lastInsertRowid, 
        isAdmin: false,
        isVerified: isVerified === 1,
        username: username
      }, 
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    const responseMessage = transporter 
      ? (emailSent 
          ? 'Registration successful! Please check your email to verify your account.' 
          : 'Registration successful! But verification email failed. Please contact support.')
      : 'Registration successful! (Development mode - email verification skipped)';

    res.status(201).json({
      message: responseMessage,
      token: token,
      user: {
        id: result.lastInsertRowid,
        email,
        username,
        phone,
        isAdmin: false,
        isVerified: isVerified === 1
      },
      needsVerification: transporter && !emailSent
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email verification endpoint
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const db = getDb();

    // Find user with this token
    const user = db.prepare('SELECT * FROM users WHERE verification_token = ? AND token_expiry > ?')
      .get(token, new Date().toISOString());

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Update user as verified
    db.prepare('UPDATE users SET is_verified = 1, verification_token = NULL, token_expiry = NULL WHERE _id = ?')
      .run(user._id);

    // Redirect to success page or send JSON response
    if (req.accepts('html')) {
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: green;">Email Verified Successfully!</h2>
            <p>Your email has been verified. You can now login to your account.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="color: #2C3E50;">Go to Login</a>
          </body>
        </html>
      `);
    } else {
      res.json({ message: 'Email verified successfully' });
    }
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!transporter) {
      return res.status(400).json({ error: 'Email service not configured' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_verified = 0').get(email);

    if (!user) {
      return res.status(400).json({ error: 'User not found or already verified' });
    }

    // Generate new token
    const newToken = generateVerificationToken();
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Update user with new token
    db.prepare('UPDATE users SET verification_token = ?, token_expiry = ? WHERE _id = ?')
      .run(newToken, tokenExpiry, user._id);

    // Send new verification email
    try {
      const emailResult = await sendVerificationEmail(email, newToken);
      if (emailResult.success) {
        res.json({ message: 'Verification email sent successfully' });
      } else {
        res.status(500).json({ error: 'Failed to send verification email: ' + emailResult.error });
      }
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      res.status(500).json({ error: 'Failed to send verification email' });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint (updated to check verification)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDb();

    // Find user by username or email
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if email is verified (only if email service is configured)
    // FIX: Check if transporter exists before using it
    if (transporter && !user.is_verified) {
      return res.status(403).json({ 
        error: 'Email not verified. Please check your email for verification link.',
        needsVerification: true 
      });
    }

    // Generate session ID
    const sessionId = generateSessionId();
    
    // Store session using the shared session manager
    sessionManager.createSession(sessionId, {
      userId: user._id,
      username: user.username,
      loginTime: Date.now()
    });

    // Generate JWT token with session ID
    const token = jwt.sign(
      { 
        userId: user._id, 
        isAdmin: user.isAdmin,
        username: user.username,
        sessionId: sessionId
      }, 
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        phone: user.phone_number,
        tier: user.tier_id,
        paymentStatus: user.payment_status,
        isAdmin: user.isAdmin,
        isVerified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced token verification endpoint
router.get('/verify-token', (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        valid: false, 
        error: 'No token provided',
        shouldLogout: true 
      });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, decoded) => {
      if (err) {
        return res.status(401).json({ 
          valid: false, 
          error: 'Invalid or expired token',
          shouldLogout: true 
        });
      }

      // Check if session is still active using the shared session manager
      if (!sessionManager.isValidSession(decoded.sessionId)) {
        return res.status(401).json({ 
          valid: false, 
          error: 'Session has been terminated',
          shouldLogout: true 
        });
      }

      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE _id = ?').get(decoded.userId);
      
      if (!user) {
        // Remove session if user no longer exists
        sessionManager.terminateAllUserSessions(decoded.userId);
        return res.status(401).json({ 
          valid: false, 
          error: 'User not found',
          shouldLogout: true 
        });
      }

      res.status(200).json({ 
        valid: true, 
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          phone: user.phone_number,
          tier: user.tier_id,
          paymentStatus: user.payment_status,
          isAdmin: user.isAdmin,
          isVerified: user.is_verified
        }
      });
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ 
      valid: false, 
      error: 'Internal server error',
      shouldLogout: true 
    });
  }
});

// Enhanced logout endpoint that terminates sessions
router.post('/logout', (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      try {
        // Decode the token to get session ID without verifying expiration
        const decoded = jwt.decode(token);
        if (decoded && decoded.sessionId) {
          // Remove the session using shared session manager
          sessionManager.terminateSession(decoded.sessionId);
          console.log('Session terminated for user:', decoded.username);
        }
      } catch (decodeError) {
        console.log('Could not decode token for logout:', decodeError.message);
      }
    }
    
    res.json({ 
      message: 'Logged out successfully',
      success: true 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error', success: false });
  }
});

// Force logout all sessions for a user (admin function)
router.post('/force-logout/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    // Remove all sessions for this user
    sessionManager.terminateAllUserSessions(userId);
    
    res.json({ 
      message: 'All sessions terminated for user',
      success: true 
    });
  } catch (error) {
    console.error('Force logout error:', error);
    res.status(500).json({ error: 'Internal server error', success: false });
  }
});

// Forgot password endpoint
router.post('/forgot-password', (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const db = getDb();
    
    // Check if email exists
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      // For security, don't reveal if email exists or not
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }
    
    // In a real app, generate a reset token and send email
    res.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const db = getDb();
    
    // Check if user exists
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashedPassword, email);
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
