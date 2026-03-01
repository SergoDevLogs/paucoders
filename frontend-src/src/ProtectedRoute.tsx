import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Проверка авторизации...
      </div>
    );
  }

  const savedAuth = localStorage.getItem('isAuthenticated');
  
  if (!isAuthenticated && savedAuth !== 'true') {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;