const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getProducts = async (req, res) => {
    try {
        const { category, search } = req.query;
        let where = { status: 'Active' };

        if (category && category !== 'All') {
            where.category = category;
        }

        if (search) {
            where.name = { contains: search };
        }

        const products = await prisma.storeProduct.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.checkout = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { memberId, cartItems, totalAmount } = req.body;

        const order = await prisma.$transaction(async (tx) => {
            const memberRaw = await tx.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
            const member = memberRaw[0];
            if (!member && role === 'MEMBER') {
                throw new Error("Member not found");
            }
            const actualMemberId = role === 'MEMBER' ? member.id : parseInt(memberId) || 1;
            const actualTenantId = role === 'MEMBER' ? member.tenantId : tenantId;

            let finalTotal = 0;
            let itemsCount = 0;
            const orderItemsInput = [];

            for (const item of cartItems) {
                const product = await tx.storeProduct.findUnique({ where: { id: item.id } });
                if (!product) throw new Error(`Product ${item.id} not found`);
                if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);

                await tx.storeProduct.update({
                    where: { id: product.id },
                    data: { stock: product.stock - item.quantity }
                });

                finalTotal += parseFloat(product.price) * parseInt(item.quantity);
                itemsCount += parseInt(item.quantity);

                orderItemsInput.push({
                    productId: product.id,
                    quantity: item.quantity,
                    priceAtBuy: product.price
                });
            }

            const newOrder = await tx.storeOrder.create({
                data: {
                    tenantId: actualTenantId,
                    memberId: actualMemberId,
                    itemsCount,
                    total: finalTotal,
                    status: 'Processing',
                    items: {
                        create: orderItemsInput
                    }
                }
            });
            return newOrder;
        });

        res.status(201).json(order);
    } catch (error) {
        console.error("Store checkout error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.getOrders = async (req, res) => {
    try {
        const { role } = req.user;

        let where = {};
        if (role === 'MEMBER') {
            const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
            const member = memberRaw[0];
            if (!member) return res.status(404).json({ message: 'Member profile not found' });

            where.memberId = member.id;
        } else if (role !== 'SUPER_ADMIN') {
            where.tenantId = req.user.tenantId;
        }

        const orders = await prisma.storeOrder.findMany({
            where,
            include: {
                member: true,
                items: {
                    include: {
                        product: true
                    }
                }
            },
            orderBy: { date: 'desc' }
        });

        const formatted = orders.map(o => ({
            id: o.id,
            total: o.total,
            items: o.itemsCount,
            status: o.status,
            date: new Date(o.date).toISOString().split('T')[0],
            member: o.member?.name || 'Unknown'
        }));

        res.json(formatted);
    } catch (error) {
        console.error("Store orders error:", error);
        res.status(500).json({ message: error.message });
    }
};
