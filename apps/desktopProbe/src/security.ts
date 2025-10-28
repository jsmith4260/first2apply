import type { WebPreferences } from 'electron';

type HardenedWebPreferences = WebPreferences & { enableRemoteModule?: boolean };

/** Strict defaults for BrowserWindow.webPreferences */
export function hardenedWebPreferences(
  preloadPath: string,
  themeArg: string,
  styleNonce: string,
): HardenedWebPreferences {
  const webPreferences: HardenedWebPreferences = {
    preload: preloadPath,
    additionalArguments: [`--theme=${themeArg}`, `--styleNonce=${styleNonce}`],
    partition: 'persist:scraper',
    // Security hardening
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    enableRemoteModule: false,
    webSecurity: true,
  };

  return webPreferences;
}
