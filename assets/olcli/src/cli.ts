#!/usr/bin/env node
/**
 * olcli - Overleaf Command Line Interface
 *
 * Command-line access to Overleaf projects using session cookies
 * for authentication. Download, upload, sync, and compile LaTeX projects.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { OverleafClient } from './client.js';
import {
  loadIgnore,
  shouldIgnore,
  buildTexSiblingSet,
  DEFAULT_IGNORE_PATTERNS,
  type IgnoreContext,
} from './ignore.js';

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const VERSION = pkg.version;
import {
  getSessionCookie,
  setSessionCookie,
  getLastProject,
  setLastProject,
  getConfigPath,
  saveOlAuth,
  clearConfig,
  getBaseUrl,
  setBaseUrl,
  getSessionCookieName,
  setSessionCookieName
} from './config.js';

const program = new Command();

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

program
  .name('olcli')
  .description('Overleaf CLI - interact with Overleaf projects from the command line')
  .version(VERSION)
  .option('--base-url <url>', 'Overleaf instance base URL (overrides OVERLEAF_BASE_URL and config)')
  .option('--cookie-name <name>', 'Session cookie name (default: overleaf_session2, use overleaf.sid for older instances)');

/**
 * Helper to get authenticated client
 */
async function getClient(cookieOpt?: string, baseUrlOpt?: string): Promise<OverleafClient> {
  const cookie = cookieOpt || getSessionCookie();
  if (!cookie) {
    console.error(chalk.red('No session cookie found.'));
    console.error('Set one with: olcli auth --cookie <session_cookie>');
    console.error('Or set OVERLEAF_SESSION environment variable');
    console.error('Or create .olauth file in current directory');
    process.exit(1);
  }
  const baseUrl = baseUrlOpt || (program.opts().baseUrl as string | undefined) || getBaseUrl();
  const cookieName = (program.opts().cookieName as string | undefined) || getSessionCookieName();
  return OverleafClient.fromSessionCookie(cookie, baseUrl, cookieName);
}

/**
 * Resolve project from argument or .olcli.json in current directory
 */
interface ResolvedProject {
  id: string;
  name: string;
}

async function resolveProject(
  client: OverleafClient,
  projectArg?: string,
  dir: string = '.'
): Promise<ResolvedProject> {
  // If project argument provided, use it
  if (projectArg) {
    // If it looks like a valid MongoDB ObjectId (24 hex chars), trust it directly
    if (/^[a-f0-9]{24}$/i.test(projectArg)) {
      // Trust the ID, use a placeholder name (will be overwritten on next list)
      return { id: projectArg, name: projectArg };
    }
    
    // Otherwise, look up by name
    let proj = await client.getProject(projectArg);
    if (!proj) {
      throw new Error(`Project not found: ${projectArg}`);
    }
    return { id: proj.id, name: proj.name };
  }

  // Otherwise, check for .olcli.json
  const metaPath = join(dir, '.olcli.json');
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    if (meta.projectId && meta.projectName) {
      return { id: meta.projectId, name: meta.projectName };
    }
  }

  // No project found
  throw new Error('No project specified. Provide a project name/ID or run from a synced directory.');
}

