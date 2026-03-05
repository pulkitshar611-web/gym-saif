const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET Stats for Communication Hub
const getCommStats = async (req, res) => {
    try {
        const { branchId } = req.query;
        const tenantId = branchId && branchId !== 'all' ? parseInt(branchId) : (req.user.tenantId || 1);

        const [totalAnnouncements, activeAnnouncements, totalLogs, totalTemplates] = await Promise.all([
            prisma.announcement.count({ where: { tenantId } }),
            prisma.announcement.count({ where: { tenantId, status: 'Active' } }),
            prisma.communicationLog.count({ where: { tenantId } }),
            prisma.messageTemplate.count({ where: { tenantId } })
        ]);

        res.json({
            totalAnnouncements,
            activeAnnouncements,
            messagesSent: totalLogs,
            templates: totalTemplates
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET Announcements
const getAnnouncements = async (req, res) => {
    try {
        const { branchId, search, portal } = req.query;
        const tenantId = branchId && branchId !== 'all' ? parseInt(branchId) : (req.user.tenantId || 1);
        const { role } = req.user;

        let where = { tenantId };

        // If accessed from Member Portal or user is a Member, apply privacy filters
        if (portal === 'member' || role === 'MEMBER') {
            where.status = 'Active';
            where.targetRole = { in: ['all', 'member', 'MEMBER'] };
        } else if (role === 'TRAINER') {
            where.status = 'Active';
            where.targetRole = { in: ['all', 'TRAINER'] };
        }
        // ADMIN roles see everything for management

        if (search) {
            where.AND = [
                {
                    OR: [
                        { title: { contains: search } },
                        { content: { contains: search } }
                    ]
                }
            ];
        }

        const announcements = await prisma.announcement.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json(announcements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// CREATE Announcement
const createAnnouncement = async (req, res) => {
    try {
        const { title, content, targetRole, priority, status } = req.body;
        const tenantId = req.user.tenantId || 1;
        const authorId = req.user.id;

        const announcement = await prisma.announcement.create({
            data: {
                tenantId,
                authorId,
                title,
                content,
                targetRole: targetRole || 'all',
                priority: parseInt(priority) || 0,
                status: status || 'Active'
            }
        });

        res.status(201).json(announcement);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET Templates
const getTemplates = async (req, res) => {
    try {
        const { branchId, channel } = req.query;
        const tenantId = branchId && branchId !== 'all' ? parseInt(branchId) : (req.user.tenantId || 1);

        let where = { tenantId };
        if (channel) where.channel = channel;

        const templates = await prisma.messageTemplate.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json(templates);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// SEND Broadcast
const sendBroadcast = async (req, res) => {
    try {
        const { channel, message, audience, templateId, memberId } = req.body;
        const tenantId = req.user.tenantId || 1;
        const senderId = req.user.id;

        // In a real app, this would integrate with WhatsApp/SMS/Email providers
        const log = await prisma.communicationLog.create({
            data: {
                tenantId,
                senderId,
                memberId: memberId ? parseInt(memberId) : null,
                channel: channel || 'WhatsApp',
                message,
                status: 'Sent'
            }
        });

        res.json({ message: `Message sent via ${channel}`, log });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET Communication Logs
const getCommLogs = async (req, res) => {
    try {
        const { branchId, memberId } = req.query;
        const tenantId = branchId && branchId !== 'all' ? parseInt(branchId) : (req.user.tenantId || 1);

        const logs = await prisma.communicationLog.findMany({
            where: {
                tenantId,
                ...(memberId ? { memberId: parseInt(memberId) } : {})
            },
            include: {
                // You might want to include the sender user name later
            },
            orderBy: { createdAt: 'asc' }, // Ascending for chat flow
            take: 100
        });

        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// CREATE Template
const createTemplate = async (req, res) => {
    try {
        const { title, tag, body, channel } = req.body;
        const tenantId = req.user.tenantId || 1;

        const template = await prisma.messageTemplate.create({
            data: {
                tenantId,
                name: title,
                category: tag || 'General',
                content: body,
                channel: channel || 'WhatsApp'
            }
        });

        res.status(201).json(template);
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ message: error.message });
    }
};

// DELETE Template
const deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.messageTemplate.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET Chat Contacts (Members + Staff + Trainers)
const getChatContacts = async (req, res) => {
    try {
        const { branchId, search } = req.query;
        const { tenantId: userTenantId, role: userRole, id: currentUserId } = req.user;

        // Force user's own tenantId unless they are SUPER_ADMIN
        let tenantId = userTenantId;
        if (userRole === 'SUPER_ADMIN' && branchId && branchId !== 'all') {
            tenantId = parseInt(branchId);
        }

        if (!tenantId) {
            return res.status(400).json({ message: "Tenant ID required" });
        }

        const [members, users] = await Promise.all([
            prisma.member.findMany({
                where: {
                    tenantId,
                    ...(search ? {
                        OR: [
                            { name: { contains: search } },
                            { phone: { contains: search } },
                            { memberId: { contains: search } }
                        ]
                    } : {})
                },
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    status: true,
                    avatar: true,
                    memberId: true,
                    userId: true
                },
                take: 100
            }),
            prisma.user.findMany({
                where: {
                    tenantId,
                    status: 'Active',
                    ...(search ? {
                        OR: [
                            { name: { contains: search } },
                            { phone: { contains: search } },
                            { email: { contains: search } }
                        ]
                    } : {})
                },
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    status: true,
                    avatar: true,
                    role: true
                },
                take: 100
            })
        ]);

        // Deduplication Logic
        const contactMap = new Map();

        // 1. Process Users (Staff/Admins) first - they get priority for their "Staff Role"
        users.forEach(u => {
            if (u.id === currentUserId) return; // Don't show self
            contactMap.set(u.phone || `user-${u.id}`, {
                id: u.id,
                name: u.name,
                phone: u.phone,
                status: u.status,
                avatar: u.avatar,
                type: u.role,
                isStaff: true
            });
        });

        // 2. Process Members
        members.forEach(m => {
            const key = m.phone || `member-${m.id}`;
            // If the person is already in the map as a User/Staff, we keep the Staff entry
            // but we can merge data if needed. Here, we prioritize the Staff role.
            if (!contactMap.has(key)) {
                contactMap.set(key, {
                    id: m.id,
                    name: m.name,
                    phone: m.phone,
                    status: m.status,
                    avatar: m.avatar,
                    type: 'MEMBER',
                    memberId: m.memberId,
                    isStaff: false
                });
            }
        });

        const finalContacts = Array.from(contactMap.values());

        res.json(finalContacts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getCommStats,
    getAnnouncements,
    createAnnouncement,
    getTemplates,
    createTemplate,
    deleteTemplate,
    sendBroadcast,
    getCommLogs,
    getChatContacts
};
