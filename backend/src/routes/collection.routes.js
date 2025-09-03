// Auteur : Gounadfa Achraf - SUPRSS Project
// Routes pour la gestion des collections

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect, authorize, userRateLimit } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/errorHandler');

// Import des contrôleurs
const {
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
} = require('../controllers/collection.controller');

// Import des contrôleurs de messages pour les routes de chat
const {
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
} = require('../controllers/message.controller');

// Validations pour la création de collection
const createCollectionValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Le nom est requis')
    .isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('La description ne peut pas dépasser 500 caractères'),
  body('type')
    .optional()
    .isIn(['personal', 'shared']).withMessage('Type invalide'),
  body('tags')
    .optional()
    .isArray().withMessage('Les tags doivent être un tableau'),
  body('icon')
    .optional()
    .trim(),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Couleur hexadécimale invalide')
];

// Validations pour l'invitation de membres
const inviteMemberValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('L\'email est requis')
    .isEmail().withMessage('Email invalide')
    .normalizeEmail(),
  body('role')
    .optional()
    .isIn(['reader', 'contributor', 'admin']).withMessage('Rôle invalide')
];

// Validations pour l'envoi de messages
const sendMessageValidation = [
  body('content')
    .if(body('type').equals('text'))
    .notEmpty().withMessage('Le contenu est requis pour les messages texte')
    .isLength({ max: 1000 }).withMessage('Le message ne peut pas dépasser 1000 caractères'),
  body('type')
    .optional()
    .isIn(['text', 'image', 'file', 'link', 'article_share', 'system']).withMessage('Type de message invalide')
];

// ========================================
// Routes de base des collections
// ========================================

// GET /api/collections - Récupérer toutes les collections de l'utilisateur
router.get('/', protect, getCollections);

// POST /api/collections - Créer une nouvelle collection
router.post(
  '/',
  protect,
  userRateLimit(10, 60), // Limiter à 10 créations par heure
  validateRequest(createCollectionValidation),
  createCollection
);

// GET /api/collections/:id - Récupérer une collection spécifique
router.get('/:id', protect, getCollection);

// PUT /api/collections/:id - Mettre à jour une collection
router.put(
  '/:id',
  protect,
  validateRequest(createCollectionValidation),
  updateCollection
);

// DELETE /api/collections/:id - Supprimer/Archiver une collection
router.delete('/:id', protect, deleteCollection);

// ========================================
// Routes de gestion des membres
// ========================================

// POST /api/collections/:id/members - Inviter un membre
router.post(
  '/:id/members',
  protect,
  validateRequest(inviteMemberValidation),
  inviteMember
);

// DELETE /api/collections/:id/members/:userId - Retirer un membre
router.delete('/:id/members/:userId', protect, removeMember);

// POST /api/collections/join - Rejoindre avec un code d'invitation
router.post(
  '/join',
  protect,
  validateRequest([
    body('code')
      .trim()
      .notEmpty().withMessage('Code d\'invitation requis')
      .isLength({ min: 8, max: 8 }).withMessage('Code invalide')
  ]),
  joinWithCode
);

// POST /api/collections/:id/leave - Quitter une collection
router.post('/:id/leave', protect, leaveCollection);

// ========================================
// Routes des articles de collection
// ========================================

// GET /api/collections/:id/articles - Récupérer les articles d'une collection
router.get('/:id/articles', protect, getCollectionArticles);

// ========================================
// Routes d'export/import
// ========================================

// GET /api/collections/:id/export - Exporter une collection
router.get('/:id/export', protect, exportCollection);

// POST /api/collections/import - Importer une collection (OPML/JSON)
router.post(
  '/import',
  protect,
  userRateLimit(5, 60), // Limiter à 5 imports par heure
  (req, res) => {
    // À implémenter : logique d'import OPML/JSON
    res.json({
      success: false,
      message: 'Import à implémenter'
    });
  }
);

// ========================================
// Routes de messagerie/chat
// ========================================

// GET /api/collections/:collectionId/messages - Récupérer les messages
router.get('/:collectionId/messages', protect, getMessages);

// POST /api/collections/:collectionId/messages - Envoyer un message
router.post(
  '/:collectionId/messages',
  protect,
  userRateLimit(100, 1), // Limiter à 100 messages par minute
  validateRequest(sendMessageValidation),
  sendMessage
);

// PUT /api/collections/messages/:messageId - Éditer un message
router.put(
  '/messages/:messageId',
  protect,
  validateRequest([
    body('content')
      .trim()
      .notEmpty().withMessage('Le nouveau contenu est requis')
      .isLength({ max: 1000 }).withMessage('Le message ne peut pas dépasser 1000 caractères')
  ]),
  editMessage
);

// DELETE /api/collections/messages/:messageId - Supprimer un message
router.delete('/messages/:messageId', protect, deleteMessage);

// POST /api/collections/messages/:messageId/reactions - Ajouter une réaction
router.post(
  '/messages/:messageId/reactions',
  protect,
  validateRequest([
    body('emoji')
      .notEmpty().withMessage('Emoji requis')
  ]),
  addReaction
);

// DELETE /api/collections/messages/:messageId/reactions - Retirer une réaction
router.delete('/messages/:messageId/reactions', protect, removeReaction);

// POST /api/collections/messages/:messageId/pin - Épingler/Désépingler un message
router.post('/messages/:messageId/pin', protect, togglePin);

// GET /api/collections/:collectionId/messages/pinned - Récupérer les messages épinglés
router.get('/:collectionId/messages/pinned', protect, getPinnedMessages);

// POST /api/collections/:collectionId/messages/read - Marquer tous comme lus
router.post('/:collectionId/messages/read', protect, markAllAsRead);

// GET /api/collections/:collectionId/messages/search - Rechercher dans les messages
router.get('/:collectionId/messages/search', protect, searchMessages);

// GET /api/collections/:collectionId/messages/stats - Statistiques du chat
router.get('/:collectionId/messages/stats', protect, getChatStats);

// ========================================
// Routes de test et de santé
// ========================================

// GET /api/collections/test - Test des routes collections
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Routes collections SUPRSS fonctionnelles',
    timestamp: new Date().toISOString(),
    author: 'Gounadfa Achraf'
  });
});

// Export du routeur pour utilisation dans app.js
module.exports = router;