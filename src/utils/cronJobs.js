const cron = require('node-cron');
const prisma = require('../config/prisma');

// Run every day at Midnight (Server Time)
cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Running daily locker expiry check...');
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find lockers that have an expiryDate in the past
        const expiredLockers = await prisma.locker.findMany({
            where: {
                status: 'Occupied',
                expiryDate: {
                    lt: today
                }
            }
        });

        if (expiredLockers.length > 0) {
            console.log(`[CRON] Found ${expiredLockers.length} lockers to auto-release.`);

            // Release them all
            const updateCount = await prisma.locker.updateMany({
                where: {
                    id: {
                        in: expiredLockers.map(l => l.id)
                    }
                },
                data: {
                    status: 'Available',
                    assignedToId: null,
                    expiryDate: null,
                    notes: null
                }
            });

            console.log(`[CRON] Successfully released ${updateCount.count} expired lockers.`);
        } else {
            console.log('[CRON] No lockers to release today.');
        }

    } catch (error) {
        console.error('[CRON] Error checking locker expiries:', error);
    }
});

console.log('Cron jobs initialized.');
