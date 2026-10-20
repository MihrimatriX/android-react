import type { ReactNode } from "react";
import { COMMON, useT } from "../kernel";
import { Button, Icon } from "./Button";

export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="enter flex h-full min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="grid size-24 place-items-center rounded-full bg-surface-high text-on-surface-variant">
        <Icon name={icon} size={44} />
      </span>
      <h2 className="text-title-lg text-on-surface">{title}</h2>
      {text && <p className="max-w-64 text-body text-on-surface-variant">{text}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 40 }: { size?: number }) {
  return <span role="progressbar" className="block animate-spin rounded-full border-4 border-primary border-t-transparent" style={{ width: size, height: size }} />;
}

export function Loading() {
  const t = useT(COMMON);
  return (
    <div aria-busy className="flex h-full min-h-48 flex-col items-center justify-center gap-4 text-body text-on-surface-variant">
      <Spinner />
      {t("loading")}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text?: string; onRetry?: () => void }) {
  const t = useT(COMMON);
  return (
    <EmptyState
      icon="error"
      title={t("error")}
      text={text}
      action={onRetry && <Button variant="tonal" icon="refresh" onClick={onRetry}>{t("retry")}</Button>}
    />
  );
}

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  const t = useT(COMMON);
  return (
    <EmptyState
      icon="wifi_off"
      title={t("offline")}
      text={t("offlineHint")}
      action={onRetry && <Button variant="tonal" icon="refresh" onClick={onRetry}>{t("retry")}</Button>}
    />
  );
}

export function PermissionState({ icon, text, onGrant }: { icon: string; text: string; onGrant: () => void }) {
  const t = useT(COMMON);
  return <EmptyState icon={icon} title={t("permissionNeeded")} text={text} action={<Button onClick={onGrant}>{t("grant")}</Button>} />;
}

export function ProgressRing({ value, children }: { value: number; children?: ReactNode }) {
  return (
    <div className="relative grid size-64 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="4" className="stroke-surface-highest" />
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="4" strokeLinecap="round" className="anim stroke-primary" strokeDasharray={`${Math.max(0, Math.min(1, value)) * 289} 289`} />
      </svg>
      {children}
    </div>
  );
}
