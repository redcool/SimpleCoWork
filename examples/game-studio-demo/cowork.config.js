// CoWork 工作室模式演示（mock，离线可跑）——v2：同角色多 agent 团队协作
// 角色：制作人(producer) → 策划团队(资深+数值) → 美术/程序/叙事/音频 → QA/艺术总监分级审查 → 导演汇报
// 亮点：
//  1) task.team：策划团队 2 人并行产出方案 → 相互评审(评分/互选/改进) → 择优 → 胜出者整合为最终 GDD（讨论找最优解）
//  2) 自定义角色：producer/game-designer/artist/programmer/writer/audio
//  3) 评审者按产物匹配：accepts 精确分流（art→艺术总监，code→QA；其余通用兜底）
//  4) 资产规则：file_magic/image_dimensions（图片文件头与真实尺寸）/ json_valid / min_size / ifPresent 跨产物
//  5) 创意冲突闭环：美术 v1 不符合策划规格 → 质量门拦截 → 会议裁决 → 重画 v2 通过
// 运行: node bin/cowork.js run examples/game-studio-demo
export default {
  project: {
    name: 'game-studio-demo',
    description: '工作室 v2：策划团队讨论择优 + 美术/程序/叙事/音频 + 分级审查（做一个 2D 平台跳跃游戏）',
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
            content: '# 游戏愿景：田园大冒险\n\n- 玩法：2D 平台跳跃解谜\n- 风格：低多边形田园风\n- 验收口径：程序可运行、美术资产齐备、叙事与音频可演示\n',
          }],
          knownIssues: [],
          done: true,
        }),

        // 策划团队（2 人）：R1 各自方案 → R2 互评（senior 胜出）→ R3 胜出者融合数值曲线成最终 GDD
        'game-designer': async (ctx) => {
          const member = ctx.member;
          if (ctx.mode === 'team-produce') {
            if (member === 'designer-senior') {
              return {
                summary: '资深策划：完整玩法设计（hero 行为+关卡节奏）',
                text: '方案A（资深策划）：GDD 聚焦核心玩法——hero 可跑可跳、跳跃解谜、关卡节奏与教学曲线；建议数值由数值策划补充。',
                actions: [],
                knownIssues: ['缺少数值曲线（拟由互评补齐）'],
                done: true,
              };
            }
            return {
              summary: '数值策划：数值曲线与成长体系（hero 手感数值）',
              text: '方案B（数值策划）：聚焦 hero 手感数值——跳跃高度/滞空时长/移动加速度的数值曲线，但玩法结构描述较薄。',
              actions: [],
              knownIssues: ['玩法结构描述较薄（拟由互评补齐）'],
              done: true,
            };
          }
          if (ctx.mode === 'team-judge') {
            // 双方一致认为：方案A 结构更完整，方案B 补数值 → 胜出 senior，并注入改进意见
            return {
              summary: '评审小结：方案A 胜出，需融入方案B 的数值曲线',
              text: '方案A 玩法结构完整、受众匹配；方案B 数值曲线专业但结构薄。建议：以方案A 为基座，融合方案B 的 hero 手感数值。',
              scores: { 'designer-senior': 92, 'designer-numeric': 78 },
              pick: 'designer-senior',
              score: 92,
              notes: '融合数值策划的跳跃高度/加速度曲线，使可玩性 параметры 可调。',
              done: true,
            };
          }
          if (ctx.mode === 'team-finalize') {
            return {
              summary: '最终 GDD：玩法结构 + hero 手感数值（团队讨论产出）',
              text: '融合方案A 的玩法结构与方案B 的数值曲线，团队互评改进意见已纳入。',
              actions: [{
                type: 'write',
                path: 'gdd.md',
                content: '# GDD：田园大冒险（团队讨论版）\n\n- 玩家：hero（2D 角色，可跑可跳、跳跃解谜）\n- 手感数值：跳跃高度 3m、滞空 0.6s、移动加速度 12m/s²（数值曲线可调）\n- 资产规格：art/player.txt 必须描述 hero 可玩行为；art/hero.png 必须为真实 PNG 且 ≥ 32×32；src/game.js 为 CommonJS 入口。\n',
              }],
              knownIssues: [],
              done: true,
            };
          }
          // 非团队模式（单发）：写 GDD
          return {
            summary: 'GDD 完成',
            text: '',
            actions: [{ type: 'write', path: 'gdd.md', content: '# GDD\n- hero：可跑可跳\n- 契约：hero 可玩行为\n' }],
            knownIssues: [],
            done: true,
          };
        },

        // 美术：第一版故意不符合策划规格（触发质量门→会议→重画），第二版达标
        artist: async (ctx) => {
          const attempt = ctx.attempt ?? 1;
          const ok = attempt >= 2;
          // 构造 48×48 的 PNG 文件头（PNG 签名 + IHDR 长度/类型 + 宽高）
          const pngHeader = () => {
            const ihdr = Buffer.alloc(13);
            ihdr.writeUInt32BE(48, 0); // width
            ihdr.writeUInt32BE(48, 4); // height
            const chunk = Buffer.concat([
              Buffer.from([0x00, 0x00, 0x00, 0x0d]),
              Buffer.from('IHDR', 'ascii'),
              ihdr,
            ]);
            return Buffer.concat([
              Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
              chunk,
              Buffer.from('DEMO_IMAGE_BODY', 'ascii'),
            ]).toString('binary');
          };
          return {
            summary: ok ? '按 GDD 规格重画 hero 资产（PNG + 行为描述）' : '第一版 hero 资产（占位，缺少可玩性描述，演示用）',
            text: ok ? '已按策划规格补充 hero 行为描述，并提交真实 PNG（48×48）。' : '占位资产待重画。',
            actions: [
              { type: 'write', path: 'art/player.txt', content: ok ? 'hero: platformer hero sprite, can run and jump; low-poly pastoral\n' : 'placeholder art asset\n' },
              { type: 'write', path: 'art/hero.png', content: pngHeader(), encoding: 'latin1' },
              { type: 'write', path: 'art/bg.json', content: '{"sky":"pastel","clouds":3,"hill":"green"}' },
            ],
            knownIssues: ok ? [] : ['ART1: hero 可玩性描述缺失（演示用）'],
            done: true,
          };
        },

        // 程序：实现游戏入口 + 用 exec 留下语法测试证据（outFile 回读留档）
        programmer: async () => ({
          summary: '实现游戏入口 game.js 并通过语法检查',
          text: 'CommonJS 入口，导出 start/stop；node --check 通过（证据写入 check.txt）。',
          actions: [
            {
              type: 'write',
              path: 'src/game.js',
              content: 'function start() { return "game running"; }\nfunction stop() { return "game stopped"; }\nmodule.exports = { start, stop };\n',
            },
            { type: 'exec', command: 'node --check src/game.js > check.txt 2>&1', outFile: 'check.txt', expectedExit: 0 },
          ],
          knownIssues: [],
          done: true,
        }),

        // 叙事：剧本文本
        writer: async () => ({
          summary: '叙事完成：田园大冒险三幕梗概',
          text: '主角 hero 为守护田园展开跳跃冒险，boss 战与解谜穿插。',
          actions: [{ type: 'write', path: 'story.md', content: '# 叙事梗概\n- hero 的田园守护之旅（三幕）：苏醒→解谜闯关→击败稻草魔\n' }],
          knownIssues: [],
          done: true,
        }),

        // 音频：音效清单文本资产
        audio: async () => ({
          summary: '音频资产清单完成：跳跃/背景/碰撞音效',
          text: '提供音效描述清单供合成阶段使用。',
          actions: [{ type: 'write', path: 'audio/sfx.txt', content: 'jump: 轻快短音, 0.2s; bgm: 田园钢琴 loop; hit: 柔和碰撞\n' }],
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
          const note = artChecks.length > 0
            ? '（艺术资产核验通过：魔数/尺寸/JSON/非空均达标，风格一致）'
            : '（技术核验通过：代码、测试证据与文档齐备）';
          return { summary: 'PASS', text: '通过。' + note, issues: [], actions: [], done: true };
        },

        // 导演：汇报（叙事交给 report 的 manager 路径补齐）
        manager: async (ctx) => {
          if (ctx.task?.id === 't-report') {
            const lines = (ctx.inputs ?? []).map((a) => `- ${a.id}（${a.state}）— ${a.summary}`);
            return {
              summary: '项目汇报完成：团队协作产出全部通过质量门，游戏可交付演示。',
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
          actions: [{ taskId: ctx.task?.id, instruction: '按 GDD 资产规格重画 art/player.txt：必须描述 hero 的可玩行为（run/jump），并确保 art/hero.png 为真实 PNG、art/bg.json 为合法 JSON 且非空。' }],
          knownIssues: [],
          done: true,
        }),
      },
    },
  },

  // 工作室角色：自定义角色自由命名；同角色可多实例（策划团队 2 人）；内置保留角色承担审核与决策语义
  agents: [
    { id: 'producer', role: 'producer', title: '制作人', provider: 'mock', model: 'mock-producer', prompt: '你是游戏制作人：定义产品愿景、目标受众与验收口径。' },
    { id: 'designer-senior', role: 'game-designer', title: '资深策划', provider: 'mock', model: 'mock-designer', prompt: '你是资深游戏策划：把愿景落成玩法结构（GDD），定义资产规格供全组遵守。' },
    { id: 'designer-numeric', role: 'game-designer', title: '数值策划', provider: 'mock', model: 'mock-designer', prompt: '你是数值策划：负责手感数值/成长曲线，并补充到策划团队方案中。' },
    { id: 'artist', role: 'artist', title: '美术', provider: 'mock', model: 'mock-artist', prompt: '你是游戏美术：按策划资产规格制作游戏资产（角色描述/真实 PNG/背景配置）。' },
    { id: 'programmer', role: 'programmer', title: '程序', provider: 'mock', model: 'mock-programmer', prompt: '你是游戏程序：按 GDD 实现游戏入口，并用命令留下测试证据。' },
    { id: 'writer', role: 'writer', title: '叙事', provider: 'mock', model: 'mock-writer', prompt: '你是叙事设计师：编写游戏剧情梗概与角色设定。' },
    { id: 'audio', role: 'audio', title: '音频', provider: 'mock', model: 'mock-audio', prompt: '你是音频设计师：产出音效/音乐资产清单。' },
    { id: 'qat', role: 'reviewer', title: 'QA', provider: 'mock', model: 'mock-qa', accepts: ['code'], prompt: '你是 QA：核验代码质量门（语法/导出/无遗留标记）与测试证据。' },
    { id: 'artdirector', role: 'reviewer', title: '艺术总监', provider: 'mock', model: 'mock-artdirector', accepts: ['art'], prompt: '你是艺术总监：按 GDD 资产规格审查美术资产，确保风格与规格一致。' },
    { id: 'director', role: 'manager', title: '导演', provider: 'mock', model: 'mock-director', prompt: '你是项目导演：主持创意冲突会议、裁决分歧并产出项目汇报。' },
  ],

  workflow: {
    tasks: [
      { id: 't-vision', name: '制作人愿景', agentId: 'producer', outputs: ['vision'], risk: 'low' },
      // 策划团队任务：2 名策划并行方案 → 互评择优 → 整合（讨论找最优解）
      { id: 't-gdd', name: '玩法设计 GDD（策划团队）', team: ['designer-senior', 'designer-numeric'], requires: ['t-vision'], inputs: ['vision'], outputs: ['gdd'], risk: 'high' },
      { id: 't-art', name: '美术资产', agentId: 'artist', requires: ['t-gdd'], inputs: ['gdd'], outputs: ['art'], risk: 'high' },
      { id: 't-code', name: '程序实现', agentId: 'programmer', requires: ['t-gdd'], inputs: ['gdd'], outputs: ['code'], risk: 'high' },
      { id: 't-story', name: '叙事脚本', agentId: 'writer', requires: ['t-gdd'], inputs: ['gdd'], outputs: ['story'], risk: 'low' },
      { id: 't-audio', name: '音频资产', agentId: 'audio', requires: ['t-gdd'], inputs: ['gdd'], outputs: ['audio'], risk: 'low' },
      { id: 't-report', name: '项目汇报', agentId: 'director', requires: ['t-art', 't-code', 't-story', 't-audio'], inputs: ['vision', 'gdd', 'art', 'code', 'story', 'audio'], outputs: ['report'], gate: false, risk: 'low' },
    ],
    // 工作室质量门：跨产物规则统一用 ifPresent —— 只对包含对应文件的产物生效，避免互相误判
    rules: [
      { id: 'GD1', severity: 'high', type: 'contains', file: 'gdd.md', text: 'hero', ifPresent: true, description: 'GDD 必须定义核心角色 hero' },
      { id: 'CODE1', severity: 'high', type: 'contains', file: 'src/game.js', text: 'module.exports', ifPresent: true, description: '游戏入口必须导出 module.exports' },
      { id: 'CODE2', severity: 'medium', type: 'not_contains', file: 'src/game.js', text: 'TODO', ifPresent: true, description: '代码不得遗留 TODO' },
      { id: 'ART1', severity: 'high', type: 'contains', file: 'art/player.txt', text: 'hero', ifPresent: true, description: 'hero 资产必须描述核心角色' },
      { id: 'ART2', severity: 'high', type: 'file_magic', file: 'art/hero.png', mime: 'png', ifPresent: true, description: 'hero 图必须是真实 PNG（文件头魔数）' },
      { id: 'ART3', severity: 'high', type: 'image_dimensions', file: 'art/hero.png', format: 'png', minWidth: 32, minHeight: 32, ifPresent: true, description: 'hero 图不小于 32×32' },
      { id: 'ART4', severity: 'high', type: 'json_valid', file: 'art/bg.json', ifPresent: true, description: '背景配置必须为合法 JSON' },
      { id: 'ART5', severity: 'medium', type: 'min_size', file: 'art/bg.json', min: 8, ifPresent: true, description: '背景配置非空（防空占位资产）' },
      { id: 'ST1', severity: 'medium', type: 'file_exists', file: 'story.md', ifPresent: true, description: '叙事脚本必须存在' },
      { id: 'AU1', severity: 'medium', type: 'file_exists', file: 'audio/sfx.txt', ifPresent: true, description: '音频资产清单必须存在' },
    ],
  },

  engine: {
    maxConcurrent: 3,       // t-art / t-code / t-story / t-audio 并行
    maxReviewAttempts: 1,   // 第一次审查失败即开会（演示冲突会议）
    maxEscalations: 2,
    agentTimeoutMs: 60000,
    commandTimeoutMs: 60000,
    meeting: { autoDecide: true },
    nightShift: { enabled: false, timezone: 'Asia/Shanghai', ranges: [{ start: '22:00', end: '08:30' }] },
  },
};