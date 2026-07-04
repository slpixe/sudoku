import * as React from "react";
import {useTranslation} from "react-i18next";

import Button from "./Button";

export type ConfirmDialogOptions = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type AlertDialogOptions = {
  message: string;
  confirmLabel?: string;
};

type DialogRequest =
  | {type: "confirm"; options: ConfirmDialogOptions; resolve: (value: boolean) => void}
  | {type: "alert"; options: AlertDialogOptions; resolve: () => void};

type DialogState = DialogRequest & {
  restoreFocusTo: HTMLElement | null;
};

type AppDialogApi = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  alert: (options: AlertDialogOptions) => Promise<void>;
};

const AppDialogContext = React.createContext<AppDialogApi | null>(null);

function getActiveElement() {
  if (typeof document === "undefined" || !(document.activeElement instanceof HTMLElement)) {
    return null;
  }

  return document.activeElement;
}

export function AppDialogProvider({children}: {children: React.ReactNode}) {
  const {t} = useTranslation();
  const [dialog, setDialogState] = React.useState<DialogState | null>(null);
  const currentDialogRef = React.useRef<DialogState | null>(null);
  const dialogQueueRef = React.useRef<DialogState[]>([]);
  const dialogPanelRef = React.useRef<HTMLDivElement>(null);

  const setCurrentDialog = React.useCallback((nextDialog: DialogState | null) => {
    currentDialogRef.current = nextDialog;
    setDialogState(nextDialog);
  }, []);

  const openDialog = React.useCallback(
    (request: DialogRequest) => {
      const nextDialog = {...request, restoreFocusTo: getActiveElement()};

      if (currentDialogRef.current) {
        dialogQueueRef.current.push(nextDialog);
        return;
      }

      setCurrentDialog(nextDialog);
    },
    [setCurrentDialog],
  );

  const closeDialog = React.useCallback(
    (confirmed = false) => {
      const currentDialog = currentDialogRef.current;
      if (!currentDialog) {
        return;
      }

      const nextDialog = dialogQueueRef.current.shift() ?? null;
      setCurrentDialog(nextDialog);

      if (currentDialog.type === "confirm") {
        currentDialog.resolve(confirmed);
      } else {
        currentDialog.resolve();
      }

      if (!nextDialog && typeof window !== "undefined") {
        const restoreFocusTo = currentDialog.restoreFocusTo;
        window.requestAnimationFrame(() => {
          if (restoreFocusTo && document.contains(restoreFocusTo)) {
            restoreFocusTo.focus();
          }
        });
      }
    },
    [setCurrentDialog],
  );

  const confirm = React.useCallback(
    (options: ConfirmDialogOptions) => {
      return new Promise<boolean>((resolve) => {
        openDialog({type: "confirm", options, resolve});
      });
    },
    [openDialog],
  );

  const alert = React.useCallback(
    (options: AlertDialogOptions) => {
      return new Promise<void>((resolve) => {
        openDialog({type: "alert", options, resolve});
      });
    },
    [openDialog],
  );

  const api = React.useMemo(() => ({confirm, alert}), [confirm, alert]);

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!dialog) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog(false);
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogPanelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement || !lastElement) {
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const dialogTitle = dialog?.type === "confirm" ? t("dialog_confirmation") : t("dialog_message");
  const confirmLabel = dialog?.options.confirmLabel ?? t("dialog_ok");

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div
            aria-describedby="app-dialog-message"
            aria-labelledby="app-dialog-title"
            aria-modal="true"
            className="w-full max-w-sm rounded-lg bg-white p-5 text-gray-900 shadow-xl dark:bg-gray-700 dark:text-white"
            onKeyDown={onDialogKeyDown}
            ref={dialogPanelRef}
            role="dialog"
          >
            <h2 className="sr-only" id="app-dialog-title">
              {dialogTitle}
            </h2>
            <p className="text-base" id="app-dialog-message">
              {dialog.options.message}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              {dialog.type === "confirm" ? (
                <Button
                  className="bg-gray-100 text-black border border-gray-300 hover:bg-gray-200 dark:bg-gray-500 dark:border-gray-400 dark:text-white dark:hover:bg-gray-400"
                  onClick={() => closeDialog(false)}
                >
                  {dialog.options.cancelLabel ?? t("dialog_cancel")}
                </Button>
              ) : null}
              <Button autoFocus className="bg-teal-600 text-white dark:bg-teal-600" onClick={() => closeDialog(true)}>
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const dialog = React.useContext(AppDialogContext);

  if (!dialog) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }

  return dialog;
}
