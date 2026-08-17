import * as React from "react";
import {useTranslation} from "react-i18next";
import {useRegisterSW} from "virtual:pwa-register/react";

export function UpdateAppPromptView({
  actionLabel,
  dismissLabel,
  message,
  onDismiss,
  onUpdate,
  title,
  updating,
  visible,
}: {
  actionLabel: string;
  dismissLabel: string;
  message: string;
  onDismiss: () => void;
  onUpdate: () => void;
  title: string;
  updating: boolean;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-0 sm:bottom-[calc(env(safe-area-inset-bottom)+13rem)] sm:px-4">
      <aside
        aria-live="polite"
        className="pointer-events-auto w-full max-w-none rounded-t-lg border border-b-0 border-teal-300/60 bg-gray-900 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-white shadow-2xl sm:max-w-md sm:rounded-md sm:border sm:p-3"
        data-testid="pwa-update-toast"
        role="status"
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" strokeLinecap="round" />
              <path d="M20 4v6h-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-5">{title}</div>
            <div className="mt-1 text-xs leading-5 text-gray-200">{message}</div>
          </div>
          <button
            aria-label={dismissLabel}
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-sm text-gray-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
            data-testid="pwa-update-dismiss"
            disabled={updating}
            onClick={onDismiss}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            aria-label={actionLabel}
            className="inline-flex h-9 w-full touch-manipulation items-center justify-center rounded-sm bg-teal-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
            data-testid="pwa-update-action"
            disabled={updating}
            onClick={onUpdate}
            type="button"
          >
            {actionLabel}
          </button>
        </div>
      </aside>
    </div>
  );
}

export function UpdateAppPrompt() {
  const {t} = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [updating, setUpdating] = React.useState(false);

  const dismiss = React.useCallback(() => {
    setNeedRefresh(false);
  }, [setNeedRefresh]);

  const update = React.useCallback(() => {
    setUpdating(true);
    void updateServiceWorker(true).catch(() => {
      setUpdating(false);
    });
  }, [updateServiceWorker]);

  return (
    <UpdateAppPromptView
      actionLabel={updating ? t("pwa_update_updating") : t("pwa_update_action")}
      dismissLabel={t("pwa_update_dismiss")}
      message={t("pwa_update_message")}
      onDismiss={dismiss}
      onUpdate={update}
      title={t("pwa_update_title")}
      updating={updating}
      visible={needRefresh}
    />
  );
}
