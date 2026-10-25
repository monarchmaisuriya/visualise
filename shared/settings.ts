import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * tldraw licence key. Empty means no key: development builds still run, production builds show a
 * notice instead of tldraw's blank canvas. Keys are not secrets (tldraw ships them in web pages),
 * but the plugin never logs them.
 */
export const licenseSettings = defineSettings({
  id: "license",
  scope: "host",
  version: 1,
  schema: z.object({ licenseKey: z.string().trim().max(4096).default("") }),
});
