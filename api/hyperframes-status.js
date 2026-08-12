import { get, put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';

async function readJob(jobId) {
  const result = await get(`jobs/hyperframes/${jobId}.json`, { access: 'public' });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).json();
}

async function writeJob(job) {
  await put(`jobs/hyperframes/${job.jobId}.json`, JSON.stringify(job), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export default async function handler(request, response) {
  const jobId = request.query?.jobId || request.url?.split('/').pop();
  if (!jobId) {
    response.status(400).json({ detail: 'Render job ID is required' });
    return;
  }

  try {
    const job = await readJob(jobId);
    if (!job) {
      response.status(404).json({ detail: 'HyperFrames render job not found' });
      return;
    }
    if (job.status === 'complete' || job.status === 'error') {
      response.status(200).json(job);
      return;
    }

    const sandbox = await Sandbox.get({ sandboxId: job.sandboxId });
    const command = await sandbox.getCommand(job.commandId);
    if (command.exitCode == null) {
      response.status(200).json({ jobId, status: 'rendering' });
      return;
    }
    if (command.exitCode !== 0) {
      const errorJob = { ...job, status: 'error', message: `HyperFrames render failed (exit ${command.exitCode}).` };
      await writeJob(errorJob);
      await sandbox.stop().catch(() => {});
      response.status(200).json(errorJob);
      return;
    }

    const mp4 = await sandbox.readFileToBuffer({ path: job.outputPath });
    if (!mp4) {
      response.status(200).json({ jobId, status: 'rendering' });
      return;
    }
    const blob = await put(`renders/${jobId}.mp4`, mp4, {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
    });
    const completeJob = { ...job, status: 'complete', downloadUrl: blob.url, message: 'HyperFrames render complete' };
    await writeJob(completeJob);
    await sandbox.stop().catch(() => {});
    response.status(200).json(completeJob);
  } catch (error) {
    console.error('[HyperFrames/Vercel] status failed', error);
    response.status(500).json({ detail: error instanceof Error ? error.message : 'Unable to read HyperFrames render status' });
  }
}
