import { Routes, Route, Navigate } from 'react-router-dom';
import Auth from './Auth';
import Registration from './Registration';
import NotFound from './NotFound';
import ProtectedRoute from './ProtectedRoute';
import DatasetDetails from './DatasetDetails';
import Projects from './Profile';
import Chat from './Chat';

function App() {

  return (
    <Routes>
      <Route 
        path="/" 
        element={<Navigate to="/auth" replace />} 
      />
      
      {/* Публичные маршруты */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/registration" element={<Registration />} />
      
      {/* Защищенные маршруты */}
      <Route 
        path="/chat" 
        element={
          <ProtectedRoute>
            <Chat />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/datasetdetails" 
        element={
          <ProtectedRoute>
            <DatasetDetails />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <Projects />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/dataset/:id" 
        element={
          <ProtectedRoute>
            <DatasetDetails />
          </ProtectedRoute>
        } 
      />
      
      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;