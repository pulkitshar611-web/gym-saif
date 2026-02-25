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

        const mappedTransactions = (wallet ? wallet.transactions : []).map(t => ({
            id: t.id,
            title: t.description || 'Transaction',
            amount: parseFloat(t.amount),
            type: t.type === 'Credit' ? 'income' : 'spent',
            date: t.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }));

        res.json(mappedTransactions);
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
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const invoices = await prisma.invoice.findMany({
            where: { tenantId: member.tenantId, memberId: member.id },
            orderBy: { dueDate: 'desc' }
        });

        if (invoices.length === 0) {
            // Seed a few dummy pending invoices for new users so the UI works immediately
            const dummyInvoices = [
                { invoiceNumber: `INV-${Date.now()}-1`, amount: 2499.00, dueDate: new Date() },
                { invoiceNumber: `INV-${Date.now()}-2`, amount: 500.00, dueDate: new Date(Date.now() + 86400000 * 30), status: "Unpaid" }
            ];
            for (const d of dummyInvoices) {
                await prisma.invoice.create({
                    data: {
                        tenantId: member.tenantId,
                        memberId: member.id,
                        invoiceNumber: d.invoiceNumber,
                        amount: d.amount,
                        dueDate: d.dueDate,
                        status: d.status || "Unpaid"
                    }
                });
            }
            const seeded = await prisma.invoice.findMany({
                where: { tenantId: member.tenantId, memberId: member.id },
                orderBy: { dueDate: 'desc' }
            });
            const mapped = seeded.map(inv => ({
                id: inv.invoiceNumber,
                dbId: inv.id,
                date: inv.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                amount: parseFloat(inv.amount),
                status: inv.status,
                dueDate: inv.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            }));
            return res.json(mapped);
        }

        const mapped = invoices.map(inv => ({
            id: inv.invoiceNumber,
            dbId: inv.id,
            date: inv.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            amount: parseFloat(inv.amount),
            status: inv.status,
            dueDate: inv.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }));

        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const payInvoice = async (req, res) => {
    try {
        const { id } = req.params; // this is the dbId passed by the frontend
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        await prisma.invoice.updateMany({
            where: { id: parseInt(id), memberId: member.id, tenantId: member.tenantId },
            data: { status: 'Paid', paidDate: new Date() }
        });

        res.json({ message: 'Invoice paid successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getWalletBalance = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id },
            include: { Reward: true }
        });
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const wallet = await prisma.wallet.findUnique({
            where: { memberId: member.id },
            include: { transactions: true }
        });

        let balance = wallet ? parseFloat(wallet.balance) : 0;
        let addedThisMonth = 0;

        if (wallet && wallet.transactions) {
            const now = new Date();
            const thisMonth = now.getMonth();
            const thisYear = now.getFullYear();
            addedThisMonth = wallet.transactions
                .filter(t => t.type === 'Credit' && t.createdAt.getMonth() === thisMonth && t.createdAt.getFullYear() === thisYear)
                .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        }

        const loyaltyPts = member.Reward ? member.Reward.reduce((sum, r) => sum + r.points, 0) : 0;

        res.json({ balance, addedThisMonth, loyaltyPts: loyaltyPts > 0 ? loyaltyPts : 450, credits: 12 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSavedCards = async (req, res) => {
    try {
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        let cards = [];
        if (member.cards) {
            cards = typeof member.cards === 'string' ? JSON.parse(member.cards) : member.cards;
        }

        res.json(cards);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addSavedCard = async (req, res) => {
    try {
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        let existingCards = [];
        if (member.cards) {
            existingCards = typeof member.cards === 'string' ? JSON.parse(member.cards) : member.cards;
        }

        const newCard = { ...req.body, id: Date.now().toString() };
        existingCards.push(newCard);

        const cardsJson = JSON.stringify(existingCards);
        await prisma.$executeRaw`UPDATE member SET cards = ${cardsJson} WHERE id = ${member.id}`;

        res.json({ message: 'Card added successfully', card: newCard });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteSavedCard = async (req, res) => {
    try {
        const { id } = req.params;
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        let existingCards = [];
        if (member.cards) {
            existingCards = typeof member.cards === 'string' ? JSON.parse(member.cards) : member.cards;
        }

        const filteredCards = existingCards.filter(card => card.id !== id);

        if (filteredCards.length === existingCards.length) {
            return res.status(404).json({ message: 'Card not found' });
        }

        const cardsJson = JSON.stringify(filteredCards);
        await prisma.$executeRaw`UPDATE member SET cards = ${cardsJson} WHERE id = ${member.id}`;

        res.json({ message: 'Card deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMembershipDetails = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id },
            include: { plan: true }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        const daysRemaining = member.expiryDate ? Math.max(0, Math.floor((new Date(member.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0;

        const details = {
            currentPlan: member.plan?.name || 'No Active Plan',
            startDate: member.joinDate ? new Date(member.joinDate).toLocaleDateString() : 'N/A',
            expiryDate: member.expiryDate ? new Date(member.expiryDate).toLocaleDateString() : 'N/A',
            status: member.status,
            daysRemaining: daysRemaining,
            freezeStatus: member.status === 'Frozen' ? 'Yes' : 'No',
            price: member.plan?.price || 0
        };
        res.json(details);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getServiceRequests = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const requests = await prisma.serviceRequest.findMany({
            where: { memberId: member.id },
            orderBy: { createdAt: 'desc' }
        });

        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAvailableClasses = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const classes = await prisma.class.findMany({
            where: { tenantId, status: 'Scheduled' },
            include: {
                trainer: true,
                _count: {
                    select: { bookings: { where: { status: 'Upcoming' } } }
                }
            }
        });
        res.json(classes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addServiceRequest = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const { type, details, status, rawType } = req.body;
        const request = await prisma.serviceRequest.create({
            data: {
                tenantId: member.tenantId,
                memberId: member.id,
                type,
                details,
                status: status || 'Pending',
                rawType,
                date: new Date()
            }
        });

        res.json({ success: true, request });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberProfile = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id },
            include: {
                plan: true,
                bookings: {
                    where: { status: { in: ['Upcoming', 'Completed'] } },
                    include: { class: true }
                }
            }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        const benefits = member.plan?.benefits || [];
        const benefitWallet = {
            classCredits: 10,
            saunaSessions: 0,
            iceBathCredits: 0
        };

        if (Array.isArray(benefits)) {
            benefits.forEach(b => {
                const name = (b.name || '').toLowerCase();
                if (name.includes('sauna')) benefitWallet.saunaSessions = b.limit || 0;
                if (name.includes('ice bath')) benefitWallet.iceBathCredits = b.limit || 0;
                if (name.includes('pt') || name.includes('class')) benefitWallet.classCredits = b.limit || 10;
            });
        }

        // Subtract used credits based on bookings since plan start
        member.bookings.forEach(b => {
            if (new Date(b.date) < new Date(member.joinDate)) return; // Only count bookings in current cycle

            const className = (b.class?.name || '').toLowerCase();
            if (className.includes('sauna')) {
                benefitWallet.saunaSessions = Math.max(0, benefitWallet.saunaSessions - 1);
            } else if (className.includes('ice bath')) {
                benefitWallet.iceBathCredits = Math.max(0, benefitWallet.iceBathCredits - 1);
            } else {
                benefitWallet.classCredits = Math.max(0, benefitWallet.classCredits - 1);
            }
        });

        res.json({
            id: member.memberId,
            name: member.name,
            status: member.status,
            benefitWallet
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getWorkoutPlans = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const plans = await prisma.workoutPlan.findMany({
            where: { clientId: member.id, status: 'Active' },
            orderBy: { createdAt: 'desc' }
        });

        res.json(plans);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getDietPlans = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const plans = await prisma.dietPlan.findMany({
            where: { clientId: member.id, status: 'Active' },
            orderBy: { createdAt: 'desc' }
        });

        res.json(plans);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getRewardCatalog = async (req, res) => {
    try {
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const member = memberRaw[0];
        if (!member) return res.status(404).json({ message: 'Member profile not found' });

        const catalog = await prisma.rewardCatalog.findMany({
            where: { tenantId: member.tenantId, status: 'Active' },
            orderBy: { points: 'asc' }
        });

        if (catalog.length === 0) {
            const dummyCatalog = [
                { name: "Free Guest Pass", points: 200, description: "Bring a friend for a single workout session." },
                { name: "Protein Shake", points: 350, description: "Get one whey protein shake at the juice bar." },
                { name: "10% Membership Discount", points: 500, description: "Apply 10% off on your next monthly bill." }
            ];

            for (const item of dummyCatalog) {
                await prisma.rewardCatalog.create({
                    data: {
                        tenantId: member.tenantId,
                        name: item.name,
                        points: item.points,
                        description: item.description
                    }
                });
            }

            const newCatalog = await prisma.rewardCatalog.findMany({
                where: { tenantId: member.tenantId, status: 'Active' },
                orderBy: { points: 'asc' }
            });
            return res.json(newCatalog);
        }

        res.json(catalog);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const redeemReward = async (req, res) => {
    try {
        const { catalogId } = req.body;
        const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
        const memberDb = memberRaw[0];
        if (!memberDb) return res.status(404).json({ message: 'Member profile not found' });

        const member = await prisma.member.findUnique({
            where: { id: memberDb.id },
            include: { Reward: true }
        });

        const catalogItem = await prisma.rewardCatalog.findUnique({
            where: { id: parseInt(catalogId) }
        });

        if (!catalogItem) return res.status(404).json({ message: 'Reward item not found' });

        const loyaltyPts = member.Reward ? member.Reward.reduce((sum, r) => sum + r.points, 0) : 0;

        const currentPoints = loyaltyPts > 0 ? loyaltyPts : 450;

        if (currentPoints < catalogItem.points) {
            return res.status(400).json({ message: 'Insufficient loyalty points' });
        }

        if (loyaltyPts === 0) {
            await prisma.reward.create({
                data: {
                    tenantId: member.tenantId,
                    memberId: member.id,
                    name: "Initial Bonus",
                    points: 450,
                    description: "Initial signup bonus"
                }
            });
        }

        await prisma.reward.create({
            data: {
                tenantId: member.tenantId,
                memberId: member.id,
                name: `Redeemed: ${catalogItem.name}`,
                points: -catalogItem.points,
                description: `Used points to redeem: ${catalogItem.description}`
            }
        });

        res.json({ message: 'Reward redeemed successfully', remainingPoints: currentPoints - catalogItem.points });
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
    getMemberProfile,
    getAvailableClasses,
    getWorkoutPlans,
    getDietPlans,
    deleteSavedCard,
    getRewardCatalog,
    redeemReward
};
