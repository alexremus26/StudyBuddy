import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function Sidebar({ 
  isLoggedIn = false, 
  profile = null, 
  currentTab = 'home', 
  onTabChange = () => { }, 
  onLoginClick = () => { }, 
  onRegisterClick = () => { }, 
  onAvatarUpload = async () => { },
  notifications = [],
  onClearNotifications = () => { }
}) {
  const navigate = useNavigate();
  const initial = profile?.username ? profile.username.charAt(0).toUpperCase() : '·';
  const fileInputRef = useRef(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const avatarUrl = profile?.avatar;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    await onAvatarUpload(file);
  };

  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'planner', label: 'AI Planner' },
    { id: 'cafes', label: 'Find My Study Place' },
    { id: 'focus', label: 'Focus Sessions' },
    { id: 'achievements', label: 'Achievements' },
  ];

  return (
    <aside className="hidden w-72 shrink-0 border-r border-sidebar-border bg-sidebar p-6 md:flex md:flex-col sticky top-0 h-screen">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">StudyBuddy</p>
        <h1 className="text-2xl font-semibold text-sidebar-foreground">Dashboard</h1>
      </div>

      <nav className="mt-8 space-y-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${currentTab === tab.id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Notifications Section */}
      {isLoggedIn && (
        <div className="flex-1 min-h-[160px] max-h-[350px] overflow-hidden flex flex-col mt-6 border-t border-sidebar-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Notifications</span>
            {notifications.length > 0 && (
              <button 
                onClick={onClearNotifications} 
                className="text-[10px] text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold transition-colors cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar text-xs">
            {notifications.length === 0 ? (
              <div className="text-muted-foreground/60 py-8 text-center italic text-[11px]">No new notifications</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="p-3 rounded-xl border border-sidebar-border bg-sidebar-accent/30 hover:bg-sidebar-accent/50 transition-colors relative group">
                  <div className="flex justify-between items-start mb-1 gap-1">
                    <span className={`font-bold text-[11px] uppercase tracking-wide ${n.type === 'success' ? 'text-[#0d9488] dark:text-[#2dd4bf]' : 'text-indigo-600 dark:text-indigo-400'}`}>{n.title}</span>
                    <span className="text-[9px] text-muted-foreground shrink-0 font-medium">
                      {new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  <p className="text-foreground/90 text-[11px] leading-relaxed font-medium">{n.text}</p>
                  {n.locationId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/cafes?location=${n.locationId}`);
                      }}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-400 dark:hover:bg-indigo-950 text-[10px] font-bold text-indigo-600 transition-all cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      <span>View on map</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="mt-auto pt-8 space-y-3">
        <button
          type="button"
          onClick={() => {
            const root = document.documentElement;
            const isDark = root.classList.toggle('dark');
            try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch {}
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
          aria-label="Toggle theme"
        >
          {/* Sun icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dark:hidden">
            <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          {/* Moon icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hidden dark:block">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <span>Toggle theme</span>
        </button>

        <div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-3 py-3">
          <button
            type="button"
            onClick={isLoggedIn ? handleAvatarClick : undefined}
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar text-lg font-semibold text-sidebar-foreground cursor-pointer"
            aria-label={isLoggedIn ? 'Upload profile picture' : 'Profile picture'}
          >
            {avatarUrl && !avatarLoadFailed ? (
              <img
                src={avatarUrl}
                alt={`${profile?.username || 'Profile'} avatar`}
                className="h-full w-full object-cover"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <span>{initial}</span>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex-1">
            {isLoggedIn ? (
              <>
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <p className="text-sm font-semibold text-sidebar-foreground truncate max-w-[120px]" title={profile?.username}>
                    {profile?.username}
                  </p>
                  <div className="flex gap-1 items-center shrink-0">
                    {profile?.streak > 0 && (
                      <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px] font-bold animate-pulse dark:text-amber-500" title={`${profile.streak} days streak!`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-amber-500 shrink-0">
                          <path fillRule="evenodd" d="M12.969 2.18a.75.75 0 0 1 .218.812l-1.921 5.379 4.148-3.771a.75.75 0 0 1 1.22.428c.119.53.181 1.08.181 1.645 0 3.73-2.585 7.153-6.145 8.101a.75.75 0 0 1-.407-.1-.75.75 0 0 1-.336-.599l-.025-2.015-1.636 1.487A7.5 7.5 0 0 1 3.5 12.01c0-1.765.61-3.387 1.635-4.664a.75.75 0 0 1 1.15.04l2.42 2.904 1.833-5.132a.75.75 0 0 1 .43-.443Z" clipRule="evenodd" />
                          <path d="M19.38 10.162a.75.75 0 0 1 .1.75c-.244.643-.374 1.332-.374 2.051 0 3.65-2.88 6.67-6.52 7.004a.75.75 0 1 1-.137-1.493 5.513 5.513 0 0 0 4.654-5.011 5.72 5.72 0 0 0-.256-1.579.75.75 0 0 1 .633-.922Z" />
                        </svg>
                        <span>{profile.streak}</span>
                      </div>
                    )}
                    {profile?.study_hours > 0 && (
                      <div className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 text-[10px] font-bold dark:text-indigo-400" title={`${profile.study_hours} study hours`}>
                        <span>{profile.study_hours}h</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Profile</p>
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  className="mt-1 text-xs font-medium text-muted-foreground hover:text-sidebar-foreground cursor-pointer"
                >
                  Change photo
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Guest</p>
            )}
          </div>
        </div>

        {!isLoggedIn ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onLoginClick}
              className="flex-1 rounded-lg bg-sidebar-primary px-3 py-2 text-sm font-semibold text-sidebar-primary-foreground hover:opacity-90 cursor-pointer"
            >
              Login
            </button>
            <button
              type="button"
              onClick={onRegisterClick}
              className="flex-1 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-semibold text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
            >
              Register
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
