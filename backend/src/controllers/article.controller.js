// Auteur : Gounadfa Achraf - SUPRSS Project
// Contrôleur pour la gestion des articles RSS

const Article = require('../models/Article.model');
const Collection = require('../models/Collection.model');
const Comment = require('../models/Comment.model');
const Feed = require('../models/Feed.model');
const { asyncHandler, AppError } = require('../middlewares/errorHandler');

// Récupérer tous les articles accessibles à l'utilisateur
// Cette fonction retourne les articles avec filtrage et pagination
const getArticles = asyncHandler(async (req, res, next) => {
  const {
    collectionId,
    feedId,
    limit = 50,
    skip = 0,
    sort = '-publishedAt',
    isRead,
    isFavorite,
    search,
    categories,
    tags,
    dateFrom,
    dateTo
  } = req.query;
  
  // Construire la requête
  let query = {};
  
  // Filtrer par collection
  if (collectionId) {
    const collection = await Collection.findById(collectionId);
    if (!collection) {
      return next(new AppError('Collection non trouvée', 404));
    }
    
    if (!collection.isMember(req.user._id)) {
      return next(new AppError('Accès non autorisé', 403));
    }
    
    query.collections = collectionId;
  } else {
    // Récupérer toutes les collections de l'utilisateur
    const userCollections = await Collection.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ]
    }).select('_id');
    
    const collectionIds = userCollections.map(c => c._id);
    query.collections = { $in: collectionIds };
  }
  
  // Filtrer par flux
  if (feedId) {
    query.feed = feedId;
  }
  
  // Filtrer par statut de lecture
  if (isRead === 'true') {
    query['readBy.user'] = req.user._id;
  } else if (isRead === 'false') {
    query['readBy.user'] = { $ne: req.user._id };
  }
  
  // Filtrer par favoris
  if (isFavorite === 'true') {
    query['favoritedBy.user'] = req.user._id;
  }
  
  // Filtrer par catégories
  if (categories) {
    query.categories = { $in: categories.split(',') };
  }
  
  // Filtrer par tags
  if (tags) {
    query['tags.tag'] = { $in: tags.split(',') };
  }
  
  // Recherche textuelle
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
      { summary: { $regex: search, $options: 'i' } }
    ];
  }
  
  // Filtrer par date
  if (dateFrom || dateTo) {
    query.publishedAt = {};
    if (dateFrom) {
      query.publishedAt.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      query.publishedAt.$lte = new Date(dateTo);
    }
  }
  
  // Exécuter la requête
  const articles = await Article.find(query)
    .populate('feed', 'name url icon')
    .sort(sort)
    .skip(parseInt(skip))
    .limit(parseInt(limit));
  
  // Ajouter des métadonnées pour chaque article
  const articlesWithMeta = articles.map(article => {
    const articleObj = article.toObject();
    articleObj.isRead = article.isReadByUser(req.user._id);
    articleObj.isFavorite = article.isFavoritedByUser(req.user._id);
    return articleObj;
  });
  
  // Compter le total pour la pagination
  const total = await Article.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: articles.length,
    total,
    data: articlesWithMeta,
    pagination: {
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: total > parseInt(skip) + articles.length
    }
  });
});

// Récupérer un article spécifique
// Cette fonction retourne les détails complets d'un article
const getArticle = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const article = await Article.findById(id)
    .populate('feed', 'name url websiteUrl')
    .populate('comments');
  
  if (!article) {
    return next(new AppError('Article non trouvé', 404));
  }
  
  // Vérifier l'accès
  const userCollections = await Collection.find({
    $or: [
      { owner: req.user._id },
      { 'members.user': req.user._id }
    ],
    _id: { $in: article.collections }
  });
  
  if (userCollections.length === 0) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Incrémenter les vues
  article.stats.views++;
  await article.save();
  
  // Ajouter les métadonnées utilisateur
  const articleData = article.toObject();
  articleData.isRead = article.isReadByUser(req.user._id);
  articleData.isFavorite = article.isFavoritedByUser(req.user._id);
  
  res.status(200).json({
    success: true,
    data: articleData
  });
});

