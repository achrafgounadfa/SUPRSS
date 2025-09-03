import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert('Les mots de passe ne correspondent pas');
      return;
    }
    try {
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, confirmPassword })
      });
      const data = await response.json();
      if (data.success) {
        alert('Inscription réussie, vous pouvez vous connecter');
        navigate('/login');
      } else {
        alert(data.message || 'Erreur lors de l\'inscription');
      }
    } catch (error) {
      console.error(error);
      alert('Erreur lors de l\'inscription');
    }
  };

  return (
    <div className="auth-page">
      <div className="form-card">
        <h2 className="form-title">Inscription</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            className="input-field"
            placeholder="Nom complet"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="email"
            className="input-field"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="input-field"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="password"
            className="input-field"
            placeholder="Confirmer le mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <button type="submit" className="primary-btn">S'inscrire</button>
        </form>
        <p className="auth-link">
          Déjà inscrit ?{' '}
          <a href="#" onClick={() => navigate('/login')}>
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
}