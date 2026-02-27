import { Link } from 'react-router-dom';
import './Pages.css';

function RightPage() {
  return (
    <div className="page right-page">
      <div className="page-header">
        <h1>➡️ Правая страница</h1>
        <Link to="/" className="home-button">🏠 На главную</Link>
      </div>
      
      <div className="page-content">
        <div className="info-card">
          <h2>Информация о правой странице</h2>
          <p>Это правая страница нашего приложения. Здесь тоже можно разместить контент.</p>
          
          <div className="stats-container">
            <div className="stat-box">
              <div className="stat-value">99%</div>
              <div className="stat-label">Эффективность</div>
            </div>
            
            <div className="stat-box">
              <div className="stat-value">24/7</div>
              <div className="stat-label">Доступность</div>
            </div>
            
            <div className="stat-box">
              <div className="stat-value">∞</div>
              <div className="stat-label">Возможности</div>
            </div>
          </div>
          
          <div className="progress-section">
            <h3>Прогресс правой страницы</h3>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: '75%' }}>75%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RightPage;