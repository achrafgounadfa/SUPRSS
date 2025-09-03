
// SUPRSS - Application backend (Express + Mongoose)
// Auteur : Gounadfa Achraf
// Description : Point d'entrée de l'API REST

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('passport');
const rateLimit = require('express-rate-limit');

// Charger les variables d'environnement
require('dotenv').config();

// -------------------------------------------------------------
// Enregistrement des modèles AU DÉMARRAGE
// (évite "MissingSchemaError: Schema hasn't been registered ...")
// -------------------------------------------------------------
require('./models/User.model');
require('./models/Collection.model');
require('./models/Feed.model');
require('./models/Article.model');
require('./models/Comment.model');
require('./models/Message.model');

// -------------------------------------------------------------
// Import des routes
// -------------------------------------------------------------
const authRoutes = require('./routes/auth.routes');
const collectionRoutes = require('./routes/collection.routes');
const feedRoutes = require('./routes/feed.routes');
const articleRoutes = require('./routes/article.routes');

// -------------------------------------------------------------
// Import middlewares & config
// -------------------------------------------------------------
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { configurePassport } = require('./config/passport');

// Import de la configuration Socket.io
const socketModule = require('./config/socket');
const configureSocketIO = socketModule.configureSocketIO || socketModule;

// -------------------------------------------------------------
// Initialisation de l'application Express
// -------------------------------------------------------------
const app = express();

// -------------------------------------------------------------
// Connexion MongoDB
// -------------------------------------------------------------
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log(' MongoDB connecté avec succès');
  } catch (error) {
    console.error(' Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

// -------------------------------------------------------------
// Sécurité / CORS / Parsing / Logs
// -------------------------------------------------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                 // 100 requêtes par fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'
});

const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// -------------------------------------------------------------
// Passport (JWT + OAuth)
// -------------------------------------------------------------
app.use(passport.initialize());
configurePassport(passport);

// -------------------------------------------------------------
// Routes
// -------------------------------------------------------------
// Limiter appliqué uniquement sur l'authentification
app.use('/api/auth', limiter);
app.use('/api/auth', authRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/feeds', feedRoutes);
app.use('/api/articles', articleRoutes);

// -------------------------------------------------------------
// Routes de santé & racine
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SUPRSS API is running',
    timestamp: new Date().toISOString(),
    author: 'Gounadfa Achraf'
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'SUPRSS Backend API',
    version: '1.0.0',
    description: 'Système de gestion de flux RSS',
    author: 'Gounadfa Achraf',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      collections: '/api/collections',
      feeds: '/api/feeds',
      articles: '/api/articles'
    }
  });
});

// -------------------------------------------------------------
// 404 & Gestion centralisée des erreurs
// -------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// -------------------------------------------------------------
// Démarrage + Arrêt propre du serveur (+ Socket.io)
// -------------------------------------------------------------
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    
    // Démarrer le serveur et conserver la référence
    const server = app.listen(PORT, () => {
      console.log(` Serveur SUPRSS démarré sur le port ${PORT}`);
      console.log(` Environnement: ${process.env.NODE_ENV || 'development'}`);
      console.log(` Auteur: Gounadfa Achraf`);
    });

    // Initialiser Socket.io pour la messagerie temps réel
    configureSocketIO(server);
    
    // Arrêt propre (SIGTERM / SIGINT)
    const gracefulShutdown = (signal) => {
      console.log(`${signal} signal reçu : fermeture du serveur HTTP`);
      server.close(() => {
        console.log('Serveur HTTP fermé');
        mongoose.connection.close(false, () => {
          console.log(' Connexion MongoDB fermée');
          process.exit(0);
        });
      });
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error(' Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
