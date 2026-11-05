import { describe, expect, it, vi } from "vitest";
import { BackendBusinessError, type BackendWorkflowInputParameter } from "@openlab/protocol";
import { createEntryParamsPrompt, submitWithEntryInput } from "./entry-params-prompt";

const VOLUME: BackendWorkflowInputParameter = { name: "volume", schema: { type: "number" }, required: true };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("入口参数提交循环", () => {
  it("没有入口参数不弹框，直接提交", async () => {
    const prompt = createEntryParamsPrompt();
    const submit = vi.fn(async () => "task");
    await expect(submitWithEntryInput(prompt, [], submit)).resolves.toBe("task");
    expect(submit).toHaveBeenCalledWith(undefined);
    expect(prompt.state.open).toBe(false);
  });

  it("本地校验不过不提交；后端按合同拒绝时贴回字段并保留已填的值，改对后成功关闭", async () => {
    const prompt = createEntryParamsPrompt();
    const submit = vi.fn(async (input: unknown) => {
      if ((input as { volume: number }).volume < 0) {
        throw new BackendBusinessError({ code: 1000, error: { msg: "参数无效：workflow_value_invalid（/input/volume）" } });
      }
      return "task";
    });
    const running = submitWithEntryInput(prompt, [VOLUME], submit, { confirmText: "提交运行" });
    await flush();
    expect(prompt.state.open).toBe(true);
    prompt.confirm();
    expect(prompt.state.fieldErrors).toEqual({ volume: "必填" });
    expect(submit).not.toHaveBeenCalled();

    prompt.state.values = { volume: -1 };
    prompt.confirm();
    await flush();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(prompt.state.open).toBe(true);
    expect(prompt.state.busy).toBe(false);
    expect(prompt.state.fieldErrors.volume).toContain("不符合要求");
    expect(prompt.state.values).toEqual({ volume: -1 });

    prompt.state.values = { volume: 2 };
    prompt.confirm();
    await expect(running).resolves.toBe("task");
    expect(submit).toHaveBeenLastCalledWith({ volume: 2 });
    expect(prompt.state.open).toBe(false);
  });

  it("取消返回 null；其他错误关闭对话框后原样抛出", async () => {
    const prompt = createEntryParamsPrompt();
    const canceled = submitWithEntryInput(prompt, [VOLUME], async () => "task");
    await flush();
    prompt.cancel();
    await expect(canceled).resolves.toBeNull();

    const failing = submitWithEntryInput(prompt, [VOLUME], async () => {
      throw new BackendBusinessError({ code: 3003, error: { msg: "状态冲突" } });
    });
    await flush();
    prompt.state.values = { volume: 1 };
    prompt.confirm();
    await expect(failing).rejects.toMatchObject({ code: 3003 });
    expect(prompt.state.open).toBe(false);
  });
});
