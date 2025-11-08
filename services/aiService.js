const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const dotenv = require('dotenv');
const User = require('../models/User'); // Need User model for matching
const Job = require('../models/Job'); // Need Job model for matching

dotenv.config();

let genAI;
let generationModel; // Renamed from 'model'
let safetyModel; // Renamed from 'chatModel'

if (process.env.GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    generationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
    safetyModel = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        safetySettings: [
            // Stricter safety for moderation
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ],
    });
    console.log("Gemini AI service initialized for generation and moderation.");
  } catch (error) {
     console.error("Failed to initialize Gemini AI:", error.message);
     genAI = null; generationModel = null; safetyModel = null;
  }
} else {
  console.warn("GEMINI_API_KEY not found. AI features will be disabled.");
  genAI = null; generationModel = null; safetyModel = null;
}



/**
 * Generates a job description based on a user prompt using Gemini.
 * @param {string} prompt - User's brief description of the job.
 * @returns {Promise<string>} - The generated job description text.
 */
const generateJobDescription = async (prompt) => {
  if (!model) {
    throw new Error("AI Service is not configured or failed to initialize.");
  }

  const fullPrompt = `
    You are an expert recruiter creating a job posting for a freelance marketplace similar to Upwork/Fiverr.
    Based on the following user input, generate a clear, concise, and professional job description.
    Include sections for:
    - Project Overview/Goal
    - Key Responsibilities/Deliverables
    - Required Skills & Experience
    - Budget/Timeline (if mentioned or inferable, otherwise omit or state TBD)

    Keep the tone professional but engaging. Use bullet points for responsibilities and skills.

    User Input: "${prompt}"

    Generated Job Description:
  `;

  try {
    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const text = response.text();
    return text.trim();
  } catch (error) {
    console.error("Error generating content with Gemini:", error);
    // You might want more specific error handling based on Google API errors
    throw new Error("Failed to generate job description with AI.");
  }
};

/**
 * Moderates text content using Gemini's safety features.
 * Checks for Harassment, Hate Speech, Sexually Explicit, Dangerous Content.
 * Does NOT reliably detect PII with safety settings alone.
 * @param {string} text - The content to moderate.
 * @returns {Promise<{isSafe: boolean, violation?: string}>} - Result indicating safety and potential violation category.
 */
const moderateContent = async (text) => {
    // FIX: Use safetyModel, which is correctly initialized with strict safety settings
    if (!safetyModel) { 
        console.warn("AI Moderation skipped: Service not configured.");
        return { isSafe: true }; 
    }
     if (!text || typeof text !== 'string' || text.trim() === '') {
        return { isSafe: true }; 
    }

    try {
        // Use generateContent with the text and rely on the pre-configured safety settings
        // Relying on safetyModel for moderation
        const result = await safetyModel.generateContent(text); // CORRECTED from chatModel
        const response = result.response;

        // Check if the response was blocked due to safety settings
        if (response.promptFeedback?.blockReason) {
            // Find the category that caused the block (highest probability)
            const highestViolation = response.promptFeedback.safetyRatings?.reduce((highest, current) => {
                // For simplicity, just return the first category that isn't NEGLIGIBLE or LOW
                 if (current.probability !== 'NEGLIGIBLE' && current.probability !== 'LOW') {
                     return current.category; // Return HarmCategory enum string
                 }
                 return highest;
            }, null);

            console.warn(`Content Moderation BLOCKED. Reason: ${response.promptFeedback.blockReason}. Category: ${highestViolation || 'Unknown'}. Text: "${text.substring(0, 50)}..."`);
            return {
                isSafe: false,
                // Provide a user-friendly category name
                violation: highestViolation ? highestViolation.replace('HARM_CATEGORY_', '').replace('_', ' ') : response.promptFeedback.blockReason,
            };
        }

        // If not blocked, it's considered safe by the defined thresholds
        return { isSafe: true };

    } catch (error) {
        // Handle potential API errors during the safety check
        console.error("Error during content moderation:", error);
        // Fail open in case of API error? Or fail closed? Failing open for now.
        return { isSafe: true, error: "Moderation check failed." };
    }
};

/**
 * Suggests a price range for a job based on its description using Gemini.
 * @param {string} jobDescription - The full description of the job.
 * @returns {Promise<object>} - Object containing suggested minPrice, maxPrice, and reasoning.
 */
