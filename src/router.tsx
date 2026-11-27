import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <RouteLoadingSkeleton variant="generic" />,
    defaultPendingMs: 120,
    defaultPendingMinMs: 250,
  });

  return router;
};
