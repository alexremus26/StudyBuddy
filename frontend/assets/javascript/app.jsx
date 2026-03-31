import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { IntroSection } from './components/AuthSection';
import { Schedule } from './components/Schedule';
import {
  getMe,
  loginUser,
  registerUser,
  getAuthToken,
  setAuthToken,
} from './api/client';

function HomeTab({ profile, onGoSchedule, onLogout }) {
  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm max-w-4xl">
      <h2 className="text-3xl font-bold">Welcome!</h2>
      <p className="text-muted-foreground mt-2">
        Start managing your schedule and stay on track with your goals.
      </p>
      {profile ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Logged in as: <span className="font-medium text-foreground">{profile.username}</span>
        </p>
      ) : null}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-background p-6">
          <h3 className="font-semibold text-lg mb-2">Schedule</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Create and manage your daily tasks. Add, edit, and delete tasks to keep track of what you need to do.
          </p>
          <button
            onClick={onGoSchedule}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm"
          >
            Go to Schedule
          </button>
        </div>
        <div className="rounded-lg border bg-background p-6">
          <h3 className="font-semibold text-lg mb-2">Focus Sessions</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Coming soon! Track your focus sessions and schedule task blocks to maintain productivity.
          </p>
          <button
            disabled
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg opacity-50 cursor-not-allowed text-sm"
          >
            Coming Soon
          </button>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="mt-6 px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 text-sm"
      >
        Logout
      </button>
    </div>
  );
}

function FocusTab() {
  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm max-w-4xl">
      <h2 className="text-3xl font-bold">Focus Sessions</h2>
      <p className="text-muted-foreground mt-2">
        Coming soon! This feature will help you schedule focused work sessions.
      </p>
    </div>
  );
}

function AppShell() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getAuthToken()));
  const [profile, setProfile] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const currentPath = location.pathname;
  const currentTab = currentPath === '/schedule'
    ? 'schedule'
    : currentPath === '/focus'
      ? 'focus'
      : 'home';

  const navigateToTab = (tabId) => {
    if (tabId === 'schedule') {
      navigate('/schedule');
      return;
    }

    if (tabId === 'focus') {
      navigate('/focus');
      return;
    }

    navigate('/');
  };

  const handleAuthSubmit = async ({ username, email, password }, mode) => {
    const trimmedUsername = username?.trim();
    const trimmedPassword = password;

    if (!trimmedUsername || !trimmedPassword) {
      throw new Error('Provide both username and password.');
    }

    const payload = { username: trimmedUsername, password: trimmedPassword };
    let data;

    try {
      if (mode === 'register') {
        data = await registerUser({
          ...payload,
          email: (email?.trim() || trimmedUsername),
        });
      } else {
        data = await loginUser(payload);
      }
    } catch (error) {
      throw error;
    }

    if (!data?.token) {
      throw new Error('Authentication failed.');
    }

    setAuthToken(data.token);
    setIsLoggedIn(true);
    navigate('/', { replace: true });
  };

  const fetchUserData = async () => {
    try {
      return await getMe();
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (!isLoggedIn) {
        setProfile(null);
        return;
      }

      const userData = await fetchUserData();
      if (!mounted) {
        return;
      }

      setProfile(userData);
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn && !['/login', '/register'].includes(currentPath)) {
      navigate('/login', { replace: true });
      return;
    }

    if (isLoggedIn && ['/login', '/register'].includes(currentPath)) {
      navigate('/', { replace: true });
    }
  }, [currentPath, isLoggedIn, navigate]);

  return (
    <div className="size-full flex min-h-screen bg-background text-foreground">
      <Sidebar
        isLoggedIn={isLoggedIn}
        profile={profile}
        currentTab={currentTab}
        onTabChange={navigateToTab}
        onLoginClick={() => navigate('/login')}
        onRegisterClick={() => navigate('/register')}
      />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <Routes>
          {isLoggedIn ? (
            <>
              <Route
                path="/"
                element={(
                  <HomeTab
                    profile={profile}
                    onGoSchedule={() => navigate('/schedule')}
                    onLogout={() => {
                      setIsLoggedIn(false);
                      setAuthToken(null);
                      setProfile(null);
                      navigate('/login', { replace: true });
                    }}
                  />
                )}
              />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/focus" element={<FocusTab />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/register" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route
                path="/login"
                element={<IntroSection mode="login" onSubmit={(values) => handleAuthSubmit(values, 'login')} />}
              />
              <Route
                path="/register"
                element={<IntroSection mode="register" onSubmit={(values) => handleAuthSubmit(values, 'register')} />}
              />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          )}
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);