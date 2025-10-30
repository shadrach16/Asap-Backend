import api from './api';

/**
 * Uploads a file to the specified booking workspace.
 * @param {string} bookingId - The ID of the booking.
 * @param {FormData} formData - Must contain 'workspaceFile' (File object).
 * @returns {Promise<object>} - The metadata of the uploaded file.
 */
const uploadWorkspaceFile = async (bookingId, formData) => {
  try {
    const response = await api.post(`/bookings/${bookingId}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

const workspaceService = {
  uploadWorkspaceFile,
};

export default workspaceService;