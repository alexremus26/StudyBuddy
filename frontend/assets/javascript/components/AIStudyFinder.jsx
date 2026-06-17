import { useState, useEffect } from 'react';
import { listAssignments, recommendByAssignment, recommendByMood, updateAssignment } from '../api/client';

const AI_FINDER_SESSION_KEY = 'studybuddy:ai-finder-state';

const MOOD_PRESETS = [
  {
    icon: 'volume_off',
    label: 'Silent Focus',
    text: 'I need a very quiet place like a library for intense focus and exam preparation. Minimise background noise.',
    color: 'hover:bg-red-500/10 hover:text-red-700 hover:border-red-500/20 dark:hover:bg-red-500/20 dark:hover:text-red-300'
  },
  {
    icon: 'coffee',
    label: 'Café Vibe',
    text: 'Looking for a classic café atmosphere with pleasant ambient noise, good music, and delicious coffee/pastries.',
    color: 'hover:bg-amber-500/10 hover:text-amber-700 hover:border-amber-500/20 dark:hover:bg-amber-500/20 dark:hover:text-amber-300'
  },
  {
    icon: 'group',
    label: 'Group Work',
    text: 'A spacious place with larger tables suitable for meeting up with friends to talk and work on projects together.',
    color: 'hover:bg-blue-500/10 hover:text-blue-700 hover:border-blue-500/20 dark:hover:bg-blue-500/20 dark:hover:text-blue-300'
  },
  {
    icon: 'power',
    label: 'Need Outlets',
    text: 'My laptop battery is low, so I need a spot with plenty of accessible wall power sockets and table space.',
    color: 'hover:bg-purple-500/10 hover:text-purple-700 hover:border-purple-500/20 dark:hover:bg-purple-500/20 dark:hover:text-purple-300'
  },
  {
    icon: 'forest',
    label: 'Outdoor Spot',
    text: 'I want to study in an open space like a garden terrace, patio, or near windows with nice outdoor natural light.',
    color: 'hover:bg-emerald-500/10 hover:text-emerald-700 hover:border-emerald-500/20 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300'
  }
];

