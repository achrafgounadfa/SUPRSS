// Auteur : Gounadfa Achraf - SUPRSS Project
// Routes pour la gestion des articles RSS (temporaire - étape 1)

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth.middleware');

// Route temporaire pour récupérer tous les articles
// Cette route sera implémentée complètement dans l'étape 2
router.get('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint GET /api/articles - À implémenter dans l\'étape 2',
    data: [],
    user: req.user.name
  });
});

// Route temporaire pour récupérer les articles d'une collection
router.get('/collection/:collectionId', protect, (req, res) => {
  res.json({
    success: true,
    message: `Endpoint GET /api/articles/collection/${req.params.collectionId} - À implémenter dans l\'étape 2`,
    collectionId: req.params.collectionId
  });
});

// Route temporaire pour récupérer un article spécifique
router.get('/:id', protect, (req, res) => {
  res.json({
    success: true,
    message: `Endpoint GET /api/articles/${req.params.id} - À implémenter dans l\'étape 2`,
    articleId: req.params.id
  });
});

// Route temporaire pour marquer un article comme lu
router.put('/:id/read', protect, (req, res) => {
  res.json({
    success: true,
    message: `Article ${req.params.id} marqué comme lu - À implémenter dans l\'étape 2`,
    articleId: req.params.id
  });
});

// Route temporaire pour ajouter un article aux favoris
router.put('/:id/favorite', protect, (req, res) => {
  res.json({
    success: true,
    message: `Article ${req.params.id} ajouté aux favoris - À implémenter dans l\'étape 2`,
    articleId: req.params.id
  });
});

// Route temporaire pour commenter un article
router.post('/:id/comment', protect, (req, res) => {
  res.json({
    success: true,
    message: `Commentaire ajouté à l'article ${req.params.id} - À implémenter dans l\'étape 2`,
    articleId: req.params.id,
    comment: req.body.comment
  });
});

// Export du routeur pour utilisation dans app.js
module.exports = router;