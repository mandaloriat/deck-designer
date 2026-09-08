import {
  cardElement,
  collectCss,
  galleryBody,
  htmlDocument,
  planAtlas,
  rasterFrame,
  type AtlasOptions,
  type AtlasPlan,
  type ComposedCard,
  type Diagnostic,
  type Project,
} from '@deck-designer/core';
import type { BrowserContext, ConsoleMessage, Page } from 'playwright-core';
import { createContext, launchBrowser, type BrowserSession } from './browser.js';
import { startRenderServer, type RenderServer } from './server.js';

export interface RenderedImage {
  cardId: string;
  typeId: string;
  face: 'front' | 'back';
  buffer: Buffer;
  width: number;
  height: number;
}

export interface RenderFlags {
  /** Include the bleed area in the output. */
  bleed: boolean;
  /** Round the corners. Right for virtual tabletops, wrong for anything cut by hand. */
  rounded: boolean;
  /** Draw bleed and safe-area guides. A proofing aid, never final output. */
  guides: boolean;
}

export const DEFAULT_FLAGS: RenderFlags = { bleed: false, rounded: false, guides: false };

export interface RendererOptions {
  dpi?: number;
  allowNetwork?: boolean;
  concurrency?: number;
  /** Components rendered per browser page during capture. */
  batchSize?: number;
}

interface PageDiagnostics {
  errors: string[];
  failedRequests: string[];
  /** Components whose auto-fitting text still overflows at the minimum size. */
  overflowing: string[];
}

/**
 * Owns the browser, the loopback server and the page pool. One instance renders
 * a whole build, so Chromium starts once instead of once per component, which is
 * the single biggest cost in a naive implementation.
 */
export class DeckRenderer {
  private constructor(
    private readonly project: Project,
    private readonly session: BrowserSession,
    private readonly server: RenderServer,
    private readonly context: BrowserContext,
    private readonly options: Required<RendererOptions>,
  ) {}

  static async create(project: Project, options: RendererOptions = {}): Promise<DeckRenderer> {
    const resolved: Required<RendererOptions> = {
      dpi: options.dpi ?? project.render.dpi,
      allowNetwork: options.allowNetwork ?? false,
      concurrency: options.concurrency ?? project.render.concurrency,
      batchSize: options.batchSize ?? 24,
    };
    const server = await startRenderServer(project.root);
    let session: BrowserSession | null = null;
    try {
      session = await launchBrowser();
      const context = await createContext(session.browser, {
        // Capture boxes carry their own zoom, so the device pixel ratio stays 1
        // and screenshot clipping lands on exact pixel boundaries.
        deviceScaleFactor: 1,
        allowNetwork: resolved.allowNetwork,
        originPrefix: server.origin,
      });
      context.setDefaultTimeout(project.render.timeoutMs);
      return new DeckRenderer(project, session, server, context, resolved);
    } catch (error) {
      await session?.close().catch(() => undefined);
      await server.close();
      throw error;
    }
  }

  get dpi(): number {
    return this.options.dpi;
  }

  async close(): Promise<void> {
    await this.context.close().catch(() => undefined);
    await this.session.close().catch(() => undefined);
    await this.server.close();
  }

  /** Rasterises each component face as its own PNG. */
  async renderImages(
    composed: readonly ComposedCard[],
    flags: RenderFlags = DEFAULT_FLAGS,
  ): Promise<{ images: RenderedImage[]; diagnostics: Diagnostic[] }> {
    const batches: ComposedCard[][] = [];
    for (let i = 0; i < composed.length; i += this.options.batchSize) {
      batches.push(composed.slice(i, i + this.options.batchSize));
    }

    const diagnostics: Diagnostic[] = [];
    const results = new Array<RenderedImage[]>(batches.length);

    await this.runPool(batches.length, async (index, page) => {
      const batch = batches[index] as ComposedCard[];
      const html = this.buildDocument({
        body: galleryBody(batch, {
          includeBleed: flags.bleed,
          rounded: flags.rounded,
          guides: flags.guides,
          dpi: this.options.dpi,
        }),
        typeIds: batch.map((c) => c.typeId),
        pageCss: 'body{display:flex;flex-wrap:wrap;align-items:flex-start;gap:0}',
      });
      const problems = await this.load(page, html);
      diagnostics.push(...this.toDiagnostics(problems));

      const captured: RenderedImage[] = [];
      for (let i = 0; i < batch.length; i += 1) {
        const item = batch[i] as ComposedCard;
        const buffer = await page.locator(`[data-slot="${i}"]`).screenshot({
          type: 'png',
          omitBackground: this.project.render.background === 'transparent',
          animations: 'disabled',
          caret: 'hide',
        });
        const frame = rasterFrame(item.geometry, flags.bleed, this.options.dpi);
        captured.push({
          cardId: item.card.id,
          typeId: item.typeId,
          face: item.face,
          buffer,
          width: frame.widthPx,
          height: frame.heightPx,
        });
      }
      results[index] = captured;
    });

    return { images: results.flatMap((batch) => batch ?? []), diagnostics };
  }

