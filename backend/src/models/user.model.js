// Modèle Mongoose pour les utilisateurs

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Schéma utilisateur définissant la structure des données
const userSchema = new mongoose.Schema({
  // Nom complet de l'utilisateur
  name: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères']
  },
  
  // Email unique pour l'identification
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Veuillez fournir un email valide'
    ]
  },
  
  // Mot de passe hashé (non requis pour OAuth)
  password: {
    type: String,
    minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères'],
    select: false // Ne pas renvoyer le mot de passe par défaut dans les requêtes
  },
  
  // Photo de profil de l'utilisateur
  avatar: {
    type: String,
    default: 'https://ui-avatars.com/api/?name=User&background=random'
  },
  
  // Provider d'authentification (local, google, github)
  authProvider: {
    type: String,
    enum: ['local', 'google', 'github'],
    default: 'local'
  },
  
  // ID du provider OAuth (pour Google/GitHub)
  providerId: {
    type: String,
    sparse: true
  },
  
  // Rôle de l'utilisateur dans l'application
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  
  // Préférences utilisateur
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    fontSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium'
    },
    language: {
      type: String,
      default: 'fr'
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false }
    }
  },
  
  // Collections créées par l'utilisateur
  collections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection'
  }],
  
  // Collections partagées avec l'utilisateur
  sharedCollections: [{
    collection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Collection'
    },
    role: {
      type: String,
      enum: ['reader', 'contributor', 'admin'],
      default: 'reader'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Token de réinitialisation de mot de passe
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  // Statut du compte
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Email vérifié
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  // Token de vérification d'email
  emailVerificationToken: String,
  
  // Date de dernière connexion
  lastLogin: {
    type: Date,
    default: Date.now
  },
  
  // Compteur de tentatives de connexion échouées
  loginAttempts: {
    type: Number,
    default: 0
  },
  
  // Date de blocage du compte
  lockUntil: Date
  
}, {
  timestamps: true, // Ajoute createdAt et updatedAt automatiquement
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances de recherche
userSchema.index({ email: 1 });
userSchema.index({ authProvider: 1, providerId: 1 });

// Virtual pour vérifier si le compte est verrouillé
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Méthode pour hasher le mot de passe avant la sauvegarde
userSchema.pre('save', async function(next) {
  // Ne hasher que si le mot de passe a été modifié
  if (!this.isModified('password')) {
    return next();
  }
  
  // Hasher le mot de passe avec un salt de 10
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Méthode pour comparer le mot de passe entré avec le hash
userSchema.methods.comparePassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Méthode pour générer un JWT
userSchema.methods.generateAuthToken = function() {
  const payload = {
    id: this._id,
    email: this.email,
    role: this.role,
    name: this.name
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Méthode pour générer un token de réinitialisation de mot de passe
userSchema.methods.generateResetPasswordToken = function() {
  // Générer un token aléatoire
  const resetToken = require('crypto').randomBytes(20).toString('hex');
  
  // Hasher le token et le stocker dans la base de données
  this.resetPasswordToken = require('crypto')
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  // Définir l'expiration à 10 minutes
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  
  return resetToken;
};

// Méthode pour incrémenter les tentatives de connexion
userSchema.methods.incLoginAttempts = function() {
  // Si on a un verrou précédent qui a expiré, on réinitialise
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Verrouiller le compte après 5 tentatives pour 2 heures
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 heures
  
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }
  
  return this.updateOne(updates);
};

// Méthode pour réinitialiser les tentatives de connexion
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $set: { loginAttempts: 0, lastLogin: Date.now() },
    $unset: { lockUntil: 1 }
  });
};

// Méthode pour nettoyer les données sensibles avant l'envoi
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpire;
  delete user.emailVerificationToken;
  delete user.__v;
  return user;
};

// Méthode statique pour trouver ou créer un utilisateur OAuth
userSchema.statics.findOrCreateOAuth = async function(profile, provider) {
  try {
    // Rechercher l'utilisateur existant
    let user = await this.findOne({
      $or: [
        { authProvider: provider, providerId: profile.id },
        { email: profile.emails?.[0]?.value }
      ]
    });
    
    if (user) {
      // Mettre à jour la dernière connexion
      user.lastLogin = Date.now();
      await user.save();
      return user;
    }
    
    // Créer un nouvel utilisateur
    user = await this.create({
      name: profile.displayName || profile.username,
      email: profile.emails?.[0]?.value || `${profile.id}@${provider}.com`,
      authProvider: provider,
      providerId: profile.id,
      avatar: profile.photos?.[0]?.value,
      isEmailVerified: true // OAuth emails sont considérés comme vérifiés
    });
    
    return user;
  } catch (error) {
    throw new Error(`Erreur OAuth ${provider}: ${error.message}`);
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;