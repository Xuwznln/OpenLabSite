/**
 * 「填写入口参数再提交」的对话框控制器（EntryParamsDialog.vue 渲染）。
 *
 * 提交路径各不相同（详情页直接建任务、画布先存图再建任务），共用同一个循环
 * {@link submitWithEntryInput}：弹框收集 → 提交 → 后端按合同拒绝时把错误贴回对应字段、
 * 保留已填的值让用户改，直到成功或用户取消。没有入口参数的流程不弹框。
 */
import { shallowReactive } from "vue";
import type { BackendWorkflowInputParameter, JsonObject } from "@openlab/protocol";
import { describeError } from "./errors";
import {
  buildEntryInput,
  describeEntryInputError,
  initialEntryValues,
  type EntryFormValues,
} from "./workflow-io";

export interface EntryPromptOptions {
  title?: string;
  confirmText?: string;
  /** 上一次提交的后端错误（入口参数被拒时重新弹框）。 */
  error?: unknown;
}

export interface EntryInputPrompter {
  /** 收集入口参数；用户取消返回 null。 */
  ask(parameters: readonly BackendWorkflowInputParameter[], options?: EntryPromptOptions): Promise<JsonObject | null>;
  /** 提交结束（成功或非入口参数错误）后关闭。 */
  close(): void;
}

export function createEntryParamsPrompt() {
  // shallowReactive：参数合同里的递归 JSON 类型经深层 reactive 解包会让 vue-tsc 爆栈；
  // 表单值 / 错误整体替换即可触发更新
  const state = shallowReactive({
    open: false,
    title: "填写入口参数",
    confirmText: "提交运行",
    parameters: [] as BackendWorkflowInputParameter[],
    values: {} as EntryFormValues,
    fieldErrors: {} as Record<string, string>,
    error: "",
    busy: false,
  });
  let resolver: ((input: JsonObject | null) => void) | null = null;

  function settle(input: JsonObject | null) {
    const resolve = resolver;
    resolver = null;
    resolve?.(input);
  }

  function ask(parameters: readonly BackendWorkflowInputParameter[], options: EntryPromptOptions = {}): Promise<JsonObject | null> {
    settle(null);
    if (!state.open) {
      // 重新弹框（后端拒绝）时保留用户已填的值
      state.values = initialEntryValues(parameters);
      state.fieldErrors = {};
      state.error = "";
    }
    state.parameters = [...parameters];
    state.title = options.title ?? "填写入口参数";
    state.confirmText = options.confirmText ?? "提交运行";
    state.busy = false;
    if (options.error !== undefined) {
      const info = describeEntryInputError(options.error, parameters);
      state.error = info?.message ?? describeError(options.error);
      state.fieldErrors = info?.field ? { [info.field]: info.message } : {};
    }
    state.open = true;
    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function confirm(): void {
    if (state.busy || !resolver) return;
    const built = buildEntryInput(state.parameters, state.values);
    if (Object.keys(built.errors).length) {
      state.fieldErrors = built.errors;
      state.error = "请先修正标红的入口参数";
      return;
    }
    state.fieldErrors = {};
    state.error = "";
    state.busy = true;
    settle(built.input);
  }

  function cancel(): void {
    state.open = false;
    state.busy = false;
    settle(null);
  }

  function close(): void {
    state.open = false;
    state.busy = false;
    resolver = null;
  }

  return { state, ask, confirm, cancel, close };
}

export type EntryParamsPrompt = ReturnType<typeof createEntryParamsPrompt>;

/**
 * 带入口参数的提交循环。没有参数时直接 `submit(undefined)`；用户取消返回 `null`。
 * 只有「入口参数被拒」会重新弹框，其余错误关闭对话框后原样抛出。
 */
export async function submitWithEntryInput<T>(
  prompter: EntryInputPrompter | null | undefined,
  parameters: readonly BackendWorkflowInputParameter[],
  submit: (input: JsonObject | undefined) => Promise<T>,
  options: Omit<EntryPromptOptions, "error"> = {},
): Promise<T | null> {
  if (!parameters.length || !prompter) return submit(undefined);
  let error: unknown;
  for (;;) {
    const input = await prompter.ask(parameters, { ...options, error });
    if (input === null) return null;
    try {
      const result = await submit(input);
      prompter.close();
      return result;
    } catch (failure) {
      if (describeEntryInputError(failure, parameters)) {
        error = failure;
        continue;
      }
      prompter.close();
      throw failure;
    }
  }
}
