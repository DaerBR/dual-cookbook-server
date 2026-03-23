import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User';
import { getEnv, getPublicBaseUrl } from '../config/env';
import { isEmailAllowed } from '../config/allowedEmails';

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id: string, done) => {
  User.findById(id)
    .then((user) => done(null, user))
    .catch((err: Error) => done(err, null));
});

const env = getEnv();
const callbackURL = `${getPublicBaseUrl()}/auth/google/callback`;

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const existingByGoogle = await User.findOne({ googleId: profile.id });
        if (existingByGoogle) {
          return done(null, existingByGoogle);
        }

        const rawEmail = profile.emails?.[0]?.value;
        const email = rawEmail?.trim().toLowerCase();
        if (!email || !isEmailAllowed(email)) {
          return done(null, false);
        }

        const existingByEmail = await User.findOne({ email });
        if (existingByEmail) {
          existingByEmail.googleId = profile.id;
          if (profile.displayName) {
            existingByEmail.displayName = profile.displayName;
          }
          await existingByEmail.save();
          return done(null, existingByEmail);
        }

        const user = await User.create({
          googleId: profile.id,
          displayName: profile.displayName ?? email,
          email,
        });
        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    },
  ),
);
