import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, status } = useSelector((state) => state.auth);

  // Still loading — show nothing (landing page handles the initial fetch)
  if (status === 'loading' || status === 'idle') return null;

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return children;
}
