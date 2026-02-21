const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all expenses
const getExpenses = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const role = req.user.role;

        let expenses;
        if (role === 'SUPER_ADMIN') {
            expenses = await prisma.expense.findMany({
                orderBy: { date: 'desc' }
            });
        } else {
            expenses = await prisma.expense.findMany({
                where: { tenantId },
                orderBy: { date: 'desc' }
            });
        }

        res.status(200).json(expenses);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ message: 'Failed to fetch expenses' });
    }
};

// Add new expense
const createExpense = async (req, res) => {
    try {
        const { title, category, amount, date, notes, status } = req.body;
        const tenantId = req.user.tenantId;

        if (!tenantId && req.user.role !== 'SUPER_ADMIN') {
            return res.status(400).json({ message: 'Tenant ID is required for creating an expense' });
        }

        const newExpense = await prisma.expense.create({
            data: {
                tenantId: tenantId || 1, // Fallback for superadmin testing if needed
                title,
                category,
                amount: parseFloat(amount),
                date: new Date(date),
                status: status || 'Pending',
                notes: notes || null,
                addedBy: req.user.name || 'Admin',
            }
        });

        res.status(201).json(newExpense);
    } catch (error) {
        console.error('Error adding expense:', error);
        res.status(500).json({ message: 'Failed to add expense' });
    }
};

module.exports = {
    getExpenses,
    createExpense
};
