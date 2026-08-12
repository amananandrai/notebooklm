import { put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';

const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function runCommand(sandbox, label, options) {
  const result = await sandbox.runCommand(options);
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (exit ${result.exitCode}): ${await result.stderr()}`);
  }
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  if (!token || !deploymentId) {
    // Skip snapshot setup gracefully — HyperFrames will cold-start on first use.
    // To enable pre-warmed snapshots, connect a Vercel Blob store (BLOB_READ_WRITE_TOKEN).
    console.log('[HyperFrames snapshot] Vercel Blob or deployment credentials are unavailable; skipping snapshot setup.');
    return;
  }

  const sandbox = await Sandbox.create({
    runtime: 'node22',
    resources: { vcpus: 4 },
    timeout: 15 * 60 * 1000,
  });
  try {
    await runCommand(sandbox, 'Install browser libraries', {
      cmd: 'dnf',
      args: ['install', '-y', '--setopt=install_weak_deps=False', 'nss', 'nspr', 'atk', 'at-spi2-atk', 'cups-libs', 'libdrm', 'libxkbcommon', 'libXcomposite', 'libXdamage', 'libXext', 'libXfixes', 'libXrandr', 'mesa-libgbm', 'alsa-lib', 'pango'],
      sudo: true,
    });
    await runCommand(sandbox, 'Install HyperFrames', {
      cmd: 'npm',
      args: ['install', '--no-save', '--no-audit', '--no-fund', 'hyperframes@latest', 'ffmpeg-static', 'ffprobe-static'],
    });
    await runCommand(sandbox, 'Prepare FFmpeg', { cmd: 'ln', args: ['-sf', '/vercel/sandbox/node_modules/ffmpeg-static/ffmpeg', '/usr/local/bin/ffmpeg'], sudo: true });
    await runCommand(sandbox, 'Prepare FFprobe', { cmd: 'ln', args: ['-sf', '/vercel/sandbox/node_modules/ffprobe-static/bin/linux/x64/ffprobe', '/usr/local/bin/ffprobe'], sudo: true });
    await runCommand(sandbox, 'Prepare Chrome', { cmd: 'npx', args: ['--no-install', 'hyperframes', 'browser', 'ensure'] });
    const snapshot = await sandbox.snapshot({ expiration: SNAPSHOT_TTL_MS });
    await put(
      `snapshot-cache/${deploymentId}.json`,
      JSON.stringify({ snapshotId: snapshot.snapshotId }),
      { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token },
    );
    console.log(`[HyperFrames snapshot] Ready: ${snapshot.snapshotId}`);
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[HyperFrames snapshot] Failed:', error);
  process.exit(1);
});
