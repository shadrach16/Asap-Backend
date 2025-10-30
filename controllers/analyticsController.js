// controllers/analyticsController.js (NEW FILE)

const asyncHandler = require('../utils/asyncHandler');
const Booking = require('../models/Booking');
const Job = require('../models/Job');
const Milestone = require('../models/Milestone');
const Review = require('../models/Review');

/**
 * @desc    Get dashboard analytics for the logged-in client
 * @route   GET /api/analytics/client
 * @access  Private (Client)
 */
const getClientAnalytics = asyncHandler(async (req, res) => {
    const clientId = req.user._id;

    // 1. Total Spend (Sum of released milestones)
    const spendAggregation = await Milestone.aggregate([
        { 
            $lookup: { // Find the booking for each milestone
                from: 'bookings',
                localField: 'booking',
                foreignField: '_id',
                as: 'bookingInfo'
            }
        },
        { $unwind: '$bookingInfo' },
        { 
            $match: { // Filter for milestones released by this client
                'bookingInfo.client': clientId,
                'status': 'released'
            } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // 2. Job Counts (Active & Completed)
    const jobCounts = await Job.aggregate([
        { $match: { client: clientId } },
        { 
            $group: { 
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    // 3. Average Rating (Ratings given *to* this client's jobs)
    // This is tricky. Let's find reviews for bookings this client *owns*.
    const reviewAggregation = await Review.aggregate([
        {
            $lookup: {
                from: 'bookings',
                localField: 'booking',
                foreignField: '_id',
                as: 'bookingInfo'
            }
        },
        { $unwind: '$bookingInfo' },
        { $match: { 'bookingInfo.client': clientId } }, // Reviews for this client's bookings
        { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);

    // --- Process Results ---
    const totalSpend = spendAggregation[0]?.total || 0;
    const avgRating = reviewAggregation[0]?.avg || 0; // [cite: 41]

    let activeJobs = 0;
    let completedJobs = 0;
    jobCounts.forEach(group => {
        if (group._id === 'in_progress') activeJobs = group.count;
        if (group._id === 'completed') completedJobs = group.count; // [cite: 40]
    });

    res.status(200).json({
        totalSpend,
        activeJobs,
        completedJobs,
        avgRating
    });
});

module.exports = {
    getClientAnalytics
};