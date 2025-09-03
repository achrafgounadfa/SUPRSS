// Configuration de Passport pour JWT et OAuth2

const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User.model');

// Configuration de la stratégie JWT pour l'authentification par token
const configurePassport = (passport) => {
  
  // Options pour la stratégie JWT
  const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET
  };
  
  // Stratégie JWT - Vérifie la validité du token et récupère l'utilisateur
  passport.use(
    new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
      try {
        // Rechercher l'utilisateur par son ID contenu dans le token
        const user = await User.findById(jwtPayload.id)
          .select('-password')
          .populate('collections', 'name description');
        
        if (user && user.isActive) {
          return done(null, user);
        }
        
        return done(null, false);
      } catch (error) {
        console.error('Erreur JWT Strategy:', error);
        return done(error, false);
      }
    })
  );
  
  // Stratégie Google OAuth2 - Authentification via Google
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
          scope: ['profile', 'email']
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            // Utiliser la méthode statique pour trouver ou créer l'utilisateur
            const user = await User.findOrCreateOAuth(profile, 'google');
            return done(null, user);
          } catch (error) {
            console.error('Erreur Google OAuth:', error);
            return done(error, null);
          }
        }
      )
    );
  }
  
  // Stratégie GitHub OAuth2 - Authentification via GitHub
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: process.env.GITHUB_CALLBACK_URL || '/api/auth/github/callback'
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            // Adapter le profil GitHub au format attendu
            const githubProfile = {
              ...profile,
              emails: profile.emails || [{ value: `${profile.username}@github.local` }]
            };
            
            // Utiliser la méthode statique pour trouver ou créer l'utilisateur
            const user = await User.findOrCreateOAuth(githubProfile, 'github');
            return done(null, user);
          } catch (error) {
            console.error('Erreur GitHub OAuth:', error);
            return done(error, null);
          }
        }
      )
    );
  }
  
  // Sérialisation de l'utilisateur pour la session
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });
  
  // Désérialisation de l'utilisateur depuis la session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id).select('-password');
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};

module.exports = { configurePassport };