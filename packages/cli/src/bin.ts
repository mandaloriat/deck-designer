#!/usr/bin/env node
import { Command, Option } from 'commander';
import { Reporter, type CommandResult, type GlobalOptions } from './output.js';
import { validateCommand } from './commands/validate.js';
import { cardsCommand } from './commands/cards.js';
import { buildCommand } from './commands/build.js';
import { exportCommand } from './commands/export.js';
import { printPlanCommand } from './commands/print-plan.js';
import { initCommand } from './commands/init.js';
import { doctorCommand } from './commands/doctor.js';
import { watchCommand } from './commands/watch.js';
import { previewCommand } from './commands/preview.js';
import { atlasCommand } from './commands/atlas.js';
import { pageFormatNames } from './geometry.js';

const VERSION = '0.1.0';

function globals(command: Command): GlobalOptions {
  const opts = command.optsWithGlobals<{ json?: boolean; quiet?: boolean; color?: boolean }>();
  return {
    json: opts.json === true,
    quiet: opts.quiet === true,
    color: opts.color !== false && process.stderr.isTTY === true && !process.env['NO_COLOR'],
  };
}

async function run(
  name: string,
  command: Command,
  fn: (reporter: Reporter) => Promise<CommandResult>,
): Promise<void> {
  const reporter = new Reporter(globals(command));
  let code: number;
  try {
    code = reporter.finish(name, await fn(reporter));
  } catch (error) {
    code = reporter.failure(name, error);
  }
  process.exitCode = code;
}

/** Options shared by every command that reads a project. */
function withSelection(command: Command): Command {
  return command
    .option('-p, --project <path>', 'project directory or deck.yaml')
    .option('-t, --type <id...>', 'restrict to component types')
    .option('-i, --id <componentId...>', 'restrict to component ids')
    .option('-w, --where <field=value...>', 'restrict to rows matching a field value')
    .option('-n, --limit <count>', 'take at most this many', (v) => Number.parseInt(v, 10));
}

/** Options shared by the two commands that rasterise. */
function withRender(command: Command): Command {
  return command
    .option('-o, --out <dir>', 'output directory')
    .option('--dpi <number>', 'output resolution', (v) => Number.parseInt(v, 10))
    .option('--face <face...>', 'faces to render: front, back')
    .option('--name <pattern>', 'filename pattern, e.g. "{type}/{id}.{face}.png"')
    .option('--bleed', 'include the bleed area')
    .option('--rounded', 'round the corners')
    .option('--concurrency <number>', 'parallel render pages', (v) => Number.parseInt(v, 10))
    .option('--allow-network', 'let the page make outbound requests (breaks reproducibility)');
}

const program = new Command();

program
  .name('deck')
  .description('Render game components from data and HTML/CSS templates, headlessly.')
  .version(VERSION)
  .option('--json', 'emit a machine-readable result on stdout')
  .option('-q, --quiet', 'suppress progress output')
  .option('--no-color', 'disable ANSI colour')
  .showHelpAfterError();

program
  .command('init')
  .description('scaffold a new project')
  .argument('[dir]', 'target directory', '.')
  .option('--name <name>', 'project name')
  .option('-f, --force', 'overwrite existing files')
  .action(async (dir: string, options, command: Command) => {
    await run('init', command, (reporter) => initCommand(dir, options, reporter));
  });

withSelection(
  program.command('validate').description('check config, data, assets and templates without rendering'),
)
  .option('--strict', 'treat warnings as errors')
  .option('--no-templates', 'skip template compilation')
  .action(async (options, command: Command) => {
    await run('validate', command, (reporter) => validateCommand(options, reporter));
  });

withSelection(program.command('cards').description('list the components in the project'))
  .option('--fields <name...>', 'columns to show')
  .action(async (options, command: Command) => {
    await run('cards', command, (reporter) => cardsCommand(options, reporter));
  });

