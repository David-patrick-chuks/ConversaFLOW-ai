import express from "express";
import {
  checkAuth,
  googleAuth,
  googleAuthCallback,
  login,
  logout,
  register,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";

const router = express.Router();

// Check authentication status
router.get("/check-auth", checkAuth);

// User actions
router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/logout", logout);

// Google authentication routes
router.get("/google", googleAuth);
router.get("/google/callback", googleAuthCallback);

export default router;
