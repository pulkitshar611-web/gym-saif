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

// Get all invoices
const getInvoices = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const role = req.user.role;

        let invoices;
        if (role === 'SUPER_ADMIN') {
            invoices = await prisma.invoice.findMany({
                include: { member: true },
                orderBy: { dueDate: 'desc' }
            });
        } else {
            invoices = await prisma.invoice.findMany({
                where: { tenantId },
                include: { member: true },
                orderBy: { dueDate: 'desc' }
            });
        }
        console.log(`[Finance] User role: ${role}, tenantId: ${tenantId}, Invoices found: ${invoices?.length}`);

        // map to shape expected by frontend UI
        const formatted = invoices.map(inv => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            memberName: inv.member ? inv.member.name : 'Unknown',
            serviceType: 'Membership',
            totalAmount: Number(inv.amount),
            paidAmount: inv.status === 'Paid' ? Number(inv.amount) : 0,
            balanceDue: inv.status === 'Paid' ? 0 : Number(inv.amount),
            status: inv.status,
            issueDate: inv.dueDate.toISOString(),
            services: [{
                name: "Membership Fee",
                quantity: 1,
                rate: Number(inv.amount),
                amount: Number(inv.amount)
            }],
            paymentHistory: inv.paidDate ? [{
                method: inv.paymentMode || 'Cash',
                date: inv.paidDate.toISOString(),
                transactionId: `TXN-REF-${inv.id}`,
                amount: Number(inv.amount)
            }] : []
        }));

        res.status(200).json(formatted);
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ message: 'Failed to fetch invoices' });
    }
};

// Receive Payment via Cashier Mode
const receivePayment = async (req, res) => {
    try {
        const { memberId, paymentType, amount, discount, method, referenceNumber, notes } = req.body;
        const tenantId = req.user.tenantId;

        if (!tenantId && req.user.role !== 'SUPER_ADMIN') {
            return res.status(400).json({ message: 'Tenant ID is required for logging a payment' });
        }

        // Calculate final amount after discount
        const baseAmount = parseFloat(amount) || 0;
        const disc = parseFloat(discount) || 0;
        const finalAmount = Math.max(0, baseAmount - disc);

        // Create an Invoice as the transaction record
        const newInvoice = await prisma.invoice.create({
            data: {
                tenantId: tenantId || 1,
                invoiceNumber: `RCPT-${Math.floor(100000 + Math.random() * 900000)}`,
                memberId: parseInt(memberId),
                amount: finalAmount,
                paymentMode: method || 'Cash',
                status: 'Paid',
                dueDate: new Date(),
                paidDate: new Date()
            },
            include: { member: true }
        });

        res.status(201).json({
            message: 'Payment received successfully',
            receipt: newInvoice
        });
    } catch (error) {
        console.error('Error receiving payment:', error);
        res.status(500).json({ message: 'Failed to process payment' });
    }
};

// Get all transactions
const getTransactions = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const role = req.user.role;

        let invoices;
        if (role === 'SUPER_ADMIN') {
            invoices = await prisma.invoice.findMany({
                where: { status: 'Paid' },
                include: { member: true },
                orderBy: { paidDate: 'desc' }
            });
        } else {
            invoices = await prisma.invoice.findMany({
                where: { tenantId, status: 'Paid' },
                include: { member: true },
                orderBy: { paidDate: 'desc' }
            });
        }

        const formatted = invoices.map(inv => ({
            id: inv.invoiceNumber,
            member: inv.member ? inv.member.name : 'Unknown',
            type: 'Membership',
            method: inv.paymentMode || 'Cash',
            amount: Number(inv.amount),
            date: inv.paidDate ? inv.paidDate.toISOString().split('T')[0] : (inv.dueDate ? inv.dueDate.toISOString().split('T')[0] : 'N/A')
        }));

        res.status(200).json(formatted);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ message: 'Failed to fetch transactions' });
    }
};

// Delete expense
const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;

        const expense = await prisma.expense.findUnique({
            where: { id: parseInt(id) }
        });

        if (!expense) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        if (req.user.role !== 'SUPER_ADMIN' && expense.tenantId !== tenantId) {
            return res.status(403).json({ message: 'Not authorized to delete this expense' });
        }

        await prisma.expense.delete({
            where: { id: parseInt(id) }
        });

        res.status(200).json({ message: 'Expense deleted successfully' });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ message: 'Failed to delete expense' });
    }
};

module.exports = {
    getExpenses,
    createExpense,
    getInvoices,
    receivePayment,
    getTransactions,
    deleteExpense
};
