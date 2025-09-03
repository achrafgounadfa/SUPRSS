// Auteur : Gounadfa Achraf - SUPRSS Project
// Contrôleur pour la messagerie instantanée dans les collections

const Message = require('../models/Message.model');
const Collection = require('../models/Collection.model');
const Article = require('../models/Article.model');
const { asyncHandler, AppError } = require('../middlewares/errorHandler');
const axios = require('axios');

// Récupérer les messages d'une collection
// Cette fonction retourne l'historique des messages avec pagination
const getMessages = asyncHandler(async (req, res, next) => {
  const { collectionId } = req.params;
  const { limit = 50, before, after } = req.query;
  
  // Vérifier l'accès à la collection
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Vous devez être membre de la collection', 403));
  }
  
  // Récupérer les messages
  const messages = await Message.getCollectionMessages(collectionId, {
    limit: parseInt(limit),
    before,
    after
  });
  
  // Marquer les messages comme lus
  const unreadMessages = messages.filter(msg => 
    !msg.isReadByUser(req.user._id) && 
    msg.sender.toString() !== req.user._id.toString()
  );
  
  for (const msg of unreadMessages) {
    await msg.markAsRead(req.user._id);
  }
  
  res.status(200).json({
    success: true,
    count: messages.length,
    data: messages.reverse() // Inverser pour avoir l'ordre chronologique
  });
});

// Envoyer un message
// Cette fonction crée un nouveau message dans une collection
const sendMessage = asyncHandler(async (req, res, next) => {
  const { collectionId } = req.params;
  const { 
    content, 
    type = 'text', 
    attachments, 
    mentions, 
    replyTo,
    sharedArticleId 
  } = req.body;
  
  // Validation
  if (!content && type === 'text') {
    return next(new AppError('Le contenu du message est requis', 400));
  }
  
  // Vérifier l'accès et les permissions
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Vous devez être membre de la collection', 403));
  }
  
  if (!collection.userHasPermission(req.user._id, 'canChat')) {
    return next(new AppError('Permissions insuffisantes pour envoyer des messages', 403));
  }
  
  // Préparer les données du message
  const messageData = {
    collection: collectionId,
    sender: req.user._id,
    type,
    content,
    attachments: attachments || [],
    mentions: mentions || [],
    replyTo: replyTo || null
  };
  
  // Si c'est un partage d'article
  if (type === 'article_share' && sharedArticleId) {
    const article = await Article.findById(sharedArticleId);
    if (article) {
      messageData.sharedArticle = sharedArticleId;
      messageData.content = content || `A partagé l'article : ${article.title}`;
    }
  }
  
  // Si c'est un lien, extraire les métadonnées
  if (type === 'link' || (type === 'text' && isURL(content))) {
    const linkPreview = await extractLinkPreview(content);
    if (linkPreview) {
      messageData.linkPreview = linkPreview;
      if (type === 'text') {
        messageData.type = 'link';
      }
    }
  }
  
  // Créer le message
  const message = await Message.create(messageData);
  
  // Populer les références
  await message.populate([
    { path: 'sender', select: 'name avatar' },
    { path: 'mentions', select: 'name' },
    { path: 'replyTo', select: 'content sender' },
    { path: 'sharedArticle', select: 'title link imageUrl' }
  ]);
  
  // Émettre le message via Socket.io (sera configuré dans socket.js)
  const io = req.app.get('io');
  if (io) {
    io.to(`collection_${collectionId}`).emit('new_message', message);
    
    // Notifier les utilisateurs mentionnés
    if (mentions && mentions.length > 0) {
      mentions.forEach(userId => {
        io.to(`user_${userId}`).emit('mention', {
          message,
          collection: collection.name
        });
      });
    }
  }
  
  res.status(201).json({
    success: true,
    data: message
  });
});

