import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("matches /admin/billing for dedicated billing management", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/admin/billing");
    expect(matches.at(-1)?.routeId).toBe("/admin/billing");
  });

  it("matches /admin/reports for report overview and drill-downs", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/admin/reports");
    expect(matches.at(-1)?.routeId).toBe("/admin/reports");
  });

  it("matches /admin/customers/$customerId for individual customer profiles", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/admin/customers/test-id-123");
    expect(matches.at(-1)?.routeId).toBe("/admin/customers/$customerId");
  });

  it("matches /employee/ for the employee dashboard", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/employee");
    expect(matches.at(-1)?.routeId).toBe("/employee/");
  });
});
