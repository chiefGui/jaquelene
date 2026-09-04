import { describe, expect, it, vi } from "vite-plus/test";
import { navigateBack, type NavigationDestination } from "./navigation";

function createRouter(canGoBack: boolean) {
  const back = vi.fn();
  const navigate = vi.fn();
  const router = {
    history: { back, canGoBack: () => canGoBack },
    navigate,
  };

  return { back, navigate, router };
}

describe("back navigation", () => {
  it("retraces history when an earlier entry exists", () => {
    const { back, navigate, router } = createRouter(true);

    navigateBack(router);

    expect(back).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("replaces an entry without history with Home", () => {
    const { back, navigate, router } = createRouter(false);

    navigateBack(router);

    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ replace: true, to: "/" });
  });

  it("uses a route's contextual fallback when history is empty", () => {
    const { navigate, router } = createRouter(false);
    const fallback = {
      to: "/campaigns/$campaignId",
      params: { campaignId: "campaign-1" },
    } as const satisfies NavigationDestination;

    navigateBack(router, fallback);

    expect(navigate).toHaveBeenCalledWith({ ...fallback, replace: true });
  });
});
