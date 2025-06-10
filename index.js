import express from 'express';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { engine } from 'express-handlebars';
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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
            const verified = jwt.verify(token, 'secret_key');
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
app.engine('handlebars', engine());
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
}

// Helper middleware for token verification
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        const verified = jwt.verify(token, 'secret_key');
        req.user = verified;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

// Routes - Views
app.get('/', (req, res) => {
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
        // Get all monitors for the current user
        const monitors = await db.all(
            'SELECT * FROM monitors WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.userId]
        );
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

        const token = jwt.sign({ userId: user.id, email: user.email }, 'secret_key', { expiresIn: '24h' });

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
        const { url } = req.body;
        
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
        await db.run(
            'INSERT INTO monitors (user_id, url) VALUES (?, ?)',
            [req.user.userId, url]
        );

        res.json({ success: true, message: 'Monitor added successfully' });
    } catch (error) {
        console.error('Error adding monitor:', error);
        res.status(500).json({ success: false, message: 'Failed to add monitor' });
    }
});

// Start server
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});