// Éditer un message
// Cette fonction permet de modifier un message envoyé
const editMessage = asyncHandler(async (req, res, next) => {
  const { messageId } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return next(new AppError('Le nouveau contenu est requis', 400));
  }
  
  const message = await Message.findById(messageId);
  
  if (!message) {
    return next(new AppError('Message non trouvé', 404));
  }
  
  // Vérifier que l'utilisateur est l'expéditeur
  if (message.sender.toString() !== req.user._id.toString()) {
    return next(new AppError('Vous ne pouvez éditer que vos propres messages', 403));
  }
  
  // Vérifier que le message n'est pas trop ancien (24h)
  const messageAge = Date.now() - message.createdAt.getTime();
  const maxEditTime = 24 * 60 * 60 * 1000; // 24 heures
  
  if (messageAge > maxEditTime) {
    return next(new AppError('Le message est trop ancien pour être édité', 400));
  }
  
  // Éditer le message
  await message.edit(content);
  
  // Émettre la modification
  const io = req.app.get('io');
  if (io) {
    io.to(`collection_${message.collection}`).emit('message_edited', {
      messageId: message._id,
      newContent: content
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Message édité',
    data: message
  });
});

// Supprimer un message
// Cette fonction supprime un message (soft delete)
const deleteMessage = asyncHandler(async (req, res, next) => {
  const { messageId } = req.params;
  
  const message = await Message.findById(messageId);
  
  if (!message) {
    return next(new AppError('Message non trouvé', 404));
  }
  
  // Vérifier les permissions
  const collection = await Collection.findById(message.collection);
  const isOwner = message.sender.toString() === req.user._id.toString();
  const isCollectionOwner = collection.owner.toString() === req.user._id.toString();
  
  if (!isOwner && !isCollectionOwner) {
    return next(new AppError('Permissions insuffisantes pour supprimer ce message', 403));
  }
  
  // Supprimer le message
  await message.softDelete(req.user._id);
  
  // Émettre la suppression
  const io = req.app.get('io');
  if (io) {
    io.to(`collection_${message.collection}`).emit('message_deleted', {
      messageId: message._id
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Message supprimé'
  });
});

// Ajouter une réaction à un message
// Cette fonction permet d'ajouter des emojis comme réaction
const addReaction = asyncHandler(async (req, res, next) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  
  if (!emoji) {
    return next(new AppError('Emoji requis', 400));
  }
  
  const message = await Message.findById(messageId);
  
  if (!message) {
    return next(new AppError('Message non trouvé', 404));
  }
  
  // Vérifier l'accès à la collection
  const collection = await Collection.findById(message.collection);
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Ajouter la réaction
  await message.addReaction(req.user._id, emoji);
  
  // Émettre la réaction
  const io = req.app.get('io');
  if (io) {
    io.to(`collection_${message.collection}`).emit('reaction_added', {
      messageId: message._id,
      userId: req.user._id,
      emoji
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Réaction ajoutée'
  });
});

// Retirer une réaction
// Cette fonction retire une réaction d'un message
const removeReaction = asyncHandler(async (req, res, next) => {
  const { messageId } = req.params;
  
  const message = await Message.findById(messageId);
  
  if (!message) {
    return next(new AppError('Message non trouvé', 404));
  }
  
  // Retirer la réaction
  await message.removeReaction(req.user._id);
  
  // Émettre le retrait
  const io = req.app.get('io');
  if (io) {
    io.to(`collection_${message.collection}`).emit('reaction_removed', {
      messageId: message._id,
      userId: req.user._id
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Réaction retirée'
  });
});

// Épingler/Désépingler un message
// Cette fonction permet de mettre en avant des messages importants
const togglePin = asyncHandler(async (req, res, next) => {
  const { messageId } = req.params;
  
  const message = await Message.findById(messageId);
  
  if (!message) {
    return next(new AppError('Message non trouvé', 404));
  }
  
  // Vérifier les permissions
  const collection = await Collection.findById(message.collection);
  if (collection.owner.toString() !== req.user._id.toString() &&
      !collection.userHasPermission(req.user._id, 'canEditSettings')) {
    return next(new AppError('Permissions insuffisantes', 403));
  }
  
  // Épingler/Désépingler
  await message.togglePin(req.user._id);
  
  // Émettre le changement
  const io = req.app.get('io');
  if (io) {
    io.to(`collection_${message.collection}`).emit('message_pinned', {
      messageId: message._id,
      isPinned: message.isPinned
    });
  }
  
  res.status(200).json({
    success: true,
    message: message.isPinned ? 'Message épinglé' : 'Message désépinglé',
    data: message
  });
});

// Récupérer les messages épinglés
// Cette fonction retourne tous les messages épinglés d'une collection
const getPinnedMessages = asyncHandler(async (req, res, next) => {
  const { collectionId } = req.params;
  
  // Vérifier l'accès
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  const messages = await Message.getPinnedMessages(collectionId);
  
  res.status(200).json({
    success: true,
    count: messages.length,
    data: messages
  });
});

// Marquer les messages comme lus
// Cette fonction marque tous les messages non lus d'une collection comme lus
const markAllAsRead = asyncHandler(async (req, res, next) => {
  const { collectionId } = req.params;
  
  // Vérifier l'accès
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Récupérer tous les messages non lus
  const unreadMessages = await Message.find({
    collection: collectionId,
    sender: { $ne: req.user._id },
    'readBy.user': { $ne: req.user._id },
    isDeleted: false
  });
  
  // Marquer comme lus
  for (const msg of unreadMessages) {
    await msg.markAsRead(req.user._id);
  }
  
  res.status(200).json({
    success: true,
    message: `${unreadMessages.length} messages marqués comme lus`
  });
});

// Rechercher dans les messages
// Cette fonction permet de rechercher dans l'historique des messages
const searchMessages = asyncHandler(async (req, res, next) => {
  const { collectionId } = req.params;
  const { q, limit = 50 } = req.query;
  
  if (!q) {
    return next(new AppError('Terme de recherche requis', 400));
  }
  
  // Vérifier l'accès
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Rechercher
  const messages = await Message.find({
    collection: collectionId,
    content: { $regex: q, $options: 'i' },
    isDeleted: false
  })
  .populate('sender', 'name avatar')
  .sort('-createdAt')
  .limit(parseInt(limit));
  
  res.status(200).json({
    success: true,
    count: messages.length,
    query: q,
    data: messages
  });
});

// Fonction utilitaire pour vérifier si une chaîne est une URL
function isURL(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

// Fonction pour extraire les métadonnées d'un lien
async function extractLinkPreview(url) {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'SUPRSS/1.0'
      }
    });
    
    const html = response.data;
    
    // Extraction basique des métadonnées Open Graph
    const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/) || [];
    const ogDescription = html.match(/<meta property="og:description" content="([^"]*)"/) || [];
    const ogImage = html.match(/<meta property="og:image" content="([^"]*)"/) || [];
    const ogSiteName = html.match(/<meta property="og:site_name" content="([^"]*)"/) || [];
    
    // Fallback sur les balises title et meta description
    const title = ogTitle[1] || (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const description = ogDescription[1] || 
      (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    
    return {
      url,
      title: title.substring(0, 200),
      description: description.substring(0, 300),
      image: ogImage[1] || '',
      siteName: ogSiteName[1] || new URL(url).hostname
    };
  } catch (error) {
    console.error('Erreur extraction link preview:', error);
    return null;
  }
}

