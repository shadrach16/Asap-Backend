const asyncHandler = require('../utils/asyncHandler');
const Service = require('../models/Service');
const User = require('../models/User');
const Proposal = require('../models/Proposal');
const Booking = require('../models/Booking');
const Milestone = require('../models/Milestone');
const { uploadStream, cloudinary } = require('../services/fileStorageService');
const mongoose = require('mongoose'); // Import mongoose for ObjectId


// Middleware to check if user is a Pro (can be moved to permissionMiddleware.js)
const isPro = (req, res, next) => {
    if (req.user && req.user.role === 'pro') {
        next();
    } else {
        res.status(403);
        throw new Error('User is not authorized as a Professional');
    }
};


/**
 * @desc    Create a new service offering
 * @route   POST /api/pro/services
 * @access  Private (Pro)
 */
const createService = asyncHandler(async (req, res) => {
    const { title, description, category, price, currency, revisions, deliveryTimeDays } = req.body;

    // --- 2. ADD 'category' TO VALIDATION ---
    if (!title || !description || !price || !deliveryTimeDays || !category) {
        res.status(400);
        throw new Error('Please provide title, description, category, price, and delivery time.');
    }
    
    if (!mongoose.Types.ObjectId.isValid(category)) {
        res.status(400);
        throw new Error('Invalid category ID.');
    }

    let uploadResult = null;
    if (req.file) {
        uploadResult = await uploadStream(req.file.buffer, `services/${req.user._id}`);
    }

    // --- 3. ADD 'category' TO Service.create ---
    const service = await Service.create({
        pro: req.user._id,
        title,
        description,
        category, // <-- ADDED
        price: parseFloat(price),
        currency: currency || 'USD',
        revisions: parseInt(revisions, 10) || 0,
        deliveryTimeDays: parseInt(deliveryTimeDays, 10),
        imageUrl: uploadResult?.secure_url,
        cloudinaryPublicId: uploadResult?.public_id,
        isActive: true, // Active by default
    });

    res.status(201).json(service);
});


/**
 * @desc    Get services offered by the logged-in pro
 * @route   GET /api/pro/me/services
 * @access  Private (Pro)
 */
const getMyServices = asyncHandler(async (req, res) => {
    const services = await Service.find({ pro: req.user._id }).sort('-createdAt');
    res.status(200).json(services);
});

/**
 * @desc    Get active services offered by a specific pro (public)
 * @route   GET /api/pro/:proId/services
 * @access  Public
 */
const getProServices = asyncHandler(async (req, res) => {
    const { proId } = req.params;
    // Check if the pro exists and is actually a pro (optional enhancement)
    // const proUser = await User.findOne({ _id: proId, role: 'pro' });
    // if (!proUser) { res.status(404); throw new Error('Professional not found.'); }

    const services = await Service.find({ pro: proId, isActive: true }).sort('-createdAt');
    res.status(200).json(services);
});

/**
 * @desc    Update a service offering
 * @route   PUT /api/pro/services/:serviceId
 * @access  Private (Pro owner)
 */
const updateService = asyncHandler(async (req, res) => {
    const { serviceId } = req.params;
    // --- 1. ADD 'category' TO DESTRUCTURING ---
    const { title, description, category, price, currency, revisions, deliveryTimeDays, isActive } = req.body;

    const service = await Service.findById(serviceId);

    if (!service) {
        res.status(404); throw new Error('Service not found.');
    }

    if (service.pro.toString() !== req.user._id.toString()) {
        res.status(403); throw new Error('User not authorized to update this service.');
    }

    if (req.file) {
        if (service.cloudinaryPublicId) {
            try { await cloudinary.uploader.destroy(service.cloudinaryPublicId); }
            catch (delError) { console.error("Failed to delete old service image:", delError); }
        }
        const uploadResult = await uploadStream(req.file.buffer, `services/${req.user._id}`);
        service.imageUrl = uploadResult.secure_url;
        service.cloudinaryPublicId = uploadResult.public_id;
    }

    // Update fields if provided
    service.title = title || service.title;
    service.description = description || service.description;
    service.category = category || service.category;
    service.price = price !== undefined ? parseFloat(price) : service.price;
    service.currency = currency || service.currency;
    service.revisions = revisions !== undefined ? parseInt(revisions, 10) : service.revisions;
    service.deliveryTimeDays = deliveryTimeDays !== undefined ? parseInt(deliveryTimeDays, 10) : service.deliveryTimeDays;
    service.isActive = isActive !== undefined ? Boolean(isActive) : service.isActive;

    const updatedService = await service.save();
    res.status(200).json(updatedService);
});


