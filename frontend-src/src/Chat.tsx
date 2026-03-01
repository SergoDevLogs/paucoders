import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Chat.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Cow {
  cowId: number;
  birthday: string;
  archiveDate: string | null;
  lactation: number | null;
  dryDate: string | null;
  inseminationDate: string | null;
  datasetID: number;
  lactationDate: string | null;
  status: string;
  expectedCalvingDate: string | null;
  expectedDryDate: string | null;
  currentInsemination: string | null;
}

const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = import.meta.env.VITE_DEEPSEEK_API_URL;
const DEEPSEEK_MODEL = import.meta.env.VITE_DEEPSEEK_MODEL;

function Chat() {
    const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      role: 'assistant', 
      content: 'Привет! Я помощник по управлению фермой 🐄\n\nЯ могу:\n- Рассказать о конкретной корове (например: "Расскажи о корове 123")\n- Сделать прогноз с указанной даты (например: "Сделай прогноз с 01.01.2025 на 12 месяцев")\n\nЧто вас интересует?' 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    setMessages(prev => [...prev, { role, content }]);
  };

  const parseRussianDate = (dateString: string | null): Date | null => {
    if (!dateString) return null;
    
    const parts = dateString.split('.');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; 
      const year = parseInt(parts[2], 10);
      
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
    
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '-';
    const date = parseRussianDate(dateString);
    return date ? date.toLocaleDateString('ru-RU') : dateString;
  };

  const calculateDaysInMilk = (cow: Cow): number => {
    if (!cow.lactationDate) return 0;
    const start = parseRussianDate(cow.lactationDate);
    if (!start) return 0;
    
    const today = new Date();
    const days = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const calculateDaysPregnant = (cow: Cow): number => {
    if (!cow.expectedCalvingDate || cow.status !== 'Стельная') return 0;
    const calvingDate = parseRussianDate(cow.expectedCalvingDate);
    if (!calvingDate) return 0;
    
    const today = new Date();
    const daysUntilCalving = Math.floor((calvingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const daysPregnant = 285 - daysUntilCalving;
    return (daysPregnant > 0 && daysPregnant <= 285) ? daysPregnant : 0;
  };

  const askDeepSeek = async (question: string): Promise<string> => {
    try {
      const messageHistory = [
        {
          role: 'system',
          content: `Ты AI-ассистент по животноводству. Твоя задача - анализировать запросы пользователя и преобразовывать их в структурированные JSON команды.

ДОСТУПНЫЕ КОМАНДЫ (ТОЛЬКО ЭТИ ДВЕ):

1. get_cow - информация о конкретной корове. Используй, когда пользователь спрашивает о конкретной корове по номеру.
   Формат: {"action": "get_cow", "cow_id": число}

2. forecast - прогноз с указанной даты на указанный срок в месяцах.
   Формат: {"action": "forecast", "start_date": "ДД.ММ.ГГГГ", "months": число}

ПРАВИЛА:
- Если пользователь спрашивает о корове по номеру (например, "корова 123", "покажи корову 45", "расскажи о 67") -> используй get_cow
- Если пользователь просит прогноз с указанием даты и срока (например, "прогноз с 01.01.2025 на 12 месяцев", "предсказание на 6 месяцев с 15.03.2025") -> используй forecast
- Если пользователь не указал дату в запросе на прогноз, используй текущую дату
- Если пользователь не указал срок в месяцах для прогноза, используй 12 месяцев
- В ответе ВСЕГДА сначала должен идти JSON в формате -_- {"action": ...} -_- , а потом пояснение для пользователя

ВАЖНО: JSON всегда должен быть обернут в -_- и -_- и находиться в самом начале ответа.
НЕ ИСПОЛЬЗУЙ другие действия, только get_cow и forecast.`
        },
        ...messages.slice(-6).map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        })),
        {
          role: 'user',
          content: question
        }
      ];

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
          max_tokens: 1000,
          top_p: 0.95
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '❌ Пустой ответ от API';
      
    } catch (error) {
      console.error('DeepSeek API error:', error);
      return '❌ Ошибка соединения с DeepSeek. Пожалуйста, попробуйте позже.';
    }
  };