function loadPersistedAIState() {
  try {
    const raw = window.sessionStorage.getItem(AI_FINDER_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function AIStudyFinder({ onSeeOnMap, selectionMode = false, onSelectLocation = null }) {
  const persisted = loadPersistedAIState();
  const [activeSubTab, setActiveSubTab] = useState(persisted?.activeSubTab === 'mood' ? 'mood' : 'assignment'); // 'assignment' or 'mood'
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(persisted?.selectedAssignmentId || '');
  const [moodText, setMoodText] = useState(persisted?.moodText || '');

  // Separate states for assignment and mood tabs, with fallback to old structure for backward compatibility
  const [assignmentRecommendation, setAssignmentRecommendation] = useState(
    persisted?.assignmentRecommendation || (persisted?.activeSubTab !== 'mood' ? persisted?.recommendation : null) || null
  );
  const [moodRecommendation, setMoodRecommendation] = useState(
    persisted?.moodRecommendation || (persisted?.activeSubTab === 'mood' ? persisted?.recommendation : null) || null
  );

  const [assignmentError, setAssignmentError] = useState(
    persisted?.assignmentError || (persisted?.activeSubTab !== 'mood' ? persisted?.error : null) || null
  );
  const [moodError, setMoodError] = useState(
    persisted?.moodError || (persisted?.activeSubTab === 'mood' ? persisted?.error : null) || null
  );

  const [assignmentPendingRequest, setAssignmentPendingRequest] = useState(
    persisted?.assignmentPendingRequest || (persisted?.activeSubTab !== 'mood' ? persisted?.pendingRequest : null) || null
  );
  const [moodPendingRequest, setMoodPendingRequest] = useState(
    persisted?.moodPendingRequest || (persisted?.activeSubTab === 'mood' ? persisted?.pendingRequest : null) || null
  );

  // Derived properties based on active tab
  const recommendation = activeSubTab === 'assignment' ? assignmentRecommendation : moodRecommendation;
  const error = activeSubTab === 'assignment' ? assignmentError : moodError;
  const pendingRequest = activeSubTab === 'assignment' ? assignmentPendingRequest : moodPendingRequest;
  const loading = Boolean(pendingRequest);

  const recommendationItems = Array.isArray(recommendation?.recommendations)
    ? recommendation.recommendations
    : Array.isArray(recommendation?.candidate_locations)
      ? recommendation.candidate_locations
      : recommendation?.location_id != null
        ? [recommendation]
        : [];

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        AI_FINDER_SESSION_KEY,
        JSON.stringify({
          activeSubTab,
          selectedAssignmentId,
          moodText,
          assignmentRecommendation,
          moodRecommendation,
          assignmentError,
          moodError,
          assignmentPendingRequest,
          moodPendingRequest,
        }),
      );
    } catch {
      // Ignore storage errors in private mode or quota limits.
    }
  }, [
    activeSubTab,
    selectedAssignmentId,
    moodText,
    assignmentRecommendation,
    moodRecommendation,
    assignmentError,
    moodError,
    assignmentPendingRequest,
    moodPendingRequest,
  ]);

  useEffect(() => {
    async function fetchAssignments() {
      try {
        const data = await listAssignments();
        // only show uncompleted tasks
        setAssignments(data.filter(a => !a.is_completed));
      } catch (err) {
        console.error("Failed to load assignments", err);
      }
    }
    fetchAssignments();
  }, []);

  const runRecommendation = async (request) => {
    if (request.mode === 'assignment') {
      setAssignmentPendingRequest(request);
      setAssignmentError(null);
      setAssignmentRecommendation(null);
    } else {
      setMoodPendingRequest(request);
      setMoodError(null);
      setMoodRecommendation(null);
    }

    try {
      const res = request.mode === 'assignment'
        ? await recommendByAssignment(request.assignmentId)
        : await recommendByMood(request.moodText);

      if (!res || (res.location_id == null && !Array.isArray(res.recommendations) && !Array.isArray(res.candidate_locations))) {
        throw new Error('AI did not return a valid study place.');
      }

      if (request.mode === 'assignment') {
        setAssignmentRecommendation(res);
        setAssignmentPendingRequest(null);
      } else {
        setMoodRecommendation(res);
        setMoodPendingRequest(null);
      }
    } catch (err) {
      const errMsg = err.message || 'Failed to get AI recommendation. Please try again.';
      if (request.mode === 'assignment') {
        setAssignmentError(errMsg);
        setAssignmentPendingRequest(null);
      } else {
        setMoodError(errMsg);
        setMoodPendingRequest(null);
      }
    }
  };

  useEffect(() => {
    if (assignmentPendingRequest && !assignmentRecommendation) {
      void runRecommendation(assignmentPendingRequest);
    }
    if (moodPendingRequest && !moodRecommendation) {
      void runRecommendation(moodPendingRequest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRecommendByAssignment = async () => {
    if (!selectedAssignmentId) {
      setAssignmentError("Please select an assignment first.");
      return;
    }

    await runRecommendation({ mode: 'assignment', assignmentId: selectedAssignmentId });
  };

  const handleRecommendByMood = async () => {
    if (!moodText.trim()) {
      setMoodError("Please enter your mood first.");
      return;
    }
    await runRecommendation({ mode: 'mood', moodText: moodText.trim() });
  };

  return (
    <div className="h-full flex flex-col bg-background/50 overflow-y-auto w-full max-w-4xl mx-auto p-4 md:p-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-500">
          AI Study Finder
        </h2>
        <p className="text-muted-foreground mt-2">
          Let AI find the perfect environment for your current needs.
        </p>
      </div>

      <div className="max-w-[360px] mx-auto bg-muted/60 p-1 rounded-full flex gap-1 mb-8 border backdrop-blur-sm">
        <button
          onClick={() => setActiveSubTab('assignment')}
          className={`flex-1 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
            activeSubTab === 'assignment'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          By Assignment
        </button>
        <button
          onClick={() => setActiveSubTab('mood')}
          className={`flex-1 py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
            activeSubTab === 'mood'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          By Mood
        </button>
      </div>

      <div className="bg-card border rounded-3xl p-6 md:p-8 shadow-sm mb-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {activeSubTab === 'assignment' ? (
          <div className="space-y-4">
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">Select an assignment to work on:</label>
            {assignments.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-2xl bg-muted/5">
                <span className="material-symbols-outlined text-[36px] text-muted-foreground/40 mb-2">assignment_late</span>
                <p className="text-sm text-muted-foreground italic">No uncompleted assignments found. Add some in your Schedule!</p>
              </div>
            ) : (
              <div className="grid gap-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                {assignments.map(a => {
                  const isSelected = selectedAssignmentId === a.id.toString();
                  const categoryColors = {
                    homework: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
                    project: 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30',
                    exam: 'bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
                    reading: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
                    other: 'bg-gray-500/10 text-gray-700 border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/30',
                  };
                  const badgeClass = categoryColors[a.category?.toLowerCase()] || categoryColors.other;

                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAssignmentId(a.id.toString())}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-500/[0.02] shadow-sm ring-1 ring-indigo-500/10'
                          : 'border-border/60 bg-card hover:bg-muted/40 hover:border-border'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-bold text-sm truncate ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-foreground'}`}>
                            {a.title}
                          </p>
                          {a.category && (
                            <span className={`px-2 py-0.5 rounded border text-[9px] font-bold capitalize tracking-wide ${badgeClass}`}>
                              {a.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-2 text-[11px] text-muted-foreground mt-1.5">
                          <span className="flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">event</span>
                            Due: {a.due_date ? new Date(a.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : 'No date'}
                          </span>
                          {a.estimated_duration_minutes && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[12px]">schedule</span>
                                {a.estimated_duration_minutes} mins
                              </span>
                            </>
                          )}
                        </div>
                        {a.study_location_detail && (
                          <div className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 px-2.5 py-1 rounded-xl self-start w-fit border border-emerald-500/10">
                            <span className="material-symbols-outlined text-[14px]">pin_drop</span>
                            <span className="truncate">Associated spot: {a.study_location_detail.name}</span>
                          </div>
                        )}
                      </div>
                      
                      {a.study_location && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSeeOnMap(a.study_location);
                          }}
                          className="px-3 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/80 dark:text-indigo-400 rounded-xl flex items-center gap-1.5 transition-colors self-start md:self-auto font-bold border border-indigo-200/20 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">map</span>
                          <span>See on Map</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={handleRecommendByAssignment}
              disabled={loading || !selectedAssignmentId}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 mt-4 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white rounded-2xl font-bold shadow-md shadow-indigo-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />}
              <span>{loading ? "Analyzing locations..." : "Find my spot"}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">Select a vibe to pre-fill:</label>
              <div className="flex flex-wrap gap-2">
                {MOOD_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setMoodText(preset.text)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold text-muted-foreground bg-background hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer ${preset.color}`}
                  >
                    <span className="material-symbols-outlined text-[14px]">{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">Or describe what you are feeling today:</label>
              <textarea
                placeholder="e.g. I need a very quiet place to focus deeply for 3 hours, preferably with good coffee."
                className="w-full p-4 rounded-2xl border bg-background text-foreground focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/80 outline-none transition-all resize-none shadow-inner placeholder:text-muted-foreground/40 text-sm leading-relaxed"
                rows={3}
                value={moodText}
                onChange={(e) => setMoodText(e.target.value)}
              />
            </div>
            <button
              onClick={handleRecommendByMood}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 mt-4 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white rounded-2xl font-bold shadow-md shadow-indigo-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />}
              <span>{loading ? "Analyzing locations..." : "Find my spot"}</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-4 rounded-2xl mb-8 animate-in fade-in flex items-center gap-2 text-sm font-semibold">
          <span className="material-symbols-outlined">error</span>
          <span>{error}</span>
        </div>
      )}

      {recommendation && (
        <div className="bg-gradient-to-br from-indigo-50/60 to-blue-50/60 dark:from-indigo-950/20 dark:to-blue-950/20 border border-indigo-100/50 dark:border-indigo-900/40 rounded-3xl p-6 md:p-8 shadow-lg animate-in zoom-in-95 duration-300">
          <h3 className="text-lg font-extrabold mb-5 flex items-center gap-2 text-foreground">
            <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">auto_awesome</span>
            <span>AI Recommendation Shortlist</span>
          </h3>
          {recommendationItems.length === 0 ? (
            <p className="mb-4 text-sm text-muted-foreground italic">
              The AI did not return usable places, so no shortlist can be shown.
            </p>
          ) : null}
          <div className="space-y-4">
            {recommendationItems.map((item, index) => {
              const label = item.location_name || `Suggested place ${index + 1}`;
              const reason = item.reason || 'No explanation provided.';
              const locationId = item.location_id;

              const badges = [
                'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400 dark:bg-amber-500/20',
                'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:text-indigo-400 dark:bg-indigo-500/20',
                'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400 dark:bg-blue-500/20'
              ];
              const borderStyles = [
                'border-l-4 border-l-amber-500',
                'border-l-4 border-l-indigo-500',
                'border-l-4 border-l-blue-500'
              ];
              const badgeNames = ['Top Pick', 'Highly Recommended', 'Good Match'];

              const selectedAssignment = assignments.find(a => a.id.toString() === selectedAssignmentId);
              const isAlreadyAssociated = selectedAssignment?.study_location === locationId;

              return (
                <div
                  key={`${locationId ?? index}-${index}`}
                  className={`rounded-2xl border bg-background p-5 md:p-6 shadow-sm hover:scale-[1.01] hover:shadow-md transition-all duration-300 flex flex-col ${borderStyles[index] || ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <p className="text-base font-extrabold text-foreground truncate">{label}</p>
                        <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-extrabold tracking-wider uppercase shrink-0 ${badges[index] || 'bg-muted text-muted-foreground'}`}>
                          {badgeNames[index] || `Match #${index + 1}`}
                        </span>
                      </div>
                      <p className="mt-2.5 text-xs md:text-sm text-muted-foreground leading-relaxed font-medium">{reason}</p>
                    </div>
                    <span className="shrink-0 flex items-center justify-center h-8 w-8 rounded-xl bg-muted/60 text-foreground font-black text-sm">
                      #{index + 1}
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3 border-t border-muted/50 pt-4">
                    <button
                      onClick={() => onSeeOnMap(locationId)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:opacity-95 font-bold transition-all shadow-sm flex items-center gap-1.5 text-xs cursor-pointer"
                      disabled={locationId == null}
                    >
                      <span className="material-symbols-outlined text-[14px]">map</span>
                      <span>See on Map</span>
                    </button>
                    {selectionMode && (
                      <button
                        onClick={() => onSelectLocation({ id: locationId, name: label })}
                        className="px-4 py-2 border border-input rounded-xl hover:bg-secondary transition-colors font-bold flex items-center gap-1.5 text-xs cursor-pointer"
                        disabled={locationId == null}
                      >
                        <span className="material-symbols-outlined text-[14px]">check</span>
                        <span>Select this place</span>
                      </button>
                    )}
                    {!selectionMode && selectedAssignmentId && (
                      isAlreadyAssociated ? (
                        <span className="px-4 py-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 rounded-xl font-bold flex items-center gap-1.5 text-xs select-none">
                          <span className="material-symbols-outlined text-[14px] text-emerald-500">task_alt</span>
                          <span>Assigned spot</span>
                        </span>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await updateAssignment(selectedAssignmentId, { study_location: locationId });
                              const data = await listAssignments();
                              setAssignments(data.filter(a => !a.is_completed));
                            } catch (err) {
                              console.error("Failed to associate location with assignment", err);
                            }
                          }}
                          className="px-4 py-2 border border-indigo-200 hover:border-indigo-400 text-indigo-600 dark:border-indigo-900 dark:hover:border-indigo-700 dark:text-indigo-400 rounded-xl transition-all font-bold flex items-center gap-1.5 text-xs cursor-pointer"
                          disabled={locationId == null}
                        >
                          <span className="material-symbols-outlined text-[14px]">add_circle</span>
                          <span>Choose for assignment</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
