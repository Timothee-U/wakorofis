import { useAuth } from '@/hooks/useAuth';
import AuthPage from '@/pages/AuthPage';
import DashboardPage from '@/pages/DashboardPage';

const AdminRoute = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-shield border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return session ? <DashboardPage /> : <AuthPage />;
};

export default AdminRoute;