// Marquer un article comme lu
// Cette fonction met à jour le statut de lecture d'un article
const markAsRead = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { readingTime } = req.body;
  
  const article = await Article.findById(id);
  
  if (!article) {
    return next(new AppError('Article non trouvé', 404));
  }
  
  // Vérifier l'accès
  const hasAccess = await checkArticleAccess(article, req.user._id);
  if (!hasAccess) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Marquer comme lu
  await article.markAsRead(req.user._id, readingTime);
  
  res.status(200).json({
    success: true,
    message: 'Article marqué comme lu'
  });
});

// Marquer un article comme non lu
// Cette fonction retire le statut de lecture d'un article
const markAsUnread = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const article = await Article.findById(id);
  
  if (!article) {
    return next(new AppError('Article non trouvé', 404));
  }
  
  // Vérifier l'accès
  const hasAccess = await checkArticleAccess(article, req.user._id);
  if (!hasAccess) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Marquer comme non lu
  await article.markAsUnread(req.user._id);
  
  res.status(200).json({
    success: true,
    message: 'Article marqué comme non lu'
  });
});

// Marquer plusieurs articles comme lus
// Cette fonction permet de marquer plusieurs articles en une seule requête
const markMultipleAsRead = asyncHandler(async (req, res, next) => {
  const { articleIds } = req.body;
  
  if (!articleIds || !Array.isArray(articleIds)) {
    return next(new AppError('Liste d\'articles requise', 400));
  }
  
  const results = {
    success: 0,
    failed: 0
  };
  
  for (const articleId of articleIds) {
    try {
      const article = await Article.findById(articleId);
      if (article) {
        const hasAccess = await checkArticleAccess(article, req.user._id);
        if (hasAccess) {
          await article.markAsRead(req.user._id);
          results.success++;
        } else {
          results.failed++;
        }
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
    }
  }
  
  res.status(200).json({
    success: true,
    message: `${results.success} articles marqués comme lus`,
    data: results
  });
});

// Ajouter un article aux favoris
// Cette fonction ajoute un article à la liste des favoris de l'utilisateur
const addToFavorites = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const article = await Article.findById(id);
  
  if (!article) {
    return next(new AppError('Article non trouvé', 404));
  }
  
  // Vérifier l'accès
  const hasAccess = await checkArticleAccess(article, req.user._id);
  if (!hasAccess) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Ajouter aux favoris
  await article.addToFavorites(req.user._id);
  
  res.status(200).json({
    success: true,
    message: 'Article ajouté aux favoris'
  });
});

// Retirer un article des favoris
// Cette fonction retire un article de la liste des favoris
const removeFromFavorites = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const article = await Article.findById(id);
  
  if (!article) {
    return next(new AppError('Article non trouvé', 404));
  }
  
  // Retirer des favoris
  await article.removeFromFavorites(req.user._id);
  
  res.status(200).json({
    success: true,
    message: 'Article retiré des favoris'
  });
});

// Récupérer les articles favoris de l'utilisateur
// Cette fonction retourne tous les articles mis en favoris
const getFavorites = asyncHandler(async (req, res, next) => {
  const { limit = 50, skip = 0 } = req.query;
  
  const articles = await Article.find({
    'favoritedBy.user': req.user._id
  })
  .populate('feed', 'name url')
  .sort('-favoritedBy.favoritedAt')
  .skip(parseInt(skip))
  .limit(parseInt(limit));
  
  const total = await Article.countDocuments({
    'favoritedBy.user': req.user._id
  });
  
  res.status(200).json({
    success: true,
    count: articles.length,
    total,
    data: articles
  });
});

