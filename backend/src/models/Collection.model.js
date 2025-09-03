/*// Auteur : Gounadfa Achraf - SUPRSS Project
// Modèle Mongoose pour les collections de flux RSS

const mongoose = require('mongoose');

// Schéma pour les collections qui regroupent les flux RSS
const collectionSchema = new mongoose.Schema({
  // Nom de la collection
  name: {
    type: String,
    required: [true, 'Le nom de la collection est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  
  // Description de la collection
  description: {
    type: String,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères'],
    default: ''
  },
  
  // Créateur de la collection
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Le propriétaire est requis']
  },
  
  // Type de collection : personnelle ou partagée
  type: {
    type: String,
    enum: ['personal', 'shared'],
    default: 'personal'
  },
  
  // Membres de la collection (pour les collections partagées)
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['creator', 'contributor', 'reader'],
      default: 'reader'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    // Permissions spécifiques pour chaque membre
    permissions: {
      canAddFeeds: { type: Boolean, default: false },
      canRemoveFeeds: { type: Boolean, default: false },
      canInviteMembers: { type: Boolean, default: false },
      canEditSettings: { type: Boolean, default: false },
      canComment: { type: Boolean, default: true },
      canChat: { type: Boolean, default: true }
    }
  }],
  
  // Flux RSS associés à cette collection
  feeds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feed'
  }],
  
  // Paramètres de la collection
  settings: {
    isPublic: {
      type: Boolean,
      default: false
    },
    autoRefresh: {
      type: Boolean,
      default: true
    },
    refreshInterval: {
      type: Number,
      default: 30, // minutes
      min: 5,
      max: 1440 // 24 heures
    },
    maxArticlesPerFeed: {
      type: Number,
      default: 100,
      min: 10,
      max: 1000
    },
    theme: {
      type: String,
      enum: ['default', 'minimal', 'dark', 'colorful'],
      default: 'default'
    }
  },
  
  // Tags/catégories pour organiser les collections
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Icône ou couleur de la collection
  icon: {
    type: String,
    default: '📚'
  },
  
  color: {
    type: String,
    default: '#3B82F6' // Bleu par défaut
  },
  
  // Statistiques de la collection
  stats: {
    totalArticles: {
      type: Number,
      default: 0
    },
    unreadArticles: {
      type: Number,
      default: 0
    },
    totalFeeds: {
      type: Number,
      default: 0
    },
    activeFeeds: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  
  // Code d'invitation pour rejoindre la collection
  inviteCode: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Historique des invitations
  invitations: [{
    email: String,
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired'],
      default: 'pending'
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date
  }],
  
  // Statut de la collection
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Collection archivée
  isArchived: {
    type: Boolean,
    default: false
  },
  
  archivedAt: Date,
  
  // Dernière activité dans la collection
  lastActivity: {
    type: Date,
    default: Date.now
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
collectionSchema.index({ owner: 1 });
collectionSchema.index({ 'members.user': 1 });
collectionSchema.index({ type: 1, isActive: 1 });
collectionSchema.index({ inviteCode: 1 });
collectionSchema.index({ tags: 1 });

// Virtual pour le nombre de membres
collectionSchema.virtual('membersCount').get(function() {
  return this.members ? this.members.length : 0;
});

// Méthode pour vérifier si un utilisateur est membre
collectionSchema.methods.isMember = function(userId) {
  if (this.owner.toString() === userId.toString()) {
    return true;
  }
  return this.members.some(member => 
    member.user.toString() === userId.toString()
  );
};

// Méthode pour obtenir le rôle d'un utilisateur
collectionSchema.methods.getUserRole = function(userId) {
  if (this.owner.toString() === userId.toString()) {
    return 'creator';
  }
  const member = this.members.find(m => 
    m.user.toString() === userId.toString()
  );
  return member ? member.role : null;
};

// Méthode pour vérifier les permissions d'un utilisateur
collectionSchema.methods.userHasPermission = function(userId, permission) {
  if (this.owner.toString() === userId.toString()) {
    return true; // Le créateur a toutes les permissions
  }
  
  const member = this.members.find(m => 
    m.user.toString() === userId.toString()
  );
  
  if (!member) return false;
  
  // Les contributeurs ont plus de permissions que les lecteurs
  if (member.role === 'contributor') {
    const contributorPermissions = ['canAddFeeds', 'canComment', 'canChat'];
    if (contributorPermissions.includes(permission)) return true;
  }
  
  return member.permissions[permission] || false;
};

// Méthode pour ajouter un membre
collectionSchema.methods.addMember = async function(userId, role = 'reader') {
  // Vérifier si déjà membre
  if (this.isMember(userId)) {
    throw new Error('L\'utilisateur est déjà membre de cette collection');
  }
  
  // Définir les permissions selon le rôle
  let permissions = {
    canAddFeeds: false,
    canRemoveFeeds: false,
    canInviteMembers: false,
    canEditSettings: false,
    canComment: true,
    canChat: true
  };
  
  if (role === 'contributor') {
    permissions.canAddFeeds = true;
    permissions.canInviteMembers = true;
  }
  
  this.members.push({
    user: userId,
    role,
    permissions,
    joinedAt: new Date()
  });
  
  return this.save();
};

// Méthode pour retirer un membre
collectionSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(member => 
    member.user.toString() !== userId.toString()
  );
  return this.save();
};

// Méthode pour générer un code d'invitation unique
collectionSchema.methods.generateInviteCode = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  this.inviteCode = code;
  return code;
};

// Méthode pour mettre à jour les statistiques
collectionSchema.methods.updateStats = async function() {
  // Cette méthode sera appelée après l'ajout/suppression d'articles
  const Feed = mongoose.model('Feed');
  const Article = mongoose.model('Article');
  
  const feeds = await Feed.find({ _id: { $in: this.feeds } });
  const articles = await Article.find({ feed: { $in: this.feeds } });
  
  this.stats.totalFeeds = feeds.length;
  this.stats.activeFeeds = feeds.filter(f => f.isActive).length;
  this.stats.totalArticles = articles.length;
  this.stats.unreadArticles = articles.filter(a => !a.isRead).length;
  this.stats.lastUpdated = new Date();
  
  return this.save();
};

// Middleware pour mettre à jour lastActivity
collectionSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.lastActivity = new Date();
  }
  next();
});

// Méthode statique pour trouver les collections d'un utilisateur
collectionSchema.statics.findUserCollections = async function(userId) {
  return this.find({
    $or: [
      { owner: userId },
      { 'members.user': userId }
    ],
    isActive: true,
    isArchived: false
  }).populate('feeds', 'name url');
};

const Collection = mongoose.model('Collection', collectionSchema);

module.exports = Collection;*/

