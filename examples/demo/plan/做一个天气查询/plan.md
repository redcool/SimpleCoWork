# 协作计划：做一个天气查询

> 生成时间：2026-09-10T09:33:11.728Z；由 architect 规划。

## 规划摘要

围绕「示例主题」拆解为核心与界面两个模块，核心先行。

## 模块拆解

| 任务 | 模块 | 角色 | 依赖 | 输出产物 | 验收要点 |
|---|---|---|---|---|---|
| m-core | 核心模块 | dev | — | core | contains:src/core.js；核心文件必须存在 |
| m-ui | 界面模块 | dev | m-core | ui | contains:src/ui.js |

## 架构规则（跨模块一致性 / Oracle 校验）

- [high] G1 （TODO）核心产物不得遗留 TODO

## 执行

- 运行：node bin/cowork.js run <项目目录> --plan=plan/做一个天气查询.json
- 全部模块通过质量门后视为完成；未通过自动重试/会议，人工可在 Web 面板审批。
