// CoWork 工作室模式演示（mock，离线可跑）
// 角色：制作人(producer) → 策划(game-designer) → 美术(artist) / 程序(programmer) → QA(qat)/艺术总监(artdirector) 审查 → 导演(director)汇报
// 亮点：自定义角色；评审者按产物匹配（accepts）；资产规则（min_size/json_valid/ifPresent）；
//       美术第一版不符合策划规格 → 会议裁决 → 重画通过（冲突解决闭环）
// 运行: node bin/cowork.js run examples/game-studio-demo
export default {
  project: {
    name: 'game-studio-demo',
    description: '工作室角色划分演示：做一个 2D 平台跳跃游戏（制作/策划/美术/程序/QA/艺术总监/导演）',
  },

  providers: {
    mock: {
      kind: 'mock',
      script: {
        // 制作人：定义愿景与验收口径
        producer: async () => ({
          summary: '确定愿景：2D 平台跳跃解谜游戏（低多边形田园风）',
          text: '目标受众：休闲玩家；核心玩法：跳跃+解谜；核心体验：轻快、可爱、无挫败感。',
          actions: [{
            type: 'write',
            path: 'vision.md',
            content: '# 游戏愿景：田园大冒险\n\n- 玩法：2D 平台跳跃解谜\n- 风格：低多边形田园风\n- 验收口径：程序可运行、美术资产齐备、操作流畅\n',
          }],
          knownIssues: [],
          done: true,
        }),

        // 策划：产出 GDD，定义资产规格（美术/程序必须遵守）
        'game-designer': async () => ({
          summary: '玩法设计完成：定义 hero 角色与背景资产规格',
          text: '玩家角色 hero（art/player.txt 描述其可玩性）、背景 art/bg.json（场景配置）、src/game.js（游戏入口）。',
          actions: [{
            type: 'write',
            path: 'gdd.md',
            content: '# GDD：田园大冒险\n\n- 玩家：hero（2D 角色，可跳、可跑）\n- 资产规格：art/player.txt 必须描述 hero 的可玩行为；art/bg.json 必须为合法 JSON 场景配置；src/game.js 为 CommonJS 入口。\n',
          }],
          knownIssues: [],
          done: true,
        }),

        // 美术：第一版故意不符合策划规格（触发质量门→会议→重画），第二版达标
        artist: async (ctx) => {
          const attempt = ctx.attempt ?? 1;
          const playerOk = attempt >= 2;
          return {
            summary: playerOk ? '按 GDD 规格重画 hero 资产' : '第一版 hero 资产（占位，缺少可玩性描述，演示用）',
            text: playerOk ? '已按策划规格补充 hero 行为描述。' : '占位资产待重画。',
            actions: [
              {
                type: 'write',
                path: 'art/player.txt',
                content: playerOk
                  ? 'hero: platformer hero sprite, can run and jump; themed low-poly pastoral\n'
                  : 'placeholder art asset\n',
              },
              { type: 'write', path: 'art/bg.json', content: '{"sky":"pastel","clouds":3,"hill":"green"}' },
            ],
            knownIssues: playerOk ? [] : ['ART1: hero 可玩性描述缺失（演示用）'],
            done: true,
          };
        },

        // 程序：实现游戏入口 + 用 exec 留下语法测试证据（outFile 留档）
        programmer: async (ctx) => ({
          summary: '实现游戏入口 game.js 并通过语法检查',
          text: 'CommonJS 入口，导出 start/stop；node --check 通过（证据写入 check.txt）。',
          actions: [
            {
              type: 'write',
              path: 'src/game.js',
              content: 'function start() { return "game running"; }\nfunction stop() { return "game stopped"; }\nmodule.exports = { start, stop };\n',
            },
            {
              type: 'exec',
              command: 'node --check src/game.js > check.txt 2>&1',
              outFile: 'check.txt',
              expectedExit: 0,
            },
          ],
          knownIssues: [],
          done: true,
        }),

        // QA 与艺术总监共用 reviewer 脚本：按质量门数据判定；art 资产给出艺术口径复核意见
        reviewer: async (ctx) => {
          const checks = ctx.gate?.checks ?? [];
          const artChecks = checks.filter((c) => String(c.file ?? '').startsWith('art/'));
          const highFail = checks.filter((c) => c.applicable !== false && c.severity === 'high' && !c.passed);
          if (highFail.length > 0) {
            return {
              summary: 'FAIL: 高严重性约束未满足',
              text: highFail.map((c) => `- [${c.ruleId}] ${c.detail}`).join('\n'),
              issues: highFail.map((c) => c.detail),
              actions: [],
              done: true,
            };
          }
          const note = artChecks.length > 0 ? '（艺术资产核验通过：规格/JSON/非空均达标，风格一致）' : '（技术核验通过：代码与测试证据齐备）';
          return { summary: 'PASS', text: '通过。' + note, issues: [], actions: [], done: true };
        },

        // 导演：汇报（叙事交给 report 的 manager 路径补齐）
        manager: async (ctx) => {
          if (ctx.task?.id === 't-report') {
            const lines = (ctx.inputs ?? []).map((a) => `- ${a.id}（${a.state}）— ${a.summary}`);
            return {
              summary: '项目汇报完成：全部模块通过质量门，游戏可交付演示。',
              text: `# 制作人汇报\n\n愿景：田园大冒险（2D 平台跳跃）\n\n产出：\n${lines.join('\n')}\n`,
              actions: [],
              knownIssues: [],
              done: true,
            };
          }
          return { summary: '协调者默认回应', text: '', actions: [], knownIssues: [], done: true };
        },

        // 会议决策（导演开会裁决创意冲突）
        decision: async (ctx) => ({
          summary: '会议裁决：美术按策划 GDD 资产规格重画 hero 资产',
          text: '艺术总监与 QA 复核一致：playable 描述缺失属高严重性规格违反；要求按 GDD 资产规格补充 hero 可玩性描述并重新提交。',
          actions: [{ taskId: ctx.task?.id, instruction: '按 GDD 资产规格重画 art/player.txt：必须描述 hero 的可玩行为（run/jump），并确保 art/bg.json 为合法 JSON 且非空。' }],
          knownIssues: [],
          done: true,
        }),
      },
    },
  },

  // 工作室角色：自定义角色自由命名；内置保留角色（reviewer/manager）承担审核与决策语义
  agents: [
    { id: 'producer', role: 'producer', title: '制作人', provider: 'mock', model: 'mock-producer', prompt: '你是游戏制作人：定义产品愿景、目标受众与验收口径。' },
    { id: 'designer', role: 'game-designer', title: '策划', provider: 'mock', model: 'mock-designer', prompt: '你是游戏策划：把愿景落成玩法设计（GDD）并定义资产规格，供美术与程序遵守。' },
    { id: 'artist', role: 'artist', title: '美术', provider: 'mock', model: 'mock-artist', prompt: '你是游戏美术：按策划资产规格制作游戏资产（角色描述/背景配置）。' },
    { id: 'programmer', role: 'programmer', title: '程序', provider: 'mock', model: 'mock-programmer', prompt: '你是游戏程序：按 GDD 实现游戏入口，并用命令留下测试证据。' },
    { id: 'qat', role: 'reviewer', title: 'QA', provider: 'mock', model: 'mock-qa', accepts: ['code'], prompt: '你是 QA：核验代码质量门（语法/导出/无遗留标记）与测试证据。' },
    { id: 'artdirector', role: 'reviewer', title: '艺术总监', provider: 'mock', model: 'mock-artdirector', accepts: ['art'], prompt: '你是艺术总监：按 GDD 资产规格审查美术资产，确保风格与规格一致。' },
    { id: 'director', role: 'manager', title: '导演', provider: 'mock', model: 'mock-director', prompt: '你是项目导演：主持创意冲突会议、裁决分歧并产出项目汇报。' },
  ],

  workflow: {
    tasks: [
      { id: 't-vision', name: '制作人愿景', agentId: 'producer', outputs: ['vision'], risk: 'low' },
      { id: 't-gdd', name: '玩法设计 GDD', agentId: 'designer', requires: ['t-vision'], inputs: ['vision'], outputs: ['gdd'], risk: 'low' },
      { id: 't-art', name: '美术资产', agentId: 'artist', requires: ['t-gdd'], inputs: ['gdd'], outputs: ['art'], risk: 'high' },
      { id: 't-code', name: '程序实现', agentId: 'programmer', requires: ['t-gdd'], inputs: ['gdd'], outputs: ['code'], risk: 'high' },
      { id: 't-report', name: '项目汇报', agentId: 'director', requires: ['t-art', 't-code'], inputs: ['vision', 'gdd', 'art', 'code'], outputs: ['report'], gate: false, risk: 'low' },
    ],
    // 工作室质量门：跨产物规则统一用 ifPresent —— 只对包含对应文件的产物生效，避免互相误判
    rules: [
      { id: 'CODE1', severity: 'high', type: 'contains', file: 'src/game.js', text: 'module.exports', ifPresent: true, description: '游戏入口必须导出 module.exports' },
      { id: 'CODE2', severity: 'medium', type: 'not_contains', file: 'src/game.js', text: 'TODO', ifPresent: true, description: '代码不得遗留 TODO' },
      { id: 'ART1', severity: 'high', type: 'contains', file: 'art/player.txt', text: 'hero', ifPresent: true, description: 'hero 资产必须描述核心角色' },
      { id: 'ART2', severity: 'high', type: 'json_valid', file: 'art/bg.json', ifPresent: true, description: '背景配置必须为合法 JSON' },
      { id: 'ART3', severity: 'medium', type: 'min_size', file: 'art/bg.json', min: 8, ifPresent: true, description: '背景配置非空（防空占位资产）' },
    ],
  },

  engine: {
    maxConcurrent: 2,       // t-art 与 t-code 并行
    maxReviewAttempts: 1,   // 第一次审查失败即开会（演示冲突会议）
    maxEscalations: 2,
    agentTimeoutMs: 60000,
    commandTimeoutMs: 60000,
    meeting: { autoDecide: true },
    nightShift: { enabled: false, timezone: 'Asia/Shanghai', ranges: [{ start: '22:00', end: '08:30' }] },
  },
};