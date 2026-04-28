import React, { useState } from 'react';

export function LandingPage({ onAuthSubmit }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        username: username.trim(),
        password,
        ...(mode === 'register' ? { email: email.trim() || username.trim() } : {}),
      };
      await onAuthSubmit(payload, mode);
    } catch (err) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fb] font-['Plus_Jakarta_Sans'] text-[#191c1e] antialiased overflow-x-hidden flex flex-col">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b bg-white/80 backdrop-blur-md border-slate-200/50 shadow-sm shadow-indigo-500/5">
        <nav className="flex justify-between items-center h-16 px-6 md:px-12 w-full mx-auto max-w-7xl">
          <div className="flex items-center gap-8">
            <span className="text-2xl font-bold tracking-tight text-indigo-600">StudyBuddy</span>
            <div className="hidden md:flex items-center gap-6">
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setMode('login')}
              className="text-slate-600 hover:bg-slate-50 transition-all duration-200 active:scale-95 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Login
            </button>
            <button 
              onClick={() => setMode('register')}
              className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/20 active:scale-95 transition-transform"
            >
              Get Started
            </button>
          </div>
        </nav>
      </header>

      <main className="flex-1 pt-32 pb-24 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Hero Content */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 font-semibold text-xs border border-indigo-100">
              <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
              New: AI-Powered Study Planner
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-[#191c1e] leading-[1.2] tracking-tight">
              Ace your exams with <span className="text-indigo-600">StudyBuddy</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 max-w-md leading-relaxed">
              Transform your academic journey with the world's most intuitive deep work platform. Planned by experts, powered by AI.
            </p>
            
            {/* Minimalist Coffee Image */}
            <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-slate-100 border border-slate-200 shadow-2xl shadow-indigo-500/5 mt-12">
              <img 
                className="w-full h-full object-cover" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBMUDnVPiC3k-7dWE6dHra37FvOK7cCCFA3dW5Ig4yljsWIDZBhXP2XGQvethrfaWVmazzTjf1bVQuA_n6Hsgp4zrKG6ITtzaDW8Nqc_UE9MPirOV32J1z-rNOerjdyeSBKaJSovRKNckt_60aOKRvRz6WGCo7tOBYEoZlZS99PvhstLdflpKnkyFjqGSt1DJ55nN0ko-bhzjp6ZjO30sDgewtKSv4sKqF9VirJtQCvnyMJ1RgbbH2vUYjELS_ttYKGQVAdVjtpq6XJ" 
                alt="minimalist study desk with coffee" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
            </div>
          </div>

          {/* Login/Register Card */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-indigo-500/5 p-8 md:p-12 border border-slate-100">
              <div className="mb-10 text-center">
                <h2 className="text-2xl font-bold text-[#191c1e] mb-2">
                  {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-sm font-medium text-slate-500">
                  {mode === 'login' ? 'Ready to start your deep work session?' : 'Join thousands of students achieving excellence.'}
                </p>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191c1e] ml-1">
                    {mode === 'register' ? 'Username' : 'Email or Username'}
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">person</span>
                    <input 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none bg-[#f7f9fb]" 
                      placeholder={mode === 'register' ? 'choose a username' : 'student@university.edu'}
                      required
                    />
                  </div>
                </div>

                {mode === 'register' && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#191c1e] ml-1">Email Address</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">mail</span>
                      <input 
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none bg-[#f7f9fb]" 
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#191c1e] ml-1">Password</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">lock</span>
                    <input 
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none bg-[#f7f9fb]" 
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                {mode === 'login' && (
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" type="checkbox"/>
                      <span className="text-slate-500">Remember me</span>
                    </label>
                    <a className="text-indigo-600 hover:underline" href="#">Forgot Password?</a>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : (mode === 'login' ? 'Log In' : 'Create Account')}
                </button>
              </form>

              {error && <p className="mt-4 text-center text-sm text-red-600 font-medium">{error}</p>}

              <p className="mt-8 text-center text-sm font-semibold text-slate-500">
                {mode === 'login' ? "New to StudyBuddy?" : "Already have an account?"} {' '}
                <button 
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  {mode === 'login' ? 'Create an account' : 'Log in here'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section className="py-24 px-6 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl font-extrabold tracking-tight">Designed for academic excellence.</h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">Focus on what matters most. Our ecosystem provides everything you need to dominate your curriculum.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-slate-50 p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all relative overflow-hidden group">
              <div className="relative z-10 space-y-4">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined">psychology</span>
                </div>
                <h3 className="text-xl font-bold">AI-Driven Methodology</h3>
                <p className="text-slate-600 max-w-md">Our algorithms analyze your learning pace and exam dates to create the optimal study trajectory.</p>
              </div>
            </div>
            <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-500/20 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-white/10 text-white rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined">timer</span>
                </div>
                <h3 className="text-xl font-bold">Focus Sessions</h3>
                <p className="text-indigo-100">Dedicated blocks for distraction-free learning.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-12 border-t mt-auto bg-slate-50 border-slate-200 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-lg">StudyBuddy</span>
            <span className="text-slate-400">|</span>
            <p>© 2024 StudyBuddy. Designed for academic excellence.</p>
          </div>
          <div className="flex gap-6">
          </div>
        </div>
      </footer>
    </div>
  );
}
