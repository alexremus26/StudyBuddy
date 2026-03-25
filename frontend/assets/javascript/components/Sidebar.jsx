export function Sidebar({ isLoggedIn = false, profile = null, onLoginClick = () => {}, onRegisterClick = () => {} }) {
  const initial = profile?.user?.username ? profile.user.username.charAt(0).toUpperCase() : '·';

  return (
    <aside className="hidden w-72 shrink-0 border-r border-sidebar-border bg-sidebar p-6 md:flex md:flex-col">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">StudyBuddy</p>
        <h1 className="text-2xl font-semibold text-sidebar-foreground">Dashboard</h1>
      </div>

      <nav className="mt-8 space-y-2">
        <a
          href="#"
          className="block rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-medium text-sidebar-accent-foreground"
        >
          Home
        </a>
        <a
          href="#"
          className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent"
        >
          Schedule
        </a>
        <a
          href="#"
          className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent"
        >
          Focus Sessions
        </a>
      </nav>

      <div className="mt-auto pt-8">
        <div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-3 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-lg font-semibold text-sidebar-foreground">
            {initial}
          </div>

          <div className="flex-1">
            {isLoggedIn ? (
              <>
                <p className="text-sm font-semibold text-sidebar-foreground">{profile?.user?.username || 'User'}</p>
                <p className="text-xs text-muted-foreground">Profile</p>
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
