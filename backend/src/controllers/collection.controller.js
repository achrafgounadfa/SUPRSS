// Auteur : Gounadfa Achraf - SUPRSS Project
// Contrôleur pour la gestion des collections de flux RSS

const Collection = require('../models/Collection.model');
const User = require('../models/User.model');
const Feed = require('../models/Feed.model');
const Article = require('../models/Article.model');
const Message = require('../models/Message.model');
const { asyncHandler, AppError } = require('../middlewares/errorHandler');

// Récupérer toutes les collections de l'utilisateur
// Cette fonction retourne les collections personnelles et partagées
const getCollections = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  
  // Récupérer les collections où l'utilisateur est propriétaire ou membre
  const collections = await Collection.find({
    $or: [
      { owner: userId },
      { 'members.user': userId }
    ],
    isActive: true,
    isArchived: false
  })
  .populate('owner', 'name avatar')
  .populate('members.user', 'name avatar')
  .populate('feeds', 'name url status')
  .sort('-lastActivity');
  
  res.status(200).json({
    success: true,
    count: collections.length,
    data: collections
  });
});

// Récupérer une collection spécifique
// Cette fonction vérifie les permissions avant de retourner les détails
const getCollection = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id;
  
  const collection = await Collection.findById(id)
    .populate('owner', 'name avatar email')
    .populate('members.user', 'name avatar email')
    .populate({
      path: 'feeds',
      select: 'name url description status lastFetchedAt stats',
      options: { sort: { name: 1 } }
    });
  
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  // Vérifier les permissions
  if (!collection.isMember(userId) && !collection.settings.isPublic) {
    return next(new AppError('Accès non autorisé à cette collection', 403));
  }
  
  // Mettre à jour les statistiques
  await collection.updateStats();
  
  res.status(200).json({
    success: true,
    data: collection
  });
});

// Créer une nouvelle collection
// Cette fonction initialise une collection avec les paramètres par défaut
const createCollection = asyncHandler(async (req, res, next) => {
  const {
    name,
    description,
    type = 'personal',
    tags,
    icon,
    color,
    settings
  } = req.body;
  
  // Validation
  if (!name) {
    return next(new AppError('Le nom de la collection est requis', 400));
  }
  
  // Créer la collection
  const collection = await Collection.create({
    name,
    description,
    owner: req.user._id,
    type,
    tags,
    icon,
    color,
    settings: {
      ...settings,
      isPublic: type === 'shared' ? true : false
    }
  });
  
  // Si c'est une collection partagée, générer un code d'invitation
  if (type === 'shared') {
    collection.generateInviteCode();
    await collection.save();
  }
  
  // Ajouter la collection à l'utilisateur
  await User.findByIdAndUpdate(req.user._id, {
    $push: { collections: collection._id }
  });
  
  // Créer un message système si collection partagée
  if (type === 'shared') {
    await Message.createSystemMessage(collection._id, 'collection_updated', {
      userId: req.user._id,
      userName: req.user.name,
      changes: 'Collection créée'
    });
  }
  
  res.status(201).json({
    success: true,
    message: 'Collection créée avec succès',
    data: collection
  });
});

// Mettre à jour une collection
// Cette fonction vérifie les permissions avant de permettre les modifications
const updateCollection = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;
  
  // Récupérer la collection
  const collection = await Collection.findById(id);
  
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  // Vérifier les permissions
  if (collection.owner.toString() !== req.user._id.toString() &&
      !collection.userHasPermission(req.user._id, 'canEditSettings')) {
    return next(new AppError('Permissions insuffisantes pour modifier cette collection', 403));
  }
  
  // Empêcher la modification de certains champs
  delete updates.owner;
  delete updates.members;
  delete updates._id;
  
  // Mettre à jour
  Object.keys(updates).forEach(key => {
    collection[key] = updates[key];
  });
  
  await collection.save();
  
  // Notification système
  if (collection.type === 'shared') {
    await Message.createSystemMessage(collection._id, 'collection_updated', {
      userId: req.user._id,
      userName: req.user.name,
      changes: 'Paramètres modifiés'
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Collection mise à jour avec succès',
    data: collection
  });
});

