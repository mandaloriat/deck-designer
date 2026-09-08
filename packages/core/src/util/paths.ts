import path from 'node:path';

/**
 * Resolves a project-relative path and refuses to escape the project root.
 * Templates, data files and assets are all user input; a deck fetched from a
 * repository must not be able to read `../../.ssh/id_rsa` through an asset
 * reference.
 */
export function resolveInProject(root: string, relative: string): string {
  const abs = path.resolve(root, relative);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes the project directory: ${relative}`);
  }
  return abs;
}

/** Project-relative POSIX path, suitable for URLs and stable manifests. */
export function projectRelative(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

export function isSubPath(root: string, abs: string): boolean {
  const rel = path.relative(root, abs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
