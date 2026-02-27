import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Marquee from 'react-fast-marquee';
import Slider from 'react-slick';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';
import LeftPage from './LeftPage';
import RightPage from './RightPage';
import Auth from './Auth';
import Registration from './Registration';
import NotFound from './NotFound';
import ProtectedRoute from './ProtectedRoute';
import MlPage from './MlPage';
import * as process from "node:process";

interface Message {
  id: number;
  text: string;
  created_at: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const DEEPSEEK_API_KEY = process.env("DEEPSEEK_API_KEY")
const DEEPSEEK_API_URL = process.env("DEEPSEEK_API_URL")
const DEEPSEEK_MODEL = process.env("DEEPSEEK_MODEL")

function DeepSeekChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      role: 'assistant', 
      content: 'Привет! Я помощник на базе DeepSeek R1. Могу ответить на вопросы или помочь с оценкой стоимости квартиры! Просто спросите "оценить квартиру" или задайте любой вопрос. 🏠' 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  
  const [priceFeatures, setPriceFeatures] = useState({
    area: '',
    rooms: '',
    floor: '',
    total_floors: '',
    year_built: '',
    distance_to_metro: '',
    district: 'центр',
    renovation: 'евро'
  });
  const [pricePrediction, setPricePrediction] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    setMessages(prev => [...prev, { role, content }]);
  };

  const askDeepSeek = async (question: string): Promise<string> => {
    try {
      const messageHistory = messages.slice(-10).map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }));

      messageHistory.push({
        role: 'user',
        content: question
      });

      console.log('Отправка запроса к DeepSeek API...');
      
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: messageHistory,
          temperature: 0.7,
          max_tokens: 2000,
          top_p: 0.95,
          frequency_penalty: 0,
          presence_penalty: 0,
          stream: false
        })
      });

      console.log('Статус ответа:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('DeepSeek API error response:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText };
        }
        
        if (response.status === 401) {
          return `❌ Ошибка авторизации (401). Проверьте правильность API ключа. Детали: ${errorData.message || 'Неизвестная ошибка'}`;
        } else if (response.status === 403) {
          return '❌ Доступ запрещен (403). Возможно, у вас нет прав для использования этой модели.';
        } else if (response.status === 429) {
          return '❌ Превышен лимит запросов. Попробуйте позже.';
        } else if (response.status === 402) {
          return '❌ Недостаточно средств на счету. Пополните баланс аккаунта.';
        } else if (response.status === 404) {
          return `❌ Модель не найдена (404). Проверьте название модели: ${DEEPSEEK_MODEL}`;
        }
        
        throw new Error(`API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('Успешный ответ от API:', data);
      
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
      } else {
        return '❌ Не удалось получить ответ от API: неверный формат ответа';
      }
    } catch (error) {
      console.error('DeepSeek API error:', error);
      throw error;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput('');
    addMessage('user', userMessage);
    setLoading(true);

    try {
      if (userMessage.toLowerCase().includes('квартир') || 
          userMessage.toLowerCase().includes('цена') || 
          userMessage.toLowerCase().includes('стоимо') ||
          userMessage.toLowerCase().includes('оцен')) {
        setShowPriceForm(true);
        addMessage('assistant', 'Давайте оценим стоимость квартиры! Заполните форму ниже 👇\n\nЯ передам эти данные в нашу ML модель для точного расчета.');
        setLoading(false);
        return;
      }

      const answer = await askDeepSeek(userMessage);
      addMessage('assistant', answer);
    } catch (error) {
      console.error('DeepSeek error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      addMessage('assistant', `❌ Ошибка при обращении к DeepSeek API: ${errorMessage}\n\nНо вы можете оценить квартиру с помощью формы ниже!`);
      
      if (userMessage.toLowerCase().includes('квартир') || 
          userMessage.toLowerCase().includes('цена') || 
          userMessage.toLowerCase().includes('стоимо')) {
        setShowPriceForm(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePriceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPriceLoading(true);
    setPricePrediction(null);

    try {
      const features = {
        area: parseFloat(priceFeatures.area),
        rooms: parseInt(priceFeatures.rooms),
        floor: parseInt(priceFeatures.floor),
        total_floors: parseInt(priceFeatures.total_floors),
        year_built: parseInt(priceFeatures.year_built),
        distance_to_metro: parseFloat(priceFeatures.distance_to_metro),
        district: priceFeatures.district,
        renovation: priceFeatures.renovation
      };

      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features })
      });

      const data = await response.json();
      
      if (data.success) {
        setPricePrediction(data.prediction);
        addMessage('assistant', `🏠 **Результат оценки:**\n\nПримерная стоимость квартиры: **${formatPrice(data.prediction)}**\n\nПараметры:\n- Площадь: ${features.area} м²\n- Комнат: ${features.rooms}\n- Этаж: ${features.floor}/${features.total_floors}\n- Год постройки: ${features.year_built}\n- До метро: ${features.distance_to_metro} мин\n- Район: ${features.district}\n- Ремонт: ${features.renovation}`);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      addMessage('assistant', '❌ Ошибка при оценке. Проверьте введенные данные и попробуйте ещё раз.');
    } finally {
      setPriceLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  const handlePriceInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPriceFeatures(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="deepseek-chat">
      <h2>🤖 Умный помощник (DeepSeek R1)</h2>
      <p className="chat-description">
        Задайте любой вопрос или попросите оценить квартиру
      </p>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.role}`}>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
        {loading && <div className="chat-message assistant">🤔 Думаю...</div>}
      </div>

      {showPriceForm && (
        <div className="price-form-container">
          <h3>🏠 Оценка стоимости квартиры</h3>
          <p className="form-hint">Заполните форму для точного расчета через ML модель</p>
          <form onSubmit={handlePriceSubmit} className="price-form">
            <div className="price-form-grid">
              <input
                type="number"
                name="area"
                placeholder="Площадь (м²)"
                value={priceFeatures.area}
                onChange={handlePriceInputChange}
                required
                step="0.1"
              />
              <input
                type="number"
                name="rooms"
                placeholder="Комнат"
                value={priceFeatures.rooms}
                onChange={handlePriceInputChange}
                required
                min="1"
              />
              <input
                type="number"
                name="floor"
                placeholder="Этаж"
                value={priceFeatures.floor}
                onChange={handlePriceInputChange}
                required
              />
              <input
                type="number"
                name="total_floors"
                placeholder="Всего этажей"
                value={priceFeatures.total_floors}
                onChange={handlePriceInputChange}
                required
              />
              <input
                type="number"
                name="year_built"
                placeholder="Год постройки"
                value={priceFeatures.year_built}
                onChange={handlePriceInputChange}
                required
              />
              <input
                type="number"
                name="distance_to_metro"
                placeholder="Минут до метро"
                value={priceFeatures.distance_to_metro}
                onChange={handlePriceInputChange}
                required
                step="0.5"
              />
              <select name="district" value={priceFeatures.district} onChange={handlePriceInputChange} required>
                <option value="центр">Центр</option>
                <option value="север">Север</option>
                <option value="юг">Юг</option>
                <option value="восток">Восток</option>
                <option value="запад">Запад</option>
              </select>
              <select name="renovation" value={priceFeatures.renovation} onChange={handlePriceInputChange} required>
                <option value="евро">Евроремонт</option>
                <option value="косметический">Косметический</option>
                <option value="дизайнерский">Дизайнерский</option>
                <option value="без">Без ремонта</option>
              </select>
            </div>
            <button type="submit" disabled={priceLoading} className="price-submit">
              {priceLoading ? '⏳ Расчет...' : '💰 Рассчитать стоимость'}
            </button>
            {pricePrediction && (
              <div className="price-result">
                <strong>Результат:</strong> {formatPrice(pricePrediction)}
              </div>
            )}
          </form>
        </div>
      )}

      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Задайте вопрос или попросите оценить квартиру..."
          disabled={loading}
        />
        <button onClick={handleSendMessage} disabled={loading || !input.trim()}>
          {loading ? '⏳' : '📤'}
        </button>
      </div>
    </div>
  );
}

