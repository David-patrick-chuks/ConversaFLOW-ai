import mongoose from "mongoose";

// Create the user schema
const userSchema = new mongoose.Schema(
  {
    fullname: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    confirmPassword: { type: String }, // Not stored in DB, used for validation in controller
    picture: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    otp: { type: String },
    otpExpiry: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpiry: { type: Date },
    lastLogin: { type: Date, default: Date.now },
    profileVerification: { type: Boolean, default: false },
    refreshToken: { type: String },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt
  }
);

// Export the User model
const User = mongoose.model("User", userSchema);

export default User;
