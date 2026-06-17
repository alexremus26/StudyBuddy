import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  listCafeLocations,
  createLocationReview,
  listLocationReviews,
  createFavorite,
  deleteFavorite,
  generateLocationAIProfile,
  getLocationAIProfileGeneration,
  getAuthToken,
  generateLocationBestTime,
  getLocationBestTimeStatus,
} from '../api/client';

const MAPBOX_STYLES = {
  light: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11'
};

function formatScore(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 'N/A';
  }

  return numericValue.toFixed(1);
}

function getMarkerColor(rating) {
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating)) return '#94a3b8';
  if (numericRating < 2) return '#ef4444';
  if (numericRating < 4) return '#22c55e';
  return '#3b82f6';
}

function hasAIReview(location) {
  return location?.aggregate_profile != null;
}

/** A location should appear on the map if it has an AI review OR is favorited. */
function shouldShowOnMap(location) {
  return hasAIReview(location) || Boolean(location?.is_favorited);
}

const REVIEW_FIELDS = [
  {
    key: 'laptop_friendly',
    label: 'Laptop friendly',
    helperText: 'How well does the space work for laptop time?',
  },
  {
    key: 'study_friendly',
    label: 'Study friendly',
    helperText: 'Focus, comfort, and how easy it feels to stay awhile.',
  },
  {
    key: 'overall_corwdness',
    label: 'Crowdness',
    helperText: 'How busy or packed the place feels.',
  },
  {
    key: 'noise_level',
    label: 'Noise level',
    helperText: 'How loud or calm the room sounds.',
  },
];

const EMPTY_REVIEW_DRAFT = {
  laptop_friendly: 0,
  study_friendly: 0,
  overall_corwdness: 0,
  noise_level: 0,
  comment: '',
};

const ACTIVE_AI_JOB_STATUSES = new Set(['queued', 'fetching_reviews', 'scoring']);

const ACTIVE_BESTTIME_JOB_STATUSES = new Set(['queued', 'fetching']);

function getBestTimeJobLabel(status) {
  if (status === 'fetching') return 'Fetching crowdness...';
  if (status === 'queued') return 'Queued...';
  if (status === 'failed') return 'Fetch failed';
  return 'Checking...';
}

function getAIJobLabel(status) {
  if (status === 'fetching_reviews') return 'Fetching reviews...';
  if (status === 'scoring') return 'Building AI review...';
  if (status === 'queued') return 'Queued...';
  if (status === 'failed') return 'Generation failed';
  return 'Generating...';
}

function clampHalfRating(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(5, Math.max(0, Math.round(numericValue * 2) / 2));
}

function createEmptyReviewDraft() {
  return { ...EMPTY_REVIEW_DRAFT };
}

function reviewToDraft(review) {
  return {
    laptop_friendly: clampHalfRating(review?.laptop_friendly ?? 0),
    study_friendly: clampHalfRating(review?.study_friendly ?? 0),
    overall_corwdness: clampHalfRating(review?.overall_corwdness ?? 0),
    noise_level: clampHalfRating(review?.noise_level ?? 0),
    comment: review?.comment ?? '',
  };
}

function getReviewPreviewRating(draft) {
  return clampHalfRating(
    (Number(draft?.study_friendly ?? 0) * 0.35)
    + (Number(draft?.noise_level ?? 0) * 0.35)
    + (Number(draft?.laptop_friendly ?? 0) * 0.25)
    + (Number(draft?.overall_corwdness ?? 0) * 0.05),
  );
}

function getPageNumberFromUrl(url) {
  if (!url) {
    return null;
  }

  try {
    return Number(new URL(url, window.location.origin).searchParams.get('page')) || null;
  } catch {
    return null;
  }
}

function StarRatingRow({ id, label, helperText, value, onChange }) {
  const safeValue = clampHalfRating(value);

  const handleStarClick = (event, starIndex) => {
    const starBounds = event.currentTarget.getBoundingClientRect();
    const clickedOnLeftHalf = event.clientX - starBounds.left < starBounds.width / 2;
    onChange(clampHalfRating(starIndex + (clickedOnLeftHalf ? 0.5 : 1)));
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onChange(clampHalfRating(safeValue + 0.5));
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onChange(clampHalfRating(safeValue - 0.5));
    }

    if (event.key === 'Home') {
      event.preventDefault();
      onChange(0);
    }

    if (event.key === 'End') {
      event.preventDefault();
      onChange(5);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id={id} className="text-sm font-semibold text-foreground">
            {label}
          </p>
          <p className="text-xs text-muted-foreground">{helperText}</p>
        </div>
        <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
          {safeValue.toFixed(1)} / 5
        </span>
      </div>

      <div className="flex items-center gap-1" role="radiogroup" aria-labelledby={id} onKeyDown={handleKeyDown}>
        {Array.from({ length: 5 }).map((_, index) => {
          const starValue = index + 1;
          const fill = Math.max(0, Math.min(1, safeValue - index));

          return (
            <button
              key={starValue}
              type="button"
              onClick={(event) => handleStarClick(event, index)}
              aria-label={`Set ${label} to ${index + 0.5} stars on the left half or ${starValue} stars on the right half`}
              className="review-star-button group relative inline-flex h-10 w-10 items-center justify-center rounded-full text-amber-400 transition-transform duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            >
              <span className="sr-only">{`${label}: ${safeValue.toFixed(1)} stars`}</span>
              <svg className="absolute inset-0 h-10 w-10 text-muted-foreground/20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2.25 15.09 8.5l6.91 1.01-5 4.88 1.18 6.88L12 17.98 5.82 21.27 7 14.39l-5-4.88L8.91 8.5 12 2.25Z" />
              </svg>
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }} aria-hidden="true">
                <svg className="h-10 w-10 text-amber-400 drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.25 15.09 8.5l6.91 1.01-5 4.88 1.18 6.88L12 17.98 5.82 21.27 7 14.39l-5-4.88L8.91 8.5 12 2.25Z" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StarDisplay({ value, size = 18 }) {
  const v = clampHalfRating(value);
  const color = getMarkerColor(v);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center" aria-hidden>
        {Array.from({ length: 5 }).map((_, idx) => {
          const fill = Math.max(0, Math.min(1, v - idx));
          return (
            <span key={idx} className="relative inline-block" style={{ width: size, height: size }}>
              <svg viewBox="0 0 24 24" width={size} height={size} className="text-muted-foreground absolute inset-0">
                <path d="M12 2.25 15.09 8.5l6.91 1.01-5 4.88 1.18 6.88L12 17.98 5.82 21.27 7 14.39l-5-4.88L8.91 8.5 12 2.25Z" fill="currentColor" />
              </svg>
              <span className="absolute left-0 top-0 overflow-hidden" style={{ width: `${fill * 100}%`, color }}>
                <svg viewBox="0 0 24 24" width={size} height={size} fill={color} className="drop-shadow-sm">
                  <path d="M12 2.25 15.09 8.5l6.91 1.01-5 4.88 1.18 6.88L12 17.98 5.82 21.27 7 14.39l-5-4.88L8.91 8.5 12 2.25Z" />
                </svg>
              </span>
            </span>
          );
        })}
      </div>
      <span className="text-sm font-semibold" style={{ color }}>{formatScore(v)}</span>
    </div>
  );
}

function ReviewSummaryCard({ review }) {
  if (!review) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        You have not left a review yet.
      </div>
    );
  }

  const accent = getMarkerColor(review?.overall_rating);

  return (
    <div className="rounded-2xl border bg-muted/10 p-4 shadow-sm" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Your saved review</p>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: accent, color: '#fff' }}>
          {formatScore(review?.overall_rating)} overall
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        {REVIEW_FIELDS.map((field) => (
          <div key={field.key} className="rounded-xl border bg-background px-3 py-2">
            <p className="font-semibold text-foreground">{field.label}</p>
            <p>{formatScore(review?.[field.key])} / 5</p>
          </div>
        ))}
      </div>
      {review?.comment ? (
        <p className="mt-3 rounded-xl border bg-background px-3 py-2 text-sm text-foreground/80">
          {review.comment}
        </p>
      ) : null}
    </div>
  );
}

