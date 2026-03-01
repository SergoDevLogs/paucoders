import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import './Auth.css';
import './DatasetDetails.css';
import Header from "./Header.tsx";
import Footer from "./Footer.tsx";
import arrow from './assets/back.png';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    Filler
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';


ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    Filler
);

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

interface HerdForecastPoint {
    date: string;
    avg_milk_days: number;
    dairy_cows: number;
}

interface HerdForecastResponse {
    success: boolean;
    forecast: HerdForecastPoint[];
}

interface ModelInfoResponse {
    model_trained: boolean;
    reference_date: string;
    total_records: number;
    data_sources: string[];
    model_metrics?: {
        mae: number;
        mape: number;
        r2: number;
        forecast_days: number;
    };
}

function DatasetDetails() {
    const { id } = useParams<{ id: string }>();
    const [activeTab, setActiveTab] = useState<'forecast' | 'cows' | 'monitoring'>('forecast');
    const [selectedCow, setSelectedCow] = useState<Cow | null>(null);
    const [cows, setCows] = useState<Cow[]>([]);
    const [projectName, setProjectName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<'id' | 'daysInMilk' | 'lactation' | 'status' | 'daysPregnant'>('id');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [statistics, setStatistics] = useState({
        totalCows: 0,
        milking: 0,
        dry: 0,
        pregnant: 0,
        archived: 0,
        bred: 0,
        averageDaysInMilk: 0,
        averageDaysPregnant: 0
    });

    const [months, setMonths] = useState<number | null>(null);
    const [startDate, setStartDate] = useState<string>('');
    const [forecast, setForecast] = useState<HerdForecastPoint[]>([]);
    const [loadingForecast, setLoadingForecast] = useState(false);
    const [forecastError, setForecastError] = useState<string | null>(null);
    const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);
    const [training, setTraining] = useState(false);

    const [lactationChartData, setLactationChartData] = useState({
        labels: [] as string[],
        datasets: [] as any[]
    });
    const [statusChartData, setStatusChartData] = useState({
        labels: [] as string[],
        datasets: [] as any[]
    });

    const [searchTerm, setSearchTerm] = useState('');

    const chartContainerRef = useRef<HTMLDivElement>(null);

    const ITEMS_PER_PAGE = 10;
    const MAX_VISIBLE_PAGES = 5;

    useEffect(() => {
        if (id) {
            fetchProjectData(parseInt(id));
            fetchModelInfo();
        }
    }, [id]);

    const fetchProjectData = async (projectId: number) => {
        try {
            setLoading(true);
            const response = await fetch(`/api/projects/${projectId}`);
            const data = await response.json();
            
            if (data.success) {
                setProjectName(data.data.project.name);
                setCows(data.data.cows);
                calculateStatistics(data.data.cows);
                prepareChartsData(data.data.cows);
            } else {
                setError(data.error || 'Ошибка при загрузке данных');
            }
        } catch (err) {
            setError('Ошибка соединения с сервером');
            console.error('Error fetching project data:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchModelInfo = async () => {
        try {
            const response = await fetch('/api/info');
            if (response.ok) {
                const data = await response.json();
                setModelInfo(data);
                if (data.reference_date && !startDate) {
                    setStartDate(data.reference_date);
                }
            }
        } catch (err) {
            console.error('Failed to load model info:', err);
        }
    };

    const trainModel = async () => {
        setTraining(true);
        setForecastError(null);
        try {
            const response = await fetch('/api/train', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Ошибка при обучении');
            }
            alert('Модель успешно обучена!');
            await fetchModelInfo();
        } catch (err: any) {
            setForecastError(err.message || 'Не удалось обучить модель');
        } finally {
            setTraining(false);
        }
    };

    const fetchHerdForecast = async () => {
        if (!modelInfo?.model_trained) {
            setForecastError('Модель не обучена. Сначала обучите модель.');
            return;
        }

        const years = months && months > 0 ? months / 12 : 3;
        setLoadingForecast(true);
        setForecastError(null);

        const datasetName = id ? `dataset_${id}` : '';
        const payload: any = { years };
        if (startDate) payload.start_date = startDate;
        if (datasetName) payload.dataset = datasetName;

        try {
            const response = await fetch('/api/forecast/herd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data: HerdForecastResponse = await response.json();

            if (!response.ok || !data.success) {
                throw new Error('Ошибка при получении прогноза');
            }

            setForecast(data.forecast);
        } catch (err: any) {
            setForecastError(err.message || 'Не удалось загрузить прогноз');
        } finally {
            setLoadingForecast(false);
        }
    };

    const prepareChartsData = (cowsData: Cow[]) => {
        const lactationCounts: { [key: number]: number } = {};
        cowsData.forEach(cow => {
            if (cow.lactation) {
                lactationCounts[cow.lactation] = (lactationCounts[cow.lactation] || 0) + 1;
            }
        });

        setLactationChartData({
            labels: Object.keys(lactationCounts).map(l => `${l} лактация`),
            datasets: [
                {
                    label: 'Количество коров',
                    data: Object.values(lactationCounts),
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }
            ]
        });

        const statusCounts: { [key: string]: number } = {};
        cowsData.forEach(cow => {
            const status = cow.status || 'Неизвестно';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        const generateColors = (count: number) => {
            const colors = [];
            for (let i = 0; i < count; i++) {
                const hue = (i * 137.5) % 360;
                colors.push(`hsla(${hue}, 70%, 60%, 0.7)`);
            }
            return colors;
        };

        const statusLabels = Object.keys(statusCounts);
        const backgroundColors = generateColors(statusLabels.length);
        const borderColors = backgroundColors.map(color => color.replace('0.7', '1'));

        setStatusChartData({
            labels: statusLabels,
            datasets: [
                {
                    data: Object.values(statusCounts),
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }
            ]
        });
    };

    const calculateStatistics = (cowsData: Cow[]) => {
        const stats = {
            totalCows: cowsData.length,
            milking: 0,
            dry: 0,
            pregnant: 0,
            archived: 0,
            bred: 0,
            averageDaysInMilk: 0,
            averageDaysPregnant: 0
        };

        let totalDaysInMilk = 0;
        let totalDaysPregnant = 0;
        let pregnantCount = 0;

        cowsData.forEach(cow => {
            if (cow.status === 'Продана' || cow.archiveDate) {
                stats.archived++;
            } else if (cow.status === 'Стельная') {
                stats.pregnant++;
            } else if (cow.status === 'В сухостое' || cow.dryDate) {
                stats.dry++;
            } else if (cow.status === 'Осемененная') {
                stats.bred++;
            } else if (cow.status === 'Новотельное животное' || cow.status === 'актив') {
                stats.milking++;
            }

            if (cow.lactationDate) {
                const days = Math.floor((new Date().getTime() - new Date(cow.lactationDate).getTime()) / (1000 * 60 * 60 * 24));
                totalDaysInMilk += days > 0 ? days : 0;
            }

            if (cow.expectedCalvingDate && cow.status === 'Стельная') {
                const calvingDate = new Date(cow.expectedCalvingDate);
                const today = new Date();
                const daysUntilCalving = Math.floor((calvingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const daysPregnant = 285 - daysUntilCalving;
                if (daysPregnant > 0 && daysPregnant <= 285) {
                    totalDaysPregnant += daysPregnant;
                    pregnantCount++;
                }
            }
        });

        stats.averageDaysInMilk = stats.milking > 0 ? Math.round(totalDaysInMilk / stats.milking) : 0;
        stats.averageDaysPregnant = pregnantCount > 0 ? Math.round(totalDaysPregnant / pregnantCount) : 0;

        setStatistics(stats);
    };

    const formatDate = (dateString: string | null): string => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU');
    };

    const calculateDaysInMilk = (cow: Cow): number => {
        if (!cow.lactationDate) return 0;
        const start = new Date(cow.lactationDate);
        const today = new Date();
        const days = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return days > 0 ? days : 0;
    };

    const calculateDaysPregnant = (cow: Cow): number => {
        if (!cow.expectedCalvingDate || cow.status !== 'Стельная') return 0;
        const calvingDate = new Date(cow.expectedCalvingDate);
        const today = new Date();
        const daysUntilCalving = Math.floor((calvingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const daysPregnant = 285 - daysUntilCalving;
        return (daysPregnant > 0 && daysPregnant <= 285) ? daysPregnant : 0;
    };

    const getDisplayCows = () => {
        return cows.map(cow => ({
            id: cow.cowId,
            daysInMilk: calculateDaysInMilk(cow),
            lactation: cow.lactation ? 'есть' : 'нет',
            status: cow.status || 'Неизвестно',
            daysPregnant: calculateDaysPregnant(cow),
            originalData: cow
        }));
    };

    const filterCows = (cowsToFilter: ReturnType<typeof getDisplayCows>) => {
        if (!searchTerm.trim()) return cowsToFilter;
        const term = searchTerm.toLowerCase().trim();
        return cowsToFilter.filter(cow => 
            cow.id.toString().includes(term) || 
            cow.status.toLowerCase().includes(term)
        );
    };

    const sortCows = (cowsToSort: ReturnType<typeof getDisplayCows>) => {
        return [...cowsToSort].sort((a, b) => {
            let comparison = 0;
            
            switch (sortField) {
                case 'id':
                    comparison = a.id - b.id;
                    break;
                case 'daysInMilk':
                    comparison = a.daysInMilk - b.daysInMilk;
                    break;
                case 'lactation':
                    comparison = a.lactation.localeCompare(b.lactation);
                    break;
                case 'status':
                    comparison = a.status.localeCompare(b.status);
                    break;
                case 'daysPregnant':
                    comparison = a.daysPregnant - b.daysPregnant;
                    break;
            }
            
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    };

    const handleSort = (field: typeof sortField) => {
        if (field === sortField) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setShowSortMenu(false);
        setCurrentPage(1);
    };

    const displayCows = getDisplayCows();
    const filteredCows = filterCows(displayCows);
    const sortedCows = sortCows(filteredCows);
    const totalPages = Math.ceil(sortedCows.length / ITEMS_PER_PAGE);
    const paginatedCows = sortedCows.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const getVisiblePages = () => {
        const half = Math.floor(MAX_VISIBLE_PAGES / 2);
        let start = Math.max(1, currentPage - half);
        let end = Math.min(totalPages, start + MAX_VISIBLE_PAGES - 1);
        
        if (end - start + 1 < MAX_VISIBLE_PAGES) {
            start = Math.max(1, end - MAX_VISIBLE_PAGES + 1);
        }
        
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    const handleCowClick = (cow: Cow) => {
        setSelectedCow(cow);
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    useEffect(() => {
        if (selectedCow) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [selectedCow]);

    const chartData = {
        labels: forecast.map(p => {
            const [, month, year] = p.date.split('.');
            return `${month}.${year}`;
        }),
        datasets: [
            {
                label: 'Средние дни доения',
                data: forecast.map(p => p.avg_milk_days),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
                fill: true,
                yAxisID: 'y',
            },
            {
                label: 'Количество дойных коров',
                data: forecast.map(p => p.dairy_cows),
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                tension: 0.1,
                fill: true,
                yAxisID: 'y1',
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
            title: { display: true, text: 'Прогноз средних дней доения по стаду' },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${context.raw.toFixed(1)}`
                }
            }
        },
        scales: {
            y: {
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                title: { display: true, text: 'Средние дни доения' }
            },
            y1: {
                type: 'linear' as const,
                display: true,
                position: 'right' as const,
                grid: { drawOnChartArea: false },
                title: { display: true, text: 'Количество коров' }
            }
        }
    };

    if (loading) {
        return (
            <div className="profile-page">
                <Header />
                <div className="dashboard-container">
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        Загрузка данных проекта...
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    if (error) {
        return (
            <div className="profile-page">
                <Header />
                <div className="dashboard-container">
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'red' }}>
                        Ошибка: {error}
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="profile-page">
            {selectedCow && (
                <div className="modal-overlay" onClick={() => setSelectedCow(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setSelectedCow(null)}>×</button>
                        <h2 className="modal-title">Корова {selectedCow.cowId}</h2>
                        <div className="modal-details">
                            <div className="detail-row">
                                <span className="detail-label">Дата рождения</span>
                                <span className="detail-value">{formatDate(selectedCow.birthday)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Дата архива</span>
                                <span className="detail-value">{formatDate(selectedCow.archiveDate)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Лактация</span>
                                <span className="detail-value">{selectedCow.lactation || 0}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Дата начала тек.лакт</span>
                                <span className="detail-value">{formatDate(selectedCow.lactationDate)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Дни в доении</span>
                                <span className="detail-value">{calculateDaysInMilk(selectedCow)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Статус коровы</span>
                                <span className="detail-value">{selectedCow.status}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Дата осеменения</span>
                                <span className="detail-value">{formatDate(selectedCow.inseminationDate)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Дата успешного осеменения</span>
                                <span className="detail-value">{formatDate(selectedCow.currentInsemination)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Дни стельности</span>
                                <span className="detail-value">{calculateDaysPregnant(selectedCow)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Дата запуска тек.лакт</span>
                                <span className="detail-value">{formatDate(selectedCow.dryDate)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Дата ожидаемого запуска</span>
                                <span className="detail-value">{formatDate(selectedCow.expectedDryDate)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Дата ожидаемого отёла</span>
                                <span className="detail-value">{formatDate(selectedCow.expectedCalvingDate)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <Header/>

            <div className="dashboard-container">
                <div className="dashboard-header">
                    <Link to="/projects" className="profile-link">
                        <img className="arrow" src={arrow} alt={'назад'}/>
                    </Link>
                    <h1 className="project-title">{projectName}</h1>
                </div>

                <div className="dashboard-tabs">
                    <button
                        className={`tab ${activeTab === 'forecast' ? 'active' : ''}`}
                        onClick={() => setActiveTab('forecast')}
                    >
                        Прогноз
                    </button>
                    <button
                        className={`tab ${activeTab === 'cows' ? 'active' : ''}`}
                        onClick={() => setActiveTab('cows')}
                    >
                        Коровы ({statistics.totalCows})
                    </button>
                    <button
                        className={`tab ${activeTab === 'monitoring' ? 'active' : ''}`}
                        onClick={() => setActiveTab('monitoring')}
                    >
                        Мониторинг
                    </button>
                </div>

                <div className="dashboard-content">
                    {activeTab === 'forecast' && (
                        <div className="forecast-tab">
                            {modelInfo && (
                                <>
                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <span className="stat-label">Модель</span>
                                            <span className="stat-value">{modelInfo.model_trained ? '✅' : '❌'}</span>
                                        </div>
                                        <div className="stat-card">
                                            <span className="stat-label">Референтная дата</span>
                                            <span className="stat-value">{modelInfo.reference_date}</span>
                                        </div>
                                        {modelInfo.model_metrics && (
                                            <>
                                                <div className="stat-card">
                                                    <span className="stat-label">MAE</span>
                                                    <span className="stat-value">{modelInfo.model_metrics.mae.toFixed(1)} дн</span>
                                                </div>
                                                <div className="stat-card">
                                                    <span className="stat-label">MAPE</span>
                                                    <span className="stat-value">{modelInfo.model_metrics.mape.toFixed(1)}%</span>
                                                </div>
                                                <div className="stat-card">
                                                    <span className="stat-label">R²</span>
                                                    <span className="stat-value">{modelInfo.model_metrics.r2.toFixed(3)}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <button 
                                        onClick={trainModel} 
                                        disabled={training} 
                                        className="download-report" 
                                        style={{ marginBottom: '1rem' }}
                                    >
                                        {training ? '⏳ Обучение...' : '🔄 Переобучить модель'}
                                    </button>
                                </>
                            )}

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                <div className="period-selector" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.9rem', color: '#666' }}>Горизонт (мес)</label>
                                    <input
                                        type="number"
                                        value={months === null ? '' : months}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setMonths(val === '' ? null : parseInt(val) || 0);
                                        }}
                                        placeholder="36"
                                        min="1"
                                        max="120"
                                        style={{
                                            padding: '0.5rem',
                                            border: '2px solid #151C34',
                                            borderRadius: '8px',
                                            fontSize: '1rem',
                                            width: '120px'
                                        }}
                                    />
                                </div>
                                <div className="period-selector" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.9rem', color: '#666' }}>Начальная дата</label>
                                    <input
                                        type="text"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        placeholder={modelInfo?.reference_date || 'дд.мм.гггг'}
                                        style={{
                                            padding: '0.5rem',
                                            border: '2px solid #151C34',
                                            borderRadius: '8px',
                                            fontSize: '1rem',
                                            width: '140px'
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={fetchHerdForecast}
                                    disabled={loadingForecast || !modelInfo?.model_trained}
                                    className="download-report"
                                    style={{ marginLeft: 'auto' }}
                                >
                                    {loadingForecast ? '⏳ Расчёт...' : '📈 Рассчитать прогноз'}
                                </button>
                            </div>

                            {!modelInfo?.model_trained && (
                                <div className="placeholder-tab" style={{ marginBottom: '1rem' }}>
                                    ⚠️ Модель не обучена. Нажмите "Переобучить модель" для начала работы.
                                </div>
                            )}

                            {forecastError && (
                                <div className="placeholder-tab" style={{ marginBottom: '1rem', background: '#ffebee', color: '#d32f2f', borderColor: '#d32f2f' }}>
                                    ⚠️ {forecastError}
                                </div>
                            )}

                            {forecast.length > 0 && (
                                <div className="forecast-results" style={{ marginTop: '2rem' }}>
                                    <h3 style={{ color: '#151C34', marginBottom: '1rem' }}>Результаты прогноза</h3>
                                    <div 
                                        ref={chartContainerRef}
                                        className="chart-placeholder" 
                                        style={{ padding: 0, background: 'white', border: 'none' }}
                                    >
                                        <div style={{ height: '400px', padding: '1rem' }}>
                                            <Line data={chartData} options={chartOptions} />
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '2rem', background: '#151C34', borderRadius: '20px', padding: '1.5rem', overflowX: 'auto' }}>
                                        <table className="cows-table" style={{ minWidth: '400px' }}>
                                            <thead>
                                                <tr>
                                                    <th>Дата</th>
                                                    <th>Ср. дни доения</th>
                                                    <th>Дойных коров</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {forecast.map((point, idx) => (
                                                    <tr key={idx}>
                                                        <td>{point.date}</td>
                                                        <td>{point.avg_milk_days.toFixed(2)}</td>
                                                        <td>{point.dairy_cows}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {activeTab === 'cows' && (
                        <div className="cows-tab">
                            <div className="cows-header">
                                <h3 className="cows-title">Список коров</h3>
                                <div className="cows-controls">
                                    <input
                                        type="text"
                                        placeholder="Поиск по номеру или статусу"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{
                                            padding: '0.5rem',
                                            border: '2px solid #151C34',
                                            borderRadius: '8px',
                                            fontSize: '1rem',
                                            width: '250px',
                                            marginRight: '1rem'
                                        }}
                                    />
                                    <div className="sort-container">
                                        <button 
                                            className="sort-button"
                                            onClick={() => setShowSortMenu(!showSortMenu)}
                                        >
                                            Сортировать по ▼
                                        </button>
                                        {showSortMenu && (
                                            <div className="sort-menu">
                                                <button 
                                                    className={`sort-option ${sortField === 'id' ? 'active' : ''}`}
                                                    onClick={() => handleSort('id')}
                                                >
                                                    № {sortField === 'id' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </button>
                                                <button 
                                                    className={`sort-option ${sortField === 'daysInMilk' ? 'active' : ''}`}
                                                    onClick={() => handleSort('daysInMilk')}
                                                >
                                                    Дни дойности {sortField === 'daysInMilk' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </button>
                                                <button 
                                                    className={`sort-option ${sortField === 'lactation' ? 'active' : ''}`}
                                                    onClick={() => handleSort('lactation')}
                                                >
                                                    Лактация {sortField === 'lactation' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </button>
                                                <button 
                                                    className={`sort-option ${sortField === 'status' ? 'active' : ''}`}
                                                    onClick={() => handleSort('status')}
                                                >
                                                    Статус {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </button>
                                                <button 
                                                    className={`sort-option ${sortField === 'daysPregnant' ? 'active' : ''}`}
                                                    onClick={() => handleSort('daysPregnant')}
                                                >
                                                    Дни стельности {sortField === 'daysPregnant' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {filteredCows.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>
                                    {searchTerm ? 'Ничего не найдено' : 'В этом проекте пока нет коров'}
                                </div>
                            ) : (
                                <>
                                    <div className="cows-table-wrapper">
                                        <table className="cows-table">
                                            <thead>
                                                <tr>
                                                    <th>№</th>
                                                    <th>Дни дойности</th>
                                                    <th>Лактация</th>
                                                    <th>Статус</th>
                                                    <th>Дни стельности</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedCows.map((cow) => (
                                                    <tr 
                                                        key={cow.id} 
                                                        className="clickable-row" 
                                                        onClick={() => handleCowClick(cow.originalData)}
                                                    >
                                                        <td>{cow.id}</td>
                                                        <td>{cow.daysInMilk}</td>
                                                        <td>{cow.lactation}</td>
                                                        <td>
                                                            <span className={`status-badge status-${cow.status.toLowerCase()}`}>
                                                                {cow.status}
                                                            </span>
                                                        </td>
                                                        <td>{cow.daysPregnant}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {totalPages > 1 && (
                                        <div className="pagination">
                                            <button
                                                className="pagination-button"
                                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                disabled={currentPage === 1}
                                            >
                                                ←
                                            </button>
                                            
                                            {getVisiblePages().map(page => (
                                                <button
                                                    key={page}
                                                    className={`pagination-button ${currentPage === page ? 'active' : ''}`}
                                                    onClick={() => setCurrentPage(page)}
                                                >
                                                    {page}
                                                </button>
                                            ))}
                                            
                                            <button
                                                className="pagination-button"
                                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                                disabled={currentPage === totalPages}
                                            >
                                                →
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                    
                    {activeTab === 'monitoring' && (
                        <div className="monitoring-tab">
                            <div className="charts-grid">
                                <div className="chart-card">
                                    <h4 className="chart-title">Распределение по лактациям</h4>
                                    <div className="chart-container">
                                        {lactationChartData.labels.length > 0 ? (
                                            <Bar 
                                                data={lactationChartData}
                                                options={{
                                                    responsive: true,
                                                    maintainAspectRatio: false,
                                                    plugins: {
                                                        legend: {
                                                            display: false
                                                        }
                                                    },
                                                    scales: {
                                                        y: {
                                                            beginAtZero: true,
                                                            ticks: {
                                                                stepSize: 1
                                                            }
                                                        }
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <p className="no-data-message">Нет данных для отображения</p>
                                        )}
                                    </div>
                                </div>

                                <div className="chart-card">
                                    <h4 className="chart-title">Распределение по статусам</h4>
                                    <div className="chart-container">
                                        {statusChartData.labels.length > 0 ? (
                                            <Pie 
                                                data={statusChartData}
                                                options={{
                                                    responsive: true,
                                                    maintainAspectRatio: false,
                                                    plugins: {
                                                        legend: {
                                                            position: 'right' as const,
                                                            labels: {
                                                                boxWidth: 12,
                                                                padding: 15
                                                            }
                                                        }
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <p className="no-data-message">Нет данных для отображения</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="current-changes">
                                <h4 className="changes-title">Текущие изменения:</h4>
                                <ul className="changes-list">
                                    <li className="change-item">
                                        {statistics.bred} коров осеменено
                                    </li>
                                    <li className="change-item">
                                        {statistics.pregnant} стельных коров
                                    </li>
                                    <li className="change-item">
                                        {statistics.dry} коров в сухостое
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>

           <Footer/>
        </div>
    );
}

export default DatasetDetails;