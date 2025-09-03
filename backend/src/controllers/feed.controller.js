// Auteur : Gounadfa Achraf - SUPRSS Project
// Contrôleur pour la gestion des flux RSS

const Feed = require('../models/Feed.model');
const Collection = require('../models/Collection.model');
const Article = require('../models/Article.model');
const Message = require('../models/Message.model');
const { asyncHandler, AppError } = require('../middlewares/errorHandler');
const RSSParser = require('rss-parser');
const axios = require('axios');

// Initialiser le parser RSS avec configuration personnalisée
const parser = new RSSParser({
  customFields: {
    feed: ['language', 'copyright', 'lastBuildDate'],
    item: ['author', 'category', 'enclosure', 'media:content']
  },
  timeout: 10000, // 10 secondes de timeout
  headers: {
    'User-Agent': 'SUPRSS/1.0 (Feed Reader)'
  }
});

// Récupérer tous les flux d'une collection
// Cette fonction retourne les flux avec leurs statistiques
const getFeeds = asyncHandler(async (req, res, next) => {
  const { collectionId } = req.query;
  
  let query = {};
  
  if (collectionId) {
    // Vérifier l'accès à la collection
    const collection = await Collection.findById(collectionId);
    if (!collection) {
      return next(new AppError('Collection non trouvée', 404));
    }
    
    if (!collection.isMember(req.user._id)) {
      return next(new AppError('Accès non autorisé', 403));
    }
    
    query.collections = collectionId;
  } else {
    // Récupérer tous les flux accessibles à l'utilisateur
    const userCollections = await Collection.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ]
    }).select('_id');
    
    const collectionIds = userCollections.map(c => c._id);
    query.collections = { $in: collectionIds };
  }
  
  const feeds = await Feed.find(query)
    .populate('addedBy', 'name')
    .sort('name');
  
  res.status(200).json({
    success: true,
    count: feeds.length,
    data: feeds
  });
});

// Récupérer un flux spécifique
// Cette fonction vérifie les permissions avant de retourner le flux
const getFeed = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const feed = await Feed.findById(id)
    .populate('addedBy', 'name avatar')
    .populate('collections', 'name');
  
  if (!feed) {
    return next(new AppError('Flux non trouvé', 404));
  }
  
  // Vérifier l'accès
  const hasAccess = await feed.userHasAccess(req.user._id);
  if (!hasAccess) {
    return next(new AppError('Accès non autorisé à ce flux', 403));
  }
  
  res.status(200).json({
    success: true,
    data: feed
  });
});

// Ajouter un nouveau flux à une collection
// Cette fonction valide l'URL, parse le flux et l'ajoute à la collection
const addFeed = asyncHandler(async (req, res, next) => {
  const {
    url,
    name,
    description,
    collectionId,
    categories,
    updateFrequency = 60
  } = req.body;
  
  // Validation
  if (!url || !collectionId) {
    return next(new AppError('URL et collection requises', 400));
  }
  
  // Vérifier la collection et les permissions
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.isMember(req.user._id)) {
    return next(new AppError('Vous n\'êtes pas membre de cette collection', 403));
  }
  
  if (!collection.userHasPermission(req.user._id, 'canAddFeeds') &&
      collection.owner.toString() !== req.user._id.toString()) {
    return next(new AppError('Permissions insuffisantes pour ajouter des flux', 403));
  }
  
  // Vérifier si le flux existe déjà
  let feed = await Feed.findOne({ url });
  
  if (feed) {
    // Si le flux existe, l'ajouter simplement à la collection
    if (feed.collections.includes(collectionId)) {
      return next(new AppError('Ce flux est déjà dans cette collection', 409));
    }
    
    feed.collections.push(collectionId);
    await feed.save();
    
    // Ajouter à la collection
    collection.feeds.push(feed._id);
    await collection.save();
    
    return res.status(200).json({
      success: true,
      message: 'Flux existant ajouté à la collection',
      data: feed
    });
  }
  
  // Tester et parser le flux RSS
  try {
    console.log(`Tentative de parsing du flux: ${url}`);
    const feedData = await parser.parseURL(url);
    
    // Créer le nouveau flux
    feed = await Feed.create({
      url,
      name: name || feedData.title || 'Flux sans nom',
      description: description || feedData.description || '',
      websiteUrl: feedData.link || '',
      addedBy: req.user._id,
      collections: [collectionId],
      categories: categories || [],
      updateFrequency,
      metadata: {
        title: feedData.title,
        description: feedData.description,
        author: feedData.creator,
        language: feedData.language,
        copyright: feedData.copyright,
        lastBuildDate: feedData.lastBuildDate,
        imageUrl: feedData.image?.url || feedData.itunes?.image
      },
      status: 'active'
    });
    
    // Ajouter à la collection
    collection.feeds.push(feed._id);
    await collection.save();
    
    // Parser et stocker les articles initiaux
    const articlesToCreate = [];
    const itemsToProcess = feedData.items.slice(0, 20); // Limiter aux 20 derniers articles
    
    for (const item of itemsToProcess) {
      const existingArticle = await Article.findOne({ link: item.link });
      
      if (!existingArticle) {
        articlesToCreate.push({
          title: item.title || 'Sans titre',
          link: item.link || item.guid,
          guid: item.guid || item.link,
          feed: feed._id,
          collections: [collectionId],
          author: item.creator || item.author || 'Inconnu',
          content: item.content || '',
          summary: item.contentSnippet || item.description || '',
          contentHtml: item['content:encoded'] || item.content || '',
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          categories: item.categories || [],
          imageUrl: item.enclosure?.url || item['media:content']?.url
        });
      }
    }
    
    // Créer les articles en lot
    if (articlesToCreate.length > 0) {
      await Article.insertMany(articlesToCreate);
      
      // Mettre à jour les statistiques
      feed.stats.totalArticles = articlesToCreate.length;
      feed.lastFetchedAt = new Date();
      feed.nextFetchAt = new Date(Date.now() + updateFrequency * 60000);
      await feed.save();
    }
    
    // Message système si collection partagée
    if (collection.type === 'shared') {
      await Message.createSystemMessage(collection._id, 'feed_added', {
        userId: req.user._id,
        userName: req.user.name,
        feedName: feed.name
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Flux ajouté avec succès',
      data: {
        feed,
        articlesAdded: articlesToCreate.length
      }
    });
    
  } catch (error) {
    console.error('Erreur lors du parsing du flux:', error);
    return next(new AppError(`Impossible de parser le flux RSS: ${error.message}`, 400));
  }
});

