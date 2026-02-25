const prisma = require('../config/prisma');

// --- LEADS ---

const createLead = async (req, res) => {
    try {
        const tenantId = req.user.tenantId; // SaaS Isolation
        const {
            name, phone, email, gender, age, interests, source,
            budgetRange, preferredContact, assignedTo, followUpDate, followUpTime, notes
        } = req.body;

        // Combine date and time to nextFollowUp
        let nextFollowUp = null;
        if (followUpDate) {
            nextFollowUp = new Date(followUpDate);
            if (followUpTime) {
                const [hours, minutes] = followUpTime.split(':');
                nextFollowUp.setHours(hours, minutes);
            }
        }

        const lead = await prisma.lead.create({
            data: {
                tenantId: tenantId ? tenantId : 1, // Default to 1 if superadmin (dev mode safety)
                name,
                phone,
                email,
                gender,
                age: age ? parseInt(age) : null,
                interests: interests || [],
                source,
                budget: budgetRange,
                preferredContact,
                assignedToId: assignedTo ? parseInt(assignedTo) : null,
                notes,
                nextFollowUp,
                status: 'New'
            }
        });

        // Create initial follow-up task if date is provided
        if (nextFollowUp) {
            await prisma.followUp.create({
                data: {
                    leadId: lead.id,
                    status: 'Pending',
                    nextDate: nextFollowUp,
                    notes: 'Initial Follow-up Schedule'
                }
            });
        }

        res.status(201).json(lead);
    } catch (error) {
        console.error('Create Lead Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getLeads = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const where = tenantId ? { tenantId } : {}; // Superadmin sees all? Or restrict? Let's restrict if tenantId is present.

        // Search & Filter
        const { search, status, assignedTo } = req.query;

        if (status && status !== 'All') where.status = status;

        // Strict: Trainers only see their assigned leads
        if (req.user.role === 'TRAINER') {
            where.assignedToId = req.user.id;
        } else if (assignedTo) {
            where.assignedToId = parseInt(assignedTo);
        }

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } }
            ];
        }

        const leads = await prisma.lead.findMany({
            where,
            include: {
                followUps: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                },
                assignedTo: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(leads);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateLeadStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const lead = await prisma.lead.findUnique({ where: { id: parseInt(id) } });
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        if (status === 'Converted' && lead.status !== 'Converted') {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('123456', 10);
            const userEmail = lead.email || `member${Date.now()}@empty.com`;

            // Create user
            const newUser = await prisma.user.create({
                data: {
                    name: lead.name,
                    email: userEmail,
                    password: hashedPassword,
                    phone: lead.phone,
                    role: 'MEMBER',
                    tenantId: lead.tenantId,
                    status: 'Active'
                }
            });

            // Create Member profile
            await prisma.member.create({
                data: {
                    userId: newUser.id,
                    tenantId: lead.tenantId,
                    memberId: `MEM-${Date.now()}`,
                    name: lead.name,
                    email: userEmail,
                    phone: lead.phone,
                    status: 'Active',
                    joinDate: new Date()
                }
            });
        }

        const updatedLead = await prisma.lead.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        res.json(updatedLead);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- FOLLOW-UPS ---

const getTodayFollowUps = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Find leads that have a nextFollowUp date within today
        const leads = await prisma.lead.findMany({
            where: {
                tenantId: tenantId ? tenantId : undefined,
                nextFollowUp: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                status: { notIn: ['Converted', 'Lost'] }
            },
            include: {
                assignedTo: { select: { id: true, name: true } }
            }
        });

        res.json(leads);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addFollowUp = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { notes, nextDate, status } = req.body;

        const followUp = await prisma.followUp.create({
            data: {
                leadId: parseInt(leadId),
                notes,
                nextDate: nextDate ? new Date(nextDate) : null,
                status: status || 'Completed'
            }
        });

        // Update lead's next follow-up and status if needed
        await prisma.lead.update({
            where: { id: parseInt(leadId) },
            data: {
                nextFollowUp: nextDate ? new Date(nextDate) : null,
                updatedAt: new Date()
            }
        });

        res.status(201).json(followUp);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createLead,
    getLeads,
    updateLeadStatus,
    getTodayFollowUps,
    addFollowUp
};
