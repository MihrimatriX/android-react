import { fileUrl, writeFile } from "../kernel/fs";
import { fileStamp, pick } from "../kernel/i18n";
import { notify } from "../kernel/notifications";
import { play } from "../kernel/sound";
import { S } from "./strings";
import { useUi } from "./store";

let fontCss: string | undefined;
/** The SVG copy would replay entry animations from their first (transparent) frame; show final states instead. */
const FROZEN = "*{animation:none!important;transition:none!important}";

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// An SVG image cannot load external resources, so web fonts are embedded once and cached.
async function embeddedFonts(): Promise<string> {
  const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css"]');
  if (!link) return "";
  let css = await (await fetch(link.href)).text();
  for (const url of new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(match => match[1]))) css = css.split(url).join(await toDataUrl(url));
  // Inside an SVG image "block" would leave text invisible if a face is still decoding at draw time.
  return css.replaceAll("font-display: block", "font-display: swap");
}

function ownCss(): string {
  return [...document.styleSheets]
    .flatMap(sheet => {
      try {
        return [...sheet.cssRules].map(rule => rule.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");
}

/** Clones the live screen with the state a clone loses: media frames, form values and scroll offsets. */
async function snapshot(screen: HTMLElement): Promise<HTMLElement> {
  const clone = screen.cloneNode(true) as HTMLElement;
  // The live screen sizes itself from the frame; inside the SVG it needs explicit pixels, square corners and no camera cutout.
  const { width, height } = screen.getBoundingClientRect();
  Object.assign(clone.style, { width: `${width}px`, height: `${height}px`, borderRadius: "0", fontFamily: getComputedStyle(screen).fontFamily });
  const sources = [...screen.querySelectorAll("*")];
  const copies = [...clone.querySelectorAll("*")];
  sources.forEach((source, index) => {
    const copy = copies[index];
    if (source instanceof HTMLVideoElement || source instanceof HTMLCanvasElement) {
      const frame = document.createElement("canvas");
      frame.width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
      frame.height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
      const image = document.createElement("img");
      try {
        frame.getContext("2d")?.drawImage(source, 0, 0);
        image.src = frame.toDataURL("image/jpeg", 0.85);
      } catch {
        // cross-origin canvases (map tiles) cannot be read; they stay blank
      }
      image.className = source.className;
      image.setAttribute("style", source.getAttribute("style") ?? "");
      copy.replaceWith(image);
    } else if (source instanceof HTMLInputElement) copy.setAttribute("value", source.value);
    else if (source instanceof HTMLTextAreaElement) copy.textContent = source.value;
    if (source.scrollTop || source.scrollLeft) {
      for (const child of copy.children) (child as HTMLElement).style.translate = `${-source.scrollLeft}px ${-source.scrollTop}px`;
    }
  });
  clone.querySelector(".punch-hole")?.remove();
  await Promise.all(
    [...clone.querySelectorAll("img")].map(async image => {
      if (image.src && !image.src.startsWith("data:")) image.src = await toDataUrl(image.src).catch(() => "");
    }),
  );
  return clone;
}

async function rasterize(svg: string, width: number, height: number): Promise<Blob> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  // Embedded fonts finish loading inside the image document a moment after decode().
  await new Promise(resolve => setTimeout(resolve, 300));
  const canvas = document.createElement("canvas");
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  const context = canvas.getContext("2d");
  context?.scale(devicePixelRatio, devicePixelRatio);
  context?.drawImage(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("empty"))), "image/png"));
}

export async function takeScreenshot(): Promise<void> {
  const screen = document.querySelector<HTMLElement>(".screen");
  if (!screen) return;
  play("shutter");
  const { width, height } = screen.getBoundingClientRect();
  try {
    const clone = await snapshot(screen);
    fontCss ??= await embeddedFonts().catch(() => "");
    const rootSize = getComputedStyle(document.documentElement).fontSize;
    const markup = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-size:${rootSize}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${fontCss}${ownCss()}${FROZEN}]]></style>${markup}</div></foreignObject></svg>`;
    // Browsers that taint canvases drawn from foreignObject still get a faithful vector screenshot.
    const png = await rasterize(svg, width, height).catch(() => null);
    const path = `/DCIM/Screenshots/Screenshot_${fileStamp()}.${png ? "png" : "svg"}`;
    await writeFile(path, png ?? new Blob([svg], { type: "image/svg+xml" }));
    useUi.setState({ flashAt: Date.now() });
    setTimeout(() => useUi.setState({ flashAt: 0 }), 400);
    const type = png ? "image/png" : "image/svg+xml";
    notify("android", {
      channel: "screenshots",
      icon: "screenshot",
      title: pick(S.screenshotSaved),
      image: fileUrl(path),
      intent: { action: "VIEW", type, data: path },
      actions: [{ label: pick(S.shareVia), icon: "share", intent: { action: "SEND", type, data: path } }],
    });
  } catch {
    notify("android", { icon: "error", title: pick(S.screenshotFailed) });
  }
}
