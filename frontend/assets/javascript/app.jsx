import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { IntroSection } from './components/AuthSection';
import { Schedule } from './components/Schedule';
import { Planner } from './components/Planner';
import { StudyPlaceFinder } from './components/StudyPlaceFinder';
import { LandingPage } from './components/LandingPage';
import { Achievements } from './components/Achievements';
import {
  getMe,
  loginUser,
  registerUser,
  getAuthToken,
  setAuthToken,
  onInvalidAuthToken,
  updateMyProfile,
  getLocationAIProfileGeneration,
} from './api/client';
import '../styles/style.css';

function HomeTab({ profile, onGoSchedule, onGoCafes, onLogout }) {
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
        <div className="rounded-lg border bg-background p-6">
          <h3 className="font-semibold text-lg mb-2">Find My Study Place</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Browse study-friendly places, use AI to find the perfect spot, and inspect their ratings.
          </p>
          <button
            onClick={onGoCafes}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm"
          >
            Open Map
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
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [activeJobs, setActiveJobs] = useState(() => {
    try {
      const saved = localStorage.getItem('studybuddy-active-jobs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const location = useLocation();
  const navigate = useNavigate();

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('studybuddy-active-jobs', JSON.stringify(activeJobs));
    } catch {}
  }, [activeJobs]);

  useEffect(() => {
    const handleNotification = (e) => {
      const { text, type, title, timestamp, locationId } = e.detail;
      const notificationId = Date.now() + Math.random().toString(36).substr(2, 9);
      
      const newNotification = {
        id: notificationId,
        text,
        type: type || 'info',
        title: title || 'System',
        timestamp: timestamp || new Date(),
        read: false,
        locationId: locationId || null
      };

      setNotifications((prev) => [newNotification, ...prev]);
      setToasts((prev) => [...prev, newNotification]);
      
      // Auto-remove toast after 5s
      setTimeout(() => {
        removeToast(notificationId);
      }, 5000);
    };

    window.addEventListener('studybuddy-notification', handleNotification);
    return () => window.removeEventListener('studybuddy-notification', handleNotification);
  }, [removeToast]);

  // Handle registration of new background jobs to poll
  useEffect(() => {
    const handleStartPolling = (e) => {
      const { locationId, locationName } = e.detail;
      setActiveJobs((prev) => {
        if (prev.some((job) => job.locationId === locationId)) {
          return prev;
        }
        return [...prev, { locationId, locationName }];
      });
    };

    window.addEventListener('studybuddy-start-polling', handleStartPolling);
    return () => window.removeEventListener('studybuddy-start-polling', handleStartPolling);
  }, []);

  // Global polling engine for active background jobs
  useEffect(() => {
    if (activeJobs.length === 0) return undefined;

    let cancelled = false;

    async function pollJobs() {
      for (const job of activeJobs) {
        try {
          const payload = await getLocationAIProfileGeneration(job.locationId);
          if (cancelled) return;

          if (payload?.profile) {
            // Completed! Notify globally and update UI components
            window.dispatchEvent(
              new CustomEvent('studybuddy-notification', {
                detail: {
                  title: 'AI Review Ready',
                  text: `AI study analysis for "${job.locationName}" is complete.`,
                  type: 'success',
                  locationId: job.locationId,
                },
              })
            );
            window.dispatchEvent(
              new CustomEvent('studybuddy-job-completed', {
                detail: {
                  locationId: job.locationId,
                  profile: payload.profile,
                  job: payload.job,
                },
              })
            );
            setActiveJobs((prev) => prev.filter((j) => j.locationId !== job.locationId));
          } else if (payload?.job) {
            if (payload.job.status === 'failed') {
              window.dispatchEvent(
                new CustomEvent('studybuddy-notification', {
                  detail: {
                    title: 'AI Review Failed',
                    text: `AI review generation for "${job.locationName}" failed.`,
                    type: 'error',
                  },
                })
              );
              setActiveJobs((prev) => prev.filter((j) => j.locationId !== job.locationId));
            } else {
              // Dispatch progress update to PlacesMap if it's mounted
              window.dispatchEvent(
                new CustomEvent('studybuddy-job-progress', {
                  detail: {
                    locationId: job.locationId,
                    job: payload.job,
                  },
                })
              );
            }
          }
        } catch (err) {
          console.error(`Error polling job for location ${job.locationId}`, err);
        }
      }
    }

    void pollJobs();
    const interval = setInterval(() => {
      void pollJobs();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeJobs]);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setAuthToken(null);
    setProfile(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const currentPath = location.pathname;
  const currentTab = currentPath === '/schedule'
    ? 'schedule'
    : currentPath === '/cafes'
      ? 'cafes'
    : currentPath === '/focus'
      ? 'focus'
    : currentPath === '/planner'
      ? 'planner'
      : currentPath === '/achievements'
        ? 'achievements'
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

    if (tabId === 'planner') {
      navigate('/planner');
      return;
    }

    if (tabId === 'cafes') {
      navigate('/cafes');
      return;
    }

    if (tabId === 'achievements') {
      navigate('/achievements');
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

  const refreshProfile = async () => {
    const userData = await fetchUserData();
    setProfile(userData);
    return userData;
  };

  const handleAvatarUpload = async (file) => {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    await updateMyProfile(formData);
    await refreshProfile();
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
    const unsubscribe = onInvalidAuthToken(() => {
      logout();
    });

    return unsubscribe;
  }, [logout]);

  useEffect(() => {
    if (!isLoggedIn && !['/login', '/register'].includes(currentPath)) {
      navigate('/login', { replace: true });
      return;
    }

    if (isLoggedIn && ['/login', '/register'].includes(currentPath)) {
      navigate('/', { replace: true });
    }
  }, [currentPath, isLoggedIn, navigate]);

  if (!isLoggedIn) {
    return (
      <Routes>
        <Route path="*" element={<LandingPage onAuthSubmit={handleAuthSubmit} />} />
      </Routes>
    );
  }

  return (
    <div className="size-full flex min-h-screen bg-background text-foreground relative">
      <style>{`
        @keyframes toastSlideUp {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-toast-slide-in {
          animation: toastSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <Sidebar
        isLoggedIn={isLoggedIn}
        profile={profile}
        currentTab={currentTab}
        onTabChange={navigateToTab}
        onLoginClick={() => navigate('/login')}
        onRegisterClick={() => navigate('/register')}
        onAvatarUpload={handleAvatarUpload}
        notifications={notifications}
        onClearNotifications={clearNotifications}
      />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <Routes>
          <Route
            path="/"
            element={(
              <HomeTab
                profile={profile}
                onGoSchedule={() => navigate('/schedule')}
                onGoCafes={() => navigate('/cafes')}
                onLogout={logout}
              />
            )}
          />
          <Route path="/schedule" element={<Schedule onProfileUpdate={refreshProfile} />} />
          <Route path="/cafes" element={<StudyPlaceFinder />} />
          <Route path="/focus" element={<FocusTab />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Toast corner notifications overlay */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 pointer-events-none max-w-sm w-full px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border bg-card/90 p-4 shadow-lg backdrop-blur-md animate-toast-slide-in border-l-4"
            style={{
              borderLeftColor: toast.type === 'success' ? '#0d9488' : '#6366f1',
            }}
          >
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-wider text-foreground">{toast.title}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-normal">{toast.text}</p>
              {toast.locationId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/cafes?location=${toast.locationId}`);
                    removeToast(toast.id);
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  View on map &rarr;
                </button>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        ))}
      </div>
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