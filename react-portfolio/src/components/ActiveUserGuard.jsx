import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const ActiveUserGuard = ({ children, requireAdmin = false }) => {
  const { loading, isActiveUser, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-container">
        <div className="auth-loading-box">
          <span>VERIFYING OPERATOR SESSION...</span>
        </div>
      </div>
    );
  }

  if (requireAdmin) {
    if (!isAdmin) {
      return <Navigate to="/" replace />;
    }
    return children;
  }

  if (!isActiveUser) {
    const targetPath = `${location.pathname}${location.search || ''}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(targetPath)}`} replace />;
  }

  return children;
};

export default ActiveUserGuard;
