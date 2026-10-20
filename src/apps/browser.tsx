import { useEffect, useRef, useState, type FormEvent } from "react";
import { appStore, COMMON, formatSize, pick, takenPath, uniquePath, useOnline, useT, type AppDef, type AppProps } from "../kernel";
import { Button, EmptyState, ErrorState, Icon, IconButton, ListItem, Menu, OfflineState, Scaffold, SearchField, Spinner } from "../ui";

const S = {
  ...COMMON,
  name: ["Tarayıcı", "Browser"],
  description: ["Sekmeler, yer imleri ve geçmişle web'de gezinin", "Browse the web with tabs, bookmarks and history"],
  address: ["Arayın veya web adresi yazın", "Search or type web address"],
  newTab: ["Yeni sekme", "New tab"],
  tabs: ["Sekmeler", "Tabs"],
  bookmarks: ["Yer imleri", "Bookmarks"],
  history: ["Geçmiş", "History"],
  clearHistory: ["Geçmişi temizle", "Clear history"],
  bookmark: ["Yer imi ekle", "Bookmark"],
  forward: ["İleri", "Forward"],
  reload: ["Yenile", "Reload"],
  noBookmarks: ["Yer imi yok", "No bookmarks"],
  noHistory: ["Geçmiş boş", "History is empty"],
  blocked: ["Bu sayfa açılamıyor", "This page can't be opened"],
  blockedHint: ["Adres geçersiz veya yerel ağa ait. Başka bir adres deneyin.", "The address is invalid or points to a local network. Try another address."],
  unreachable: ["Siteye ulaşılamıyor", "This site can't be reached"],
  unreachableHint: ["{host} yanıt vermedi veya bağlantıyı reddetti.", "{host} didn't respond or refused the connection."],
  httpError: ["Sayfa hata döndürdü ({status})", "The page returned an error ({status})"],
  file: ["Dosya", "File"],
  download: ["İndir", "Download"],
  downloaded: ["İndirme tamamlandı", "Download complete"],
  channel: ["İndirmeler", "Downloads"],
} as const;

interface Tab {
  id: string;
  history: string[];
  index: number;
  title: string;
}

const blankTab = (): Tab => ({ id: crypto.randomUUID(), history: [], index: -1, title: "" });
const useBrowser = appStore("browser", {
  tabs: [blankTab()],
  active: 0,
  bookmarks: [] as { url: string; title: string }[],
  visited: [] as { url: string; title: string; time: number }[],
});

