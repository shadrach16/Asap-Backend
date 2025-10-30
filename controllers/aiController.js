const asyncHandler = require('../utils/asyncHandler');
const {
    generateJobDescription,
    suggestJobPrice, // <-- Import
    matchProsToJob     // <-- Import
} = require('../services/aiService');
const Job = require('../models/Job'); // Import Job for price suggestion input

/**
 * @desc    Generate a job description using AI
 * @route   POST /api/ai/generate-job
 * @access  Private (Client)
 */
const generateJobWithAI = asyncHandler(async (req, res) => {
  // Optional: Add role check if only clients can use this
  // if (req.user.role !== 'client') {
  //     res.status(403); throw new Error('Only clients can generate job descriptions.');
  // }

  const { prompt } = req.body;

  if (!prompt || prompt.trim().length < 10) { // Require a minimum prompt length
    res.status(400);
    throw new Error('Please provide a meaningful description prompt (at least 10 characters).');
  }

  const generatedDescription = await generateJobDescription(prompt);

  res.status(200).json({ description: generatedDescription });
});



/**
 * @desc    Suggest price range for a job description
 * @route   POST /api/ai/suggest-price
 * @access  Private (Client)
 */
const suggestJobPriceController = asyncHandler(async (req, res) => {
    // Optional role check
    // if (req.user.role !== 'client') { ... }

    const { description, title, skills } = req.body; // Expect description, optionally title/skills for context

    if (!description || description.trim().length < 20) {
        res.status(400); throw new Error('Please provide a job description (at least 20 characters).');
    }

    // Combine inputs for a better prompt
    const fullDescription = `Title: ${title || 'N/A'}\nSkills: ${Array.isArray(skills) ? skills.join(', ') : (skills || 'N/A')}\nDescription: ${description}`;

    const suggestion = await suggestJobPrice(fullDescription);

    res.status(200).json(suggestion); // { minPrice, maxPrice, reasoning }
});

/**
 * @desc    Get AI-matched pro suggestions for a job
 * @route   GET /api/ai/jobs/:jobId/matches
 * @access  Private (Client who owns job)
 */
const getJobMatchesController = asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    // Authorization: Check if user owns the job
    const job = await Job.findById(jobId).select('client');
    if (!job) {
         res.status(404); throw new Error('Job not found.');
    }
    if (job.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
         res.status(403); throw new Error('User not authorized to get matches for this job.');
    }

    const matchedPros = await matchProsToJob(jobId);

    res.status(200).json(matchedPros); // Returns array of simplified pro objects
});


module.exports = {
  generateJobWithAI,
  suggestJobPriceController, // <-- Export new
  getJobMatchesController,   // <-- Export new
};