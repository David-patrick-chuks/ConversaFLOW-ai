import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import logger from "./logger.js";
import User from "../models/userModel.js";

// Load environment variables
dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL:
        process.env.CALLBACK_URL_GOOGLE ||
        "http://localhost:5555/api/auth/google/callback",
      passReqToCallback: true, // Enable passing req to callback to set cookie
    },
    async (req, _accessToken, refreshToken, profile, done) => {
      try {
        // Check if the user already exists by googleId
        const existingUser = await User.findOne({ googleId: profile.id });

        if (existingUser) {
          // Update lastLogin and refreshToken
          existingUser.lastLogin = new Date();
          existingUser.refreshToken = refreshToken;
          await existingUser.save();

          // Generate JWT
          const token = jwt.sign(
            { userId: existingUser._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
          );

          // Set JWT in HTTP-only cookie
          req.res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 60 * 60 * 1000, // 1 hour
          });

          return done(null, existingUser);
        }

        // Check if a user exists with the same email
        const email = profile.emails?.[0]?.value;
        if (!email) {
          logger.error("No email provided by Google");
          return done(
            new Error("Email is required to create a new user"),
            null
          );
        }

        const existingUserByEmail = await User.findOne({ email });
        if (existingUserByEmail) {
          // Link Google account to existing user
          existingUserByEmail.googleId = profile.id;
          existingUserByEmail.refreshToken = refreshToken;
          existingUserByEmail.lastLogin = new Date();
          await existingUserByEmail.save();

          // Generate JWT
          const token = jwt.sign(
            { userId: existingUserByEmail._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
          );

          // Set JWT in HTTP-only cookie
          req.res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 60 * 60 * 1000,
          });

          return done(null, existingUserByEmail);
        }

        // Create a new user
        const newUser = new User({
          googleId: profile.id,
          fullname: profile.displayName || "",
          email: email,
          picture: profile.photos?.[0]?.value || "",
          refreshToken,
          lastLogin: new Date(),
          profileVerification: true, // Auto-verify Google users
        });

        await newUser.save();

        // Generate JWT
        const token = jwt.sign(
          { userId: newUser._id },
          process.env.JWT_SECRET,
          { expiresIn: "1h" }
        );

        // Set JWT in HTTP-only cookie
        req.res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 60 * 60 * 1000,
        });

        return done(null, newUser);
      } catch (error) {
        logger.error("Error during Google authentication:", error);
        return done(error);
      }
    }
  )
);
export default passport;
