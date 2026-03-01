import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Auth.css';
import Header from "./Header.tsx";
import Footer from "./Footer.tsx";

interface Project {
    id: number;
    name: string;
    votes: number;
    status: string;
}

function Projects() {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const [expanded, setExpanded] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/projects');
            const data = await response.json();
            
            if (data.success) {
                setProjects(data.data);
            } else {
                setError(data.error || 'Ошибка при загрузке проектов');
            }
        } catch (err) {
            setError('Ошибка соединения с сервером');
            console.error('Error fetching projects:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRowClick = (projectId: number) => {
        navigate(`/dataset/${projectId}`);
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const handleLoadMore = () => {
        setExpanded(true);
    };

    const handleHide = () => {
        setExpanded(false);
    };

    const handleChatNavigate = () => {
        navigate('/chat');
    };

    const showLoadMore = !expanded && projects.length > 3;
    const showHide = expanded && projects.length > 3;
    const displayedProjects = expanded ? projects : projects.slice(0, 3);

    if (loading) {
        return (
            <div className="profile-page">
                <Header/>
                <div className="projects-container">
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        Загрузка проектов...
                    </div>
                </div>
                <Footer/>
            </div>
        );
    }

    if (error) {
        return (
            <div className="profile-page">
                <Header/>
                <div className="projects-container">
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'red' }}>
                        Ошибка: {error}
                    </div>
                </div>
                <Footer/>
            </div>
        );
    }

    return (
        <div className="profile-page">
            <Header/>

            <div className="projects-container">
                <div className="projects-header">
                    <h2 className="projects-title">Список проектов</h2>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                            className="auth-button" 
                            onClick={handleChatNavigate}
                            style={{
                                color: 'white',
                                backgroundColor: '#151C34',
                                marginRight: '10px'
                            }}
                        >
                            💬 Текстовый помощник
                        </button>
                        <button className="auth-button logout-button" onClick={handleLogout}>
                            Выйти
                        </button>
                    </div>
                </div>

                {projects.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        Нет доступных проектов.
                    </div>
                ) : (
                    <>
                        <div className={`projects-table-wrapper ${expanded ? 'expanded' : ''}`}>
                            <table className="projects-table">
                                <thead>
                                <tr>
                                    <th>№</th>
                                    <th>Название</th>
                                    <th>Кол-во коров</th>
                                    <th>Статус</th>
                                </tr>
                                </thead>
                                <tbody>
                                {displayedProjects.map((project, index) => (
                                    <tr
                                        key={project.id}
                                        onClick={() => handleRowClick(project.id)}
                                        className="clickable-row"
                                    >
                                        <td>{index + 1}</td>
                                        <td>{project.name}</td>
                                        <td>{project.votes}</td>
                                        <td>{project.status}</td>
                                    </tr>
                                ))}
                                {!expanded && projects.length > 3 && (
                                    <tr className="ellipsis-row" onClick={(e) => e.stopPropagation()}>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '1rem' }}>
                                            ...
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>

                        {showLoadMore && (
                            <div className="load-more-container">
                                <button className="load-more-button" onClick={handleLoadMore}>
                                    Загрузить еще
                                </button>
                            </div>
                        )}

                        {showHide && (
                            <div className="load-more-container">
                                <button className="load-more-button" onClick={handleHide}>
                                    Скрыть
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <Footer/>
        </div>
    );
}

export default Projects;