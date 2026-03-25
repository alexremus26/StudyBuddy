import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './components/Sidebar';
import { IntroSection } from './components/AuthSection';
import {
  getMe,
  loginUser,
  registerUser,
  getAuthToken,
  setAuthToken,
} from './api/client';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getAuthToken()));
  const [profile, setProfile] = useState(null);
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [authMode, setAuthMode] = useState('login');

  const handleAuthSubmit = async ({ username, email, password }) => {
    const trimmedUsername = username?.trim();
    const trimmedPassword = password;

    if (!trimmedUsername || !trimmedPassword) {
      throw new Error('Provide both username and password.');
    }

    const payload = { username: trimmedUsername, password: trimmedPassword };
    let data;

    try {
      if (authMode === 'register') {
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
    setShowAuthPanel(false);
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

  return (
    <div className="size-full flex min-h-screen bg-background text-foreground">
      <Sidebar
          isLoggedIn={isLoggedIn}
          profile={profile}
          onLoginClick={() => {
            setAuthMode('login');
            setShowAuthPanel(true);
          }}
          onRegisterClick={() => {
            setAuthMode('register');
            setShowAuthPanel(true);
          }}
        />
      <main className="flex-1 p-4 md:p-8">
        {isLoggedIn ? (
          <div className="rounded-xl border bg-card p-8 shadow-sm">
            <h2>Main App Content - You're logged in!</h2>
            <p className="text-muted-foreground mt-2">
              Insert student dashboard.
            </p>
            {profile ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Logged in as: <span className="font-medium text-foreground">{profile.user?.username || 'User'}</span>
              </p>
            ) : null}
            <button
              onClick={() => {
                setIsLoggedIn(false);
                setAuthToken(null);
                setProfile(null);
                setShowAuthPanel(false);
              }}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
            >
              Logout
            </button>
          </div>
        ) : showAuthPanel ? (
          <IntroSection mode={authMode} onSubmit={handleAuthSubmit} />
        ) : null}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);