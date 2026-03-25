import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getAuthToken, loginUser, registerUser, setAuthToken } from './api/client';

function AuthPanel() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(getAuthToken() || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'register') {
        await registerUser({ username, email, password });
        setMessage('Registration successful. You can now log in.');
        setMode('login');
      } else {
        const response = await loginUser({ username, password });
        setAuthToken(response.token);
        setToken(response.token);
        setMessage('Logged in successfully. Token stored in localStorage.');
      }
    } catch (err) {
      setError(err.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setAuthToken('');
    setToken('');
    setMessage('Logged out locally.');
    setError('');
  }

  return (
    <div className="rounded-2xl border border-emerald-200/30 bg-emerald-950/60 p-6 shadow-xl">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`rounded px-4 py-2 text-sm font-semibold ${
            mode === 'login' ? 'bg-white text-emerald-900' : 'border border-white/60 text-white'
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`rounded px-4 py-2 text-sm font-semibold ${
            mode === 'register' ? 'bg-white text-emerald-900' : 'border border-white/60 text-white'
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3">
        <input
          className="rounded border border-emerald-200/40 bg-emerald-900/70 px-3 py-2 text-white placeholder-emerald-200/70"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        {mode === 'register' ? (
          <input
            type="email"
            className="rounded border border-emerald-200/40 bg-emerald-900/70 px-3 py-2 text-white placeholder-emerald-200/70"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        ) : null}

        <input
          type="password"
          className="rounded border border-emerald-200/40 bg-emerald-900/70 px-3 py-2 text-white placeholder-emerald-200/70"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-white px-4 py-2 font-semibold text-emerald-900 disabled:opacity-50"
        >
          {loading ? 'Please wait...' : mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-emerald-100">Token: {token ? 'stored' : 'not set'}</p>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded border border-amber-300 px-3 py-1 text-sm font-semibold text-amber-200"
        >
          Logout
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-emerald-200">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('home');

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 text-white">
      <header className="mb-8 rounded-2xl border border-emerald-200/30 bg-gradient-to-br from-emerald-800 to-emerald-600 p-6 shadow-2xl">
        <h1 className="text-4xl font-black tracking-tight">StudyBuddy</h1>
        <p className="mt-2 text-emerald-100">Simple starter shell with Home and Auth tabs.</p>
      </header>

      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('home')}
          className={`rounded px-4 py-2 text-sm font-semibold ${
            tab === 'home' ? 'bg-white text-emerald-900' : 'border border-white/60 text-white'
          }`}
        >
          Home
        </button>
        <button
          type="button"
          onClick={() => setTab('auth')}
          className={`rounded px-4 py-2 text-sm font-semibold ${
            tab === 'auth' ? 'bg-white text-emerald-900' : 'border border-white/60 text-white'
          }`}
        >
          Auth
        </button>
      </div>

      {tab === 'home' ? (
        <section className="rounded-2xl border border-emerald-200/30 bg-emerald-900/40 p-6">
          <h2 className="text-2xl font-bold">Home</h2>
          <p className="mt-3 text-emerald-100">
            Welcome to your StudyBuddy frontend shell. Open the Auth tab to register or log in against
            your Django API.
          </p>
        </section>
      ) : (
        <AuthPanel />
      )}
    </main>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);