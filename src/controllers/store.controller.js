const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cloudinary = require('../utils/cloudinary');

exports.getProducts = async (req, res) => {
    try {
        const { category, search, allStatus } = req.query;
        let where = {};

        if (req.user && req.user.role !== 'SUPER_ADMIN') {
            where.tenantId = req.user.tenantId;
        }

        if (allStatus !== 'true') {
            where.status = { not: 'Inactive' };
        }

        if (category && category !== 'All') {
            where.category = category;
        }

        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
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

exports.addProduct = async (req, res) => {
    try {
        const { name, sku, category, price, stock, description, image, originalPrice } = req.body;
        const tenantId = req.user.tenantId || 1;

        // calculate status based on stock
        let status = 'Active';
        if (parseInt(stock) === 0) status = 'Inactive';
        else if (parseInt(stock) <= 10) status = 'Low Stock';

        // upload image if it's base64
        let imageUrl = image;
        if (image && image.startsWith('data:image')) {
            const uploadRes = await cloudinary.uploader.upload(image, {
                folder: 'gym/store/products'
            });
            imageUrl = uploadRes.secure_url;
        }

        const product = await prisma.storeProduct.create({
            data: {
                tenantId,
                name,
                sku,
                category,
                price: parseFloat(price),
                stock: parseInt(stock),
                status,
                description,
                image: imageUrl,
                originalPrice: originalPrice ? parseFloat(originalPrice) : null,
            }
        });

        res.status(201).json(product);
    } catch (error) {
        console.error("Create product error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.updateStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { stock } = req.body;

        const status = parseInt(stock) === 0 ? 'Inactive' : (parseInt(stock) <= 10 ? 'Low Stock' : 'Active');

        const updatedProduct = await prisma.storeProduct.update({
            where: { id: parseInt(id) },
            data: {
                stock: parseInt(stock),
                status
            }
        });

        res.json(updatedProduct);
    } catch (error) {
        console.error("Update stock error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, sku, category, price, stock, description, image, originalPrice, status } = req.body;

        // Auto calculate status if stock updated and status is not explicitly set to something else
        let calculatedStatus = status || 'Active';
        if (parseInt(stock) === 0) calculatedStatus = 'Inactive';
        else if (parseInt(stock) <= 10 && calculatedStatus !== 'Inactive') calculatedStatus = 'Low Stock';

        // upload image if it's base64
        let imageUrl = image;
        if (image && image.startsWith('data:image')) {
            const uploadRes = await cloudinary.uploader.upload(image, {
                folder: 'gym/store/products'
            });
            imageUrl = uploadRes.secure_url;
        }

        const product = await prisma.storeProduct.update({
            where: { id: parseInt(id) },
            data: {
                name,
                sku,
                category,
                price: parseFloat(price),
                stock: parseInt(stock),
                status: calculatedStatus,
                description,
                image: imageUrl,
                originalPrice: originalPrice ? parseFloat(originalPrice) : null,
            }
        });

        res.json(product);
    } catch (error) {
        console.error("Update product error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.storeProduct.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error("Delete product error:", error);
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