// Mettre à jour un flux
// Cette fonction permet de modifier les paramètres d'un flux
const updateFeed = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;
  
  const feed = await Feed.findById(id);
  
  if (!feed) {
    return next(new AppError('Flux non trouvé', 404));
  }
  
  // Vérifier les permissions
  const hasAccess = await feed.userHasAccess(req.user._id);
  if (!hasAccess) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Empêcher la modification de certains champs
  delete updates.url;
  delete updates.addedBy;
  delete updates._id;
  delete updates.collections;
  
  // Mettre à jour
  Object.keys(updates).forEach(key => {
    feed[key] = updates[key];
  });
  
  await feed.save();
  
  res.status(200).json({
    success: true,
    message: 'Flux mis à jour avec succès',
    data: feed
  });
});

// Supprimer un flux d'une collection
// Cette fonction retire le flux de la collection sans le supprimer complètement
const removeFeed = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { collectionId } = req.body;
  
  if (!collectionId) {
    return next(new AppError('Collection requise', 400));
  }
  
  // Vérifier la collection et les permissions
  const collection = await Collection.findById(collectionId);
  if (!collection) {
    return next(new AppError('Collection non trouvée', 404));
  }
  
  if (!collection.userHasPermission(req.user._id, 'canRemoveFeeds') &&
      collection.owner.toString() !== req.user._id.toString()) {
    return next(new AppError('Permissions insuffisantes', 403));
  }
  
  const feed = await Feed.findById(id);
  if (!feed) {
    return next(new AppError('Flux non trouvé', 404));
  }
  
  // Retirer de la collection
  feed.collections = feed.collections.filter(c => c.toString() !== collectionId);
  collection.feeds = collection.feeds.filter(f => f.toString() !== id);
  
  await feed.save();
  await collection.save();
  
  // Si le flux n'est plus dans aucune collection, le supprimer
  if (feed.collections.length === 0) {
    await feed.remove();
  }
  
  // Retirer les articles de la collection
  await Article.updateMany(
    { feed: id },
    { $pull: { collections: collectionId } }
  );
  
  // Message système
  if (collection.type === 'shared') {
    await Message.createSystemMessage(collection._id, 'feed_removed', {
      userId: req.user._id,
      userName: req.user.name,
      feedName: feed.name
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Flux retiré de la collection'
  });
});

// Rafraîchir un flux manuellement
// Cette fonction force la mise à jour d'un flux RSS
const refreshFeed = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const feed = await Feed.findById(id);
  
  if (!feed) {
    return next(new AppError('Flux non trouvé', 404));
  }
  
  // Vérifier l'accès
  const hasAccess = await feed.userHasAccess(req.user._id);
  if (!hasAccess) {
    return next(new AppError('Accès non autorisé', 403));
  }
  
  // Parser le flux
  try {
    const feedData = await parser.parseURL(feed.url);
    
    let newArticlesCount = 0;
    const articlesToCreate = [];
    
    // Traiter chaque article
    for (const item of feedData.items.slice(0, 50)) {
      const existingArticle = await Article.findOne({
        $or: [
          { link: item.link },
          { guid: item.guid }
        ]
      });
      
      if (!existingArticle) {
        articlesToCreate.push({
          title: item.title || 'Sans titre',
          link: item.link || item.guid,
          guid: item.guid || item.link,
          feed: feed._id,
          collections: feed.collections,
          author: item.creator || item.author || 'Inconnu',
          content: item.content || '',
          summary: item.contentSnippet || item.description || '',
          contentHtml: item['content:encoded'] || item.content || '',
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          categories: item.categories || [],
          imageUrl: item.enclosure?.url
        });
        newArticlesCount++;
      }
    }
    
    // Créer les nouveaux articles
    if (articlesToCreate.length > 0) {
      await Article.insertMany(articlesToCreate);
    }
    
    // Mettre à jour le flux
    await feed.markAsFetched(newArticlesCount);
    
    // Mettre à jour les statistiques des collections
    for (const collectionId of feed.collections) {
      const collection = await Collection.findById(collectionId);
      if (collection) {
        await collection.updateStats();
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Flux rafraîchi avec succès',
      data: {
        feed,
        newArticles: newArticlesCount
      }
    });
    
  } catch (error) {
    // Marquer le flux en erreur
    await feed.markAsError(error.message);
    
    return next(new AppError(`Erreur lors du rafraîchissement: ${error.message}`, 500));
  }
});