withRender(withSelection(program.command('build').description('render every component and write a manifest')))
  .option('--clean', 'remove the output directory first')
  .action(async (options, command: Command) => {
    await run('build', command, (reporter) => buildCommand(options, reporter));
  });

withRender(withSelection(program.command('export').description('render a selection to PNG')))
  .option('--guides', 'draw bleed and safe-area guides')
  .action(async (options, command: Command) => {
    await run('export', command, (reporter) => exportCommand(options, reporter));
  });

withSelection(program.command('atlas').description('render the deck as one grid image for a virtual tabletop'))
  .option('-o, --out <dir>', 'output directory (default: <output.dir>/atlas)')
  .option('--columns <n>', 'force the grid width (max 10)', (v) => Number.parseInt(v, 10))
  .option('--rows <n>', 'force the grid height (max 7)', (v) => Number.parseInt(v, 10))
  .option('--max-size <px>', 'cap the longest side of the image', (v) => Number.parseInt(v, 10), 4096)
  .option('--dpi <number>', 'cap the resolution', (v) => Number.parseInt(v, 10))
  .option('--concurrency <number>', 'parallel render pages', (v) => Number.parseInt(v, 10))
  .option('--allow-network', 'let the page make outbound requests (breaks reproducibility)')
  .action(async (options, command: Command) => {
    await run('atlas', command, (reporter) => atlasCommand(options, reporter));
  });

withSelection(
  program
    .command('print-plan')
    .description('lay rendered PNGs onto sheets and emit print-cards commands'),
)
  .option('-o, --out <dir>', 'where to write the plan (default: <output.dir>/print)')
  .option('--images <dir>', 'where the rendered PNGs are (default: <output.dir>/cards)')
  .option('--name <pattern>', 'the filename pattern they were rendered with')
  .addOption(new Option('--page <format>', 'sheet format').choices(pageFormatNames()).default('A4'))
  .option('--margin <length>', 'smallest acceptable page margin when fitting the grid', '5')
  .option('--spacing-h <length>', 'horizontal gap between components', '0')
  .option('--spacing-v <length>', 'vertical gap between components', '0')
  .option('--columns <n>', 'force a column count', (v) => Number.parseInt(v, 10))
  .option('--rows <n>', 'force a row count', (v) => Number.parseInt(v, 10))
  .addOption(new Option('--duplex <mode>', 'back-sheet mirroring').choices(['none', 'long-edge', 'short-edge']))
  .option('--no-copies', 'lay out one of each component instead of honouring copies')
  .option('--bleed-width <length>', 'solid bleed border print-cards should add')
  .option('--bleed-color <hex>', 'colour of that border')
  .addOption(new Option('--image-fit <mode>', 'how print-cards fits images').choices(['fit', 'fill', 'stretch', 'crop']))
  .option('--command <name>', 'the print-cards executable to call', 'print-cards')
  .action(async (options, command: Command) => {
    await run('print-plan', command, (reporter) => printPlanCommand(options, reporter));
  });

program
  .command('preview')
  .description('serve a live view of the deck in a browser')
  .option('-p, --project <path>', 'project directory or deck.yaml')
  .option('--port <number>', 'port to listen on', (v) => Number.parseInt(v, 10), 4321)
  .option('--host <host>', 'interface to bind (anything but loopback exposes the project)', '127.0.0.1')
  .action(async (options, command: Command) => {
    await run('preview', command, (reporter) => previewCommand(options, reporter));
  });

withRender(withSelection(program.command('watch').description('rebuild on file changes'))).action(
  async (options, command: Command) => {
    await run('watch', command, (reporter) => watchCommand(options, reporter));
  },
);

program
  .command('doctor')
  .description('check the toolchain and the project environment')
  .option('-p, --project <path>', 'project directory or deck.yaml')
  .action(async (options, command: Command) => {
    await run('doctor', command, (reporter) => doctorCommand(options, reporter));
  });

await program.parseAsync(process.argv);