// Ajouter un commentaire à un article
// Cette fonction crée un nouveau commentaire sur un article
const addComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { content, collectionId, parentCommentId } = req.body;
  
  if (!content || !collectionId) {
    return next(new AppError('Contenu et collection requis', 400));
  }
  
  // Vérifier l'article
  const article = await Article.findById(id);
  if (!article) {
    return next(new AppError('Article non trouvé', 404));
  }
  
  // Vérifier la collection et les permissions
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Vous devez être membre de la collection pour commenter', 403));
  }
  
  if (!collection.userHasPermission(req.user._id, 'canComment')) {
    return next(new AppError('Permissions insuffisantes pour commenter', 403));
  }
  
  // Créer le commentaire
  const comment = await Comment.create({
    article: id,
    collection: collectionId,
    author: req.user._id,
    content,
    parentComment: parentCommentId || null
  });
  
  // Ajouter le commentaire à l'article
  article.comments.push(comment._id);
  article.stats.commentsCount++;
  await article.save();
  
  // Si c'est une réponse, l'ajouter au commentaire parent
  if (parentCommentId) {
    const parentComment = await Comment.findById(parentCommentId);
    if (parentComment) {
      parentComment.replies.push(comment._id);
      await parentComment.save();
    }
  }
  
  // Populeir et retourner le commentaire
  await comment.populate('author', 'name avatar');
  
  res.status(201).json({
    success: true,
    message: 'Commentaire ajouté',
    data: comment
  });
});

// Récupérer les commentaires d'un article
// Cette fonction retourne tous les commentaires avec leurs réponses
const getComments = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { limit = 50, skip = 0 } = req.query;
  
  const article = await Article.findById(id);
  if (!article) {
    return next(new AppError('Article non trouvé', 404));
  }
  
  const comments = await Comment.getArticleComments(id, {
    limit: parseInt(limit),
    skip: parseInt(skip)
  });
  
  res.status(200).json({
    success: true,
    count: comments.length,
    data: comments
  });
});

// Ajouter un tag à un article
// Cette fonction permet d'ajouter des tags personnalisés
const addTag = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { tag } = req.body;
  
  if (!tag) {
    return next(new AppError('Tag requis', 400));
  }
  
  const article = await Article.findById(id);
  
  if (!article) {
    return next(new AppError('Article non trouvé', 404));
  }
  
  // Vérifier l'accès
  const hasAccess = await checkArticleAccess(article, req.user._id);
  if (!hasAccess) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Ajouter le tag
  await article.addTag(tag, req.user._id);
  
  res.status(200).json({
    success: true,
    message: 'Tag ajouté',
    data: article.tags
  });
});

// Partager un article
// Cette fonction génère un lien de partage ou envoie l'article
const shareArticle = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { method = 'link' } = req.body; // link, email, collection
  
  const article = await Article.findById(id).populate('feed', 'name');
  
  if (!article) {
    return next(new AppError('Article non trouvé', 404));
  }
  
  // Vérifier l'accès
  const hasAccess = await checkArticleAccess(article, req.user._id);
  if (!hasAccess) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Incrémenter le compteur de partages
  article.stats.shares++;
  await article.save();
  
  let shareData;
  
  switch (method) {
    case 'link':
      // Générer un lien de partage
      shareData = {
        url: article.link,
        title: article.title,
        description: article.summary
      };
      break;
      
    case 'collection':
      // Logique pour partager dans une autre collection
      const { targetCollectionId } = req.body;
      if (!targetCollectionId) {
        return next(new AppError('Collection cible requise', 400));
      }
      
      const targetCollection = await Collection.findById(targetCollectionId);
      if (!targetCollection || !targetCollection.isMember(req.user._id)) {
        return next(new AppError('Collection cible non accessible', 403));
      }
      
      if (!article.collections.includes(targetCollectionId)) {
        article.collections.push(targetCollectionId);
        await article.save();
      }
      
      shareData = {
        message: 'Article partagé dans la collection',
        collection: targetCollection.name
      };
      break;
      
    default:
      return next(new AppError('Méthode de partage non supportée', 400));
  }
  
  res.status(200).json({
    success: true,
    message: 'Article partagé',
    data: shareData
  });
});

