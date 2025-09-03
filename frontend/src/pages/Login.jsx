import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        navigate('/');
      } else {
        alert(data.message || 'Erreur lors de la connexion');
      }
    } catch (error) {
      console.error(error);
      alert('Erreur lors de la connexion');
    }
  };

  return (
    <div className="auth-page">
      <div className="form-card">
        <h2 className="form-title">Connexion</h2>
        <form onSubmit={handleSubmit}>
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
          <button type="submit" className="primary-btn">
            Se connecter
          </button>
        </form>
        <p className="auth-link">
          Pas encore de compte ?{' '}
          <a href="#" onClick={() => navigate('/register')}>
            S'inscrire
          </a>
        </p>
      </div>
    </div>
  );
}