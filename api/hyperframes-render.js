import { get, put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';

export const maxDuration = 300;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildCompositionHtml(timeline, showCaptions) {
  const width = Number(timeline?.width || 1920);
  const height = Number(timeline?.height || 1080);
  const fps = Number(timeline?.fps || 30);
  const duration = Math.max(1, Number(timeline?.durationInFrames || fps * 10) / fps);
  const slides = Array.isArray(timeline?.slides) ? timeline.slides : [];
  const turns = Array.isArray(timeline?.turns) ? timeline.turns : [];
  const slideMarkup = slides.map((slide) => {
    const start = Number(slide.startFrame || 0) / fps;
    const slideDuration = Math.max(0.1, (Number(slide.endFrame || timeline.durationInFrames || fps) - Number(slide.startFrame || 0)) / fps);
    const bullets = (Array.isArray(slide.bullets) ? slide.bullets : []).slice(0, 6).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('');
    return `<section class="slide clip" data-start="${start.toFixed(3)}" data-duration="${slideDuration.toFixed(3)}"><h1>${escapeHtml(slide.title || 'Document Summary')}</h1><ul>${bullets}</ul></section>`;
  }).join('');
  const captionMarkup = showCaptions ? turns.map((turn) => {
    const start = Number(turn.startFrame || 0) / fps;
    const turnDuration = Math.max(0.1, Number(turn.durationInFrames || fps) / fps);
    return `<div class="caption clip" data-start="${start.toFixed(3)}" data-duration="${turnDuration.toFixed(3)}"><b>${escapeHtml(turn.speaker || 'Host').toUpperCase()}</b><span>${escapeHtml(turn.text || '')}</span></div>`;
  }).join('') : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${width},height=${height}"><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><style>
*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#090b14;color:#fff;font-family:Arial,sans-serif}#root{position:relative;width:100%;height:100%;background:linear-gradient(135deg,#111b38,#5b3b94)}.slide{position:absolute;inset:8%;padding:7%;background:rgba(8,10,20,.38);border:2px solid #c4b5fd88;border-radius:28px}h1{font-size:${Math.max(42, Math.floor(width / 24))}px;line-height:1.05;margin:0 0 38px}li{font-size:${Math.max(22, Math.floor(width / 62))}px;line-height:1.5;margin:14px 0}.caption{position:absolute;left:8%;right:8%;bottom:7%;padding:22px 30px;background:rgba(8,10,18,.94);border:2px solid #c4b5fd99;border-radius:20px;font-size:${Math.max(20, Math.floor(width / 70))}px}.caption b{display:block;color:#c4b5fd;font-size:.65em;letter-spacing:1px;margin-bottom:8px}.caption span{display:block;overflow-wrap:anywhere}.clip{visibility:hidden;opacity:0}
</style></head><body><main id="root" data-composition-id="main" data-start="0" data-duration="${duration.toFixed(3)}" data-width="${width}" data-height="${height}">${slideMarkup}${captionMarkup}</main><script>
window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});document.querySelectorAll('.clip').forEach((el)=>{const start=Number(el.dataset.start||0),d=Number(el.dataset.duration||1);tl.set(el,{visibility:'visible'},start).to(el,{opacity:1,duration:.12},start).to(el,{opacity:0,duration:.12},start+Math.max(.12,d-.12));});window.__timelines.main=tl;
</script></body></html>`;
}

async function runCommand(sandbox, label, options) {
  const result = await sandbox.runCommand(options);
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (exit ${result.exitCode}): ${await result.stderr()}`);
  }
}

async function createRenderSandbox() {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (deploymentId && blobToken) {
    const pointer = await get(`snapshot-cache/${deploymentId}.json`, {
      access: 'public',
      token: blobToken,
    });
    if (pointer?.statusCode === 200) {
      const { snapshotId } = await new Response(pointer.stream).json();
      if (snapshotId) {
        return Sandbox.create({
          source: { type: 'snapshot', snapshotId },
          resources: { vcpus: 4 },
          timeout: 10 * 60 * 1000,
        });
      }
    }
    if (process.env.VERCEL_ENV === 'production') {
      throw new Error('HyperFrames render snapshot is not ready for this deployment. Redeploy after the Vercel build completes.');
    }
  }

  const sandbox = await Sandbox.create({
    runtime: 'node22',
    resources: { vcpus: 4 },
    timeout: 10 * 60 * 1000,
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
    return sandbox;
  } catch (error) {
    await sandbox.stop().catch(() => {});
    throw error;
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ detail: 'POST is required' });
    return;
  }

  let sandbox;
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const timeline = body.timeline || {};
    const html = buildCompositionHtml(timeline, body.showCaptions !== false);
    sandbox = await createRenderSandbox();
    await sandbox.writeFiles([
      { path: 'composition/index.html', content: Buffer.from(html, 'utf8') },
      { path: 'composition/hyperframes.json', content: Buffer.from(JSON.stringify({ paths: { assets: 'assets' } }), 'utf8') },
    ]);
    await runCommand(sandbox, 'Render HyperFrames composition', {
      cmd: 'npx',
      args: ['--no-install', 'hyperframes', 'render', 'composition', '-o', 'out.mp4', '--workers', 'auto', '--format', 'mp4'],
    });
    const mp4 = await sandbox.readFileToBuffer({ path: 'out.mp4' });
    if (!mp4) throw new Error('HyperFrames produced no MP4 output');
    const blob = await put(`renders/hyperframes-${Date.now()}.mp4`, mp4, {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
    });
    response.status(200).json({ status: 'complete', downloadUrl: blob.url, message: 'HyperFrames render complete' });
  } catch (error) {
    console.error('[HyperFrames/Vercel] render failed', error);
    response.status(500).json({ detail: error instanceof Error ? error.message : 'HyperFrames render failed' });
  } finally {
    if (sandbox) await sandbox.stop().catch(() => {});
  }
}
