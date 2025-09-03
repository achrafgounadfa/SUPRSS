// Middleware de gestion centralisée des erreurs

// Classe personnalisée pour les erreurs de l'application
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Middleware principal de gestion des erreurs
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  if (process.env.NODE_ENV === 'development') {
    console.error('Erreur détaillée:', err);
  }

  if (err.name === 'CastError') {
    error = new AppError('Ressource non trouvée', 404);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new AppError(`Cette valeur de ${field} existe déjà`, 400);
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    error = new AppError(messages.join('. '), 400);
  }

  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Token invalide', 401);
  }

  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token expiré', 401);
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    error = new AppError('Fichier trop volumineux', 400);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = new AppError('Type de fichier non autorisé', 400);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Erreur serveur',
    ...(process.env.NODE_ENV === 'development' && {
      error: err,
      stack: err.stack
    })
  });
};

// Middleware pour les routes non trouvées
const notFound = (req, res, next) => {
  const error = new AppError(`Route non trouvée - ${req.originalUrl}`, 404);
  next(error);
};

// Wrapper pour éviter try/catch partout
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation des requêtes avec express-validator
const validateRequest = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    const { validationResult } = require('express-validator');
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        }))
      });
    }

    next();
  };
};

// Logger d'erreurs
const errorLogger = (err, req, res, next) => {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    user: req.user?._id,
    error: {
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode
    }
  };

  if (process.env.NODE_ENV === 'production') {
    // Exemple : envoyer vers Sentry ou un logger
  } else {
    console.error('Erreur:', errorInfo);
  }

  next(err);
};

// Classes d'erreurs spécifiques
class ValidationError extends AppError {
  constructor(errors) {
    super('Erreur de validation', 422);
    this.errors = errors;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentification requise') {
    super(message, 401);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Accès non autorisé') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Ressource') {
    super(`${resource} non trouvée`, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflit de données') {
    super(message, 409);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Requête incorrecte') {
    super(message, 400);
  }
}

module.exports = {
  errorHandler,
  notFound,
  asyncHandler,
  validateRequest,
  errorLogger,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BadRequestError
};
