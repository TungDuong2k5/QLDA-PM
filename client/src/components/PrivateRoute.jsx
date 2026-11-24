import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PrivateRoute({ children, adminOnly = false, staffOnly = false }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  // Admin is management-only: revenue/shifts, orders, menu, inventory — no selling.
  if (staffOnly && user.role === 'admin') return <Navigate to="/dashboard" replace />;

  return children;
}
