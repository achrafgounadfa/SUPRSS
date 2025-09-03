// Routes pour l'authentification et la gestion des utilisateurs

const express = require('express');
const router = express.Router();
const passport = require('passport');
const { body } = require('express-validator');

// Import des contrôleurs
const {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  updatePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  deleteAccount,
  oauthCallback
} = require('../controllers/auth.controller');

// Import des middlewares
const { protect } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/errorHandler');

// Validations pour l'inscription
// Ces règles garantissent que les données reçues sont correctes
const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Le nom est requis')
    .isLength({ min: 2, max: 50 }).withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/).withMessage('Le nom ne peut contenir que des lettres'),
  body('email')
    .trim()
    .notEmpty().withMessage('L\'email est requis')
    .isEmail().withMessage('Email invalide')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Le mot de passe est requis')
    .isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères')
    .matches(/\d/).withMessage('Le mot de passe doit contenir au moins un chiffre'),
  body('confirmPassword')
    .notEmpty().withMessage('La confirmation du mot de passe est requise')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Les mots de passe ne correspondent pas')
];

// Validations pour la connexion
const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('L\'email est requis')
    .isEmail().withMessage('Email invalide')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Le mot de passe est requis')
];

// Validations pour la mise à jour du profil
const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/).withMessage('Le nom ne peut contenir que des lettres'),
  body('avatar')
    .optional()
    .isURL().withMessage('L\'URL de l\'avatar est invalide'),
  body('preferences.theme')
    .optional()
    .isIn(['light', 'dark', 'auto']).withMessage('Thème invalide'),
  body('preferences.fontSize')
    .optional()
    .isIn(['small', 'medium', 'large']).withMessage('Taille de police invalide'),
  body('preferences.language')
    .optional()
    .isIn(['fr', 'en', 'es', 'de']).withMessage('Langue non supportée')
];

// Validations pour le changement de mot de passe
const updatePasswordValidation = [
  body('currentPassword')
    .notEmpty().withMessage('Le mot de passe actuel est requis'),
  body('newPassword')
    .notEmpty().withMessage('Le nouveau mot de passe est requis')
    .isLength({ min: 6 }).withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères')
    .matches(/\d/).withMessage('Le nouveau mot de passe doit contenir au moins un chiffre'),
  body('confirmPassword')
    .notEmpty().withMessage('La confirmation du mot de passe est requise')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Les nouveaux mots de passe ne correspondent pas')
];

// Validations pour la réinitialisation du mot de passe
const resetPasswordValidation = [
  body('password')
    .notEmpty().withMessage('Le mot de passe est requis')
    .isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères')
    .matches(/\d/).withMessage('Le mot de passe doit contenir au moins un chiffre'),
  body('confirmPassword')
    .notEmpty().withMessage('La confirmation du mot de passe est requise')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Les mots de passe ne correspondent pas')
];

// ========================================
// Routes publiques (sans authentification)
// ========================================

// Route d'inscription - Créer un nouveau compte utilisateur
// POST /api/auth/register
router.post(
  '/register',
  validateRequest(registerValidation),
  register
);

// Route de connexion - Authentifier un utilisateur existant
// POST /api/auth/login
router.post(
  '/login',
  validateRequest(loginValidation),
  login
);

// Route de déconnexion - Invalider la session
// POST /api/auth/logout
router.post('/logout', logout);

// Route de demande de réinitialisation de mot de passe
// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  validateRequest([
    body('email')
      .trim()
      .notEmpty().withMessage('L\'email est requis')
      .isEmail().withMessage('Email invalide')
      .normalizeEmail()
  ]),
  forgotPassword
);

// Route de réinitialisation du mot de passe avec token
// PUT /api/auth/reset-password/:token
router.put(
  '/reset-password/:token',
  validateRequest(resetPasswordValidation),
  resetPassword
);

// Route de vérification d'email
// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', verifyEmail);

// ========================================
// Routes OAuth2 (Google et GitHub)
// ========================================

// Route d'authentification Google - Initier le flux OAuth
// GET /api/auth/google
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

// Callback Google OAuth - Recevoir la réponse de Google
// GET /api/auth/google/callback
router.get(
  '/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${process.env.CLIENT_URL}/login?error=oauth_failed`,
    session: false 
  }),
  oauthCallback
);

// Route d'authentification GitHub - Initier le flux OAuth
// GET /api/auth/github
router.get(
  '/github',
  passport.authenticate('github', {
    scope: ['user:email']
  })
);

// Callback GitHub OAuth - Recevoir la réponse de GitHub
// GET /api/auth/github/callback
router.get(
  '/github/callback',
  passport.authenticate('github', { 
    failureRedirect: `${process.env.CLIENT_URL}/login?error=oauth_failed`,
    session: false
  }),
  oauthCallback
);

// ========================================
// Routes protégées (authentification requise)
// ========================================

// Route pour obtenir le profil de l'utilisateur connecté
// GET /api/auth/me
router.get('/me', protect, getMe);

// Route pour mettre à jour le profil utilisateur
// PUT /api/auth/update-profile
router.put(
  '/update-profile',
  protect,
  validateRequest(updateProfileValidation),
  updateProfile
);

// Route pour changer le mot de passe
// PUT /api/auth/update-password
router.put(
  '/update-password',
  protect,
  validateRequest(updatePasswordValidation),
  updatePassword
);

// Route pour supprimer le compte utilisateur
// DELETE /api/auth/delete-account
router.delete(
  '/delete-account',
  protect,
  validateRequest([
    body('password')
      .if(body('authProvider').equals('local'))
      .notEmpty().withMessage('Le mot de passe est requis pour confirmer la suppression')
  ]),
  deleteAccount
);

// ========================================
// Routes de test et de santé
// ========================================

// Route de vérification du statut de l'authentification
// GET /api/auth/check
router.get('/check', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Utilisateur authentifié',
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// Route de test pour vérifier que les routes auth fonctionnent
// GET /api/auth/test
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Routes d\'authentification SUPRSS fonctionnelles',
    timestamp: new Date().toISOString(),
    author: 'Gounadfa Achraf'
  });
});

module.exports = router;