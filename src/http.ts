// Shared by src/server.ts and the GitHub Pages service worker (src/static/sw.ts), so both answer /api the same way.

export const DEVICE = /^[a-z0-9-]{1,40}$/;
export const FIRST_NUMBER = 5550100;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1?\]|\[f[cd])/i;
const USER_AGENT = { "user-agent": "Mozilla/5.0 (Linux; Android 15; WebDroid) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" };
export const done = () => new Response(null, { status: 204 });
export const bad = () => new Response("bad request", { status: 400 });

export function validPath(path: string | null | undefined): path is string {
  return !!path && path.startsWith("/") && !path.includes("..") && !path.includes("\0") && path.length <= 512;
}

// Proxied pages render in a sandboxed srcdoc iframe; this script lets the Browser app follow links and forms.
const BRIDGE = `<script>(function(){
var post=function(m){m.webdroid=1;parent.postMessage(m,"*")};
addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;
var u=new URL(a.getAttribute("href"),document.baseURI);if(!/^https?:$/.test(u.protocol))return;e.preventDefault();
if(u.hash&&u.href.split("#")[0]===document.baseURI.split("#")[0]){var t=document.getElementById(u.hash.slice(1));if(t)t.scrollIntoView();return}
post({type:"nav",url:u.href})},true);
addEventListener("submit",function(e){var f=e.target;if((f.method||"get").toLowerCase()!=="get")return;e.preventDefault();
var u=new URL(f.getAttribute("action")||"",document.baseURI);new FormData(f).forEach(function(v,k){u.searchParams.append(k,String(v))});
post({type:"nav",url:u.href})},true);
addEventListener("DOMContentLoaded",function(){post({type:"title",title:document.title})});
})();</script>`;

// A browser cannot set user-agent without a CORS preflight, so the service worker passes no headers.
export async function proxy(target: string | null, headers: Record<string, string> = USER_AGENT): Promise<Response> {
  let url: URL;
  try {
    url = new URL(target ?? "");
  } catch {
    return bad();
  }
  // Hostname check only: DNS rebinding is not handled, which is acceptable for a local simulator.
  if (!/^https?:$/.test(url.protocol) || PRIVATE_HOST.test(url.hostname)) return new Response("forbidden", { status: 403 });
  const upstream = await fetch(url, { redirect: "follow", headers, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!upstream) return new Response("unreachable", { status: 502 });
  const type = upstream.headers.get("content-type") ?? "text/html";
  const responseHeaders = { "content-type": type, "x-final-url": upstream.url, "x-upstream-status": String(upstream.status) };
  if (!type.includes("text/html")) return new Response(upstream.body, { headers: responseHeaders });
  const html = await upstream.text();
  const head = `<base href="${upstream.url.replace(/"/g, "&quot;")}">${BRIDGE}`;
  const injected = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, match => match + head) : head + html;
  return new Response(injected, { headers: responseHeaders });
}

// Audio/video elements need byte ranges to seek.
export function ranged(req: Request, data: Uint8Array<ArrayBuffer>, mime: string): Response {
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  const headers = { "content-type": mime, "accept-ranges": "bytes" };
  if (!range) return new Response(data, { headers });
  const start = range[1] ? Number(range[1]) : Math.max(0, data.length - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
  if (start >= data.length) return new Response(null, { status: 416, headers: { "content-range": `bytes */${data.length}` } });
  return new Response(data.subarray(start, end + 1), {
    status: 206,
    headers: { ...headers, "content-range": `bytes ${start}-${end}/${data.length}` },
  });
}
