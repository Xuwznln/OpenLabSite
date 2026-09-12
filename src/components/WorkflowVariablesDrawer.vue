<script setup lang="ts">
import { computed, ref } from "vue";
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NInput,
  NSelect,
  NTag,
  useMessage,
} from "naive-ui";
import {
  cloneJson,
  coerceVariableValue,
  defaultVariableValue,
  flattenParameterFields,
  isListVariable,
  parseNodeParam,
  variableId,
  type VariableNode,
  type WorkflowVariable,
  type WorkflowVariableType,
} from "../features/workflow-variables";
import { describeError } from "../features/errors";

const props = defineProps<{
  show: boolean;
  variables: WorkflowVariable[];
  nodes: VariableNode[];
}>();

const emit = defineEmits<{
  (event: "update:show", value: boolean): void;
  (event: "update:variables", value: WorkflowVariable[]): void;
}>();

const message = useMessage();
const fileInput = ref<HTMLInputElement | null>(null);

const addNodeId = ref("");
const addPath = ref("");
const addId = ref("");
const addLabel = ref("");
const addType = ref<WorkflowVariableType>("string");
const addGroup = ref("default");

const typeOptions = [
  { label: "文本", value: "string" },
  { label: "数字", value: "number" },
  { label: "开关", value: "boolean" },
  { label: "文本列表", value: "list:string" },
  { label: "数字列表", value: "list:number" },
];

const nodeOptions = computed(() =>
  props.nodes.map((node) => ({ label: node.label, value: node.id })),
);

const selectedNode = computed(() =>
  props.nodes.find((node) => node.id === addNodeId.value),
);

const selectedNodeFields = computed(() => {
  if (!selectedNode.value) return [];
  try {
    return flattenParameterFields(
      parseNodeParam(selectedNode.value.paramJson),
    );
  } catch {
    return [];
  }
});

const pathOptions = computed(() =>
  selectedNodeFields.value.map((field) => ({
    label: `${field.path} · ${typeLabel(field.type)}`,
    value: field.path,
  })),
);

const scalarVariables = computed(() =>
  props.variables.filter((variable) => !isListVariable(variable)),
);

const listGroups = computed(() => {
  const groups = new Map<string, WorkflowVariable[]>();
  for (const variable of props.variables.filter(isListVariable)) {
    const group = variable.group || "default";
    groups.set(group, [...(groups.get(group) ?? []), variable]);
  }
  return [...groups.entries()].map(([name, variables]) => {
    const rowCount = Math.max(
      1,
      ...variables.map((variable) =>
        Array.isArray(variable.value) ? variable.value.length : 0,
      ),
    );
    return { name, variables, rowCount };
  });
});

function typeLabel(type: WorkflowVariableType): string {
  return (
    {
      string: "文本",
      number: "数字",
      boolean: "开关",
      "list:string": "文本列表",
      "list:number": "数字列表",
    }[type] ?? type
  );
}

function replaceVariable(
  id: string,
  patch: Partial<WorkflowVariable>,
): void {
  emit(
    "update:variables",
    props.variables.map((variable) =>
      variable.id === id ? { ...variable, ...patch } : variable,
    ),
  );
}

function removeVariable(id: string): void {
  emit(
    "update:variables",
    props.variables.filter((variable) => variable.id !== id),
  );
}

function onAddNodeChange(): void {
  addPath.value = "";
  addId.value = "";
  addLabel.value = "";
}

function onAddPathChange(path: string): void {
  addPath.value = path;
  const field = selectedNodeFields.value.find((item) => item.path === path);
  if (field) addType.value = field.type;
  addId.value = variableId(addNodeId.value, path);
  addLabel.value = path.split(".").at(-1) || path;
}

function addVariable(): void {
  const id = addId.value.trim();
  const path = addPath.value.trim();
  if (!addNodeId.value || !id || !path) {
    message.warning("请选择节点并填写变量 ID 与参数路径");
    return;
  }
  if (props.variables.some((variable) => variable.id === id)) {
    message.warning(`变量 ID ${id} 已存在`);
    return;
  }

  const field = selectedNodeFields.value.find((item) => item.path === path);
  const type = addType.value;
  emit("update:variables", [
    ...props.variables,
    {
      id,
      label: addLabel.value.trim() || id,
      nodeId: addNodeId.value,
      path,
      type,
      group: type.startsWith("list:")
        ? addGroup.value.trim() || "default"
        : undefined,
      value:
        field && field.type === type
          ? cloneJson(field.value)
          : defaultVariableValue(type),
    },
  ]);
  addPath.value = "";
  addId.value = "";
  addLabel.value = "";
}

