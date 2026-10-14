export function buildStudioSnapshot({ versionId, versions, stages, tasks, bugs = null, reviews = null, pendingApprovals = null, meetings = null } = {}) {
  const version = versions?.get(versionId);
  const stageRows = stages?.list ? stages.list(versionId) : [];
  const taskRows = tasks?.list ? tasks.list(versionId) : [];
  const bugRows = bugs?.list ? bugs.list(versionId) : [];
  const reviewRows = reviews?.listForVersion ? reviews.listForVersion(versionId) : [];
  const meetingRows = meetings && typeof meetings.list === "function" ? meetings.list({ versionId, limit: 5 }) : [];
  return {
    protocol: 1,
    version: version ? { id: version.id, version: version.version, status: version.status, baseVersionId: version.base_version_id } : null,
    stages: stageRows.map(s => ({ key: s.stage_key, status: s.status })),
    tasks: taskRows.map(t => ({ id: t.id, stage: t.stage_key, name: t.name, role: t.agent_role, status: t.status, attempt: t.attempt })),
    bugs: bugRows.map(b => ({ id: b.id, title: b.title, severity: b.severity, status: b.status })),
    reviews: reviewRows.map(r => ({ id: r.id, artifactId: r.artifact_id, reviewer: r.reviewer, decision: r.decision })),
    pendingApprovals: pendingApprovals || [],
    recentMeetings: meetingRows.map(m => ({ id: m.id, subject: m.subject, status: m.status, trigger: m.trigger, decision: m.decision })),
  };
}

export function summarizeSnapshot(snapshot) {
  const count = (rows, key) => rows.reduce((acc, row) => { acc[row[key]] = (acc[row[key]] || 0) + 1; return acc; }, {});
  return {
    version: snapshot.version,
    stageCounts: count(snapshot.stages, "status"),
    taskCounts: count(snapshot.tasks, "status"),
    openBugs: snapshot.bugs.filter(b => b.status !== "closed" && b.status !== "wont-fix").length,
    approvalRequests: snapshot.pendingApprovals.length,
    pendingMeetings: (snapshot.recentMeetings || []).filter(m => m.status === "proposed").length,
  };
}
