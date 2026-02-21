// gym_backend/src/controllers/member.controller.js
const prisma = require('../config/prisma');

const upgradePlan = async (req, res) => {
    try {
        const { newPlan } = req.body;
        // In a real implementation this would find the membership plan, calculate prorated amounts, create an invoice etc
        res.json({ message: 'Plan upgraded successfully', newPlan });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const cancelMembership = async (req, res) => {
    try {
        // Find member associated with this user
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        await prisma.member.update({
            where: { id: member.id },
            data: { status: 'Cancelled' }
        });
        res.json({ message: 'Membership cancelled successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getWalletTransactions = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const wallet = await prisma.wallet.findUnique({
            where: { memberId: member.id },
            include: { transactions: { orderBy: { createdAt: 'desc' } } }
        });

        res.json(wallet ? wallet.transactions : []);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addWalletCredit = async (req, res) => {
    try {
        const { amount } = req.body;
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        let wallet = await prisma.wallet.findUnique({ where: { memberId: member.id } });
        if (!wallet) {
            wallet = await prisma.wallet.create({ data: { memberId: member.id, balance: 0 } });
        }

        const newBalance = parseFloat(wallet.balance) + parseFloat(amount);

        await prisma.$transaction([
            prisma.wallet.update({
                where: { id: wallet.id },
                data: { balance: newBalance }
            }),
            prisma.transaction.create({
                data: {
                    walletId: wallet.id,
                    amount: parseFloat(amount),
                    type: 'Credit',
                    description: 'Added Credits via App'
                }
            })
        ]);

        res.json({ message: 'Credits added successfully', balance: newBalance });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyBookings = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const bookings = await prisma.booking.findMany({
            where: { memberId: member.id },
            include: { class: { include: { trainer: true } } },
            orderBy: { date: 'desc' }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createBooking = async (req, res) => {
    try {
        const { classId, date } = req.body;
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const booking = await prisma.booking.create({
            data: {
                memberId: member.id,
                classId: parseInt(classId),
                date: new Date(date),
                status: 'Upcoming'
            }
        });
        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const cancelBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const member = await prisma.member.findUnique({ where: { userId: req.user.id } });

        const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });
        if (!booking || booking.memberId !== member.id) return res.status(403).json({ message: 'Unauthorized or not found' });

        await prisma.booking.update({
            where: { id: parseInt(id) },
            data: { status: 'Cancelled' }
        });

        res.json({ message: 'Booking cancelled' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const rescheduleBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { newDate } = req.body;

        await prisma.booking.update({
            where: { id: parseInt(id) },
            data: { date: new Date(newDate) }
        });

        res.json({ message: 'Booking rescheduled' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const freezeMembership = async (req, res) => {
    try {
        res.json({ message: 'Membership frozen successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const unfreezeMembership = async (req, res) => {
    try {
        res.json({ message: 'Membership unfrozen successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getInvoices = async (req, res) => {
    try {
        const invoices = [
            { id: "INV-0082", date: "May 10, 2024", amount: 2499.00, status: "Paid", dueDate: "May 10, 2024" },
            { id: "INV-0065", date: "April 10, 2024", amount: 2499.00, status: "Paid", dueDate: "April 10, 2024" },
            { id: "INV-0042", date: "March 10, 2024", amount: 2499.00, status: "Unpaid", dueDate: "Mar 10, 2024" },
            { id: "INV-0012", date: "Feb 10, 2024", amount: 2499.00, status: "Partial", dueDate: "Feb 10, 2024" },
        ];
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const payInvoice = async (req, res) => {
    try {
        res.json({ message: 'Invoice paid successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getWalletBalance = async (req, res) => {
    try {
        res.json({ balance: 1240 }); // Mock balance
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSavedCards = async (req, res) => {
    try {
        const cards = [
            { id: 1, name: 'HDFC Card', number: '4242', expiry: '12/26', brand: 'HDFC' },
            { id: 2, name: 'ICICI Card', number: '8899', expiry: '08/25', brand: 'ICICI' },
        ];
        res.json(cards);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addSavedCard = async (req, res) => {
    try {
        const newCard = { ...req.body, id: Date.now() };
        res.json({ message: 'Card added successfully', card: newCard });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMembershipDetails = async (req, res) => {
    try {
        const details = {
            currentPlan: 'Silver Monthly',
            startDate: 'April 10, 2024',
            expiryDate: 'October 10, 2025',
            status: 'Active',
            daysRemaining: 240,
            freezeStatus: 'No'
        };
        res.json(details);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getServiceRequests = async (req, res) => {
    try {
        const requests = [
            { id: 1, type: 'Freeze Request', details: 'Jan 10 – Jan 20', status: 'Approved', date: '2025-01-15', rawType: 'Freeze' },
            { id: 2, type: 'Trainer Change', details: 'Powerlifting Coach', status: 'Pending', date: '2025-02-10', rawType: 'TrainerChange' },
        ];
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addServiceRequest = async (req, res) => {
    try {
        const newReq = { ...req.body, id: Date.now() };
        res.json({ message: 'Service request submitted', request: newReq });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberProfile = async (req, res) => {
    try {
        res.json({ id: 'MEM-2024-005', name: 'Vikram Malhotra', status: 'Active' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    upgradePlan,
    cancelMembership,
    getWalletTransactions,
    addWalletCredit,
    getMyBookings,
    createBooking,
    cancelBooking,
    rescheduleBooking,
    freezeMembership,
    unfreezeMembership,
    getInvoices,
    payInvoice,
    getWalletBalance,
    getSavedCards,
    addSavedCard,
    getMembershipDetails,
    getServiceRequests,
    addServiceRequest,
    getMemberProfile
};
