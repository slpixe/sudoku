import * as React from "react";
import {useTranslation} from "react-i18next";

const INSTALL_PROMPT_DISMISSED_KEY = "sudoku.pwaInstallPromptDismissed";
const AUTO_HIDE_MS = 8_000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<unknown>;
};

type InstallPromptTarget = {
  addEventListener: EventTarget["addEventListener"];
  removeEventListener: EventTarget["removeEventListener"];
};

type InstallPromptStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type InstallPromptController = {
  dismiss: () => void;
  hideForSession: () => void;
  isVisible: () => boolean;
  promptInstall: () => Promise<boolean>;
  start: () => () => void;
  subscribe: (listener: () => void) => () => void;
};

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return typeof (event as Partial<BeforeInstallPromptEvent>).prompt === "function";
}

function hasDismissed(storage: InstallPromptStorage) {
  try {
    return storage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function persistDismissed(storage: InstallPromptStorage) {
  try {
    storage.setItem(INSTALL_PROMPT_DISMISSED_KEY, "true");
  } catch {
    // Browser storage can fail in private or restricted contexts. The current session still hides the prompt.
  }
}

export function createInstallPromptController({
  storage,
  target,
}: {
  storage: InstallPromptStorage;
  target: InstallPromptTarget;
}): InstallPromptController {
  const listeners = new Set<() => void>();
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let visible = false;
  let sessionHidden = false;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const hide = () => {
    if (!visible && !deferredPrompt) {
      return;
    }
    visible = false;
    deferredPrompt = null;
    notify();
  };

  const dismiss = () => {
    sessionHidden = true;
    persistDismissed(storage);
    hide();
  };

  const handleBeforeInstallPrompt = (event: Event) => {
    if (!isBeforeInstallPromptEvent(event)) {
      return;
    }

    event.preventDefault();
    if (sessionHidden || hasDismissed(storage)) {
      return;
    }

    deferredPrompt = event;
    visible = true;
    notify();
  };

  const handleAppInstalled = () => {
    dismiss();
  };

  return {
    dismiss,
    hideForSession: () => {
      sessionHidden = true;
      hide();
    },
    isVisible: () => visible,
    promptInstall: async () => {
      if (!deferredPrompt) {
        return false;
      }

      const prompt = deferredPrompt;
      dismiss();
      await prompt.prompt();
      return true;
    },
    start: () => {
      target.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      target.addEventListener("appinstalled", handleAppInstalled);

      return () => {
        target.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        target.removeEventListener("appinstalled", handleAppInstalled);
      };
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function InstallAppPromptView({
  installLabel,
  message,
  onDismiss,
  onInstall,
  title,
  visible,
}: {
  installLabel: string;
  message: string;
  onDismiss: () => void;
  onInstall: () => void;
  title: string;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+13rem)] z-50 flex justify-center px-4 pointer-events-none">
      <aside
        aria-live="polite"
        className="pointer-events-auto w-full max-w-sm rounded-md border border-teal-300/60 bg-gray-900 p-3 text-white shadow-2xl"
        data-testid="pwa-install-toast"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-5">{title}</div>
            <div className="mt-1 text-xs leading-5 text-gray-200">{message}</div>
          </div>
          <button
            aria-label={installLabel}
            className="mt-0.5 inline-flex h-7 shrink-0 items-center rounded-sm bg-amber-400 px-3 text-xs font-bold text-gray-950 shadow-sm touch-manipulation hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
            data-testid="pwa-install-action"
            onClick={onInstall}
            type="button"
          >
            {installLabel}
          </button>
          <button
            aria-label="Close install prompt"
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-gray-200 touch-manipulation hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
            data-testid="pwa-install-dismiss"
            onClick={onDismiss}
            type="button"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </aside>
    </div>
  );
}

export function InstallAppPrompt() {
  const {t} = useTranslation();
  const controllerRef = React.useRef<InstallPromptController | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const controller = createInstallPromptController({storage: window.localStorage, target: window});
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(() => {
      setVisible(controller.isVisible());
    });
    const stop = controller.start();

    return () => {
      unsubscribe();
      stop();
      controllerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      controllerRef.current?.hideForSession();
    }, AUTO_HIDE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [visible]);

  const install = React.useCallback(() => {
    void controllerRef.current?.promptInstall();
  }, []);

  const dismiss = React.useCallback(() => {
    controllerRef.current?.dismiss();
  }, []);

  return (
    <InstallAppPromptView
      installLabel={t("install_app")}
      message={t("install_app_message")}
      onDismiss={dismiss}
      onInstall={install}
      title={t("install_app_title")}
      visible={visible}
    />
  );
}
