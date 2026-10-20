import { createRoot } from "react-dom/client";
import { apps } from "./apps";
import { registerApps } from "./kernel/apps";
import { boot } from "./kernel/power";
import { startStaticServer } from "./static/client";
import { Shell } from "./system/Shell";

registerApps(apps);
void startStaticServer().then(() => {
  createRoot(document.getElementById("root") as HTMLElement).render(<Shell />);
  void boot();
});