// Supprimer une collection
// Cette fonction archive la collection au lieu de la supprimer définitivement
const deleteCollection = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const collection = await Collection.findById(id);
  
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  // Seul le propriétaire peut supprimer
  if (collection.owner.toString() !== req.user._id.toString()) {
    return next(new AppError('Seul le propriétaire peut supprimer la collection', 403));
  }
  
  // Archiver au lieu de supprimer
  collection.isArchived = true;
  collection.archivedAt = new Date();
  collection.isActive = false;
  await collection.save();
  
  // Retirer de la liste des collections de l'utilisateur
  await User.findByIdAndUpdate(req.user._id, {
    $pull: { collections: collection._id }
  });
  
  res.status(200).json({
    success: true,
    message: 'Collection archivée avec succès'
  });
});

// Inviter un membre à une collection
// Cette fonction gère l'envoi d'invitations et les permissions
const inviteMember = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { email, role = 'reader' } = req.body;
  
  if (!email) {
    return next(new AppError('Email requis pour l\'invitation', 400));
  }
  
  const collection = await Collection.findById(id);
  
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  // Vérifier les permissions
  if (collection.owner.toString() !== req.user._id.toString() &&
      !collection.userHasPermission(req.user._id, 'canInviteMembers')) {
    return next(new AppError('Permissions insuffisantes pour inviter des membres', 403));
  }
  
  // Vérifier que c'est une collection partagée
  if (collection.type !== 'shared') {
    return next(new AppError('Les invitations ne sont possibles que pour les collections partagées', 400));
  }
  
  // Trouver l'utilisateur à inviter
  const userToInvite = await User.findOne({ email: email.toLowerCase() });
  
  if (!userToInvite) {
    return next(new AppError('Utilisateur non trouvé avec cet email', 404));
  }
  
  // Vérifier si déjà membre
  if (collection.isMember(userToInvite._id)) {
    return next(new AppError('Cet utilisateur est déjà membre de la collection', 409));
  }
  
  // Ajouter le membre
  await collection.addMember(userToInvite._id, role);
  
  // Ajouter la collection aux collections partagées de l'utilisateur
  await User.findByIdAndUpdate(userToInvite._id, {
    $push: {
      sharedCollections: {
        collection: collection._id,
        role,
        joinedAt: new Date()
      }
    }
  });
  
  // Message système
  await Message.createSystemMessage(collection._id, 'user_joined', {
    userId: userToInvite._id,
    userName: userToInvite.name
  });
  
  res.status(200).json({
    success: true,
    message: 'Membre invité avec succès',
    data: {
      collection: collection._id,
      member: userToInvite.name,
      role
    }
  });
});

// Retirer un membre d'une collection
// Cette fonction gère la suppression des membres avec vérification des permissions
const removeMember = asyncHandler(async (req, res, next) => {
  const { id, userId } = req.params;
  
  const collection = await Collection.findById(id);
  
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  // Seul le propriétaire peut retirer des membres
  if (collection.owner.toString() !== req.user._id.toString()) {
    return next(new AppError('Seul le propriétaire peut retirer des membres', 403));
  }
  
  // Ne pas pouvoir retirer le propriétaire
  if (collection.owner.toString() === userId) {
    return next(new AppError('Impossible de retirer le propriétaire de la collection', 400));
  }
  
  // Retirer le membre
  await collection.removeMember(userId);
  
  // Retirer des collections partagées de l'utilisateur
  await User.findByIdAndUpdate(userId, {
    $pull: {
      sharedCollections: { collection: collection._id }
    }
  });
  
  // Message système
  const user = await User.findById(userId);
  await Message.createSystemMessage(collection._id, 'user_left', {
    userId,
    userName: user.name
  });
  
  res.status(200).json({
    success: true,
    message: 'Membre retiré avec succès'
  });
});