/**
 * @desc    Delete a service offering
 * @route   DELETE /api/pro/services/:serviceId
 * @access  Private (Pro owner)
 */
const deleteService = asyncHandler(async (req, res) => {
    const { serviceId } = req.params;

    const service = await Service.findById(serviceId);

    if (!service) {
        res.status(404); throw new Error('Service not found.');
    }

    // Authorization check
    if (service.pro.toString() !== req.user._id.toString()) {
        res.status(403); throw new Error('User not authorized to delete this service.');
    }

    // Delete image from Cloudinary if it exists
    if (service.cloudinaryPublicId) {
        try { await cloudinary.uploader.destroy(service.cloudinaryPublicId); }
        catch (delError) { console.error("Failed to delete service image:", delError); }
    }

    // Use deleteOne for Mongoose v6+
    await Service.deleteOne({ _id: serviceId });

    res.status(200).json({ message: 'Service deleted successfully.' });
});




/**
 * @desc    Get analytics data for the logged-in pro, including earnings over time
 * @route   GET /api/pro/me/analytics
 * @access  Private (Pro with active subscription)
 */
const getProAnalytics = asyncHandler(async (req, res) => {
    const proId = req.user._id;

    // --- Date Range for Time-Series (e.g., last 6 months) ---
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1); // Start from the beginning of the month
    sixMonthsAgo.setHours(0, 0, 0, 0); // Start of the day

    // --- Aggregations ---
    const [
        earningsResult,
        proposalStats,
        bookingStats,
        earningsOverTimeResult // Added for chart data
    ] = await Promise.all([
        // 1. Lifetime Earnings (Released Milestones)
        Milestone.aggregate([
            { $match: { pro: proId, status: 'released' } },
            { $group: { _id: null, totalEarnings: { $sum: '$amount' } } }
        ]),
        // 2. Proposal Stats
        Proposal.aggregate([
            { $match: { pro: proId } },
            { $group: {
                _id: null,
                totalSubmitted: { $sum: 1 },
                totalAccepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } }
            }}
        ]),
        // 3. Booking Stats
        Booking.aggregate([
             { $match: { pro: proId } },
             { $group: {
                 _id: null,
                 active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                 completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
             }}
        ]),
        // 4. Earnings Over Time (Last 6 Months by Month)
        Milestone.aggregate([
            { $match: {
                pro: proId,
                status: 'released',
                releasedAt: { $gte: sixMonthsAgo } // Filter by date range
            }},
            { $group: {
                _id: { // Group by year and month
                    year: { $year: '$releasedAt' },
                    month: { $month: '$releasedAt' }
                },
                monthlyEarnings: { $sum: '$amount' }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } }, // Sort chronologically
            { $project: { // Reshape the output
                _id: 0, // Exclude the default _id
                period: { $concat: [ // Create 'YYYY-MM' string
                    { $toString: '$_id.year' },
                    '-',
                    { $cond: { // Add leading zero to month if needed
                        if: { $lt: ['$_id.month', 10] },
                        then: { $concat: ['0', { $toString: '$_id.month' }] },
                        else: { $toString: '$_id.month' }
                    }}
                ]},
                earnings: '$monthlyEarnings'
            }}
        ])
    ]);

    // --- Process Results ---
    const totalEarnings = earningsResult.length > 0 ? earningsResult[0].totalEarnings : 0;
    const proposalData = proposalStats.length > 0 ? proposalStats[0] : { totalSubmitted: 0, totalAccepted: 0 };
    const bookingData = bookingStats.length > 0 ? bookingStats[0] : { active: 0, completed: 0 };
    const proposalSuccessRate = proposalData.totalSubmitted > 0
        ? (proposalData.totalAccepted / proposalData.totalSubmitted) * 100
        : 0;

    // Format earnings over time for easier frontend consumption
    const earningsOverTime = earningsOverTimeResult.map(item => ({
        period: item.period, // 'YYYY-MM'
        earnings: parseFloat(item.earnings.toFixed(2))
    }));

    // --- Compile Results ---
    const analyticsData = {
        lifetimeEarnings: {
            amount: totalEarnings.toFixed(2),
            currency: 'USD',
        },
        proposals: {
            totalSubmitted: proposalData.totalSubmitted,
            totalAccepted: proposalData.totalAccepted,
            successRate: proposalSuccessRate.toFixed(1),
        },
        bookings: {
            active: bookingData.active,
            completed: bookingData.completed,
        },
        earningsOverTime: earningsOverTime, // <-- Add chart data
    };

    res.status(200).json(analyticsData);
});


