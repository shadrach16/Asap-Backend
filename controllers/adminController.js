const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const Dispute = require('../models/Dispute');
const Booking = require('../models/Booking');
const Job = require('../models/Job');
const ComplianceRequest = require('../models/ComplianceRequest'); // <-- Import ComplianceRequest
const mongoose = require('mongoose');

/**
 * @desc    Get all users (with pagination)
 * @route   GET /api/admin/users
 * @access  Private (Admin)
 */
const getUsers = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Optional: Add filtering (e.g., by role, email) based on query params
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.email) filter.email = { $regex: req.query.email, $options: 'i' }; // Case-insensitive search

    const users = await User.find(filter)
        .select('-password') // Exclude password
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const totalUsers = await User.countDocuments(filter);

    res.status(200).json({
        count: users.length,
        totalPages: Math.ceil(totalUsers / limit),
        currentPage: page,
        data: users,
    });
});

 

/**
 * @desc    Ban or unban a user (simple status toggle for now)
 * @route   PUT /api/admin/users/:id/ban
 * @access  Private (Admin)
 */
const banUser = asyncHandler(async (req, res) => {
    // A more robust implementation might involve an 'isBanned' field or similar
    // This example removes the user for simplicity, which is destructive.
    // Consider adding an 'isActive' or 'status' field instead.

    const user = await User.findById(req.params.id);

    if (user) {
         if (user.role === 'admin') {
             res.status(400); throw new Error('Cannot ban an administrator.');
         }
        // Example using delete (destructive, use status field in production)
        await User.deleteOne({ _id: req.params.id });
        res.status(200).json({ message: `User ${user.email} banned (deleted).` });

        // Example using status field:
        // user.status = 'banned'; // Assuming a status field exists
        // await user.save();
        // res.status(200).json({ message: `User ${user.email} status set to 'banned'.`, user });

    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

/**
 * @desc    Get all disputes (with pagination/filtering)
 * @route   GET /api/admin/disputes
 * @access  Private (Admin)
 */
const getDisputes = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status && ['open', 'under_review', 'resolved', 'closed'].includes(req.query.status)) {
        filter.status = req.query.status;
    } else {
         filter.status = { $ne: 'closed' }; // Default to not showing closed
    }


    const disputes = await Dispute.find(filter)
        .populate('booking', 'job') // Populate booking info (e.g., job ID/title)
        .populate({ path: 'booking', populate: { path: 'job', select: 'title' }}) // Populate job title within booking
        .populate('plaintiff', 'name email') // Populate user names/emails
        .populate('defendant', 'name email')
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limit);

    const totalDisputes = await Dispute.countDocuments(filter);

     res.status(200).json({
        count: disputes.length,
        totalPages: Math.ceil(totalDisputes / limit),
        currentPage: page,
        data: disputes,
    });
});

/**
 * @desc    Get a single dispute by ID
 * @route   GET /api/admin/disputes/:id
 * @access  Private (Admin)
 */
const getDisputeById = asyncHandler(async (req, res) => {
     const dispute = await Dispute.findById(req.params.id)
        .populate('booking') // Populate full booking
        .populate('plaintiff', 'name email role')
        .populate('defendant', 'name email role')
        .populate('resolvedBy', 'name email'); // Who resolved it

     if (dispute) {
        // Fetch related messages, milestones etc. if needed for context
        res.status(200).json(dispute);
    } else {
        res.status(404);
        throw new Error('Dispute not found');
    }
});


/**
 * @desc    Resolve a dispute
 * @route   PUT /api/admin/disputes/:id/resolve
 * @access  Private (Admin)
 */
const resolveDispute = asyncHandler(async (req, res) => {
    const { resolution, status } = req.body; // status should be 'resolved' or 'closed'
    const adminId = req.user._id;

    if (!resolution || !status || !['resolved', 'closed'].includes(status)) {
        res.status(400);
        throw new Error("Please provide a resolution description and a valid status ('resolved' or 'closed').");
    }

    const dispute = await Dispute.findById(req.params.id);

    if (!dispute) {
        res.status(404); throw new Error('Dispute not found.');
    }
    if (dispute.status !== 'open' && dispute.status !== 'under_review') {
         res.status(400); throw new Error(`Dispute cannot be resolved. Current status: ${dispute.status}`);
    }

    dispute.status = status;
    dispute.resolution = resolution;
    dispute.resolvedBy = adminId;
    dispute.resolvedAt = Date.now();

    const updatedDispute = await dispute.save();

    // TODO: Update associated booking status if needed (e.g., 'cancelled', 'completed')
    // TODO: Trigger fund releases/refunds based on resolution if using escrow/milestones

    // TODO: Notify plaintiff and defendant about the resolution

    res.status(200).json(updatedDispute);
});

