// Auteur : Gounadfa Achraf - SUPRSS Project
// Modèle Mongoose pour les articles RSS

const mongoose = require('mongoose');

// Schéma pour les articles récupérés des flux RSS
const articleSchema = new mongoose.Schema({
  // Titre de l'article
  title: {
    type: String,
    required: [true, 'Le titre de l\'article est requis'],
    trim: true,
    maxlength: [500, 'Le titre ne peut pas dépasser 500 caractères']
  },
  
  // Lien vers l'article original
  link: {
    type: String,
    required: [true, 'Le lien de l\'article est requis'],
    unique: true,
    trim: true
  },
  
  // GUID unique de l'article (depuis le RSS)
  guid: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Flux RSS source
  feed: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feed',
    required: [true, 'Le flux source est requis']
  },
  
  // Collections contenant cet article
  collections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection'
  }],
  
  // Auteur de l'article
  author: {
    type: String,
    trim: true,
    default: 'Inconnu'
  },
  
  // Contenu de l'article
  content: {
    type: String,
    default: ''
  },
  
  // Résumé/Extrait de l'article
  summary: {
    type: String,
    maxlength: [1000, 'Le résumé ne peut pas dépasser 1000 caractères'],
    default: ''
  },
  
  // Contenu HTML complet
  contentHtml: {
    type: String,
    default: ''
  },
  
  // Contenu en texte brut (sans HTML)
  contentText: {
    type: String,
    default: ''
  },
  
  // Date de publication originale
  publishedAt: {
    type: Date,
    default: Date.now
  },
  
  // Date de dernière modification
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Catégories de l'article (depuis le RSS)
  categories: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Tags ajoutés par les utilisateurs
  tags: [{
    tag: {
      type: String,
      trim: true,
      lowercase: true
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Image principale de l'article
  imageUrl: {
    type: String,
    trim: true
  },
  
  // Autres médias attachés
  media: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    title: String,
    description: String,
    mimeType: String,
    size: Number
  }],
  
  // Statuts de lecture par utilisateur
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    },
    readingTime: Number // Temps de lecture en secondes
  }],
  
  // Favoris des utilisateurs
  favoritedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    favoritedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Commentaires sur l'article
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  
  // Statistiques de l'article
  stats: {
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    readingTime: {
      type: Number, // Temps de lecture estimé en minutes
      default: 0
    },
    commentsCount: {
      type: Number,
      default: 0
    }
  },
  
  // Analyse du sentiment (si analysé)
  sentiment: {
    score: {
      type: Number,
      min: -1,
      max: 1
    },
    label: {
      type: String,
      enum: ['positive', 'negative', 'neutral', 'mixed']
    }
  },
  
  // Mots-clés extraits automatiquement
  keywords: [{
    word: String,
    weight: Number
  }],
  
  // Langue de l'article
  language: {
    type: String,
    default: 'fr'
  },
  
  // Article épinglé/important
  isPinned: {
    type: Boolean,
    default: false
  },
  
  // Article archivé
  isArchived: {
    type: Boolean,
    default: false
  },
  
  // Hash du contenu pour éviter les doublons
  contentHash: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Score de qualité/pertinence
  qualityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  
  // Métadonnées Open Graph
  openGraph: {
    title: String,
    description: String,
    image: String,
    type: String,
    siteName: String
  },
  
  // Source originale (si l'article est un repost)
  originalSource: {
    url: String,
    title: String,
    author: String
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
articleSchema.index({ link: 1 });
articleSchema.index({ guid: 1 });
articleSchema.index({ feed: 1, publishedAt: -1 });
articleSchema.index({ collections: 1 });
articleSchema.index({ 'readBy.user': 1 });
articleSchema.index({ 'favoritedBy.user': 1 });
articleSchema.index({ publishedAt: -1 });
articleSchema.index({ contentHash: 1 });
articleSchema.index({ categories: 1 });
articleSchema.index({ 'tags.tag': 1 });

// Virtual pour savoir si l'article est lu par un utilisateur
articleSchema.methods.isReadByUser = function(userId) {
  return this.readBy.some(read => 
    read.user.toString() === userId.toString()
  );
};

// Virtual pour savoir si l'article est en favoris pour un utilisateur
articleSchema.methods.isFavoritedByUser = function(userId) {
  return this.favoritedBy.some(fav => 
    fav.user.toString() === userId.toString()
  );
};

// Méthode pour marquer comme lu
articleSchema.methods.markAsRead = async function(userId, readingTime = 0) {
  // Vérifier si déjà lu
  if (!this.isReadByUser(userId)) {
    this.readBy.push({
      user: userId,
      readAt: new Date(),
      readingTime
    });
    
    // Incrémenter les vues
    this.stats.views++;
    
    await this.save();
    
    // Mettre à jour les stats de la collection
    const Collection = mongoose.model('Collection');
    await Collection.updateMany(
      { _id: { $in: this.collections } },
      { $inc: { 'stats.unreadArticles': -1 } }
    );
  }
  
  return this;
};

// Méthode pour marquer comme non lu
articleSchema.methods.markAsUnread = async function(userId) {
  const wasRead = this.isReadByUser(userId);
  
  this.readBy = this.readBy.filter(read => 
    read.user.toString() !== userId.toString()
  );
  
  if (wasRead) {
    await this.save();
    
    // Mettre à jour les stats de la collection
    const Collection = mongoose.model('Collection');
    await Collection.updateMany(
      { _id: { $in: this.collections } },
      { $inc: { 'stats.unreadArticles': 1 } }
    );
  }
  
  return this;
};

// Méthode pour ajouter aux favoris
articleSchema.methods.addToFavorites = async function(userId) {
  if (!this.isFavoritedByUser(userId)) {
    this.favoritedBy.push({
      user: userId,
      favoritedAt: new Date()
    });
    await this.save();
  }
  return this;
};

// Méthode pour retirer des favoris
articleSchema.methods.removeFromFavorites = async function(userId) {
  this.favoritedBy = this.favoritedBy.filter(fav => 
    fav.user.toString() !== userId.toString()
  );
  await this.save();
  return this;
};

// Méthode pour ajouter un tag
articleSchema.methods.addTag = async function(tag, userId) {
  // Vérifier si le tag existe déjà
  const existingTag = this.tags.find(t => t.tag === tag.toLowerCase());
  
  if (!existingTag) {
    this.tags.push({
      tag: tag.toLowerCase(),
      addedBy: userId,
      addedAt: new Date()
    });
    await this.save();
  }
  
  return this;
};

// Méthode pour calculer le temps de lecture estimé
articleSchema.methods.calculateReadingTime = function() {
  const wordsPerMinute = 200; // Moyenne de lecture
  const text = this.contentText || this.content || this.summary || '';
  const wordCount = text.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);
  
  this.stats.readingTime = readingTime;
  return readingTime;
};

