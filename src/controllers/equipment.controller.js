const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all equipment for a tenant
const getAllEquipment = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { search, category } = req.query;

        const where = { tenantId };

        if (category && category !== 'All') {
            where.category = category;
        }

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { serialNumber: { contains: search } }
            ];
        }

        const equipment = await prisma.equipment.findMany({
            where,
            include: {
                maintenance: true
            },
            orderBy: { id: 'desc' }
        });

        res.json(equipment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add new equipment
const addEquipment = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { name, brand, model, serialNumber, category, location, purchaseDate, warrantyExpiry, status } = req.body;

        const equipment = await prisma.equipment.create({
            data: {
                tenantId,
                name,
                brand,
                model,
                serialNumber,
                category,
                location,
                purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
                warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
                status: status || 'Operational'
            }
        });

        res.status(201).json(equipment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update equipment
const updateEquipment = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;
        const updateData = req.body;

        if (updateData.warrantyExpiry) {
            updateData.warrantyExpiry = new Date(updateData.warrantyExpiry);
        }

        if (updateData.purchaseDate) {
            updateData.purchaseDate = new Date(updateData.purchaseDate);
        }

        const equipment = await prisma.equipment.updateMany({
            where: { id: parseInt(id), tenantId },
            data: updateData
        });

        res.json({ message: 'Equipment updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete equipment
const deleteEquipment = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        await prisma.equipment.deleteMany({
            where: { id: parseInt(id), tenantId }
        });

        res.json({ message: 'Equipment deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Report Issue (Maintenance Request)
const reportIssue = async (req, res) => {
    try {
        const { equipmentId, issue, priority } = req.body;
        const { tenantId } = req.user;

        // Verify equipment belongs to tenant
        const equipment = await prisma.equipment.findFirst({
            where: { id: parseInt(equipmentId), tenantId }
        });

        if (!equipment) {
            return res.status(404).json({ message: 'Equipment not found' });
        }

        const request = await prisma.maintenanceRequest.create({
            data: {
                equipmentId: parseInt(equipmentId),
                issue,
                priority,
                status: 'Pending'
            }
        });

        // Optionally update equipment status
        if (priority === 'High' || priority === 'Critical') {
            await prisma.equipment.update({
                where: { id: parseInt(equipmentId) },
                data: { status: 'Out of Order' }
            });
        }

        res.status(201).json(request);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all maintenance requests
const getMaintenanceRequests = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { status, priority } = req.query;

        const where = {
            equipment: {
                tenantId
            }
        };

        if (status && status !== 'All') {
            where.status = status;
        }

        if (priority) {
            where.priority = priority;
        }

        const requests = await prisma.maintenanceRequest.findMany({
            where,
            include: {
                equipment: true
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update Maintenance Status
const updateMaintenanceStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { tenantId } = req.user;

        // Verify ownership through equipment
        const request = await prisma.maintenanceRequest.findFirst({
            where: {
                id: parseInt(id),
                equipment: {
                    tenantId
                }
            }
        });

        if (!request) {
            return res.status(404).json({ message: 'Maintenance request not found' });
        }

        await prisma.maintenanceRequest.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        res.json({ message: 'Maintenance status updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllEquipment,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    reportIssue,
    getMaintenanceRequests,
    updateMaintenanceStatus
};
