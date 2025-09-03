// Contrôleur pour la gestion de l'authentification

const User = require('../models/User.model');
const { asyncHandler, AppError } = require('../middlewares/errorHandler');
const crypto = require('crypto');

// Fonction utilitaire pour envoyer la réponse avec le token JWT
// Cette fonction crée le token, configure le cookie et envoie la réponse
const sendTokenResponse = (user, statusCode, res, message = 'Succès') => {
  // Générer le token JWT pour l'utilisateur
  const token = user.generateAuthToken();
  
  // Options pour le cookie sécurisé
  const cookieOptions = {
    expires: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 jours
    ),
    httpOnly: true, // Le cookie n'est pas accessible via JavaScript
    secure: process.env.NODE_ENV === 'production', // HTTPS uniquement en production
    sameSite: 'strict' // Protection CSRF
  };
  
  // Envoyer la réponse avec le token dans un cookie et dans le body
  res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json({
      success: true,
      message,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        preferences: user.preferences
      }
    });
};

// Contrôleur pour l'inscription d'un nouvel utilisateur
// Cette fonction crée un nouveau compte utilisateur avec validation
const register = asyncHandler(async (req, res, next) => {
  const { name, email, password, confirmPassword } = req.body;
  
  // Validation des données d'entrée
  if (!name || !email || !password) {
    return next(new AppError('Tous les champs sont requis', 400));
  }
  
  // Vérifier que les mots de passe correspondent
  if (password !== confirmPassword) {
    return next(new AppError('Les mots de passe ne correspondent pas', 400));
  }
  
  // Vérifier la force du mot de passe
  if (password.length < 6) {
    return next(new AppError('Le mot de passe doit contenir au moins 6 caractères', 400));
  }
  
  // Vérifier si l'utilisateur existe déjà
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return next(new AppError('Cet email est déjà utilisé', 409));
  }
  
  // Créer le nouvel utilisateur
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    authProvider: 'local'
  });
  
  // Générer un token de vérification d'email
  const verificationToken = crypto.randomBytes(20).toString('hex');
  user.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  await user.save({ validateBeforeSave: false });
  
  // TODO: Envoyer l'email de vérification
  // await sendVerificationEmail(user.email, verificationToken);
  
  // Envoyer la réponse avec le token
  sendTokenResponse(user, 201, res, 'Inscription réussie ! Veuillez vérifier votre email.');
});

// Contrôleur pour la connexion d'un utilisateur
// Cette fonction authentifie un utilisateur avec email et mot de passe
const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  
  // Validation des données d'entrée
  if (!email || !password) {
    return next(new AppError('Email et mot de passe requis', 400));
  }
  
  // Rechercher l'utilisateur avec le mot de passe (normalement exclu)
  const user = await User.findOne({ 
    email: email.toLowerCase(),
    authProvider: 'local'
  }).select('+password');
  
  // Vérifier si l'utilisateur existe
  if (!user) {
    // Incrémenter les tentatives pour cette IP (sécurité)
    return next(new AppError('Email ou mot de passe incorrect', 401));
  }
  
  // Vérifier si le compte est verrouillé
  if (user.isLocked) {
    return next(new AppError('Compte verrouillé. Veuillez réessayer plus tard.', 423));
  }
  
  // Vérifier le mot de passe
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    // Incrémenter les tentatives de connexion échouées
    await user.incLoginAttempts();
    return next(new AppError('Email ou mot de passe incorrect', 401));
  }
  
  // Vérifier si le compte est actif
  if (!user.isActive) {
    return next(new AppError('Compte désactivé. Contactez l\'administrateur.', 403));
  }
  
  // Réinitialiser les tentatives de connexion après succès
  await user.resetLoginAttempts();
  
  // Envoyer la réponse avec le token
  sendTokenResponse(user, 200, res, 'Connexion réussie !');
});

// Contrôleur pour la déconnexion
// Cette fonction invalide le token côté client
const logout = asyncHandler(async (req, res, next) => {
  // Supprimer le cookie contenant le token
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000), // Expire dans 10 secondes
    httpOnly: true
  });
  
  res.status(200).json({
    success: true,
    message: 'Déconnexion réussie'
  });
});

// Contrôleur pour récupérer le profil de l'utilisateur connecté
// Cette fonction retourne les informations de l'utilisateur authentifié
const getMe = asyncHandler(async (req, res, next) => {
  // L'utilisateur est déjà attaché à req par le middleware protect
  const user = await User.findById(req.user.id)
    .populate('collections', 'name description membersCount')
    .populate('sharedCollections.collection', 'name description');
  
  res.status(200).json({
    success: true,
    data: user
  });
});

// Contrôleur pour mettre à jour le profil utilisateur
// Cette fonction permet de modifier les informations personnelles
const updateProfile = asyncHandler(async (req, res, next) => {
  const fieldsToUpdate = {
    name: req.body.name,
    avatar: req.body.avatar,
    preferences: req.body.preferences
  };
  
  // Retirer les champs undefined
  Object.keys(fieldsToUpdate).forEach(key => 
    fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );
  
  // Empêcher la modification de certains champs sensibles
  delete req.body.password;
  delete req.body.email;
  delete req.body.role;
  
  const user = await User.findByIdAndUpdate(
    req.user.id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    message: 'Profil mis à jour avec succès',
    data: user
  });
});

