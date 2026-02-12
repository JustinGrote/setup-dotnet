import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as glob from '@actions/glob';

import {getNuGetFolderPath, getInstallationCacheKey} from './cache-utils';
import {lockFilePatterns, State, Outputs} from './constants';
import {DotnetInstallDir} from './installer';

export const restoreCache = async (cacheDependencyPath?: string) => {
  const lockFilePath = cacheDependencyPath || (await findLockFile());
  const fileHash = await glob.hashFiles(lockFilePath);
  if (!fileHash) {
    throw new Error(
      'Some specified paths were not resolved, unable to cache dependencies.'
    );
  }

  const platform = process.env.RUNNER_OS;
  const primaryKey = `dotnet-cache-${platform}-${fileHash}`;
  core.debug(`primary key is ${primaryKey}`);

  core.saveState(State.CachePrimaryKey, primaryKey);

  const {'global-packages': cachePath} = await getNuGetFolderPath();
  const cacheKey = await cache.restoreCache([cachePath], primaryKey);
  core.setOutput(Outputs.CacheHit, Boolean(cacheKey));

  if (!cacheKey) {
    core.info(`Dotnet packages cache not found for key: ${primaryKey}`);
    return;
  }

  core.saveState(State.CacheMatchedKey, cacheKey);
  core.info(`Dotnet packages cache restored from key: ${cacheKey}`);
};

const findLockFile = async () => {
  const workspace = process.env.GITHUB_WORKSPACE!;
  const rootContent = await readdir(workspace);

  const lockFile = lockFilePatterns.find(item => rootContent.includes(item));
  if (!lockFile) {
    throw new Error(
      `Dependencies lock file is not found in ${workspace}. Supported file patterns: ${lockFilePatterns.toString()}`
    );
  }

  return join(workspace, lockFile);
};

/**
 * Restore dotnet installation from cache.
 * @param versions Array of dotnet versions to install
 * @param quality Quality option for dotnet installation
 * @returns true if cache was restored, false otherwise
 */
export const restoreInstallationCache = async (
  versions: string[],
  quality?: string
): Promise<boolean> => {
  const primaryKey = getInstallationCacheKey(versions, quality);
  core.debug(`Installation primary key: ${primaryKey}`);

  core.saveState(State.InstallationCachePrimaryKey, primaryKey);

  const cachePath = DotnetInstallDir.dirPath;
  core.debug(`Installation cache path: ${cachePath}`);

  const cacheKey = await cache.restoreCache([cachePath], primaryKey);
  core.setOutput(Outputs.InstallationCacheHit, Boolean(cacheKey));

  if (!cacheKey) {
    core.info(`Dotnet installation cache not found for key: ${primaryKey}`);
    return false;
  }

  core.saveState(State.InstallationCacheMatchedKey, cacheKey);
  core.info(`Dotnet installation cache restored from key: ${cacheKey}`);

  return true;
};