const suggestJobPrice = async (jobDescription) => {
    if (!generationModel) { throw new Error("AI Service not configured."); }

    const prompt = `
        Analyze the following freelance job description and suggest a reasonable price range (minimum and maximum) in USD.
        Consider factors like complexity, required skills, estimated effort, and common market rates for similar tasks.
        Provide a brief reasoning for your suggestion.

        Output format should be a JSON object with keys: "minPrice" (number), "maxPrice" (number), "reasoning" (string).

        Job Description:
        ---
        ${jobDescription}
        ---

        Suggested Price Range (JSON):
    `;

    try {
        const result = await generationModel.generateContent(prompt);
        const text = result.response.text().trim();

        // Attempt to parse the JSON output from Gemini
        // Clean potential markdown code block fences
        const jsonString = text.replace(/^```json\s*|```$/g, '').trim();
        const suggestion = JSON.parse(jsonString);

        // Basic validation of the parsed object
        if (typeof suggestion.minPrice !== 'number' || typeof suggestion.maxPrice !== 'number' || typeof suggestion.reasoning !== 'string') {
            throw new Error("AI response did not match expected JSON format.");
        }
        if (suggestion.minPrice > suggestion.maxPrice) {
            // Swap if min > max
             [suggestion.minPrice, suggestion.maxPrice] = [suggestion.maxPrice, suggestion.minPrice];
        }

        return suggestion; // { minPrice: number, maxPrice: number, reasoning: string }

    } catch (error) {
        console.error("Error suggesting job price with Gemini:", error);
        // Fallback or rethrow
        throw new Error(`Failed to get price suggestion from AI: ${error.message}`);
    }
};


/**
 * Matches suitable pro users to a given job ID (Simplified Prompt-Based).
 * A real implementation would involve fetching pro data and using embeddings/vector search.
 * @param {string} jobId - The ID of the job to match pros for.
 * @returns {Promise<Array>} - An array of matched pro user objects (simplified).
 */
const matchProsToJob = async (jobId) => {
     if (!generationModel) { throw new Error("AI Service not configured."); }

     try {
        const job = await Job.findById(jobId).select('title description skills');
        if (!job) { throw new Error('Job not found for matching.'); }

        // --- Simplified Prompt Approach ---
        // Fetch a small, diverse sample of *active* pro profiles from DB
        const proSamples = await User.find({ role: 'pro', stripeOnboardingComplete: true }) // Find active pros
            .limit(20) // Limit sample size for prompt context window
            .select('name skills bio title') // Select relevant fields
            .lean(); // Use lean for performance

        if (!proSamples || proSamples.length === 0) {
            return []; // No pros available to match
        }

        // Prepare the prompt for Gemini
        const jobDetails = `Title: ${job.title}\nDescription: ${job.description}\nRequired Skills: ${job.skills.join(', ')}`;

        const proProfilesString = proSamples.map((pro, i) =>
            `Pro ${i + 1}:\nID: ${pro._id}\nName: ${pro.name}\nTitle: ${pro.title || 'N/A'}\nSkills: ${pro.skills?.join(', ') || 'N/A'}\nBio: ${pro.bio?.substring(0, 150) || 'N/A'}...\n---`
        ).join('\n');

        const prompt = `
            Based on the following job details, identify the top 3 most suitable candidates from the provided list of professionals.
            Consider the required skills, job description keywords, and the professional's title, skills, and bio.
            List ONLY the IDs of the top 3 matched professionals, separated by commas. Do not include names or any other text.

            Job Details:
            ---
            ${jobDetails}
            ---

            Available Professionals:
            ---
            ${proProfilesString}
            ---

            Top 3 Matched Pro IDs (comma-separated):
        `;

        const result = await generationModel.generateContent(prompt);
        const text = result.response.text().trim();

        // Extract IDs from the response
        const matchedIds = text.split(',')
            .map(id => id.trim())
            .filter(id => mongoose.Types.ObjectId.isValid(id)); // Validate IDs

        if (matchedIds.length === 0) return [];

        // Fetch the full profiles of the matched IDs
        const matchedPros = await User.find({ _id: { $in: matchedIds } })
            .select('name email role title avatarUrl skills bio'); // Select fields for display

        return matchedPros;

     } catch (error) {
         console.error("Error matching pros to job with Gemini:", error);
         throw new Error(`Failed to get pro matches from AI: ${error.message}`);
     }
};


module.exports = {
  generateJobDescription,
  moderateContent,
  suggestJobPrice,  // <-- Export new
  matchProsToJob,   // <-- Export new
};