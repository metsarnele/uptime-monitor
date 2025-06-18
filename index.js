import express from 'express';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { engine } from 'express-handlebars';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { getEmailService } from './services/emailServiceFactory.js';
import monitorService from './services/monitorService.js';
import cors from 'cors';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Initialize email service (will be set during startup)
let emailService = null;

// Check for important environment variables
const requiredEnvVars = {
    JWT_SECRET: 'JWT secret for signing authentication tokens',
    MAILGUN_API_KEY: 'Mailgun API key for sending email notifications',
    MAILGUN_DOMAIN: 'Mailgun domain for sending email notifications',
    NODE_ENV: 'Node environment (development, production, test)'
};

const missingVars = [];

for (const [varName, description] of Object.entries(requiredEnvVars)) {
    if (!process.env[varName]) {
        missingVars.push({ name: varName, description });
    }
}

if (missingVars.length > 0) {
    console.error('ERROR: Required environment variables are missing:');
    console.error('');
    missingVars.forEach(({ name, description }) => {
        console.error(`  ${name}: ${description}`);
    });
    console.error('');
    console.error('Please set these variables in your .env file or environment variables.');
    console.error('See .env.example for reference.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Validate PORT is a valid number
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    console.error(`ERROR: PORT must be a valid number between 1 and 65535. Current value: ${PORT}`);
    process.exit(1);
}

app.use(cors({
  origin: [
    'https://mg.brigitakasemets.me',
    'https://monitor.brigitakasemets.me',
    'http://localhost:3000', // development
    'http://localhost:3001', // development backup
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Auth middleware to check if user is logged in
app.use((req, res, next) => {
    const token = req.cookies.authToken;
    res.locals.isAuthenticated = false;

    if (token) {
        try {
            const verified = jwt.verify(token, process.env.JWT_SECRET);
            req.user = verified;
            res.locals.isAuthenticated = true;
        } catch (error) {
            // Invalid token, user not authenticated
        }
    }
    next();
});

// Middleware to require authentication
const requireAuth = (req, res, next) => {
    if (!res.locals.isAuthenticated) {
        return res.redirect('/signin');
    }
    next();
};

// Setup Handlebars
app.engine('handlebars', engine({
    helpers: {
        eq: function(a, b) {
            return a === b;
        }
    }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Initialize database
let db;
async function initDb() {
    // Use TEST_DB environment variable if available, otherwise use default database
    const dbFilename = process.env.TEST_DB || 'database.sqlite';

    db = await open({
        filename: dbFilename,
        driver: sqlite3.Database
    });

    await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'pending',
      last_checked DATETIME,
      response_time INTEGER,
      notifications_enabled BOOLEAN DEFAULT 1,
      last_notification_sent DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    // Initialize monitoring service
    await monitorService.initialize(db);
    
    // Start monitoring in production
    if (process.env.NODE_ENV !== 'test') {
        monitorService.startMonitoring();
    }
}

// Helper middleware for token verification
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

// Routes - Views
app.get('/', (req, res) => {
    // Redirect authenticated users to dashboard
    if (res.locals.isAuthenticated) {
        return res.redirect('/dashboard');
    }
    res.render('home');
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.get('/signin', (req, res) => {
    const registered = req.query.registered === 'true';
    res.render('signin', { registered });
});

app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        // Get all monitors for the current user with their latest stats
        const monitors = await db.all(`
            SELECT 
                m.*,
                (SELECT COUNT(*) FROM monitor_status_history h WHERE h.monitor_id = m.id AND h.checked_at > datetime('now', '-24 hours')) as checks_today,
                (SELECT COUNT(*) FROM monitor_status_history h WHERE h.monitor_id = m.id AND h.status = 'up' AND h.checked_at > datetime('now', '-24 hours')) as up_checks_today,
                datetime(m.last_checked, 'localtime') as last_checked_local
            FROM monitors m 
            WHERE m.user_id = ? 
            ORDER BY m.created_at DESC
        `, [req.user.userId]);

        // Calculate uptime percentage for each monitor
        monitors.forEach(monitor => {
            if (monitor.checks_today > 0) {
                monitor.uptime_percentage = ((monitor.up_checks_today / monitor.checks_today) * 100).toFixed(1);
            } else {
                monitor.uptime_percentage = 0;
            }
            
            // Use the local time version instead of UTC
            if (monitor.last_checked_local) {
                monitor.last_checked = monitor.last_checked_local;
            }
        });

        res.render('dashboard', { monitors });
    } catch (error) {
        console.error('Error fetching monitors:', error);
        res.render('dashboard', { monitors: [], error: 'Failed to load monitors' });
    }
});

app.get('/signout', (req, res) => {
    res.clearCookie('authToken');
    res.redirect('/');
});

// Routes - API
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Password validation
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must meet requirements' });
        }

        const hashedPassword = await bcryptjs.hash(password, 10);

        await db.run(
            'INSERT INTO users (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );

        // Send welcome email
        emailService.sendWelcomeEmail(email).catch(error => {
            console.error('Failed to send welcome email:', error);
        });

        res.json({ message: 'Account created successfully' });
    } catch (error) {
        res.status(400).json({ error: 'Email already exists' });
    }
});

app.post('/api/signin', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

        if (!user || !await bcryptjs.compare(password, user.password)) {
            return res.status(401).json({ 
                success: false, 
                message: 'Incorrect email or password' 
            });
        }

        const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.cookie('authToken', token, { httpOnly: true });

        res.json({
            success: true, 
            user: { id: user.id, email: user.email },
            token,
            message: 'Sign in successful'
        });
    } catch (error) {
        console.error('Sign-in error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred during sign-in'
        });
    }
});

// Monitor API routes
app.post('/api/monitors', requireAuth, async (req, res) => {
    try {
        const { url, name, notifications_enabled = true } = req.body;
        
        // Validate URL format
        const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\w \.-]*)*\/?$/;
        if (!urlRegex.test(url)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid URL' });
        }

        // Check if user is already monitoring this URL
        const existingMonitor = await db.get(
            'SELECT * FROM monitors WHERE user_id = ? AND url = ?',
            [req.user.userId, url]
        );

        if (existingMonitor) {
            return res.status(400).json({ success: false, message: 'You are already monitoring this URL' });
        }

        // Add the new monitor
        const result = await db.run(
            'INSERT INTO monitors (user_id, url, name, notifications_enabled) VALUES (?, ?, ?, ?)',
            [req.user.userId, url, name || null, notifications_enabled ? 1 : 0]
        );

        // Immediately check the new monitor
        const newMonitor = await db.get(`
            SELECT m.*, u.email as user_email 
            FROM monitors m 
            JOIN users u ON m.user_id = u.id 
            WHERE m.id = ?
        `, [result.lastID]);

        // Check the monitor status asynchronously
        monitorService.checkMonitor(newMonitor).catch(error => {
            console.error('Failed to check new monitor:', error);
        });

        res.json({ success: true, message: 'Monitor added successfully' });
    } catch (error) {
        console.error('Error adding monitor:', error);
        res.status(500).json({ success: false, message: 'Failed to add monitor' });
    }
});

