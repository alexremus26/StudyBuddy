import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlacesMap } from './PlacesMap';
import { AIStudyFinder } from './AIStudyFinder';

export function StudyPlaceFinder({ selectionMode = false, onSelectLocation = null }) {
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' or 'map'
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (activeTab !== 'map') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeTab]);

  useEffect(() => {
    // If we receive a location ID from schedule or AI, jump to map
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('location') || location.state?.forceMap) {
      setActiveTab('map');
      
      // Clean up the URL state if forceMap was used
      if (location.state?.forceMap) {
        navigate(location.pathname + location.search, { replace: true, state: { ...location.state, forceMap: undefined } });
      }
    }
  }, [location, navigate]);

  const handleSeeOnMap = (locationId) => {
    setActiveTab('map');
    if (!selectionMode) {
      navigate(`/cafes?location=${locationId}`, { replace: true });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Top Navigation */}
      <div className="flex-none p-4 border-b bg-card">
        <div className="max-w-md mx-auto bg-muted p-1 rounded-xl flex">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 py-2 px-4 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'ai'
                ? 'bg-background shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
          >
            <svg className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.813 15.904L9 21l-1.813-5.096L2.091 14 7.187 12.187 9 7l1.813 5.187L15.909 14l-5.096 1.904zM19.006 5.005L18.5 7l-.506-1.995L16 4.5l1.994-.506L18.5 2l.506 1.994L21 4.5l-1.994.505z" />
            </svg>
            <span>AI Study Finder</span>
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`flex-1 py-2 px-4 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'map'
                ? 'bg-background shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
          >
            <svg className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span>Map View</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* We keep the map mounted but hidden with CSS to avoid Mapbox re-initialization */}
        <div className={`absolute inset-0 ${activeTab === 'map' ? 'z-10 opacity-100' : '-z-10 opacity-0 pointer-events-none'}`}>
          <PlacesMap selectionMode={selectionMode} onSelectLocation={onSelectLocation} />
        </div>
        
        {activeTab === 'ai' && (
          <div className="absolute inset-0 z-10 overflow-y-auto">
            <AIStudyFinder onSeeOnMap={handleSeeOnMap} selectionMode={selectionMode} onSelectLocation={onSelectLocation} />
          </div>
        )}
      </div>
    </div>
  );
}
