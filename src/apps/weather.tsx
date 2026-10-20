import { useEffect, useState } from "react";
import { appStore, COMMON, formatDate, formatTime, pick, useLang, useOnline, useT, type AppDef, type AppProps, type Os } from "../kernel";
import { Button, EmptyState, ErrorState, Icon, IconButton, ListItem, Loading, OfflineState, Scaffold, SearchField, Sheet } from "../ui";

const S = {
  ...COMMON,
  name: ["Hava Durumu", "Weather"],
  description: ["Konumunuza göre anlık, saatlik ve 7 günlük tahmin", "Current, hourly and 7-day forecast for your location"],
  useLocation: ["Konumumu kullan", "Use my location"],
  chooseCity: ["Şehir seçin", "Choose a city"],
  noPlace: ["Hava durumunu görmek için bir konum seçin", "Choose a location to see the weather"],
  feelsLike: ["Hissedilen {n}°", "Feels like {n}°"],
  humidity: ["Nem %{n}", "Humidity {n}%"],
  wind: ["Rüzgar {n} km/s", "Wind {n} km/h"],
  hourly: ["Saatlik tahmin", "Hourly forecast"],
  daily: ["7 günlük tahmin", "7-day forecast"],
  myLocation: ["Konumum", "My location"],
  updated: ["Güncellendi {time}", "Updated {time}"],
  clear: ["Açık", "Clear"], cloudy: ["Parçalı bulutlu", "Partly cloudy"], overcast: ["Kapalı", "Overcast"], fog: ["Sisli", "Fog"], drizzle: ["Çisenti", "Drizzle"],
  rain: ["Yağmurlu", "Rain"], snow: ["Karlı", "Snow"], showers: ["Sağanak", "Showers"], storm: ["Gök gürültülü fırtına", "Thunderstorm"],
} as const;

type Condition = "clear" | "cloudy" | "overcast" | "fog" | "drizzle" | "rain" | "snow" | "showers" | "storm";
const ICONS: Record<Condition, string> = { clear: "sunny", cloudy: "partly_cloudy_day", overcast: "cloud", fog: "foggy", drizzle: "rainy_light", rain: "rainy", snow: "weather_snowy", showers: "rainy_heavy", storm: "thunderstorm" };

/** WMO weather interpretation codes, grouped the way forecast apps present them. */
export function conditionOf(code: number): Condition {
  if (code === 0) return "clear";
  if (code <= 2) return "cloudy";
  if (code === 3) return "overcast";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77 || code === 85 || code === 86) return "snow";
  if (code <= 82) return "showers";
  return "storm";
}

interface Forecast {
  current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
}
type Place = { name: string; lat: number; lng: number };

const useWeather = appStore("weather", { place: null as Place | null, forecast: null as Forecast | null, updated: 0 });
const STALE_MS = 30 * 60000;
/** Widget backdrops follow the sky, so the home screen changes with the weather. */
const SKIES: Record<Condition, string> = {
  clear: "bg-gradient-to-br from-amber-400 to-sky-500", cloudy: "bg-gradient-to-br from-sky-400 to-slate-500", overcast: "bg-gradient-to-br from-slate-400 to-slate-600",
  fog: "bg-gradient-to-br from-zinc-400 to-slate-500", drizzle: "bg-gradient-to-br from-sky-500 to-slate-600", rain: "bg-gradient-to-br from-slate-500 to-indigo-700",
  snow: "bg-gradient-to-br from-sky-200 to-indigo-400", showers: "bg-gradient-to-br from-slate-600 to-blue-800", storm: "bg-gradient-to-br from-slate-700 to-purple-900",
};