  /**
   * Renders a whole set of faces into one image: the grid a virtual tabletop
   * expects. Cells are butted edge to edge with no gap, because the consumer
   * slices the image by dividing it, not by finding seams.
   */
  async renderAtlas(
    composed: readonly ComposedCard[],
    options: AtlasOptions,
  ): Promise<{ buffer: Buffer; plan: AtlasPlan; diagnostics: Diagnostic[] }> {
    const first = composed[0];
    if (!first) throw new Error('Nothing to lay out.');
    const mismatch = composed.find(
      (c) => c.geometry.width !== first.geometry.width || c.geometry.height !== first.geometry.height,
    );
    if (mismatch) {
      throw new Error(
        `An atlas holds one card size. "${mismatch.card.id}" is ` +
          `${mismatch.geometry.width}x${mismatch.geometry.height}mm, expected ` +
          `${first.geometry.width}x${first.geometry.height}mm. Select one component type.`,
      );
    }

    const plan = planAtlas(first.geometry, composed.length, options);

    const cells = composed
      .map((item) => {
        const card = cardElement({
          id: item.card.id,
          typeId: item.typeId,
          face: item.face,
          geometry: item.geometry,
          html: item.html,
          includeBleed: false,
          rounded: false,
          guides: false,
        });
        const frame = rasterFrame(item.geometry, false, plan.dpi);
        return `<div class="dd-cell"><div class="dd-zoom" style="zoom:${frame.zoom}">${card}</div></div>`;
      })
      .join('');

    const html = this.buildDocument({
      body: `<div id="dd-atlas">${cells}</div>`,
      typeIds: composed.map((c) => c.typeId),
      pageCss: `body{margin:0}
#dd-atlas{
  display:grid;
  grid-template-columns:repeat(${plan.columns}, ${plan.cardWidthPx}px);
  grid-auto-rows:${plan.cardHeightPx}px;
  width:${plan.widthPx}px;
}
.dd-cell{width:${plan.cardWidthPx}px;height:${plan.cardHeightPx}px;overflow:hidden}`,
    });

    const page = await this.context.newPage();
    try {
      const problems = await this.load(page, html);
      const buffer = await page.locator('#dd-atlas').screenshot({
        type: 'png',
        omitBackground: this.project.render.background === 'transparent',
        animations: 'disabled',
        caret: 'hide',
      });
      return { buffer, plan, diagnostics: this.toDiagnostics(problems) };
    } finally {
      await page.close();
    }
  }

  private buildDocument(input: { body: string; typeIds: readonly string[]; pageCss?: string }): string {
    return htmlDocument({
      title: this.project.name,
      fonts: this.project.fonts,
      css: collectCss(this.project, [...new Set(input.typeIds)]),
      body: input.body,
      background: this.project.render.background,
      ...(input.pageCss ? { pageCss: input.pageCss } : {}),
    });
  }

  private async load(page: Page, html: string): Promise<PageDiagnostics> {
    const problems: PageDiagnostics = { errors: [], failedRequests: [], overflowing: [] };
    const onConsole = (message: ConsoleMessage): void => {
      if (message.type() === 'error') problems.errors.push(message.text());
    };
    const onPageError = (error: Error): void => {
      problems.errors.push(error.message);
    };
    const onRequestFailed = (request: { url: () => string }): void => {
      problems.failedRequests.push(request.url());
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('requestfailed', onRequestFailed);

    try {
      await page.goto(this.server.publish(html), { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset['ddReady'] !== undefined, undefined, {
        timeout: this.project.render.timeoutMs,
      });
      const state = await page.evaluate(() => ({
        ready: document.documentElement.dataset['ddReady'],
        error: document.documentElement.dataset['ddError'],
        overflow: document.documentElement.dataset['ddOverflow'],
      }));
      if (state.ready === 'error') problems.errors.push(state.error ?? 'unknown layout error');
      if (state.overflow) {
        try {
          problems.overflowing.push(...(JSON.parse(state.overflow) as string[]));
        } catch {
          // A malformed payload is not worth failing a build over.
        }
      }
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);
    }
    return problems;
  }

  private toDiagnostics(problems: PageDiagnostics): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const message of problems.errors) {
      out.push({ severity: 'error', code: 'render/page-error', message });
    }
    for (const card of new Set(problems.overflowing)) {
      out.push({
        severity: 'warning',
        code: 'layout/overflow',
        message: `Text on "${card}" still overflows at its minimum auto-fit size.`,
        card,
        hint: 'Shorten the copy, lower data-autofit-min, or give the box more room.',
      });
    }
    for (const url of problems.failedRequests) {
      const relative = url.startsWith(this.server.origin) ? url.slice(this.server.origin.length) : url;
      out.push({
        severity: 'error',
        code: 'render/asset-unreachable',
        message: `The page could not load ${relative}`,
        hint: relative.startsWith('http')
          ? 'Remote requests are blocked so builds stay reproducible. Vendor the file into the project.'
          : 'Check the path; it is resolved from the project root.',
      });
    }
    return out;
  }

  /** Runs `count` jobs over a fixed pool of pages. */
  private async runPool(count: number, job: (index: number, page: Page) => Promise<void>): Promise<void> {
    const workers = Math.max(1, Math.min(this.options.concurrency, count));
    let next = 0;
    const run = async (): Promise<void> => {
      const page = await this.context.newPage();
      try {
        for (;;) {
          const index = next++;
          if (index >= count) return;
          await job(index, page);
        }
      } finally {
        await page.close();
      }
    };
    await Promise.all(Array.from({ length: workers }, run));
  }
}