// Contrôleur pour changer le mot de passe
// Cette fonction permet de modifier le mot de passe avec vérification de l'ancien
const updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  
  // Validation des données
  if (!currentPassword || !newPassword) {
    return next(new AppError('Mot de passe actuel et nouveau requis', 400));
  }
  
  if (newPassword !== confirmPassword) {
    return next(new AppError('Les nouveaux mots de passe ne correspondent pas', 400));
  }
  
  if (newPassword.length < 6) {
    return next(new AppError('Le nouveau mot de passe doit contenir au moins 6 caractères', 400));
  }
  
  // Récupérer l'utilisateur avec le mot de passe
  const user = await User.findById(req.user.id).select('+password');
  
  // Vérifier l'ancien mot de passe
  const isPasswordValid = await user.comparePassword(currentPassword);
  if (!isPasswordValid) {
    return next(new AppError('Mot de passe actuel incorrect', 401));
  }
  
  // Mettre à jour le mot de passe
  user.password = newPassword;
  await user.save();
  
  // Renvoyer un nouveau token
  sendTokenResponse(user, 200, res, 'Mot de passe modifié avec succès');
});

// Contrôleur pour demander la réinitialisation du mot de passe
// Cette fonction génère un token de réinitialisation et l'envoie par email
const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  
  if (!email) {
    return next(new AppError('Email requis', 400));
  }
  
  // Rechercher l'utilisateur
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    // Pour des raisons de sécurité, on ne révèle pas si l'email existe
    return res.status(200).json({
      success: true,
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
    });
  }
  
  // Générer le token de réinitialisation
  const resetToken = user.generateResetPasswordToken();
  await user.save({ validateBeforeSave: false });
  
  // Créer l'URL de réinitialisation
  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
  
  // TODO: Envoyer l'email avec le lien
  // await sendResetPasswordEmail(user.email, resetUrl);
  
  // En développement, on peut logger l'URL
  if (process.env.NODE_ENV === 'development') {
    console.log('Reset URL:', resetUrl);
  }
  
  res.status(200).json({
    success: true,
    message: 'Email de réinitialisation envoyé',
    ...(process.env.NODE_ENV === 'development' && { resetToken })
  });
});

// Contrôleur pour réinitialiser le mot de passe avec le token
// Cette fonction valide le token et met à jour le mot de passe
const resetPassword = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;
  
  // Validation
  if (!password || password !== confirmPassword) {
    return next(new AppError('Les mots de passe ne correspondent pas', 400));
  }
  
  // Hasher le token reçu pour le comparer
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  // Rechercher l'utilisateur avec le token valide et non expiré
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  });
  
  if (!user) {
    return next(new AppError('Token invalide ou expiré', 400));
  }
  
  // Mettre à jour le mot de passe
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  
  // Connecter l'utilisateur automatiquement
  sendTokenResponse(user, 200, res, 'Mot de passe réinitialisé avec succès');
});

// Contrôleur pour vérifier l'email
// Cette fonction valide le token de vérification d'email
const verifyEmail = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  
  // Hasher le token pour comparaison
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  // Rechercher l'utilisateur avec le token
  const user = await User.findOne({
    emailVerificationToken: hashedToken
  });
  
  if (!user) {
    return next(new AppError('Token de vérification invalide', 400));
  }
  
  // Marquer l'email comme vérifié
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  await user.save({ validateBeforeSave: false });
  
  res.status(200).json({
    success: true,
    message: 'Email vérifié avec succès'
  });
});

// Contrôleur pour la suppression de compte
// Cette fonction permet à un utilisateur de supprimer son propre compte
const deleteAccount = asyncHandler(async (req, res, next) => {
  const { password } = req.body;
  
  // Vérifier le mot de passe pour confirmation
  const user = await User.findById(req.user.id).select('+password');
  
  if (user.authProvider === 'local') {
    if (!password) {
      return next(new AppError('Mot de passe requis pour confirmer la suppression', 400));
    }
    
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new AppError('Mot de passe incorrect', 401));
    }
  }
  
  // Marquer le compte comme inactif plutôt que de le supprimer
  user.isActive = false;
  user.email = `deleted_${user._id}_${user.email}`;
  await user.save({ validateBeforeSave: false });
  
  res.status(200).json({
    success: true,
    message: 'Compte supprimé avec succès'
  });
});

// Contrôleur pour les callbacks OAuth
// Cette fonction gère le retour des authentifications OAuth
const oauthCallback = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Échec de l\'authentification OAuth', 401));
  }
  
  // Générer le token JWT
  const token = req.user.generateAuthToken();
  
  // Rediriger vers le frontend avec le token
  const redirectUrl = `${process.env.CLIENT_URL}/auth/callback?token=${token}`;
  res.redirect(redirectUrl);
});

module.exports = {
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
};