import { vi, describe, it, expect, afterEach } from "vitest";
import { resolveLocale } from "../src/i18n/settings.js";

describe("TC-037: Invalid locale → exit 2", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls process.exit(2) with English message for unsupported locale", () => {
    // Capture stderr before exit
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    // Mock process.exit to throw instead of actually exiting
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    expect(() => resolveLocale("de")).toThrow("exit:2");
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported locale "de". Use: it, en'),
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
