const asyncHandler = require('../utils/asyncHandler');
const Skill = require('../models/Skill');
const Category = require('../models/Category'); // Needed for creation/update
const User = require('../models/User'); // Needed to check if skill is in use

/**
 * @desc    Get all skills (or search for autocomplete)
 * @route   GET /api/skills
 * @access  Public
 */
const getSkills = asyncHandler(async (req, res) => {
    const { search } = req.query;
    const filter = {};

    if (search) {
        // Simple case-insensitive search
        filter.name = { $regex: search, $options: 'i' };
    }

    // Fetch skills, sort alphabetically, limit results for autocomplete
    const skills = await Skill.find(filter)
        .populate('category', 'name') // Optionally show category name
        .sort('name')
        .limit(50); // Limit results for frontend autocomplete
        
    res.status(200).json(skills);
});

// --- Admin Functions ---

/**
 * @desc    Get all skills (Admin view with pagination)
 * @route   GET /api/skills/admin
 * @access  Private (Admin)
 */
const getSkillsAdmin = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const { search } = req.query;

    const filter = {};
    if (search) {
        filter.name = { $regex: search, $options: 'i' };
    }
    
    const skills = await Skill.find(filter)
        .populate('category', 'name slug')
        .sort('name')
        .skip(skip)
        .limit(limit);

    const totalSkills = await Skill.countDocuments(filter);

    res.status(200).json({
        data: skills,
        count: skills.length,
        totalItems: totalSkills,
        totalPages: Math.ceil(totalSkills / limit),
        currentPage: page,
    });
});

/**
 * @desc    Create a new skill
 * @route   POST /api/skills
 * @access  Private (Admin)
 */
const createSkill = asyncHandler(async (req, res) => {
    const { name, category, isVerified } = req.body;

    if (!name) {
        res.status(400);
        throw new Error('Skill name is required');
    }

    const normalizedName = name.toLowerCase().trim();
    const skillExists = await Skill.findOne({ name: normalizedName });

    if (skillExists) {
        res.status(400);
        throw new Error('Skill with this name already exists');
    }

    // Check if category exists
    if (category) {
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
            res.status(400);
            throw new Error('Invalid category ID');
        }
    }

    const skill = await Skill.create({
        name: normalizedName,
        category: category || undefined,
        isVerified: isVerified ?? true, // Default to verified if created by admin
    });

    res.status(201).json(skill);
});

/**
 * @desc    Update an existing skill
 * @route   PUT /api/skills/:id
 * @access  Private (Admin)
 */
const updateSkill = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, category, isVerified } = req.body;

    const skill = await Skill.findById(id);

    if (!skill) {
        res.status(404);
        throw new Error('Skill not found');
    }

    // Check if new name already exists (and is not this skill)
    if (name) {
        const normalizedName = name.toLowerCase().trim();
        const skillExists = await Skill.findOne({ name: normalizedName, _id: { $ne: id } });
        if (skillExists) {
            res.status(400);
            throw new Error('Skill with this name already exists');
        }
        skill.name = normalizedName;
    }

    // Check if category exists
    if (category) {
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
            res.status(400);
            throw new Error('Invalid category ID');
        }
        skill.category = category;
    } else if (category === null) {
         skill.category = undefined; // Allow unsetting category
    }

    if (isVerified !== undefined) {
        skill.isVerified = isVerified;
    }

    const updatedSkill = await skill.save();
    res.status(200).json(updatedSkill);
});


/**
 * @desc    Delete a skill
 * @route   DELETE /api/skills/:id
 * @access  Private (Admin)
 */
const deleteSkill = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const skill = await Skill.findById(id);

    if (!skill) {
        res.status(404);
        throw new Error('Skill not found');
    }

    // Check if any user is using this skill
    const userCount = await User.countDocuments({ skills: id });
    if (userCount > 0) {
        res.status(400);
        throw new Error(`Cannot delete skill. It is being used by ${userCount} user(s).`);
    }

    // Add checks for jobs/services if needed
    // const jobCount = await Job.countDocuments({ skills: id });
    // if (jobCount > 0) { ... }

    await Skill.deleteOne({ _id: id });

    res.status(200).json({ message: 'Skill deleted successfully' });
});


module.exports = {
    getSkills,
    // Admin functions
    getSkillsAdmin,
    createSkill,
    updateSkill,
    deleteSkill,
};