function ReviewListCard({ review }) {
  const reviewer = review?.reviewer || {};
  const accent = getMarkerColor(review?.overall_rating);
  const comment = (review?.comment || '').trim();
  const commentSnippet = comment ? (comment.length > 180 ? `${comment.slice(0, 180)}...` : comment) : 'No written comment.';

  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-bold text-foreground">
            {reviewer.avatar_url ? (
              <img src={reviewer.avatar_url} alt={reviewer.display_name || reviewer.username || 'Reviewer'} className="h-full w-full object-cover" />
            ) : (
              <span>{(reviewer.display_name || reviewer.username || '?').charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {reviewer.display_name || reviewer.username || 'Anonymous'}
            </p>
            <p className="text-xs text-muted-foreground">
              {review?.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
            </p>
          </div>
        </div>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: accent }}>
          {formatScore(review?.overall_rating)}
        </span>
      </div>

      <div className="mt-3">
        <StarDisplay value={review?.overall_rating} size={16} />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground/80">{commentSnippet}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        {REVIEW_FIELDS.map((field) => (
          <div key={field.key} className="rounded-xl border bg-background px-3 py-2">
            <p className="font-semibold text-foreground">{field.label}</p>
            <p>{formatScore(review?.[field.key])} / 5</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function ReviewsModal({ isOpen, locationName, reviews, loading, error, ordering, onOrderingChange, onLoadMore, hasMore, onClose }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6">
      <button type="button" aria-label="Close reviews popup" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-3xl border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">See people reviews</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{locationName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Browse ratings from other people for this place.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={ordering}
              onChange={(event) => onOrderingChange(event.target.value)}
              className="rounded-full border bg-background px-3 py-2 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="-overall_rating">Highest rating</option>
              <option value="-created_at">Newest</option>
            </select>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border bg-background p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close reviews popup"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">
          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-4">
            {reviews.map((review) => (
              <ReviewListCard key={review.id} review={review} />
            ))}
          </div>

          {loading ? (
            <div className="mt-4 rounded-2xl border bg-muted/10 px-4 py-4 text-sm text-muted-foreground">Loading reviews...</div>
          ) : null}

          {!loading && !reviews.length && !error ? (
            <div className="rounded-2xl border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
              No reviews yet for this place.
            </div>
          ) : null}

          {hasMore ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={onLoadMore}
                className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FavoriteHeartIcon({ isActive }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6c-1.7-1.8-4.5-1.9-6.3-.2L12 6.8l-2.5-2.4C7.7 2.7 4.9 2.8 3.2 4.6c-1.8 1.8-1.8 4.8 0 6.7L12 20l8.8-8.7c1.8-1.9 1.8-4.9 0-6.7Z" />
    </svg>
  );
}

function RatingSparkline({ value }) {
  return (
    <div className="mt-3 rounded-2xl border bg-background px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Overall preview</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-black tracking-tight text-foreground">
            {formatScore(value)}
          </p>
          <p className="text-xs text-muted-foreground">Weighted from all four categories</p>
        </div>
        <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 transition-all duration-300" style={{ width: `${(clampHalfRating(value) / 5) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

// Marker focus CSS — injected once into the document head.
// This controls opacity/pointer-events via data attributes so it can NEVER
// conflict with the shape/size inline styles set by applyMarkerStyle.
const MARKER_STYLE_ID = 'cafe-marker-focus-styles';
if (!document.getElementById(MARKER_STYLE_ID)) {
  const styleSheet = document.createElement('style');
  styleSheet.id = MARKER_STYLE_ID;
  styleSheet.textContent = `
    .cafe-marker {
      opacity: 1;
      pointer-events: auto;
      transition: opacity 0.3s ease, width 0.35s cubic-bezier(0.4,0,0.2,1), height 0.35s cubic-bezier(0.4,0,0.2,1), min-height 0.35s cubic-bezier(0.4,0,0.2,1);
    }
    .cafe-marker[data-focus="dimmed"] {
      opacity: 0.15 !important;
      pointer-events: none !important;
    }
    .cafe-marker[data-focus="match"] {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    .cafe-marker[data-visibility="hidden"] {
      opacity: 0 !important;
      pointer-events: none !important;
      transform: scale(0.5);
    }
    @keyframes pendingPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .pending-pulse-dot {
      animation: pendingPulse 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(styleSheet);
}

function applyMarkerStyle(outerElement, dropShape, location, isSelected) {
  const color = getMarkerColor(location.aggregate_profile?.overall_rating);
  const ease = 'cubic-bezier(0.4, 0, 0.2, 1)';

  if (isSelected) {
    // Expanded card state — only shape/size, never opacity
    Object.assign(outerElement.style, {
      width: '200px',
      height: 'auto',
      minHeight: '50px',
      cursor: 'pointer',
      outline: 'none',
      zIndex: '10',
    });

    Object.assign(dropShape.style, {
      width: '100%',
      height: 'auto',
      minHeight: '50px',
      borderRadius: '12px',
      transform: 'rotate(0deg)',
      backgroundColor: color,
      border: '2px solid rgba(255,255,255,0.85)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      justifyContent: 'center',
      boxSizing: 'border-box',
      color: '#ffffff',
      padding: '10px 12px',
      transition: `border-radius 0.4s ${ease}, transform 0.4s ${ease}, padding 0.4s ${ease}, min-height 0.4s ${ease}, box-shadow 0.3s ${ease}`,
      overflow: 'hidden',
    });

    const icon = dropShape.querySelector('.marker-icon');
    if (icon) {
      Object.assign(icon.style, {
        width: '0px',
        height: '0px',
        opacity: '0',
        position: 'absolute',
        transition: 'opacity 0.15s ease, width 0.15s ease, height 0.15s ease',
      });
    }

    const content = dropShape.querySelector('.marker-content');
    if (content) {
      Object.assign(content.style, {
        position: 'static',
        width: 'auto',
        height: 'auto',
        opacity: '1',
        maxHeight: '200px',
        pointerEvents: 'auto',
        overflow: 'hidden',
        transition: `opacity 0.3s ${ease} 0.15s, max-height 0.3s ${ease}`,
      });
    }
  } else {
    // Collapsed circular badge state — only shape/size, never opacity
    Object.assign(outerElement.style, {
      width: '22px',
      height: '22px',
      minHeight: '22px',
      cursor: 'pointer',
      outline: 'none',
      zIndex: '1',
    });

    Object.assign(dropShape.style, {
      width: '100%',
      height: '100%',
      minHeight: 'unset',
      borderRadius: '50%',
      transform: 'rotate(0deg)',
      backgroundColor: color,
      border: '2px solid rgba(255,255,255,0.95)',
      boxShadow: '0 3px 8px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      color: '#ffffff',
      padding: '0',
      transition: `border-radius 0.35s ${ease}, transform 0.35s ${ease}, padding 0.35s ${ease}, min-height 0.35s ${ease}, box-shadow 0.3s ${ease}`,
      overflow: 'hidden',
    });

    const icon = dropShape.querySelector('.marker-icon');
    if (icon) {
      Object.assign(icon.style, {
        width: '12px',
        height: '12px',
        flexShrink: '0',
        opacity: '1',
        position: 'static',
        transform: 'rotate(0deg)',
        transition: 'opacity 0.2s ease 0.2s, width 0.2s ease, height 0.2s ease',
      });
    }

    const content = dropShape.querySelector('.marker-content');
    if (content) {
      Object.assign(content.style, {
        position: 'absolute',
        width: '0px',
        height: '0px',
        opacity: '0',
        overflow: 'hidden',
        pointerEvents: 'none',
        transition: `opacity 0.1s ease, max-height 0.2s ${ease}`,
      });
    }
  }
}

function buildMarkerElement(location, isSelected) {
  const outerElement = document.createElement('div');
  outerElement.className = 'cafe-marker';
  const dropShape = document.createElement('div');
  dropShape.className = 'marker-shape';

  const svgWrapper = document.createElement('div');
  if (location.is_favorited) {
    // Star line icon for favorites
    svgWrapper.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="marker-icon" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px; flex-shrink: 0; opacity: 1; transition: opacity 0.2s ease 0.2s, width 0.2s ease, height 0.2s ease;">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
    `;
  } else {
    // Coffee cup line icon for regular cafés
    svgWrapper.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="marker-icon" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px; flex-shrink: 0; opacity: 1; transition: opacity 0.2s ease 0.2s, width 0.2s ease, height 0.2s ease;">
        <path d="M17 8h1a4 4 0 1 1 0 8h-1"></path>
        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path>
        <line x1="6" x2="6" y1="2" y2="4"></line>
        <line x1="10" x2="10" y1="2" y2="4"></line>
        <line x1="14" x2="14" y1="2" y2="4"></line>
      </svg>
    `;
  }
  const svg = svgWrapper.firstElementChild;
  dropShape.appendChild(svg);

  // Hidden info content (revealed on morph)
  const content = document.createElement('div');
  content.className = 'marker-content';
  Object.assign(content.style, {
    opacity: '0',
    maxHeight: '0',
    overflow: 'hidden',
    fontSize: '11px',
    lineHeight: '1.4',
    color: '#ffffff',
    whiteSpace: 'normal',
  });

  const locationHasAIReview = hasAIReview(location);
  const overallRating = locationHasAIReview ? formatScore(location.aggregate_profile?.overall_rating) : '';
  const summaryItems = getSelectedSummary(location) || [];
  const subRatings = locationHasAIReview
    ? summaryItems
        .filter((item) => item.label !== 'Overall')
        .map((item) => `<span style="opacity:0.75;">${item.label}</span> <b>${item.value}</b>`)
        .join(' &middot; ')
    : '';

  const ratingBadge = locationHasAIReview
    ? `<span style="flex-shrink:0;margin-left:8px;margin-right:8px;">${overallRating}</span>`
    : `<span style="flex-shrink:0;margin-left:8px;font-size:10px;opacity:0.8;background:rgba(255,255,255,0.2);border-radius:6px;padding:1px 6px;">Pending</span>`;

  content.innerHTML =
    `<div style="font-weight:700;font-size:13px;margin-bottom:3px;display:flex;justify-content:space-between;align-items:center;">` +
    `<div style="display:flex;align-items:center;overflow:hidden;">` +
    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${location.name}</span>` +
    ratingBadge +
    `</div>` +
    `<button class="close-marker-btn" style="background:none;border:none;color:#fff;cursor:pointer;padding:2px 0 2px 4px;margin:0;display:flex;align-items:center;opacity:0.8;" aria-label="Close">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>` +
    `</button>` +
    `</div>` +
    (subRatings ? `<div>${subRatings}</div>` : '');

  dropShape.appendChild(content);
  outerElement.appendChild(dropShape);

  applyMarkerStyle(outerElement, dropShape, location, isSelected);
  outerElement.setAttribute('aria-label', `Select ${location.name}`);
  return outerElement;
}

function getSelectedSummary(location) {
  const profile = location?.aggregate_profile;
  if (!profile) {
    return null;
  }

  return [
    { label: 'Overall', value: formatScore(profile.overall_rating) },
    { label: 'Laptop', value: formatScore(profile.laptop_friendly) },
    { label: 'Study', value: formatScore(profile.study_friendly) },
    { label: 'Noise', value: formatScore(profile.noise_level) },
  ];
}

function getLocationsCenter(locations) {
  if (!locations.length) {
    return [26.1025, 44.4268];
  }

  const totals = locations.reduce(
    (accumulator, location) => {
      const longitude = Number(location?.coordinates?.longitude);
      const latitude = Number(location?.coordinates?.latitude);

      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        accumulator.longitude += longitude;
        accumulator.latitude += latitude;
        accumulator.count += 1;
      }

      return accumulator;
    },
    { longitude: 0, latitude: 0, count: 0 },
  );

  if (!totals.count) {
    return [26.1025, 44.4268];
  }

  return [totals.longitude / totals.count, totals.latitude / totals.count];
}

function fitMapToLocations(map, locationsToFit, { padding = 60, maxZoom = 17, sidebarOffset = 140 } = {}) {
  if (!map || !locationsToFit.length) return;

  if (locationsToFit.length === 1) {
    const loc = locationsToFit[0];
    const lng = Number(loc.coordinates?.longitude);
    const lat = Number(loc.coordinates?.latitude);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      map.flyTo({
        center: [lng, lat],
        zoom: maxZoom,
        speed: 1.4,
        curve: 1.42,
        essential: true,
        offset: [-sidebarOffset, 0],
      });
    }
    return;
  }

  const bounds = new mapboxgl.LngLatBounds();
  for (const loc of locationsToFit) {
    const lng = Number(loc.coordinates?.longitude);
    const lat = Number(loc.coordinates?.latitude);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      bounds.extend([lng, lat]);
    }
  }

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: { top: padding, bottom: padding, left: padding + sidebarOffset, right: padding },
      maxZoom,
      speed: 1.4,
      essential: true,
    });
  }
}

