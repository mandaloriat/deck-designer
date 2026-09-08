#!/usr/bin/env node
import { Command, Option } from 'commander';
import { EXIT, Reporter, type CommandResult, type GlobalOptions } from './output.js';
import { validateCommand } from './commands/validate.js';
import { cardsCommand } from './commands/cards.js';
import { buildCommand } from './commands/build.js';
import { exportCommand, type ExportFormat } from './commands/export.js';
import { initCommand } from './commands/init.js';
import { doctorCommand } from './commands/doctor.js';
import { watchCommand } from './commands/watch.js';

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

/** Options shared by every command that reads a deck. */
function withSelection(command: Command): Command {
  return command
    .option('-p, --project <path>', 'project directory or deck.yaml')
    .option('-t, --type <id...>', 'restrict to card types')
    .option('-i, --id <cardId...>', 'restrict to card ids')
    .option('-w, --where <field=value...>', 'restrict to rows matching a field value')
    .option('-n, --limit <count>', 'take at most this many cards', (v) => Number.parseInt(v, 10));
}

const program = new Command();

program
  .name('deck')
  .description('Headless card deck designer: data in, print-ready cards out.')
  .version(VERSION)
  .option('--json', 'emit a machine-readable result on stdout')
  .option('-q, --quiet', 'suppress progress output')
  .option('--no-color', 'disable ANSI colour')
  .showHelpAfterError();

program
  .command('init')
  .description('scaffold a new deck project')
  .argument('[dir]', 'target directory', '.')
  .option('--name <name>', 'deck name')
  .option('-f, --force', 'overwrite existing files')
  .action(async (dir: string, options, command: Command) => {
    await run('init', command, (reporter) => initCommand(dir, options, reporter));
  });

withSelection(
  program
    .command('validate')
    .description('check config, data, assets and templates without rendering'),
)
  .option('--strict', 'treat warnings as errors')
  .option('--no-templates', 'skip template compilation')
  .action(async (options, command: Command) => {
    await run('validate', command, (reporter) => validateCommand(options, reporter));
  });

withSelection(program.command('cards').description('list the cards in the deck'))
  .option('--fields <name...>', 'columns to show')
  .action(async (options, command: Command) => {
    await run('cards', command, (reporter) => cardsCommand(options, reporter));
  });

withSelection(program.command('build').description('render images, profiles and a manifest'))
  .option('-o, --out <dir>', 'output directory (default: the project output.dir)')
  .option('--dpi <number>', 'raster resolution', (v) => Number.parseInt(v, 10))
  .option('--face <face...>', 'faces to render: front, back')
  .option('--no-images', 'skip card images')
  .option('--no-profiles', 'skip PDF profiles')
  .option('--clean', 'remove the output directory first')
  .option('--concurrency <number>', 'parallel render pages', (v) => Number.parseInt(v, 10))
  .option('--allow-network', 'let the page make outbound requests (breaks reproducibility)')
  .action(async (options, command: Command) => {
    await run('build', command, (reporter) => buildCommand(options, reporter));
  });

const exportCmd = withSelection(
  program
    .command('export')
    .description('render one output')
    .argument('<format>', 'png | pdf | sheet'),
)
  .option('-o, --out <path>', 'output file or directory')
  .option('--dpi <number>', 'raster resolution', (v) => Number.parseInt(v, 10))
  .option('--face <face...>', 'faces to render: front, back')
  .option('--bleed', 'include the bleed area')
  .option('--no-bleed', 'trim to the card size')
  .option('--rounded', 'round the corners (for virtual tabletops, not for print)')
  .option('--guides', 'draw bleed and safe-area guides')
  .option('--copies', 'repeat each card by its copies count')
  .option('--page <size>', 'sheet page size: A4, LETTER, or WxH', 'A4')
  .addOption(new Option('--orientation <mode>', 'sheet orientation').choices(['portrait', 'landscape']))
  .option('--margin <length>', 'sheet margin')
  .option('--gutter <length>', 'space between cards')
  .option('--columns <n>', 'force a column count', (v) => Number.parseInt(v, 10))
  .option('--rows <n>', 'force a row count', (v) => Number.parseInt(v, 10))
  .addOption(new Option('--duplex <mode>', 'back-page mirroring').choices(['none', 'long-edge', 'short-edge']))
  .option('--no-marks', 'omit crop marks')
  .option('--concurrency <number>', 'parallel render pages', (v) => Number.parseInt(v, 10))
  .option('--allow-network', 'let the page make outbound requests (breaks reproducibility)');

exportCmd.action(async (format: string, options, command: Command) => {
  if (!['png', 'pdf', 'sheet'].includes(format)) {
    process.stderr.write(`Unknown format "${format}". Use png, pdf or sheet.\n`);
    process.exitCode = EXIT.usage;
    return;
  }
  await run('export', command, (reporter) => exportCommand(format as ExportFormat, options, reporter));
});

withSelection(program.command('watch').description('rebuild on file changes'))
  .option('-o, --out <dir>', 'output directory')
  .option('--dpi <number>', 'raster resolution', (v) => Number.parseInt(v, 10))
  .option('--face <face...>', 'faces to render: front, back')
  .option('--no-profiles', 'skip PDF profiles while watching')
  .action(async (options, command: Command) => {
    await run('watch', command, (reporter) => watchCommand(options, reporter));
  });

program
  .command('doctor')
  .description('check the toolchain and the project environment')
  .option('-p, --project <path>', 'project directory or deck.yaml')
  .action(async (options, command: Command) => {
    await run('doctor', command, (reporter) => doctorCommand(options, reporter));
  });

await program.parseAsync(process.argv);