// Obtenir les statistiques du chat
// Cette fonction retourne des statistiques sur l'utilisation du chat
const getChatStats = asyncHandler(async (req, res, next) => {
  const { collectionId } = req.params;
  
  // Vérifier l'accès
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Statistiques globales
  const totalMessages = await Message.countDocuments({
    collection: collectionId,
    isDeleted: false
  });
  
  const myMessages = await Message.countDocuments({
    collection: collectionId,
    sender: req.user._id,
    isDeleted: false
  });
  
  // Messages par type
  const messagesByType = await Message.aggregate([
    {
      $match: {
        collection: collection._id,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Utilisateurs les plus actifs
  const activeUsers = await Message.aggregate([
    {
      $match: {
        collection: collection._id,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$sender',
        messageCount: { $sum: 1 }
      }
    },
    {
      $sort: { messageCount: -1 }
    },
    {
      $limit: 5
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        name: '$user.name',
        avatar: '$user.avatar',
        messageCount: 1
      }
    }
  ]);
  
  const stats = {
    totalMessages,
    myMessages,
    messagesByType,
    activeUsers,
    membersCount: collection.members.length + 1
  };
  
  res.status(200).json({
    success: true,
    data: stats
  });
});

module.exports = {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  togglePin,
  getPinnedMessages,
  markAllAsRead,
  searchMessages,
  getChatStats
};