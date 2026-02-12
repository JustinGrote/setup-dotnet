import * as core from '@actions/core';
import * as cache from '@actions/cache';
import fs from 'node:fs';
import {getNuGetFolderPath} from './cache-utils';
import {State} from './constants';
import {DotnetInstallDir} from './installer';

// Catch and log any unhandled exceptions.  These exceptions can leak out of the uploadChunk method in
// @actions/toolkit when a failed upload closes the file descriptor causing any in-process reads to
// throw an uncaught exception.  Instead of failing this action, just warn.
process.on('uncaughtException', e => {
  const warningPrefix = '[warning]';
  core.info(`${warningPrefix}${e.message}`);
});

export async function run() {
  try {
    if (core.getBooleanInput('cache')) {
      await cachePackages();
      await cacheInstallation();
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

const cachePackages = async () => {
  const state = core.getState(State.CacheMatchedKey);
  const primaryKey = core.getState(State.CachePrimaryKey);

  if (!primaryKey) {
    core.info('Primary key was not generated, not saving cache.');
    return;
  }

  const {'global-packages': cachePath} = await getNuGetFolderPath();

  if (!fs.existsSync(cachePath)) {
    throw new Error(
      `Packages Cache folder path is retrieved for .NET CLI but doesn't exist on disk: ${cachePath}`
    );
  }

  if (primaryKey === state) {
    core.info(
      `Packages Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
    );
    return;
  }

  const cacheId = await cache.saveCache([cachePath], primaryKey);
  if (cacheId == -1) {
    return;
  }

  core.info(
    `Packages Cache saved with the key: ${primaryKey} and cache id: ${cacheId}`
  );
};

const cacheInstallation = async () => {
  const cacheKey = core.getState(State.InstallationCacheKey);
  const cacheHit = core.getState(State.InstallationCacheHitKey);

  if (!cacheKey) {
    core.info('Installation cache key was not generated, not saving cache.');
    return;
  }

  if (cacheKey === cacheHit) {
    core.info(
      `Installation cache hit occurred on the cache key ${cacheKey}, not saving cache.`
    );
    return;
  }

  const cachePath = DotnetInstallDir.dirPath;

  if (!fs.existsSync(cachePath)) {
    core.warning(
      `Installation path doesn't exist on disk: ${cachePath}. Not saving cache.`
    );
    return;
  }

  // Get tracked files from the installation process
  const trackedFilesState = core.getState(State.InstallationTrackedFiles);
  let pathsToCache: string[] = [cachePath];

  if (trackedFilesState) {
    const trackedFiles = trackedFilesState.split('\n').filter(Boolean);
    if (trackedFiles.length > 0) {
      core.info(
        `Caching ${trackedFiles.length} changed files from dotnet installation`
      );
      pathsToCache = trackedFiles;
    }
  }

  core.info(
    `Cache miss for installation cache with the key ${cacheKey}, caching ${pathsToCache.length} files that differ in the dotnet folder.`
  );
  const cacheId = await cache.saveCache(pathsToCache, cacheKey);
  if (cacheId == -1) {
    return;
  }

  core.info(
    `Installation cache saved with the key: ${cacheKey} and cache id: ${cacheId}`
  );
};

run();
