import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";

const FIRST_RUN_KEY = "autostart-initialized";

/**
 * Initializes autostart on first launch.
 * Ensures the application is registered to start on Windows boot/login,
 * while respecting user changes on subsequent launches.
 */
export async function initializeAutostart(): Promise<void> {
  try {
    // Only perform automatic setup once on first launch
    if (localStorage.getItem(FIRST_RUN_KEY) === "true") {
      return;
    }

    const enabled = await isEnabled();
    if (!enabled) {
      await enable();
      console.log("[Autostart] Successfully enabled on first run.");
    }

    localStorage.setItem(FIRST_RUN_KEY, "true");
  } catch (err) {
    console.error("[Autostart] Failed to initialize autostart:", err);
  }
}

export { enable, isEnabled, disable };