export function PlacesMap({ selectionMode = false, onSelectLocation = null, isVisible = true }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef(new Map());
  const popupRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const searchLabelRefs = useRef([]);
  const reviewDialogRef = useRef(null);
  const favoriteAnimationTimerRef = useRef(null);

  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const routerLocation = useLocation();

  useEffect(() => {
    if (locations.length > 0) {
      const urlParams = new URLSearchParams(routerLocation.search);
      const locationParam = urlParams.get('location');
      if (locationParam) {
        const id = parseInt(locationParam, 10);
        if (locations.some(l => l.id === id)) {
          setSelectedLocationId(id);
        }
      }
    }
  }, [routerLocation.search, locations]);
  const [userReview, setUserReview] = useState(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [favoriteSubmitting, setFavoriteSubmitting] = useState(false);
  const [favoriteAnimating, setFavoriteAnimating] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState(() => createEmptyReviewDraft());
  const [reviewPreview, setReviewPreview] = useState([]);
  const [reviewPreviewLoading, setReviewPreviewLoading] = useState(false);
  const [reviewPreviewError, setReviewPreviewError] = useState(null);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState(null);
  const [reviewsOrdering, setReviewsOrdering] = useState('-overall_rating');
  const [reviewsNextPage, setReviewsNextPage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showMyReview, setShowMyReview] = useState(false);
  const [showUserReviewDetails, setShowUserReviewDetails] = useState(false);
  const [panelView, setPanelView] = useState('details');
  const [aiGenerationJob, setAiGenerationJob] = useState(null);
  const [aiGenerationLoading, setAiGenerationLoading] = useState(false);
  const [aiGenerationError, setAiGenerationError] = useState(null);

  const [bestTimeJob, setBestTimeJob] = useState(null);
  const [bestTimeLoading, setBestTimeLoading] = useState(false);
  const [bestTimeError, setBestTimeError] = useState(null);

  // Simplified favorite toggle handler — keeps selectedLocation.is_favorited in sync
  const handleToggleFavorite = async () => {
    if (!selectedLocation) return;
    if (favoriteSubmitting) return;
    setFavoriteSubmitting(true);
    setFavoriteAnimating(true);
    if (favoriteAnimationTimerRef.current) {
      window.clearTimeout(favoriteAnimationTimerRef.current);
    }
    favoriteAnimationTimerRef.current = window.setTimeout(() => {
      setFavoriteAnimating(false);
    }, 360);

    try {
      if (isFavorited) {
        await deleteFavorite(selectedLocation.id);
        setIsFavorited(false);
        setLocations((prev) => prev.map((l) => (l.id === selectedLocation.id ? { ...l, is_favorited: false } : l)));
      } else {
        await createFavorite(selectedLocation.id, { custom_note: '' });
        setIsFavorited(true);
        setLocations((prev) => prev.map((l) => (l.id === selectedLocation.id ? { ...l, is_favorited: true } : l)));
      }
    } catch (err) {
      console.error('Favorite error', err);
    } finally {
      setFavoriteSubmitting(false);
    }
  };

  // Debounce: update debouncedQuery 300ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() || '';
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) || null,
    [locations, selectedLocationId],
  );

  const applyAIProfileGenerationPayload = (locationId, payload) => {
    if (payload?.job) {
      setAiGenerationJob(payload.job);
      
      // Register with global polling engine if the job is active
      if (ACTIVE_AI_JOB_STATUSES.has(payload.job.status)) {
        const targetLoc = locations.find((loc) => loc.id === locationId);
        window.dispatchEvent(
          new CustomEvent('studybuddy-start-polling', {
            detail: {
              locationId,
              locationName: targetLoc?.name || 'requested café'
            }
          })
        );
      }
    }

    if (!payload?.profile) {
      return;
    }

    setLocations((currentLocations) => (
      currentLocations.map((location) => (
        location.id === locationId
          ? { ...location, aggregate_profile: payload.profile }
          : location
      ))
    ));
  };

  useEffect(() => {
    if (!selectedLocation) {
      setUserReview(null);
      setIsFavorited(false);
      setReviewDraft(createEmptyReviewDraft());
      setIsReviewModalOpen(false);
      setReviewsModalOpen(false);
      setReviewPreview([]);
      setReviewPreviewLoading(false);
      setReviewPreviewError(null);
      setReviews([]);
      setReviewsLoading(false);
      setReviewsError(null);
      setReviewsNextPage(null);
      setAiGenerationJob(null);
      setAiGenerationLoading(false);
      setAiGenerationError(null);
      return;
    }

    const currentReview = selectedLocation.current_user_review || null;
    setUserReview(currentReview);
    setIsFavorited(Boolean(selectedLocation.is_favorited));
    setReviewDraft(currentReview ? reviewToDraft(currentReview) : createEmptyReviewDraft());

    // Check if there's a running job for this location and start global polling if so
    let active = true;
    async function checkJobStatus() {
      try {
        const payload = await getLocationAIProfileGeneration(selectedLocation.id);
        if (!active) return;
        if (payload?.job) {
          setAiGenerationJob(payload.job);
          if (ACTIVE_AI_JOB_STATUSES.has(payload.job.status)) {
            window.dispatchEvent(
              new CustomEvent('studybuddy-start-polling', {
                detail: {
                  locationId: selectedLocation.id,
                  locationName: selectedLocation.name
                }
              })
            );
          }
        }
      } catch (err) {
        console.error('Failed to check initial job status', err);
      }
    }

    setAiGenerationJob(null);
    setAiGenerationError(null);
    if (!selectedLocation.aggregate_profile) {
      void checkJobStatus();
    }

    async function checkBestTimeJobStatus() {
      try {
        const payload = await getLocationBestTimeStatus(selectedLocation.id);
        if (!active) return;
        if (payload?.job) {
          setBestTimeJob(payload.job);
          if (ACTIVE_BESTTIME_JOB_STATUSES.has(payload.job.status)) {
            window.dispatchEvent(
              new CustomEvent('studybuddy-start-polling-besttime', {
                detail: {
                  locationId: selectedLocation.id,
                  locationName: selectedLocation.name
                }
              })
            );
          }
        }
      } catch (err) {
        console.error('Failed to check initial BestTime job status', err);
      }
    }

    setBestTimeJob(null);
    setBestTimeError(null);
    void checkBestTimeJobStatus();

    return () => {
      active = false;
    };
  }, [selectedLocationId, selectedLocation]);

  const handleGenerateAIProfile = async () => {
    if (!selectedLocation || aiGenerationLoading) {
      return;
    }

    if (!getAuthToken()) {
      setAiGenerationError('Sign in to request an AI review.');
      return;
    }

    setAiGenerationLoading(true);
    setAiGenerationError(null);

    try {
      const payload = await generateLocationAIProfile(selectedLocation.id);
      applyAIProfileGenerationPayload(selectedLocation.id, payload);
    } catch (err) {
      console.error('Failed to start AI profile generation', err);
      setAiGenerationError(err?.message || 'Failed to start AI review generation.');
    } finally {
      setAiGenerationLoading(false);
    }
  };

  const handleCheckCrowdness = async () => {
    if (!selectedLocation || bestTimeLoading) {
      return;
    }

    if (!getAuthToken()) {
      setBestTimeError('Sign in to check crowdness level.');
      return;
    }

    setBestTimeLoading(true);
    setBestTimeError(null);

    try {
      const payload = await generateLocationBestTime(selectedLocation.id);
      setBestTimeJob(payload.job);
      if (payload?.job && ACTIVE_BESTTIME_JOB_STATUSES.has(payload.job.status)) {
        window.dispatchEvent(
          new CustomEvent('studybuddy-start-polling-besttime', {
            detail: {
              locationId: selectedLocation.id,
              locationName: selectedLocation.name
            }
          })
        );
      }
    } catch (err) {
      console.error('Failed to start BestTime crowdness check', err);
      setBestTimeError(err?.message || 'Failed to start crowdness check.');
    } finally {
      setBestTimeLoading(false);
    }
  };

  // Listen to background job progress and completion events from global polling engine
  useEffect(() => {
    const handleJobProgress = (e) => {
      const { locationId, job } = e.detail;
      if (locationId === selectedLocationId) {
        setAiGenerationJob(job);
      }
    };

    const handleJobCompleted = (e) => {
      const { locationId, profile, job } = e.detail;
      setLocations((prev) =>
        prev.map((loc) =>
          loc.id === locationId ? { ...loc, aggregate_profile: profile } : loc
        )
      );
      if (locationId === selectedLocationId) {
        setAiGenerationJob(job);
      }
    };

    window.addEventListener('studybuddy-job-progress', handleJobProgress);
    window.addEventListener('studybuddy-job-completed', handleJobCompleted);

    return () => {
      window.removeEventListener('studybuddy-job-progress', handleJobProgress);
      window.removeEventListener('studybuddy-job-completed', handleJobCompleted);
    };
  }, [selectedLocationId]);

  useEffect(() => {
    const handleBestTimeProgress = (e) => {
      const { locationId, job } = e.detail;
      if (locationId === selectedLocationId) {
        setBestTimeJob(job);
      }
    };

    const handleBestTimeCompleted = (e) => {
      const { locationId, besttime_venue_id, besttime_live_busyness, besttime_live_fetched_at, besttime_forecast_data, job } = e.detail;
      setLocations((prev) =>
        prev.map((loc) =>
          loc.id === locationId
            ? {
                ...loc,
                besttime_venue_id,
                besttime_live_busyness,
                besttime_live_fetched_at,
                besttime_forecast_data,
              }
            : loc
        )
      );
      if (locationId === selectedLocationId) {
        setBestTimeJob(job);
      }
    };

    window.addEventListener('studybuddy-besttime-progress', handleBestTimeProgress);
    window.addEventListener('studybuddy-besttime-completed', handleBestTimeCompleted);

    return () => {
      window.removeEventListener('studybuddy-besttime-progress', handleBestTimeProgress);
      window.removeEventListener('studybuddy-besttime-completed', handleBestTimeCompleted);
    };
  }, [selectedLocationId]);

  useEffect(() => {
    if (selectedLocationId) {
      setPanelView('details');
    }
  }, [selectedLocationId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreviewReviews() {
      if (!selectedLocationId) {
        return;
      }

      setReviewPreviewLoading(true);
      setReviewPreviewError(null);

      try {
        const response = await listLocationReviews(selectedLocationId, {
          page: 1,
          page_size: 2,
          ordering: '-overall_rating',
        });

        if (cancelled) {
          return;
        }

        const results = Array.isArray(response?.results) ? response.results : Array.isArray(response) ? response : [];
        setReviewPreview(results);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load review preview', err);
          setReviewPreview([]);
          setReviewPreviewError(err?.message || 'Failed to load reviews.');
        }
      } finally {
        if (!cancelled) {
          setReviewPreviewLoading(false);
        }
      }
    }

    loadPreviewReviews();

    return () => {
      cancelled = true;
    };
  }, [selectedLocationId]);

  const loadReviewsPage = async ({ page = 1, ordering = reviewsOrdering, append = false } = {}) => {
    if (!selectedLocationId) {
      return;
    }

    setReviewsLoading(true);
    setReviewsError(null);

    try {
      const response = await listLocationReviews(selectedLocationId, {
        page,
        page_size: 6,
        ordering,
      });

      const results = Array.isArray(response?.results) ? response.results : Array.isArray(response) ? response : [];
      const nextPage = getPageNumberFromUrl(response?.next);

      setReviews((currentReviews) => (append ? [...currentReviews, ...results] : results));
      setReviewsNextPage(nextPage);
      setReviewsOrdering(ordering);
      setReviewPreview(results.slice(0, 2));
      setShowUserReviewDetails(false);
    } catch (err) {
      console.error('Failed to load reviews', err);
      setReviewsError(err?.message || 'Failed to load reviews.');
    } finally {
      setReviewsLoading(false);
    }
  };

  // Per-location visibility persistence for user-review UI
  useEffect(() => {
    if (!selectedLocationId) {
      setShowMyReview(false);
      setShowUserReviewDetails(false);
      return;
    }

    try {
      const key = `review-visibility-${selectedLocationId}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        setShowMyReview(Boolean(parsed.showMyReview));
        setShowUserReviewDetails(Boolean(parsed.showUserReviewDetails));
      } else {
        const cur = locations.find((l) => l.id === selectedLocationId);
        setShowMyReview(Boolean(cur?.current_user_review));
        setShowUserReviewDetails(false);
      }
    } catch (err) {
      console.warn('Failed to restore per-location review visibility:', err);
    }
  }, [selectedLocationId]);

  useEffect(() => {
    if (!selectedLocationId) return;
    try {
      const key = `review-visibility-${selectedLocationId}`;
      localStorage.setItem(key, JSON.stringify({ showMyReview, showUserReviewDetails }));
    } catch (err) {
      console.warn('Failed to save per-location review visibility:', err);
    }
  }, [selectedLocationId, showMyReview, showUserReviewDetails]);

  useEffect(() => {
    if (!isReviewModalOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsReviewModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    requestAnimationFrame(() => {
      const firstFocusable = reviewDialogRef.current?.querySelector('button, textarea, [href], input, [tabindex]:not([tabindex="-1"])');
      firstFocusable?.focus();
    });

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReviewModalOpen]);

  useEffect(() => () => {
    if (favoriteAnimationTimerRef.current) {
      window.clearTimeout(favoriteAnimationTimerRef.current);
    }
  }, []);

  const filteredLocationIds = useMemo(() => {
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) return null;
    return new Set(
      locations
        .filter((loc) => loc.name?.toLowerCase().includes(query) || loc.address?.toLowerCase().includes(query))
        .map((loc) => loc.id),
    );
  }, [locations, debouncedQuery]);

  const filteredLocations = useMemo(() => {
    if (!filteredLocationIds) return locations;
    return locations.filter((loc) => filteredLocationIds.has(loc.id));
  }, [locations, filteredLocationIds]);

  const favoriteLocations = useMemo(
    () => locations.filter((location) => location.is_favorited),
    [locations],
  );

  const isSearchActive = filteredLocationIds !== null;

  const openLocationOnMap = (locationId) => {
    setSelectedLocationId(locationId);
    setPanelView('details');
    requestAnimationFrame(() => {
      mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadLocations() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await listCafeLocations();
        if (!active) {
          return;
        }

        const normalizedLocations = (Array.isArray(data) ? data : [])
          .filter((location) => location?.coordinates && Number.isFinite(Number(location.coordinates.latitude)) && Number.isFinite(Number(location.coordinates.longitude)));

        setLocations(normalizedLocations);
        if (normalizedLocations.length > 0) {
          const urlParams = new URLSearchParams(window.location.search);
          const locationParam = urlParams.get('location');
          const matchedLocation = locationParam ? normalizedLocations.find(l => l.id === parseInt(locationParam, 10)) : null;
          
          if (matchedLocation) {
            setSelectedLocationId(matchedLocation.id);
          } else {
            setSelectedLocationId((currentId) => currentId || normalizedLocations.find(shouldShowOnMap)?.id || normalizedLocations[0].id);
          }
        }
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(fetchError.message || 'Failed to load cafés.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadLocations();

    return () => {
      active = false;
    };
  }, []);

  // Auto-deselect unreviewed/non-favorited places when search is cleared
  useEffect(() => {
    if (!isSearchActive && selectedLocation && !shouldShowOnMap(selectedLocation)) {
      setSelectedLocationId(null);
    }
  }, [isSearchActive, selectedLocation]);

  useEffect(() => {
    if (!mapboxToken || !mapContainerRef.current || mapRef.current) {
      return undefined;
    }

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: isDarkMode ? MAPBOX_STYLES.dark : MAPBOX_STYLES.light,
      center: [26.1025, 44.4268],
      zoom: 12,
      cooperativeGestures: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);
    resizeObserverRef.current = resizeObserver;

    map.once('load', () => {
      map.resize();
    });

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
      markerRefs.current.forEach(({ marker }) => marker.remove());
      markerRefs.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(isDarkMode ? MAPBOX_STYLES.dark : MAPBOX_STYLES.light);
    }
  }, [isDarkMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !locations.length) {
      return;
    }

    popupRef.current?.remove();
    popupRef.current = null;

    markerRefs.current.forEach(({ marker }) => marker.remove());
    markerRefs.current.clear();

    const visibleLocations = locations.filter(shouldShowOnMap);
    const center = getLocationsCenter(visibleLocations.length ? visibleLocations : locations);

    locations.forEach((location) => {
      const coordinates = location.coordinates;
      if (!coordinates) {
        return;
      }

      const longitude = Number(coordinates.longitude);
      const latitude = Number(coordinates.latitude);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return;
      }

      const element = buildMarkerElement(location, location.id === selectedLocationId);

      // Hide unreviewed, non-favorited markers immediately at creation
      if (!shouldShowOnMap(location)) {
        element.dataset.visibility = 'hidden';
      }

      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.target.closest('.close-marker-btn')) {
          setSelectedLocationId(null);
        } else {
          setSelectedLocationId(location.id);
        }
      });

      const marker = new mapboxgl.Marker({ element, anchor: 'center' })
        .setLngLat([longitude, latitude])
        .addTo(map);

      markerRefs.current.set(location.id, { marker, element, location });
    });

    if (map.loaded()) {
      map.jumpTo({
        center,
        zoom: 12,
        offset: [-140, 0],
      });
      return;
    }

    map.once('load', () => {
      map.jumpTo({
        center,
        zoom: 12,
        offset: [-140, 0],
      });
    });
  }, [locations]);

  // EFFECT 1: Selection — apply marker shape (card vs pin) + fly-to
  useEffect(() => {
    const map = mapRef.current;
    let selectedMarker = null;

    markerRefs.current.forEach(({ marker, element, location }, locationId) => {
      const isSelected = locationId === selectedLocationId;
      
      // Outside active search mode, make sure the selected location is visible on the map
      if (!isSearchActive) {
        if (isSelected) {
          delete element.dataset.visibility;
        } else if (!shouldShowOnMap(location)) {
          element.dataset.visibility = 'hidden';
        }
      }

      const shapeEl = element.querySelector('.marker-shape') || element.firstChild;
      applyMarkerStyle(element, shapeEl, location, isSelected);

      if (isSelected) {
        selectedMarker = marker;
      }
    });

    if (selectedMarker && map && !isSearchActive && isVisible) {
      // Delay slightly to allow the map container's transition and resize observer to complete
      const timer = setTimeout(() => {
        map.flyTo({
          center: selectedMarker.getLngLat(),
          speed: 1.2,
          curve: 1.42,
          essential: true,
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedLocationId, isSearchActive, isVisible]);

  // EFFECT 2: Search focus — opacity via data attributes + CSS, pin scaling, labels
  // Completely independent from selection styling — uses data-focus attribute
  // which is handled by CSS rules injected at module load. No inline opacity.
  useEffect(() => {
    // Clean up previous floating labels
    searchLabelRefs.current.forEach((m) => m.remove());
    searchLabelRefs.current = [];

    const map = mapRef.current;

    markerRefs.current.forEach(({ marker, element, location }, locationId) => {
      const isSelected = locationId === selectedLocationId;

      if (isSearchActive) {
        const isMatch = filteredLocationIds.has(locationId);

        // All matched markers are shown, even if they aren't AI-reviewed/favorited
        if (isMatch) {
          delete element.dataset.visibility;
        } else {
          element.dataset.visibility = 'hidden';
        }

        // Set data attribute — CSS handles opacity + pointer-events
        element.dataset.focus = isMatch ? 'match' : 'dimmed';

        // Scale matched collapsed pins bigger
        if (isMatch && !isSelected) {
          element.style.width = '28px';
          element.style.height = '28px';
          element.style.minHeight = '28px';

          const icon = element.querySelector('.marker-icon');
          if (icon) {
            icon.style.width = '15px';
            icon.style.height = '15px';
          }

          // Add floating name label
          if (map && filteredLocationIds.size <= 5) {
            const labelEl = document.createElement('div');
            Object.assign(labelEl.style, {
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(0,0,0,0.78)',
              color: '#fff',
              fontSize: '11px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              lineHeight: '1.3',
            });
            labelEl.textContent = location.name;

            const lngLat = marker.getLngLat();
            const labelMarker = new mapboxgl.Marker({ element: labelEl, anchor: 'bottom' })
              .setLngLat(lngLat)
              .setOffset([0, -22])
              .addTo(map);

            searchLabelRefs.current.push(labelMarker);
          }
        }
      } else {
        // Remove focus attribute — CSS reverts to default (opacity 1)
        delete element.dataset.focus;

        // Restore default collapsed size if not selected
        if (!isSelected) {
          element.style.width = '22px';
          element.style.height = '22px';
          element.style.minHeight = '22px';

          const icon = element.querySelector('.marker-icon');
          if (icon) {
            icon.style.width = '12px';
            icon.style.height = '12px';
          }
        }

        // Hide unreviewed, non-favorited markers when search is inactive
        if (!shouldShowOnMap(location)) {
          element.dataset.visibility = 'hidden';
        } else {
          delete element.dataset.visibility;
        }
      }
    });

    return () => {
      searchLabelRefs.current.forEach((m) => m.remove());
      searchLabelRefs.current = [];
    };
  }, [selectedLocationId, isSearchActive, filteredLocationIds]);

  // Fit map when search results change
  useEffect(() => {
    if (!isSearchActive || !mapRef.current) return;
    fitMapToLocations(mapRef.current, filteredLocations);

    // If exactly one result, auto-select it
    if (filteredLocations.length === 1) {
      setSelectedLocationId(filteredLocations[0].id);
    }
  }, [filteredLocations, isSearchActive]);

  if (!mapboxToken) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Find My Study Place</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add a `VITE_MAPBOX_ACCESS_TOKEN` environment variable to enable the map.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Find My Study Place</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Explore study-friendly places on the map. Click a marker to inspect its study summary.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.7fr)]">
        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
            <div className="shrink-0">
              <p className="text-sm font-semibold">Map view</p>
              <p className="text-xs text-muted-foreground">
                {isSearchActive
                  ? `${filteredLocations.length} result${filteredLocations.length !== 1 ? 's' : ''} found`
                  : 'Markers show the place name. Select one to see its ratings.'}
              </p>
            </div>

            <div className="relative w-full max-w-xs">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15" height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="cafe-search"
                type="text"
                placeholder="Search study places..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border bg-background py-2 pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>

          <div className="relative min-h-[68vh] bg-card dark:bg-neutral-900">
            {isLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/75 text-sm text-muted-foreground backdrop-blur-sm">
                Loading study places...
              </div>
            ) : null}
            <div ref={mapContainerRef} className="h-[68vh] w-full" />
          </div>
        </section>

        <aside className="rounded-3xl border bg-card p-6 shadow-sm flex flex-col relative overflow-hidden h-[500px] lg:h-[calc(68vh+60px)] max-h-[500px] lg:max-h-[calc(68vh+60px)] min-h-0">
          <style>{`
            @keyframes slideUpFade {
              0% { opacity: 0; transform: translateY(15px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            .animate-slide-up {
              animation: slideUpFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            @keyframes fillBar {
              from { transform: scaleX(0); }
              to { transform: scaleX(1); }
            }
            .score-bar-fill {
              transform-origin: left;
              animation: fillBar 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>

          <div className="mb-5 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Find My Study Place</p>
              <p className="text-lg font-semibold text-foreground">Your study dashboard</p>
            </div>
            <div className="inline-flex w-full rounded-full border bg-muted/40 p-1 text-xs font-semibold text-muted-foreground">
              <button
                type="button"
                onClick={() => setPanelView('details')}
                aria-pressed={panelView === 'details'}
                className={`flex-1 rounded-full px-2 py-1.5 text-center transition-colors ${panelView === 'details' ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'}`}
              >
                Selected place
              </button>
              <button
                type="button"
                onClick={() => setPanelView('favorites')}
                aria-pressed={panelView === 'favorites'}
                className={`flex-1 rounded-full px-2 py-1.5 text-center transition-colors ${panelView === 'favorites' ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'}`}
              >
                Favourites ({favoriteLocations.length})
              </button>
            </div>
          </div>

          {panelView === 'favorites' ? (
            <div className="flex-1 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
              {favoriteLocations.length ? (
                <div className="space-y-3">
                  {favoriteLocations.map((location) => {
                    const review = location.current_user_review || null;
                    const aiSummary = location.aggregate_profile?.ai_description?.trim() || '';
                    const reviewText = review?.comment?.trim() || '';
                    const reviewSnippet = reviewText
                      ? (reviewText.length > 140 ? `${reviewText.slice(0, 140)}...` : reviewText)
                      : 'No written review yet.';

                    return (
                      <article key={location.id} className="rounded-2xl border bg-background p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-foreground leading-snug">{location.name}</h3>
                            <p className="mt-1 text-xs text-muted-foreground leading-snug">{location.address || 'No address available'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openLocationOnMap(location.id)}
                            className="shrink-0 rounded-full bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                          >
                            Open on map
                          </button>
                        </div>

                        {/* Rating + Review — single column for narrow sidebar */}
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Community rating</p>
                            {hasAIReview(location) ? (
                              <StarDisplay value={location.aggregate_profile?.overall_rating} size={14} />
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="inline-block h-2 w-2 rounded-full bg-amber-400 pending-pulse-dot" />
                                <span>Pending</span>
                              </div>
                            )}
                          </div>

                          <div className="rounded-xl border bg-card px-3 py-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your review</p>
                              <p className="text-xs font-bold text-foreground">
                                {review ? `${formatScore(review.overall_rating)} / 5` : '—'}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground leading-snug">{reviewSnippet}</p>
                          </div>
                        </div>

                        {hasAIReview(location) ? (
                          aiSummary ? (
                            <p className="mt-3 rounded-xl border bg-muted/20 px-3 py-2 text-xs text-foreground/80 leading-snug">
                              {aiSummary.length > 180 ? `${aiSummary.slice(0, 180)}...` : aiSummary}
                            </p>
                          ) : null
                        ) : (
                          <div className="mt-3 flex items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400 pending-pulse-dot" />
                            <span>AI review not yet generated — open on map to request one.</span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                  You have not saved any favourite cafés yet. Mark a café as a favourite from the map, then it will appear here.
                </div>
              )}
            </div>
          ) : selectedLocation ? (
            <div key={selectedLocation.id} className="flex-1 space-y-6 overflow-y-auto pr-1 custom-scrollbar">
              {/* Header Info */}
              <div className="animate-slide-up opacity-0" style={{ animationDelay: '0ms' }}>
                {/* Café name */}
                <h2 className="text-xl font-bold tracking-tight text-foreground leading-tight">
                  {selectedLocation.name}
                </h2>

                {/* Rating row — compact, right below the name */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {hasAIReview(selectedLocation) ? (
                    <StarDisplay value={selectedLocation.aggregate_profile?.overall_rating} size={16} />
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full border bg-muted/20 px-3 py-1 text-xs font-semibold text-muted-foreground">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 pending-pulse-dot" />
                      <span>Pending AI review</span>
                    </div>
                  )}

                  {selectedLocation.besttime_live_busyness !== null && selectedLocation.besttime_live_busyness !== undefined && (
                    <div
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm transition-colors border"
                      style={{
                        backgroundColor:
                          selectedLocation.besttime_live_busyness <= 35
                            ? 'rgba(16,185,129,0.1)'
                            : selectedLocation.besttime_live_busyness <= 70
                              ? 'rgba(245,158,11,0.1)'
                              : 'rgba(239,68,68,0.1)',
                        borderColor:
                          selectedLocation.besttime_live_busyness <= 35
                            ? '#10b981'
                            : selectedLocation.besttime_live_busyness <= 70
                              ? '#f59e0b'
                              : '#ef4444',
                        color:
                          selectedLocation.besttime_live_busyness <= 35
                            ? '#10b981'
                            : selectedLocation.besttime_live_busyness <= 70
                              ? '#f59e0b'
                              : '#ef4444',
                      }}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            selectedLocation.besttime_live_busyness <= 35
                              ? '#10b981'
                              : selectedLocation.besttime_live_busyness <= 70
                                ? '#f59e0b'
                                : '#ef4444',
                        }}
                      />
                      Live: {selectedLocation.besttime_live_busyness}%
                    </div>
                  )}
                </div>

                {/* Address */}
                <p className="mt-2 text-sm text-muted-foreground flex items-start gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                  <span>{selectedLocation.address || 'No address available'}</span>
                </p>

                {/* Action bar — clearly separated */}
                <div className="mt-4 flex items-center gap-2">
                  {userReview && userReview.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowUserReviewDetails((v) => !v)}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-muted"
                        title="Click to view your per-category scores"
                      >
                        Your rating
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                          {formatScore(userReview.overall_rating)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReviewDraft(userReview ? reviewToDraft(userReview) : createEmptyReviewDraft());
                          setIsReviewModalOpen(true);
                        }}
                        className="rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Edit
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setReviewDraft(createEmptyReviewDraft());
                        setIsReviewModalOpen(true);
                      }}
                      className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Leave review
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    aria-pressed={isFavorited}
                    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    className={`favorite-button relative ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${isFavorited ? 'favorite-button--active bg-red-100 text-red-600 shadow-sm' : 'bg-muted/10 text-muted-foreground'} ${favoriteAnimating ? 'favorite-button--animating' : ''} ${favoriteSubmitting ? 'opacity-80' : ''}`}
                    disabled={favoriteSubmitting}
                  >
                    <span className="favorite-button__burst" aria-hidden="true" />
                    <span className={`relative z-10 transition-transform duration-200 ${favoriteAnimating ? 'scale-110' : 'scale-100'}`}>
                      <FavoriteHeartIcon isActive={isFavorited} />
                    </span>
                  </button>
                </div>
                
                {selectionMode && onSelectLocation && (
                  <div className="mt-4 pt-4 border-t animate-slide-up">
                    <button
                      type="button"
                      onClick={() => onSelectLocation(selectedLocation)}
                      className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-md hover:bg-blue-700 active:scale-[0.98] transition-all"
                    >
                      Select this location
                    </button>
                  </div>
                )}
              </div>

              {userReview && showUserReviewDetails ? (
                <div className="animate-slide-up opacity-0" style={{ animationDelay: '80ms' }}>
                  <ReviewSummaryCard review={userReview} />
                </div>
              ) : null}

              {/* Sub-ratings */}
              <div className="animate-slide-up opacity-0" style={{ animationDelay: '100ms' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Vibe & Environment</p>
                {hasAIReview(selectedLocation) ? (
                  <div className="grid grid-cols-2 gap-3">
                    {getSelectedSummary(selectedLocation)?.filter(item => item.label !== 'Overall').map((item) => {
                      const score = Number(item.value);
                      const percentage = isNaN(score) ? 0 : (score / 5) * 100;
                      return (
                        <div key={item.label} className="rounded-2xl border bg-muted/20 p-3 shadow-sm transition-colors hover:bg-muted/40">
                          <div className="flex justify-between items-end mb-2.5">
                            <span className="text-xs font-semibold text-muted-foreground">{item.label}</span>
                            <span className="text-sm font-black">{item.value}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                            <div
                              className="h-full rounded-full score-bar-fill"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: getMarkerColor(score),
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed bg-muted/10 p-4 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-400 pending-pulse-dot" />
                      Scores will appear after AI analysis
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground/70">Request an AI review below to unlock vibe scores.</p>
                  </div>
                )}
              </div>

              {/* Live Crowdness */}
              <div className="animate-slide-up opacity-0" style={{ animationDelay: '150ms' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Crowdness</p>
                  {selectedLocation.besttime_live_fetched_at && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#10b981] animate-ping" />
                      Updated: {new Date(selectedLocation.besttime_live_fetched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4 shadow-sm transition-colors hover:bg-muted/30 relative overflow-hidden">
                  {bestTimeJob && ACTIVE_BESTTIME_JOB_STATUSES.has(bestTimeJob.status) ? (
                    <div className="space-y-3 py-1">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 animate-pulse">
                          <span className="material-symbols-outlined text-[18px]">sync</span>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground leading-none">Checking Crowdness</h4>
                          <p className="text-[10px] text-muted-foreground mt-1 font-medium">{getBestTimeJobLabel(bestTimeJob.status)}</p>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full animate-pulse w-2/3" />
                      </div>
                    </div>
                  ) : selectedLocation.besttime_live_busyness !== null && selectedLocation.besttime_live_busyness !== undefined ? (
                    <div className="space-y-3.5">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              backgroundColor:
                                selectedLocation.besttime_live_busyness <= 35
                                  ? '#10b981'
                                  : selectedLocation.besttime_live_busyness <= 70
                                    ? '#f59e0b'
                                    : '#ef4444',
                            }}
                          />
                          <span className="text-xs font-bold text-foreground">
                            {selectedLocation.besttime_live_busyness <= 35
                              ? 'Quiet / Chill Vibe'
                              : selectedLocation.besttime_live_busyness <= 70
                                ? 'Moderately Busy'
                                : 'Very Busy / Crowded'}
                          </span>
                        </div>
                        <span className="text-xs font-black text-foreground">{selectedLocation.besttime_live_busyness}%</span>
                      </div>

                      <div className="h-2 w-full rounded-full bg-border overflow-hidden relative">
                        <div
                          className="h-full rounded-full score-bar-fill transition-all duration-500"
                          style={{
                            width: `${Math.min(100, selectedLocation.besttime_live_busyness)}%`,
                            backgroundColor:
                              selectedLocation.besttime_live_busyness <= 35
                                ? '#10b981'
                                : selectedLocation.besttime_live_busyness <= 70
                                  ? '#f59e0b'
                                  : '#ef4444',
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-muted-foreground/10">
                        <span className="text-[10px] text-muted-foreground font-medium">
                          Weekly peaks & quiet hours analyzed.
                        </span>
                        <button
                          type="button"
                          onClick={handleCheckCrowdness}
                          disabled={bestTimeLoading}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#10b981] dark:text-[#34d399] hover:underline cursor-pointer border-none bg-none"
                        >
                          <span className="material-symbols-outlined text-[14px]">refresh</span>
                          <span>Update</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-3 space-y-3">
                      <p className="text-xs text-muted-foreground font-medium">
                        Real-time crowdness data is not cached for this venue yet.
                      </p>
                      {bestTimeError && (
                        <p className="text-xs text-destructive font-semibold flex items-center justify-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">error</span>
                          <span>{bestTimeError}</span>
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={handleCheckCrowdness}
                        disabled={bestTimeLoading}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">query_stats</span>
                        <span>Check Live Crowdness</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Overview */}
              <div className="animate-slide-up opacity-0" style={{ animationDelay: '200ms' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">AI Overview</p>
                <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 to-muted/30 p-5 shadow-sm">
                  {/* Subtle AI sparkle icon in background */}
                  <svg className="absolute -right-2 -top-2 h-16 w-16 text-primary/10 rotate-12" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.644 1.517a.75.75 0 0 1 .712 0l9.75 5.25a.75.75 0 0 1 0 1.326l-9.75 5.25a.75.75 0 0 1-.712 0l-9.75-5.25a.75.75 0 0 1 0-1.326l9.75-5.25Z" />
                    <path d="m3.265 10.602 7.668 4.129a2.25 2.25 0 0 0 2.134 0l7.668-4.13-1.065.573-6.603 3.556a.75.75 0 0 1-.712 0l-6.603-3.556-1.065-.572Z" />
                    <path d="m3.265 13.602 7.668 4.129a2.25 2.25 0 0 0 2.134 0l7.668-4.13-1.065.573-6.603 3.556a.75.75 0 0 1-.712 0l-6.603-3.556-1.065-.572Z" />
                  </svg>
                  <p className="relative z-10 text-sm leading-relaxed text-foreground/90 font-medium">
                    {selectedLocation.aggregate_profile?.AIdescription || selectedLocation.aggregate_profile?.ai_description || 'No AI review has been generated for this café yet.'}
                  </p>
                  {!selectedLocation.aggregate_profile ? (
                    <div className="relative z-10 mt-4 space-y-3">
                      {aiGenerationJob && ACTIVE_AI_JOB_STATUSES.has(aiGenerationJob.status) ? (
                        <div className="rounded-2xl border border-indigo-500/20 bg-muted/10 p-5 space-y-4 shadow-inner">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 animate-pulse">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            </div>
                            <div>
                              <h4 className="text-xs font-black uppercase tracking-wider text-foreground leading-none">AI Analysis pipeline</h4>
                              <p className="text-[10px] text-muted-foreground mt-1">Running background tasks...</p>
                            </div>
                          </div>
                          
                          <div className="space-y-2.5 pt-1 border-t border-muted-foreground/10">
                            {[
                              { key: 'queued', label: '1. Queueing Job', desc: 'Submitting task to worker queue...' },
                              { key: 'fetching_reviews', label: '2. Retrieving Reviews', desc: 'Crawling community comments and details...' },
                              { key: 'scoring', label: '3. AI Evaluation', desc: 'Analyzing crowdness, noise, study rating...' }
                            ].map((step, idx) => {
                              const isQueued = aiGenerationJob.status === 'queued';
                              const isFetching = aiGenerationJob.status === 'fetching_reviews';
                              const isScoring = aiGenerationJob.status === 'scoring';
                              
                              let isComplete = false;
                              let isActive = false;
                              
                              if (step.key === 'queued') {
                                isComplete = isFetching || isScoring;
                                isActive = isQueued;
                              } else if (step.key === 'fetching_reviews') {
                                isComplete = isScoring;
                                isActive = isFetching;
                              } else if (step.key === 'scoring') {
                                isComplete = false;
                                isActive = isScoring;
                              }
                              
                              return (
                                <div key={step.key} className="flex gap-3 text-xs leading-normal items-start">
                                  <div className="mt-0.5 shrink-0 flex items-center justify-center">
                                    {isComplete ? (
                                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0d9488] text-white dark:bg-[#14b8a6] border border-[#0f766e]/10 shadow-sm animate-scale-up">
                                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    ) : isActive ? (
                                      <div className="relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-500">
                                        <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-500/20 animate-ping" />
                                        <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-500" />
                                      </div>
                                    ) : (
                                      <div className="h-5 w-5 rounded-full border-2 border-border bg-background" />
                                    )}
                                  </div>
                                  <div>
                                    <p className={`font-semibold ${isActive ? 'text-indigo-600 dark:text-indigo-400' : isComplete ? 'text-foreground/80' : 'text-muted-foreground/40'}`}>
                                      {step.label}
                                    </p>
                                    {isActive && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium leading-tight">
                                        {step.desc}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {aiGenerationJob?.status === 'failed' ? (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {aiGenerationJob.error || 'AI review generation failed.'}
                        </div>
                      ) : null}

                      {aiGenerationError ? (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {aiGenerationError}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleGenerateAIProfile}
                        disabled={aiGenerationLoading || (aiGenerationJob && ACTIVE_AI_JOB_STATUSES.has(aiGenerationJob.status))}
                        className="inline-flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {aiGenerationLoading || (aiGenerationJob && ACTIVE_AI_JOB_STATUSES.has(aiGenerationJob.status))
                          ? getAIJobLabel(aiGenerationJob?.status)
                          : aiGenerationJob?.status === 'failed'
                            ? 'Try again'
                            : 'Request AI Review'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="animate-slide-up opacity-0 space-y-4" style={{ animationDelay: '240ms' }}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">People reviews</p>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewsModalOpen(true);
                      void loadReviewsPage({ page: 1, ordering: reviewsOrdering, append: false });
                    }}
                    className="rounded-full border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
                  >
                    See people reviews
                  </button>
                </div>

                {reviewPreviewError ? (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {reviewPreviewError}
                  </div>
                ) : null}

                {reviewPreviewLoading ? (
                  <div className="rounded-2xl border bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                    Loading reviews...
                  </div>
                ) : null}

                {!reviewPreviewLoading && reviewPreview.length ? (
                  <div className="space-y-3">
                    {reviewPreview.map((review) => (
                      <ReviewListCard key={review.id} review={review} />
                    ))}
                  </div>
                ) : null}

                {!reviewPreviewLoading && !reviewPreview.length && !reviewPreviewError ? (
                  <div className="rounded-2xl border border-dashed bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                    No people reviews yet.
                  </div>
                ) : null}
              </div>


            </div>
          ) : (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center space-y-4 rounded-2xl border border-dashed bg-muted/10 p-8 text-center text-muted-foreground animate-slide-up opacity-0" style={{ animationDelay: '0ms' }}>
              <div className="rounded-full bg-secondary/80 p-4 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-semibold text-foreground">No café selected</p>
                <p className="text-sm">Click any marker on the map to see its AI ratings and vibe analysis.</p>
              </div>
            </div>
          )}
        </aside>
      </div>

      <ReviewsModal
        isOpen={reviewsModalOpen && Boolean(selectedLocation)}
        locationName={selectedLocation?.name || ''}
        reviews={reviews}
        loading={reviewsLoading}
        error={reviewsError}
        ordering={reviewsOrdering}
        onOrderingChange={(nextOrdering) => {
          setReviewsOrdering(nextOrdering);
          void loadReviewsPage({ page: 1, ordering: nextOrdering, append: false });
        }}
        onLoadMore={() => {
          const nextPage = reviewsNextPage || 2;
          void loadReviewsPage({ page: nextPage, ordering: reviewsOrdering, append: true });
        }}
        hasMore={Boolean(reviewsNextPage)}
        onClose={() => setReviewsModalOpen(false)}
      />

      {isReviewModalOpen && selectedLocation ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Close review popup"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setIsReviewModalOpen(false)}
          />

          <div
            ref={reviewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
            className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300"
          >
            <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Leave your review!</p>
                <h2 id="review-modal-title" className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                  {selectedLocation.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tap the left or right side of each star to pick half-star precision.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="rounded-full border bg-background p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close review popup"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                {REVIEW_FIELDS.map((field) => (
                  <StarRatingRow
                    key={field.key}
                    id={`review-rating-${field.key}`}
                    label={field.label}
                    helperText={field.helperText}
                    value={reviewDraft[field.key]}
                    onChange={(nextValue) => {
                      setReviewDraft((currentDraft) => ({
                        ...currentDraft,
                        [field.key]: nextValue,
                      }));
                    }}
                  />
                ))}

                <RatingSparkline value={getReviewPreviewRating(reviewDraft)} />

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-foreground">Optional comment</span>
                  <textarea
                    rows={4}
                    value={reviewDraft.comment}
                    onChange={(event) => setReviewDraft((currentDraft) => ({
                      ...currentDraft,
                      comment: event.target.value,
                    }))}
                    placeholder="What stood out about this place?"
                    className="w-full rounded-2xl border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </label>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsReviewModalOpen(false)}
                    className="rounded-full border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={reviewSubmitting}
                    onClick={async () => {
                      if (!selectedLocation) return;

                      setReviewSubmitting(true);
                      try {
                        const payload = {
                          laptop_friendly: reviewDraft.laptop_friendly,
                          study_friendly: reviewDraft.study_friendly,
                          overall_corwdness: reviewDraft.overall_corwdness,
                          noise_level: reviewDraft.noise_level,
                          comment: reviewDraft.comment,
                        };

                        const data = await createLocationReview(selectedLocation.id, payload);
                        setUserReview(data);
                        setLocations((prevLocations) => prevLocations.map((location) => {
                          if (location.id !== selectedLocation.id) {
                            return location;
                          }

                          return {
                            ...location,
                            current_user_review: data,
                          };
                        }));
                        setReviewDraft(reviewToDraft(data));
                        setIsReviewModalOpen(false);
                      } catch (err) {
                        console.error('Review submit error', err);
                      } finally {
                        setReviewSubmitting(false);
                      }
                    }}
                    className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reviewSubmitting ? 'Saving...' : (userReview && userReview.id ? 'Update review' : 'Submit review')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