// Rechercher des articles
// Cette fonction permet une recherche avancée dans les articles
const searchArticles = asyncHandler(async (req, res, next) => {
  const {
    q,
    collections,
    feeds,
    dateFrom,
    dateTo,
    author,
    limit = 50,
    skip = 0
  } = req.query;
  
  if (!q) {
    return next(new AppError('Terme de recherche requis', 400));
  }
  
  // Récupérer les collections accessibles
  const userCollections = await Collection.find({
    $or: [
      { owner: req.user._id },
      { 'members.user': req.user._id }
    ]
  }).select('_id');
  
  const accessibleCollections = userCollections.map(c => c._id);
  
  // Construire la requête
  let query = {
    collections: { $in: accessibleCollections },
    $text: { $search: q }
  };
  
  // Filtres additionnels
  if (collections) {
    const collectionIds = collections.split(',');
    query.collections = { 
      $in: collectionIds.filter(id => 
        accessibleCollections.some(ac => ac.toString() === id)
      )
    };
  }
  
  if (feeds) {
    query.feed = { $in: feeds.split(',') };
  }
  
  if (author) {
    query.author = { $regex: author, $options: 'i' };
  }
  
  if (dateFrom || dateTo) {
    query.publishedAt = {};
    if (dateFrom) query.publishedAt.$gte = new Date(dateFrom);
    if (dateTo) query.publishedAt.$lte = new Date(dateTo);
  }
  
  // Créer l'index de recherche si nécessaire
  await Article.collection.createIndex({ 
    title: 'text', 
    content: 'text', 
    summary: 'text' 
  });
  
  // Exécuter la recherche
  const articles = await Article.find(query)
    .populate('feed', 'name')
    .sort({ score: { $meta: 'textScore' } })
    .skip(parseInt(skip))
    .limit(parseInt(limit));
  
  const total = await Article.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: articles.length,
    total,
    query: q,
    data: articles
  });
});

// Fonction utilitaire pour vérifier l'accès à un article
async function checkArticleAccess(article, userId) {
  const userCollections = await Collection.find({
    $or: [
      { owner: userId },
      { 'members.user': userId }
    ],
    _id: { $in: article.collections }
  });
  
  return userCollections.length > 0;
}

// Obtenir les statistiques de lecture
// Cette fonction retourne des statistiques sur les habitudes de lecture
const getReadingStats = asyncHandler(async (req, res, next) => {
  const { period = '7d' } = req.query;
  
  // Calculer la date de début selon la période
  let startDate = new Date();
  switch (period) {
    case '24h':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case 'all':
      startDate = new Date(0);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }
  
  // Récupérer les collections de l'utilisateur
  const userCollections = await Collection.find({
    $or: [
      { owner: req.user._id },
      { 'members.user': req.user._id }
    ]
  }).select('_id');
  
  const collectionIds = userCollections.map(c => c._id);
  
  // Statistiques globales
  const totalArticles = await Article.countDocuments({
    collections: { $in: collectionIds }
  });
  
  const readArticles = await Article.countDocuments({
    collections: { $in: collectionIds },
    'readBy.user': req.user._id
  });
  
  const favoriteArticles = await Article.countDocuments({
    'favoritedBy.user': req.user._id
  });
  
  // Articles lus dans la période
  const recentlyRead = await Article.countDocuments({
    collections: { $in: collectionIds },
    'readBy.user': req.user._id,
    'readBy.readAt': { $gte: startDate }
  });
  
  // Temps de lecture total
  const readingData = await Article.aggregate([
    {
      $match: {
        collections: { $in: collectionIds },
        'readBy.user': req.user._id
      }
    },
    {
      $unwind: '$readBy'
    },
    {
      $match: {
        'readBy.user': req.user._id,
        'readBy.readAt': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalReadingTime: { $sum: '$readBy.readingTime' },
        averageReadingTime: { $avg: '$readBy.readingTime' }
      }
    }
  ]);
  
  const stats = {
    period,
    total: totalArticles,
    read: readArticles,
    unread: totalArticles - readArticles,
    readPercentage: totalArticles > 0 ? Math.round((readArticles / totalArticles) * 100) : 0,
    favorites: favoriteArticles,
    recentlyRead,
    readingTime: readingData[0] || { totalReadingTime: 0, averageReadingTime: 0 }
  };
  
  res.status(200).json({
    success: true,
    data: stats
  });
});

module.exports = {
  getArticles,
  getArticle,
  markAsRead,
  markAsUnread,
  markMultipleAsRead,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  addComment,
  getComments,
  addTag,
  shareArticle,
  searchArticles,
  getReadingStats
};