// Rafraîchir tous les flux qui doivent être mis à jour
// Cette fonction est appelée par un cron job pour mettre à jour automatiquement les flux
const refreshAllFeeds = asyncHandler(async (req, res, next) => {
  // Cette fonction pourrait être restreinte aux admins ou appelée par un cron
  const feedsToUpdate = await Feed.findFeedsToUpdate();
  
  const results = {
    success: [],
    failed: []
  };
  
  for (const feed of feedsToUpdate) {
    try {
      const feedData = await parser.parseURL(feed.url);
      let newArticlesCount = 0;
      
      // Traiter les articles (logique similaire à refreshFeed)
      for (const item of feedData.items.slice(0, 20)) {
        const existingArticle = await Article.findOne({
          $or: [
            { link: item.link },
            { guid: item.guid }
          ]
        });
        
        if (!existingArticle) {
          await Article.create({
            title: item.title || 'Sans titre',
            link: item.link || item.guid,
            guid: item.guid || item.link,
            feed: feed._id,
            collections: feed.collections,
            author: item.creator || 'Inconnu',
            content: item.content || '',
            summary: item.contentSnippet || '',
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            categories: item.categories || []
          });
          newArticlesCount++;
        }
      }
      
      await feed.markAsFetched(newArticlesCount);
      results.success.push({
        feedId: feed._id,
        feedName: feed.name,
        newArticles: newArticlesCount
      });
      
    } catch (error) {
      await feed.markAsError(error.message);
      results.failed.push({
        feedId: feed._id,
        feedName: feed.name,
        error: error.message
      });
    }
  }
  
  res.status(200).json({
    success: true,
    message: 'Rafraîchissement terminé',
    data: results
  });
});

// Tester une URL de flux RSS
// Cette fonction vérifie qu'une URL est un flux RSS valide
const testFeed = asyncHandler(async (req, res, next) => {
  const { url } = req.body;
  
  if (!url) {
    return next(new AppError('URL requise', 400));
  }
  
  try {
    const feedData = await parser.parseURL(url);
    
    res.status(200).json({
      success: true,
      message: 'Flux RSS valide',
      data: {
        title: feedData.title,
        description: feedData.description,
        link: feedData.link,
        itemsCount: feedData.items.length,
        lastBuildDate: feedData.lastBuildDate,
        language: feedData.language
      }
    });
  } catch (error) {
    return next(new AppError(`URL invalide ou flux RSS non accessible: ${error.message}`, 400));
  }
});

// Obtenir des suggestions de flux populaires
// Cette fonction retourne une liste de flux RSS populaires ou recommandés
const getPopularFeeds = asyncHandler(async (req, res, next) => {
  const { limit = 10, category } = req.query;
  
  // Flux populaires prédéfinis (pourrait venir d'une base de données)
  const popularFeeds = [
    {
      name: 'Le Monde - À la Une',
      url: 'https://www.lemonde.fr/rss/une.xml',
      category: 'news',
      language: 'fr'
    },
    {
      name: 'France Info',
      url: 'https://www.francetvinfo.fr/titres.rss',
      category: 'news',
      language: 'fr'
    },
    {
      name: 'Korben',
      url: 'https://korben.info/feed',
      category: 'tech',
      language: 'fr'
    },
    {
      name: 'Journal du Hacker',
      url: 'https://www.journalduhacker.net/rss',
      category: 'tech',
      language: 'fr'
    },
    {
      name: 'Dev.to',
      url: 'https://dev.to/feed',
      category: 'tech',
      language: 'en'
    }
  ];
  
  let filtered = popularFeeds;
  if (category) {
    filtered = popularFeeds.filter(f => f.category === category);
  }
  
  res.status(200).json({
    success: true,
    data: filtered.slice(0, parseInt(limit))
  });
});

module.exports = {
  getFeeds,
  getFeed,
  addFeed,
  updateFeed,
  removeFeed,
  refreshFeed,
  refreshAllFeeds,
  testFeed,
  getPopularFeeds
};