import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEB_APP_BASE_URL,
  InvalidWebAppBaseUrlError,
  resolveWebAppBaseUrl,
} from "../src/http/config.js";

describe("resolveWebAppBaseUrl", () => {
  it("falls back to the app.example.com https default", () => {
    expect(resolveWebAppBaseUrl(undefined)).toBe(DEFAULT_WEB_APP_BASE_URL);
    expect(DEFAULT_WEB_APP_BASE_URL).toBe("https://app.example.com");
  });

  it("accepts https URLs", () => {
    expect(resolveWebAppBaseUrl("https://physio.example.com/")).toBe(
      "https://physio.example.com/",
    );
  });

  it("rejects non-https URLs", () => {
    expect(() => resolveWebAppBaseUrl("http://app.example.com")).toThrow(
      InvalidWebAppBaseUrlError,
    );
  });

  it("rejects invalid URLs", () => {
    expect(() => resolveWebAppBaseUrl("not-a-url")).toThrow(InvalidWebAppBaseUrlError);
  });
});