// Update monitor settings
app.put('/api/monitors/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, notifications_enabled } = req.body;

        // Verify the monitor belongs to the user
        const monitor = await db.get(
            'SELECT * FROM monitors WHERE id = ? AND user_id = ?',
            [id, req.user.userId]
        );

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        // Update monitor
        await db.run(
            'UPDATE monitors SET name = ?, notifications_enabled = ? WHERE id = ?',
            [name || null, notifications_enabled ? 1 : 0, id]
        );

        res.json({ success: true, message: 'Monitor updated successfully' });
    } catch (error) {
        console.error('Error updating monitor:', error);
        res.status(500).json({ success: false, message: 'Failed to update monitor' });
    }
});

// Delete monitor
app.delete('/api/monitors/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify the monitor belongs to the user
        const monitor = await db.get(
            'SELECT * FROM monitors WHERE id = ? AND user_id = ?',
            [id, req.user.userId]
        );

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        // Delete monitor and its history
        await db.run('DELETE FROM notification_log WHERE monitor_id = ?', [id]);
        await db.run('DELETE FROM monitor_status_history WHERE monitor_id = ?', [id]);
        await db.run('DELETE FROM monitors WHERE id = ?', [id]);

        res.json({ success: true, message: 'Monitor deleted successfully' });
    } catch (error) {
        console.error('Error deleting monitor:', error);
        res.status(500).json({ success: false, message: 'Failed to delete monitor' });
    }
});

