import { describe, expect, it } from "vitest";
import { fromRuntimeSchema, toRuntimeSchema } from "./runtime-protocol";

describe("runtime protocol", () => {
  it("accepts well-formed messages", () => {
    expect(toRuntimeSchema.safeParse({ type: "load", text: "", theme: "dark", licenseKey: "" }).success).toBe(true);
    expect(fromRuntimeSchema.safeParse({ type: "changed", text: "{}" }).success).toBe(true);
  });

  it.each([
    { type: "load", text: "", theme: "blue", licenseKey: "" },
    { type: "load", text: 1, theme: "dark", licenseKey: "" },
    { type: "delete-everything" },
  ])("rejects malformed panel messages %j", (message) => {
    expect(toRuntimeSchema.safeParse(message).success).toBe(false);
  });

  it.each([{ type: "changed" }, { type: "ready" }, { type: "error", message: 3 }, null])(
    "rejects malformed iframe messages %j",
    (message) => {
      expect(fromRuntimeSchema.safeParse(message).success).toBe(false);
    },
  );
});
