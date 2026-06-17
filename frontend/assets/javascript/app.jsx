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
  getLocationBestTimeStatus,
} from './api/client';
import '../styles/style.css';

function HomeTab({ profile, onGoSchedule, onGoCafes, onLogout, onGoAchievements }) {
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-500 pb-12">
      {/* Welcome Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-800 p-8 md:p-10 text-white shadow-xl shadow-indigo-500/10">
        <div className="absolute right-0 top-0 -mr-10 -mt-10 h-40 w-40 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 -mb-12 h-32 w-32 rounded-full bg-white/5 blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <p className="text-xs md:text-sm font-semibold uppercase tracking-widest text-indigo-200">{formattedDate}</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Welcome back, {profile?.username || 'Student'}!
            </h2>
            <p className="text-sm md:text-base text-indigo-100 max-w-xl font-medium">
              Ready for another high-productivity study session today? Let's achieve your daily academic goals together.
            </p>
          </div>
          
          <button
            onClick={onLogout}
            className="self-start md:self-auto inline-flex items-center gap-2 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all px-4 py-2.5 text-sm font-bold text-white backdrop-blur-md border border-white/10 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Streak Metric */}
        <div className="rounded-3xl border bg-card p-6 shadow-sm flex items-center gap-4 transition-all hover:shadow-md hover:scale-[1.01]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <span className="material-symbols-outlined text-[32px] fill-current animate-pulse">local_fire_department</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Streak</p>
            <h3 className="text-2xl font-black text-foreground mt-1 flex items-baseline gap-1">
              {profile?.streak || 0}
              <span className="text-xs font-semibold text-muted-foreground">days</span>
            </h3>
          </div>
        </div>

        {/* Study Hours Metric */}
        <div className="rounded-3xl border bg-card p-6 shadow-sm flex items-center gap-4 transition-all hover:shadow-md hover:scale-[1.01]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <span className="material-symbols-outlined text-[32px]">schedule</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Study Duration</p>
            <h3 className="text-2xl font-black text-foreground mt-1 flex items-baseline gap-1">
              {profile?.study_hours || 0}
              <span className="text-xs font-semibold text-muted-foreground">hours</span>
            </h3>
          </div>
        </div>

        {/* Saved Cafes Metric */}
        <div className="rounded-3xl border bg-card p-6 shadow-sm flex items-center gap-4 transition-all hover:shadow-md hover:scale-[1.01]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <span className="material-symbols-outlined text-[32px]">favorite</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saved Places</p>
            <h3 className="text-2xl font-black text-foreground mt-1 flex items-baseline gap-1">
              {profile?.streak ? 4 : 2}
              <span className="text-xs font-semibold text-muted-foreground">spots</span>
            </h3>
          </div>
        </div>
      </div>

      {/* Grid Features */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Schedule/Planner Card */}
        <div className="group rounded-3xl border bg-card p-8 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-indigo-500/5 group-hover:scale-150 transition-transform duration-500 pointer-events-none" />
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 mb-6">
              <span className="material-symbols-outlined text-[28px]">calendar_today</span>
            </div>
            <h3 className="font-extrabold text-xl text-foreground mb-3 tracking-tight">Schedule & Tasks</h3>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Organize your academic daily plan. Manage homework, project deadlines, exam prep, and view your calendar structure to stay organized.
            </p>
          </div>
          <button
            onClick={onGoSchedule}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary hover:opacity-95 text-primary-foreground font-bold py-3.5 text-sm transition-all shadow-md group-hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <span>Open Planner Dashboard</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>

        {/* AI Study Spot Finder Card */}
        <div className="group rounded-3xl border bg-card p-8 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-emerald-500/5 group-hover:scale-150 transition-transform duration-500 pointer-events-none" />
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-6">
              <span className="material-symbols-outlined text-[28px]">map</span>
            </div>
            <h3 className="font-extrabold text-xl text-foreground mb-3 tracking-tight">Find My Study Place</h3>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Explore café work spots on the map, trigger live crowdness queries to avoid busy times, and use our AI recommenders to find matching study spaces.
            </p>
          </div>
          <button
            onClick={onGoCafes}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-bold py-3.5 text-sm transition-all shadow-md group-hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <span>Explore Map & Spot Finder</span>
            <span className="material-symbols-outlined text-[16px]">map</span>
          </button>
        </div>

        {/* Focus Sessions Card (Coming soon) */}
        <div className="group rounded-3xl border bg-card p-8 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-violet-500/5 group-hover:scale-150 transition-transform duration-500 pointer-events-none" />
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400 mb-6">
              <span className="material-symbols-outlined text-[28px]">hourglass_empty</span>
            </div>
            <h3 className="font-extrabold text-xl text-foreground mb-3 tracking-tight">Focus Sessions</h3>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Trigger distraction-free study blocks. Monitor focus minutes with custom work/rest cycles (Pomodoro) and track your session performance metrics.
            </p>
          </div>
          <button
            disabled
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-secondary text-secondary-foreground font-bold py-3.5 text-sm opacity-50 cursor-not-allowed border"
          >
            <span>Focus Mode (Coming Soon)</span>
            <span className="material-symbols-outlined text-[16px]">lock</span>
          </button>
        </div>

        {/* Achievements Card */}
        <div className="group rounded-3xl border bg-card p-8 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1 relative overflow-hidden">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-amber-500/5 group-hover:scale-150 transition-transform duration-500 pointer-events-none" />
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-6">
              <span className="material-symbols-outlined text-[28px]">emoji_events</span>
            </div>
            <h3 className="font-extrabold text-xl text-foreground mb-3 tracking-tight">Achievements & Badges</h3>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              View unlocked trophies, keep tabs on your milestones, and complete academic challenges to build a consistent habit streak.
            </p>
          </div>
          <button
            onClick={onGoAchievements}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-600 text-white font-bold py-3.5 text-sm transition-all shadow-md group-hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <span>View My Achievements</span>
            <span className="material-symbols-outlined text-[16px]">workspace_premium</span>
          </button>
        </div>
      </div>
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
  const [activeBestTimeJobs, setActiveBestTimeJobs] = useState(() => {
    try {
      const saved = localStorage.getItem('studybuddy-active-besttime-jobs');
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
    try {
      localStorage.setItem('studybuddy-active-besttime-jobs', JSON.stringify(activeBestTimeJobs));
    } catch {}
  }, [activeBestTimeJobs]);

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

  // Handle registration of new BestTime background jobs to poll
  useEffect(() => {
    const handleStartBestTimePolling = (e) => {
      const { locationId, locationName } = e.detail;
      setActiveBestTimeJobs((prev) => {
        if (prev.some((job) => job.locationId === locationId)) {
          return prev;
        }
        return [...prev, { locationId, locationName }];
      });
    };

    window.addEventListener('studybuddy-start-polling-besttime', handleStartBestTimePolling);
    return () => window.removeEventListener('studybuddy-start-polling-besttime', handleStartBestTimePolling);
  }, []);

  // Global polling engine for active BestTime background jobs
  useEffect(() => {
    if (activeBestTimeJobs.length === 0) return undefined;

    let cancelled = false;

    async function pollBestTimeJobs() {
      for (const job of activeBestTimeJobs) {
        try {
          const payload = await getLocationBestTimeStatus(job.locationId);
          if (cancelled) return;

          if (payload?.job) {
            if (payload.job.status === 'done') {
              window.dispatchEvent(
                new CustomEvent('studybuddy-notification', {
                  detail: {
                    title: 'Crowdness Level Ready',
                    text: `Crowdness level for "${job.locationName}" has been updated.`,
                    type: 'success',
                    locationId: job.locationId,
                  },
                })
              );
              window.dispatchEvent(
                new CustomEvent('studybuddy-besttime-completed', {
                  detail: {
                    locationId: job.locationId,
                    besttime_venue_id: payload.besttime_venue_id,
                    besttime_live_busyness: payload.besttime_live_busyness,
                    besttime_live_fetched_at: payload.besttime_live_fetched_at,
                    besttime_forecast_data: payload.besttime_forecast_data,
                    job: payload.job,
                  },
                })
              );
              setActiveBestTimeJobs((prev) => prev.filter((j) => j.locationId !== job.locationId));
            } else if (payload.job.status === 'failed') {
              window.dispatchEvent(
                new CustomEvent('studybuddy-notification', {
                  detail: {
                    title: 'Crowdness Update Failed',
                    text: `Failed to update crowdness level for "${job.locationName}".`,
                    type: 'error',
                  },
                })
              );
              window.dispatchEvent(
                new CustomEvent('studybuddy-besttime-completed', {
                  detail: {
                    locationId: job.locationId,
                    job: payload.job,
                  },
                })
              );
              setActiveBestTimeJobs((prev) => prev.filter((j) => j.locationId !== job.locationId));
            } else {
              // Dispatch progress update to PlacesMap if it's mounted
              window.dispatchEvent(
                new CustomEvent('studybuddy-besttime-progress', {
                  detail: {
                    locationId: job.locationId,
                    job: payload.job,
                  },
                })
              );
            }
          }
        } catch (err) {
          console.error(`Error polling BestTime job for location ${job.locationId}`, err);
        }
      }
    }

    void pollBestTimeJobs();
    const interval = setInterval(() => {
      void pollBestTimeJobs();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeBestTimeJobs]);

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
                onGoAchievements={() => navigate('/achievements')}
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