import { useState } from 'react';

/**
 * Formulaire d'ajout de flux RSS.
 *
 * Ce composant permet à un utilisateur d'ajouter un nouveau flux à une
 * collection donnée. L'utilisateur peut renseigner un titre (facultatif),
 * l'URL du flux (obligatoire), des catégories séparées par des virgules
 * et une fréquence de mise à jour en minutes. Une fois le flux ajouté,
 * la fonction onFeedAdded est appelée pour rafraîchir la liste des flux
 * et des articles.
 */
export default function FeedForm({ collectionId, onFeedAdded }) {
  // Champs du formulaire
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  // tags correspond à "Catégories/Tags" mentionnés dans le cahier des charges
  const [tags, setTags] = useState('');
  const [updateFrequency, setUpdateFrequency] = useState(60);

  const token = localStorage.getItem('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Préparer le corps de la requête
    const body = { url, collectionId };
    if (name) body.name = name;
    if (description) body.description = description;
    if (tags) {
      // Convertir la chaîne de tags en tableau de chaînes, trim et filtre vides
      body.categories = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }
    if (updateFrequency) {
      body.updateFrequency = parseInt(updateFrequency, 10);
    }
    try {
      const response = await fetch('http://localhost:5000/api/feeds', {
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
        setUrl('');
        setDescription('');
        setTags('');
        setUpdateFrequency(60);
        if (onFeedAdded) onFeedAdded();
      } else {
        alert(data.message || 'Erreur lors de l\'ajout du flux');
      }
    } catch (err) {
      console.error(err);
      alert('Erreur lors de l\'ajout du flux');
    }
  };

  return (
    <div className="feed-form">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Nom du flux (optionnel)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="url"
          placeholder="URL du flux"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Description (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          type="text"
          placeholder="Tags/Catégories (séparés par des virgules)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <input
          type="number"
          placeholder="Fréquence (minutes)"
          value={updateFrequency}
          min={1}
          onChange={(e) => setUpdateFrequency(e.target.value)}
        />
        <button type="submit">Ajouter le flux</button>
      </form>
    </div>
  );
}