async function refresh(os: Os, place: Place): Promise<void> {
  const fields = "current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min";
  const response = await os.fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lng}&${fields}&timezone=auto&forecast_days=7`);
  if (!response.ok) throw new Error(String(response.status));
  useWeather.setState({ place, forecast: (await response.json()) as Forecast, updated: Date.now() });
}

function Weather({ os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const online = useOnline();
  const { place, forecast, updated } = useWeather();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<Place[]>([]);

  const load = async (target: Place | null = place) => {
    if (!target) return;
    setState("loading");
    try {
      await refresh(os, target);
      setState("idle");
    } catch {
      setState("error");
    }
  };
  useEffect(() => {
    if (online && place && Date.now() - updated > STALE_MS) void load();
  }, [online]);

  const locateMe = async () => {
    setPicking(false);
    try {
      const { lat, lng } = await os.locate();
      const reverse = await os.fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=${lang}&lat=${lat}&lon=${lng}`).then(response => response.json() as Promise<{ name?: string }>).catch(() => ({ name: undefined }));
      await load({ name: reverse.name ?? pick(S.myLocation), lat, lng });
    } catch {
      setState("error");
    }
  };
  const chooseCity = (city: Place) => {
    setPicking(false);
    void load(city);
  };
  const searchCities = async (text: string) => {
    setQuery(text);
    if (text.trim().length < 2) return setCities([]);
    const response = await os.fetch(`https://geocoding-api.open-meteo.com/v1/search?count=8&language=${lang}&name=${encodeURIComponent(text)}`).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { results?: { name: string; country?: string; latitude: number; longitude: number }[] } | null;
    setCities((data?.results ?? []).map(city => ({ name: [city.name, city.country].filter(Boolean).join(", "), lat: city.latitude, lng: city.longitude })));
  };

  const body = () => {
    if (!online && !forecast) return <OfflineState onRetry={() => void load()} />;
    if (!place) return <EmptyState icon="location_on" title={t("noPlace")} action={<Button icon="my_location" onClick={() => void locateMe()}>{t("useLocation")}</Button>} />;
    if (state === "loading" && !forecast) return <Loading />;
    if (state === "error" && !forecast) return <ErrorState onRetry={() => void load()} />;
    if (!forecast) return null;
    const condition = conditionOf(forecast.current.weather_code);
    const now = forecast.hourly.time.findIndex(time => new Date(time).getTime() > Date.now() - 3600000);
    return (
      <div className="flex flex-col gap-4 px-4 pb-8">
        {!online && <OfflineState />}
        <div className="flex items-center justify-between rounded-4xl bg-primary-container p-6 text-on-primary-container">
          <div>
            <p className="text-[4.5rem] leading-none font-light">{Math.round(forecast.current.temperature_2m)}°</p>
            <p className="mt-2 text-title">{t(condition)}</p>
            <p className="text-body opacity-80">{t("feelsLike", { n: Math.round(forecast.current.apparent_temperature) })}</p>
          </div>
          <Icon name={ICONS[condition]} filled size={88} />
        </div>
        <div className="flex justify-around text-body text-on-surface-variant">
          <span>{t("humidity", { n: forecast.current.relative_humidity_2m })}</span>
          <span>{t("wind", { n: Math.round(forecast.current.wind_speed_10m) })}</span>
        </div>
        <section className="rounded-4xl bg-surface-container p-4">
          <h2 className="pb-3 text-title-sm">{t("hourly")}</h2>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {forecast.hourly.time.slice(Math.max(0, now), Math.max(0, now) + 24).map((time, index) => (
              <div key={time} className="flex min-w-12 flex-col items-center gap-1 text-body">
                <span className="text-label-sm text-on-surface-variant">{formatTime(new Date(time), lang)}</span>
                <Icon name={ICONS[conditionOf(forecast.hourly.weather_code[Math.max(0, now) + index])]} filled className="text-primary" />
                <span>{Math.round(forecast.hourly.temperature_2m[Math.max(0, now) + index])}°</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-4xl bg-surface-container py-2">
          <h2 className="px-4 pt-2 text-title-sm">{t("daily")}</h2>
          {forecast.daily.time.map((day, index) => (
            <ListItem
              key={day}
              leading={<Icon name={ICONS[conditionOf(forecast.daily.weather_code[index])]} filled className="text-primary" />}
              headline={index === 0 ? t("today") : formatDate(new Date(day), { weekday: "long" }, lang)}
              trailing={<span className="text-body text-on-surface">{`${Math.round(forecast.daily.temperature_2m_max[index])}° / ${Math.round(forecast.daily.temperature_2m_min[index])}°`}</span>}
            />
          ))}
        </section>
        <p className="text-center text-label-sm text-on-surface-variant">{t("updated", { time: formatTime(updated, lang) })}</p>
      </div>
    );
  };

  return (
    <Scaffold
      title={place?.name ?? t("name")}
      actions={
        <>
          <IconButton icon="refresh" label={t("retry")} disabled={!place || state === "loading"} onClick={() => void load()} />
          <IconButton icon="edit_location_alt" label={t("chooseCity")} onClick={() => setPicking(true)} />
        </>
      }
    >
      {body()}
      <Sheet open={picking} onClose={() => setPicking(false)} title={t("chooseCity")}>
        <div className="px-4 pb-2">
          <SearchField value={query} onChange={text => void searchCities(text)} placeholder={t("search")} />
        </div>
        <ListItem icon="my_location" headline={t("useLocation")} onClick={() => void locateMe()} />
        {cities.map(city => <ListItem key={`${city.lat},${city.lng}`} icon="location_city" headline={city.name} onClick={() => chooseCity(city)} />)}
      </Sheet>
    </Scaffold>
  );
}

/** Launcher "at a glance" weather; refreshes itself when the cached forecast is stale. */
function WeatherWidget({ os }: { os: Os }) {
  const { place, forecast, updated } = useWeather();
  const online = useOnline();
  useEffect(() => {
    if (online && place && Date.now() - updated > STALE_MS) void refresh(os, place).catch(() => undefined);
  }, [online, place, updated, os]);
  const t = useT(S);
  const card = "flex aspect-square w-full flex-col rounded-[2.25rem] p-4";
  if (!forecast || !place) {
    return (
      <span className={`${card} items-center justify-center gap-2 bg-secondary-container text-center text-on-secondary-container`}>
        <Icon name="add_location_alt" size={36} />
        <span className="text-label">{t("useLocation")}</span>
      </span>
    );
  }
  const condition = conditionOf(forecast.current.weather_code);
  return (
    <span className={`${card} justify-between text-white ${SKIES[condition]}`}>
      <span className="flex items-start justify-between">
        <span className="text-[2.75rem] leading-none font-medium">{Math.round(forecast.current.temperature_2m)}°</span>
        <Icon name={ICONS[condition]} filled size={40} className="animate-[float_4s_ease-in-out_infinite]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-title-sm">{place.name}</span>
        <span className="block truncate text-label-sm opacity-90">{`${t(condition)} · ${Math.round(forecast.daily.temperature_2m_max[0])}° / ${Math.round(forecast.daily.temperature_2m_min[0])}°`}</span>
      </span>
    </span>
  );
}

export default {
  id: "weather",
  name: S.name,
  icon: "partly_cloudy_day",
  tint: { hue: 230 },
  description: S.description,
  permissions: ["location"],
  Component: Weather,
  Widget: WeatherWidget,
} satisfies AppDef;
