import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Auth.css';
import Header from "./Header.tsx";
import Footer from "./Footer.tsx";

function Registration() {
    const [formData, setFormData] = useState({
        login: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState('');
    const navigate = useNavigate();
    const { isAuthenticated, register } = useAuth();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/profile');
        }
    }, [isAuthenticated, navigate]);

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

        const result = await register(formData.login, formData.password, '');

        if (result.success) {
            navigate('/profile', { state: { message: 'Регистрация прошла успешно! Добро пожаловать!' } });
        } else {
            setApiError(result.error || 'Ошибка при регистрации');
        }

        setLoading(false);
    };

    return (
        <div className="auth-page">
            <Header/>

            <div className="auth-container">
                <div className="auth-form-wrapper auth-form-wrapper-reg">
                    <div className="auth-header-form">
                        <h2 className="auth-title">Регистрация</h2>
                        <p className="auth-subtitle">Создайте новый аккаунт</p>
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="group-wrapper">
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
                                        placeholder="Придумайте логин"
                                        required
                                        disabled={loading}
                                    />
                                    {errors.login && (
                                        <span className="field-error">{errors.login}</span>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="email" className="form-label">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        className="form-input"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="Введите email"
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <div className="group-wrapper">
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
                                        placeholder="Придумайте пароль"
                                        required
                                        disabled={loading}
                                    />
                                    {errors.password && (
                                        <span className="field-error">{errors.password}</span>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="confirmPassword" className="form-label">
                                        Подтверждение пароля
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
                            </div>
                        </div>

                        {apiError && (
                            <div className="auth-error">
                                <span className="error-icon">⚠️</span>
                                {apiError}
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
                                'Зарегистрироваться'
                            )}
                        </button>

                        <div className="tabs">
                            <p>Уже есть аккаунт?</p>
                            <Link to="/auth" className="auth-tab">
                                Войти
                            </Link>
                        </div>
                    </form>
                </div>
            </div>

            <Footer/>
        </div>
    );
}

export default Registration;