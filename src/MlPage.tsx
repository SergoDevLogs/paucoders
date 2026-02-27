import { useState, useEffect } from 'react';
import './MlPage.css';

interface SuccessResponse {
  success: true;
  prediction: number;
  input_features: Record<string, any>;
}

interface ErrorResponse {
  success: false;
  error: string;
}

type PredictionResponse = SuccessResponse | ErrorResponse;

interface ModelInfo {
  feature_names: string[];
  categorical_features: string[];
  model_type: string;
  metrics: {
    mae?: number;
    r2?: number;
  };
}

interface InputFeatures {
  area: string;
  rooms: string;
  floor: string;
  total_floors: string;
  year_built: string;
  distance_to_metro: string;
  district: string;
  renovation: string;
}

interface FeaturesForServer {
  area: number;
  rooms: number;
  floor: number;
  total_floors: number;
  year_built: number;
  distance_to_metro: number;
  district: string;
  renovation: string;
}

function MlPage() {
  const [inputFeatures, setInputFeatures] = useState<InputFeatures>({
    area: '',
    rooms: '',
    floor: '',
    total_floors: '',
    year_built: '',
    distance_to_metro: '',
    district: 'центр',
    renovation: 'евро'
  });
  
  const [prediction, setPrediction] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [showModelInfo, setShowModelInfo] = useState(false);

  useEffect(() => {
    fetchModelInfo();
  }, []);

  const fetchModelInfo = async () => {
    try {
      const response = await fetch('/api/model-info');
      if (response.ok) {
        const data = await response.json();
        setModelInfo(data);
      }
    } catch (err) {
      console.error('Failed to load model info:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInputFeatures(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateFeatures = (features: FeaturesForServer): boolean => {
    const numericFields: Array<keyof FeaturesForServer> = [
      'area', 'rooms', 'floor', 'total_floors', 'year_built', 'distance_to_metro'
    ];
    
    for (const field of numericFields) {
      const value = features[field];
      if (typeof value !== 'number' || isNaN(value)) {
        setError(`Поле "${field}" должно быть числом`);
        return false;
      }
      
      if (field === 'area' && (value < 10 || value > 1000)) {
        setError('Площадь должна быть от 10 до 1000 м²');
        return false;
      }
      if (field === 'rooms' && (value < 1 || value > 20)) {
        setError('Количество комнат должно быть от 1 до 20');
        return false;
      }
      if (field === 'year_built' && (value < 1800 || value > 2025)) {
        setError('Год постройки должен быть от 1800 до 2025');
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setPrediction(null);

    const featuresForServer: FeaturesForServer = {
      area: parseFloat(inputFeatures.area),
      rooms: parseInt(inputFeatures.rooms),
      floor: parseInt(inputFeatures.floor),
      total_floors: parseInt(inputFeatures.total_floors),
      year_built: parseInt(inputFeatures.year_built),
      distance_to_metro: parseFloat(inputFeatures.distance_to_metro),
      district: inputFeatures.district,
      renovation: inputFeatures.renovation
    };

    if (!validateFeatures(featuresForServer)) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ features: featuresForServer }),
      });

      const data: PredictionResponse = await response.json();

      if (!response.ok || !data.success) {
        if ('error' in data) {
          throw new Error(data.error);
        } else {
          throw new Error('Ошибка при получении предсказания');
        }
      }

      setPrediction(data.prediction);
    } catch (err: any) {
      setError(err.message || 'Не удалось связаться с сервером.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  return (
    <div className="ml-page">
      <h1>🏠 Оценка стоимости квартиры</h1>
      <p className="description">
        Введите параметры квартиры, и нейросеть (CatBoost) предскажет её стоимость
      </p>

      <div className="model-info-toggle">
        <button onClick={() => setShowModelInfo(!showModelInfo)} className="info-button">
          {showModelInfo ? '▼ Скрыть' : '▶ Показать'} информацию о модели
        </button>
      </div>

      {showModelInfo && modelInfo && (
        <div className="model-info">
          <h3>Информация о модели</h3>
          <p><strong>Тип модели:</strong> {modelInfo.model_type}</p>
          <p><strong>Признаки:</strong> {modelInfo.feature_names?.join(', ')}</p>
          <p><strong>Категориальные признаки:</strong> {modelInfo.categorical_features?.join(', ')}</p>
          {modelInfo.metrics && (
            <div>
              <p><strong>Метрики качества:</strong></p>
              <ul>
                {modelInfo.metrics.mae && (
                  <li>MAE: {formatPrice(modelInfo.metrics.mae)}</li>
                )}
                {modelInfo.metrics.r2 && (
                  <li>R²: {modelInfo.metrics.r2.toFixed(3)}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="prediction-form">
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="area">Площадь (м²) *</label>
            <input
              type="number"
              id="area"
              name="area"
              value={inputFeatures.area}
              onChange={handleInputChange}
              required
              step="0.1"
              min="10"
              max="1000"
              placeholder="например: 65.5"
            />
          </div>

          <div className="form-group">
            <label htmlFor="rooms">Количество комнат *</label>
            <input
              type="number"
              id="rooms"
              name="rooms"
              value={inputFeatures.rooms}
              onChange={handleInputChange}
              required
              min="1"
              max="20"
              placeholder="например: 2"
            />
          </div>

          <div className="form-group">
            <label htmlFor="floor">Этаж *</label>
            <input
              type="number"
              id="floor"
              name="floor"
              value={inputFeatures.floor}
              onChange={handleInputChange}
              required
              min="1"
              max="100"
              placeholder="например: 5"
            />
          </div>

          <div className="form-group">
            <label htmlFor="total_floors">Всего этажей *</label>
            <input
              type="number"
              id="total_floors"
              name="total_floors"
              value={inputFeatures.total_floors}
              onChange={handleInputChange}
              required
              min="1"
              max="200"
              placeholder="например: 9"
            />
          </div>

          <div className="form-group">
            <label htmlFor="year_built">Год постройки *</label>
            <input
              type="number"
              id="year_built"
              name="year_built"
              value={inputFeatures.year_built}
              onChange={handleInputChange}
              required
              min="1800"
              max="2025"
              placeholder="например: 2005"
            />
          </div>

          <div className="form-group">
            <label htmlFor="distance_to_metro">До метро (минут) *</label>
            <input
              type="number"
              id="distance_to_metro"
              name="distance_to_metro"
              value={inputFeatures.distance_to_metro}
              onChange={handleInputChange}
              required
              min="0"
              max="180"
              step="0.5"
              placeholder="например: 10"
            />
          </div>

          <div className="form-group">
            <label htmlFor="district">Район *</label>
            <select
              id="district"
              name="district"
              value={inputFeatures.district}
              onChange={handleInputChange}
              required
            >
              <option value="центр">Центр</option>
              <option value="север">Север</option>
              <option value="юг">Юг</option>
              <option value="восток">Восток</option>
              <option value="запад">Запад</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="renovation">Ремонт *</label>
            <select
              id="renovation"
              name="renovation"
              value={inputFeatures.renovation}
              onChange={handleInputChange}
              required
            >
              <option value="евро">Евроремонт</option>
              <option value="косметический">Косметический</option>
              <option value="дизайнерский">Дизайнерский</option>
              <option value="без">Без ремонта</option>
            </select>
          </div>
        </div>

        <button type="submit" disabled={loading} className="submit-button">
          {loading ? '⏳ Расчет...' : '💰 Оценить стоимость'}
        </button>
      </form>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}
      
      {prediction !== null && (
        <div className="result-card">
          <h2>Результат оценки:</h2>
          <div className="prediction-price">
            {formatPrice(prediction)}
          </div>
          <p className="prediction-note">
            * Предсказание основано на модели CatBoost, обученной на исторических данных.
            Реальная цена может отличаться.
          </p>
          <button 
            onClick={() => {
              setPrediction(null);
              setInputFeatures({
                area: '',
                rooms: '',
                floor: '',
                total_floors: '',
                year_built: '',
                distance_to_metro: '',
                district: 'центр',
                renovation: 'евро'
              });
            }}
            className="reset-button"
          >
            Новый расчет
          </button>
        </div>
      )}
    </div>
  );
}

export default MlPage;