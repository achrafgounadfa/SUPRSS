// Auteur : Gounadfa Achraf - SUPRSS Project
// Routes pour la gestion des collections (temporaire - étape 1)

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth.middleware');

// Route temporaire pour récupérer toutes les collections
// Cette route sera implémentée complètement dans l'étape 2
router.get('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint GET /api/collections - À implémenter dans l\'étape 2',
    data: [],
    user: req.user.name // On peut accéder à l'utilisateur grâce au middleware protect
  });
});

// Route temporaire pour créer une collection
router.post('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint POST /api/collections - À implémenter dans l\'étape 2',
    receivedData: req.body
  });
});

// Route temporaire pour récupérer une collection spécifique
router.get('/:id', protect, (req, res) => {
  res.json({
    success: true,
    message: `Endpoint GET /api/collections/${req.params.id} - À implémenter dans l\'étape 2`,
    collectionId: req.params.id
  });
});

// Export du routeur pour utilisation dans app.js
module.exports = router;