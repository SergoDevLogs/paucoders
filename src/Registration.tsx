import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Marquee from 'react-fast-marquee';
import './Auth.css';

function Registration() {
  const [formData, setFormData] = useState({
    login: '',
    password: '',
    confirmPassword: '',
    birthDate: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    if (apiError) {
      setApiError('');
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.login.trim()) {
      newErrors.login = 'Логин обязателен';
    } else if (formData.login.length < 3) {
      newErrors.login = 'Логин должен быть не менее 3 символов';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.login)) {
      newErrors.login = 'Логин может содержать только буквы, цифры и подчеркивание';
    }

    if (!formData.password) {
      newErrors.password = 'Пароль обязателен';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Пароль должен быть не менее 6 символов';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Пароли не совпадают';
    }

    if (!formData.birthDate) {
      newErrors.birthDate = 'Дата рождения обязательна';
    } else {
      const birthDate = new Date(formData.birthDate);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age = age - 1;
      }
      if (age < 18) {
        newErrors.birthDate = 'Вам должно быть не менее 18 лет';
      }
    }

    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setApiError('');

    const result = await register(formData.login, formData.password, formData.birthDate);
    
    if (result.success) {
      navigate('/auth', { state: { message: 'Регистрация прошла успешно! Теперь вы можете войти.' } });
    } else {
      setApiError(result.error || 'Ошибка при регистрации');
    }
    
    setLoading(false);
  };

  const marqueeItems = [
    '📝 Регистрация нового пользователя',
    '🔐 Создайте надежный пароль',
    '🎂 Укажите дату рождения',
    '✨ Присоединяйтесь к нам!'
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
        <div className="auth-left registration-left">
          <div className="auth-left-content">
            <h1 className="auth-left-title">Присоединяйтесь к нам!</h1>
            <p className="auth-left-text">
              Создайте аккаунт и получите доступ ко всем возможностям системы
            </p>
            <div className="auth-features">
              <div className="auth-feature">
                <span className="feature-icon">🎯</span>
                <span>Персональные проекты</span>
              </div>
              <div className="auth-feature">
                <span className="feature-icon">📈</span>
                <span>Статистика и отчеты</span>
              </div>
              <div className="auth-feature">
                <span className="feature-icon">🤝</span>
                <span>Командная работа</span>
              </div>
              <div className="auth-feature">
                <span className="feature-icon">🎨</span>
                <span>Настройка интерфейса</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-form-container">
            <div className="auth-header">
              <h2 className="auth-title">Регистрация</h2>
              <p className="auth-subtitle">Создайте новый аккаунт</p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="login" className="form-label">
                  Логин
                </label>
                <input
                  type="text"
                  id="login"
                  name="login"
                  className={`form-input ${errors.login ? 'error' : ''}`}
                  value={formData.login}
                  onChange={handleChange}
                  placeholder="Придумайте логин (только буквы, цифры, _)"
                  required
                  disabled={loading}
                />
                {errors.login && (
                  <span className="field-error">{errors.login}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Пароль
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  className={`form-input ${errors.password ? 'error' : ''}`}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Придумайте пароль (мин. 6 символов)"
                  required
                  disabled={loading}
                />
                {errors.password && (
                  <span className="field-error">{errors.password}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword" className="form-label">
                  Подтвердите пароль
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Повторите пароль"
                  required
                  disabled={loading}
                />
                {errors.confirmPassword && (
                  <span className="field-error">{errors.confirmPassword}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="birthDate" className="form-label">
                  Дата рождения
                </label>
                <input
                  type="date"
                  id="birthDate"
                  name="birthDate"
                  className={`form-input ${errors.birthDate ? 'error' : ''}`}
                  value={formData.birthDate}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  max={new Date().toISOString().split('T')[0]}
                />
                {errors.birthDate && (
                  <span className="field-error">{errors.birthDate}</span>
                )}
              </div>

              {apiError && (
                <div className="auth-error">
                  <span className="error-icon">⚠️</span>
                  {apiError}
                </div>
              )}

              <button
                type="submit"
                className="auth-button registration-button"
                disabled={loading}
              >
                {loading ? (
                  <span className="loading-spinner">⏳</span>
                ) : (
                  'Зарегистрироваться'
                )}
              </button>

              <div className="auth-footer">
                <span>Уже есть аккаунт?</span>
                <Link to="/auth" className="auth-link">
                  Войти
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Registration;