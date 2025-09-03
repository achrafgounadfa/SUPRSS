// Auteur : Gounadfa Achraf - SUPRSS Project
// Routes pour la gestion des flux RSS (temporaire - étape 1)

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth.middleware');

// Route temporaire pour récupérer tous les flux RSS
// Cette route sera implémentée complètement dans l'étape 2
router.get('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint GET /api/feeds - À implémenter dans l\'étape 2',
    data: [],
    user: req.user.name
  });
});

// Route temporaire pour ajouter un nouveau flux RSS
router.post('/', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint POST /api/feeds - À implémenter dans l\'étape 2',
    receivedData: req.body
  });
});

// Route temporaire pour récupérer un flux spécifique
router.get('/:id', protect, (req, res) => {
  res.json({
    success: true,
    message: `Endpoint GET /api/feeds/${req.params.id} - À implémenter dans l\'étape 2`,
    feedId: req.params.id
  });
});

// Route temporaire pour mettre à jour un flux
router.put('/:id', protect, (req, res) => {
  res.json({
    success: true,
    message: `Endpoint PUT /api/feeds/${req.params.id} - À implémenter dans l\'étape 2`,
    feedId: req.params.id,
    receivedData: req.body
  });
});

// Route temporaire pour supprimer un flux
router.delete('/:id', protect, (req, res) => {
  res.json({
    success: true,
    message: `Endpoint DELETE /api/feeds/${req.params.id} - À implémenter dans l\'étape 2`,
    feedId: req.params.id
  });
});

// Export du routeur pour utilisation dans app.js
module.exports = router;