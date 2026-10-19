import { ALIASES, defaultOpts, getTool } from '../registry';
import { controllers, dropInputs, getInputs, putOutputs, type Output } from './blobs';
import { useQueue, type Job } from './store';
import { TASK_GONE, dropTask, getTask } from './tasks';

// Jobs run one at a time, in the order they were added, whatever page is open.
let busy = false;

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'Something went wrong.';

function tick() {
  const { hydrated, jobs } = useQueue.getState();
  if (!hydrated || busy) return;
  const next = jobs.find((j) => j.status === 'queued');
  if (next) void run(next);
}

async function run(job: Job) {
  busy = true;
  const { patch } = useQueue.getState();
  const controller = new AbortController();
  controllers.set(job.id, controller);
  patch(job.id, { status: 'running', progress: 0, error: undefined });

  let last = 0;
  const progress = (value: number) => {
    const now = performance.now();
    if (now - last > 100) {
      last = now;
      patch(job.id, { progress: clamp(value) });
    }
  };
  try {
    const outputs: Output[] = [];
    if (job.task) {
      const task = getTask(job.id);
      if (!task) throw new Error(TASK_GONE);
      outputs.push(...(await task.run(controller.signal, progress)));
    } else {
      // Jobs saved under an old address run in the tool that replaced it.
      const alias = ALIASES[job.slug];
      const tool = getTool(job.slug) ?? getTool(alias?.to);
      const opts = alias && tool && !getTool(job.slug) ? { ...defaultOpts(tool), ...job.opts, ...alias.opts } : job.opts;
      if (!tool?.run) throw new Error('This tool is no longer available.');
      const files = await getInputs(job.id);
      if (!files?.length) throw new Error('The input file is gone. Add it again.');

      for await (const ev of tool.run(files, opts, { signal: controller.signal })) {
        if (controller.signal.aborted) break;
        if (ev.type === 'progress') progress(ev.value);
        else outputs.push({ name: ev.name, blob: ev.blob });
      }
    }
    if (controller.signal.aborted) return;
    if (!outputs.length) throw new Error('No output was produced.');

    await putOutputs(job.id, outputs);
    patch(job.id, {
      status: 'done',
      progress: 1,
      outputs: outputs.map((o) => ({ name: o.name, size: o.blob.size, type: o.blob.type })),
    });
    void dropInputs(job.id);
  } catch (e) {
    if (!controller.signal.aborted) patch(job.id, { status: 'error', error: message(e) });
  } finally {
    controllers.delete(job.id);
    if (job.task) dropTask(job.id);
    busy = false;
    setTimeout(tick, 0);
  }
}

export function startRunner() {
  useQueue.subscribe(tick);
  tick();
}