/** Text with a dot and no spaces is treated as an address; anything else is a search. */
export function toUrl(input: string): string {
  const text = input.trim();
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[^\s]+\.[^\s]{2,}$/.test(text)) return `https://${text}`;
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(text)}`;
}

type Page = { kind: "html"; html: string } | { kind: "file"; url: string; type: string; size: number; blob: Blob } | { kind: "error"; status: number };

function Browser({ intent, route, os }: AppProps) {
  const t = useT(S);
  const online = useOnline();
  const { tabs, active, bookmarks, visited } = useBrowser();
  const tab = tabs[active] ?? tabs[0];
  const url = tab.history[tab.index] ?? "";
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState(url);
  const [menu, setMenu] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  const updateTab = (patch: Partial<Tab>) => useBrowser.setState(state => ({ tabs: state.tabs.map((item, index) => (index === state.active ? { ...item, ...patch } : item)) }));
  // Reads the store fresh so it is safe from message handlers and right after opening a tab.
  const navigate = (target: string) => {
    const next = target.startsWith("/") ? `file://${target}` : toUrl(target);
    useBrowser.setState(state => ({
      tabs: state.tabs.map((item, index) => (index === state.active ? { ...item, history: [...item.history.slice(0, item.index + 1), next], index: item.index + 1, title: next } : item)),
    }));
  };
  const openTab = (target?: string) => {
    useBrowser.setState(state => ({ tabs: [...state.tabs, blankTab()], active: state.tabs.length }));
    if (target) navigate(target);
    os.replace("main");
  };
  const openFromList = (target: string) => {
    os.back();
    navigate(target);
  };
  const selectTab = (index: number) => {
    useBrowser.setState({ active: index });
    os.back();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (address.trim()) navigate(address);
  };

  useEffect(() => {
    if (intent.action === "VIEW" && intent.data) openTab(intent.data);
  }, [intent]);
  useEffect(() => {
    setAddress(url);
  }, [url]);

  // Every page goes through the server proxy: it strips frame-blocking headers and adds the link bridge.
  useEffect(() => {
    if (!url || (!online && !url.startsWith("file://"))) return setPage(null);
    let cancelled = false;
    setLoading(true);
    // Local files (opened from Files) are read from the device instead of the network.
    const request = url.startsWith("file://")
      ? os.fs.read(url.slice(7)).then(blob => new Response(blob, { headers: { "content-type": blob.type } }))
      : os.fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    request
      .then(async response => {
        if (cancelled) return;
        const type = response.headers.get("content-type") ?? "";
        const upstream = Number(response.headers.get("x-upstream-status") ?? response.status);
        if (!response.ok) return setPage({ kind: "error", status: response.status });
        if (upstream >= 400 && !type.includes("text/html")) return setPage({ kind: "error", status: upstream });
        if (type.includes("text/html")) return setPage({ kind: "html", html: await response.text() });
        const blob = await response.blob();
        setPage({ kind: "file", url, type, size: blob.size, blob });
      })
      .catch(() => !cancelled && setPage({ kind: "error", status: 0 }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [url, online, attempt]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { webdroid?: number; type?: string; url?: string; title?: string };
      if (event.source !== frame.current?.contentWindow || !data?.webdroid) return;
      if (data.type === "nav" && data.url) navigate(data.url);
      if (data.type === "title" && data.title) {
        updateTab({ title: data.title });
        useBrowser.setState(state => ({ visited: [{ url, title: data.title ?? url, time: Date.now() }, ...state.visited.filter(entry => entry.url !== url)].slice(0, 200) }));
      }
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  });

  const download = async () => {
    if (page?.kind !== "file") return;
    const name = decodeURIComponent(new URL(page.url).pathname.split("/").pop() || "download");
    const path = uniquePath(`/Download/${name}`, takenPath);
    await os.fs.write(path, page.blob, page.type.split(";")[0]);
    os.notify({ channel: "downloads", icon: "download_done", title: pick(S.downloaded), text: name, intent: { action: "VIEW", type: page.type.split(";")[0], data: path } });
  };
  const host = url ? new URL(url).host : "";
  const bookmarked = bookmarks.some(entry => entry.url === url);
  const toggleBookmark = () => useBrowser.setState({ bookmarks: bookmarked ? bookmarks.filter(entry => entry.url !== url) : [...bookmarks, { url, title: tab.title || url }] });
  const go = (delta: number) => updateTab({ index: tab.index + delta });
  const list = (items: { url: string; title: string }[], empty: string, icon: string) =>
    items.length ? items.map(item => <ListItem key={item.url} icon={icon} headline={item.title} supporting={item.url} onClick={() => openFromList(item.url)} />) : <EmptyState icon={icon} title={empty} />;

  if (route === "tabs") {
    return (
      <Scaffold title={t("tabs")} onBack={os.back} fab={<Button icon="add" onClick={() => openTab()}>{t("newTab")}</Button>}>
        <div className="grid grid-cols-2 gap-3 p-3">
          {tabs.map((item, index) => (
            <div key={item.id} className={`relative h-40 rounded-3xl border p-3 ${index === active ? "border-primary bg-secondary-container" : "border-outline-variant bg-surface-container"}`}>
              <button type="button" className="size-full text-left text-body" onClick={() => selectTab(index)}>{item.title || t("newTab")}</button>
              <IconButton icon="close" label={t("close")} className="absolute top-1 right-1" onClick={() => useBrowser.setState(state => ({ tabs: state.tabs.length > 1 ? state.tabs.filter(entry => entry.id !== item.id) : [blankTab()], active: 0 }))} />
            </div>
          ))}
        </div>
      </Scaffold>
    );
  }
  if (route === "bookmarks") return <Scaffold title={t("bookmarks")} onBack={os.back}>{list(bookmarks, t("noBookmarks"), "star")}</Scaffold>;
  if (route === "history") {
    return <Scaffold title={t("history")} onBack={os.back} actions={<IconButton icon="delete_sweep" label={t("clearHistory")} onClick={() => useBrowser.setState({ visited: [] })} />}>{list(visited, t("noHistory"), "history")}</Scaffold>;
  }

  const errorText = (status: number) => {
    if (status === 400 || status === 403) return `${t("blocked")}. ${t("blockedHint")}`;
    if (status === 0 || status === 502) return `${t("unreachable")}. ${t("unreachableHint", { host })}`;
    return t("httpError", { status });
  };
  const content = () => {
    if (!online) return <OfflineState onRetry={() => setAttempt(attempt + 1)} />;
    if (!url) {
      return (
        <div className="flex flex-col gap-3 p-4">
          <Icon name="travel_explore" size={64} className="mx-auto mt-10 text-primary" />
          {bookmarks.slice(0, 8).map(item => <ListItem key={item.url} icon="star" headline={item.title} supporting={item.url} onClick={() => navigate(item.url)} />)}
        </div>
      );
    }
    if (loading || !page) return <div className="grid h-full place-items-center"><Spinner /></div>;
    if (page.kind === "error") return <ErrorState text={errorText(page.status)} onRetry={() => setAttempt(attempt + 1)} />;
    if (page.kind === "file") {
      return <EmptyState icon="description" title={decodeURIComponent(url.split("/").pop() || t("file"))} text={`${page.type.split(";")[0]} · ${formatSize(page.size)}`} action={<Button icon="download" onClick={() => void download()}>{t("download")}</Button>} />;
    }
    return <iframe ref={frame} title={tab.title || host} sandbox="allow-scripts allow-forms allow-popups" srcDoc={page.html} className="size-full border-0 bg-white" />;
  };

  return (
    <Scaffold
      bottom={
        <div className="flex items-center justify-between px-5 py-1">
          <IconButton icon="arrow_back" label={t("back")} disabled={tab.index <= 0} onClick={() => go(-1)} />
          <IconButton icon="arrow_forward" label={t("forward")} disabled={tab.index >= tab.history.length - 1} onClick={() => go(1)} />
          <IconButton icon="refresh" label={t("reload")} disabled={!url} onClick={() => setAttempt(attempt + 1)} />
          <button type="button" aria-label={t("tabs")} onClick={() => os.push("tabs")} className="ripple grid size-10 place-items-center rounded-full">
            <span className="grid size-6 place-items-center rounded-md border-2 border-current text-label-sm">{tabs.length}</span>
          </button>
          <IconButton icon="more_vert" label={t("more")} onClick={() => setMenu(true)} />
        </div>
      }
    >
      <div className="flex h-full flex-col">
        <form className="flex items-center gap-1 px-2 py-2" onSubmit={submit}>
          <div className="min-w-0 flex-1"><SearchField value={address} onChange={setAddress} placeholder={t("address")} /></div>
          {url && <IconButton icon="star" selected={bookmarked} label={t("bookmark")} onClick={toggleBookmark} />}
        </form>
        <div className="relative min-h-0 flex-1">{content()}</div>
      </div>
      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: t("newTab"), icon: "add", onClick: () => openTab() },
          { label: t("bookmarks"), icon: "star", onClick: () => os.push("bookmarks") },
          { label: t("history"), icon: "history", onClick: () => os.push("history") },
          ...(url ? [{ label: t("share"), icon: "share", onClick: () => os.share({ type: "text/plain", text: url }) }] : []),
        ]}
      />
    </Scaffold>
  );
}

export default {
  id: "browser",
  name: S.name,
  icon: "public",
  tint: { hue: 205 },
  description: S.description,
  channels: { downloads: { name: S.channel, importance: "default" } },
  permissions: ["notifications"],
  handles: [{ action: "VIEW", scheme: "https" }, { action: "VIEW", scheme: "http" }, { action: "VIEW", type: "text/html" }],
  Component: Browser,
} satisfies AppDef;
