export interface WorkflowPrintPayload {
  domainName: string;
  workflowName: string;
  workflowUuid: string;
  taskUuid?: string;
  runMode?: string;
  status?: string;
  revision?: number;
  nodeCount?: number;
  edgeCount?: number;
  tags?: string[];
  createdAt?: string;
  operator?: string;
}

export interface WorkflowPrintSession {
  complete(payload: WorkflowPrintPayload): void;
  close(): void;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function row(label: string, value: unknown): string {
  return `<div class="row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value ?? "—")}</b></div>`;
}

export function buildWorkflowPrintDocument(payload: WorkflowPrintPayload): string {
  const created = payload.createdAt
    ? new Date(payload.createdAt).toLocaleString("zh-CN", { hour12: false })
    : new Date().toLocaleString("zh-CN", { hour12: false });
  const stats = [
    payload.nodeCount !== undefined ? `${payload.nodeCount} nodes` : "",
    payload.edgeCount !== undefined ? `${payload.edgeCount} edges` : "",
    payload.revision !== undefined ? `revision ${payload.revision}` : "",
  ].filter(Boolean).join(" · ");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(payload.workflowName)} · 实验执行单</title>
<style>
@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#15202b;font-family:Arial,"Microsoft YaHei",sans-serif}header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #15202b}.brand{font-size:11px;font-weight:800;letter-spacing:.18em}.domain{margin-top:7px;color:#65717d;font-size:12px}.code{font:11px Consolas,monospace;color:#59636e}.title{margin:30px 0 8px;font-size:30px;letter-spacing:-.03em}.subtitle{color:#697580;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #dce0e3;border-radius:10px;overflow:hidden;margin-top:26px}.row{display:flex;flex-direction:column;gap:7px;min-height:74px;padding:14px;border-right:1px solid #e3e6e8;border-bottom:1px solid #e3e6e8}.row:nth-child(even){border-right:0}.row span{color:#818a93;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.row b{font-size:13px;overflow-wrap:anywhere}.tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:20px}.tag{padding:5px 9px;border:1px solid #cfd5d9;border-radius:999px;font-size:10px}.checks{margin-top:30px}.checks h2{font-size:13px}.check{display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid #eceeef;font-size:12px}.box{width:14px;height:14px;border:1px solid #87919a}.sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:50px}.sign div{padding-top:25px;border-bottom:1px solid #64707a;font-size:11px;color:#7a848d}footer{display:flex;justify-content:space-between;margin-top:34px;padding-top:12px;border-top:1px solid #dfe3e6;color:#8a939b;font-size:9px}.actions{position:fixed;right:18px;top:18px}.actions button{border:0;border-radius:8px;padding:9px 14px;background:#15202b;color:white;cursor:pointer}@media print{.actions{display:none}}
</style></head><body>
<div class="actions"><button onclick="window.print()">打印 / 保存 PDF</button></div>
<header><div><div class="brand">OPENLAB · EXPERIMENT SHEET</div><div class="domain">${escapeHtml(payload.domainName)}</div></div><div class="code">${escapeHtml(payload.taskUuid ?? payload.workflowUuid)}</div></header>
<h1 class="title">${escapeHtml(payload.workflowName)}</h1><div class="subtitle">${escapeHtml(stats || "Canonical workflow execution")}</div>
<section class="grid">${row("Workflow UUID", payload.workflowUuid)}${row("Task UUID", payload.taskUuid)}${row("运行模式", payload.runMode)}${row("状态", payload.status)}${row("提交时间", created)}${row("操作人", payload.operator || "现场操作员")}</section>
<div class="tags">${(payload.tags ?? []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
<section class="checks"><h2>运行前确认</h2><div class="check"><i class="box"></i>物料、样本与耗材已核对</div><div class="check"><i class="box"></i>设备状态与安全联锁已确认</div><div class="check"><i class="box"></i>关键参数与目标产物已复核</div></section>
<section class="sign"><div>执行人签名 / 日期</div><div>复核人签名 / 日期</div></section>
<footer><span>由 OpenLab 开源实验工作台生成</span><span>${escapeHtml(created)}</span></footer>
</body></html>`;
}

export function beginWorkflowPrint(): WorkflowPrintSession | null {
  const popup = window.open("", "_blank", "width=900,height=760");
  if (!popup) return null;
  popup.opener = null;
  popup.document.open();
  popup.document.write("<!doctype html><title>正在生成实验执行单…</title><body style='font-family:sans-serif;padding:40px'>正在创建任务并生成实验执行单…</body>");
  popup.document.close();
  return {
    complete(payload) {
      popup.document.open();
      popup.document.write(buildWorkflowPrintDocument(payload));
      popup.document.close();
      popup.focus();
      window.setTimeout(() => popup.print(), 300);
    },
    close() {
      popup.close();
    },
  };
}
