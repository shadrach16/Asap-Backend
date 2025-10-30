const asyncHandler = require('../utils/asyncHandler');
const Job = require('../models/Job');
const Category = require('../models/Category'); // Needed for validation
const Proposal = require('../models/Proposal'); // Needed for validation
const Skill = require('../models/Skill'); // Needed for validation
const { moderateContent } = require('../services/aiService');
const mongoose = require('mongoose'); // For ObjectId validation
const { uploadStream } = require('../services/fileStorageService');

const postJob = asyncHandler(async (req, res) => {
  if (req.user.role !== 'client') {
    res.status(403);
    throw new Error('User is not authorized to post jobs');
  }

  // Fields from 'multipart/form-data' will be in req.body
  let { title, description, budget, currency, skills, category, location } = req.body;

    if (!title || !description || !budget || !category || !skills) {
    res.status(400);
    throw new Error('Title, description, budget, category, and skills are required');
  }
  if (!mongoose.Types.ObjectId.isValid(category)) {
      res.status(400);
      throw new Error('Invalid category ID format.');
  }

if (!Array.isArray(skills) && skills){
  skills = [skills]
}

  if ( skills.length === 0 || !skills.every(id => mongoose.Types.ObjectId.isValid(id))) {
      res.status(400);
      throw new Error('Skills must be a non-empty array of valid ObjectIds.');
  }

  // Verify category exists and is active
  const categoryExists = await Category.findById(category);
  if (!categoryExists || !categoryExists.isActive) {
      res.status(400);
      throw new Error('Selected category is invalid or inactive.');
  }
  // Verify all skill IDs exist
  const skillCount = await Skill.countDocuments({ _id: { $in: skills } });
  if (skillCount !== skills.length) {
      res.status(400);
      throw new Error('One or more selected skills are invalid.');
  }

  // Content Moderation
  // const titleModeration = await moderateContent(title);
  // if (!titleModeration.isSafe) {
  //     res.status(400);
  //     throw new Error(`Job title rejected due to unsafe content: ${titleModeration.violation || 'Policy Violation'}.`);
  // }

  // const descModeration = await moderateContent(description);
  //  if (!descModeration.isSafe) {
  //     res.status(400);
  //     throw new Error(`Job description rejected due to unsafe content: ${descModeration.violation || 'Policy Violation'}.`);
  // }


  // --- 2. HANDLE FILE UPLOADS ---
  let attachmentData = [];
  
  // 'req.files' is provided by upload.array('attachments', 5)
 if (req.files && req.files.length > 0) {
    try {
        // Create an array of upload promises
        const uploadPromises = req.files.map(async (file) => {
            // Define a folder path for organization (e.g., asap/jobs/[clientId])
            const folder = `asap/job_attachments/${req.user._id}`;
            
            // Call your service with the file's buffer and folder
            const result = await uploadStream(file.buffer, folder); //
            
            // Return the structured object our Job model expects
            return {
                fileName: file.originalname, // The original name from multer
                fileUrl: result.secure_url,    // The URL from Cloudinary
                fileKey: result.public_id     // The key from Cloudinary (for deletion)
            };
        });

        // Wait for all file uploads to complete
        attachmentData = await Promise.all(uploadPromises);

    } catch (uploadError) {
        console.error("File upload failed:", uploadError);
        res.status(500);
        throw new Error('One or more files failed to upload. Please try again.');
    }
  }

  // --- 3. CREATE JOB WITH ATTACHMENTS ---
const job = await Job.create({
    client: req.user._id,
    title: title.trim(),
    description: description.trim(),
    budget: parseFloat(budget),
    currency: currency || 'CAD', // Default to CAD
    skills, 
    category,
    location: location || 'Remote',
    status: 'open',
    attachments: attachmentData // <-- Save the attachment info
  });

  // --- (Rest of the function remains the same) ---
  const populatedJob = await Job.findById(job._id)
    .populate('client', 'name email')
    .populate('category', 'name')
    .populate('skills', 'name');

  res.status(201).json(populatedJob);
});



