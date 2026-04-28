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

function applyMarkerStyle(outerElement, dropShape, location, isSelected) {
  const color = getMarkerColor(location.aggregate_profile?.overall_rating);
  const ease = 'cubic-bezier(0.4, 0, 0.2, 1)';

  if (isSelected) {
    // Expanded card state
    Object.assign(outerElement.style, {
      width: '200px',
      height: 'auto',
      minHeight: '50px',
      transition: `width 0.4s ${ease}, min-height 0.4s ${ease}`,
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
      transition: `all 0.4s ${ease}`,
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
    // Collapsed drop state
    Object.assign(outerElement.style, {
      width: '20px',
      height: '20px',
      minHeight: '20px',
      transition: `width 0.35s ${ease}, height 0.35s ${ease}, min-height 0.35s ${ease}`,
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
      transition: `all 0.35s ${ease}`,
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
      `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${location.name}</span>` +
      `<span style="flex-shrink:0;margin-left:8px;">${overallRating}</span>` +
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

export function PlacesMap() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef(new Map());
  const popupRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() || '';
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) || null,
    [locations, selectedLocationId],
  );

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
        setSelectedLocationId(location.id);
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

  useEffect(() => {
    markerRefs.current.forEach(({ marker, element, location }, locationId) => {
      const isSelected = locationId === selectedLocationId;
      applyMarkerStyle(element, element.firstChild, location, isSelected);

      if (isSelected && mapRef.current) {
        mapRef.current.flyTo({
          center: marker.getLngLat(),
          speed: 1.2,
          curve: 1.42,
          essential: true,
        });
      }
    });
  }, [selectedLocationId]);

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
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Map view</p>
            <p className="text-xs text-muted-foreground">Markers show the café name. Select one to see its ratings.</p>
          </div>

          <div className="relative min-h-[68vh] bg-slate-100">
            {isLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/75 text-sm text-muted-foreground backdrop-blur-sm">
                Loading cafés...
              </div>
            ) : null}
            <div ref={mapContainerRef} className="h-[68vh] w-full" />
          </div>
        </section>

        <aside className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Selected place</p>
            <h2 className="mt-1 text-xl font-semibold">{selectedLocation?.name || 'Pick a café'}</h2>
          </div>

          {selectedLocation ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{selectedLocation.address || 'No address available'}</p>
              </div>

              <div className="rounded-2xl border bg-background p-4">
                <p className="text-sm font-semibold">Overview</p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {selectedLocation.aggregate_profile?.ai_description || 'No description available yet.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
              Select a café on the map to reveal its ratings and AI summary.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}