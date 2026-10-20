import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { appStore, COMMON, pick, useForeground, useLang, useOnline, useT, type AppDef, type AppProps } from "../kernel";
import { Button, IconButton, ListItem, OfflineState, Scaffold, SearchField, Spinner } from "../ui";

const S = {
  ...COMMON,
  name: ["Haritalar", "Maps"],
  description: ["Harita, konumunuz ve yer arama", "Maps, your location and place search"],
  searchPlaces: ["Burada arayın", "Search here"],
  myLocation: ["Konumum", "My location"],
  locationFailed: ["Konum alınamadı", "Couldn't get your location"],
  noPlaces: ["Yer bulunamadı", "No places found"],
  droppedPin: ["İşaretlenen konum", "Dropped pin"],
  zoomIn: ["Yakınlaştır", "Zoom in"],
  zoomOut: ["Uzaklaştır", "Zoom out"],
} as const;

interface Place {
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

const useMaps = appStore("maps", { center: [41.0082, 28.9784] as [number, number], zoom: 12 });
const pinIcon = (symbol: string) => L.divIcon({ className: "", html: `<span class="icon filled" style="font-size:40px;color:#d93025;text-shadow:0 2px 4px #0006">${symbol}</span>`, iconSize: [40, 40], iconAnchor: [20, 38] });
const fixed = (value: number) => value.toFixed(5);

function Maps({ intent, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const online = useOnline();
  const foreground = useForeground();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const me = useRef<L.CircleMarker | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);

  const show = (place: Place) => {
    setSelected(place);
    setResults(null);
    marker.current?.remove();
    if (!map.current) return;
    marker.current = L.marker([place.lat, place.lng], { icon: pinIcon("location_on") }).addTo(map.current);
    map.current.flyTo([place.lat, place.lng], Math.max(map.current.getZoom(), 15));
  };

  useEffect(() => {
    if (!element.current || map.current) return;
    const { center, zoom } = useMaps.getState();
    const instance = L.map(element.current, { zoomControl: false, attributionControl: true }).setView(center, zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(instance);
    instance.on("moveend", () => useMaps.setState({ center: [instance.getCenter().lat, instance.getCenter().lng], zoom: instance.getZoom() }));
    // Long press (contextmenu on touch) drops a pin, as in Android map apps.
    instance.on("contextmenu", event => show({ name: pick(S.droppedPin), detail: `${fixed(event.latlng.lat)}, ${fixed(event.latlng.lng)}`, lat: event.latlng.lat, lng: event.latlng.lng }));
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  // A hidden window has no size, so Leaflet must re-measure when the app comes back.
  useEffect(() => {
    if (foreground) setTimeout(() => map.current?.invalidateSize(), 50);
  }, [foreground]);

  useEffect(() => {
    const match = /^geo:(-?[\d.]+),(-?[\d.]+)(?:\?q=(.*))?/.exec(intent.data ?? "");
    if (match) show({ name: decodeURIComponent(match[3] ?? "") || pick(S.droppedPin), detail: `${match[1]}, ${match[2]}`, lat: Number(match[1]), lng: Number(match[2]) });
  }, [intent]);

  const locate = async () => {
    setBusy(true);
    try {
      const { lat, lng } = await os.locate();
      me.current?.remove();
      if (map.current) me.current = L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1 }).addTo(map.current);
      map.current?.flyTo([lat, lng], 16);
    } catch {
      os.toast(t("locationFailed"));
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const response = await os.fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=${lang}&q=${encodeURIComponent(query)}`);
      const rows = (await response.json()) as { name: string; display_name: string; lat: string; lon: string }[];
      setResults(rows.map(row => ({ name: row.name || row.display_name.split(",")[0], detail: row.display_name, lat: Number(row.lat), lng: Number(row.lon) })));
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Scaffold>
      <div className="relative h-full">
        <div ref={element} className="absolute inset-0 z-0" />
        {!online && <div className="absolute inset-0 z-[500] bg-surface"><OfflineState /></div>}
        <form className="absolute inset-x-3 top-3 z-[600]" onSubmit={event => {
          event.preventDefault();
          void search();
        }}>
          <SearchField value={query} onChange={setQuery} placeholder={t("searchPlaces")} />
          {busy && <div className="mt-2 flex justify-center"><Spinner size={28} /></div>}
          {results && (
            <div className="mt-2 max-h-80 overflow-y-auto rounded-3xl bg-surface-container shadow-xl">
              {results.length === 0 && <p className="p-4 text-body text-on-surface-variant">{t("noPlaces")}</p>}
              {results.map(place => <ListItem key={`${place.lat},${place.lng}`} icon="location_on" headline={place.name} supporting={place.detail} onClick={() => show(place)} />)}
            </div>
          )}
        </form>
        <div className="absolute right-3 bottom-36 z-[600] flex flex-col gap-2">
          <IconButton icon="add" label={t("zoomIn")} variant="tonal" onClick={() => map.current?.zoomIn()} />
          <IconButton icon="remove" label={t("zoomOut")} variant="tonal" onClick={() => map.current?.zoomOut()} />
          <IconButton icon="my_location" label={t("myLocation")} variant="filled" size={56} onClick={() => void locate()} />
        </div>
        {selected && (
          <div className="enter-up absolute inset-x-3 bottom-3 z-[600] rounded-3xl bg-surface-container p-4 shadow-xl">
            <p className="text-title">{selected.name}</p>
            <p className="line-clamp-2 text-body text-on-surface-variant">{selected.detail}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="tonal" icon="share" onClick={() => os.share({ type: "text/plain", text: `${selected.name}\nhttps://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lng}#map=16/${selected.lat}/${selected.lng}` })}>{t("share")}</Button>
              <Button variant="text" onClick={() => setSelected(null)}>{t("close")}</Button>
            </div>
          </div>
        )}
      </div>
    </Scaffold>
  );
}

export default {
  id: "maps",
  name: S.name,
  icon: "map",
  tint: { hue: 125 },
  description: S.description,
  permissions: ["location"],
  preinstalled: false,
  handles: [{ action: "VIEW", scheme: "geo" }],
  Component: Maps,
} satisfies AppDef;
