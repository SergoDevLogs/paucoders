import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Auth.css';
import Header from "./Header.tsx";
import Footer from "./Footer.tsx";

function Auth() {
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { isAuthenticated, login: authLogin } = useAuth();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/profile');
        }
    }, [isAuthenticated, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const success = await authLogin(login, password);

            if (success) {
                navigate('/profile');
            } else {
                setError('Неверный логин или пароль');
            }
        } catch (err) {
            setError('Ошибка при входе. Попробуйте позже.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <Header/>

            <div className="auth-container">

                <div className="auth-form-wrapper">
                    <div className="auth-header-form">
                        <h2 className="auth-title">Вход в систему</h2>
                        <p className="auth-subtitle">Введите свои учетные данные</p>
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label htmlFor="login" className="form-label">
                                Логин или email
                            </label>
                            <input
                                type="text"
                                id="login"
                                className="form-input"
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                                placeholder="Введите логин или email"
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
                        <div className="tabs">
                            <p>Нет аккаунта?</p>
                            <Link to="/registration" className="auth-tab">
                                Регистрация
                            </Link>
                        </div>
                    </form>
                </div>
            </div>

            <Footer/>
        </div>
    );
}

export default Auth;