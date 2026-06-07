import { describe, expect, it, vi } from "vitest";

import { dismissVerifyBanner, isVerifyBannerDismissed } from "../auth/verifyBannerStorage";
import { renderWithProviders, screen } from "../test/render";
import { EmailVerificationBanner } from "./EmailVerificationBanner";

const MESSAGE =
  "Your email isn't verified yet. Some features may be limited until you confirm it.";

describe("EmailVerificationBanner", () => {
  it("показывает сообщение и кнопку Verify now, пока плашка не скрыта", () => {
    renderWithProviders(<EmailVerificationBanner onVerifyClick={vi.fn()} />);

    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify now" })).toBeInTheDocument();
  });

  it("Verify now вызывает onVerifyClick", async () => {
    const onVerifyClick = vi.fn();
    const { user } = renderWithProviders(<EmailVerificationBanner onVerifyClick={onVerifyClick} />);

    await user.click(screen.getByRole("button", { name: "Verify now" }));

    expect(onVerifyClick).toHaveBeenCalledOnce();
  });

  it("× скрывает плашку и помечает session-флаг dismiss", async () => {
    const { user } = renderWithProviders(<EmailVerificationBanner onVerifyClick={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Dismiss reminder for this session" }));

    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    expect(isVerifyBannerDismissed()).toBe(true);
  });

  it("не рендерится, если плашка уже скрыта в этой сессии", () => {
    dismissVerifyBanner();

    renderWithProviders(<EmailVerificationBanner onVerifyClick={vi.fn()} />);

    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });
});
