import { describe, expect, it } from "vitest";
import {
  parseBooleanFlag,
  parseRegionParam,
  parseRegionSet,
  parseTickerList,
  parseTickerQuery,
  parseValidationScope
} from "../src/lib/api-validation";

describe("api validation", () => {
  it("accepts valid ticker or company queries", () => {
    expect(parseTickerQuery("AAPL").ok).toBe(true);
    expect(parseTickerQuery("Reliance Industries", "ticker or company").ok).toBe(true);
  });

  it("rejects unsafe ticker input", () => {
    const result = parseTickerQuery("<script>");
    expect(result.ok).toBe(false);
  });

  it("parses boolean flags strictly", () => {
    expect(parseBooleanFlag("1", "refresh")).toEqual({ ok: true, value: true });
    expect(parseBooleanFlag("nope", "refresh").ok).toBe(false);
  });

  it("validates enum-style params", () => {
    expect(parseRegionParam("USA", "AAPL").ok).toBe(true);
    expect(parseRegionParam(null, "RELIANCE.NS")).toEqual({ ok: true, value: "India" });
    expect(parseRegionParam("Mars", "AAPL").ok).toBe(false);
    expect(parseValidationScope("universe")).toEqual({ ok: true, value: "universe" });
    expect(parseValidationScope("invalid").ok).toBe(false);
  });

  it("parses optional region sets", () => {
    expect(parseRegionSet(null)).toEqual({ ok: true, value: null });
    expect(parseRegionSet("All")).toEqual({ ok: true, value: null });
    const parsed = parseRegionSet("USA, Europe");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(Array.from(parsed.value ?? [])).toEqual(["USA", "Europe"]);
    }
    expect(parseRegionSet("USA, Mars").ok).toBe(false);
  });

  it("caps ticker list size", () => {
    const result = parseTickerList(Array.from({ length: 25 }, (_, index) => `T${index}`).join(","), []);
    expect(result.ok).toBe(false);
  });
});