// Rejoindre une collection avec un code d'invitation
// Cette fonction permet de rejoindre une collection via son code unique
const joinWithCode = asyncHandler(async (req, res, next) => {
  const { code } = req.body;
  
  if (!code) {
    return next(new AppError('Code d\'invitation requis', 400));
  }
  
  // Trouver la collection avec ce code
  const collection = await Collection.findOne({
    inviteCode: code.toUpperCase(),
    type: 'shared',
    isActive: true
  });
  
  if (!collection) {
    return next(new AppError('Code d\'invitation invalide ou expiré', 404));
  }
  
  // Vérifier si déjà membre
  if (collection.isMember(req.user._id)) {
    return next(new AppError('Vous êtes déjà membre de cette collection', 409));
  }
  
  // Ajouter comme lecteur par défaut
  await collection.addMember(req.user._id, 'reader');
  
  // Ajouter aux collections partagées de l'utilisateur
  await User.findByIdAndUpdate(req.user._id, {
    $push: {
      sharedCollections: {
        collection: collection._id,
        role: 'reader',
        joinedAt: new Date()
      }
    }
  });
  
  // Message système
  await Message.createSystemMessage(collection._id, 'user_joined', {
    userId: req.user._id,
    userName: req.user.name
  });
  
  res.status(200).json({
    success: true,
    message: 'Vous avez rejoint la collection avec succès',
    data: collection
  });
});

// Quitter une collection
// Cette fonction permet à un membre de quitter une collection partagée
const leaveCollection = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const collection = await Collection.findById(id);
  
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  // Le propriétaire ne peut pas quitter sa propre collection
  if (collection.owner.toString() === req.user._id.toString()) {
    return next(new AppError('Le propriétaire ne peut pas quitter sa propre collection', 400));
  }
  
  // Vérifier si membre
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Vous n\'êtes pas membre de cette collection', 400));
  }
  
  // Retirer le membre
  await collection.removeMember(req.user._id);
  
  // Retirer des collections partagées
  await User.findByIdAndUpdate(req.user._id, {
    $pull: {
      sharedCollections: { collection: collection._id }
    }
  });
  
  // Message système
  await Message.createSystemMessage(collection._id, 'user_left', {
    userId: req.user._id,
    userName: req.user.name
  });
  
  res.status(200).json({
    success: true,
    message: 'Vous avez quitté la collection avec succès'
  });
});

// Obtenir les articles d'une collection
// Cette fonction retourne les articles avec filtrage et pagination
const getCollectionArticles = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { 
    limit = 50, 
    skip = 0, 
    sort = '-publishedAt',
    isRead,
    isFavorite,
    feed,
    categories,
    tags,
    search,
    dateFrom,
    dateTo
  } = req.query;
  
  // Vérifier l'accès à la collection
  const collection = await Collection.findById(id);
  
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id) && !collection.settings.isPublic) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Construire les filtres
  const filters = {
    userId: req.user._id,
    isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
    isFavorite: isFavorite === 'true',
    feed,
    categories: categories ? categories.split(',') : undefined,
    tags: tags ? tags.split(',') : undefined,
    searchText: search,
    dateFrom,
    dateTo
  };
  
  // Récupérer les articles
  const articles = await Article.findByCollection(id, {
    limit: parseInt(limit),
    skip: parseInt(skip),
    sort,
    filters
  });
  
  res.status(200).json({
    success: true,
    count: articles.length,
    data: articles
  });
});

// Exporter/Importer des collections (format OPML)
// Cette fonction permet d'exporter les flux d'une collection au format OPML
const exportCollection = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { format = 'json' } = req.query;
  
  const collection = await Collection.findById(id).populate('feeds');
  
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  let exportData;
  
  if (format === 'opml') {
    // Format OPML pour compatibilité avec d'autres lecteurs RSS
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head>
    <title>${collection.name}</title>
    <dateCreated>${collection.createdAt.toISOString()}</dateCreated>
    <ownerName>${req.user.name}</ownerName>
  </head>
  <body>
    ${collection.feeds.map(feed => `
    <outline text="${feed.name}" type="rss" xmlUrl="${feed.url}" />
    `).join('')}
  </body>
</opml>`;
    
    res.set('Content-Type', 'text/xml');
    res.set('Content-Disposition', `attachment; filename="${collection.name}.opml"`);
    return res.send(opml);
  } else {
    // Format JSON par défaut
    exportData = {
      name: collection.name,
      description: collection.description,
      feeds: collection.feeds.map(feed => ({
        name: feed.name,
        url: feed.url,
        description: feed.description,
        categories: feed.categories
      })),
      exportedAt: new Date(),
      exportedBy: req.user.name
    };
    
    res.status(200).json({
      success: true,
      data: exportData
    });
  }
});

module.exports = {
  getCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  inviteMember,
  removeMember,
  joinWithCode,
  leaveCollection,
  getCollectionArticles,
  exportCollection
};