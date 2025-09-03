// Auteur : Gounadfa Achraf - SUPRSS Project
// Routes pour la gestion des articles RSS

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const { protect, userRateLimit } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/errorHandler');

// Import des contrôleurs
const {
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
} = require('../controllers/article.controller');

// Import des contrôleurs de commentaires
const Comment = require('../models/Comment.model');
const { asyncHandler, AppError } = require('../middlewares/errorHandler');

// Validations pour les requêtes
const paginationValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limite doit être entre 1 et 100'),
  query('skip')
    .optional()
    .isInt({ min: 0 }).withMessage('Skip doit être positif')
];

const commentValidation = [
  body('content')
    .trim()
    .notEmpty().withMessage('Le contenu du commentaire est requis')
    .isLength({ min: 1, max: 2000 }).withMessage('Le commentaire doit contenir entre 1 et 2000 caractères'),
  body('collectionId')
    .notEmpty().withMessage('La collection est requise')
    .isMongoId().withMessage('ID de collection invalide'),
  body('parentCommentId')
    .optional()
    .isMongoId().withMessage('ID de commentaire parent invalide')
];

// ========================================
// Routes principales des articles
// ========================================

// GET /api/articles - Récupérer tous les articles accessibles
router.get(
  '/',
  protect,
  validateRequest([
    ...paginationValidation,
    query('collectionId').optional().isMongoId(),
    query('feedId').optional().isMongoId(),
    query('isRead').optional().isIn(['true', 'false']),
    query('isFavorite').optional().isIn(['true', 'false']),
    query('sort').optional().isIn(['-publishedAt', 'publishedAt', '-createdAt', 'title'])
  ]),
  getArticles
);

// GET /api/articles/search - Rechercher des articles
router.get(
  '/search',
  protect,
  validateRequest([
    query('q').notEmpty().withMessage('Terme de recherche requis'),
    ...paginationValidation
  ]),
  searchArticles
);

// GET /api/articles/favorites - Récupérer les articles favoris
router.get(
  '/favorites',
  protect,
  validateRequest(paginationValidation),
  getFavorites
);

// GET /api/articles/stats - Obtenir les statistiques de lecture
router.get(
  '/stats',
  protect,
  validateRequest([
    query('period').optional().isIn(['24h', '7d', '30d', 'all'])
  ]),
  getReadingStats
);

// GET /api/articles/:id - Récupérer un article spécifique
router.get('/:id', protect, getArticle);

// ========================================
// Routes de gestion du statut de lecture
// ========================================

// PUT /api/articles/:id/read - Marquer comme lu
router.put(
  '/:id/read',
  protect,
  validateRequest([
    body('readingTime').optional().isInt({ min: 0 })
  ]),
  markAsRead
);

// DELETE /api/articles/:id/read - Marquer comme non lu
router.delete('/:id/read', protect, markAsUnread);

// POST /api/articles/mark-read - Marquer plusieurs articles comme lus
router.post(
  '/mark-read',
  protect,
  validateRequest([
    body('articleIds')
      .isArray().withMessage('Liste d\'articles requise')
      .notEmpty().withMessage('Liste ne peut pas être vide')
  ]),
  markMultipleAsRead
);

// ========================================
// Routes de gestion des favoris
// ========================================

// POST /api/articles/:id/favorite - Ajouter aux favoris
router.post('/:id/favorite', protect, addToFavorites);

// DELETE /api/articles/:id/favorite - Retirer des favoris
router.delete('/:id/favorite', protect, removeFromFavorites);

// ========================================
// Routes de gestion des commentaires
// ========================================

// GET /api/articles/:id/comments - Récupérer les commentaires
router.get(
  '/:id/comments',
  protect,
  validateRequest(paginationValidation),
  getComments
);

// POST /api/articles/:id/comments - Ajouter un commentaire
router.post(
  '/:id/comments',
  protect,
  userRateLimit(30, 1), // Limiter à 30 commentaires par minute
  validateRequest(commentValidation),
  addComment
);

// PUT /api/articles/comments/:commentId - Éditer un commentaire
router.put(
  '/comments/:commentId',
  protect,
  validateRequest([
    body('content')
      .trim()
      .notEmpty().withMessage('Le contenu est requis')
      .isLength({ max: 2000 }).withMessage('Maximum 2000 caractères')
  ]),
  asyncHandler(async (req, res, next) => {
    const comment = await Comment.findById(req.params.commentId);
    
    if (!comment) {
      return next(new AppError('Commentaire non trouvé', 404));
    }
    
    if (comment.author.toString() !== req.user._id.toString()) {
      return next(new AppError('Vous ne pouvez éditer que vos propres commentaires', 403));
    }
    
    await comment.edit(req.body.content);
    
    res.json({
      success: true,
      message: 'Commentaire édité',
      data: comment
    });
  })
);

// DELETE /api/articles/comments/:commentId - Supprimer un commentaire
router.delete(
  '/comments/:commentId',
  protect,
  asyncHandler(async (req, res, next) => {
    const comment = await Comment.findById(req.params.commentId);
    
    if (!comment) {
      return next(new AppError('Commentaire non trouvé', 404));
    }
    
    if (comment.author.toString() !== req.user._id.toString()) {
      return next(new AppError('Vous ne pouvez supprimer que vos propres commentaires', 403));
    }
    
    comment.status = 'deleted';
    await comment.save();
    
    res.json({
      success: true,
      message: 'Commentaire supprimé'
    });
  })
);

