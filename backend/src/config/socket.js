// Auteur : Gounadfa Achraf - SUPRSS Project
// Configuration de Socket.io pour la messagerie temps réel

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const Collection = require('../models/Collection.model');
const Message = require('../models/Message.model');

// Configuration et initialisation de Socket.io
// Cette fonction configure les événements et la logique temps réel
const configureSocketIO = (server) => {
  // Initialiser Socket.io avec configuration CORS
  const io = socketIO(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  // Middleware d'authentification pour Socket.io
  // Vérifie le token JWT avant d'autoriser la connexion
  io.use(async (socket, next) => {
    try {
      // Récupérer le token depuis le handshake
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication requise'));
      }
      
      // Vérifier et décoder le token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Récupérer l'utilisateur
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user || !user.isActive) {
        return next(new Error('Utilisateur non autorisé'));
      }
      
      // Attacher l'utilisateur au socket
      socket.userId = user._id.toString();
      socket.user = user;
      
      next();
    } catch (error) {
      console.error('Erreur authentification Socket.io:', error);
      next(new Error('Token invalide'));
    }
  });
  
  // Gestion des connexions
  io.on('connection', (socket) => {
    console.log(`Utilisateur connecté: ${socket.user.name} (${socket.userId})`);
    
    // Rejoindre la room personnelle de l'utilisateur
    socket.join(`user_${socket.userId}`);
    
    // ========================================
    // Événements de gestion des collections
    // ========================================
    
    // Rejoindre les rooms des collections
    socket.on('join_collections', async () => {
      try {
        // Récupérer toutes les collections de l'utilisateur
        const collections = await Collection.find({
          $or: [
            { owner: socket.userId },
            { 'members.user': socket.userId }
          ],
          isActive: true
        }).select('_id');
        
        // Rejoindre chaque room de collection
        for (const collection of collections) {
          socket.join(`collection_${collection._id}`);
          console.log(`${socket.user.name} a rejoint la collection ${collection._id}`);
        }
        
        // Confirmer la jonction
        socket.emit('collections_joined', {
          collections: collections.map(c => c._id)
        });
        
      } catch (error) {
        console.error('Erreur join_collections:', error);
        socket.emit('error', { message: 'Erreur lors de la jonction aux collections' });
      }
    });
    
    // Rejoindre une collection spécifique
    socket.on('join_collection', async (collectionId) => {
      try {
        // Vérifier l'accès à la collection
        const collection = await Collection.findById(collectionId);
        
        if (!collection || !collection.isMember(socket.userId)) {
          return socket.emit('error', { message: 'Accès non autorisé à cette collection' });
        }
        
        socket.join(`collection_${collectionId}`);
        
        // Notifier les autres membres
        socket.to(`collection_${collectionId}`).emit('user_joined', {
          user: {
            id: socket.userId,
            name: socket.user.name,
            avatar: socket.user.avatar
          }
        });
        
        // Récupérer les derniers messages
        const recentMessages = await Message.getCollectionMessages(collectionId, {
          limit: 50
        });
        
        socket.emit('collection_joined', {
          collectionId,
          messages: recentMessages
        });
        
      } catch (error) {
        console.error('Erreur join_collection:', error);
        socket.emit('error', { message: 'Erreur lors de la jonction à la collection' });
      }
    });
    
    // Quitter une collection
    socket.on('leave_collection', (collectionId) => {
      socket.leave(`collection_${collectionId}`);
      
      // Notifier les autres membres
      socket.to(`collection_${collectionId}`).emit('user_left', {
        userId: socket.userId
      });
    });
    
    // ========================================
    // Événements de messagerie
    // ========================================
    
    // Envoi de message
    socket.on('send_message', async (data) => {
      try {
        const { collectionId, content, type = 'text', attachments, mentions, replyTo } = data;
        
        // Vérifier l'accès
        const collection = await Collection.findById(collectionId);
        if (!collection || !collection.isMember(socket.userId)) {
          return socket.emit('error', { message: 'Accès non autorisé' });
        }
        
        // Créer le message
        const message = await Message.create({
          collection: collectionId,
          sender: socket.userId,
          content,
          type,
          attachments: attachments || [],
          mentions: mentions || [],
          replyTo: replyTo || null
        });
        
        // Populer les références
        await message.populate([
          { path: 'sender', select: 'name avatar' },
          { path: 'mentions', select: 'name' },
          { path: 'replyTo', select: 'content sender' }
        ]);
        
        // Émettre à tous les membres de la collection
        io.to(`collection_${collectionId}`).emit('new_message', message);
        
        // Notifier les utilisateurs mentionnés
        if (mentions && mentions.length > 0) {
          mentions.forEach(userId => {
            io.to(`user_${userId}`).emit('mention_notification', {
              message,
              collection: collection.name
            });
          });
        }
        
      } catch (error) {
        console.error('Erreur send_message:', error);
        socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
      }
    });
    
    // Indicateur de frappe
    socket.on('typing_start', (data) => {
      const { collectionId } = data;
      
      socket.to(`collection_${collectionId}`).emit('user_typing', {
        userId: socket.userId,
        userName: socket.user.name
      });
    });
    
    socket.on('typing_stop', (data) => {
      const { collectionId } = data;
      
      socket.to(`collection_${collectionId}`).emit('user_stopped_typing', {
        userId: socket.userId
      });
    });
    
    // Marquer un message comme lu
    socket.on('mark_as_read', async (data) => {
      try {
        const { messageId } = data;
        
        const message = await Message.findById(messageId);
        if (!message) return;
        
        await message.markAsRead(socket.userId);
        
        // Notifier l'expéditeur que son message a été lu
        io.to(`user_${message.sender}`).emit('message_read', {
          messageId,
          readBy: socket.userId
        });
        
      } catch (error) {
        console.error('Erreur mark_as_read:', error);
      }
    });
    
    // Réaction à un message
    socket.on('add_reaction', async (data) => {
      try {
        const { messageId, emoji } = data;
        
        const message = await Message.findById(messageId);
        if (!message) return;
        
        await message.addReaction(socket.userId, emoji);
        
        // Émettre à tous les membres
        io.to(`collection_${message.collection}`).emit('reaction_added', {
          messageId,
          userId: socket.userId,
          emoji
        });
        
      } catch (error) {
        console.error('Erreur add_reaction:', error);
      }
    });
    
    // Suppression d'un message
    socket.on('delete_message', async (data) => {
      try {
        const { messageId } = data;
        
        const message = await Message.findById(messageId);
        if (!message) return;
        
        // Vérifier les permissions
        if (message.sender.toString() !== socket.userId) {
          return socket.emit('error', { message: 'Permissions insuffisantes' });
        }
        
        await message.softDelete(socket.userId);
        
        // Notifier tous les membres
        io.to(`collection_${message.collection}`).emit('message_deleted', {
          messageId
        });
        
      } catch (error) {
        console.error('Erreur delete_message:', error);
      }
    });
    
    // ========================================
    // Événements de présence et statut
    // ========================================
    
    // Mise à jour du statut en ligne
    socket.on('update_status', async (status) => {
      try {
        // Mettre à jour le statut dans la base
        await User.findByIdAndUpdate(socket.userId, {
          onlineStatus: status,
          lastSeen: new Date()
        });
        
        // Diffuser aux autres utilisateurs
        socket.broadcast.emit('user_status_changed', {
          userId: socket.userId,
          status
        });
        
      } catch (error) {
        console.error('Erreur update_status:', error);
      }
    });
    
    // Récupérer les utilisateurs en ligne
    socket.on('get_online_users', async (collectionId) => {
      try {
        const room = io.sockets.adapter.rooms.get(`collection_${collectionId}`);
        const socketIds = room ? Array.from(room) : [];
        
        const onlineUsers = [];
        for (const socketId of socketIds) {
          const userSocket = io.sockets.sockets.get(socketId);
          if (userSocket && userSocket.user) {
            onlineUsers.push({
              id: userSocket.userId,
              name: userSocket.user.name,
              avatar: userSocket.user.avatar
            });
          }
        }
        
        socket.emit('online_users', {
          collectionId,
          users: onlineUsers
        });
        
      } catch (error) {
        console.error('Erreur get_online_users:', error);
      }
    });
    
    // ========================================
    // Événements de notification
    // ========================================
    
    // Notification de nouvel article
    socket.on('new_article_notification', async (data) => {
      try {
        const { collectionId, feedName, articlesCount } = data;
        
        // Émettre à tous les membres de la collection
        io.to(`collection_${collectionId}`).emit('new_articles_available', {
          feedName,
          count: articlesCount
        });
        
      } catch (error) {
        console.error('Erreur new_article_notification:', error);
      }
    });
    
    // ========================================
    // Gestion de la déconnexion
    // ========================================
    
    socket.on('disconnect', async () => {
      console.log(`Utilisateur déconnecté: ${socket.user.name}`);
      
      // Mettre à jour le statut
      await User.findByIdAndUpdate(socket.userId, {
        onlineStatus: 'offline',
        lastSeen: new Date()
      });
      
      // Notifier les autres utilisateurs
      socket.broadcast.emit('user_disconnected', {
        userId: socket.userId
      });
    });
    
    // Gestion des erreurs
    socket.on('error', (error) => {
      console.error('Erreur Socket.io:', error);
    });
  });
  
  // Fonction pour émettre depuis l'extérieur
  io.emitToCollection = (collectionId, event, data) => {
    io.to(`collection_${collectionId}`).emit(event, data);
  };
  
  io.emitToUser = (userId, event, data) => {
    io.to(`user_${userId}`).emit(event, data);
  };
  
  return io;
};

module.exports = configureSocketIO;