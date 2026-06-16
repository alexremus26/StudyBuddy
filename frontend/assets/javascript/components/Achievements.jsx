import { useEffect, useState } from 'react';
import { getAchievements } from '../api/client';

export function Achievements() {
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadAchievements() {
      try {
        setLoading(true);
        const data = await getAchievements();
        setAchievements(data);
      } catch (err) {
        setError(err.message || 'Failed to load achievements');
      } finally {
        setLoading(false);
      }
    }
    loadAchievements();
  }, []);

  // Compute stats based on loaded achievements
  const totalPoints = achievements
    .filter(a => a.earned)
    .reduce((sum, a) => sum + a.points_awarded, 0);

  const unlockedCount = achievements.filter(a => a.earned).length;
  const totalCount = achievements.length;

  const getRarityTier = (rarity) => {
    if (rarity < 25) return { label: 'Legendary', color: 'text-rose-500 border-rose-500/20 bg-rose-500/5' };
    if (rarity < 50) return { label: 'Epic', color: 'text-purple-500 border-purple-500/20 bg-purple-500/5' };
    if (rarity < 75) return { label: 'Rare', color: 'text-blue-500 border-blue-500/20 bg-blue-500/5' };
    return { label: 'Common', color: 'text-muted-foreground border-border bg-muted/5' };
  };

  const renderIcon = (name, earned) => {
    const activeColor = earned ? 'text-primary' : 'text-muted-foreground/40';

    switch (name) {
      case 'First Step':
        return (
          <svg className={`w-8 h-8 ${activeColor}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 11h6M9 15h6" />
          </svg>
        );
      case 'Streak Starter':
        return (
          <svg className={`w-8 h-8 ${earned ? 'text-amber-500' : 'text-muted-foreground/40'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'Streak Elite':
        return (
          <svg className={`w-8 h-8 ${earned ? 'text-rose-500' : 'text-muted-foreground/40'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.3 14.89l2.77-2.77a.75.75 0 011.06 0l2.77 2.77a.75.75 0 010 1.06l-2.77 2.77a.75.75 0 01-1.06 0l-2.77-2.77a.75.75 0 010-1.06z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.23 14.89l2.77-2.77a.75.75 0 011.06 0l2.77 2.77a.75.75 0 010 1.06l-2.77 2.77a.75.75 0 01-1.06 0L2.23 15.95a.75.75 0 010-1.06z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.77 8.35l2.77-2.77a.75.75 0 011.06 0l2.77 2.77a.75.75 0 010 1.06l-2.77 2.77a.75.75 0 01-1.06 0L8.77 9.41a.75.75 0 010-1.06z" />
          </svg>
        );
      case 'Academic Beast':
        return (
          <svg className={`w-8 h-8 ${earned ? 'text-yellow-500' : 'text-muted-foreground/40'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479L12 21l-4.825-3.943a12.084 12.084 0 01.665-6.479L12 14z" />
          </svg>
        );
      case 'Night Owl':
        return (
          <svg className={`w-8 h-8 ${earned ? 'text-indigo-500' : 'text-muted-foreground/40'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        );
      case 'Weekend Warrior':
        return (
          <svg className={`w-8 h-8 ${earned ? 'text-emerald-500' : 'text-muted-foreground/40'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        );
      default:
        return (
          <svg className={`w-8 h-8 ${activeColor}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center text-destructive max-w-lg mx-auto">
        <h3 className="font-semibold text-lg mb-2">Error Loading Achievements</h3>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Achievements & Milestones</h2>
        <p className="text-muted-foreground text-sm">
          Complete study sessions to earn experience points and unlock special badges!
        </p>
      </div>

      {/* Stats Cards Section */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total XP Points</p>
            <h3 className="text-2xl font-bold mt-1 text-primary">{totalPoints} XP</h3>
          </div>
          <div className="p-3 bg-primary/10 rounded-lg text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499c.195-.39.645-.39.84 0l2.235 4.47 5.068.724c.437.062.612.593.297.905l-3.667 3.52.88 4.975c.076.43-.383.77-.762.56L12 18.754l-4.57 2.378c-.379.21-.838-.13-.762-.56l.88-4.975-3.667-3.52c-.315-.313-.14-.843.297-.905l5.068-.724 2.235-4.47z" />
            </svg>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Badges Unlocked</p>
            <h3 className="text-2xl font-bold mt-1">{unlockedCount} / {totalCount}</h3>
          </div>
          <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm flex items-center justify-between sm:col-span-2 lg:col-span-1">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Completion Progress</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-24 bg-secondary h-2.5 rounded-full overflow-hidden shrink-0">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-500" 
                  style={{ width: `${totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs font-semibold">{totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0}%</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Grid of Achievements */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {achievements.map((ach) => {
          const rarity = getRarityTier(ach.rarity);
          return (
            <div
              key={ach.id}
              className={`relative rounded-xl border bg-card p-6 shadow-sm transition-all duration-300 hover:scale-[1.02] ${
                ach.earned
                  ? 'border-indigo-500/30 dark:border-indigo-500/20 bg-indigo-500/[0.02] shadow-[0_0_15px_-3px_rgba(99,102,241,0.05)]'
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className={`p-3 rounded-xl ${ach.earned ? 'bg-card border border-border shadow-inner' : 'bg-muted/10'}`}>
                  {renderIcon(ach.name, ach.earned)}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide ${rarity.color}`}>
                    {rarity.label}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">
                    +{ach.points_awarded} XP
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-lg leading-none">{ach.name}</h4>
                  {ach.earned ? (
                    <span className="text-emerald-500" title="Unlocked!">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40" title="Locked">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed min-h-[40px]">
                  {ach.description}
                </p>

                {ach.earned && ach.earned_at && (
                  <div className="pt-2 text-[10px] text-muted-foreground flex items-center gap-1 border-t border-border/40">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                    </svg>
                    <span>Earned: {new Date(ach.earned_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