const getJobs = asyncHandler(async (req, res) => {
 
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const {
    sort,
    searchTerm,
    category,
    skills,
    location,
    minBudget,
    maxBudget,
    proposalsRange
  } = req.query;

  // --- 2. Build Initial Match Stage ---
  const initialMatch = { status: 'open' };
  
 
  if (searchTerm) {
    initialMatch.$or = [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      // --- FIX 2: REMOVED the line for 'skills' ---
      // You cannot run $regex on an array of ObjectIDs.
      // Filtering by skills is handled by the 'skills' query param below.
    ];
  }

  // ... (Category, Location, Skills, Budget filters remain the same)
  if (category && mongoose.Types.ObjectId.isValid(category)) {
    initialMatch.category = new mongoose.Types.ObjectId(category);
  }
  if (location) {
    initialMatch.location = { $regex: location, $options: 'i' };
  }
  // This block is the CORRECT way to filter by skills
  if (skills) {
    const skillIds = skills.split(',')
                           .map(id => id.trim())
                           .filter(id => mongoose.Types.ObjectId.isValid(id))
                           .map(id => new mongoose.Types.ObjectId(id));
    if (skillIds.length > 0) {
      initialMatch.skills = { $all: skillIds };
    }
  }
  if (minBudget || maxBudget) {
    initialMatch.budget = {};
    if (minBudget) initialMatch.budget.$gte = parseFloat(minBudget);
    if (maxBudget) initialMatch.budget.$lte = parseFloat(maxBudget);
  }

  // --- 3. Build Aggregation Pipeline ---
  let pipeline = [
    { $match: initialMatch },
    // 
    {
      $lookup: {
        from: 'proposals',
        localField: '_id',
        foreignField: 'job',
        as: 'proposals'
      }
    },
    {
      $addFields: {
        proposalCount: { $size: '$proposals' },
        // --- FIX 1: REMOVED score: { $meta: "textScore" } ---
        // This field is not available when using $regex.
      }
    }
  ];

  // --- 4. Add Secondary Match (Proposals) ---
  const proposalMatch = {};
  if (proposalsRange) {
    switch (proposalsRange) {
      case '0-5': proposalMatch.proposalCount = { $gte: 0, $lte: 5 }; break;
      case '5-10': proposalMatch.proposalCount = { $gte: 5, $lte: 10 }; break;
      case '10-20': proposalMatch.proposalCount = { $gte: 10, $lte: 20 }; break;
      case '20+': proposalMatch.proposalCount = { $gte: 20 }; break;
    }
    pipeline.push({ $match: proposalMatch });
  }

  // --- 5. UPDATED: Add Sorting Logic ---
  let sortStage = {};
  // --- FIX 1: REMOVED 'relevance' sort option ---
  // We can no longer sort by 'score' as it doesn't exist.
  // We default to 'createdAt' instead.
  if (sort === '-createdAt') {
    sortStage = { createdAt: -1 };
  } else {
    sortStage = { createdAt: -1 }; // Default to most recent
  }
  pipeline.push({ $sort: sortStage });
  
  // --- 6. Add Pagination and Final Projections ($facet) ---
  pipeline.push({
    $facet: {
      totalCount: [
        { $count: 'count' }
      ],
      data: [
        { $skip: skip },
        { $limit: limit },
        // We do lookups *after* filtering/sorting for performance.
        { $lookup: { from: 'users', localField: 'client', foreignField: '_id', as: 'client' } },
        { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
        { $lookup: { from: 'skills', localField: 'skills', foreignField: '_id', as: 'skills' } },
        { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            // Remove fields we don't need to send to the client
            title: 1,
            description: 1,
            budget: 1,
            currency: 1,
            location: 1,
            status: 1,
            createdAt: 1,
            proposalCount: 1,
            'client.name': 1,
            'category.name': 1,
            skills: '$skills.name', // Project just the skill names
          }
        }
      ]
    }
  });

  // --- 7. Execute Aggregation ---
  const results = await Job.aggregate(pipeline);

  const jobs = results[0].data;
  const totalJobs = results[0].totalCount[0]?.count || 0;

  res.status(200).json({
    results: jobs.length,
    totalPages: Math.ceil(totalJobs / limit),
    currentPage: page,
    totalItems: totalJobs,
    data: jobs,
  });
});


const getJobById = asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
        res.status(400); throw new Error('Invalid Job ID format.');
    }

    const job = await Job.findById(jobId)
        .populate('client', 'name email') // Client details
        .populate('category', 'name')     // Category name
        .populate('skills', 'name');      // Skill names

    if (!job) {
        res.status(404); throw new Error('Job not found');
    }

    // Add authorization check here if needed (e.g., prevent pros from seeing details of non-open jobs they didn't apply to)

    res.status(200).json(job);
});

/**
 * @desc    Get all jobs for the logged-in client, filtered by status
 * @route   GET /api/jobs/my-jobs
 * @access  Private (Client)
 */
const getMyJobs = asyncHandler(async (req, res) => {
    if (req.user.role !== 'client') {
        res.status(403);
        throw new Error('User is not authorized to view this resource');
    }

    const { status } = req.query;
    const filter = { client: req.user._id };

    if (status && ['open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        filter.status = status;
    }

    

    const jobsQuery = Job.find(filter)
        .populate('category', 'name')
        .populate('skills', 'name')
        .sort('-createdAt');
    
    // Dynamically get proposal count only for 'open' jobs
    let jobs = await jobsQuery.lean(); // Use .lean() for performance

    if (status === 'open') {
        // Get proposal counts for all 'open' jobs
        const proposalCounts = await Proposal.aggregate([
            { $match: { job: { $in: jobs.map(j => j._id) } } },
            { $group: { _id: '$job', count: { $sum: 1 } } }
        ]);
        
        // Map counts back to jobs
        const countMap = new Map(proposalCounts.map(pc => [pc._id.toString(), pc.count]));
        jobs.forEach(job => {
            job.proposalCount = countMap.get(job._id.toString()) || 0;
        });
    }

    res.status(200).json({ jobs });
});


module.exports = {
    postJob,
    getJobs,
    getJobById,
    getMyJobs
};