import { Link, useNavigate} from 'react-router-dom';
import './NotFound.css';

function NotFound() {
  const navigate = useNavigate();
  

  return (
    <div className="not-found-container">
      <div className="cyber-grid"></div>
      <div className="scan-line"></div>
      
      <div className="not-found-content">
        <div className="error-glitch">
          <h1 className="glitch-text" data-text="404">404</h1>
        </div>
        
        <h2 className="error-title">ДОСТУП ЗАПРЕЩЕН</h2>
        
        <div className="error-message">
          <p>Данная страница удалена либо не существует.</p>
          <p className="error-path">{window.location.pathname}</p>
        </div>
        
        <div className="error-actions">
          <Link to="/" className="cyber-button">
            <span className="button-text">Вернуться на главную</span>
            <span className="button-glitch"></span>
          </Link>
          
          <button onClick={() => navigate(-1)} className="cyber-button secondary">
            <span className="button-text">Назад</span>
            <span className="button-glitch"></span>
          </button>
        </div>
        
        <div className="error-code">
          <span>ERROR CODE: 0x404_NOT_FOUND</span>
        </div>
      </div>
    </div>
  );
}

export default NotFound;