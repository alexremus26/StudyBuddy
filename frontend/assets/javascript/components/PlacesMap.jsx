import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { listCafeLocations } from '../api/client';

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

    const svg = dropShape.querySelector('svg');
    if (svg) {
      Object.assign(svg.style, {
        width: '0px',
        height: '0px',
        opacity: '0',
        position: 'absolute',
        transition: 'opacity 0.15s ease, width 0.15s ease, height 0.15s ease',
      });
    }

    const content = dropShape.querySelector('.marker-content');
    if (content) {
      content.style.opacity = '1';
      content.style.maxHeight = '200px';
      content.style.transition = `opacity 0.3s ${ease} 0.15s, max-height 0.3s ${ease}`;
    }
  } else {
    // Collapsed drop state — only shape/size, never opacity
    Object.assign(outerElement.style, {
      width: '20px',
      height: '20px',
      minHeight: '20px',
      cursor: 'pointer',
      outline: 'none',
      zIndex: '1',
    });

    Object.assign(dropShape.style, {
      width: '100%',
      height: '100%',
      minHeight: 'unset',
      borderRadius: '50% 50% 50% 0',
      transform: 'rotate(-45deg)',
      backgroundColor: color,
      border: '2px solid rgba(255,255,255,0.85)',
      boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
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

    const svg = dropShape.querySelector('svg');
    if (svg) {
      Object.assign(svg.style, {
        width: '10px',
        height: '10px',
        opacity: '1',
        position: 'static',
        transform: 'rotate(45deg)',
        marginTop: '-1px',
        marginLeft: '1px',
        transition: 'opacity 0.2s ease 0.2s, width 0.2s ease, height 0.2s ease',
      });
    }

    const content = dropShape.querySelector('.marker-content');
    if (content) {
      content.style.opacity = '0';
      content.style.maxHeight = '0';
      content.style.transition = `opacity 0.1s ease, max-height 0.2s ${ease}`;
    }
  }
}

function buildMarkerElement(location, isSelected) {
  const outerElement = document.createElement('div');
  outerElement.className = 'cafe-marker';
  const dropShape = document.createElement('div');

  // Coffee icon SVG
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  svg.innerHTML = `
    <path d="M17 8h1a4 4 0 1 1 0 8h-1"></path>
    <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path>
    <line x1="6" x2="6" y1="2" y2="4"></line>
    <line x1="10" x2="10" y1="2" y2="4"></line>
    <line x1="14" x2="14" y1="2" y2="4"></line>
  `;
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

  const overallRating = formatScore(location.aggregate_profile?.overall_rating);
  const summaryItems = getSelectedSummary(location) || [];
  const subRatings = summaryItems
    .filter((item) => item.label !== 'Overall')
    .map((item) => `<span style="opacity:0.75;">${item.label}</span> <b>${item.value}</b>`)
    .join(' &middot; ');

  content.innerHTML =
    `<div style="font-weight:700;font-size:13px;margin-bottom:3px;display:flex;justify-content:space-between;align-items:center;">` +
    `<div style="display:flex;align-items:center;overflow:hidden;">` +
    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${location.name}</span>` +
    `<span style="flex-shrink:0;margin-left:8px;margin-right:8px;">${overallRating}</span>` +
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
    { label: 'Crowd', value: formatScore(profile.overall_crowdness) },
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

export function PlacesMap() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef(new Map());
  const popupRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const searchLabelRefs = useRef([]);

  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

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

  const isSearchActive = filteredLocationIds !== null;

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
          setSelectedLocationId((currentId) => currentId || normalizedLocations[0].id);
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

    const center = getLocationsCenter(locations);

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
    markerRefs.current.forEach(({ marker, element, location }, locationId) => {
      const isSelected = locationId === selectedLocationId;
      applyMarkerStyle(element, element.firstChild, location, isSelected);

      if (isSelected && map && !isSearchActive) {
        map.flyTo({
          center: marker.getLngLat(),
          speed: 1.2,
          curve: 1.42,
          essential: true,
        });
      }
    });
  }, [selectedLocationId, isSearchActive]);

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

        // Set data attribute — CSS handles opacity + pointer-events
        element.dataset.focus = isMatch ? 'match' : 'dimmed';

        // Scale matched collapsed pins bigger
        if (isMatch && !isSelected) {
          element.style.width = '28px';
          element.style.height = '28px';
          element.style.minHeight = '28px';

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
          element.style.width = '20px';
          element.style.height = '20px';
          element.style.minHeight = '20px';
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
        <h1 className="text-3xl font-bold">Find My Café</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add a `VITE_MAPBOX_ACCESS_TOKEN` environment variable to enable the map.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Find My Café</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Explore cafés on the map. Click a marker to inspect its study summary.
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
                  : 'Markers show the café name. Select one to see its ratings.'}
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
                placeholder="Search cafés..."
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
                Loading cafés...
              </div>
            ) : null}
            <div ref={mapContainerRef} className="h-[68vh] w-full" />
          </div>
        </section>

        <aside className="rounded-3xl border bg-card p-6 shadow-sm flex flex-col relative overflow-hidden">
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

          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Selected place</p>
          </div>

          {selectedLocation ? (
            <div key={selectedLocation.id} className="flex-1 space-y-6">
              {/* Header Info */}
              <div className="animate-slide-up opacity-0" style={{ animationDelay: '0ms' }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground leading-tight">
                      {selectedLocation.name}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground flex items-start gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                      {selectedLocation.address || 'No address available'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/5 px-4 py-2 border border-primary/10 shadow-sm">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Rating</span>
                    <span className="text-2xl font-black" style={{ color: getMarkerColor(selectedLocation.aggregate_profile?.overall_rating) }}>
                      {formatScore(selectedLocation.aggregate_profile?.overall_rating)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sub-ratings */}
              <div className="animate-slide-up opacity-0" style={{ animationDelay: '100ms' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Vibe & Environment</p>
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
                    {selectedLocation.aggregate_profile?.AIdescription || selectedLocation.aggregate_profile?.ai_description || 'No description available yet. Try requesting an AI analysis.'}
                  </p>
                </div>
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
    </div>
  );
}