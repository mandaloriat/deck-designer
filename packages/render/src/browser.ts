import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';

/**
 * Deterministic flags. Subpixel positioning and LCD text make raster output
 * depend on the host's font stack; turning them off is what lets golden-image
 * tests compare byte-for-byte across machines.
 */
const DETERMINISM_ARGS = [
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--disable-font-subpixel-positioning',
  '--force-color-profile=srgb',
  '--hide-scrollbars',
  '--disable-dev-shm-usage',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--mute-audio',
];

/**
 * Page requests are already blocked by a route handler, but that only covers
 * the renderer. The browser process has its own network life: variations seeds,
 * component and safe-browsing updates, sign-in probes. Those bypass request
 * interception entirely, so a build that looks hermetic still reaches out to
 * several hosts. On a locked-down runner they fail slowly; anywhere else they
 * are traffic nobody asked for.
 */
const OFFLINE_ARGS = [
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-sync',
  '--disable-client-side-phishing-detection',
  '--safebrowsing-disable-auto-update',
  '--disable-breakpad',
  '--metrics-recording-only',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-default-apps',
  '--no-pings',
  '--disable-features=OptimizationHints,MediaRouter,InterestFeedContentSuggestions,Translate',
];

export const LAUNCH_ARGS = [...DETERMINISM_ARGS, ...OFFLINE_ARGS];

const CANDIDATE_SUFFIXES = [
  'chrome-linux/chrome',
  'chrome-linux/headless_shell',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-win/chrome.exe',
];

export class ChromiumNotFoundError extends Error {
  constructor(searched: string[]) {
    super(
      'Could not find a Chromium binary.\n' +
        'Set DECK_CHROMIUM_PATH to a Chromium/Chrome executable, or install one with ' +
        '`pnpm exec playwright install chromium` (npx outside a pnpm project).\n' +
        `Searched: ${searched.join(', ') || '(nothing)'}`,
    );
    this.name = 'ChromiumNotFoundError';
  }
}

/**
 * Resolution order puts the explicit override first so CI images and sandboxes
 * that ship their own Chromium never trigger a download.
 */
export function resolveChromiumPath(): string {
  const searched: string[] = [];

  const explicit = process.env['DECK_CHROMIUM_PATH'];
  if (explicit) {
    searched.push(explicit);
    if (fs.existsSync(explicit)) return explicit;
  }

  try {
    const fromPlaywright = chromium.executablePath();
    if (fromPlaywright) {
      searched.push(fromPlaywright);
      if (fs.existsSync(fromPlaywright)) return fromPlaywright;
    }
  } catch {
    // playwright-core throws when no browsers were ever installed; fall through.
  }

  const browsersPath = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  if (browsersPath && fs.existsSync(browsersPath)) {
    const dirs = fs
      .readdirSync(browsersPath)
      .filter((name) => name.startsWith('chromium'))
      .sort()
      .reverse();
    for (const dir of dirs) {
      for (const suffix of CANDIDATE_SUFFIXES) {
        const candidate = path.join(browsersPath, dir, suffix);
        searched.push(candidate);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  throw new ChromiumNotFoundError(searched);
}

export interface BrowserSession {
  browser: Browser;
  close(): Promise<void>;
}

export async function launchBrowser(): Promise<BrowserSession> {
  const executablePath = resolveChromiumPath();
  const browser = await chromium.launch({ executablePath, args: LAUNCH_ARGS });
  return { browser, close: () => browser.close() };
}

export interface ContextOptions {
  deviceScaleFactor: number;
  /** Allow the page to reach anything other than the local render server. */
  allowNetwork?: boolean;
  originPrefix: string;
}

export async function createContext(browser: Browser, options: ContextOptions): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: options.deviceScaleFactor,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    forcedColors: 'none',
    locale: 'en-US',
    timezoneId: 'UTC',
    javaScriptEnabled: true,
    bypassCSP: false,
  });

  if (!options.allowNetwork) {
    // A build must not depend on the network: an unreachable CDN would silently
    // change typography instead of failing the run.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(options.originPrefix) || url.startsWith('data:') || url.startsWith('about:')) {
        return route.continue();
      }
      return route.abort('blockedbyclient');
    });
  }

  return context;
}
