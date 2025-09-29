-- PostgreSQL Schema for Nova Digital Asset Management
-- Run this script to create all tables

-- Create database (run this separately as superuser)
-- CREATE DATABASE novadam_db;
-- \c novadam_db;

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(50),
    password TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    tier_id INTEGER DEFAULT 0,
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_tx_id TEXT,
    wallet_network VARCHAR(20),
    wallet_address TEXT,
    locked_balance DECIMAL(18,6) DEFAULT 0,
    withdrawable_balance DECIMAL(18,6) DEFAULT 0,
    total_earnings DECIMAL(18,6) DEFAULT 0,
    total_withdrawal DECIMAL(18,6) DEFAULT 0,
    ad_views_today INTEGER DEFAULT 0,
    last_ad_reward_date DATE,
    daily_earnings DECIMAL(18,6) DEFAULT 0,
    last_daily_reset DATE,
    is_admin BOOLEAN DEFAULT FALSE,
    referrer_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verification_token TEXT,
    token_expiry TIMESTAMP,
    FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tiers table
CREATE TABLE tiers (
    id INTEGER PRIMARY KEY,
    price DECIMAL(18,2) NOT NULL
);

-- Payments table (legacy - for backward compatibility)
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    tier_id INTEGER NOT NULL,
    amount DECIMAL(18,6) NOT NULL,
    currency VARCHAR(20) DEFAULT 'USDT',
    status VARCHAR(50) DEFAULT 'pending',
    tx_id TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tier_id) REFERENCES tiers(id) ON DELETE CASCADE
);

-- Manual deposits table
CREATE TABLE manual_deposits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    tier_id INTEGER NOT NULL,
    amount DECIMAL(18,6) NOT NULL,
    network VARCHAR(20) NOT NULL,
    transaction_id TEXT UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER,
    approved_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tier_id) REFERENCES tiers(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Withdrawals table
CREATE TABLE withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    amount DECIMAL(18,6) NOT NULL,
    network VARCHAR(20) NOT NULL,
    wallet_address TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Revenue tracking table
CREATE TABLE revenue_tracking (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    tier_id INTEGER NOT NULL,
    amount DECIMAL(18,6) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tier_id) REFERENCES tiers(id) ON DELETE CASCADE
);

-- Admin statistics cache table
CREATE TABLE admin_stats_cache (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_revenue DECIMAL(18,6) DEFAULT 0,
    total_tier_subscriptions INTEGER DEFAULT 0,
    pending_withdrawals_count INTEGER DEFAULT 0,
    pending_withdrawals_total DECIMAL(18,6) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Announcements table
CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- User announcement views tracking
CREATE TABLE user_announcement_views (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    announcement_id INTEGER NOT NULL,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    UNIQUE(user_id, announcement_id)
);

-- Insert default tier data
INSERT INTO tiers (id, price) VALUES 
(1, 100), (2, 200), (3, 300), (4, 400), (5, 500),
(6, 700), (7, 850), (8, 1000), (9, 1200), (10, 1500),
(11, 1800), (12, 2000), (13, 2500), (14, 3000), (15, 4000),
(16, 5000), (17, 7000), (18, 10000), (19, 15000), (20, 20000),
(21, 25000), (22, 30000), (23, 35000), (24, 40000), (25, 50000);

-- Insert initial admin stats cache
INSERT INTO admin_stats_cache (id, total_revenue, total_tier_subscriptions) 
VALUES (1, 0, 0);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_referrer_id ON users(referrer_id);
CREATE INDEX idx_users_payment_status ON users(payment_status);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE INDEX idx_manual_deposits_user_id ON manual_deposits(user_id);
CREATE INDEX idx_manual_deposits_status ON manual_deposits(status);
CREATE INDEX idx_manual_deposits_created_at ON manual_deposits(created_at);
CREATE INDEX idx_manual_deposits_transaction_id ON manual_deposits(transaction_id);

CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
CREATE INDEX idx_withdrawals_created_at ON withdrawals(created_at);

CREATE INDEX idx_revenue_tracking_user_id ON revenue_tracking(user_id);
CREATE INDEX idx_revenue_tracking_transaction_type ON revenue_tracking(transaction_type);
CREATE INDEX idx_revenue_tracking_status ON revenue_tracking(status);
CREATE INDEX idx_revenue_tracking_created_at ON revenue_tracking(created_at);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_tx_id ON payments(tx_id);

CREATE INDEX idx_announcements_is_active ON announcements(is_active);
CREATE INDEX idx_announcements_created_at ON announcements(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_manual_deposits_updated_at BEFORE UPDATE ON manual_deposits 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_withdrawals_updated_at BEFORE UPDATE ON withdrawals 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_stats_cache_updated_at BEFORE UPDATE ON admin_stats_cache 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();