import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

// Read file tool
export const readFileTool = tool(
  async ({ file_path, max_lines }) => {
    try {
      const resolvedPath = resolve(file_path);
      const content = readFileSync(resolvedPath, 'utf-8');
      const lines = content.split('\n');

      if (max_lines && lines.length > max_lines) {
        return lines.slice(0, max_lines).join('\n') + `\n... (truncated, showing ${max_lines} of ${lines.length} lines)`;
      }
      return content;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return `Error: File not found: ${file_path}`;
      }
      if (err.code === 'EISDIR') {
        return `Error: Path is a directory, not a file: ${file_path}`;
      }
      return `Error reading file: ${err.message}`;
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file. Returns the file content as text.',
    schema: z.object({
      file_path: z.string().describe('The path to the file to read'),
      max_lines: z.number().optional().describe('Maximum number of lines to read (default: all)'),
    }),
  }
);

// List directory tool
export const listDirectoryTool = tool(
  async ({ directory_path, show_hidden }) => {
    try {
      const resolvedPath = resolve(directory_path);
      const entries = readdirSync(resolvedPath, { withFileTypes: true });

      const results: string[] = [];
      for (const entry of entries) {
        if (!show_hidden && entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = join(resolvedPath, entry.name);
        try {
          const stats = statSync(fullPath);
          const type = entry.isDirectory() ? 'd' : entry.isSymbolicLink() ? 'l' : '-';
          const size = entry.isDirectory() ? '-' : formatSize(stats.size);
          const mtime = stats.mtime.toISOString().slice(0, 16).replace('T', ' ');
          results.push(`${type} ${size.padStart(10)} ${mtime} ${entry.name}${entry.isDirectory() ? '/' : ''}`);
        } catch {
          results.push(`? ${'-'.padStart(10)} ${'?'.padStart(16)} ${entry.name}`);
        }
      }

      if (results.length === 0) {
        return `Directory is empty: ${directory_path}`;
      }

      return `Contents of ${resolvedPath}:\n\n${results.join('\n')}`;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return `Error: Directory not found: ${directory_path}`;
      }
      if (err.code === 'ENOTDIR') {
        return `Error: Path is not a directory: ${directory_path}`;
      }
      return `Error listing directory: ${err.message}`;
    }
  },
  {
    name: 'list_directory',
    description: 'List the contents of a directory with file sizes and modification times.',
    schema: z.object({
      directory_path: z.string().describe('The path to the directory to list'),
      show_hidden: z.boolean().optional().describe('Whether to show hidden files (default: false)'),
    }),
  }
);

// Grep tool
export const grepTool = tool(
  async ({ pattern, path, ignore_case, max_results }) => {
    try {
      const resolvedPath = resolve(path);
      const flags = ignore_case ? '-rni' : '-rn';
      const maxCount = max_results ? `-m ${max_results}` : '';

      // Use grep command for efficiency
      const cmd = `grep ${flags} ${maxCount} --include='*' -E ${JSON.stringify(pattern)} ${JSON.stringify(resolvedPath)} 2>/dev/null | head -100`;

      try {
        const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 });
        if (!result.trim()) {
          return `No matches found for pattern: ${pattern}`;
        }
        return result;
      } catch (execError) {
        // grep returns exit code 1 when no matches found
        const err = execError as { status?: number; stdout?: string };
        if (err.status === 1) {
          return `No matches found for pattern: ${pattern}`;
        }
        throw execError;
      }
    } catch (error) {
      const err = error as Error;
      return `Error searching: ${err.message}`;
    }
  },
  {
    name: 'grep',
    description: 'Search for a pattern in files using regular expressions. Returns matching lines with file paths and line numbers.',
    schema: z.object({
      pattern: z.string().describe('The regex pattern to search for'),
      path: z.string().describe('The file or directory path to search in'),
      ignore_case: z.boolean().optional().describe('Whether to ignore case (default: false)'),
      max_results: z.number().optional().describe('Maximum number of results per file'),
    }),
  }
);

// Glob tool - find files by pattern
export const globTool = tool(
  async ({ pattern, path }) => {
    try {
      const resolvedPath = resolve(path);
      // Use find command with name pattern
      const cmd = `find ${JSON.stringify(resolvedPath)} -type f -name ${JSON.stringify(pattern)} 2>/dev/null | head -50`;

      const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 });
      if (!result.trim()) {
        return `No files found matching pattern: ${pattern}`;
      }
      return `Files matching "${pattern}" in ${resolvedPath}:\n\n${result}`;
    } catch (error) {
      const err = error as Error;
      return `Error finding files: ${err.message}`;
    }
  },
  {
    name: 'glob',
    description: 'Find files matching a glob pattern (e.g., "*.ts", "*.json").',
    schema: z.object({
      pattern: z.string().describe('The glob pattern to match (e.g., "*.ts", "*.md")'),
      path: z.string().describe('The directory to search in'),
    }),
  }
);

// File info tool
export const fileInfoTool = tool(
  async ({ file_path }) => {
    try {
      const resolvedPath = resolve(file_path);
      const stats = statSync(resolvedPath);

      const info = [
        `Path: ${resolvedPath}`,
        `Type: ${stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : stats.isSymbolicLink() ? 'symlink' : 'other'}`,
        `Size: ${formatSize(stats.size)} (${stats.size} bytes)`,
        `Modified: ${stats.mtime.toISOString()}`,
        `Created: ${stats.birthtime.toISOString()}`,
        `Permissions: ${(stats.mode & 0o777).toString(8)}`,
      ];

      return info.join('\n');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return `Error: Path not found: ${file_path}`;
      }
      return `Error getting file info: ${err.message}`;
    }
  },
  {
    name: 'file_info',
    description: 'Get detailed information about a file or directory (size, permissions, timestamps).',
    schema: z.object({
      file_path: z.string().describe('The path to the file or directory'),
    }),
  }
);

// Helper function to format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

// Export all tools as an array
export const allTools = [
  readFileTool,
  listDirectoryTool,
  grepTool,
  globTool,
  fileInfoTool,
];
