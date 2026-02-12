import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';

/**
 * Tracks file changes in a directory during operations.
 * Records new files and modified files so only changed files are cached.
 */
export class FileWatcher {
  private baselineFiles: Map<string, number> = new Map(); // filename -> mtime
  private changedFiles: Set<string> = new Set();
  private watchPath: string;

  constructor(watchPath: string) {
    this.watchPath = watchPath;
  }

  /**
   * Capture the baseline state of files in the watch path
   */
  public async captureBaseline(): Promise<void> {
    try {
      if (!fs.existsSync(this.watchPath)) {
        core.debug(`Watch path does not exist: ${this.watchPath}`);
        return;
      }

      await this.recursiveCapture(this.watchPath);
      core.debug(
        `Captured baseline of ${this.baselineFiles.size} files in ${this.watchPath}`
      );
    } catch (error) {
      core.warning(`Failed to capture baseline: ${error}`);
    }
  }

  /**
   * Recursively capture all files and their mtimes
   */
  private async recursiveCapture(dirPath: string): Promise<void> {
    try {
      const entries = fs.readdirSync(dirPath, {withFileTypes: true});

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        try {
          if (entry.isDirectory()) {
            // Recursively capture subdirectories
            await this.recursiveCapture(fullPath);
          } else if (entry.isFile()) {
            const stats = fs.statSync(fullPath);
            const relativePath = path.relative(this.watchPath, fullPath);
            this.baselineFiles.set(relativePath, stats.mtimeMs);
          }
        } catch (err) {
          core.debug(`Error processing ${fullPath}: ${err}`);
          // Continue with other files
        }
      }
    } catch (error) {
      core.debug(`Error reading directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Detect which files have changed since baseline
   */
  public async detectChanges(): Promise<void> {
    try {
      if (!fs.existsSync(this.watchPath)) {
        core.debug(`Watch path does not exist: ${this.watchPath}`);
        return;
      }

      await this.recursiveDetect(this.watchPath);
      core.debug(`Detected ${this.changedFiles.size} changed files`);
    } catch (error) {
      core.warning(`Failed to detect changes: ${error}`);
    }
  }

  /**
   * Recursively detect changed or new files
   */
  private async recursiveDetect(dirPath: string): Promise<void> {
    try {
      const entries = fs.readdirSync(dirPath, {withFileTypes: true});

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        try {
          if (entry.isDirectory()) {
            // Recursively check subdirectories
            await this.recursiveDetect(fullPath);
          } else if (entry.isFile()) {
            const relativePath = path.relative(this.watchPath, fullPath);
            const stats = fs.statSync(fullPath);
            const baselineMtime = this.baselineFiles.get(relativePath);

            if (baselineMtime === undefined) {
              // New file
              this.changedFiles.add(relativePath);
              core.debug(`New file: ${relativePath}`);
            } else if (stats.mtimeMs > baselineMtime) {
              // Modified file
              this.changedFiles.add(relativePath);
              core.debug(`Modified file: ${relativePath}`);
            }
          }
        } catch (err) {
          core.debug(`Error processing ${fullPath}: ${err}`);
        }
      }
    } catch (error) {
      core.debug(`Error reading directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Get the list of changed files as relative paths
   */
  public getChangedFiles(): string[] {
    return Array.from(this.changedFiles);
  }

  /**
   * Get the list of changed files as absolute paths
   */
  public getChangedFilesPaths(): string[] {
    return Array.from(this.changedFiles).map(filePath =>
      path.join(this.watchPath, filePath)
    );
  }

  /**
   * Check if there are any tracked changes
   */
  public hasChanges(): boolean {
    return this.changedFiles.size > 0;
  }
}
