import * as React from "react";

import {createHashHistory, createRootRoute, createRoute, createRouter, RouterProvider} from "@tanstack/react-router";

import {AppDialogProvider} from "./components/AppDialog";
import {InstallAppPrompt} from "./components/pwa/InstallAppPrompt";

const LazyGame = React.lazy(() => import("./pages/Game"));
const LazyMultiplayerGame = React.lazy(() => import("./pages/MultiplayerGame"));
const LazySelectGame = React.lazy(() => import("./pages/SelectGame"));

const GameRoute = () => <LazyGame />;
const MultiplayerGameRoute = () => <LazyMultiplayerGame />;
const SelectGameRoute = () => <LazySelectGame />;

const routeFallback = <div className="min-h-screen bg-gray-800 dark:bg-gray-900" />;

const rootRoute = createRootRoute();

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: GameRoute,
});

const selectGameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/select-game",
  component: SelectGameRoute,
});

const multiplayerGameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/room/$code",
  component: MultiplayerGameRoute,
});

rootRoute.addChildren([gameRoute, selectGameRoute, multiplayerGameRoute]);

const hashHistory = createHashHistory();

const router = createRouter({
  routeTree: rootRoute,
  defaultNotFoundComponent: GameRoute,
  history: hashHistory,
});

// Error Boundary Component
const ErrorBoundary: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [hasError, setHasError] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error("Error caught by boundary:", error.error);
      setError(error.error);
      setHasError(true);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      setError(new Error(event.reason));
      setHasError(true);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full bg-white dark:bg-gray-700 rounded-lg p-6 text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Something went wrong</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            We're sorry, but something unexpected happened. Please report the bug on Github and describe what you did to
            have it happen.
          </p>
          <div className="space-y-3">
            <a
              href={`https://github.com/slpixe/sudoku/issues/new?title=Bug%20report%20from%20sudoku.slpixe.com&body=error%20details%3A%0A%0A${error?.toString()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-800 transition-colors"
            >
              Report Bug on GitHub
            </a>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
          {error && (
            <div className="mt-4 text-left">
              <h2 className="font-bold text-gray-900 dark:text-white">Error Details</h2>
              <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto text-gray-900 dark:text-gray-100">
                {error.toString()}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const App = () => {
  return (
    <ErrorBoundary>
      <AppDialogProvider>
        <React.Suspense fallback={routeFallback}>
          <RouterProvider router={router} />
        </React.Suspense>
        <InstallAppPrompt />
      </AppDialogProvider>
    </ErrorBoundary>
  );
};

export default App;