function scalarInput(variable: WorkflowVariable, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  replaceVariable(
    variable.id,
    { value: coerceVariableValue(variable.type, raw) },
  );
}

function listValue(variable: WorkflowVariable, row: number): unknown {
  return Array.isArray(variable.value) ? variable.value[row] ?? "" : "";
}

function setListValue(
  variable: WorkflowVariable,
  row: number,
  event: Event,
): void {
  const raw = (event.target as HTMLInputElement).value;
  const values = Array.isArray(variable.value) ? [...variable.value] : [];
  while (values.length <= row) values.push("");
  values[row] =
    variable.type === "list:number" && raw !== "" ? Number(raw) : raw;
  replaceVariable(variable.id, { value: values });
}

function addListRow(groupName: string): void {
  emit(
    "update:variables",
    props.variables.map((variable) => {
      if (!isListVariable(variable) || (variable.group || "default") !== groupName) {
        return variable;
      }
      const value = Array.isArray(variable.value) ? [...variable.value] : [];
      value.push("");
      return { ...variable, value };
    }),
  );
}

function removeListRow(groupName: string, row: number): void {
  emit(
    "update:variables",
    props.variables.map((variable) => {
      if (!isListVariable(variable) || (variable.group || "default") !== groupName) {
        return variable;
      }
      const value = Array.isArray(variable.value) ? [...variable.value] : [];
      value.splice(row, 1);
      return { ...variable, value };
    }),
  );
}

function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

async function importFile(file: File): Promise<void> {
  try {
    let rows: unknown[][];
    if (/\.csv$/i.test(file.name)) {
      rows = parseCsv(await file.text());
    } else {
      const { readSheet } = await import("read-excel-file/browser");
      rows = (await readSheet(file)) as unknown[][];
    }
    if (rows.length < 2) throw new Error("表格至少需要标题行和一行数据");

    const headers = rows[0].map((cell) => String(cell ?? "").trim());
    const updated = props.variables.map((variable) => {
      const column = headers.findIndex(
        (header) => header === variable.id || header === variable.label,
      );
      if (column < 0) return variable;
      if (isListVariable(variable)) {
        const values = rows
          .slice(1)
          .map((row) => row[column] ?? "")
          .map((value) => coerceVariableValue(
            variable.type === "list:number" ? "number" : "string",
            value,
          ));
        return { ...variable, value: values };
      }
      return {
        ...variable,
        value: coerceVariableValue(variable.type, rows[1][column]),
      };
    });
    emit("update:variables", updated);
    message.success(`已从 ${file.name} 导入 ${rows.length - 1} 行参数`);
  } catch (error) {
    message.error(`导入失败：${describeError(error)}`);
  } finally {
    if (fileInput.value) fileInput.value.value = "";
  }
}

function onFileChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void importFile(file);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function exportTemplate(): void {
  if (!props.variables.length) {
    message.warning("请先定义工作流变量");
    return;
  }
  const rowCount = Math.max(
    1,
    ...props.variables.map((variable) =>
      isListVariable(variable) && Array.isArray(variable.value)
        ? variable.value.length
        : 1,
    ),
  );
  const rows: string[] = [
    props.variables.map((variable) => csvCell(variable.id)).join(","),
  ];
  for (let row = 0; row < rowCount; row += 1) {
    rows.push(
      props.variables
        .map((variable) => {
          if (isListVariable(variable)) return csvCell(listValue(variable, row));
          return csvCell(row === 0 ? variable.value : "");
        })
        .join(","),
    );
  }
  const blob = new Blob([`\uFEFF${rows.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "workflow-parameters.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <!-- 底部滑出：不带遮罩、可拖高度，编辑参数表时画布与节点浮层保持可交互 -->
  <NDrawer
    :show="show"
    placement="bottom"
    :default-height="380"
    :min-height="200"
    :max-height="640"
    resizable
    :show-mask="false"
    :mask-closable="false"
    :block-scroll="false"
    :trap-focus="false"
    @update:show="emit('update:show', $event)"
  >
    <NDrawerContent title="工作流参数表" closable>
      <div class="sheet-intro">
        <div>
          <strong>只暴露用户真正关心的变量</strong>
        </div>
        <div class="sheet-actions">
          <input
            ref="fileInput"
            type="file"
            accept=".xlsx,.csv"
            hidden
            @change="onFileChange"
          />
          <NButton size="small" secondary @click="fileInput?.click()">
            导入 Excel / CSV
          </NButton>
          <NButton size="small" secondary @click="exportTemplate">
            导出填写模板
          </NButton>
        </div>
      </div>

      <section class="variable-section">
        <header>
          <div>
            <span class="section-kicker">SCALAR PARAMETERS</span>
            <h3>单值参数</h3>
          </div>
          <NTag size="small" :bordered="false">{{ scalarVariables.length }} 项</NTag>
        </header>
        <div v-if="scalarVariables.length" class="scalar-table">
          <div class="table-head">
            <span>变量</span><span>映射位置</span><span>类型</span><span>值</span><span />
          </div>
          <div v-for="variable in scalarVariables" :key="variable.id" class="table-row">
            <div>
              <input
                class="clean-input strong"
                :value="variable.label"
                @input="replaceVariable(variable.id, { label: ($event.target as HTMLInputElement).value })"
              />
              <small>{{ variable.id }}</small>
            </div>
            <code>{{ variable.nodeId }} · {{ variable.path }}</code>
            <span>{{ typeLabel(variable.type) }}</span>
            <label v-if="variable.type === 'boolean'" class="switch-cell">
              <input
                type="checkbox"
                :checked="Boolean(variable.value)"
                @change="replaceVariable(variable.id, { value: ($event.target as HTMLInputElement).checked })"
              />
              {{ variable.value ? "开启" : "关闭" }}
            </label>
            <input
              v-else
              class="value-input"
              :type="variable.type === 'number' ? 'number' : 'text'"
              :value="String(variable.value ?? '')"
              @input="scalarInput(variable, $event)"
            />
            <button class="remove-button" title="移除变量" @click="removeVariable(variable.id)">×</button>
          </div>
        </div>
        <div v-else class="empty-sheet">从节点参数中点击“置顶”，或在下方手动添加。</div>
      </section>

      <section
        v-for="group in listGroups"
        :key="group.name"
        class="variable-section list-section"
      >
        <header>
          <div>
            <span class="section-kicker">ALIGNED LIST · {{ group.name }}</span>
            <h3>等长列表参数</h3>
          </div>
          <NButton size="tiny" secondary @click="addListRow(group.name)">+ 添加一行</NButton>
        </header>
        <div class="list-scroll">
          <table class="list-table">
            <thead>
              <tr>
                <th class="row-number">#</th>
                <th v-for="variable in group.variables" :key="variable.id">
                  <div>{{ variable.label }}</div>
                  <small>{{ variable.id }} · {{ variable.nodeId }}.{{ variable.path }}</small>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in group.rowCount" :key="row">
                <td class="row-number">{{ row }}</td>
                <td v-for="variable in group.variables" :key="variable.id">
                  <input
                    class="value-input"
                    :type="variable.type === 'list:number' ? 'number' : 'text'"
                    :value="String(listValue(variable, row - 1) ?? '')"
                    @input="setListValue(variable, row - 1, $event)"
                  />
                </td>
                <td>
                  <button
                    class="remove-button"
                    title="删除此行（整组同步）"
                    @click="removeListRow(group.name, row - 1)"
                  >
                    ×
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="list-foot">
          同组 {{ group.variables.length }} 列共享 {{ group.rowCount }} 行；增删行会同步所有列。
          <button
            v-for="variable in group.variables"
            :key="variable.id"
            class="text-button"
            @click="removeVariable(variable.id)"
          >
            移除 {{ variable.label }}
          </button>
        </div>
      </section>

      <section class="variable-section add-section">
        <header>
          <div>
            <span class="section-kicker">VARIABLE MAPPING</span>
            <h3>添加置顶变量</h3>
          </div>
        </header>
        <div class="add-grid">
          <label>
            <span>节点</span>
            <NSelect
              v-model:value="addNodeId"
              :options="nodeOptions"
              filterable
              placeholder="选择节点"
              @update:value="onAddNodeChange"
            />
          </label>
          <label>
            <span>参数路径</span>
            <NSelect
              :value="addPath"
              :options="pathOptions"
              filterable
              tag
              placeholder="例如 temperature"
              @update:value="onAddPathChange"
            />
          </label>
          <label>
            <span>变量 ID / Excel 列名</span>
            <NInput v-model:value="addId" placeholder="reaction_temperature" />
          </label>
          <label>
            <span>显示名称</span>
            <NInput v-model:value="addLabel" placeholder="反应温度" />
          </label>
          <label>
            <span>类型</span>
            <NSelect v-model:value="addType" :options="typeOptions" />
          </label>
          <label v-if="addType.startsWith('list:')">
            <span>等长列表组</span>
            <NInput v-model:value="addGroup" placeholder="例如 samples" />
          </label>
          <NButton type="primary" class="add-button" @click="addVariable">
            添加到参数表
          </NButton>
        </div>
      </section>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.sheet-intro,
.variable-section header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sheet-intro {
  padding: 16px 18px;
  border-radius: 14px;
  color: #eefbf7;
  background: linear-gradient(115deg, #0b1719, #173533);
}

.sheet-intro strong {
  font-size: 17px;
}

.sheet-intro p {
  margin: 4px 0 0;
  color: #a9c5c0;
  font-size: 12px;
}

.sheet-actions {
  display: flex;
  gap: 8px;
}

.variable-section {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid #e8e6e1;
  border-radius: 14px;
  background: #fff;
}

.variable-section header h3 {
  margin: 2px 0 0;
  font-size: 16px;
}

.section-kicker {
  font: 9px var(--font-mono);
  letter-spacing: 0.13em;
  color: #8b939d;
}

.scalar-table {
  margin-top: 12px;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: 1.15fr 1.3fr 72px 1.25fr 24px;
  align-items: center;
  gap: 10px;
}

.table-head {
  padding: 0 8px 7px;
  color: #8b939d;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.table-row {
  min-height: 54px;
  padding: 7px 8px;
  border-top: 1px solid #f0eee9;
}

.table-row small,
.list-table small {
  display: block;
  color: #9aa1aa;
  font: 9px var(--font-mono);
}

.table-row code {
  overflow: hidden;
  color: #59616c;
  font: 10px var(--font-mono);
  text-overflow: ellipsis;
}

.clean-input,
.value-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #deddd8;
  border-radius: 7px;
  outline: none;
  background: #fff;
  color: #111820;
}

.clean-input {
  border: 0;
  padding: 2px 0;
}

.clean-input.strong {
  font-weight: 600;
}

.value-input {
  height: 32px;
  padding: 0 9px;
}

.value-input:focus {
  border-color: #2e5bff;
  box-shadow: 0 0 0 2px rgba(46, 91, 255, 0.12);
}

.switch-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.remove-button,
.text-button {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.remove-button {
  color: #a3a8af;
  font-size: 18px;
}

.remove-button:hover {
  color: #d14343;
}

.empty-sheet {
  padding: 24px;
  color: #a0a6ae;
  text-align: center;
  font-size: 12px;
}

.list-scroll {
  overflow-x: auto;
  margin-top: 12px;
}

.list-table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
}

.list-table th,
.list-table td {
  min-width: 150px;
  padding: 7px;
  border: 1px solid #ebe9e4;
  text-align: left;
}

.list-table th {
  background: #f8f8f6;
  font-size: 12px;
}

.list-table .row-number {
  min-width: 36px;
  width: 36px;
  color: #9aa1aa;
  text-align: center;
  font: 10px var(--font-mono);
}

.list-foot {
  margin-top: 8px;
  color: #8b939d;
  font-size: 10px;
}

.text-button {
  margin-left: 8px;
  color: #2e5bff;
  font-size: 10px;
}

.add-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.add-grid label > span {
  display: block;
  margin-bottom: 4px;
  color: #6e7580;
  font-size: 11px;
}

.add-button {
  align-self: end;
}

@media (max-width: 760px) {
  .sheet-intro,
  .variable-section header {
    align-items: flex-start;
    flex-direction: column;
  }

  .add-grid {
    grid-template-columns: 1fr;
  }

  .table-head {
    display: none;
  }

  .table-row {
    grid-template-columns: 1fr;
  }
}
</style>
