import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CollectionList from '../components/CollectionList.jsx';

export default function Dashboard() {
  const [collections, setCollections] = useState([]);
  // Champs pour la création d'une collection
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [tags, setTags] = useState('');
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const fetchCollections = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/collections', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setCollections(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
    } else {
      fetchCollections();
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Préparer le corps de la requête avec toutes les informations
      const body = {
        name,
        description,
        visibility
      };
      if (tags) {
        body.tags = tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
      }
      const response = await fetch('http://localhost:5000/api/collections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (data.success) {
        // Réinitialiser les champs et rafraîchir la liste
        setName('');
        setDescription('');
        setVisibility('private');
        setTags('');
        fetchCollections();
      } else {
        alert(data.message || 'Erreur lors de la création de la collection');
      }
    } catch (error) {
      console.error(error);
      alert('Erreur lors de la création de la collection');
    }
  };

  return (
    <>
      {/* Barre de navigation avec titre et déconnexion */}
      <header className="dashboard-header">
        <h1>SUPRSS</h1>
        <button
          onClick={() => {
            localStorage.removeItem('token');
            navigate('/login');
          }}
        >
          Déconnexion
        </button>
      </header>
      {/* Conteneur principal du tableau de bord */}
      <div className="dashboard-container">
        <div className="collections-section">
          <h2>Mes collections</h2>
          {/* Formulaire de création de collection avec champs avancés */}
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Nom de la collection"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Description (optionnel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="private">Privée</option>
              <option value="public">Publique</option>
              <option value="shared">Partagée</option>
            </select>
            <input
              type="text"
              placeholder="Tags (séparés par des virgules)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <button type="submit">Créer</button>
          </form>
          <CollectionList collections={collections} />
        </div>
      </div>
    </>
  );
}