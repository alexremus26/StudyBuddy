import { useState } from 'react';

export function IntroSection({ mode = 'login', onSubmit }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        username: username.trim(),
        password,
        ...(mode === 'register'
          ? { email: email.trim() || username.trim() }
          : {}),
      };

      await onSubmit(payload);
    } catch (submitError) {
      setError(submitError?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  const isRegister = mode === 'register';
  const title = isRegister ? 'Create an account' : 'Welcome to StudyBuddy';
  const submitLabel = isRegister ? 'Create account' : 'Sign in';

  return (
    <section className="mx-auto max-w-xl rounded-2xl border bg-card p-8 shadow-sm">
      <h2 className="text-2xl">{title}</h2>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block">
            {mode === 'register' ? 'Username' : 'Email or Username'}
          </label>
          <input
            id="email"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-lg border border-input bg-input-background px-3 py-2"
            placeholder={mode === 'register' ? 'choose a unique username' : 'yourname'}
            autoComplete="username"
            required
          />
        </div>

        {mode === 'register' ? (
          <div>
            <label htmlFor="register-email" className="mb-1 block">
              Email address
            </label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-input bg-input-background px-3 py-2"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="password" className="mb-1 block">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-input bg-input-background px-3 py-2"
            placeholder="********"
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? `${submitLabel}...` : submitLabel}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
