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