/**
 * @desc    Get platform analytics data
 * @route   GET /api/admin/analytics
 * @access  Private (Admin)
 */
const getAnalytics = asyncHandler(async (req, res) => {
    // --- User Stats ---
    const totalUsers = await User.countDocuments();
    const proUsers = await User.countDocuments({ role: 'pro' });
    const clientUsers = await User.countDocuments({ role: 'client' });
    // TODO: Add count of users joined in last 7 days/30 days

    // --- Job/Booking Stats ---
    const totalJobs = await Job.countDocuments();
    const openJobs = await Job.countDocuments({ status: 'open' });
    const completedBookings = await Booking.countDocuments({ status: 'completed' });
    // TODO: Calculate total revenue (sum of completed milestone amounts or paid invoices)

    // --- Dispute Stats ---
    const openDisputes = await Dispute.countDocuments({ status: 'open' });
    const resolvedDisputes = await Dispute.countDocuments({ status: 'resolved' });

    // --- Revenue Calculation (Example - Sum of completed/released milestones) ---
    // This requires milestones to be consistently marked 'released'
    const revenueResult = await Milestone.aggregate([
        { $match: { status: 'released' } }, // Only count released milestones
        { $group: { _id: null, totalRevenue: { $sum: '$amount' } } }
    ]);
    const totalPlatformRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    // Note: This doesn't account for platform fees or different currencies yet.

    const analyticsData = {
        users: {
            total: totalUsers,
            pros: proUsers,
            clients: clientUsers,
        },
        jobs: {
            total: totalJobs,
            open: openJobs,
        },
        bookings: {
            completed: completedBookings,
            // Add active bookings count if needed
        },
        disputes: {
            open: openDisputes,
            resolved: resolvedDisputes,
        },
        revenue: {
            total: totalPlatformRevenue.toFixed(2), // Format as currency string
            currency: 'USD', // Assuming USD for now
        }
    };

    res.status(200).json(analyticsData);
});


const getUserById = asyncHandler(async (req, res) => {
    // Populate associated compliance request
    const user = await User.findById(req.params.id)
        .select('-password +stripeAccountId +stripeOnboardingComplete')
        .populate('complianceRequest'); // <-- Populate compliance info

    if (user) {
        res.status(200).json(user);
    } else {
        res.status(404); throw new Error('User not found');
    }
});

 
/**
 * @desc    Manually override a user's compliance status
 * @route   POST /api/admin/compliance/users/:userId/override
 * @access  Private (Admin)
 */
const overrideComplianceStatus = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { newStatus, reason } = req.body;
    const adminId = req.user._id;

    if (!newStatus || !['approved', 'rejected', 'pending', 'expired'].includes(newStatus)) {
        res.status(400); throw new Error("Invalid status provided. Must be 'approved', 'rejected', 'pending', or 'expired'.");
    }
    if (!reason) {
         res.status(400); throw new Error("A reason for the override is required.");
    }

    // Find or create compliance record for the user
    let compliance = await ComplianceRequest.findOne({ user: userId });
    if (!compliance) {
        // Optionally create one if it doesn't exist, though typically it should
        // For now, let's assume it must exist from onboarding
         res.status(404); throw new Error('Compliance record not found for this user.');
        // compliance = new ComplianceRequest({ user: userId });
    }

    compliance.status = newStatus;
    compliance.overrideReason = reason;
    compliance.overriddenBy = adminId;
    compliance.overrideAt = Date.now();
    compliance.rejectionReason = newStatus === 'rejected' ? reason : undefined; // Use override reason if rejecting

    await compliance.save();

    // Optionally update user record if needed

    res.status(200).json({ message: `Compliance status for user ${userId} updated to ${newStatus}.`, compliance });
});

/**
 * @desc    Get compliance requests with documents expiring soon
 * @route   GET /api/admin/compliance/expiring
 * @access  Private (Admin)
 */
const getExpiringCompliance = asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days, 10) || 30; // Default to 30 days
    const limit = parseInt(req.query.limit, 10) || 50;

    const today = new Date();
    const expiryCutoff = new Date(today);
    expiryCutoff.setDate(today.getDate() + days);

    // Find requests where *any* document has an expiresAt date between now and the cutoff
    const expiringRequests = await ComplianceRequest.find({
        status: 'approved', // Only check approved requests
        'documents.expiresAt': {
            $gte: today,
            $lte: expiryCutoff,
        }
    })
    .limit(limit)
    .populate('user', 'name email') // Populate user info
    .select('user status documents.documentType documents.expiresAt'); // Select relevant fields

    res.status(200).json(expiringRequests);
});

module.exports = {
    getUsers,
    getUserById,
    banUser,
    getDisputes,
    getDisputeById,
    resolveDispute,
    getAnalytics,
    overrideComplianceStatus, // <-- Export new
    getExpiringCompliance,    // <-- Export new
};