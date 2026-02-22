// gym_backend/src/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
            include: { tenant: true }
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: true, // MUST be true for SameSite='none'
            sameSite: 'none', // Allows cross-origin cookies
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            branchName: user.tenant?.branchName
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const logout = (req, res) => {
    res.cookie('token', '', { httpOnly: true, expires: new Date(0) });
    res.json({ message: 'Logged out successfully' });
};

const getMe = async (req, res) => {
    try {
        const user = req.user;
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone || '',
            address: user.address || '',
            avatar: user.avatar || user.name.charAt(0),
            status: user.status || 'Active',
            tenantId: user.tenantId,
            branchName: user.tenant?.branchName,
            joinedDate: new Date(user.joinedDate).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric'
            })
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: req.body
        });
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { login, logout, getMe, updateProfile };
