import { useState } from 'react';

/**
 * Liste des articles pour une collection donnée.
 *
 * Affiche chaque article avec son titre, sa date et son auteur, puis
 * propose des boutons pour marquer l'article comme lu/non lu et pour
 * l'ajouter/enlever des favoris. Lorsque l'état d'un article est
 * modifié, la fonction refresh est appelée pour mettre à jour la liste.
 */
export default function ArticleList({ articles, refresh }) {
  const token = localStorage.getItem('token');

  // Gère le marquage en lu/non lu d'un article
  const markRead = async (id, isRead) => {
    const method = isRead ? 'DELETE' : 'PUT';
    try {
      const response = await fetch(
        `http://localhost:5000/api/articles/${id}/read`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          // Pour marquer comme lu on peut envoyer readingTime=0, sinon pas de body
          body: !isRead ? JSON.stringify({ readingTime: 0 }) : undefined
        }
      );
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Erreur lors de la mise à jour de l\'article');
      } else if (refresh) {
        refresh();
      }
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la mise à jour de l\'article');
    }
  };

  // Gère l'ajout ou le retrait d'un favori
  const toggleFavorite = async (id, isFavorite) => {
    const method = isFavorite ? 'DELETE' : 'POST';
    try {
      const response = await fetch(
        `http://localhost:5000/api/articles/${id}/favorite`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Erreur lors de la mise à jour des favoris');
      } else if (refresh) {
        refresh();
      }
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la mise à jour des favoris');
    }
  };

  if (!articles || articles.length === 0) {
    return <p>Aucun article pour l'instant.</p>;
  }

  return (
    <ul className="articles-list">
      {articles.map((article) => {
        const pubDate = article.publishedAt
          ? new Date(article.publishedAt)
          : null;
        return (
          <li key={article._id}>
            <div>
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {article.title}
              </a>
              <div className="article-meta">
                {pubDate ? pubDate.toLocaleDateString() : ''}
                {article.author ? ` — ${article.author}` : ''}
              </div>
            </div>
            <div className="article-actions">
              <button onClick={() => markRead(article._id, article.isRead)}>
                {article.isRead ? 'Marquer non lu' : 'Marquer lu'}
              </button>
              <button onClick={() => toggleFavorite(article._id, article.isFavorite)}>
                {article.isFavorite ? 'Retirer des favoris' : 'Favori'}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}