const sendJsonToServer = async (jsonData: any): Promise<string> => {
    try {
        console.log('📤 Отправка JSON на сервер:', jsonData);
        
        if (jsonData.action === 'get_cow') {
            const response = await fetch(`/api/cow/${jsonData.cow_id}`);
            const data = await response.json();
            
            if (!response.ok) {
                return `❌ Корова с номером ${jsonData.cow_id} не найдена`;
            }
            
            let cowData = data;
            
            if (data.success && data.data) {
                cowData = data.data;
            }
            else if (data.data) {
                cowData = data.data;
            }
            
            console.log('🐄 Обработанные данные коровы:', cowData);
            return formatCowData(cowData);
            
        } else if (jsonData.action === 'forecast') {
            const payload = {
                years: (jsonData.months || 12) / 12,
                start_date: jsonData.start_date || new Date().toLocaleDateString('ru-RU')
            };
            
            const response = await fetch('/api/forecast/herd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (!response.ok || !data.success) {
                return '❌ Ошибка при получении прогноза';
            }
            
            return formatForecastData(data.forecast, payload.start_date, jsonData.months || 12);
        }
        
        return '❌ Неизвестная команда';
        
    } catch (error) {
        console.error('Server error:', error);
        return `❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`;
    }
};

    const formatCowData = (cow: any): string => {
        if (!cow) return '❌ Нет данных о корове';
        
        if (typeof cow !== 'object') {
            return '❌ Получены некорректные данные';
        }
        
        console.log('🐄 Данные для форматирования:', cow);
        
        const cowId = cow['Номер животного'] || cow.cowId || cow.id || cow.cow_id || 'не указан';
        
        const normalizedCow: Cow = {
            cowId: parseInt(cowId) || 0,
            birthday: cow['Дата рождения'] || cow.birthday || null,
            archiveDate: cow['Дата архива'] || cow.archiveDate || null,
            lactation: cow['Лактация'] || cow.lactation || null,
            dryDate: cow['Дата запуска тек.лакт'] || cow.dryDate || null,
            inseminationDate: cow['Дата осеменения'] || cow.inseminationDate || null,
            datasetID: cow.datasetID || 0,
            lactationDate: cow['Дата начала тек.лакт'] || cow.lactationDate || null,
            status: cow['Статус коровы'] || cow.status || 'Неизвестно',
            expectedCalvingDate: cow['Дата ожидаемого отела'] || cow.expectedCalvingDate || null,
            expectedDryDate: cow['Дата ожидаемого запуска'] || cow.expectedDryDate || null,
            currentInsemination: cow['Дата успешного осеменения'] || cow.currentInsemination || null
        };
        
        let result = `🐄 **Информация о корове ${normalizedCow.cowId}**\n\n`;
        
        result += `**ОСНОВНАЯ ИНФОРМАЦИЯ:**\n`;
        result += `• 🆔 Номер животного: ${normalizedCow.cowId}\n`;
        if (cow['animal_class']) result += `• 📋 Класс: ${cow['animal_class']}\n`;
        if (cow['Кличка животного']) result += `• 📛 Кличка: ${cow['Кличка животного']}\n`;
        if (normalizedCow.birthday) result += `• 🎂 Дата рождения: ${formatDate(normalizedCow.birthday)}\n`;
        if (normalizedCow.status) result += `• 📌 Статус: ${normalizedCow.status}\n`;
        if (normalizedCow.lactation) result += `• 🔢 Лактация: ${normalizedCow.lactation}\n`;
        
        if (cow.current_milking_days) result += `• 🥛 Текущие дни доения: ${cow.current_milking_days}\n`;
        if (cow.predicted_milking_days_month) result += `• 📊 Прогноз дней доения: ${cow.predicted_milking_days_month}\n`;
        if (cow.prediction_confidence) result += `• 📈 Точность прогноза: ${cow.prediction_confidence}%\n`;
        
        result += `\n`;
        
        if (normalizedCow.lactationDate) {
        result += `**ЛАКТАЦИЯ:**\n`;
        result += `• 📅 Начало лактации: ${formatDate(normalizedCow.lactationDate)}\n`;
        const daysInMilk = calculateDaysInMilk(normalizedCow);
        if (daysInMilk > 0) result += `• 🥛 Дней в доении: ${daysInMilk}\n`;
        if (normalizedCow.dryDate) result += `• ⏸️ Дата запуска: ${formatDate(normalizedCow.dryDate)}\n`;
        result += `\n`;
        }
        
        if (normalizedCow.inseminationDate || normalizedCow.expectedCalvingDate) {
        result += `**ОСЕМЕНЕНИЕ И СТЕЛЬНОСТЬ:**\n`;
        if (normalizedCow.inseminationDate) result += `• 🔄 Дата осеменения: ${formatDate(normalizedCow.inseminationDate)}\n`;
        if (normalizedCow.currentInsemination) result += `• ✅ Успешное осеменение: ${formatDate(normalizedCow.currentInsemination)}\n`;
        if (normalizedCow.expectedCalvingDate) {
            result += `• 🍼 Ожидаемый отел: ${formatDate(normalizedCow.expectedCalvingDate)}\n`;
            const daysPregnant = calculateDaysPregnant(normalizedCow);
            if (daysPregnant > 0) result += `• 🤰 Дней стельности: ${daysPregnant}\n`;
        }
        }
        
        if (normalizedCow.archiveDate) {
        result += `\n**АРХИВ:**\n`;
        result += `• 📦 Дата архивации: ${formatDate(normalizedCow.archiveDate)}\n`;
        }
        
        return result;
    };

  const formatForecastData = (forecast: any[], startDate: string, months: number): string => {
    if (!forecast || forecast.length === 0) {
      return '❌ Нет данных для прогноза';
    }
    
    let result = `📈 **Прогноз на ${months} месяцев с ${startDate}**\n\n`;
    const previewPoints = forecast.slice(0, 5);
    
    result += `**Ключевые точки прогноза:**\n`;
    previewPoints.forEach((point) => {
      result += `• ${point.date}: средние дни доения ${point.avg_milk_days.toFixed(1)}, дойных коров ${point.dairy_cows}\n`;
    });
    
    if (forecast.length > 5) {
      result += `• ... и ещё ${forecast.length - 5} точек прогноза\n`;
    }
    
    const avgMilkDays = forecast.reduce((sum, p) => sum + p.avg_milk_days, 0) / forecast.length;
    const maxDairyCows = Math.max(...forecast.map(p => p.dairy_cows));
    const minDairyCows = Math.min(...forecast.map(p => p.dairy_cows));
    
    result += `\n**Общая статистика за период:**\n`;
    result += `• Средние дни доения: ${avgMilkDays.toFixed(1)}\n`;
    result += `• Дойных коров: от ${minDairyCows} до ${maxDairyCows}\n`;
    
    return result;
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput('');
    setLoading(true);

    try {
      addMessage('user', userMessage);
      
      const deepseekResponse = await askDeepSeek(userMessage);
      const jsonMatch = deepseekResponse.match(/-_-\s*({[\s\S]*?})\s*-_-/);
      
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);
          const cleanResponse = deepseekResponse
            .replace(/-_-\s*{[\s\S]*?}\s*-_-/g, '')
            .trim();
          
          if (cleanResponse) {
            addMessage('assistant', cleanResponse);
          }
          
          const serverResponse = await sendJsonToServer(jsonData);
          addMessage('assistant', serverResponse);
          
        } catch (jsonError) {
          console.error('JSON processing error:', jsonError);
          addMessage('assistant', deepseekResponse + '\n\n❌ Не удалось обработать команду для сервера.');
        }
      } else {
        addMessage('assistant', deepseekResponse);
      }
      
    } catch (error) {
      console.error('Error in chat:', error);
      addMessage('assistant', '❌ Произошла ошибка. Пожалуйста, попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="deepseek-chat">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ margin: 0 }}>🐄 Умный помощник фермера</h2>
          <button 
            onClick={() => navigate('/profile')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            ← Назад
          </button>
        </div>
        <p className="chat-description">
          Задайте вопрос о коровах или запросите прогноз
        </p>
        
        <div className="chat-hint">
          <strong>📋 Примеры запросов:</strong>
          <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
            • "Расскажи о корове 123"<br/>
            • "Сделай прогноз с 01.01.2025 на 12 месяцев"<br/>
            • "Прогноз на 6 месяцев с сегодняшнего дня"<br/>
            • "Покажи информацию о корове 456"
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              <div className="message-content" style={{ whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-message assistant">
              <div className="message-content">⏳ Обрабатываю запрос...</div>
            </div>
          )}
        </div>

        <div className="chat-input">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Введите запрос..."
            disabled={loading}
          />
          <button onClick={handleSendMessage} disabled={loading || !input.trim()}>
            {loading ? '⏳' : '📤'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;