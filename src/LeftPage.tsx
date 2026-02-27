import { Link } from 'react-router-dom';
import './Pages.css';

function LeftPage() {
  return (
    <div className="page left-page">
      <div className="page-header">
        <h1>⬅️ Левая страница</h1>
        <Link to="/" className="home-button">🏠 На главную</Link>
      </div>
      
      <div className="page-content">
        <div className="info-card">
          <h2>Информация о левой странице</h2>
          <p>Это левая страница нашего приложения. Здесь можно разместить любой контент.</p>
          
          <div className="feature-grid">
            <div className="feature-item">
              <span className="feature-icon">🎨</span>
              <h3>Дизайн</h3>
              <p>Уникальный дизайн для левой страницы</p>
            </div>
            
            <div className="feature-item">
              <span className="feature-icon">📊</span>
              <h3>Аналитика</h3>
              <p>Специальные данные для левой стороны</p>
            </div>
            
            <div className="feature-item">
              <span className="feature-icon">⚙️</span>
              <h3>Настройки</h3>
              <p>Конфигурация для левой панели</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LeftPage;