async function transformRemoteDocument(
  client: OverleafClient,
  projectId: string,
  file: string,
  transform: (content: string) => string
): Promise<void> {
  const current = await client.readDocumentByPath(projectId, file);
  const updated = transform(current);
  if (updated === current) throw new Error('The requested operation did not change the document');
  await client.updateDocumentByPath(projectId, file, updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('auth')
  .description('Authenticate with Overleaf using session cookie')
  .option('--cookie <session>', 'Session cookie (overleaf_session2 value)')
  .option('--save-local', 'Save to .olauth in current directory')
  .action(async (options) => {
    if (!options.cookie) {
      console.log(chalk.yellow('To authenticate, provide your session cookie:'));
      console.log();
      console.log('1. Log into overleaf.com in your browser');
      console.log('2. Open Developer Tools (F12) → Application → Cookies');
      console.log('3. Find the cookie named "overleaf_session2"');
      console.log('4. Copy its value and run:');
      console.log();
      console.log(chalk.cyan('  olcli auth --cookie "your_session_cookie_value"'));
      console.log();
      console.log('Or set OVERLEAF_SESSION environment variable');
      return;
    }

    const spinner = ora('Verifying session...').start();
    try {
      const baseUrl = (program.opts().baseUrl as string | undefined) || getBaseUrl();
      const cookieName = (program.opts().cookieName as string | undefined) || getSessionCookieName();
      const client = await OverleafClient.fromSessionCookie(options.cookie, baseUrl, cookieName);
      const projects = await client.listProjects();

      setSessionCookie(options.cookie);

      if (options.saveLocal) {
        saveOlAuth(options.cookie);
        spinner.succeed(`Authenticated! Found ${projects.length} projects. Saved to .olauth`);
      } else {
        spinner.succeed(`Authenticated! Found ${projects.length} projects.`);
      }

      console.log(chalk.dim(`Config saved to: ${getConfigPath()}`));
    } catch (error: any) {
      spinner.fail(`Authentication failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('whoami')
  .description('Show current authentication status')
  .action(async () => {
    const cookie = getSessionCookie();
    if (!cookie) {
      console.log(chalk.yellow('Not authenticated'));
      return;
    }

    const spinner = ora('Checking session...').start();
    try {
      const baseUrl = (program.opts().baseUrl as string | undefined) || getBaseUrl();
      const cookieName = (program.opts().cookieName as string | undefined) || getSessionCookieName();
      const client = await OverleafClient.fromSessionCookie(cookie, baseUrl, cookieName);
      const projects = await client.listProjects();
      spinner.succeed(`Authenticated with access to ${projects.length} projects`);
    } catch (error: any) {
      spinner.fail(`Session invalid: ${error.message}`);
    }
  });

program
  .command('logout')
  .description('Clear stored credentials')
  .action(() => {
    clearConfig();
    console.log(chalk.green('Credentials cleared'));
  });

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('create <name>')
  .description('Create a blank Overleaf project')
  .option('--cookie <session>', 'Session cookie override')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    const spinner = ora(`Creating "${name}"...`).start();
    try {
      const client = await getClient(options.cookie);
      const project = await client.createProject(name);
      spinner.stop();
      if (options.json) {
        console.log(JSON.stringify(project, null, 2));
      } else {
        console.log(chalk.green(`Created "${project.name}"`));
        console.log(chalk.dim(`Project ID: ${project.id}`));
      }
      setLastProject(project.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .alias('ls')
  .description('List all projects')
  .option('--json', 'Output as JSON')
  .option('-n, --limit <n>', 'Limit number of results', parseInt)
  .option('--cookie <session>', 'Session cookie override')
  .action(async (options) => {
    const spinner = ora('Fetching projects...').start();
    try {
      const client = await getClient(options.cookie);
      let projects = await client.listProjects();

      if (options.limit) {
        projects = projects.slice(0, options.limit);
      }

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(projects, null, 2));
        return;
      }

      if (projects.length === 0) {
        console.log(chalk.yellow('No projects found'));
        return;
      }

      console.log(chalk.bold(`Found ${projects.length} project(s):\n`));
      for (const p of projects) {
        const date = new Date(p.lastUpdated).toLocaleDateString();
        console.log(`  ${chalk.cyan(p.id)} - ${chalk.bold(p.name)}`);
        console.log(`    ${chalk.dim(`Last updated: ${date}`)}`);
      }
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('info [project]')
  .description('Show project details (by name or ID)')
  .option('--json', 'Output as JSON')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (project, options) => {
    const spinner = ora('Fetching project info...').start();
    try {
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);

      // Get entities (works without parsing HTML)
      const entities = await client.getEntities(proj.id);
      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify({ project: proj, entities }, null, 2));
        return;
      }

      console.log(chalk.bold(`Project: ${proj.name}`));
      console.log(`  ID: ${chalk.cyan(proj.id)}`);
      console.log();

      // Print file list grouped by folder
      console.log(chalk.bold('Files:'));
      
      // Sort entities by path for nice display
      const sorted = entities.sort((a, b) => a.path.localeCompare(b.path));
      
      for (const entity of sorted) {
        const icon = entity.type === 'doc' ? '📄' : '📎';
        console.log(`  ${icon} ${entity.path}`);
      }

      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

function printFolder(folder: any, indent: string): void {
  // Print subfolders
  for (const f of folder.folders || []) {
    console.log(`${indent}📁 ${chalk.blue(f.name)}/`);
    printFolder(f, indent + '  ');
  }

  // Print docs
  for (const d of folder.docs || []) {
    console.log(`${indent}📄 ${d.name}`);
  }

  // Print files
  for (const f of folder.fileRefs || []) {
    console.log(`${indent}📎 ${f.name}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('download <file> [project]')
  .description('Download a single file from project')
  .option('-o, --output <path>', 'Output path (default: same as file name)')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (file, project, options) => {
    const spinner = ora('Downloading file...').start();
    try {
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);

      const content = await client.downloadByPath(proj.id, file);
      const outputPath = options.output || basename(file);

      writeFileSync(outputPath, content);
      spinner.succeed(`Downloaded: ${outputPath} (${(content.length / 1024).toFixed(1)} KB)`);

      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('zip [project]')
  .description('Download project as zip archive')
  .option('-o, --output <path>', 'Output path (default: <project-name>.zip)')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (project, options) => {
    const spinner = ora('Downloading project...').start();
    try {
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);

      const zip = await client.downloadProject(proj.id);
      const outputPath = options.output || `${proj.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.zip`;

      writeFileSync(outputPath, zip);
      spinner.succeed(`Downloaded: ${outputPath} (${(zip.length / 1024).toFixed(1)} KB)`);

      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('pdf [project]')
  .description('Compile and download PDF')
  .option('-o, --output <path>', 'Output path (default: <project-name>.pdf)')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (project, options) => {
    const spinner = ora('Compiling project...').start();
    try {
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);

      spinner.text = 'Compiling...';
      const pdf = await client.downloadPdf(proj.id);
      const outputPath = options.output || `${proj.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`;

      writeFileSync(outputPath, pdf);
      spinner.succeed(`Downloaded PDF: ${outputPath} (${(pdf.length / 1024).toFixed(1)} KB)`);

      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('output [type]')
  .description('Download compile output files (bbl, log, aux, etc.)')
  .option('-o, --output <path>', 'Output path')
  .option('--list', 'List available output files')
  .option('--project <name>', 'Project name or ID')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (type, options) => {
    const spinner = ora('Compiling project...').start();
    try {
      const client = await getClient(options.cookie);

      // If type looks like a project name (contains spaces or is in project list), treat it as project
      let actualType = type;
      let projectArg = options.project;

      if (type && !projectArg && !['bbl', 'log', 'aux', 'blg', 'pdf', 'out', 'fls', 'fdb_latexmk', 'stderr', 'pdfxref', 'chktex'].includes(type)) {
        // Type might actually be a project name
        const projects = await client.listProjects();
        const matchedProject = projects.find(p => p.name === type || p.id === type);
        if (matchedProject) {
          projectArg = type;
          actualType = undefined;
        }
      }

      const proj = await resolveProject(client, projectArg);
      const result = await client.compileWithOutputs(proj.id);

      if (result.status !== 'success') {
        spinner.warn(`Compilation ${result.status}, but output files may still be available`);
      }

      if (options.list || !actualType) {
        spinner.stop();
        console.log(chalk.bold('Available output files:'));
        for (const file of result.outputFiles) {
          console.log(`  ${chalk.cyan(file.type.padEnd(12))} ${file.path}`);
        }
        console.log();
        console.log(chalk.dim('Usage: olcli output <type>'));
        console.log(chalk.dim('Example: olcli output bbl'));
        return;
      }

      // Find matching output file
      const outputFile = result.outputFiles.find(f => f.type === actualType || f.path.endsWith(`.${actualType}`));
      if (!outputFile) {
        spinner.fail(`Output file not found: ${actualType}`);
        console.log(chalk.dim('Use --list to see available files'));
        process.exit(1);
      }

      spinner.text = `Downloading ${outputFile.path}...`;
      const content = await client.downloadOutputFile(outputFile.url);
      const outputPath = options.output || outputFile.path.replace('output.', '');

      writeFileSync(outputPath, content);
      spinner.succeed(`Downloaded: ${outputPath} (${(content.length / 1024).toFixed(1)} KB)`);

      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('edit <file> [project]')
  .description('Replace a text document directly on Overleaf (no local sync)')
  .option('-f, --from <path>', 'Read replacement content from a local file')
  .option('-c, --content <text>', 'Use the provided text as replacement content')
  .option('--stdin', 'Read replacement content from standard input')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (file, project, options) => {
    const sources = [options.from !== undefined, options.content !== undefined, options.stdin === true]
      .filter(Boolean).length;
    if (sources !== 1) {
      console.error(chalk.red('Choose exactly one content source: --from, --content, or --stdin'));
      process.exit(1);
    }

    const spinner = ora(`Editing ${file} on Overleaf...`).start();
    try {
      let content: string;
      if (options.from !== undefined) {
        if (!existsSync(options.from)) throw new Error(`File not found: ${options.from}`);
        content = readFileSync(options.from, 'utf-8');
      } else if (options.content !== undefined) {
        content = options.content;
      } else {
        content = await readStdin();
      }

      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);
      await client.updateDocumentByPath(proj.id, file, content);
      spinner.succeed(`Edited ${file} directly in "${proj.name}" and verified the saved content`);
      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('replace <file> <search> <replacement> [project]')
  .description('Replace exact text in a remote Overleaf document')
  .option('--all', 'Replace every occurrence (default: require exactly one)')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (file, search, replacement, project, options) => {
    const spinner = ora(`Replacing text in ${file}...`).start();
    try {
      if (search.length === 0) throw new Error('Search text must not be empty');
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);
      let matches = 0;
      await transformRemoteDocument(client, proj.id, file, (content) => {
        matches = content.split(search).length - 1;
        if (matches === 0) throw new Error('Search text was not found');
        if (!options.all && matches !== 1) {
          throw new Error(`Search text matched ${matches} times; make it more specific or use --all`);
        }
        return options.all ? content.split(search).join(replacement) : content.replace(search, replacement);
      });
      spinner.succeed(`Replaced ${options.all ? matches : 1} occurrence(s) in ${file} and verified the result`);
      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('insert <file> <anchor> <text> [project]')
  .description('Insert text before or after an exact anchor in a remote document')
  .option('--before', 'Insert before the anchor (default: after)')
  .option('-n, --occurrence <number>', 'Anchor occurrence to use', (value) => parseInt(value, 10), 1)
  .option('--cookie <session>', 'Session cookie override')
  .action(async (file, anchor, text, project, options) => {
    const spinner = ora(`Inserting text in ${file}...`).start();
    try {
      if (anchor.length === 0) throw new Error('Anchor text must not be empty');
      if (!Number.isInteger(options.occurrence) || options.occurrence < 1) {
        throw new Error('--occurrence must be a positive integer');
      }
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);
      await transformRemoteDocument(client, proj.id, file, (content) => {
        let index = -1;
        let from = 0;
        for (let i = 0; i < options.occurrence; i++) {
          index = content.indexOf(anchor, from);
          if (index === -1) throw new Error(`Anchor occurrence ${options.occurrence} was not found`);
          from = index + anchor.length;
        }
        const position = options.before ? index : index + anchor.length;
        return content.slice(0, position) + text + content.slice(position);
      });
      spinner.succeed(`Inserted text ${options.before ? 'before' : 'after'} occurrence ${options.occurrence} in ${file}`);
      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

for (const mode of ['append', 'prepend'] as const) {
  program
    .command(`${mode} <file> <text> [project]`)
    .description(`${mode === 'append' ? 'Append' : 'Prepend'} text in a remote Overleaf document`)
    .option('--cookie <session>', 'Session cookie override')
    .action(async (file, text, project, options) => {
      const spinner = ora(`${mode === 'append' ? 'Appending' : 'Prepending'} text in ${file}...`).start();
      try {
        const client = await getClient(options.cookie);
        const proj = await resolveProject(client, project);
        await transformRemoteDocument(
          client,
          proj.id,
          file,
          (content) => mode === 'append' ? content + text : text + content
        );
        spinner.succeed(`${mode === 'append' ? 'Appended' : 'Prepended'} text in ${file} and verified the result`);
        setLastProject(proj.id);
      } catch (error: any) {
        spinner.fail(`Failed: ${error.message}`);
        process.exit(1);
      }
    });
}

program
  .command('mkdir <folder> [project]')
  .description('Create a remote folder path on Overleaf')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (folder, project, options) => {
    const spinner = ora(`Creating remote folder ${folder}...`).start();
    try {
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);
      await client.createFolderByPath(proj.id, folder);
      spinner.succeed(`Created remote folder: ${folder}`);
      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('write <file> [project]')
  .description('Create or replace a remote text file without a local checkout')
  .option('-f, --from <path>', 'Read content from a local file')
  .option('-c, --content <text>', 'Use the provided text')
  .option('--stdin', 'Read content from standard input')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (file, project, options) => {
    const sources = [options.from !== undefined, options.content !== undefined, options.stdin === true]
      .filter(Boolean).length;
    if (sources !== 1) {
      console.error(chalk.red('Choose exactly one content source: --from, --content, or --stdin'));
      process.exit(1);
    }
    const spinner = ora(`Writing remote file ${file}...`).start();
    try {
      let content: string;
      if (options.from !== undefined) {
        if (!existsSync(options.from)) throw new Error(`File not found: ${options.from}`);
        content = readFileSync(options.from, 'utf-8');
      } else if (options.content !== undefined) {
        content = options.content;
      } else {
        content = await readStdin();
      }
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);
      const existing = await client.findEntityByPath(proj.id, file);
      if (existing) {
        if (existing.type !== 'doc') throw new Error(`Cannot replace binary file with write: ${file}`);
        await client.updateDocumentByPath(proj.id, file, content);
      } else {
        const folderTree = await client.getFolderTreeFromSocket(proj.id);
        if (!folderTree) throw new Error('Could not load the remote folder tree');
        await client.uploadFile(proj.id, null, file, Buffer.from(content, 'utf-8'), folderTree);
        const saved = await client.downloadByPath(proj.id, file);
        if (saved.toString('utf-8') !== content.replace(/\r\n/g, '\n')) {
          throw new Error('Remote file was created but verification did not match');
        }
      }
      spinner.succeed(`Wrote and verified remote file: ${file}`);
      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('live [project]')
  .description('Keep one authenticated process open for low-latency remote edits')
  .option('--verify', 'Download and verify after every write (slower)')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (project, options) => {
    const spinner = ora('Starting persistent Overleaf session...').start();
    try {
      let client: OverleafClient | undefined;
      let lastConnectError: any;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          client = await getClient(options.cookie);
          break;
        } catch (error) {
          lastConnectError = error;
        }
      }
      if (!client) throw lastConnectError || new Error('Could not connect to Overleaf');
      const proj = await resolveProject(client, project);
      // Start immediately with the conventional root ID. uploadFile() already
      // has authoritative socket/probe fallbacks if a deployment uses a
      // different root, so live startup should not block on socket polling.
      let folderTree: Record<string, string> = { '': client.computeRootFolderId(proj.id) };

      const loadSnapshot = async (): Promise<Map<string, Buffer>> => {
        let lastError: any;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const archive = await client.downloadProject(proj.id);
            const AdmZip = (await import('adm-zip')).default;
            const zip = new AdmZip(archive);
            const snapshot = new Map<string, Buffer>();
            for (const entry of zip.getEntries()) {
              if (!entry.isDirectory) snapshot.set(entry.entryName, entry.getData());
            }
            return snapshot;
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError || new Error('Could not download project snapshot');
      };

      let files = await loadSnapshot();
      spinner.stop();
      console.log(JSON.stringify({
        status: 'ready',
        projectId: proj.id,
        projectName: proj.name,
        files: files.size,
        verify: options.verify === true
      }));

      const rl = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
      for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (!line) continue;
        const started = Date.now();
        try {
          const command = JSON.parse(line) as any;
          const op = command.op;
          if (op === 'quit') {
            console.log(JSON.stringify({ status: 'bye' }));
            break;
          }
          if (op === 'ping') {
            console.log(JSON.stringify({ status: 'ok', op, elapsedMs: Date.now() - started }));
            continue;
          }
          if (op === 'refresh') {
            files = await loadSnapshot();
            folderTree = await client.getFolderTreeFromSocket(proj.id) || folderTree;
            console.log(JSON.stringify({ status: 'ok', op, files: files.size, elapsedMs: Date.now() - started }));
            continue;
          }
          if (op === 'compile') {
            const result = await client.compileProject(proj.id);
            console.log(JSON.stringify({ status: 'ok', op, pdfUrl: result.pdfUrl, elapsedMs: Date.now() - started }));
            continue;
          }
          if (op === 'mkdir') {
            if (typeof command.path !== 'string' || !command.path) throw new Error('mkdir requires path');
            await client.resolveFolderId(proj.id, folderTree, command.path.replace(/^\/+|\/+$/g, ''));
            console.log(JSON.stringify({ status: 'ok', op, path: command.path, elapsedMs: Date.now() - started }));
            continue;
          }
          if (op === 'upload') {
            if (typeof command.localPath !== 'string' || typeof command.path !== 'string') {
              throw new Error('upload requires localPath and path');
            }
            const data = readFileSync(command.localPath);
            await client.uploadFile(proj.id, null, command.path, data, folderTree);
            files.set(command.path, data);
            console.log(JSON.stringify({ status: 'ok', op, path: command.path, bytes: data.length, elapsedMs: Date.now() - started }));
            continue;
          }

          if (!['write', 'replace', 'insert', 'append', 'prepend'].includes(op)) {
            throw new Error(`Unknown live operation: ${String(op)}`);
          }
          if (typeof command.path !== 'string' || !command.path) throw new Error(`${op} requires path`);

          const existing = files.get(command.path)?.toString('utf-8');
          let updated: string;
          if (op === 'write') {
            if (typeof command.content !== 'string') throw new Error('write requires content');
            updated = command.content;
          } else {
            if (existing === undefined) throw new Error(`Remote text file not found in snapshot: ${command.path}`);
            if (op === 'replace') {
              if (typeof command.search !== 'string' || command.search.length === 0) throw new Error('replace requires non-empty search');
              if (typeof command.replacement !== 'string') throw new Error('replace requires replacement');
              const matches = existing.split(command.search).length - 1;
              if (matches === 0) throw new Error('Search text was not found');
              if (command.all !== true && matches !== 1) throw new Error(`Search text matched ${matches} times; use a more specific search or all:true`);
              updated = command.all === true
                ? existing.split(command.search).join(command.replacement)
                : existing.replace(command.search, command.replacement);
            } else if (op === 'insert') {
              if (typeof command.anchor !== 'string' || command.anchor.length === 0) throw new Error('insert requires non-empty anchor');
              if (typeof command.text !== 'string') throw new Error('insert requires text');
              const occurrence = command.occurrence === undefined ? 1 : Number(command.occurrence);
              if (!Number.isInteger(occurrence) || occurrence < 1) throw new Error('occurrence must be a positive integer');
              let index = -1;
              let from = 0;
              for (let i = 0; i < occurrence; i++) {
                index = existing.indexOf(command.anchor, from);
                if (index === -1) throw new Error(`Anchor occurrence ${occurrence} was not found`);
                from = index + command.anchor.length;
              }
              const position = command.before === true ? index : index + command.anchor.length;
              updated = existing.slice(0, position) + command.text + existing.slice(position);
            } else if (op === 'append') {
              if (typeof command.text !== 'string') throw new Error('append requires text');
              updated = existing + command.text;
            } else {
              if (typeof command.text !== 'string') throw new Error('prepend requires text');
              updated = command.text + existing;
            }
          }

          const normalized = updated.replace(/\r\n/g, '\n');
          await client.uploadFile(proj.id, null, command.path, Buffer.from(normalized, 'utf-8'), folderTree);
          files.set(command.path, Buffer.from(normalized, 'utf-8'));
          if (options.verify) {
            const saved = await client.downloadByPath(proj.id, command.path);
            if (saved.toString('utf-8') !== normalized) throw new Error('Remote verification did not match');
          }
          console.log(JSON.stringify({
            status: 'ok', op, path: command.path,
            bytes: Buffer.byteLength(normalized), verified: options.verify === true,
            elapsedMs: Date.now() - started
          }));
        } catch (error: any) {
          console.log(JSON.stringify({ status: 'error', message: error.message, elapsedMs: Date.now() - started }));
        }
      }
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('upload <file> [project]')
  .description('Upload a file to a project')
  .option('--folder <id>', 'Target folder ID (default: root)')
  .option('--to <path>', 'Remote destination path (creates parent folders)')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (file, project, options) => {
    const spinner = ora('Uploading file...').start();
    try {
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);

      if (!existsSync(file)) {
        spinner.fail(`File not found: ${file}`);
        process.exit(1);
      }

      const content = readFileSync(file);
      const remotePath = options.to || basename(file);

      // Pass folder ID or null for root folder (client will compute it)
      const folderId = options.folder || null;

      const folderTree = options.folder ? undefined : await client.getFolderTreeFromSocket(proj.id);
      if (!options.folder && !folderTree) throw new Error('Could not load the remote folder tree');
      const result = await client.uploadFile(proj.id, folderId, remotePath, content, folderTree || undefined);

      if (result.success) {
        spinner.succeed(`Uploaded: ${file} → ${remotePath} in "${proj.name}"`);
      } else {
        spinner.fail(`Upload failed for: ${file}`);
        process.exit(1);
      }

      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// DELETE / RENAME COMMANDS
// ─────────────────────────────────────────────────────────────────────────────
// Use deleteByPath / renameByPath which resolve a path to an entity id via
// /project/<id>/entities, then call the documented delete/rename endpoints.

program
  .command('delete <file> [project]')
  .alias('rm')
  .description('Delete a file or folder from a project')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (file, project, options) => {
    const spinner = ora('Deleting file...').start();
    try {
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);
      await client.deleteByPath(proj.id, file);
      spinner.succeed(`Deleted: ${file}`);
      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('rename <oldname> <newname> [project]')
  .alias('mv')
  .description('Rename a file or folder in a project')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (oldname, newname, project, options) => {
    const spinner = ora('Renaming file...').start();
    try {
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);
      await client.renameByPath(proj.id, oldname, newname);
      spinner.succeed(`Renamed: ${oldname} → ${newname}`);
      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// COMPILE COMMAND
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('compile [project]')
  .description('Compile a project (trigger PDF generation)')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (project, options) => {
    const spinner = ora('Compiling...').start();
    try {
      const client = await getClient(options.cookie);
      const proj = await resolveProject(client, project);

      const result = await client.compileProject(proj.id);
      spinner.succeed(`Compiled "${proj.name}"`);
      console.log(chalk.dim(`PDF URL: ${result.pdfUrl}`));

      setLastProject(proj.id);
    } catch (error: any) {
      spinner.fail(`Compilation failed: ${error.message}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// SYNC COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('pull [project] [dir]')
  .description('Download project files to local directory')
  .option('--force', 'Overwrite local files even if newer')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (project, dir, options) => {
    let targetDir = dir || '.';
    let projectId: string | undefined;
    let projectName: string | undefined;

    // Check for existing .olcli.json if no project specified
    const metaPath = join(targetDir, '.olcli.json');
    if (!project && existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      projectId = meta.projectId;
      projectName = meta.projectName;
    } else if (!project) {
      console.error(chalk.red('No project specified.'));
      console.error('Usage: olcli pull <project> [dir]');
      console.error('Or run from a directory with .olcli.json');
      process.exit(1);
    }

    const spinner = ora('Fetching project...').start();
    try {
      const client = await getClient(options.cookie);

      // Resolve project if needed
      if (!projectId) {
        let proj = await client.getProjectById(project!);
        if (!proj) {
          proj = await client.getProject(project!);
        }
        if (!proj) {
          spinner.fail(`Project not found: ${project}`);
          process.exit(1);
        }
        projectId = proj.id;
        projectName = proj.name;
        // Default directory is project name (sanitized) if not specified
        if (!dir) {
          targetDir = proj.name.replace(/[^a-zA-Z0-9-_]/g, '_');
        }
      }

      spinner.text = 'Downloading project...';
      const zipBuffer = await client.downloadProject(projectId);

      // Extract zip
      spinner.text = 'Extracting files...';
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(zipBuffer);

      // Create target directory
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      // Get local file modification times for safety check
      const { statSync } = await import('node:fs');
      const localMetaPath = join(targetDir, '.olcli.json');
      let lastPull: Date | undefined;
      if (existsSync(localMetaPath)) {
        const meta = JSON.parse(readFileSync(localMetaPath, 'utf-8'));
        lastPull = meta.lastPull ? new Date(meta.lastPull) : undefined;
      }

      // Extract files with safety check
      const entries = zip.getEntries();
      let fileCount = 0;
      let skippedCount = 0;
      const skippedFiles: string[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory) {
          const filePath = join(targetDir, entry.entryName);
          const fileDir = dirname(filePath);

          // Check if local file exists and is newer than last pull
          if (!options.force && existsSync(filePath) && lastPull) {
            try {
              const stats = statSync(filePath);
              if (stats.mtime > lastPull) {
                // Local file is newer - skip unless --force
                skippedCount++;
                skippedFiles.push(entry.entryName);
                continue;
              }
            } catch (e) {
              // File doesn't exist or can't stat, proceed with download
            }
          }

          if (!existsSync(fileDir)) {
            mkdirSync(fileDir, { recursive: true });
          }
          writeFileSync(filePath, entry.getData());
          fileCount++;
        }
      }

      // Save project metadata (with manifest of remote files for sync deletion tracking)
      const remoteManifest: string[] = [];
      for (const e of entries) {
        if (!e.isDirectory) remoteManifest.push(e.entryName);
      }
      writeFileSync(join(targetDir, '.olcli.json'), JSON.stringify({
        projectId,
        projectName,
        lastPull: new Date().toISOString(),
        remoteManifest
      }, null, 2));

      if (skippedCount > 0) {
        spinner.warn(`Downloaded ${fileCount} files, skipped ${skippedCount} locally modified files`);
        console.log(chalk.yellow('  Skipped (local is newer):'));
        for (const f of skippedFiles.slice(0, 5)) {
          console.log(chalk.dim(`    ${f}`));
        }
        if (skippedFiles.length > 5) {
          console.log(chalk.dim(`    ... and ${skippedFiles.length - 5} more`));
        }
        console.log(chalk.dim('  Use --force to overwrite'));
      } else {
        spinner.succeed(`Downloaded ${fileCount} files to ${targetDir}/`);
      }

      setLastProject(projectId);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('push [dir]')
  .description('Upload local changes to Overleaf project')
  .option('--project <name>', 'Project name or ID (overrides .olcli.json)')
  .option('--all', 'Upload all files (not just changed)')
  .option('--dry-run', 'Show what would be uploaded without uploading')
  .option('--probe-folder', 'Probe for correct folder ID (use if uploads fail with folder_not_found)')
  .option('--no-default-ignore', 'Disable built-in LaTeX artifact ignore list (only .olignore applies)')
  .option('--no-ignore', 'Disable all ignore filtering (escape hatch — uploads everything)')
  .option('--show-ignored', 'Print files skipped by ignore rules')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (dir, options) => {
    const targetDir = dir || '.';
    const metaPath = join(targetDir, '.olcli.json');

    // Check for project metadata
    let projectId: string | undefined;
    let projectName: string | undefined;
    let lastPull: Date | undefined;
    let rootFolderId: string | undefined;

    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      projectId = meta.projectId;
      projectName = meta.projectName;
      lastPull = meta.lastPull ? new Date(meta.lastPull) : undefined;
      rootFolderId = meta.rootFolderId;
    }

    if (options.project) {
      // Override with command line option
      projectId = undefined;
      projectName = options.project;
    }

    if (!projectId && !projectName) {
      console.error(chalk.red('No project specified.'));
      console.error('Either run from a directory with .olcli.json or use --project');
      process.exit(1);
    }

    const spinner = ora('Connecting...').start();
    try {
      const client = await getClient(options.cookie);

      // Resolve project if needed
      if (!projectId) {
        let proj = await client.getProjectById(projectName!);
        if (!proj) {
          proj = await client.getProject(projectName!);
        }
        if (!proj) {
          spinner.fail(`Project not found: ${projectName}`);
          process.exit(1);
        }
        projectId = proj.id;
        projectName = proj.name;
      }

      spinner.text = 'Scanning files...';

      // Build ignore context (defaults + .olignore + .olignore.local)
      const ignoreCtx = loadIgnore(targetDir, {
        noDefaults: options.defaultIgnore === false,
        disableAll: options.ignore === false,
      });

      // Get list of files to upload
      const { readdirSync, statSync } = await import('node:fs');

      const filesToUpload: { path: string; relativePath: string }[] = [];
      const filesIgnored: string[] = [];

      function scanDir(currentDir: string, relativeBase: string = '') {
        const entries = readdirSync(currentDir, { withFileTypes: true });
        // Pre-compute sibling .tex set for the PDF special rule.
        const texSiblings = buildTexSiblingSet(
          entries.filter((e) => !e.isDirectory()).map((e) => e.name),
        );
        for (const entry of entries) {
          // Skip hidden files and .olcli.json (always — predates ignore subsystem)
          if (entry.name.startsWith('.')) continue;

          const fullPath = join(currentDir, entry.name);
          const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            // Test directory ignore (gitignore semantics: trailing slash matches dir)
            if (shouldIgnore(`${relativePath}/`, ignoreCtx)) {
              filesIgnored.push(`${relativePath}/`);
              continue;
            }
            scanDir(fullPath, relativePath);
          } else {
            if (shouldIgnore(relativePath, ignoreCtx, texSiblings)) {
              filesIgnored.push(relativePath);
              continue;
            }
            // Check if file is newer than last pull (unless --all)
            if (options.all || !lastPull) {
              filesToUpload.push({ path: fullPath, relativePath });
            } else {
              const stats = statSync(fullPath);
              if (stats.mtime > lastPull) {
                filesToUpload.push({ path: fullPath, relativePath });
              }
            }
          }
        }
      }

      scanDir(targetDir);

      if (options.showIgnored && filesIgnored.length > 0) {
        spinner.stop();
        console.log(chalk.bold(chalk.dim(`Ignored ${filesIgnored.length} file(s)/dir(s):`)));
        for (const p of filesIgnored) {
          console.log(chalk.dim(`  ${p}`));
        }
        spinner.start('Scanning files...');
      }

      if (filesToUpload.length === 0) {
        spinner.info('No files to upload');
        return;
      }

      if (options.dryRun) {
        spinner.stop();
        console.log(chalk.bold(`Would upload ${filesToUpload.length} file(s) to "${projectName}":`));
        for (const f of filesToUpload) {
          console.log(`  ${chalk.cyan(f.relativePath)}`);
        }
        return;
      }

      // If --probe-folder is set, or if we don't have a cached rootFolderId, try probing
      if (options.probeFolder && !rootFolderId) {
        spinner.text = 'Probing for correct folder ID...';
        rootFolderId = await client.probeRootFolderId(projectId!) ?? undefined;
        if (rootFolderId) {
          // Save the discovered folder ID
          if (existsSync(metaPath)) {
            const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
            meta.rootFolderId = rootFolderId;
            writeFileSync(metaPath, JSON.stringify(meta, null, 2));
          }
          spinner.succeed(`Found root folder ID: ${rootFolderId}`);
          spinner.start(`Uploading ${filesToUpload.length} file(s)...`);
        } else {
          spinner.fail('Could not find valid root folder ID');
          console.log(chalk.yellow('Try manually specifying rootFolderId in .olcli.json'));
          process.exit(1);
        }
      }

      // Fetch folder tree once so uploads go into correct subfolders
      spinner.text = 'Resolving folder structure...';
      let folderTree = await client.getFolderTreeFromSocket(projectId!);
      if (!folderTree) {
        // Fallback: build minimal tree with just root
        const resolvedRootId = rootFolderId || await client.getRootFolderId(projectId!);
        folderTree = { '': resolvedRootId };
      }

      spinner.text = `Uploading ${filesToUpload.length} file(s)...`;

      let uploaded = 0;
      let failed = 0;
      let folderNotFoundCount = 0;

      for (const file of filesToUpload) {
        try {
          const content = readFileSync(file.path);
          await client.uploadFile(projectId!, rootFolderId || null, file.relativePath, content, folderTree);
          uploaded++;
          spinner.text = `Uploading... (${uploaded}/${filesToUpload.length})`;
        } catch (error: any) {
          console.error(chalk.yellow(`\n  Warning: Failed to upload ${file.relativePath}: ${error.message}`));
          failed++;
          if (error.message.includes('folder_not_found')) {
            folderNotFoundCount++;
          }
        }
      }

      // Update last push time
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
        meta.lastPush = new Date().toISOString();
        writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      }

      if (failed > 0) {
        spinner.warn(`Uploaded ${uploaded} file(s), ${failed} failed`);
        if (folderNotFoundCount > 0 && !rootFolderId) {
          console.log(chalk.yellow('  Tip: Try running with --probe-folder to find the correct folder ID'));
        }
      } else {
        spinner.succeed(`Uploaded ${uploaded} file(s) to "${projectName}"`);
      }

      setLastProject(projectId!);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('sync [dir]')
  .description('Pull then push (bidirectional sync, propagates local deletions)')
  .option('--project <name>', 'Project name or ID')
  .option('--verbose', 'Show detailed file operations')
  .option('--no-delete', 'Do not propagate local deletions to the remote (safer)')
  .option('--dry-run', 'Show what would change without applying')
  .option('--no-default-ignore', 'Disable built-in LaTeX artifact ignore list (only .olignore applies)')
  .option('--no-ignore', 'Disable all ignore filtering (escape hatch — uploads everything)')
  .option('--show-ignored', 'Print files skipped by ignore rules')
  .option('--cookie <session>', 'Session cookie override')
  .action(async (dir, options) => {
    const targetDir = dir || '.';

    // Check if this is an existing project directory
    const metaPath = join(targetDir, '.olcli.json');
    let projectId: string | undefined;
    let projectName: string | undefined;

    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      projectId = meta.projectId;
      projectName = meta.projectName;
    }

    if (options.project) {
      projectName = options.project;
      projectId = undefined;
    }

    if (!projectId && !projectName) {
      console.error(chalk.red('No project specified.'));
      console.error('Either run from a directory with .olcli.json or use --project');
      process.exit(1);
    }

    const spinner = ora('Connecting...').start();
    try {
      const client = await getClient(options.cookie);

      // Resolve project
      if (!projectId) {
        let proj = await client.getProjectById(projectName!);
        if (!proj) {
          proj = await client.getProject(projectName!);
        }
        if (!proj) {
          spinner.fail(`Project not found: ${projectName}`);
          process.exit(1);
        }
        projectId = proj.id;
        projectName = proj.name;
      }

      // Step 1: Download current state
      spinner.text = 'Downloading project...';
      const zipBuffer = await client.downloadProject(projectId);

      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(zipBuffer);

      // Create target directory
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      // Build ignore context (defaults + .olignore + .olignore.local)
      const ignoreCtx = loadIgnore(targetDir, {
        noDefaults: options.defaultIgnore === false,
        disableAll: options.ignore === false,
      });

      // Track local modifications
      const localFiles = new Map<string, { mtime: Date; content: Buffer }>();
      const filesIgnored: string[] = [];
      const { readdirSync, statSync } = await import('node:fs');

      function scanLocalFiles(currentDir: string, relativeBase: string = '') {
        if (!existsSync(currentDir)) return;
        const entries = readdirSync(currentDir, { withFileTypes: true });
        const texSiblings = buildTexSiblingSet(
          entries.filter((e) => !e.isDirectory()).map((e) => e.name),
        );
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = join(currentDir, entry.name);
          const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (shouldIgnore(`${relativePath}/`, ignoreCtx)) {
              filesIgnored.push(`${relativePath}/`);
              continue;
            }
            scanLocalFiles(fullPath, relativePath);
          } else {
            if (shouldIgnore(relativePath, ignoreCtx, texSiblings)) {
              filesIgnored.push(relativePath);
              continue;
            }
            const stats = statSync(fullPath);
            localFiles.set(relativePath, {
              mtime: stats.mtime,
              content: readFileSync(fullPath)
            });
          }
        }
      }

      // Read local files before overwriting
      if (existsSync(metaPath)) {
        scanLocalFiles(targetDir);
      }

      if (options.showIgnored && filesIgnored.length > 0) {
        spinner.stop();
        console.log(chalk.bold(chalk.dim(`Ignored ${filesIgnored.length} local file(s)/dir(s):`)));
        for (const p of filesIgnored) {
          console.log(chalk.dim(`  ${p}`));
        }
        spinner.start();
      }

      // Extract remote files
      const remoteFiles = new Map<string, Buffer>();
      for (const entry of zip.getEntries()) {
        if (!entry.isDirectory) {
          remoteFiles.set(entry.entryName, entry.getData());
        }
      }

      // Merge: local changes take precedence for files modified after last pull
      let lastPull: Date | undefined;
      let previousManifest: string[] = [];
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
        lastPull = meta.lastPull ? new Date(meta.lastPull) : undefined;
        if (Array.isArray(meta.remoteManifest)) {
          previousManifest = meta.remoteManifest as string[];
        }
      }

      const filesToUpload: { path: string; content: Buffer }[] = [];
      const filesUpdatedLocally: string[] = [];
      const filesKeptLocal: string[] = [];
      const filesNewLocal: string[] = [];
      const filesDeletedRemote: string[] = [];
      const filesDeleteSkipped: { path: string; reason: string }[] = [];

      // Detect locally-deleted files: present in previous manifest, missing locally,
      // still present on the remote. Propagate the deletion to the remote BEFORE
      // we write remote contents back over the working tree (otherwise the file
      // would be silently restored — the bug reported in #7).
      // Conflict policy: if the project has no previous manifest yet (first sync),
      // we cannot distinguish "never existed locally" from "deleted locally", so
      // skip deletion propagation on the very first sync.
      if (options.delete !== false && previousManifest.length > 0 && existsSync(metaPath)) {
        const locallyDeleted: string[] = [];
        for (const path of previousManifest) {
          if (path === 'output.pdf' || path.endsWith('/output.pdf')) continue;
          if (!localFiles.has(path) && remoteFiles.has(path)) {
            locallyDeleted.push(path);
          }
        }

        if (locallyDeleted.length > 0) {
          spinner.text = `Propagating ${locallyDeleted.length} local deletion(s) to remote...`;
          for (const path of locallyDeleted) {
            if (options.dryRun) {
              filesDeletedRemote.push(path);
              remoteFiles.delete(path);
              continue;
            }
            try {
              await client.deleteByPath(projectId, path);
              filesDeletedRemote.push(path);
              // Drop from remoteFiles so we don't re-extract it below
              remoteFiles.delete(path);
            } catch (err: any) {
              filesDeleteSkipped.push({ path, reason: err.message || String(err) });
            }
          }
        }
      }

      spinner.text = 'Comparing files...';

      // Write remote files, but preserve local modifications
      for (const [path, remoteContent] of remoteFiles) {
        const filePath = join(targetDir, path);
        const fileDir = dirname(filePath);
        if (!existsSync(fileDir)) {
          mkdirSync(fileDir, { recursive: true });
        }

        const localFile = localFiles.get(path);
        if (localFile && lastPull && localFile.mtime > lastPull) {
          // Local file was modified after last pull - keep local, queue for upload if different
          if (!localFile.content.equals(remoteContent)) {
            filesToUpload.push({ path, content: localFile.content });
            filesKeptLocal.push(path);
          }
          // Don't overwrite local file
        } else {
          // Write remote version
          writeFileSync(filePath, remoteContent);
          filesUpdatedLocally.push(path);
        }
      }

      // Check for new local files (not in remote)
      for (const [path, localFile] of localFiles) {
        if (path === 'output.pdf' || path.endsWith('/output.pdf')) {
          continue;
        }
        if (!remoteFiles.has(path)) {
          filesToUpload.push({ path, content: localFile.content });
          filesNewLocal.push(path);
        }
      }

      // Upload local changes
      if (filesToUpload.length > 0 && !options.dryRun) {
        spinner.text = `Uploading ${filesToUpload.length} local change(s)...`;
        for (const file of filesToUpload) {
          await client.uploadFile(projectId, null, file.path, file.content);
        }
      }

      // Refresh manifest of remote files post-sync (deletions out, new uploads in)
      const newManifest = new Set<string>(remoteFiles.keys());
      for (const f of filesToUpload) newManifest.add(f.path);
      for (const p of filesDeletedRemote) newManifest.delete(p);

      // Update metadata
      if (!options.dryRun) {
        writeFileSync(metaPath, JSON.stringify({
          projectId,
          projectName,
          lastPull: new Date().toISOString(),
          lastSync: new Date().toISOString(),
          remoteManifest: Array.from(newManifest).sort()
        }, null, 2));
      }

      if (options.dryRun) {
        spinner.succeed(`Dry-run sync "${projectName}" (no changes applied)`);
      } else {
        spinner.succeed(`Synced "${projectName}"`);
      }

      // Summary
      console.log(chalk.dim(`  ↓ ${filesUpdatedLocally.length} pulled from remote`));
      console.log(chalk.dim(`  ↑ ${filesToUpload.length} pushed to remote`));
      if (filesDeletedRemote.length > 0) {
        console.log(chalk.dim(`  ✖ ${filesDeletedRemote.length} deleted on remote`));
      }
      if (filesDeleteSkipped.length > 0) {
        console.log(chalk.yellow(`  ⚠ ${filesDeleteSkipped.length} deletion(s) failed (kept remote)`));
      }

      if (options.verbose) {
        if (filesDeletedRemote.length > 0) {
          console.log(chalk.red('\n  Deleted on remote (matched local deletion):'));
          for (const f of filesDeletedRemote) {
            console.log(chalk.dim(`    ${f}`));
          }
        }
        if (filesDeleteSkipped.length > 0) {
          console.log(chalk.yellow('\n  Deletion skipped (will retry on next sync):'));
          for (const { path, reason } of filesDeleteSkipped) {
            console.log(chalk.dim(`    ${path}  —  ${reason}`));
          }
        }
        if (filesKeptLocal.length > 0) {
          console.log(chalk.yellow('\n  Local changes pushed (local was newer):'));
          for (const f of filesKeptLocal) {
            console.log(chalk.dim(`    ${f}`));
          }
        }
        if (filesNewLocal.length > 0) {
          console.log(chalk.green('\n  New local files pushed:'));
          for (const f of filesNewLocal) {
            console.log(chalk.dim(`    ${f}`));
          }
        }
      }

      setLastProject(projectId);
    } catch (error: any) {
      spinner.fail(`Failed: ${error.message}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// HELP
// ─────────────────────────────────────────────────────────────────────────────

const configCmd = program
  .command('config')
  .description('Manage olcli configuration');

configCmd
  .command('set-url <url>')
  .description('Set the Overleaf instance base URL')
  .action((url: string) => {
    setBaseUrl(url);
    console.log(chalk.green(`Base URL set to: ${url}`));
  });

configCmd
  .command('get-url')
  .description('Get the current Overleaf instance base URL')
  .action(() => {
    console.log(getBaseUrl());
  });

configCmd
  .command('set-cookie-name <name>')
  .description('Set the session cookie name (e.g. overleaf.sid for older instances)')
  .action((name: string) => {
    setSessionCookieName(name);
    console.log(chalk.green(`Session cookie name set to: ${name}`));
  });

configCmd
  .command('get-cookie-name')
  .description('Get the current session cookie name')
  .action(() => {
    console.log(getSessionCookieName());
  });

program
  .command('ignored [dir]')
  .description('Show ignore patterns currently in effect for a project directory')
  .option('--no-default-ignore', 'Exclude built-in defaults from the listing')
  .option('--no-ignore', 'Show what --no-ignore would do (lists nothing)')
  .action((dir, options) => {
    const targetDir = dir || '.';
    const ctx = loadIgnore(targetDir, {
      noDefaults: options.defaultIgnore === false,
      disableAll: options.ignore === false,
    });
    if (!ctx.enabled) {
      console.log(chalk.yellow('Ignore filtering is disabled (--no-ignore).'));
      console.log(chalk.dim('Every local file would be uploaded.'));
      return;
    }
    if (ctx.sources.length === 0) {
      console.log(chalk.yellow('No ignore patterns active.'));
      console.log(chalk.dim('Built-in defaults are disabled and no .olignore file was found.'));
      return;
    }
    console.log(chalk.bold(`Ignore patterns in effect for ${targetDir}:`));
    console.log(chalk.dim('(later sources override earlier ones; ! prefix negates)'));
    for (const src of ctx.sources) {
      console.log();
      console.log(chalk.cyan(`── ${src.label} (${src.patterns.length}) ──`));
      for (const p of src.patterns) {
        console.log(`  ${p}`);
      }
    }
    console.log();
    console.log(chalk.dim(`Total: ${ctx.patterns.length} pattern(s)`));
    if (ctx.defaultsEnabled) {
      console.log(chalk.dim('Note: *.pdf is also ignored when a same-named *.tex/.ltx exists in the same folder.'));
    }
  });

program
  .command('check')
  .description('Show credential sources and config path')
  .action(() => {
    console.log(chalk.bold('Configuration:'));
    console.log(`  Config file: ${getConfigPath()}`);
    console.log();

    console.log(chalk.bold('Credential sources (in order):'));
    console.log('  1. OVERLEAF_SESSION environment variable');
    console.log('  2. .olauth file in current directory');
    console.log('  3. Global config file');
    console.log();

    const cookie = getSessionCookie();
    if (cookie) {
      console.log(chalk.green('✓ Session cookie found'));
      console.log(chalk.dim(`  Value: ${cookie.substring(0, 20)}...`));
    } else {
      console.log(chalk.yellow('✗ No session cookie found'));
    }
  });

program.parse(process.argv);
