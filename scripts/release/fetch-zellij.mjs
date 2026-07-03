#!/usr/bin/env node
import {
  ensureZellijArtifact,
  zellijArtifactTargets,
  zellijVersion,
} from './zellij-artifacts.mjs';
import { nativePackageMetadata } from '../../bin/native-package.mjs';

const targets = parseTargets(process.argv.slice(2));

for (const target of targets) {
  const metadata = metadataForTarget(target);
  const path = await ensureZellijArtifact(metadata);
  console.log(`zellij ${zellijVersion} cached for ${target}: ${path}`);
}

function parseTargets(args) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/release/fetch-zellij.mjs [--all]');
    process.exit(0);
  }
  if (args.includes('--all')) {
    return zellijArtifactTargets();
  }
  if (args.length > 0) {
    throw new Error(`Unknown option: ${args.join(' ')}`);
  }
  return [`${process.platform} ${process.arch}`];
}

function metadataForTarget(target) {
  const [platform, arch] = target.split(' ');
  return nativePackageMetadata(platform, arch);
}
