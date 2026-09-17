import { materialApi } from './api';

export interface RecordedAction { id: string; run_id: string; node_id: string; trajectory: any }
export interface ReplayEntry extends RecordedAction { start: number; end: number; before: any; after: any }
export type ReplayMode = 'full' | 'motion';
interface ReplayNode { id: string; device_id: string; operation: string }

/** Use recorded robot motions; process operations remain part of the original workflow. */
export function selectReplayActions(actions: RecordedAction[], nodes: ReplayNode[], mode: ReplayMode): RecordedAction[] {
  if (mode === 'full') return actions;
  const motionIds = new Set(nodes.filter(node =>
    ['mwb_robot_a', 'mwb_robot_b', 'mwb_robot_c'].includes(node.device_id) &&
    ['transfer', 'tray', 'rail'].includes(node.operation)).map(node => node.id));
  return actions.filter(action => motionIds.has(action.node_id));
}

/** Read only committed driver trajectories; never submit a workflow or renderer receipt. */
export async function loadRecordedActions(run: any, progress: (done: number, total: number) => void,
  read: typeof materialApi = materialApi): Promise<RecordedAction[]> {
  const ids: string[] = [], seen = new Set<string>();
  let after = 0;
  for (;;) {
    const { events } = await read(`/execution/runs/${encodeURIComponent(run.id)}/events?after=${after}`);
    for (const event of events) {
      const id = event.payload?.command_id;
      if (event.type === 'driver_return_ready' && id && !seen.has(id)) { seen.add(id); ids.push(id); }
    }
    if (events.length < 200) break;
    const next = events[events.length - 1].seq;
    if (next <= after) throw Error('历史记录读取未能继续，请重新打开此记录。');
    after = next;
  }
  if (!ids.length) throw Error('本次实验没有已完成的动作轨迹，可选择其他执行记录。');
  if (ids.length !== run.next_index) throw Error(`历史轨迹不完整：${ids.length} / ${run.next_index} 个动作。`);
  const actions: RecordedAction[] = [];
  progress(0, ids.length);
  for (let i = 0; i < ids.length; i += 4) {
    const batch = await Promise.all(ids.slice(i, i + 4).map(id => read<RecordedAction>(`/execution/commands/${encodeURIComponent(id)}`)));
    for (const action of batch) {
      if (action.run_id !== run.id || action.node_id !== run.compiled.nodes[actions.length]?.id) throw Error('历史轨迹与工作流顺序不一致。');
      actions.push(action);
    }
    progress(actions.length, ids.length);
  }
  return actions;
}

export function replayTimeline(initial: any, actions: RecordedAction[], includedNodes?: ReadonlySet<string>): ReplayEntry[] {
  let state = structuredClone(initial), time = 0;
  const entries: ReplayEntry[] = [];
  for (const action of actions) {
    const duration = action.trajectory.duration_s;
    if (!Number.isFinite(duration) || duration <= 0) throw Error('历史轨迹时长无效。');
    const endState = action.trajectory.end_state;
    const before = state;
    state = { ...state, ...endState, objects: { ...state.objects, ...endState.objects } };
    // Apply every committed state before filtering: doors, samples and grippers must
    // be correct even after a skipped step or a seek across several skipped steps.
    if (includedNodes && !includedNodes.has(action.node_id)) continue;
    const entry = { ...action, start: time, end: time + duration, before, after: state };
    time += duration;
    entries.push(entry);
  }
  return entries;
}

export function replayPosition(entries: ReplayEntry[], seconds: number) {
  const total = entries.at(-1)?.end || 0;
  const elapsed = Math.max(0, Math.min(total, seconds));
  const index = entries.findIndex(entry => elapsed < entry.end);
  const entry = entries[index < 0 ? entries.length - 1 : index];
  return { entry, elapsed, total, index: index < 0 ? entries.length : index,
    fraction: entry ? Math.max(0, Math.min(1, (elapsed - entry.start) / (entry.end - entry.start))) : 0,
    completed: elapsed >= total };
}
