const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- Define Portfolio Item Sub-Schema ---
const portfolioItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  imageUrl: { type: String, required: true }, // URL from Cloudinary
  cloudinaryPublicId: { type: String, required: true }, // For deletion
  projectUrl: { type: String, trim: true }, // Optional link to live project
  addedAt: { type: Date, default: Date.now },
});

// --- Define default preferences structure ---
const defaultNotificationPreferences = {
    newMessage: { email: true, inApp: true },
    proposalReceived: { email: true, inApp: true },
    proposalAccepted: { email: true, inApp: true },
    bookingCreated: { email: true, inApp: true },
    milestoneFunded: { email: true, inApp: true },
    milestoneReleased: { email: true, inApp: true },
    reviewSubmitted: { email: false, inApp: true }, // Example: Default off for email
    disputeOpened: { email: true, inApp: true },
    disputeResolved: { email: true, inApp: true },
    // Add more types as needed
};

// Define the structure for preferences within the user schema
const notificationPreferenceSchema = new mongoose.Schema({
    email: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true },
}, { _id: false });


// --- Main User Schema ---
const userSchema = new mongoose.Schema(
  {
   name: {
    type: String,
    sparse: true, // <-- ADD THIS LINE
    trim: true,
  },
    email: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true, 
      lowercase: true, 
      match: [ /^\S+@\S+\.\S+$/, 'Please use a valid email'] 
    },
    password: { 
      type: String, 
      required: true, 
      minlength: 6, 
      select: false // Hides password from default queries
    },
    role: { 
      type: String, 
      enum: ['client', 'pro', 'admin'], 
      default: 'client' 
    },
    
    // --- Pro Specific Fields ---
    title: { // Pro's headline
        type: String,
        trim: true,
        maxlength: 100,
    },
    bio: { // Pro's summary/biography
        type: String,
        trim: true,
        maxlength: 2000,
    },
    skills: [{ // Array of references to Skill documents
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
    }],
    // --- End Pro Specific ---

    complianceStatus: { 
        type: String,
        enum: ['pending', 'submitted', 'in_review', 'approved', 'rejected', 'expired'],
        default: 'pending', // Default status for new users
    },
    // The relationship is implicitly one-to-one via the 'user' field in ComplianceRequest.
    // If you wish to store the reference here too:
    complianceRequest: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ComplianceRequest',
        select: false, // Don't fetch by default
    },
    
    isKycVerified: { type: Boolean, default: false },


    stripeAccountId: { type: String, select: false },
    stripeOnboardingComplete: { type: Boolean, default: false },
    stripeCustomerId: { type: String, select: false },

    portfolio: [portfolioItemSchema],

    credits: { 
      type: Number, 
      // Gives 10 free credits to new pros, 0 to clients/admins
      default: function() { return this.role === 'pro' ? 10 : 0; }, 
      min: 0 
    },
    
    notificationPreferences: { 
      type: Map, 
      of: notificationPreferenceSchema, 
      default: defaultNotificationPreferences 
    },
  },
  { timestamps: true }
);

// --- Middleware: Hash password before saving ---
userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  // Generate a salt and hash the password
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// --- Method: Compare entered password with hashed password ---
userSchema.methods.comparePassword = async function (enteredPassword) {
  // 'this.password' refers to the hashed password from the DB
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);