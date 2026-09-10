# CoWork 整体测试与审核报告（REVIEW）

> 审核日期：本开发会话完成时
> 审核对象：`H:\ai_works\CoWorkPrj` 全部源码、测试、示例与文档
> 审核方式：全量自动化测试 + 语法检查 + CLI 端到端实跑 + 需求覆盖对照 + 人工验收清单

## 一、总体结论

**通过。** MVP 全部 8 个阶段（P0–P7）完成：50/50 自动化测试通过，28 个 JS 文件语法检查通过，
`examples/demo` 与 `init` 模板项目均可通过 CLI 一键端到端跑通，
示例完整演示了"质量门失败 → 会议自动决策 → 补救重试 → 通过"的闭环。

## 二、需求覆盖矩阵（对照用户原始需求）

| 序号 | 用户需求 | 实现方式 | 验证 |
|---|---|---|---|
| 1 | 用户可对 agent 进行数量和模型配置 | `config.agents[]`：每个 agent 独立配置 `id/role/title/provider/model/prompt/enabled`；支持 mock 与 OpenAI 兼容协议 | config.test / demo 四角色各自模型 |
| 2 | agents 之间异步、工作过程不干扰，以对方成果为参考 | 依赖 DAG + 每轮并发批处理（`maxConcurrent`）；agent 只读 `inputs` 指向的**已批准产物**（`latestApproved`），从不直接依赖对方进行中状态；版本化产物交接 | workflow.test A（并发=2 不超限）、demo 双开发并行 |
| 3 | agent1 可查看其他 agent 成果与预期（架构）是否一致 | Oracle 一致性检查：架构产物内 `rules.json` 形式化约束（含校验和/文件存在/包含/正则/JS 语法/按产物裁剪 ifPresent），对每个提交的代码产物自动求值，产出可审计检查记录 | oracle.test、demo（R1 违规被当场拦截） |
| 4 | 有问题 agents 一起开会、讨论、再分工解决 | 会议触发器：审查失败次数 ≥ `maxReviewAttempts` 即触发；`autoDecide=true` 时由 manager 生成**决策 + 分工 actions**（写回任务补救指令）；否则升级人工（任务进入 waiting/failed + `blocked_human` 事件，summar blocked） | workflow.test C/D/F、meeting 记录含决策与 actions |
| 5 | 协调者跟进进度并生成汇报 | reporter：进度百分比、任务表、产物表、审核记录、会议记录、风险（仅未解决的审查失败）、下一步 + manager 叙事（Markdown+JSON 双格式，落盘 `.cowork/`） | reporter.test、demo 汇报 |

## 三、模块清单与测试覆盖

| 模块 | 文件 | 职责 | 覆盖测试 |
|---|---|---|---|
| 事件总线 | src/events.js | on/off/onAny/emit | 各域测试间接覆盖 |
| 配置 | src/config.js | 规范、校验、DAG 环检测、loadConfig | config.test（10 例） |
| 持久化 | src/store.js | JSONL 事件 + 快照 | integration 回放 |
| 域：Agent | src/domain/agents.js | 注册表 + 生命周期 | 引擎/集成间接覆盖 |
| 域：Task | src/domain/tasks.js | 状态机 pending→…→approved/failed | tasks.test（8 例） |
| 域：Artifact | src/domain/artifacts.js | 版本化/超期/校验和/状态 | artifacts.test（7 例） |
| 域：Review | src/domain/reviews.js | 审核记录 | reporter/workflow 间接覆盖 |
| Oracle | src/oracle.js | 规则引擎 + 结论分层 + JS 语法 | oracle.test（8 例） |
| Runner | src/runner.js | 提示词/解析/动作落盘 | runner.test（4 例） |
| exec | src/exec.js | 子进程 stdio inherit | runner.test（2 例含超时） |
| Providers | src/providers/* | mock 确定性脚本 / openai 兼容 | runner.test（2 例） |
| 引擎 | src/engine.js | 调度/质量门/重试/会议升级 | workflow.test（7 例） |
| 会议 | src/meeting.js | 触发器/决策/升级 | workflow.test C/D/F |
| 汇报 | src/reporter.js | 快照/叙事/Markdown | reporter.test（4 例） |
| CLI | bin/cowork.js | init/run/status/report/artifacts | 实跑（demo + init 冒烟） |
| 集成 | test/integration.test.js | 全流程 + 持久化回放 | 2 例 |

共 **50 个测试，全部通过**；`node --check` 28 个 JS 文件零语法错误。

## 四、端到端实测记录（examples/demo）

1. t-arch 架构设计 → 产出 `architecture.md` + `rules.json`（4 条可机检规则），approved ✔
2. t-dev-api 与 t-dev-db **并行**（maxConcurrent=2）✔
3. t-dev-api v1 违反 R1（缺 module.exports）/R2（TODO）→ 质量门拦截，产物 rejected，审查记录 fail ✔
4. 失败次数达 `maxReviewAttempts=1` → 触发会议 m-1（autoDecide）→ manager 决策含补救 action ✔
5. t-dev-api v2 按决策修复 → Oracle + 审核通过 → approved；t-dev-db 一次通过 ✔
6. t-report 汇总 → report-v1（Markdown 报告：进度 100%、4/4、无未解决风险）✔
7. 持久化：`state.json` / `events.jsonl` / `report.md` / `report.json` / 各尝试的工作区文件齐全，status/artifacts 从快照正确恢复 ✔

## 五、已知限制（后续工作）

1. **真实模型未实测**：openai provider 已实现并单测（请求构造/超时错误），但未连接真实模型跑通整条流水线；接入只需配置 `providers: { local: {kind:'openai', baseURL, apiKey, defaultModel} }` 并把 agents 的 `provider/model` 指向它。
2. **会议人工审批 UI**：`autoDecide=false` 时任务进入 blocked（waiting/failed + 事件），无 Web 审批入口；CLI 提示"重新运行推进"，但未实现"编辑决策后续跑"的续跑，需人工改状态或重跑。
3. **执行测试命令的证据**：exec 动作支持（stdio inherit + 退出码），demo 未使用；真实项目建议接入 lint/单测/构建命令并把 outFile 留档。
4. **Token/成本统计、Git 分支隔离、Web 面板**为路线图后续项。
5. **运行中断恢复**：`run` 始终全新执行，不续跑历史运行中的任务（状态可读但不可续跑）。
6. **JS 语法校验**用 `vm.Script`（CommonJS 风格），ESM `import` 语法的目标代码不支持，规则类型可扩展。

## 六、人工验收清单（请用户核对）

- [ ] `node --test "test/*.test.js"` 输出 50/50 通过
- [ ] `node bin/cowork.js run examples/demo` 最终状态 completed（100%，4/4）
- [ ] `node bin/cowork.js status examples/demo` / `report` / `artifacts` 输出与实跑一致
- [ ] 编辑 `examples/demo/cowork.config.js` 中 agents 的 provider/model 可切换真实模型
- [ ] 新增/删除 agent 与 workflow 任务后 `run` 仍可校验（config.test 覆盖错误提示）
- [ ] 同意当前设计（Task/Artifact/Review/Meeting/Report 状态机 + 质量门 + 会议升级）作为 MVP 基线

## 七、如何复现

```bash
cd H:\ai_works\CoWorkPrj
node --test "test/*.test.js"        # 全量测试
node bin/cowork.js run examples/demo # 端到端示例
node bin/cowork.js init my-proj      # 新建项目模板
node bin/cowork.js run my-proj       # 跑新项目
```