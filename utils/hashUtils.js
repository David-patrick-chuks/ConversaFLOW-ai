import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const SALT_ROUNDS = 15;

// Hash a password using bcrypt
export const hashPassword = async (password) => {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  return hashedPassword;
};

// Compare a password with its hashed version
export const comparePassword = async (password, hashedPassword) => {
  const verifyPassword = await bcrypt.compare(password, hashedPassword);
  return verifyPassword;
};

// Generate a secure reset token
export const generateResetToken = () => {
  return randomBytes(32).toString("hex"); // Generates a 64-character hex string
};

// Get client IP address from request
export const getClientIp = (req) => {
  const ip =
    (typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0].trim()
      : null) || req.ip;
  return ip;
};

// Generate a 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate a unique user ID (unused in current User model)
export const generateUserId = () => {
  const companyName = "Ai-World";
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  return `${companyName}-${timestamp}-${randomString}`;
};

// Generate a random username of specified length
export const updateUserName = (length = getRandomValue()) => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }
  return result;
};

// Generate a username from fullname
export const generateUsername = (fullname) => {
  if (!fullname || typeof fullname !== "string") {
    return "@user" + Math.random().toString(36).substring(2, 8);
  }
  const formattedName = fullname.trim().toLowerCase().replace(/\s+/g, "");
  return `@${formattedName}`;
};

// Generate a unique post ID (unused in current User model)
export const generatePostId = () => {
  const initials = "POST_";
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  return `${initials}-${timestamp}-${randomString}`;
};

// Helper function to get random length for updateUserName
function getRandomValue() {
  const values = [3, 4, 5];
  const randomIndex = Math.floor(Math.random() * values.length);
  return values[randomIndex];
}
