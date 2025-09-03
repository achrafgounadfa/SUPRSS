// Auteur : Gounadfa Achraf - SUPRSS Project
// Modèle Mongoose pour les commentaires d'articles

const mongoose = require('mongoose');

// Schéma pour les commentaires sur les articles
const commentSchema = new mongoose.Schema({
  // Article commenté
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: [true, 'L\'article est requis']
  },
  
  // Collection dans laquelle le commentaire est fait
  collection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection',
    required: [true, 'La collection est requise']
  },
  
  // Auteur du commentaire
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'auteur est requis']
  },
  
  // Contenu du commentaire
  content: {
    type: String,
    required: [true, 'Le contenu du commentaire est requis'],
    trim: true,
    maxlength: [2000, 'Le commentaire ne peut pas dépasser 2000 caractères']
  },
  
  // Commentaire parent (pour les réponses)
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  
  // Réponses à ce commentaire
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  
  // Mentions d'utilisateurs
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Réactions/Likes
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    type: {
      type: String,
      enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry'],
      default: 'like'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Statut du commentaire
  status: {
    type: String,
    enum: ['visible', 'hidden', 'deleted', 'moderated'],
    default: 'visible'
  },
  
  // Commentaire édité
  isEdited: {
    type: Boolean,
    default: false
  },
  
  // Historique des modifications
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Statistiques
  stats: {
    likesCount: {
      type: Number,
      default: 0
    },
    repliesCount: {
      type: Number,
      default: 0
    }
  },
  
  // Signalements
  reports: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      enum: ['spam', 'offensive', 'misleading', 'other'],
      required: true
    },
    description: String,
    reportedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Modération
  moderation: {
    isModerated: {
      type: Boolean,
      default: false
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    moderatedAt: Date,
    reason: String
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
commentSchema.index({ article: 1, createdAt: -1 });
commentSchema.index({ collection: 1 });
commentSchema.index({ author: 1 });
commentSchema.index({ parentComment: 1 });
commentSchema.index({ status: 1 });

// Virtual pour vérifier si un utilisateur a réagi
commentSchema.methods.hasUserReacted = function(userId) {
  return this.reactions.some(reaction => 
    reaction.user.toString() === userId.toString()
  );
};

// Méthode pour ajouter une réaction
commentSchema.methods.addReaction = async function(userId, type = 'like') {
  // Retirer une réaction existante si elle existe
  this.reactions = this.reactions.filter(reaction => 
    reaction.user.toString() !== userId.toString()
  );
  
  // Ajouter la nouvelle réaction
  this.reactions.push({
    user: userId,
    type,
    createdAt: new Date()
  });
  
  // Mettre à jour les stats
  this.stats.likesCount = this.reactions.length;
  
  return this.save();
};

// Méthode pour retirer une réaction
commentSchema.methods.removeReaction = async function(userId) {
  this.reactions = this.reactions.filter(reaction => 
    reaction.user.toString() !== userId.toString()
  );
  
  this.stats.likesCount = this.reactions.length;
  
  return this.save();
};

// Méthode pour éditer le commentaire
commentSchema.methods.edit = async function(newContent) {
  // Sauvegarder l'ancien contenu dans l'historique
  this.editHistory.push({
    content: this.content,
    editedAt: new Date()
  });
  
  this.content = newContent;
  this.isEdited = true;
  
  return this.save();
};

// Méthode pour signaler le commentaire
commentSchema.methods.report = async function(userId, reason, description) {
  // Vérifier si l'utilisateur a déjà signalé
  const existingReport = this.reports.find(report => 
    report.user.toString() === userId.toString()
  );
  
  if (!existingReport) {
    this.reports.push({
      user: userId,
      reason,
      description,
      reportedAt: new Date()
    });
    
    // Auto-modération si trop de signalements
    if (this.reports.length >= 3) {
      this.status = 'moderated';
      this.moderation.isModerated = true;
      this.moderation.moderatedAt = new Date();
      this.moderation.reason = 'Auto-modéré suite à plusieurs signalements';
    }
    
    await this.save();
  }
  
  return this;
};

// Méthode statique pour obtenir les commentaires d'un article
commentSchema.statics.getArticleComments = async function(articleId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    sort = '-createdAt'
  } = options;
  
  return this.find({
    article: articleId,
    parentComment: null, // Seulement les commentaires de premier niveau
    status: 'visible'
  })
  .populate('author', 'name avatar')
  .populate({
    path: 'replies',
    populate: {
      path: 'author',
      select: 'name avatar'
    }
  })
  .sort(sort)
  .skip(skip)
  .limit(limit);
};

// Middleware pour mettre à jour les compteurs
commentSchema.post('save', async function(doc) {
  // Mettre à jour le nombre de commentaires de l'article
  const Article = mongoose.model('Article');
  const count = await mongoose.model('Comment').countDocuments({
    article: doc.article,
    status: 'visible'
  });
  
  await Article.findByIdAndUpdate(doc.article, {
    'stats.commentsCount': count
  });
  
  // Si c'est une réponse, mettre à jour le compteur du parent
  if (doc.parentComment) {
    const parentCount = await mongoose.model('Comment').countDocuments({
      parentComment: doc.parentComment,
      status: 'visible'
    });
    
    await mongoose.model('Comment').findByIdAndUpdate(doc.parentComment, {
      'stats.repliesCount': parentCount
    });
  }
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;