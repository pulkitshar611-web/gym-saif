const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getManagerDashboard = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const activeMembers = await prisma.member.count({
            where: { tenantId, status: 'Active' }
        });

        const classesToday = await prisma.class.count({
            where: { tenantId } // Simplified for now
        });

        const paymentsDue = await prisma.invoice.count({
            where: { tenantId, status: 'Overdue' }
        });

        // Financials
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch Today's Classes (Attendance substitute)
        const realClasses = await prisma.class.findMany({
            where: { tenantId },
            take: 3
        }).catch(() => []);

        const attendance = realClasses.map((cls, i) => ({
            id: cls.id,
            name: cls.name,
            time: cls.startTime || '10:00 AM',
            attendees: 0, // Should be calculated using Bookings relation if extended
            capacity: cls.capacity || 20
        }));

        // Fetch Tasks and Notices
        const tasksAndNotices = [];
        const maintenanceTasks = await prisma.maintenanceRequest.findMany({
            where: { equipment: { tenantId }, status: { not: 'Resolved' } },
            take: 1,
            include: { equipment: true }
        }).catch(() => []);

        maintenanceTasks.forEach(t => {
            tasksAndNotices.push({
                id: t.id,
                type: 'urgent',
                title: 'Equipment Service Due',
                description: `${t.equipment?.name || 'Equipment'} needs maintenance.`,
                dueDate: new Date(t.createdAt).toLocaleDateString()
            });
        });

        // Remove fallback



        const todayInvoices = await prisma.invoice.findMany({
            where: { tenantId, paidDate: { gte: today, lt: tomorrow } }
        });
        const collectionToday = todayInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

        const overdueInvoices = await prisma.invoice.findMany({
            where: { tenantId, status: 'Overdue' }
        });
        const pendingDuesAmount = overdueInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

        const expenses = await prisma.expense.findMany({
            where: { tenantId, date: { gte: today, lt: tomorrow } }
        }).catch(() => []); // In case Expense model doesn't exist yet
        const localExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

        // Equipment Stats
        const equipmentList = await prisma.equipment.findMany({
            where: { tenantId }
        }).catch(() => []);

        const totalAssets = equipmentList.length;
        const outOfOrder = equipmentList.filter(eq => eq.status === 'Maintenance' || eq.status === 'Broken').length;
        const operational = totalAssets - outOfOrder;

        res.json({
            activeMembers,
            classesToday,
            paymentsDue,
            attendance,
            collectionToday,
            pendingDuesAmount,
            localExpenses,
            equipmentStats: {
                totalAssets,
                operational,
                outOfOrder
            },
            tasksAndNotices
        });
    } catch (error) {
        console.error('Manager Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getStaffDashboard = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const staffId = req.user.id;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const checkinsToday = await prisma.attendance.count({
            where: { tenantId, date: { gte: today, lt: tomorrow } }
        });

        const newEnquiriesToday = await prisma.lead.count({
            where: { tenantId, status: 'New', createdAt: { gte: today, lt: tomorrow } }
        });

        const assignedTasks = await prisma.task.count({
            where: { assignedToId: staffId, status: { not: 'Completed' } }
        });

        const pendingPayments = await prisma.invoice.count({
            where: { tenantId, status: 'Unpaid' }
        });

        const highPriorityTasks = await prisma.task.count({
            where: { assignedToId: staffId, status: { not: 'Completed' }, priority: 'High' }
        });

        const upcomingClasses = await prisma.class.count({
            where: { tenantId, status: { not: 'Completed' } }
        });

        // Pending Actions: Unpaid Invoices & New Inquiries
        const unpaidInvoices = await prisma.invoice.findMany({
            where: { tenantId, status: 'Unpaid' },
            take: 2,
            orderBy: { dueDate: 'asc' }
        });

        const recentEnquiries = await prisma.lead.findMany({
            where: { tenantId, status: { not: 'Contacted' } },
            take: 2,
            orderBy: { createdAt: 'desc' }
        });

        const pendingActions = [
            ...unpaidInvoices.map(inv => ({
                type: 'Payment',
                title: 'Payment Due',
                subtitle: `Invoice #${inv.invoiceNumber} (₹${inv.amount})`
            })),
            ...recentEnquiries.map(enq => ({
                type: 'Enquiry',
                title: 'New Enquiry',
                subtitle: `${enq.name || 'Walk-in'} (${enq.phone || 'No phone'})`
            }))
        ];

        // Equipment Alerts
        const equipmentAlerts = await prisma.maintenanceRequest.findMany({
            where: { equipment: { tenantId }, status: { not: 'Resolved' } },
            take: 5,
            include: { equipment: true }
        });

        const formattedEquipmentAlerts = equipmentAlerts.map(req => ({
            id: req.id,
            equipmentId: req.equipment.id,
            equipmentName: req.equipment.name,
            issue: req.issue,
            priority: req.priority,
            status: req.status,
            reportedAt: req.createdAt,
        }));

        const todayInvoices = await prisma.invoice.findMany({
            where: { tenantId, paidDate: { gte: today, lt: tomorrow } }
        });
        const collectionToday = todayInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

        // Let's get actual staff shift or random default
        const userStaff = await prisma.user.findUnique({ where: { id: staffId } });
        const todayShift = userStaff?.shift || '09:00 - 17:00';

        const checkinRecords = await prisma.attendance.findMany({
            where: { tenantId, date: { gte: today } },
            take: 10,
            orderBy: { date: 'desc' },
            include: { user: true }
        });

        const memberUserIds = checkinRecords.map(c => c.userId).filter(id => id);
        const members = await prisma.member.findMany({
            where: { userId: { in: memberUserIds } },
            include: { plan: true, wallet: true }
        });

        const formattedCheckins = checkinRecords.map((c, i) => {
            const memberProfile = members.find(m => m.userId === c.userId);
            return {
                id: c.id,
                member: memberProfile?.name || c.user?.name || 'Unknown User',
                plan: memberProfile?.plan?.name || 'Walk-in / No Plan',
                expiry: memberProfile?.expiryDate ? new Date(memberProfile.expiryDate).toLocaleDateString() : 'N/A',
                balance: memberProfile?.wallet?.balance ? Number(memberProfile.wallet.balance) : 0,
                time: new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'Allowed',
                photo: c.user?.avatar || `https://i.pravatar.cc/150?u=${c.userId}`
            };
        });

        const sevenDaysFromNow = new Date(today);
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

        const expiringMemberships = await prisma.member.findMany({
            where: {
                tenantId,
                expiryDate: { gte: today, lte: sevenDaysFromNow }
            },
            take: 5,
            orderBy: { expiryDate: 'asc' },
            include: { plan: true }
        });

        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentlyExpiredMemberships = await prisma.member.findMany({
            where: {
                tenantId,
                expiryDate: { gte: thirtyDaysAgo, lt: today }
            },
            take: 5,
            orderBy: { expiryDate: 'desc' },
            include: { plan: true }
        });

        const renewalAlerts = {
            expiringSoon: expiringMemberships.map(m => ({
                id: m.id,
                memberName: m.name || 'Unknown Member',
                planName: m.plan?.name || 'Unknown Plan',
                endDate: m.expiryDate
            })),
            recentlyExpired: recentlyExpiredMemberships.map(m => ({
                id: m.id,
                memberName: m.name || 'Unknown Member',
                planName: m.plan?.name || 'Unknown Plan',
                endDate: m.expiryDate
            }))
        };

        // My Earnings Snapshot
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-indexed

        const currentPayroll = await prisma.payroll.findFirst({
            where: {
                staffId,
                month: currentMonth,
                year: currentYear
            }
        });

        const user = await prisma.user.findUnique({ where: { id: staffId } });
        const baseSalary = user.baseSalary ? Number(user.baseSalary) : 20000;

        const totalEarnings = currentPayroll ? Number(currentPayroll.amount) : baseSalary;
        const myEarnings = {
            total: totalEarnings,
            status: currentPayroll ? currentPayroll.status : 'Estimated',
            month: today.toLocaleString('default', { month: 'long' })
        };

        res.json({
            checkinsToday,
            pendingPayments,
            newEnquiries: newEnquiriesToday,
            activeUpdates: checkinsToday + newEnquiriesToday,
            todayShift,
            assignedTasks,
            highPriorityTasks,
            upcomingClasses,
            collectionToday,
            pendingActions,
            equipmentAlerts: formattedEquipmentAlerts.length > 0 ? formattedEquipmentAlerts : [/* fallback if needed via UI */],
            renewalAlerts,
            checkins: formattedCheckins.length > 0 ? formattedCheckins : [],
            myEarnings
        });
    } catch (error) {
        console.error('Staff Dashboard Error:', error);
        require('fs').writeFileSync('staff-dash-err.txt', error.stack || error.toString());
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getTrainerDashboard = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const trainerId = req.user.id;

        // 1. Basic Stats
        const members = await prisma.member.findMany({
            where: { tenantId, trainerId },
            include: {
                progress: {
                    orderBy: { date: 'desc' },
                    take: 1
                },
                dietPlans: { where: { status: 'Active' }, take: 1 },
                workoutPlans: { where: { status: 'Active' }, take: 1 }
            }
        });

        const totalMembers = members.length;

        // 2. Today's Schedule & Stats
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; // Use local date components 

        const allClasses = await prisma.class.findMany({
            where: {
                tenantId,
                trainerId,
            }
        });

        // Filter for classes happening today based on the JSON schedule field
        const todayClasses = allClasses.filter(c => {
            if (!c.schedule) return false;
            const sched = typeof c.schedule === 'string' ? JSON.parse(c.schedule) : c.schedule;
            return sched.date === todayStr;
        });

        const sessionsTodayCount = todayClasses.length;

        // 3. Pending Plans (Members without workout or diet plan)
        const pendingPlans = members.filter(m => m.dietPlans.length === 0 || m.workoutPlans.length === 0).length;

        // 4. Format Schedule for Frontend - Try to extract time from schedule JSON
        const scheduleList = todayClasses.map(c => {
            let time = '09:00 AM';
            try {
                const sched = typeof c.schedule === 'string' ? JSON.parse(c.schedule) : c.schedule;
                time = sched.time || time;
            } catch (e) { }

            return {
                id: c.id,
                time,
                name: c.name,
                type: 'Class',
                status: c.status || 'Upcoming',
                location: c.location || 'Main Floor'
            };
        });

        const todaySessions = {
            summary: {
                total: sessionsTodayCount,
                upcoming: todayClasses.filter(c => c.status !== 'Completed').length,
                completed: todayClasses.filter(c => c.status === 'Completed').length
            },
            list: scheduleList
        };

        // 5. My Clients with Progress
        const myClients = members.map(m => {
            const latestProgress = m.progress[0];
            let progressPercent = 0;
            if (latestProgress && m.targetWeight && latestProgress.weight) {
                const startWeight = m.progress[m.progress.length - 1]?.weight || latestProgress.weight;
                const totalDiff = Math.abs(Number(startWeight) - Number(m.targetWeight));
                const currentDiff = Math.abs(Number(startWeight) - Number(latestProgress.weight));
                progressPercent = totalDiff > 0 ? Math.min(Math.round((currentDiff / totalDiff) * 100), 100) : 100;
            } else if (latestProgress) {
                progressPercent = 50;
            }

            return {
                id: m.id,
                name: m.name || 'Test Member',
                progress: progressPercent,
                lastVisit: latestProgress ? new Date(latestProgress.date).toLocaleDateString() : 'N/A',
                daysSinceLastVisit: latestProgress ? Math.floor((new Date() - new Date(latestProgress.date)) / (1000 * 60 * 60 * 24)) : 30,
                membership: m.plan?.name || 'Premium',
                phone: m.phone || 'N/A'
            };
        });

        // 6. Attendance Stats (Current Month)
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const attendanceRecords = await prisma.attendance.findMany({
            where: {
                userId: trainerId,
                date: { gte: startOfMonth }
            },
            orderBy: { date: 'asc' }
        });

        const presentDays = attendanceRecords.filter(r => r.status === 'Present').length;
        const lateDays = attendanceRecords.filter(r => r.status === 'Late').length;
        const absentDays = attendanceRecords.filter(r => r.status === 'Absent').length;

        // Generate Weekly Summary for the past 7 days
        const weeklySummary = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            const record = attendanceRecords.find(r =>
                new Date(r.date).toDateString() === d.toDateString()
            );
            weeklySummary.push({
                day: dayName.charAt(0),
                status: record ? record.status : 'Off'
            });
        }

        const totalWorkingDays = presentDays + lateDays + absentDays;
        const attendanceRate = totalWorkingDays > 0 ? Math.round(((presentDays + lateDays) / totalWorkingDays) * 100) : 0;

        // 7. Pending Tasks
        const pendingDietPlansCount = members.filter(m => m.dietPlans.length === 0).length;
        const pendingWorkoutPlansCount = members.filter(m => m.workoutPlans.length === 0).length;
        const progressPendingCount = members.filter(m => m.progress.length === 0).length;

        const pendingTasks = [];
        if (pendingDietPlansCount > 0) pendingTasks.push({ id: 1, title: 'Members need Diet Plans', count: pendingDietPlansCount, route: '/trainer/diet/plans', type: 'Diet' });
        if (pendingWorkoutPlansCount > 0) pendingTasks.push({ id: 2, title: 'Members need Workout Plans', count: pendingWorkoutPlansCount, route: '/trainer/workout/plans', type: 'Workout' });
        if (progressPendingCount > 0) pendingTasks.push({ id: 3, title: 'Progress Logs Pending', count: progressPendingCount, route: '/trainer/progress', type: 'Progress' });

        // 8. Earnings 
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;

        const currentPayroll = await prisma.payroll.findFirst({
            where: {
                staffId: trainerId,
                month: currentMonth,
                year: currentYear
            }
        });

        const user = await prisma.user.findUnique({ where: { id: trainerId } });
        const baseSalary = user?.baseSalary ? Number(user.baseSalary) : 20000;
        const totalEarnings = currentPayroll ? Number(currentPayroll.amount) : baseSalary;
        const incentives = currentPayroll ? Number(currentPayroll.incentives) : 0;
        const deductions = currentPayroll ? Number(currentPayroll.deductions) : 0;
        const target = (user?.config && typeof user.config === 'object' && user.config.earningsTarget) ? Number(user.config.earningsTarget) : 60000;

        const announcements = await prisma.announcement.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { tenantId: tenantId },
                            { tenantId: null }
                        ]
                    },
                    {
                        OR: [
                            { targetRole: { contains: 'all' } },
                            { targetRole: { contains: 'trainer' } },
                            { targetRole: { contains: 'Trainer' } }
                        ]
                    }
                ]
            },
            orderBy: { createdAt: 'desc' },
            take: 3
        });

        res.json({
            isCommissionBased: true,
            totalMembers,
            sessionsToday: sessionsTodayCount,
            pendingPlans,
            todaySessions: {
                summary: {
                    total: sessionsTodayCount,
                    upcoming: todayClasses.filter(c => c.status !== 'Completed').length,
                    completed: todayClasses.filter(c => c.status === 'Completed').length
                },
                list: scheduleList
            },
            myClients,
            pendingTasks,
            myAttendance: {
                presentDays,
                lateDays,
                absentDays,
                attendanceRate,
                weeklySummary
            },
            earnings: {
                totalEarnings: totalEarnings,
                commission: incentives,
                salary: totalEarnings - incentives + deductions,
                target: target,
                pendingPayouts: totalEarnings
            },
            announcements: announcements.map(a => ({
                id: a.id,
                title: a.title,
                content: a.content,
                date: new Date(a.createdAt).toLocaleDateString()
            }))
        });
    } catch (error) {
        console.error('Trainer Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getMemberDashboard = async (req, res) => {
    try {
        const userId = req.user.id;
        const tenantId = req.user.tenantId;

        // 1. Get Member Profile with Plan
        const member = await prisma.member.findUnique({
            where: { userId },
            include: {
                plan: true,
                tenant: true,
                bookings: {
                    where: { status: { in: ['Upcoming', 'Completed'] } },
                    include: { class: true }
                }
            }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        // 2. Attendance Stats (Simplified logic)
        const totalBookings = await prisma.booking.count({
            where: { memberId: member.id }
        });
        const completedBookings = member.bookings.filter(b => b.status === 'Completed').length;
        const attendanceRate = totalBookings > 0 ? Math.round((completedBookings / totalBookings) * 100) : 0;

        // 3. Benefits (from Plan)
        const benefits = member.plan?.benefits || [];

        // 4. Announcements
        const announcements = await prisma.announcement.findMany({
            where: {
                OR: [
                    { tenantId },
                    { tenantId: null }
                ],
                targetRole: { in: ['all', 'member'] }
            },
            orderBy: { createdAt: 'desc' },
            take: 3
        });

        // 5. Next Class
        const upcomingBookings = member.bookings
            .filter(b => b.status === 'Upcoming')
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        let nextClass = 'No Upcoming Classes';
        if (upcomingBookings.length > 0) {
            const b = upcomingBookings[0];
            const className = b.class?.name || 'Session';
            const time = b.class?.startTime || '';
            nextClass = `${className} ${time ? '@ ' + time : ''}`;
        }

        // 6. Calculate Days Remaining
        const daysRemaining = member.expiryDate ? Math.max(0, Math.floor((new Date(member.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0;

        res.json({
            planName: member.plan?.name || 'No Active Plan',
            nextClass,
            attendanceRate: `${attendanceRate}%`,
            planSummary: {
                workoutsCompleted: completedBookings,
                totalWorkouts: totalBookings || 20,
                nextGoal: member.fitnessGoal || 'Complete Week 1',
                membershipStatus: member.status,
                expiryDate: member.expiryDate ? new Date(member.expiryDate).toLocaleDateString() : 'N/A',
                daysRemaining: daysRemaining
            },
            announcements: announcements.map(a => ({
                id: a.id,
                title: a.title,
                description: a.content,
                date: new Date(a.createdAt).toLocaleDateString(),
                isActive: true
            })),
            benefitWallet: {
                planName: member.plan?.name || "Standard",
                benefits: Array.isArray(benefits) ? benefits.map((b, i) => {
                    const name = (b.name || "").toLowerCase();
                    let used = 0;
                    if (name.includes('sauna')) {
                        used = member.bookings.filter(bk =>
                            (bk.class?.name || "").toLowerCase().includes('sauna') &&
                            new Date(bk.date) >= new Date(member.joinDate)
                        ).length;
                    } else if (name.includes('ice bath')) {
                        used = member.bookings.filter(bk =>
                            (bk.class?.name || "").toLowerCase().includes('ice bath') &&
                            new Date(bk.date) >= new Date(member.joinDate)
                        ).length;
                    } else if (name.includes('pt') || name.includes('class')) {
                        // Count other bookings as class credits
                        used = member.bookings.filter(bk => {
                            const cn = (bk.class?.name || "").toLowerCase();
                            const isCoreClass = !cn.includes('sauna') && !cn.includes('ice bath');
                            return isCoreClass && new Date(bk.date) >= new Date(member.joinDate);
                        }).length;
                    }

                    return {
                        id: i,
                        name: b.name || "Benefit",
                        total: b.limit || 0,
                        used: used,
                        label: "Items Left",
                        expiry: member.expiryDate ? new Date(member.expiryDate).toLocaleDateString() : "2026-12-31"
                    };
                }) : []
            }
        });
    } catch (error) {
        console.error('Member Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