////////////////////////////////////////////////////////////
// Auteur : Gounadfa Achraf - SUPRSS Project
// Modèle Mongoose pour les collections d'articles

const mongoose = require('mongoose');

// Schéma pour les collections
const collectionSchema = new mongoose.Schema({
  // Nom de la collection
  name: {
    type: String,
    required: [true, 'Le nom de la collection est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },

  // Description optionnelle
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
  },

  // Propriétaire de la collection
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Membres avec rôles (reader, contributor, admin)
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
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

  // Flux RSS associés
  feeds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feed'
  }],

  // Visibilité de la collection
  visibility: {
    type: String,
    enum: ['private', 'public', 'shared'],
    default: 'private'
  },

  // Statistiques de la collection
  stats: {
    totalArticles: {
      type: Number,
      default: 0
    },
    unreadArticles: {
      type: Number,
      default: 0
    },
    totalFeeds: {
      type: Number,
      default: 0
    },
    activeFeeds: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },

  // Code d'invitation pour rejoindre la collection
  inviteCode: {
    type: String,
    unique: true,
    sparse: true
  },

  // Tags personnalisés
  tags: [{
    type: String,
    trim: true
  }],

  // Couleur et icône de la collection
  color: {
    type: String,
    default: '#000000'
  },
  icon: {
    type: String,
    default: '📁'
  },

  // Statut de la collection
  isActive: {
    type: Boolean,
    default: true
  },
  isArchived: {
    type: Boolean,
    default: false
  },

  // Dates de création et dernière activité
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true
});

// ============================================================
// Méthodes et middlewares
// ============================================================

// Vérifie si un utilisateur est membre de la collection
collectionSchema.methods.isMember = function (userId) {
  if (!userId) return false;
  if (this.owner.toString() === userId.toString()) return true;
  return this.members.some(m => m.user.toString() === userId.toString());
};

// Génère un code d'invitation unique
collectionSchema.methods.generateInviteCode = function () {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  this.inviteCode = code;
  return code;
};

// ✅ Vérifie les permissions d'un utilisateur (ajouté pour éviter l'erreur)
collectionSchema.methods.userHasPermission = function (userId, permission) {
  // Si aucun userId → pas de permission
  if (!userId) return false;

  // Le propriétaire a tous les droits
  if (this.owner.toString() === userId.toString()) {
    return true;
  }

  // On récupère le membre correspondant
  const member = this.members.find(m => m.user.toString() === userId.toString());
  if (!member) return false;

  // Les admins ont tous les droits
  if (member.role === 'admin') {
    return true;
  }

  // Les contributeurs ont un jeu de permissions limité
  const contributorPermissions = [
    'canAddFeeds',
    'canRemoveFeeds',
    'canInviteMembers',
    'canEditSettings',
    'canComment',
    'canChat'
  ];
  if (member.role === 'contributor' && contributorPermissions.includes(permission)) {
    return true;
  }

  // Les lecteurs n’ont aucun droit d’édition (juste lecture/commentaire)
  return false;
};

// Met à jour les statistiques de la collection
collectionSchema.methods.updateStats = async function () {
  // On met à jour les stats globales de la collection sans dépendre d'un utilisateur
  const Feed = mongoose.model('Feed');
  const Article = mongoose.model('Article');

  // Récupère les flux de la collection
  const feeds = await Feed.find({ _id: { $in: this.feeds } });

  // Compte tous les articles de ces flux
  const totalArticles = await Article.countDocuments({ feed: { $in: this.feeds } });

  // Compte les articles non lus (aucun utilisateur dans readBy)
  const unreadArticles = await Article.countDocuments({
    feed: { $in: this.feeds },
    $or: [
      { readBy: { $exists: false } },
      { readBy: { $size: 0 } }
    ]
  });

  // Met à jour les stats
  this.stats.totalFeeds = feeds.length;
  this.stats.activeFeeds = feeds.filter(f => f.isActive).length;
  this.stats.totalArticles = totalArticles;
  this.stats.unreadArticles = unreadArticles;
  this.stats.lastUpdated = new Date();

  return this.save();
};

// Met à jour lastActivity à chaque sauvegarde
collectionSchema.pre('save', function (next) {
  if (this.isModified()) {
    this.lastActivity = new Date();
  }
  next();
});

// Retourne toutes les collections visibles pour un utilisateur
collectionSchema.statics.findUserCollections = async function (userId) {
  return this.find({
    $or: [
      { owner: userId },
      { 'members.user': userId }
    ],
    isActive: true,
    isArchived: false
  }).populate('feeds', 'name url');
};

// Création du modèle
const Collection = mongoose.model('Collection', collectionSchema);

module.exports = Collection;
