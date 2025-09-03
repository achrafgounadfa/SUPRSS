// Auteur : Gounadfa Achraf - SUPRSS Project
// Routes pour la gestion des flux RSS

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const { protect, authorize, userRateLimit } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/errorHandler');

// Import des contrôleurs
const {
  getFeeds,
  getFeed,
  addFeed,
  updateFeed,
  removeFeed,
  refreshFeed,
  refreshAllFeeds,
  testFeed,
  getPopularFeeds
} = require('../controllers/feed.controller');

// Validations pour l'ajout de flux
const addFeedValidation = [
  body('url')
    .trim()
    .notEmpty().withMessage('L\'URL est requise')
    .isURL().withMessage('URL invalide'),
  body('collectionId')
    .notEmpty().withMessage('La collection est requise')
    .isMongoId().withMessage('ID de collection invalide'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Le nom doit contenir entre 2 et 200 caractères'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('La description ne peut pas dépasser 1000 caractères'),
  body('categories')
    .optional()
    .isArray().withMessage('Les catégories doivent être un tableau'),
  body('updateFrequency')
    .optional()
    .isInt({ min: 5, max: 1440 }).withMessage('La fréquence doit être entre 5 et 1440 minutes')
];

// Validations pour la mise à jour de flux
const updateFeedValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Le nom doit contenir entre 2 et 200 caractères'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('La description ne peut pas dépasser 1000 caractères'),
  body('categories')
    .optional()
    .isArray().withMessage('Les catégories doivent être un tableau'),
  body('tags')
    .optional()
    .isArray().withMessage('Les tags doivent être un tableau'),
  body('updateFrequency')
    .optional()
    .isInt({ min: 5, max: 1440 }).withMessage('La fréquence doit être entre 5 et 1440 minutes'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive doit être un booléen')
];

// Validation pour tester un flux
const testFeedValidation = [
  body('url')
    .trim()
    .notEmpty().withMessage('L\'URL est requise')
    .isURL().withMessage('URL invalide')
];

// ========================================
// Routes principales des flux RSS
// ========================================

// GET /api/feeds - Récupérer tous les flux accessibles
router.get(
  '/',
  protect,
  validateRequest([
    query('collectionId')
      .optional()
      .isMongoId().withMessage('ID de collection invalide')
  ]),
  getFeeds
);

// GET /api/feeds/popular - Obtenir des suggestions de flux populaires
router.get(
  '/popular',
  protect,
  validateRequest([
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 }).withMessage('Limite invalide'),
    query('category')
      .optional()
      .isIn(['news', 'tech', 'blog', 'podcast', 'video']).withMessage('Catégorie invalide')
  ]),
  getPopularFeeds
);

// POST /api/feeds/test - Tester une URL de flux RSS
router.post(
  '/test',
  protect,
  userRateLimit(20, 1), // Limiter à 20 tests par minute
  validateRequest(testFeedValidation),
  testFeed
);

// GET /api/feeds/:id - Récupérer un flux spécifique
router.get('/:id', protect, getFeed);

// POST /api/feeds - Ajouter un nouveau flux
router.post(
  '/',
  protect,
  userRateLimit(30, 60), // Limiter à 30 ajouts par heure
  validateRequest(addFeedValidation),
  addFeed
);

// PUT /api/feeds/:id - Mettre à jour un flux
router.put(
  '/:id',
  protect,
  validateRequest(updateFeedValidation),
  updateFeed
);

// DELETE /api/feeds/:id - Supprimer un flux d'une collection
router.delete(
  '/:id',
  protect,
  validateRequest([
    body('collectionId')
      .notEmpty().withMessage('La collection est requise')
      .isMongoId().withMessage('ID de collection invalide')
  ]),
  removeFeed
);

// ========================================
// Routes de rafraîchissement des flux
// ========================================

// POST /api/feeds/:id/refresh - Rafraîchir un flux manuellement
router.post(
  '/:id/refresh',
  protect,
  userRateLimit(10, 1), // Limiter à 10 rafraîchissements par minute
  refreshFeed
);

// POST /api/feeds/refresh-all - Rafraîchir tous les flux (admin)
router.post(
  '/refresh-all',
  protect,
  authorize('admin'), // Seuls les admins peuvent rafraîchir tous les flux
  refreshAllFeeds
);

// ========================================
// Routes de gestion des flux
// ========================================

// POST /api/feeds/:id/activate - Activer un flux
router.post('/:id/activate', protect, async (req, res, next) => {
  req.body = { isActive: true };
  updateFeed(req, res, next);
});

// POST /api/feeds/:id/deactivate - Désactiver un flux
router.post('/:id/deactivate', protect, async (req, res, next) => {
  req.body = { isActive: false };
  updateFeed(req, res, next);
});

// POST /api/feeds/:id/reset-errors - Réinitialiser les erreurs d'un flux
router.post('/:id/reset-errors', protect, async (req, res, next) => {
  const Feed = require('../models/Feed.model');
  const { asyncHandler, AppError } = require('../middlewares/errorHandler');
  
  const resetErrors = asyncHandler(async (req, res) => {
    const feed = await Feed.findById(req.params.id);
    
    if (!feed) {
      throw new AppError('Flux non trouvé', 404);
    }
    
    const hasAccess = await feed.userHasAccess(req.user._id);
    if (!hasAccess) {
      throw new AppError('Accès non autorisé', 403);
    }
    
    await feed.resetErrors();
    
    res.json({
      success: true,
      message: 'Erreurs réinitialisées',
      data: feed
    });
  });
  
  resetErrors(req, res, next);
});

// ========================================
// Routes de statistiques et analyse
// ========================================

// GET /api/feeds/:id/stats - Obtenir les statistiques d'un flux
router.get('/:id/stats', protect, async (req, res, next) => {
  const Feed = require('../models/Feed.model');
  const Article = require('../models/Article.model');
  const { asyncHandler, AppError } = require('../middlewares/errorHandler');
  
  const getStats = asyncHandler(async (req, res) => {
    const feed = await Feed.findById(req.params.id);
    
    if (!feed) {
      throw new AppError('Flux non trouvé', 404);
    }
    
    const hasAccess = await feed.userHasAccess(req.user._id);
    if (!hasAccess) {
      throw new AppError('Accès non autorisé', 403);
    }
    
    // Statistiques des articles
    const totalArticles = await Article.countDocuments({ feed: feed._id });
    const recentArticles = await Article.countDocuments({
      feed: feed._id,
      publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    
    const readArticles = await Article.countDocuments({
      feed: feed._id,
      'readBy.user': req.user._id
    });
    
    res.json({
      success: true,
      data: {
        feedStats: feed.stats,
        articles: {
          total: totalArticles,
          recent: recentArticles,
          read: readArticles,
          unread: totalArticles - readArticles
        },
        lastFetch: feed.lastFetchedAt,
        nextFetch: feed.nextFetchAt,
        status: feed.status,
        updateFrequency: feed.updateFrequency
      }
    });
  });
  
  getStats(req, res, next);
});

// ========================================
// Routes de test et de santé
// ========================================

// GET /api/feeds/health - Test des routes feeds
router.get('/health/check', (req, res) => {
  res.json({
    success: true,
    message: 'Routes feeds SUPRSS fonctionnelles',
    timestamp: new Date().toISOString(),
    author: 'Gounadfa Achraf'
  });
});

// Export du routeur pour utilisation dans app.js
module.exports = router;