import dotenv from "dotenv";
import nodemailer from "nodemailer";
import logger from "../config/logger.js";

// Load environment variables
dotenv.config();

// Create Nodemailer transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.SMTP_SERVICE,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    logger: true, // Enable logging for debugging
    debug: true, // Enable debug output
  });
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetLink, ipAddress) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: '"AskZen-ai Team" <askzenai@gmail.com>',
    to: email,
    subject: "Password Reset Request",
    text: `Hello,\n\nYou requested a password reset. Click the link below to reset your password:\n${resetLink}\n\nIf you did not request this, please ignore this email.\nIp-Address: ${ipAddress}\n\nBest,\nAskZen-ai Team`,
    html: `<p>Hello,</p><p>You requested a password reset. Click the link below to reset your password:</p><p><a href="${resetLink}">Reset Password</a></p><p>If you did not request this, please ignore this email.</p><p>Ip-Address: ${ipAddress}</p><p>Best,<br>AskZen-ai Team</p>`,
  };

  try {
    const response = await transporter.sendMail(mailOptions);
    logger.info(
      `Password reset email sent to ${email}: ${JSON.stringify(response)}`
    );
  } catch (error) {
    logger.error(
      `Error sending password reset email to ${email}: ${error.message}`
    );
    throw error; // Re-throw to allow caller to handle
  }
};

// Send OTP email
const sendOTPEmail = async (fullname, email, otp) => {
  const transporter = createTransporter();
  const clientBaseUrl = process.env.CORS_ORIGIN;
  const verificationLink = `${clientBaseUrl}/otp?email=${encodeURIComponent(
    email
  )}`;

  const mailOptions = {
    from: '"AskZen-ai Team" <askzenai@gmail.com>',
    to: email,
    subject: "Verify Your Email - OTP",
    text: `Hello ${fullname},\n\nYour OTP for email verification is: ${otp}\nPlease use this code within 15 minutes.\n\nBest,\nAskZen-ai Team\n\nClick the link below to verify your email:\n${verificationLink}`,
    html: `
      <p>Hello ${fullname},</p>
      <p>Your OTP for email verification is: <strong>${otp}</strong></p>
      <p>Please use this code within 15 minutes.</p>
      <p><a href="${verificationLink}" style="color: #4F46E5; text-decoration: none;">Click here to verify your email</a></p>
      <p>Best,<br>AskZen-ai Team</p>
    `,
  };

  try {
    const response = await transporter.sendMail(mailOptions);
    logger.info(`OTP email sent to ${email}: ${JSON.stringify(response)}`);
  } catch (error) {
    logger.error(`Error sending OTP email to ${email}: ${error.message}`);
    throw error;
  }
};

// Send welcome email
const sendWelcomeEmail = async (fullname, email) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: '"AskZen-ai Team" <askzenai@gmail.com>',
    to: email,
    subject: "Welcome to Askzen-ai!",
    text: `Hi ${fullname},\n\nWelcome to Askzen-ai! Your email has been verified successfully.\n\nBest Regards,\nThe AskZen-ai Team`,
    html: `<p>Hi ${fullname},</p><p>Welcome to <strong>Askzen-ai</strong>! Your email has been verified successfully.</p><p>Best Regards,<br>The AskZen-ai Team</p>`,
  };

  try {
    const response = await transporter.sendMail(mailOptions);
    logger.info(`Welcome email sent to ${email}: ${JSON.stringify(response)}`);
  } catch (error) {
    logger.error(`Error sending welcome email to ${email}: ${error.message}`);
    throw error;
  }
};

// Resend OTP email
const resendOTPEmail = async (fullname, email, otp) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: '"AskZen-ai Team" <askzenai@gmail.com>',
    to: email,
    subject: "Resend OTP - Askzen-ai",
    text: `Hello ${fullname},\n\nYour new OTP for email verification is: ${otp}\nPlease use this code within 15 minutes.\n\nBest,\nAskZen-ai Team`,
    html: `<p>Hello ${fullname},</p><p>Your new OTP for email verification is: <strong>${otp}</strong></p><p>Please use this code within 15 minutes.</p><p>Best,<br>AskZen-ai Team</p>`,
  };

  try {
    const response = await transporter.sendMail(mailOptions);
    logger.info(
      `Resend OTP email sent to ${email}: ${JSON.stringify(response)}`
    );
  } catch (error) {
    logger.error(
      `Error sending resend OTP email to ${email}: ${error.message}`
    );
    throw error;
  }
};

export {
  createTransporter,
  sendPasswordResetEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  resendOTPEmail,
};
