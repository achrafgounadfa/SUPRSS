// Auteur : Gounadfa Achraf - SUPRSS Project
// Modèle Mongoose pour la messagerie instantanée dans les collections

const mongoose = require('mongoose');

// Schéma pour les messages du chat dans les collections
const messageSchema = new mongoose.Schema({
  // Collection dans laquelle le message est envoyé
  collection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection',
    required: [true, 'La collection est requise']
  },
  
  // Expéditeur du message
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'expéditeur est requis']
  },
  
  // Type de message
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'link', 'article_share', 'system'],
    default: 'text'
  },
  
  // Contenu du message
  content: {
    type: String,
    required: function() {
      return this.type === 'text';
    },
    maxlength: [1000, 'Le message ne peut pas dépasser 1000 caractères']
  },
  
  // Pièces jointes
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'file', 'link'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    name: String,
    size: Number,
    mimeType: String,
    thumbnail: String
  }],
  
  // Article partagé (si type === 'article_share')
  sharedArticle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article'
  },
  
  // Mentions d'utilisateurs
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Message auquel on répond
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  
  // Statut du message
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'deleted'],
    default: 'sent'
  },
  
  // Utilisateurs qui ont lu le message
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message édité
  isEdited: {
    type: Boolean,
    default: false
  },
  
  // Date de dernière édition
  editedAt: Date,
  
  // Historique des éditions
  editHistory: [{
    content: String,
    editedAt: Date
  }],
  
  // Réactions/Emojis
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message épinglé
  isPinned: {
    type: Boolean,
    default: false
  },
  
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  pinnedAt: Date,
  
  // Message supprimé
  isDeleted: {
    type: Boolean,
    default: false
  },
  
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  deletedAt: Date,
  
  // Message système (notifications automatiques)
  systemInfo: {
    type: {
      type: String,
      enum: ['user_joined', 'user_left', 'collection_updated', 'feed_added', 'feed_removed']
    },
    data: mongoose.Schema.Types.Mixed
  },
  
  // Métadonnées pour les liens
  linkPreview: {
    url: String,
    title: String,
    description: String,
    image: String,
    siteName: String
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
messageSchema.index({ collection: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ status: 1 });
messageSchema.index({ isPinned: 1 });

// Virtual pour vérifier si un utilisateur a lu le message
messageSchema.methods.isReadByUser = function(userId) {
  return this.readBy.some(read => 
    read.user.toString() === userId.toString()
  );
};

// Méthode pour marquer comme lu
messageSchema.methods.markAsRead = async function(userId) {
  if (!this.isReadByUser(userId)) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    
    // Si tous les membres ont lu, marquer comme 'read'
    const Collection = mongoose.model('Collection');
    const collection = await Collection.findById(this.collection);
    const totalMembers = collection.members.length + 1; // +1 pour le créateur
    
    if (this.readBy.length >= totalMembers - 1) { // -1 car l'expéditeur n'a pas besoin de lire
      this.status = 'read';
    } else if (this.status === 'sent') {
      this.status = 'delivered';
    }
    
    await this.save();
  }
  
  return this;
};

// Méthode pour ajouter une réaction
messageSchema.methods.addReaction = async function(userId, emoji) {
  // Retirer une réaction existante de cet utilisateur
  this.reactions = this.reactions.filter(reaction => 
    reaction.user.toString() !== userId.toString()
  );
  
  // Ajouter la nouvelle réaction
  this.reactions.push({
    user: userId,
    emoji,
    createdAt: new Date()
  });
  
  return this.save();
};

// Méthode pour retirer une réaction
messageSchema.methods.removeReaction = async function(userId) {
  this.reactions = this.reactions.filter(reaction => 
    reaction.user.toString() !== userId.toString()
  );
  
  return this.save();
};

// Méthode pour éditer le message
messageSchema.methods.edit = async function(newContent) {
  // Sauvegarder l'ancien contenu
  this.editHistory.push({
    content: this.content,
    editedAt: this.editedAt || this.createdAt
  });
  
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  
  return this.save();
};

// Méthode pour supprimer le message (soft delete)
messageSchema.methods.softDelete = async function(userId) {
  this.isDeleted = true;
  this.deletedBy = userId;
  this.deletedAt = new Date();
  this.content = 'Message supprimé';
  
  return this.save();
};

// Méthode pour épingler/désépingler
messageSchema.methods.togglePin = async function(userId) {
  if (this.isPinned) {
    this.isPinned = false;
    this.pinnedBy = undefined;
    this.pinnedAt = undefined;
  } else {
    this.isPinned = true;
    this.pinnedBy = userId;
    this.pinnedAt = new Date();
  }
  
  return this.save();
};

// Méthode statique pour obtenir les messages d'une collection
messageSchema.statics.getCollectionMessages = async function(collectionId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    before = null,
    after = null
  } = options;
  
  let query = {
    collection: collectionId,
    isDeleted: false
  };
  
  // Pagination basée sur la date
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  } else if (after) {
    query.createdAt = { $gt: new Date(after) };
  }
  
  return this.find(query)
    .populate('sender', 'name avatar')
    .populate('mentions', 'name')
    .populate('replyTo', 'content sender')
    .populate('sharedArticle', 'title link imageUrl')
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);
};

// Méthode statique pour obtenir les messages épinglés
messageSchema.statics.getPinnedMessages = async function(collectionId) {
  return this.find({
    collection: collectionId,
    isPinned: true,
    isDeleted: false
  })
  .populate('sender', 'name avatar')
  .populate('pinnedBy', 'name')
  .sort('-pinnedAt');
};

// Méthode statique pour créer un message système
messageSchema.statics.createSystemMessage = async function(collectionId, type, data) {
  const systemMessages = {
    user_joined: (data) => `${data.userName} a rejoint la collection`,
    user_left: (data) => `${data.userName} a quitté la collection`,
    collection_updated: (data) => `La collection a été mise à jour: ${data.changes}`,
    feed_added: (data) => `Nouveau flux ajouté: ${data.feedName}`,
    feed_removed: (data) => `Flux supprimé: ${data.feedName}`
  };
  
  return this.create({
    collection: collectionId,
    sender: data.userId || null,
    type: 'system',
    content: systemMessages[type](data),
    systemInfo: {
      type,
      data
    }
  });
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;