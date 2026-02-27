import { createContext, useState, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';

interface User {
  id: number;
  login: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (login: string, password: string, birthDate: string) => Promise<{ success: boolean; error?: string }>;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = '/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    
    if (savedToken && savedUser) {
      verifyToken(savedToken).then(isValid => {
        if (isValid) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          setIsAuthenticated(true);
          localStorage.setItem('isAuthenticated', 'true');
        } else {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          localStorage.removeItem('isAuthenticated');
        }
        setLoading(false);
      });
    } else {
      localStorage.removeItem('isAuthenticated');
      setLoading(false);
    }
  }, []);

  const verifyToken = async (tokenToVerify: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      return response.ok && data.success;
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  };

  const login = async (login: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ login, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        localStorage.setItem('isAuthenticated', 'true');
        
        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);
        return true;
      } else {
        console.error('Login failed:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const register = async (login: string, password: string, birthDate: string) => {
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ login, password, birthDate }),
      });

      const data = await response.json();

      if (response.status === 201 && data.success) {
        return { success: true };
      } else {
        return { 
          success: false, 
          error: data.error || 'Ошибка при регистрации' 
        };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        error: 'Ошибка соединения с сервером' 
      };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${API_URL}/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('isAuthenticated');
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const getAuthHeaders = (): Record<string, string> => {
    if (token) {
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
    }
    return {
      'Content-Type': 'application/json'
    };
  };

  if (loading) {
    return <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      Загрузка приложения...
    </div>;
  }

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      user, 
      token,
      loading,
      login, 
      logout,
      register,
      getAuthHeaders
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}