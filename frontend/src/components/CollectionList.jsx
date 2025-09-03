import { useEffect, useState } from 'react';
import FeedForm from './FeedForm.jsx';
import ArticleList from './ArticleList.jsx';

/**
 * Affiche la liste des collections et, lorsqu'une collection est sélectionnée,
 * affiche la liste des flux associés et permet de filtrer les articles.
 * Les filtres disponibles correspondent aux paramètres supportés par l'API :
 * - Par flux (feed)
 * - Par statut de lecture (Tous, Non lus, Lus)
 * - Par favoris (Affichés uniquement si cochés)
 * - Par recherche plein texte
 * - Par tags/catégories
 */
export default function CollectionList({ collections }) {
  const token = localStorage.getItem('token');
  const [selected, setSelected] = useState(null);
  const [feeds, setFeeds] = useState([]);
  const [articles, setArticles] = useState([]);

  // États des filtres
  const [selectedFeed, setSelectedFeed] = useState('');
  const [isReadFilter, setIsReadFilter] = useState('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tagsFilter, setTagsFilter] = useState('');

  // Charge les flux et articles lors de la sélection d'une collection
  const selectCollection = async (collection) => {
    setSelected(collection);
    setSelectedFeed('');
    setIsReadFilter('all');
    setOnlyFavorites(false);
    setSearchTerm('');
    setTagsFilter('');
    try {
      // Récupérer les flux
      const resFeeds = await fetch(
        `http://localhost:5000/api/feeds?collectionId=${collection._id}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const dataFeeds = await resFeeds.json();
      if (dataFeeds.success) {
        setFeeds(dataFeeds.data);
      }
      // Charger les articles avec les filtres par défaut
      await loadArticles(collection._id);
    } catch (error) {
      console.error(error);
    }
  };

  // Construit l'URL de requête selon les filtres et récupère les articles
  const loadArticles = async (collectionId) => {
    if (!collectionId && selected) collectionId = selected._id;
    if (!collectionId) return;
    const params = new URLSearchParams();
    params.append('collectionId', collectionId);
    params.append('limit', 50);
    // Filtre flux
    if (selectedFeed) params.append('feedId', selectedFeed);
    // Filtre lecture
    if (isReadFilter === 'read') params.append('isRead', 'true');
    if (isReadFilter === 'unread') params.append('isRead', 'false');
    // Filtre favoris
    if (onlyFavorites) params.append('isFavorite', 'true');
    // Filtre recherche
    if (searchTerm) params.append('search', searchTerm);
    // Filtre tags
    if (tagsFilter) params.append('categories', tagsFilter);
    try {
      const resArticles = await fetch(
        `http://localhost:5000/api/articles?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const dataArticles = await resArticles.json();
      if (dataArticles.success) {
        setArticles(dataArticles.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Rafraîchir les données lors des changements de filtres
  useEffect(() => {
    if (selected) {
      loadArticles(selected._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeed, isReadFilter, onlyFavorites, searchTerm, tagsFilter]);

  const refreshSelected = () => {
    if (selected) {
      // Recharger flux et articles après ajout d'un flux ou modification d'un article
      selectCollection(selected);
    }
  };

  return (
    <div className="collections-container">
      {/* Liste des collections */}
      <ul className="collections-list">
        {collections.map((c) => (
          <li key={c._id}>
            <button
              className={selected && selected._id === c._id ? 'selected' : ''}
              onClick={() => selectCollection(c)}
            >
              {c.name} ({c.stats ? c.stats.totalArticles : 0})
            </button>
          </li>
        ))}
      </ul>
      {/* Détails de la collection sélectionnée */}
      {selected && (
        <div className="collection-detail">
          <h3>{selected.name}</h3>
          {/* Informations sur la collection */}
          {selected.description && <p>{selected.description}</p>}
          {/* Formulaire d'ajout de flux */}
          <div className="feed-form-section">
            <h4>Ajouter un flux</h4>
            <FeedForm collectionId={selected._id} onFeedAdded={refreshSelected} />
          </div>
          {/* Liste des flux */}
          {feeds && feeds.length > 0 && (
            <div className="feeds-section">
              <h4>Flux</h4>
              <ul className="feeds-list">
                <li key="all">
                  <button
                    className={!selectedFeed ? 'selected' : ''}
                    onClick={() => setSelectedFeed('')}
                  >
                    Tous les flux
                  </button>
                </li>
                {feeds.map((f) => (
                  <li key={f._id}>
                    <button
                      className={selectedFeed === f._id ? 'selected' : ''}
                      onClick={() => setSelectedFeed(f._id)}
                    >
                      {f.name || f.url}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Filtres */}
          <div className="filters-section">
            <h4>Filtres des articles</h4>
            <div className="filter-item">
              <label htmlFor="searchTerm">Recherche :</label>
              <input
                id="searchTerm"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher dans les titres ou contenus"
              />
            </div>
            <div className="filter-item">
              <label htmlFor="statusFilter">Statut :</label>
              <select
                id="statusFilter"
                value={isReadFilter}
                onChange={(e) => setIsReadFilter(e.target.value)}
              >
                <option value="all">Tous</option>
                <option value="unread">Non lus</option>
                <option value="read">Lus</option>
              </select>
            </div>
            <div className="filter-item">
              <label>
                <input
                  type="checkbox"
                  checked={onlyFavorites}
                  onChange={(e) => setOnlyFavorites(e.target.checked)}
                />{' '}
                Favoris seulement
              </label>
            </div>
            <div className="filter-item">
              <label htmlFor="tagsFilter">Tags/Catégories :</label>
              <input
                id="tagsFilter"
                type="text"
                value={tagsFilter}
                onChange={(e) => setTagsFilter(e.target.value)}
                placeholder="Séparés par des virgules"
              />
            </div>
          </div>
          {/* Liste des articles */}
          <div className="articles-section">
            <h4>Articles</h4>
            <ArticleList articles={articles} refresh={refreshSelected} />
          </div>
        </div>
      )}
    </div>
  );
}