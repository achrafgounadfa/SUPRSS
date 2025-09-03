// Auteur : Gounadfa Achraf - SUPRSS Project
// Modèle Mongoose pour les flux RSS

const mongoose = require('mongoose');

// Schéma pour les flux RSS
const feedSchema = new mongoose.Schema({
  // Nom du flux
  name: {
    type: String,
    required: [true, 'Le nom du flux est requis'],
    trim: true,
    maxlength: [200, 'Le nom ne peut pas dépasser 200 caractères']
  },
  
  // URL du flux RSS
  url: {
    type: String,
    required: [true, 'L\'URL du flux RSS est requise'],
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/i.test(v);
      },
      message: 'URL invalide'
    }
  },
  
  // Description du flux
  description: {
    type: String,
    maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères'],
    default: ''
  },
  
  // Site web source
  websiteUrl: {
    type: String,
    trim: true
  },
  
  // Créateur du flux (qui l'a ajouté)
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Collections contenant ce flux
  collections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection'
  }],
  
  // Catégories/Tags du flux
  categories: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Tags personnalisés ajoutés par les utilisateurs
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Langue du flux
  language: {
    type: String,
    default: 'fr',
    enum: ['fr', 'en', 'es', 'de', 'it', 'pt', 'other']
  },
  
  // Type de contenu principal
  contentType: {
    type: String,
    enum: ['news', 'blog', 'podcast', 'video', 'mixed', 'other'],
    default: 'mixed'
  },
  
  // Fréquence de mise à jour (en minutes)
  updateFrequency: {
    type: Number,
    default: 60, // 1 heure par défaut
    min: 5,
    max: 1440 // Maximum 24 heures
  },
  
  // Dernière mise à jour réussie
  lastFetchedAt: {
    type: Date,
    default: null
  },
  
  // Prochaine mise à jour prévue
  nextFetchAt: {
    type: Date,
    default: Date.now
  },
  
  // Statut du flux
  status: {
    type: String,
    enum: ['active', 'inactive', 'error', 'pending'],
    default: 'pending'
  },
  
  // Statut actif/inactif (peut être désactivé manuellement)
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Informations d'erreur
  lastError: {
    message: String,
    date: Date,
    attempts: {
      type: Number,
      default: 0
    }
  },
  
  // Métadonnées du flux RSS
  metadata: {
    title: String,
    description: String,
    author: String,
    copyright: String,
    imageUrl: String,
    lastBuildDate: Date,
    pubDate: Date,
    generator: String,
    ttl: Number // Time to live en minutes
  },
  
  // Statistiques du flux
  stats: {
    totalArticles: {
      type: Number,
      default: 0
    },
    fetchCount: {
      type: Number,
      default: 0
    },
    errorCount: {
      type: Number,
      default: 0
    },
    averageArticlesPerFetch: {
      type: Number,
      default: 0
    },
    lastArticleDate: Date,
    subscribers: {
      type: Number,
      default: 1
    }
  },
  
  // Configuration du parsing
  parseConfig: {
    // Sélecteurs CSS personnalisés pour extraire le contenu
    contentSelector: String,
    // Supprimer certains éléments du contenu
    removeSelectors: [String],
    // Limite du nombre d'articles à conserver
    maxArticles: {
      type: Number,
      default: 100,
      min: 10,
      max: 1000
    },
    // Conserver les articles pendant X jours
    articleRetentionDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365
    }
  },
  
  // Headers personnalisés pour la requête HTTP
  customHeaders: {
    type: Map,
    of: String
  },
  
  // Authentification si nécessaire
  authentication: {
    type: {
      type: String,
      enum: ['none', 'basic', 'bearer', 'apikey'],
      default: 'none'
    },
    username: String,
    password: String,
    token: String,
    apiKey: String
  },
  
  // Filtre de contenu
  filters: {
    // Mots-clés à inclure
    includeKeywords: [String],
    // Mots-clés à exclure
    excludeKeywords: [String],
    // Auteurs à inclure
    includeAuthors: [String],
    // Auteurs à exclure
    excludeAuthors: [String]
  },
  
  // Note/évaluation du flux par les utilisateurs
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  
  // Favoris des utilisateurs
  favoritedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Feed vérifié/certifié
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Feed premium/payant
  isPremium: {
    type: Boolean,
    default: false
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
feedSchema.index({ url: 1 });
feedSchema.index({ addedBy: 1 });
feedSchema.index({ collections: 1 });
feedSchema.index({ status: 1, isActive: 1 });
feedSchema.index({ nextFetchAt: 1 });
feedSchema.index({ categories: 1 });
feedSchema.index({ tags: 1 });

// Virtual pour savoir si le flux doit être mis à jour
feedSchema.virtual('needsUpdate').get(function() {
  if (!this.isActive || this.status === 'error') {
    return false;
  }
  return this.nextFetchAt <= new Date();
});

// Méthode pour marquer le flux comme récupéré avec succès
feedSchema.methods.markAsFetched = function(articlesCount = 0) {
  this.lastFetchedAt = new Date();
  this.nextFetchAt = new Date(Date.now() + this.updateFrequency * 60000);
  this.status = 'active';
  this.stats.fetchCount++;
  
  if (articlesCount > 0) {
    this.stats.totalArticles += articlesCount;
    this.stats.averageArticlesPerFetch = 
      (this.stats.averageArticlesPerFetch * (this.stats.fetchCount - 1) + articlesCount) / 
      this.stats.fetchCount;
  }
  
  // Réinitialiser les erreurs
  this.lastError = undefined;
  
  return this.save();
};

// Méthode pour marquer le flux en erreur
feedSchema.methods.markAsError = function(errorMessage) {
  this.status = 'error';
  this.lastError = {
    message: errorMessage,
    date: new Date(),
    attempts: (this.lastError?.attempts || 0) + 1
  };
  
  this.stats.errorCount++;
  
  // Augmenter le délai avant la prochaine tentative (backoff exponentiel)
  const backoffMinutes = Math.min(
    this.updateFrequency * Math.pow(2, this.lastError.attempts),
    1440 // Maximum 24 heures
  );
  this.nextFetchAt = new Date(Date.now() + backoffMinutes * 60000);
  
  // Désactiver après 5 tentatives échouées
  if (this.lastError.attempts >= 5) {
    this.isActive = false;
  }
  
  return this.save();
};

// Méthode pour réinitialiser les erreurs
feedSchema.methods.resetErrors = function() {
  this.status = 'active';
  this.lastError = undefined;
  this.nextFetchAt = new Date();
  return this.save();
};

// Méthode pour ajouter une note
feedSchema.methods.addRating = function(rating) {
  const newCount = this.rating.count + 1;
  const newAverage = 
    (this.rating.average * this.rating.count + rating) / newCount;
  
  this.rating = {
    average: newAverage,
    count: newCount
  };
  
  return this.save();
};

// Méthode pour vérifier si un utilisateur a accès au flux
feedSchema.methods.userHasAccess = async function(userId) {
  // Si le flux est premium, vérifier les autorisations
  if (this.isPremium) {
    // Logique pour vérifier l'accès premium
    return false; // Pour l'instant, pas d'accès premium
  }
  
  // Vérifier si l'utilisateur fait partie d'une collection contenant ce flux
  const Collection = mongoose.model('Collection');
  const collections = await Collection.find({
    _id: { $in: this.collections },
    $or: [
      { owner: userId },
      { 'members.user': userId }
    ]
  });
  
  return collections.length > 0;
};

// Méthode statique pour trouver les flux à mettre à jour
feedSchema.statics.findFeedsToUpdate = async function() {
  return this.find({
    isActive: true,
    status: { $ne: 'error' },
    nextFetchAt: { $lte: new Date() }
  }).limit(10); // Limiter à 10 flux à la fois
};

// Méthode statique pour obtenir les flux populaires
feedSchema.statics.getPopularFeeds = async function(limit = 10) {
  return this.find({
    isActive: true,
    isVerified: true
  })
  .sort({ 'stats.subscribers': -1, 'rating.average': -1 })
  .limit(limit);
};

// Middleware pour mettre à jour les collections
feedSchema.pre('remove', async function(next) {
  // Retirer ce flux de toutes les collections
  const Collection = mongoose.model('Collection');
  await Collection.updateMany(
    { feeds: this._id },
    { $pull: { feeds: this._id } }
  );
  
  // Supprimer tous les articles de ce flux
  const Article = mongoose.model('Article');
  await Article.deleteMany({ feed: this._id });
  
  next();
});

const Feed = mongoose.model('Feed', feedSchema);

module.exports = Feed;