// Get monitor stats
app.get('/api/monitors/:id/stats', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { hours = 24 } = req.query;

        // Verify the monitor belongs to the user
        const monitor = await db.get(
            'SELECT *, datetime(last_checked, "localtime") as last_checked_local FROM monitors WHERE id = ? AND user_id = ?',
            [id, req.user.userId]
        );

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }
        
        // Use local time instead of UTC
        if (monitor.last_checked_local) {
            monitor.last_checked = monitor.last_checked_local;
        }

        const stats = await monitorService.getMonitorStats(id, parseInt(hours));
        
        // Get recent status history with local time
        const history = await db.all(`
            SELECT status, response_time, datetime(checked_at, 'localtime') as checked_at, error_message
            FROM monitor_status_history 
            WHERE monitor_id = ? 
            AND checked_at > datetime('now', '-${parseInt(hours)} hours')
            ORDER BY checked_at DESC
            LIMIT 100
        `, [id]);

        res.json({ 
            success: true, 
            monitor,
            stats,
            history 
        });
    } catch (error) {
        console.error('Error getting monitor stats:', error);
        res.status(500).json({ success: false, message: 'Failed to get monitor stats' });
    }
});

// Test email configuration
console.log('Registering /api/test-email endpoint');
app.post('/api/test-email', requireAuth, async (req, res) => {
    console.log('Processing test email request from user:', req.user?.userId);
    try {
        const user = await db.get('SELECT email FROM users WHERE id = ?', [req.user.userId]);
        
        if (!user) {
            console.log('User not found for test email');
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        console.log('Sending test email to:', user.email);
        const result = await emailService.testConfiguration(user.email);
        
        console.log('Email test result:', result);
        if (result.success) {
            res.json({ success: true, message: 'Test email sent successfully' });
        } else {
            res.status(500).json({ success: false, message: result.error });
        }
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({ success: false, message: 'Failed to send test email' });
    }
});

// Get all monitors for user
app.get('/api/monitors', requireAuth, async (req, res) => {
    try {
        const monitors = await db.all(`
            SELECT 
                m.*,
                (SELECT COUNT(*) FROM monitor_status_history h WHERE h.monitor_id = m.id AND h.checked_at > datetime('now', '-24 hours')) as checks_today,
                (SELECT COUNT(*) FROM monitor_status_history h WHERE h.monitor_id = m.id AND h.status = 'up' AND h.checked_at > datetime('now', '-24 hours')) as up_checks_today,
                datetime(m.last_checked, 'localtime') as last_checked_local
            FROM monitors m 
            WHERE m.user_id = ? 
            ORDER BY m.created_at DESC
        `, [req.user.userId]);

        // Calculate uptime percentage for each monitor
        monitors.forEach(monitor => {
            if (monitor.checks_today > 0) {
                monitor.uptime_percentage = ((monitor.up_checks_today / monitor.checks_today) * 100).toFixed(1);
            } else {
                monitor.uptime_percentage = 0;
            }
            
            // Use the local time version instead of UTC
            if (monitor.last_checked_local) {
                monitor.last_checked = monitor.last_checked_local;
            }
        });

        res.json({ success: true, monitors });
    } catch (error) {
        console.error('Error fetching monitors:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch monitors' });
    }
});

// Start server
async function startServer() {
    try {
        await initDb();
        
        // Initialize email service
        emailService = await getEmailService();
        console.log('📧 Email service initialized');
        
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            
            // Log email service configuration status
            if (emailService.getSentEmails) {
                console.log('🧪 Mock email service active - emails will be captured for testing');
            } else if (process.env.MAILGUN_API_KEY) {
                console.log('✅ Mailgun configured - email notifications enabled');
            } else {
                console.log('⚠️  Mailgun not configured - email notifications disabled');
                console.log('   Set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables');
            }
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();