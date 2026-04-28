import React, { useState, useEffect } from 'react';
import { generatePlan, listPlanDrafts, approvePlan, listSchoolClasses, deletePlan } from '../api/client';
import { MonthlyCalendar } from './MonthlyCalendar';

export function Planner() {
  const [drafts, setDrafts] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);
  const [schoolClasses, setSchoolClasses] = useState([]);
  
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  });
  
  const fetchDrafts = async () => {
    try {
      setIsFetching(true);
      const data = await listPlanDrafts();
      setDrafts(data);
    } catch (err) {
      setError(err.message || 'Failed to load drafts');
    } finally {
      setIsFetching(false);
    }
  };
  
  const fetchClasses = async () => {
    try {
      const data = await listSchoolClasses();
      setSchoolClasses(data || []);
    } catch (err) {
      console.error(err);
    }
  };
  
  const loadData = async () => {
    setIsFetching(true);
    await Promise.all([fetchDrafts(), fetchClasses()]);
    setIsFetching(false);
  };
  
  useEffect(() => {
    loadData();
  }, []);
  
  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      await generatePlan({ start_date: startDate, end_date: endDate });
      await fetchDrafts();
    } catch (err) {
      setError(err.message || 'Failed to generate plan');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleApprove = async (planId) => {
    try {
      setApprovingId(planId);
      setError(null);
      await approvePlan(planId);
      await fetchDrafts();
    } catch (err) {
      setError(err.message || 'Failed to approve plan');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = async (planId) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;
    try {
      setDeletingId(planId);
      setError(null);
      await deletePlan(planId);
      await fetchDrafts();
    } catch (err) {
      setError(err.message || 'Failed to delete plan');
    } finally {
      setDeletingId(null);
    }
  };
  
  // Create a unified taskBlocks array for ScheduleView from the first draft
  // A real monthly UI would have a calendar, but we use the existing weekly view 
  // as the "week drill-down" + a simple list of drafts.
  const activeDraft = drafts[0]; // Just showing the latest draft for simplicity
  
  const draftTaskBlocks = activeDraft?.draft_blocks?.map(db => ({
    id: db.id,
    start_time: db.start_time,
    end_time: db.end_time,
    assignment: db.assignment
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Study Planner</h1>
          <p className="text-muted-foreground mt-1">
            Generate a ~30 day study plan with study/rest alternation.
          </p>
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          {error}
        </div>
      )}
      
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Generate New Plan</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Start Date</label>
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 border rounded-lg bg-background"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">End Date</label>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 border rounded-lg bg-background"
            />
          </div>
          <button 
            onClick={handleGenerate}
            disabled={isGenerating || drafts.length > 0}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Generate AI Plan'}
          </button>
        </div>
        {drafts.length > 0 && (
          <p className="text-sm text-amber-600 mt-3 font-medium">
            You already have an active plan. Please review or delete it before generating a new one.
          </p>
        )}
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Draft Plans</h2>
        {drafts.length === 0 ? (
          <p className="text-muted-foreground">No draft plans available.</p>
        ) : (
          drafts.map(plan => (
            <div key={plan.id} className="bg-card border rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-semibold text-lg">Plan: {plan.start_date} to {plan.end_date}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${plan.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {plan.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex gap-2">
                  {plan.status === 'draft' && (
                    <button
                      onClick={() => handleApprove(plan.id)}
                      disabled={approvingId === plan.id}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {approvingId === plan.id ? 'Approving...' : 'Approve & Save'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(plan.id)}
                    disabled={deletingId === plan.id}
                    className="px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors disabled:opacity-50"
                  >
                    {deletingId === plan.id ? 'Deleting...' : 'Delete Plan'}
                  </button>
                </div>
              </div>
              
              <div className="mt-6 border-t pt-4">
                <h4 className="font-medium mb-3">Tasks Categorized by AI</h4>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mb-6">
                  {Object.values(plan.draft_blocks?.reduce((acc, block) => {
                    const title = block.assignment.title;
                    if (!acc[title]) {
                      acc[title] = { 
                        assignment: block.assignment, 
                        sessions: [] 
                      };
                    }
                    acc[title].sessions.push(new Date(block.start_time));
                    return acc;
                  }, {}) || {}).map((group, idx) => (
                    <div key={idx} className="p-4 border rounded-xl bg-background/50 flex flex-col gap-2 shadow-sm">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm">{group.assignment.title}</span>
                        <div className="flex gap-2 mt-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
                            {group.assignment.category}
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            {group.assignment.priority === 3 ? 'High' : group.assignment.priority === 2 ? 'Medium' : 'Low'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Scheduled Sessions:</p>
                        <div className="flex flex-wrap gap-1">
                          {group.sessions.sort((a,b) => a-b).map((date, sIdx) => (
                            <span key={sIdx} className="text-[10px] px-2 py-0.5 bg-muted rounded border border-border/50">
                              {date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })} {date.getHours()}:{date.getMinutes().toString().padStart(2, '0')}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {activeDraft && (
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Calendar View</h2>
          <MonthlyCalendar 
            startDate={activeDraft.start_date} 
            endDate={activeDraft.end_date} 
            schoolClasses={schoolClasses} 
            taskBlocks={draftTaskBlocks} 
          />
        </div>
      )}
    </div>
  );
}
