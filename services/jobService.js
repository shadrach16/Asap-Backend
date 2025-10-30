import api from './api';

/**
 * Creates a new job posting.
 * @param {object} jobData - { title, description, budget, currency?, skills?, location? }
 * @returns {Promise<object>} - The created job object.
 */
const postJob = async (jobData) => {
  try {
    const response = await api.post('/jobs', jobData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Fetches available jobs with optional filtering and pagination.
 * @param {object} params - Query parameters (e.g., { page: 1, limit: 10, skills: 'React', location: 'Remote' })
 * @returns {Promise<object>} - The API response containing jobs data and pagination info.
 */
const getJobs = async (params = {}) => {
  try {
    const response = await api.get('/jobs', { params });
    return response.data; // Expects { results, totalPages, currentPage, data }
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Fetches details for a specific job.
 * @param {string} jobId - The ID of the job.
 * @returns {Promise<object>} - The job object.
 */
const getJobById = async (jobId) => {
    try {
      // Note: The backend route for GET /api/jobs/:id isn't defined yet,
      // but we anticipate needing it. We'll add it here for now.
      const response = await api.get(`/jobs/${jobId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  };


const jobService = {
  postJob,
  getJobs,
  getJobById, // Add this for Task 4.7
};

export default jobService;