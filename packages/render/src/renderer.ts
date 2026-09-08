import {
  collectCss,
  galleryBody,
  htmlDocument,
  impose,
  pageCss,
  rasterFrame,
  sheetBody,
  singleBody,
  singlePageCss,
  toUnits,
  type ComposedCard,
  type Diagnostic,
  type Geometry,
  type Imposition,
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
  /** Round the corners (useful for virtual tabletops, wrong for print). */
  rounded: boolean;
  /** Draw bleed/safe-area guides. Proofing aid, never for final output. */
  guides: boolean;
}

export const DEFAULT_FLAGS: RenderFlags = { bleed: false, rounded: false, guides: false };

export interface RendererOptions {
  dpi?: number;
  allowNetwork?: boolean;
  concurrency?: number;
  /** Cards rendered per browser page during raster capture. */
  batchSize?: number;
}

interface PageDiagnostics {
  errors: string[];
  failedRequests: string[];
  /** Cards whose auto-fitting text still overflows at the minimum size. */
  overflowing: string[];
}

/**
 * Owns the browser, the loopback server and the page pool. One instance renders
 * a whole build, so Chromium starts once instead of once per card, which is the
 * single biggest cost in a naive implementation.
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

  /** Rasterises each card as its own PNG. */
  async renderImages(
    composed: readonly ComposedCard[],
    flags: RenderFlags = DEFAULT_FLAGS,
  ): Promise<{ images: RenderedImage[]; diagnostics: Diagnostic[] }> {
    const batches: ComposedCard[][] = [];
    for (let i = 0; i < composed.length; i += this.options.batchSize) {
      batches.push(composed.slice(i, i + this.options.batchSize));
    }

    const images: RenderedImage[] = [];
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
        const element = page.locator(`[data-slot="${i}"]`);
        const buffer = await element.screenshot({
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

    for (const batch of results) images.push(...(batch ?? []));
    return { images, diagnostics };
  }

  /** One card per page, page size equal to the card. */
  async renderSinglePdf(
    composed: readonly ComposedCard[],
    flags: RenderFlags = DEFAULT_FLAGS,
  ): Promise<{ pdf: Buffer; diagnostics: Diagnostic[] }> {
    const geometry = composed[0]?.geometry;
    if (!geometry) throw new Error('Nothing to export.');
    this.assertUniformGeometry(composed, geometry);

    const page = singlePageCss(geometry, flags.bleed);
    const html = this.buildDocument({
      body: singleBody(composed, { includeBleed: flags.bleed, rounded: flags.rounded, guides: flags.guides }),
      typeIds: composed.map((c) => c.typeId),
      pageCss: page.css,
    });
    return this.pdf(html);
  }

  /** Imposed print sheets with crop marks and duplex-aware back pages. */
  async renderSheetPdf(
    composed: readonly ComposedCard[],
    layout: {
      page: { width: number; height: number };
      margin: number;
      gutter: number;
      columns?: number;
      rows?: number;
      duplex: 'none' | 'long-edge' | 'short-edge';
      marks: boolean;
    },
    flags: RenderFlags = DEFAULT_FLAGS,
  ): Promise<{ pdf: Buffer; imposition: Imposition; diagnostics: Diagnostic[] }> {
    const geometry = composed[0]?.geometry;
    if (!geometry) throw new Error('Nothing to export.');
    this.assertUniformGeometry(composed, geometry);

    const bleed = flags.bleed ? geometry.bleed : 0;
    const cell = { width: geometry.width + bleed * 2, height: geometry.height + bleed * 2 };
    const imposition = impose(toUnits(composed), {
      page: layout.page,
      cell,
      margin: layout.margin,
      gutter: layout.gutter,
      ...(layout.columns !== undefined ? { columns: layout.columns } : {}),
      ...(layout.rows !== undefined ? { rows: layout.rows } : {}),
      duplex: layout.duplex,
    });

    const html = this.buildDocument({
      body: sheetBody(imposition, {
        includeBleed: flags.bleed,
        rounded: flags.rounded,
        guides: flags.guides,
        marks: { enabled: layout.marks },
        bleed,
      }),
      typeIds: composed.map((c) => c.typeId),
      pageCss: pageCss(layout.page),
    });

    const { pdf, diagnostics } = await this.pdf(html);
    // Tiled cards share their bleed with the neighbour they touch, so cutting on
    // the trim line eats into the next card. Professional printing needs a
    // gutter of twice the bleed; home printing usually drops the bleed instead.
    if (bleed > 0 && layout.gutter < bleed * 2) {
      diagnostics.push({
        severity: 'warning',
        code: 'layout/bleed-overlap',
        message: `Cards are tiled with ${bleed}mm bleed but only a ${layout.gutter}mm gutter, so adjacent bleeds overlap.`,
        hint: `Set the gutter to ${bleed * 2}mm, or export without bleed for cut-on-the-line home printing.`,
      });
    }
    return { pdf, imposition, diagnostics };
  }

  private assertUniformGeometry(composed: readonly ComposedCard[], geometry: Geometry): void {
    const mismatch = composed.find(
      (c) => c.geometry.width !== geometry.width || c.geometry.height !== geometry.height,
    );
    if (mismatch) {
      throw new Error(
        `Cards of different sizes cannot share one export. "${mismatch.card.id}" is ` +
          `${mismatch.geometry.width}x${mismatch.geometry.height}mm, expected ` +
          `${geometry.width}x${geometry.height}mm. Export one card type at a time.`,
      );
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

  private async pdf(html: string): Promise<{ pdf: Buffer; diagnostics: Diagnostic[] }> {
    const page = await this.context.newPage();
    try {
      const problems = await this.load(page, html);
      // Screen media keeps PNG and PDF output identical; @page rules still apply.
      await page.emulateMedia({ media: 'screen' });
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        scale: 1,
        displayHeaderFooter: false,
      });
      return { pdf, diagnostics: this.toDiagnostics(problems) };
    } finally {
      await page.close();
    }
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
      const url = this.server.publish(html);
      await page.goto(url, { waitUntil: 'load' });
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
