import { useState, useEffect } from 'react';
import { listAssignments, recommendByAssignment, recommendByMood, updateAssignment } from '../api/client';

const AI_FINDER_SESSION_KEY = 'studybuddy:ai-finder-state';

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

      <div className="flex justify-center gap-4 mb-8">
        <button
          onClick={() => setActiveSubTab('assignment')}
          className={`px-6 py-2 rounded-full font-medium transition-all ${
            activeSubTab === 'assignment'
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          By Assignment
        </button>
        <button
          onClick={() => setActiveSubTab('mood')}
          className={`px-6 py-2 rounded-full font-medium transition-all ${
            activeSubTab === 'mood'
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          By Mood
        </button>
      </div>

      <div className="bg-card border rounded-2xl p-6 shadow-sm mb-8 animate-in fade-in slide-in-from-bottom-4">
        {activeSubTab === 'assignment' ? (
          <div className="space-y-4">
            <label className="block font-medium text-sm text-muted-foreground uppercase tracking-wider">Select an assignment to work on:</label>
            {assignments.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-xl bg-muted/5">
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
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-primary bg-primary/[0.02] shadow-sm ring-1 ring-primary/10'
                          : 'border-border/60 bg-card hover:bg-muted/40 hover:border-border'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                            {a.title}
                          </p>
                          {a.category && (
                            <span className={`px-2 py-0.5 rounded border text-[9px] font-semibold capitalize tracking-wide ${badgeClass}`}>
                              {a.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-2 text-[11px] text-muted-foreground mt-1">
                          <span>Due: {a.due_date ? new Date(a.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : 'No date'}</span>
                          {a.estimated_duration_minutes && (
                            <>
                              <span>•</span>
                              <span>{a.estimated_duration_minutes} mins</span>
                            </>
                          )}
                        </div>
                        {a.study_location_detail && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
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
                          className="px-3 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/80 dark:text-indigo-400 rounded-lg flex items-center gap-1.5 transition-colors self-start md:self-auto"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                          </svg>
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
              className="w-full py-3 mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-medium shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Analyzing locations..." : "Find my spot"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block font-medium">What are you feeling today?</label>
            <textarea
              placeholder="e.g. I need a very quiet place to focus deeply for 3 hours, preferably with good coffee."
              className="w-full p-3 rounded-xl border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all resize-none"
              rows={3}
              value={moodText}
              onChange={(e) => setMoodText(e.target.value)}
            />
            <button
              onClick={handleRecommendByMood}
              disabled={loading}
              className="w-full py-3 mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-medium shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Analyzing locations..." : "Find my spot"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-4 rounded-xl mb-8 animate-in fade-in">
          {error}
        </div>
      )}

      {recommendation && (
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-6 shadow-lg animate-in zoom-in-95 duration-300">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.813 15.904L9 21l-1.813-5.096L2.091 14 7.187 12.187 9 7l1.813 5.187L15.909 14l-5.096 1.904zM19.006 5.005L18.5 7l-.506-1.995L16 4.5l1.994-.506L18.5 2l.506 1.994L21 4.5l-1.994.505z" />
            </svg>
            <span>AI Recommendation</span>
          </h3>
          {recommendationItems.length === 0 ? (
            <p className="mb-4 text-sm text-muted-foreground">
              The AI did not return usable places, so no shortlist can be shown.
            </p>
          ) : null}
          <div className="space-y-4">
            {recommendationItems.map((item, index) => {
              const label = item.location_name || `Suggested place ${index + 1}`;
              const reason = item.reason || 'No explanation provided.';
              const locationId = item.location_id;

              const badges = [
                'bg-amber-500/15 text-amber-700 border-amber-500/20 dark:text-amber-400 dark:bg-amber-500/20',
                'bg-indigo-500/15 text-indigo-700 border-indigo-500/20 dark:text-indigo-400 dark:bg-indigo-500/20',
                'bg-blue-500/15 text-blue-700 border-blue-500/20 dark:text-blue-400 dark:bg-blue-500/20'
              ];
              const badgeNames = ['Top Pick', 'Highly Recommended', 'Good Match'];

              const selectedAssignment = assignments.find(a => a.id.toString() === selectedAssignmentId);
              const isAlreadyAssociated = selectedAssignment?.study_location === locationId;

              return (
                <div
                  key={`${locationId ?? index}-${index}`}
                  className="rounded-2xl border bg-background p-5 shadow-sm hover:scale-[1.01] hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-bold text-foreground truncate">{label}</p>
                        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold tracking-wide uppercase shrink-0 ${badges[index] || 'bg-muted text-muted-foreground'}`}>
                          {badgeNames[index] || `Match #${index + 1}`}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{reason}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      #{index + 1}
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3 border-t pt-4">
                    <button
                      onClick={() => onSeeOnMap(locationId)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 font-medium transition-all shadow-sm flex items-center gap-1.5 text-xs"
                      disabled={locationId == null}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      <span>See on Map</span>
                    </button>
                    {selectionMode && (
                      <button
                        onClick={() => onSelectLocation({ id: locationId, name: label })}
                        className="px-4 py-2 border border-input rounded-xl hover:bg-secondary transition-colors font-medium flex items-center gap-1.5 text-xs"
                        disabled={locationId == null}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Select this place</span>
                      </button>
                    )}
                    {!selectionMode && selectedAssignmentId && (
                      isAlreadyAssociated ? (
                        <span className="px-4 py-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 rounded-xl font-medium flex items-center gap-1.5 text-xs">
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
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
                          className="px-4 py-2 border border-indigo-200 hover:border-indigo-400 text-indigo-600 dark:border-indigo-900 dark:hover:border-indigo-700 dark:text-indigo-400 rounded-xl transition-all font-medium flex items-center gap-1.5 text-xs"
                          disabled={locationId == null}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
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
