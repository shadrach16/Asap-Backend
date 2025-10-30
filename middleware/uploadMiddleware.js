const multer = require('multer');

// Configure multer to use memory storage (stores file as Buffer)
const storage = multer.memoryStorage();

// File filter (allow common document/image types)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'text/plain',
    'text/csv',
    'application/vnd.ms-excel', // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
    // Add more allowed MIME types here
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file
  } else {
    // Reject file with a specific error message
    cb(new Error('Invalid file type. Allowed types: Images, PDF, DOC, DOCX, ZIP, TXT, CSV.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit (adjust as needed)
  },
  fileFilter: fileFilter,
});

module.exports = upload;