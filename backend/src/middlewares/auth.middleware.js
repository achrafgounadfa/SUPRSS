
// Middleware d'authentification et d'autorisation

const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

// Middleware pour protéger les routes nécessitant une authentification
// Cette fonction vérifie la présence et la validité du token JWT
const protect = async (req, res, next) => {
  try {
    let token;
    
    // Vérifier la présence du token dans le header Authorization
    // Format attendu : "Bearer <token>"
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Si aucun token n'est fourni, refuser l'accès
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Accès non autorisé - Token manquant'
      });
    }
    
    try {
      // Vérifier et décoder le token JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Récupérer l'utilisateur depuis la base de données
      // On exclut le mot de passe pour des raisons de sécurité
      const user = await User.findById(decoded.id)
        .select('-password')
        .populate('collections', 'name');
      
      // Vérifier que l'utilisateur existe et est actif
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non trouvé ou compte désactivé'
        });
      }
      
      // Vérifier si le compte est verrouillé
      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Compte temporairement verrouillé suite à trop de tentatives de connexion'
        });
      }
      
      // Attacher l'utilisateur à la requête pour les middlewares suivants
      req.user = user;
      next();
      
    } catch (error) {
      // Gérer les différents types d'erreurs JWT
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Token invalide'
        });
      } else if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expiré'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Erreur middleware protect:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification'
    });
  }
};

// Middleware pour vérifier les rôles d'utilisateur
// Permet de restreindre l'accès à certaines routes selon le rôle
const authorize = (...roles) => {
  return (req, res, next) => {
    // Vérifier que l'utilisateur est authentifié
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }
    
    // Vérifier que le rôle de l'utilisateur est autorisé
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Rôle ${req.user.role} non autorisé pour cette ressource`
      });
    }
    
    next();
  };
};

// Middleware optionnel pour récupérer l'utilisateur si un token est présent
// Utile pour les routes qui peuvent être publiques ou privées
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    
    // Vérifier la présence du token
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Si un token est présent, essayer de le valider
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        // Si l'utilisateur est trouvé et actif, l'attacher à la requête
        if (user && user.isActive) {
          req.user = user;
        }
      } catch (error) {
        // En cas d'erreur, on continue sans utilisateur
        console.log('Token invalide ou expiré, continuant sans authentification');
      }
    }
    
    next();
  } catch (error) {
    console.error('Erreur middleware optionalAuth:', error);
    next();
  }
};

// Middleware pour vérifier la propriété d'une ressource
// Vérifie que l'utilisateur est propriétaire de la ressource ou admin
const checkOwnership = (resourceField = 'userId') => {
  return async (req, res, next) => {
    try {
      // L'admin a accès à toutes les ressources
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Vérifier la propriété de la ressource
      const resourceOwnerId = req.resource?.[resourceField] || req.params.userId;
      
      if (!resourceOwnerId) {
        return res.status(400).json({
          success: false,
          message: 'Impossible de vérifier la propriété de la ressource'
        });
      }
      
      // Comparer l'ID de l'utilisateur avec l'ID du propriétaire
      if (req.user._id.toString() !== resourceOwnerId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à accéder à cette ressource'
        });
      }
      
      next();
    } catch (error) {
      console.error('Erreur middleware checkOwnership:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification de propriété'
      });
    }
  };
};

// Middleware pour limiter le taux de requêtes par utilisateur
// Utile pour prévenir les abus sur certaines routes sensibles
const userRateLimit = (maxRequests = 10, windowMinutes = 15) => {
  const requests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    
    // Nettoyer les anciennes entrées
    const userRequests = requests.get(userId) || [];
    const recentRequests = userRequests.filter(time => now - time < windowMs);
    
    // Vérifier la limite
    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: `Limite de ${maxRequests} requêtes par ${windowMinutes} minutes atteinte`
      });
    }
    
    // Ajouter la nouvelle requête
    recentRequests.push(now);
    requests.set(userId, recentRequests);
    
    next();
  };
};

module.exports = {
  protect,
  authorize,
  optionalAuth,
  checkOwnership,
  userRateLimit
};