function HomePage() {
  const [count, setCount] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPhpInfo, setShowPhpInfo] = useState(false);
  const [phpInfoContent, setPhpInfoContent] = useState<string>('');
  const [loadingPhpInfo, setLoadingPhpInfo] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/messages');
      const data = await response.json();
      
      if (data.success) {
        setMessages(data.data);
        setError(null);
      } else {
        setError(data.error || 'Failed to load messages');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleShowPhpInfo = async () => {
    try {
      setLoadingPhpInfo(true);
      setShowPhpInfo(true);
      
      const response = await fetch('/api/phpinfo');
      const html = await response.text();
      setPhpInfoContent(html);
    } catch (err) {
      console.error('Error fetching phpinfo:', err);
      alert('Failed to load PHP info');
    } finally {
      setLoadingPhpInfo(false);
    }
  };

  const handleClosePhpInfo = () => {
    setShowPhpInfo(false);
    setPhpInfoContent('');
  };

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const marqueeItems = messages.length > 0 
    ? messages.map(m => `✨ ${m.text}`)
    : ['🚀 Добро пожаловать на конкурс проектов 2026!', '📦 Данные загружаются...'];

  return (
    <div className="app">
      {successMessage && (
        <div className="global-message success-message" style={{ zIndex: 10000 }}>
          <span className="success-icon">✅</span>
          {successMessage}
          <button 
            className="message-close" 
            onClick={() => setSuccessMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {showPhpInfo && (
        <div className="modal-overlay" style={{ zIndex: 9000 }} onClick={handleClosePhpInfo}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🐘 PHP Information</h3>
              <button className="close-button" onClick={handleClosePhpInfo}>×</button>
            </div>
            <div className="modal-body">
              {loadingPhpInfo ? (
                <div className="loading">Загрузка...</div>
              ) : (
                <iframe
                  srcDoc={phpInfoContent}
                  title="PHP Info"
                  className="phpinfo-frame"
                  sandbox="allow-same-origin allow-scripts"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="cyber-grid" style={{ zIndex: 0 }}></div>
      
      <div className="content-wrapper" style={{ position: 'relative', zIndex: 1 }}>
        <div className="marquee-container">
          <Marquee 
            gradient={false} 
            speed={40} 
            pauseOnHover={true}
            className="marquee"
          >
            {marqueeItems.map((item, index) => (
              <span key={index} className="marquee-item">
                {item}
                <span className="marquee-separator">✦</span>
              </span>
            ))}
          </Marquee>
        </div>

        <div className="navigation-buttons">
          <button 
            onClick={() => navigate('/left')} 
            className="nav-button left-button"
          >
            ⬅️ Левая страница
          </button>
          <button 
            onClick={() => navigate('/right')} 
            className="nav-button right-button"
          >
            Правая страница ➡️
          </button>
          <button 
            onClick={() => navigate('/ml')} 
            className="nav-button ml-button"
          >
            🤖 ML сервис
          </button>
          {isAuthenticated ? (
            <button 
              onClick={handleLogout} 
              className="nav-button logout-button"
            >
              🚪 Выйти
            </button>
          ) : (
            <button 
              onClick={() => navigate('/auth')} 
              className="nav-button auth-button"
            >
              🔐 Войти
            </button>
          )}
        </div>

        <div className="logos">
          <a href="https://vite.dev" target="_blank" rel="noopener noreferrer">
            <img src={viteLogo} className="logo" alt="Vite logo" />
          </a>
          <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
          <div className="logo php" title="PHP">
            <span style={{ fontSize: '2rem' }}>🐘</span>
          </div>
        </div>

        <h1>Vite + React + PHP + PostgreSQL + DeepSeek R1</h1>

        <div className="carousel-container">
          <h2 className="carousel-title">Наш стек технологий</h2>
          <Slider 
            dots={true}
            infinite={true}
            speed={500}
            slidesToShow={3}
            slidesToScroll={1}
            autoplay={true}
            autoplaySpeed={3000}
            responsive={[
              { breakpoint: 1024, settings: { slidesToShow: 2 } },
              { breakpoint: 600, settings: { slidesToShow: 1 } }
            ]}
          >
            {[
              { title: "Vite", desc: "Сборка", icon: "⚡", color: "#646cff" },
              { title: "React", desc: "Интерфейсы", icon: "⚛️", color: "#61dafb" },
              { title: "PHP", desc: "Бэкенд", icon: "🐘", color: "#8892bf" },
              { title: "PostgreSQL", desc: "База данных", icon: "🐘", color: "#336791" },
              { title: "TypeScript", desc: "Типизация", icon: "📘", color: "#3178c6" },
              { title: "DeepSeek R1", desc: "Продвинутый AI", icon: "🧠", color: "#4a6fa5" }
            ].map((item, i) => (
              <div key={i} className="slide-card">
                <div className="slide-icon" style={{ backgroundColor: item.color }}>{item.icon}</div>
                <h3 className="slide-title">{item.title}</h3>
                <p className="slide-description">{item.desc}</p>
              </div>
            ))}
          </Slider>
        </div>

        <DeepSeekChat />

        <div className="database-section">
          <h2>📊 Данные из PostgreSQL</h2>
          
          {loading && <div className="loading">Загрузка данных...</div>}
          {error && <div className="error">{error}</div>}
          
          {!loading && !error && (
            <div className="messages-grid">
              {messages.map((message) => (
                <div key={message.id} className="message-card">
                  <p className="message-text">{message.text}</p>
                  <small className="message-date">
                    {new Date(message.created_at).toLocaleString('ru-RU')}
                  </small>
                </div>
              ))}
            </div>
          )}
          
          <button onClick={fetchMessages} className="refresh-button">
            🔄 Обновить данные
          </button>
        </div>

        <div className="content">
          <div className="card">
            <button onClick={() => setCount((count) => count + 1)}>
              count is {count}
            </button>
            <p>Edit <code>src/App.tsx</code> and save</p>
          </div>

          <button 
            onClick={handleShowPhpInfo} 
            className="php-button"
            disabled={loadingPhpInfo}
          >
            {loadingPhpInfo ? 'Загрузка...' : '🐘 Показать информацию о PHP'}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/registration" element={<Registration />} />
      
      <Route path="/left" element={
        <ProtectedRoute>
          <LeftPage />
        </ProtectedRoute>
      } />
      <Route path="/right" element={
        <ProtectedRoute>
          <RightPage />
        </ProtectedRoute>
      } />
      <Route path="/ml" element={
        <ProtectedRoute>
          <MlPage />
        </ProtectedRoute>
      } />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;