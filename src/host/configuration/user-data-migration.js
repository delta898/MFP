'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIGRATED_DIRECTORIES = Object.freeze(['config', 'data', 'workspace']);

function uniqueArchivePath(basePath, fsImpl) {
    if (!fsImpl.existsSync(basePath)) return basePath;
    let index = 1;
    while (fsImpl.existsSync(`${basePath}.${index}`)) index += 1;
    return `${basePath}.${index}`;
}

function moveFile(sourcePath, destinationPath, fsImpl) {
    fsImpl.mkdirSync(path.dirname(destinationPath), { recursive: true });
    try {
        fsImpl.renameSync(sourcePath, destinationPath);
        return;
    } catch (error) {
        if (error?.code !== 'EXDEV') throw error;
    }

    const temporaryPath = uniqueArchivePath(`${destinationPath}.moving-${process.pid}`, fsImpl);
    try {
        fsImpl.copyFileSync(sourcePath, temporaryPath);
        const sourceSize = fsImpl.statSync(sourcePath).size;
        const copiedSize = fsImpl.statSync(temporaryPath).size;
        if (sourceSize !== copiedSize) throw new Error('copied file size did not match its source');
        fsImpl.renameSync(temporaryPath, destinationPath);
        fsImpl.unlinkSync(sourcePath);
    } catch (error) {
        try { fsImpl.rmSync(temporaryPath, { force: true }); } catch (_ignore) { }
        throw error;
    }
}

function moveTree(sourceDir, destinationDir, archiveDir, fsImpl) {
    if (!fsImpl.existsSync(sourceDir)) return { moved: 0, archived: 0, skipped: 0 };
    const sourceStat = fsImpl.lstatSync(sourceDir);
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
        return { moved: 0, archived: 0, skipped: 1 };
    }

    if (fsImpl.existsSync(destinationDir)) {
        const destinationStat = fsImpl.lstatSync(destinationDir);
        if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
            const archivedPath = uniqueArchivePath(archiveDir, fsImpl);
            moveFileOrTree(sourceDir, archivedPath, fsImpl);
            return { moved: 0, archived: 1, skipped: 0 };
        }
    } else {
        fsImpl.mkdirSync(destinationDir, { recursive: true });
    }

    let moved = 0;
    let archived = 0;
    let skipped = 0;
    for (const entry of fsImpl.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourcePath = path.join(sourceDir, entry.name);
        const destinationPath = path.join(destinationDir, entry.name);
        const archivePath = path.join(archiveDir, entry.name);
        if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
            skipped += 1;
            continue;
        }
        if (entry.isDirectory()) {
            const result = moveTree(sourcePath, destinationPath, archivePath, fsImpl);
            moved += result.moved;
            archived += result.archived;
            skipped += result.skipped;
            continue;
        }

        if (fsImpl.existsSync(destinationPath)) {
            const archivedDestination = uniqueArchivePath(path.join(archiveDir, entry.name), fsImpl);
            moveFile(destinationPath, archivedDestination, fsImpl);
            archived += 1;
        }
        moveFile(sourcePath, destinationPath, fsImpl);
        moved += 1;
    }
    fsImpl.rmdirSync(sourceDir);
    return { moved, archived, skipped };
}

function moveFileOrTree(sourcePath, destinationPath, fsImpl) {
    const sourceStat = fsImpl.lstatSync(sourcePath);
    if (sourceStat.isDirectory() && !sourceStat.isSymbolicLink()) {
        fsImpl.mkdirSync(destinationPath, { recursive: true });
        for (const entry of fsImpl.readdirSync(sourcePath, { withFileTypes: true })) {
            moveFileOrTree(path.join(sourcePath, entry.name), path.join(destinationPath, entry.name), fsImpl);
        }
        fsImpl.rmdirSync(sourcePath);
        return;
    }
    if (sourceStat.isSymbolicLink()) {
        throw new Error(`symbolic link requires manual migration: ${sourcePath}`);
    }
    moveFile(sourcePath, destinationPath, fsImpl);
}

function migrateLegacyUserData({ appRoot, userDataRoot, directories = MIGRATED_DIRECTORIES, fsImpl = fs, logger = console } = {}) {
    const sourceInput = String(appRoot || '').trim();
    const targetInput = String(userDataRoot || '').trim();
    if (!sourceInput || !targetInput) {
        return { moved: 0, archived: 0, skipped: 0, skippedMigration: true };
    }
    const sourceRoot = path.resolve(sourceInput);
    const targetRoot = path.resolve(targetInput);
    if (sourceRoot === targetRoot) return { moved: 0, archived: 0, skipped: 0, skippedMigration: true };

    const archiveRoot = path.join(targetRoot, 'migration-archive', `${Date.now()}-${process.pid}`);
    let moved = 0;
    let archived = 0;
    let skipped = 0;
    for (const directory of directories) {
        try {
            const result = moveTree(
                path.join(sourceRoot, directory),
                path.join(targetRoot, directory),
                path.join(archiveRoot, directory),
                fsImpl
            );
            moved += result.moved;
            archived += result.archived;
            skipped += result.skipped;
        } catch (error) {
            skipped += 1;
            logger.warn?.(`[User Data Migration] ${directory} migration incomplete: ${String(error?.message || error)}`);
        }
    }
    if (moved || archived || skipped) {
        logger.info?.(`[User Data Migration] completed (movedFiles=${moved}, archivedFiles=${archived}, skippedItems=${skipped}, source=${sourceRoot}, target=${targetRoot}, archive=${archiveRoot})`);
    }
    return { moved, archived, skipped, skippedMigration: false, archiveRoot };
}

module.exports = { migrateLegacyUserData };