// Méthode pour générer un hash du contenu
articleSchema.methods.generateContentHash = function() {
  const crypto = require('crypto');
  const content = `${this.title}${this.content}${this.link}`;
  this.contentHash = crypto
    .createHash('sha256')
    .update(content)
    .digest('hex');
  return this.contentHash;
};

// Méthode statique pour trouver les articles d'une collection
articleSchema.statics.findByCollection = async function(collectionId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    sort = '-publishedAt',
    filters = {}
  } = options;
  
  let query = { collections: collectionId };
  
  // Appliquer les filtres
  if (filters.isRead !== undefined) {
    if (filters.isRead && filters.userId) {
      query['readBy.user'] = filters.userId;
    } else if (!filters.isRead && filters.userId) {
      query['readBy.user'] = { $ne: filters.userId };
    }
  }
  
  if (filters.isFavorite && filters.userId) {
    query['favoritedBy.user'] = filters.userId;
  }
  
  if (filters.categories && filters.categories.length > 0) {
    query.categories = { $in: filters.categories };
  }
  
  if (filters.tags && filters.tags.length > 0) {
    query['tags.tag'] = { $in: filters.tags };
  }
  
  if (filters.feed) {
    query.feed = filters.feed;
  }
  
  if (filters.searchText) {
    query.$text = { $search: filters.searchText };
  }
  
  if (filters.dateFrom || filters.dateTo) {
    query.publishedAt = {};
    if (filters.dateFrom) {
      query.publishedAt.$gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      query.publishedAt.$lte = new Date(filters.dateTo);
    }
  }
  
  return this.find(query)
    .populate('feed', 'name url icon')
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Méthode statique pour obtenir les articles favoris d'un utilisateur
articleSchema.statics.getUserFavorites = async function(userId, limit = 50) {
  return this.find({ 'favoritedBy.user': userId })
    .populate('feed', 'name url')
    .sort('-favoritedBy.favoritedAt')
    .limit(limit);
};

// Middleware pour calculer le temps de lecture avant sauvegarde
articleSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('content') || this.isModified('contentText')) {
    this.calculateReadingTime();
  }
  
  if (this.isNew) {
    this.generateContentHash();
  }
  
  next();
});

// Middleware pour nettoyer après suppression
articleSchema.pre('remove', async function(next) {
  // Supprimer les commentaires associés
  const Comment = mongoose.model('Comment');
  await Comment.deleteMany({ article: this._id });
  
  // Mettre à jour les stats des collections
  const Collection = mongoose.model('Collection');
  await Collection.updateMany(
    { _id: { $in: this.collections } },
    { $inc: { 'stats.totalArticles': -1 } }
  );
  
  next();
});

const Article = mongoose.model('Article', articleSchema);

module.exports = Article;