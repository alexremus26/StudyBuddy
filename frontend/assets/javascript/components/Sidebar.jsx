import { useEffect, useRef, useState } from 'react';

export function Sidebar({ isLoggedIn = false, profile = null, currentTab = 'home', onTabChange = () => { }, onLoginClick = () => { }, onRegisterClick = () => { }, onAvatarUpload = async () => { } }) {
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
    { id: 'cafes', label: 'Find My Café' },
    { id: 'focus', label: 'Focus Sessions' },
  ];

  return (
    <aside className="hidden w-72 shrink-0 border-r border-sidebar-border bg-sidebar p-6 md:flex md:flex-col sticky top-0">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">StudyBuddy</p>
        <h1 className="text-2xl font-semibold text-sidebar-foreground">Dashboard</h1>
      </div>

      <nav className="mt-8 space-y-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${currentTab === tab.id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-8 space-y-3">
        <button
          type="button"
          onClick={() => {
            const root = document.documentElement;
            const isDark = root.classList.toggle('dark');
            try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch {}
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar text-lg font-semibold text-sidebar-foreground"
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
                <p className="text-sm font-semibold text-sidebar-foreground">{profile?.username}</p>
                <p className="text-xs text-muted-foreground">Profile</p>
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  className="mt-1 text-xs font-medium text-muted-foreground hover:text-sidebar-foreground"
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
              className="flex-1 rounded-lg bg-sidebar-primary px-3 py-2 text-sm font-semibold text-sidebar-primary-foreground hover:opacity-90"
            >
              Login
            </button>
            <button
              type="button"
              onClick={onRegisterClick}
              className="flex-1 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-semibold text-sidebar-foreground hover:bg-sidebar-accent"
            >
              Register
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