/**
 * @desc    Find/Search all active services with filtering
 * @route   GET /api/pro/services/search
 * @access  Public
 */
const findServices = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 12; // 12 fits well in 3/4 col grid
  const skip = (page - 1) * limit;

  const {
    sort = '-createdAt',
    searchTerm,
    category,
    minPrice,
    maxPrice,
    deliveryTime, // e.g., "3", "7", "14" (days)
  } = req.query;

  // --- 1. Build Initial Match Stage ---
  const initialMatch = {
    isActive: true // Only show active services
  };

  // Text search
  if (searchTerm) {
    initialMatch.$text = { $search: searchTerm };
  }
  
  // Category filter
  if (category && mongoose.Types.ObjectId.isValid(category)) {
    initialMatch.category = new mongoose.Types.ObjectId(category);
  }
  
  // Price filter
  if (minPrice || maxPrice) {
    initialMatch.price = {};
    if (minPrice) initialMatch.price.$gte = parseFloat(minPrice);
    if (maxPrice) initialMatch.price.$lte = parseFloat(maxPrice);
  }

  // Delivery Time filter (e.g., "less than or equal to 7 days")
  if (deliveryTime) {
    initialMatch.deliveryTimeDays = { $lte: parseInt(deliveryTime, 10) };
  }

  // --- 2. Build Aggregation Pipeline ---
  let pipeline = [
    { $match: initialMatch },
    // --- 3. Add Sort (by relevance if searching, else by 'sort' param) ---
    { 
      $sort: (searchTerm && sort === 'relevance') 
        ? { score: { $meta: "textScore" } } 
        : { [sort.replace('-', '')]: sort.startsWith('-') ? -1 : 1 } 
    },
    // --- 4. Pagination & Data Projection ---
    {
      $facet: {
        totalCount: [
          { $count: 'count' }
        ],
        data: [
          { $skip: skip },
          { $limit: limit },
          // Populate the Pro (User) details
          {
            $lookup: {
              from: 'users', // The 'users' collection
              localField: 'pro',
              foreignField: '_id',
              as: 'pro'
            }
          },
          { $unwind: { path: '$pro', preserveNullAndEmptyArrays: true } },
          // Project only the fields needed for the Service Card
          {
            $project: {
              title: 1,
              price: 1,
              currency: 1,
              imageUrl: 1,
              createdAt: 1,
              'pro._id': 1,
              'pro.name': 1,
              // 'pro.avatarUrl': 1, // Add this if you have it
            }
          }
        ]
      }
    }
  ];

  // --- 5. Execute Aggregation ---
  const results = await Service.aggregate(pipeline);

  const services = results[0].data;
  const totalServices = results[0].totalCount[0]?.count || 0;

  res.status(200).json({
    results: services.length,
    totalPages: Math.ceil(totalServices / limit),
    currentPage: page,
    totalItems: totalServices,
    data: services,
  });
});

// --- ADD THIS NEW FUNCTION ---
/**
 * @desc    Get a single service by its ID (public)
 * @route   GET /api/pro/service/:serviceId
 * @access  Public
 */
const getServiceById = asyncHandler(async (req, res) => {
    const { serviceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
        res.status(400); throw new Error('Invalid Service ID.');
    }

    const service = await Service.findOne({ _id: serviceId, isActive: true })
        .populate('pro', 'name title bio _id') //
        .populate('category', 'name'); //

    if (!service) {
        res.status(404);
        throw new Error('Service not found or is not active.');
    }

    res.status(200).json(service);
});



module.exports = {
    isPro, createService, getMyServices, getProServices, updateService, deleteService,
    getProAnalytics,findServices,getServiceById
};