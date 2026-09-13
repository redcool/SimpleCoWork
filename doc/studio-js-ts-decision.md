# Studio CoWork JavaScript / TypeScript 技术决策

## 决策

Studio CoWork v0.1.0.0 继续使用 Node.js ESM JavaScript，暂不迁移 TypeScript。

## JavaScript 当前优势

1. 与 CoWork v1 保持一致，迁移成本最低。
2. Node.js 原生 ESM 可直接运行，不需要编译和构建链。
3. 当前项目零运行时依赖，测试直接使用 node:test。
4. Agent 生成和修改 JavaScript 更直接，减少类型声明噪音。
5. CLI、Provider、文件系统、SQLite 适配代码可以快速迭代。
6. Studio v2 领域模型仍在快速探索，JavaScript 更适合频繁调整接口。
7. 无需维护 tsconfig、编译输出目录、source map 和类型发布流程。

## TypeScript 的优势

1. Version、Stage、Artifact、Approval、Bug 等领域模型可以获得更强的静态约束。
2. SQLite 行记录、状态枚举和跨模块 API 更容易发现字段错误。
3. 大量 Agent、适配器和开发者协作时，IDE 类型提示更好。
4. 重构公共 API 时更安全。
5. 长期维护和拆分 cowork-core/cowork-studio 时收益明显。

## 当前不迁移的原因

Studio v2 仍处于领域模型建立阶段，首先要验证 Version/Stage/Approval/Impact/Bug 的行为。现在迁移会同时引入业务重构和编译系统重构，增加排错范围。

## 迁移触发条件

满足以下任一条件后重新评估 TypeScript：

- Studio API 基本稳定；
- 核心模块超过约 20 个；
- 同时有多名开发者长期维护；
- cowork-core 与 cowork-studio 需要独立发布；
- JavaScript 状态字段错误开始明显拖慢开发。

## 过渡方案

当前 JavaScript 必须遵守：

- JSDoc 类型注释；
- 常量集合模拟枚举；
- 所有状态迁移集中定义；
- 数据库查询结果在边界处显式校验；
- node:test 覆盖状态机和公共 API；
- 禁止在模块之间传递未定义的自由对象而不做校验。

结论：**现在使用 JavaScript 是为了快速验证 Studio 领域模型，不是排斥 TypeScript。**
