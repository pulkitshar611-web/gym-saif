const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllPromos = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        let where = {};

        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const promos = await prisma.promoCode.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json(promos);
    } catch (error) {
        console.error("Get promos error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.createPromo = async (req, res) => {
    try {
        const { code, type, value, usageLimit, expiryDate, status } = req.body;
        const tenantId = req.user.tenantId || 1;

        const existing = await prisma.promoCode.findUnique({ where: { code } });
        if (existing) {
            return res.status(400).json({ message: "Promo code already exists" });
        }

        const promo = await prisma.promoCode.create({
            data: {
                tenantId,
                code: code.toUpperCase(),
                type,
                value: parseFloat(value),
                usageLimit: usageLimit ? parseInt(usageLimit) : null,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                status
            }
        });

        res.status(201).json(promo);
    } catch (error) {
        console.error("Create promo error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.updatePromo = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, type, value, usageLimit, expiryDate, status } = req.body;

        const promo = await prisma.promoCode.update({
            where: { id: parseInt(id) },
            data: {
                code: code.toUpperCase(),
                type,
                value: parseFloat(value),
                usageLimit: usageLimit ? parseInt(usageLimit) : null,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                status
            }
        });

        res.json(promo);
    } catch (error) {
        console.error("Update promo error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.deletePromo = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.promoCode.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Promo code deleted successfully' });
    } catch (error) {
        console.error("Delete promo error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.validatePromo = async (req, res) => {
    try {
        const { code } = req.params;

        const promo = await prisma.promoCode.findUnique({
            where: { code: code.toUpperCase() }
        });

        if (!promo) {
            return res.status(404).json({ message: "Invalid promo code" });
        }

        if (promo.status !== 'Active') {
            return res.status(400).json({ message: "Promo code is inactive" });
        }

        if (promo.expiryDate && new Date() > promo.expiryDate) {
            return res.status(400).json({ message: "Promo code has expired" });
        }

        if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
            return res.status(400).json({ message: "Promo code usage limit reached" });
        }

        res.json(promo);
    } catch (error) {
        console.error("Validate promo error:", error);
        res.status(500).json({ message: error.message });
    }
};