// POST /api/articles/comments/:commentId/reactions - Ajouter une réaction à un commentaire
router.post(
  '/comments/:commentId/reactions',
  protect,
  validateRequest([
    body('type')
      .notEmpty()
      .isIn(['like', 'love', 'haha', 'wow', 'sad', 'angry'])
  ]),
  asyncHandler(async (req, res, next) => {
    const comment = await Comment.findById(req.params.commentId);
    
    if (!comment) {
      return next(new AppError('Commentaire non trouvé', 404));
    }
    
    await comment.addReaction(req.user._id, req.body.type);
    
    res.json({
      success: true,
      message: 'Réaction ajoutée',
      data: comment.reactions
    });
  })
);

// DELETE /api/articles/comments/:commentId/reactions - Retirer une réaction
router.delete(
  '/comments/:commentId/reactions',
  protect,
  asyncHandler(async (req, res, next) => {
    const comment = await Comment.findById(req.params.commentId);
    
    if (!comment) {
      return next(new AppError('Commentaire non trouvé', 404));
    }
    
    await comment.removeReaction(req.user._id);
    
    res.json({
      success: true,
      message: 'Réaction retirée'
    });
  })
);

// POST /api/articles/comments/:commentId/report - Signaler un commentaire
router.post(
  '/comments/:commentId/report',
  protect,
  validateRequest([
    body('reason')
      .notEmpty()
      .isIn(['spam', 'offensive', 'misleading', 'other']),
    body('description')
      .optional()
      .isLength({ max: 500 })
  ]),
  asyncHandler(async (req, res, next) => {
    const comment = await Comment.findById(req.params.commentId);
    
    if (!comment) {
      return next(new AppError('Commentaire non trouvé', 404));
    }
    
    await comment.report(req.user._id, req.body.reason, req.body.description);
    
    res.json({
      success: true,
      message: 'Commentaire signalé'
    });
  })
);

// ========================================
// Routes de gestion des tags
// ========================================

// POST /api/articles/:id/tags - Ajouter un tag
router.post(
  '/:id/tags',
  protect,
  validateRequest([
    body('tag')
      .trim()
      .notEmpty().withMessage('Tag requis')
      .isLength({ min: 2, max: 30 }).withMessage('Le tag doit contenir entre 2 et 30 caractères')
      .matches(/^[a-zA-Z0-9-_]+$/).withMessage('Le tag ne peut contenir que des lettres, chiffres, - et _')
  ]),
  addTag
);

// ========================================
// Routes de partage
// ========================================

// POST /api/articles/:id/share - Partager un article
router.post(
  '/:id/share',
  protect,
  userRateLimit(50, 60), // Limiter à 50 partages par heure
  validateRequest([
    body('method')
      .optional()
      .isIn(['link', 'email', 'collection']),
    body('targetCollectionId')
      .if(body('method').equals('collection'))
      .notEmpty().withMessage('Collection cible requise')
      .isMongoId()
  ]),
  shareArticle
);

// ========================================
// Routes de gestion en masse
// ========================================

// POST /api/articles/bulk/read - Marquer plusieurs articles comme lus
router.post(
  '/bulk/read',
  protect,
  validateRequest([
    body('articleIds')
      .isArray({ min: 1, max: 100 })
      .withMessage('Entre 1 et 100 articles')
  ]),
  markMultipleAsRead
);

// POST /api/articles/bulk/favorite - Ajouter plusieurs articles aux favoris
router.post(
  '/bulk/favorite',
  protect,
  validateRequest([
    body('articleIds')
      .isArray({ min: 1, max: 50 })
  ]),
  asyncHandler(async (req, res) => {
    const Article = require('../models/Article.model');
    const results = { success: 0, failed: 0 };
    
    for (const articleId of req.body.articleIds) {
      try {
        const article = await Article.findById(articleId);
        if (article) {
          await article.addToFavorites(req.user._id);
          results.success++;
        } else {
          results.failed++;
        }
      } catch {
        results.failed++;
      }
    }
    
    res.json({
      success: true,
      message: `${results.success} articles ajoutés aux favoris`,
      data: results
    });
  })
);

// ========================================
// Routes de recommandation
// ========================================

// GET /api/articles/recommended - Obtenir des articles recommandés
router.get(
  '/recommended',
  protect,
  asyncHandler(async (req, res) => {
    const Article = require('../models/Article.model');
    const Collection = require('../models/Collection.model');
    
    // Récupérer les collections de l'utilisateur
    const collections = await Collection.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ]
    }).select('_id');
    
    // Récupérer les catégories favorites basées sur l'historique
    const favoriteCategories = await Article.aggregate([
      {
        $match: {
          'favoritedBy.user': req.user._id
        }
      },
      {
        $unwind: '$categories'
      },
      {
        $group: {
          _id: '$categories',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      }
    ]);
    
    const categories = favoriteCategories.map(c => c._id);
    
    // Recommander des articles basés sur les catégories
    const recommended = await Article.find({
      collections: { $in: collections.map(c => c._id) },
      categories: { $in: categories },
      'readBy.user': { $ne: req.user._id }
    })
    .populate('feed', 'name')
    .sort('-publishedAt')
    .limit(20);
    
    res.json({
      success: true,
      count: recommended.length,
      data: recommended
    });
  })
);

// ========================================
// Routes de test et de santé
// ========================================

// GET /api/articles/health - Test des routes articles
router.get('/health/check', (req, res) => {
  res.json({
    success: true,
    message: 'Routes articles SUPRSS fonctionnelles',
    timestamp: new Date().toISOString(),
    author: 'Gounadfa Achraf'
  });
});

// Export du routeur pour utilisation dans app.js
module.exports = router;