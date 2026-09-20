export class StudioRunReport {
  constructor({runId,versionId,mode="offline",startedAt=new Date().toISOString()}={}){this.data={runId,versionId,mode,startedAt,rounds:0,tasksStarted:0,tasksCompleted:0,tasksFailed:0,providerFailures:0,pendingConfirmations:0,openBugs:0,recoveredTasks:0};}
  round(){this.data.rounds++;return this;}
  record(kind,count=1){const map={taskStarted:"tasksStarted",taskCompleted:"tasksCompleted",taskFailed:"tasksFailed",providerFailure:"providerFailures",recoveredTask:"recoveredTasks"};if(map[kind])this.data[map[kind]]+=count;return this;}
  finish({pendingConfirmations=0,openBugs=0}={}){this.data.pendingConfirmations=pendingConfirmations;this.data.openBugs=openBugs;this.data.finishedAt=new Date().toISOString();this.data.durationMs=Date.parse(this.data.finishedAt)-Date.parse(this.data.startedAt);return {...this.data};}
}
