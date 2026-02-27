import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Marquee from 'react-fast-marquee';
import './Auth.css';

function Auth() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, login: authLogin } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await authLogin(login, password);
      
      if (success) {
        navigate('/');
      } else {
        setError('Неверный логин или пароль');
      }
    } catch (err) {
      setError('Ошибка при входе. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  const marqueeItems = [
    '🔐 Вход в систему',
    '⚡ Добро пожаловать',
    '🚀 Конкурс проектов 2026',
    '✨ Используйте свои учетные данные'
  ];

  return (
    <div className="auth-page">
      <div className="marquee-container">
        <Marquee gradient={false} speed={40} pauseOnHover={true} className="marquee">
          {marqueeItems.map((item, index) => (
            <span key={index} className="marquee-item">
              {item}
              <span className="marquee-separator">✦</span>
            </span>
          ))}
        </Marquee>
      </div>

      <div className="auth-container">
        <div className="auth-left">
          <div className="auth-left-content">
            <h1 className="auth-left-title">Добро пожаловать!</h1>
            <p className="auth-left-text">
              Войдите в систему, чтобы получить доступ к управлению проектами
            </p>
            <div className="auth-features">
              <div className="auth-feature">
                <span className="feature-icon">🚀</span>
                <span>Управление проектами</span>
              </div>
              <div className="auth-feature">
                <span className="feature-icon">📊</span>
                <span>Аналитика в реальном времени</span>
              </div>
              <div className="auth-feature">
                <span className="feature-icon">🔒</span>
                <span>Безопасность данных</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-form-container">
            <div className="auth-header">
              <h2 className="auth-title">Вход в систему</h2>
              <p className="auth-subtitle">Введите свои учетные данные</p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="login" className="form-label">
                  Логин
                </label>
                <input
                  type="text"
                  id="login"
                  className="form-input"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Введите логин"
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Пароль
                </label>
                <input
                  type="password"
                  id="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="auth-error">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="auth-button"
                disabled={loading}
              >
                {loading ? (
                  <span className="loading-spinner">⏳</span>
                ) : (
                  'Войти'
                )}
              </button>

              <div className="auth-footer">
                <span>Нет аккаунта?</span>
                <Link to="/registration" className="auth-link">
                  Зарегистрироваться
                </Link>
              </div>
            </form>

            <div className="auth-demo">
              <p className="demo-text">
                <span className="demo-icon">💡</span>
                Зарегистрируйтесь или войдите с существующим аккаунтом
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Auth;