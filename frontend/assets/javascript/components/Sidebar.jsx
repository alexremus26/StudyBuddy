import { useEffect, useRef, useState } from 'react';

export function Sidebar({ isLoggedIn = false, profile = null, currentTab = 'home', onTabChange = () => {}, onLoginClick = () => {}, onRegisterClick = () => {}, onAvatarUpload = async () => {} }) {
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
            className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              currentTab === tab.id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-8">
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
