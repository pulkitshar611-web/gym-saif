// gym_backend/src/app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'https://gym-management-001.netlify.app', 'https://gym-newss.kiaantechnology.com'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Routes
const authRoutes = require('./routes/auth.routes');
const superadminRoutes = require('./routes/superadmin.routes');
const adminRoutes = require('./routes/admin.routes');

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/superadmin', superadminRoutes);
app.use('/api/v1/admin', adminRoutes);

// Branch Admin Routes
const branchAdminRoutes = require('./routes/branchAdmin.routes');
const crmRoutes = require('./routes/crm.routes');
const equipmentRoutes = require('./routes/equipment.routes');
const financeRoutes = require('./routes/finance.routes');

app.use('/api/v1/branch-admin', branchAdminRoutes);
app.use('/api/v1/crm', crmRoutes);
app.use('/api/v1/equipment', equipmentRoutes);
app.use('/api/v1/finance', financeRoutes);

// Base Route
app.get('/', (req, res) => {
    res.json({ message: 'Gym CRM API is running' });
});

module.exports = app;
