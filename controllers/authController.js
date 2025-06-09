import jwt from "jsonwebtoken";
import logger from "../config/logger.js";
import passport from "passport";
import User from "../models/userModel.js";
import {
  sendOTPEmail,
  resendOTPEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "../services/emailService.js";
import {
  comparePassword,
  generateOTP,
  generateResetToken,
  getClientIp,
  hashPassword,
} from "../utils/hashUtils.js";

// Utility function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// Utility function to set token cookie
const setTokenCookie = (res, token) => {
  const cookieOptions = {
    expires: new Date(
      Date.now() +
        (process.env.JWT_COOKIE_EXPIRES_IN || 7) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  };

  res.cookie("token", token, cookieOptions);
};

// Forgot Password
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      logger.error(`User not found for email: ${email}`);
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a password reset token and expiry time
    const resetToken = generateResetToken();
    const ipAddress = getClientIp(req);
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiry = new Date(Date.now() + 30 * 60 * 1000); // Token valid for 30 minutes
    await user.save();

    // Create the reset link
    const clientBaseUrl = process.env.CORS_ORIGIN;
    const resetLink = `${clientBaseUrl}/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(
      email
    )}`;

    // Send password reset email
    await sendPasswordResetEmail(email, resetLink, ipAddress);

    res.status(200).json({ message: "Password reset link sent successfully" });
  } catch (error) {
    logger.error("Error in forgot password:", error);
    res.status(400).json({ message: "Error sending password reset email" });
  }
};

// Reset Password
export const resetPassword = async (req, res) => {
  const { token, email, newPassword } = req.body;

  try {
    const user = await User.findOne({ email, resetPasswordToken: token });

    // Check if the user exists and if resetPasswordExpiry is valid
    if (
      !user ||
      (user.resetPasswordExpiry && user.resetPasswordExpiry < new Date())
    ) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // Hash new password
    user.password = await hashPassword(newPassword);
    user.confirmPassword = undefined; // Clear confirmPassword if it exists
    user.resetPasswordToken = undefined; // Clear token
    user.resetPasswordExpiry = undefined; // Clear expiry
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    logger.error("Error resetting password:", error);
    res.status(400).json({ message: "Error resetting password" });
  }
};

// Register a new user and send OTP
export const register = async (req, res) => {
  const { fullname, email, password, confirmPassword } = req.body;

  try {
    // Validate confirmPassword
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.error(`User already exists for email: ${email}`);
      return res.status(400).json({ message: "User already exists" });
    }

    // Generate profile picture and hash password
    // const picture = await generateProfilePicture(fullname);
    const hashedPassword = await hashPassword(password);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // OTP valid for 15 minutes

    // Create new user
    const user = new User({
      email,
      password: hashedPassword,
      otp,
      otpExpiry,
      profileVerification: false,
    });

    // Send OTP email
    await sendOTPEmail(fullname, email, otp);
    await user.save();

    res.status(201).json({
      message: "User registered successfully. Check your email for the OTP.",
    });
  } catch (error) {
    logger.error("Error registering user:", error);
    res.status(400).json({ message: "Error registering user" });
  }
};

// Verify the OTP
export const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.otpExpiry && new Date() > user.otpExpiry) {
      return res
        .status(400)
        .json({ message: "OTP expired. Please request a new one." });
    }

    // OTP is valid, clear OTP fields and mark as verified
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.profileVerification = true;
    await user.save();

    // Send welcome email
    await sendWelcomeEmail(user.fullname, email);

    res
      .status(200)
      .json({ message: "Email verified successfully. Welcome email sent!" });
  } catch (error) {
    logger.error("Error verifying OTP:", error);
    res.status(400).json({ message: "Error verifying OTP" });
  }
};

// Resend OTP
export const resendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate new OTP and expiry time
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // Valid for 15 minutes
    await user.save();

    // Send new OTP email
    await resendOTPEmail(user.fullname, email, otp);
    res.status(200).json({ message: "New OTP sent successfully" });
  } catch (error) {
    logger.error("Error resending OTP:", error);
    res.status(400).json({ message: "Error resending OTP" });
  }
};

// User login
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!user.password || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // Update lastLogin and client IP
    user.lastLogin = new Date();
    user.clientIp = getClientIp(req);
    await user.save();

    // Set JWT as HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.status(200).json({
      message: "Login successful!",
      userData: {
        fullname: user.fullname,
        email: user.email,
        picture: user.picture,
      },
    });
  } catch (error) {
    logger.error("Error during login:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
export const googleAuth = (req, res, next) => {
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
};

// Handle Google OAuth callback
export const googleAuthCallback = (req, res, next) => {
  passport.authenticate(
    "google",
    {
      session: false,
      failureRedirect: `${
        process.env.CLIENT_URL || "http://localhost:3000"
      }/login?error=auth_failed`,
    },
    async (error, user, info) => {
      if (error) {
        logger.error("Google authentication error:", error);
        return res.redirect(
          `${
            process.env.CLIENT_URL || "http://localhost:3000"
          }/login?error=server_error`
        );
      }

      if (!user) {
        logger.error("Google authentication failed: No user returned", info);
        return res.redirect(
          `${
            process.env.CLIENT_URL || "http://localhost:3000"
          }/login?error=no_user`
        );
      }

      try {
        // Generate JWT token
        const token = generateToken(user._id);

        // Set token cookie
        setTokenCookie(res, token);

        logger.info(`Google OAuth successful for user: ${user.email}`);

        // Redirect to success page
        const redirectUrl = `${
          process.env.CLIENT_URL || "http://localhost:3000"
        }/dashboard?login=success`;

        res.redirect(redirectUrl);
      } catch (tokenError) {
        logger.error("JWT token generation error:", tokenError);
        res.redirect(
          `${
            process.env.CLIENT_URL || "http://localhost:3000"
          }/login?error=token_failed`
        );
      }
    }
  )(req, res, next);
};

// Logout
export const logout = (req, res) => {
  try {
    res.clearCookie("token");
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    logger.error("Error while logging user out:", error);
    res.status(400).json({ message: "Error while logging user out" });
  }
};

// Check authentication
export const checkAuth = async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "No token provided, unauthorized" });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (error, decoded) => {
    if (error || !decoded) {
      return res.status(401).json({ message: "Token is invalid or expired" });
    }

    try {
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.status(200).json({
        user: {
          id: user._id,
          fullname: user.fullname,
          email: user.email,
          picture: user.picture,
        },
      });
    } catch (err) {
      logger.error("Error finding user:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
};
