import { Link } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import './NotFound.css';

function NotFound() {
    return (
        <div className="auth-page">
            <Header />
            <div className="not-found-container">
                <div className="not-found-content">
                    <h1 className="not-found-title">404</h1>
                    <p className="not-found-text">Страница не найдена</p>
                    <Link to="/" className="not-found-button">
                        Вернуться на главную
                    </Link>
                </div>
            </div>
            <Footer />
        </div>
    );
}

export default NotFound;