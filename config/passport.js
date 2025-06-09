

// config/googleAuth.js
import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import logger from "./logger.js";
import User from "../models/userModel.js";

dotenv.config();

// Configure Google OAuth strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.CALLBACK_URL_GOOGLE ||
        "http://localhost:5000/api/users/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("Google Profile:", profile);

        // Extract email from profile
        const email = profile.emails?.[0]?.value;
        if (!email) {
          logger.error("No email provided by Google");
          return done(new Error("Email is required"), null);
        }

        // Check if user exists by Google ID
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          // Update existing user
          user.lastLogin = new Date();
          if (refreshToken) user.refreshToken = refreshToken;
          await user.save();
          logger.info(`Existing Google user logged in: ${user.email}`);
          return done(null, user);
        }

        // Check if user exists by email
        user = await User.findOne({ email });

        if (user) {
          // Link Google account to existing email user
          user.googleId = profile.id;
          user.lastLogin = new Date();
          if (refreshToken) user.refreshToken = refreshToken;
          await user.save();
          logger.info(`Linked Google account to existing user: ${user.email}`);
          return done(null, user);
        }

        // Create new user
        const newUser = new User({
          googleId: profile.id,
          fullname: profile.displayName || "",
          email: email,
          picture: profile.photos?.[0]?.value || "",
          refreshToken: refreshToken || null,
          lastLogin: new Date(),
          profileVerification: true,
        });

        await newUser.save();
        logger.info(`New Google user created: ${newUser.email}`);
        return done(null, newUser);
      } catch (error) {
        logger.error("Google OAuth strategy error:", error);
        return done(error, null);
      }
    }
  )
);

export default passport;
