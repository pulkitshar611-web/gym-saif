const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all amenities for a tenant
const getAmenities = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = {};

        // If not super admin, isolation by tenantId
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const amenities = await prisma.amenity.findMany({
            where,
            orderBy: { name: 'asc' }
        });

        res.json(amenities);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add new amenity
const addAmenity = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { name, description, icon, status, gender } = req.body;

        if (!tenantId && role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Tenant ID required' });
        }

        // --- SaaS Limit Check ---
        if (role !== 'SUPER_ADMIN') {
            const subscription = await prisma.subscription.findFirst({
                where: { tenantId, status: 'Active' }
            });

            if (subscription) {
                const plan = await prisma.saaSPlan.findUnique({
                    where: { id: subscription.planId }
                });

                if (plan) {
                    // Check item count limit
                    const limits = plan.limits || {};
                    const amenityLimit = limits.amenities || { value: 99, isUnlimited: true };

                    if (!amenityLimit.isUnlimited) {
                        const currentCount = await prisma.amenity.count({ where: { tenantId } });
                        if (currentCount >= parseInt(amenityLimit.value)) {
                            return res.status(403).json({
                                message: `Amenity limit reached. Your ${plan.name} allows up to ${amenityLimit.value} amenities.`,
                                limitReached: true
                            });
                        }
                    }

                    // Check if specific name is allowed (if benefits list is defined by Super Admin)
                    const allowedBenefits = plan.benefits; // This is a Json array of benefit objects
                    if (Array.isArray(allowedBenefits) && allowedBenefits.length > 0) {
                        const isAllowed = allowedBenefits.some(b =>
                            b.name.toLowerCase() === name.toLowerCase()
                        );
                        if (!isAllowed) {
                            return res.status(403).json({
                                message: `"${name}" is not included in your current SaaS Plan (${plan.name}). Please upgrade to offer this benefit.`,
                                allowedBenefits: allowedBenefits.map(b => b.name)
                            });
                        }
                    }
                }
            }
        }

        const amenity = await prisma.amenity.create({
            data: {
                tenantId: tenantId,
                name,
                description,
                icon,
                status: status || 'Active',
                gender: gender || 'UNISEX'
            }
        });

        res.status(201).json(amenity);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update amenity
const updateAmenity = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;
        const { name, description, icon, status, gender } = req.body;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        // Check if exists first to return proper error or just use updateMany
        const existing = await prisma.amenity.findFirst({ where });
        if (!existing) {
            return res.status(404).json({ message: 'Amenity not found or access denied' });
        }

        const amenity = await prisma.amenity.update({
            where: { id: parseInt(id) },
            data: { name, description, icon, status, gender }
        });

        res.json({ message: 'Amenity updated successfully', amenity });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete amenity
const deleteAmenity = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const existing = await prisma.amenity.findFirst({ where });
        if (!existing) {
            return res.status(404).json({ message: 'Amenity not found or access denied' });
        }

        await prisma.amenity.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Amenity deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAmenities,
    addAmenity,
    updateAmenity,
    deleteAmenity
};
