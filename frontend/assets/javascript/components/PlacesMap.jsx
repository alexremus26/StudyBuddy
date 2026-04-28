import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { listCafeLocations } from '../api/client';

const MAPBOX_STYLE = 'mapbox://styles/mapbox/streets-v12';

function formatScore(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 'N/A';
  }

  return numericValue.toFixed(1);
}

function buildMarkerClassName(isSelected) {
  return [
    'group inline-flex origin-bottom items-center',
    isSelected
      ? ''
      : '',
  ].join(' ');
}

function buildMarkerElement(location, isSelected) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = buildMarkerClassName(isSelected);
  element.setAttribute('aria-label', `Select ${location.name}`);

  const label = document.createElement('span');
  label.className = 'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg transition-colors';
  label.textContent = location.name;
  element.appendChild(label);

  return element;
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

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() || '';
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) || null,
    [locations, selectedLocationId],
  );

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
      style: MAPBOX_STYLE,
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

      const marker = new mapboxgl.Marker({ element, anchor: 'bottom' })
        .setLngLat([longitude, latitude])
        .addTo(map);

      markerRefs.current.set(location.id, { marker, element });
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
    markerRefs.current.forEach(({ element }, locationId) => {
      const isSelected = locationId === selectedLocationId;
      const label = element.firstElementChild;
      if (!label) {
        return;
      }

      label.className = isSelected
        ? 'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg border-amber-200 bg-slate-950 text-white ring-2 ring-amber-300/70'
        : 'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg border-slate-200/70 bg-white/95 text-slate-800 hover:border-amber-200 hover:text-amber-700';
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
                <p className="text-sm font-semibold">Rating summary</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(getSelectedSummary(selectedLocation) || []).map((item) => (
                    <div key={item.label} className="rounded-xl border bg-card px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-lg font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border bg-background p-4">
                <p className="text-sm font-semibold">AI description</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedLocation.aggregate_profile?.ai_description || 'No AI summary available yet.'}
                </p>
              </div>

              <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Coordinates</p>
                <p className="mt-2">
                  {selectedLocation.coordinates.latitude.toFixed(5)}, {selectedLocation.coordinates.longitude.toFixed(5)}
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