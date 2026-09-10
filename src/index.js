// CoWork 公共 API
import { EventBus } from './events.js';
import { ProjectStore } from './store.js';
import { createAgentRegistry } from './domain/agents.js';
import { ArtifactStore } from './domain/artifacts.js';
import { TaskStore } from './domain/tasks.js';
import { ReviewStore } from './domain/reviews.js';
import { createProviderRegistry } from './providers/index.js';
import { WorkflowEngine } from './engine.js';
import { MeetingStore } from './meeting.js';

export { EventBus };
export { ProjectStore };
export { createAgentRegistry };
export { ArtifactStore };
export { TaskStore, TASK_ALLOWED } from './domain/tasks.js';
export { ReviewStore };
export { createProviderRegistry };
export { WorkflowEngine };
export { MeetingStore };
export { buildReport, buildReportSnapshot, renderMarkdown, defaultNarrative } from './reporter.js';
export { evaluateRules, evaluateRule, verdictFor, checksum, isJsValid } from './oracle.js';
export { parseModelOutput, buildPrompt, applyActions, formatInput, truncate, parseOutputLoose } from './runner.js';
export { runCommand } from './exec.js';
export { NightShiftLog, isInNightShift, rangeCovers, toMinutes, minutesInZone, dateKey } from './nightshift.js';
export { createPanelServer, startPanelServer, buildStateView, applyDecision } from './web/server.js';
export { runPlanner, normalizePlanTasks, renderPlanMarkdown, slugOf } from './planner.js';
export {
  normalizeConfig, validateConfig, assertConfig, loadConfig, findCycle,
  DEFAULT_PROMPTS, ROLES, RISKS, defaultEngine,
} from './config.js';

/** 组装一个项目运行时：全部状态机 + 引擎 + 持久化
 * @param {{config:object, dir:string|null, persist?:boolean, clock?:()=>Date, nightShiftLog?:object}} opts
 * dir 为持久化目录（.cowork 等）；persist=false 时纯内存（测试用）
 * clock：注入时间源（夜班判定/测试）；nightShiftLog：夜班文档日志（默认不启用）
 */
export function createProject({ config, dir = null, persist = true, clock = () => new Date(), nightShiftLog = null } = {}) {
  const bus = new EventBus();
  const store = new ProjectStore({ dir, persist });
  const providerRegistry = createProviderRegistry(config.providers);
  const agentRegistry = createAgentRegistry(config.agents, bus);
  const artifactStore = new ArtifactStore(bus);
  const taskStore = new TaskStore(bus);
  const reviewStore = new ReviewStore(bus);
  const meetingStore = new MeetingStore(bus, config.engine.meeting);
  taskStore.createAll(config.workflow.tasks);

  if (persist) bus.onAny((type, payload) => store.appendEvent(type, payload));

  const engine = new WorkflowEngine({
    config, bus, store, agentRegistry, providerRegistry,
    artifactStore, taskStore, reviewStore, meetingStore,
    clock, nightShiftLog,
  });

  const project = {
    config, bus, store,
    providerRegistry, agentRegistry,
    artifactStore, taskStore, reviewStore, meetingStore,
    engine,
    /** 全量状态快照（可持久化/回放） */
    snapshot() {
      return engine.snapshot();
    },
    /** 从快照恢复（CLI status/report 用），返回是否有历史状态 */
    restoreState() {
      const st = store.loadState();
      if (!st) return false;
      agentRegistry.fromSnapshot(st.agents);
      taskStore.fromSnapshot(st.tasks);
      artifactStore.fromSnapshot(st.artifacts);
      reviewStore.fromSnapshot(st.reviews);
      meetingStore.fromSnapshot(st.meetings);
      return true;
    },
    saveState() {
      store.saveState(project.snapshot());
      return true;
    },
  };
  return project;
}