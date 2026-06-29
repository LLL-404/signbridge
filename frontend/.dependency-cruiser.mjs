/**
 * @file .dependency-cruiser.mjs
 * @description 代码知识图谱 —— 依赖规则与可视化配置
 *
 * 微内核分层约束（自底向上）：
 *   types/      纯类型层，最底层，不依赖任何业务
 *   kernel/     微内核，不依赖具体实现（modules/pages/components/plugins/stores）
 *   modules/    业务模块，不依赖 UI 层（pages/components）
 *   stores/     状态层，可依赖 types/kernel/modules
 *   components/ UI 组件，不依赖 pages
 *   plugins/    插件注册，依赖 kernel/pages（合理）
 *   pages/      页面，顶层消费者
 *
 * 运行：
 *   npx depcruise src --config      # 按规则校验
 *   npm run graph                   # 生成依赖图 SVG
 *   npm run graph:archi             # 生成架构分层图
 */
export default {
  forbidden: [
    // 1. 禁止循环依赖
    {
      name: 'no-circular',
      severity: 'error',
      comment: '循环依赖会导致模块初始化顺序问题，必须拆解',
      from: {},
      to: { circular: true },
    },

    // 2. 内核隔离：kernel 不得依赖具体实现层
    {
      name: 'kernel-isolation',
      severity: 'error',
      comment: '微内核必须保持纯净，不能反向依赖 modules/pages/components/plugins/stores',
      from: { path: '^src/kernel/' },
      to: { path: '^src/(modules|pages|components|plugins|stores|hooks)/' },
    },

    // 3. 类型层隔离：types 不得依赖业务模块
    {
      name: 'types-isolation',
      severity: 'error',
      comment: '类型定义是最底层契约，不能依赖业务实现',
      from: { path: '^src/types/' },
      to: { path: '^src/(modules|pages|components|plugins|stores|kernel|hooks)/' },
    },

    // 4. 业务模块不依赖 UI 层
    {
      name: 'modules-no-ui',
      severity: 'error',
      comment: 'modules 是纯业务逻辑层，不应依赖 pages/components',
      from: { path: '^src/modules/' },
      to: { path: '^src/(pages|components)/' },
    },

    // 5. UI 组件不依赖页面
    {
      name: 'components-no-pages',
      severity: 'error',
      comment: '组件层不应反向依赖页面层',
      from: { path: '^src/components/' },
      to: { path: '^src/pages/' },
    },

    // 6. 禁止 orphan（无人引用的孤立模块，可能是死代码）
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: '孤立模块无人引用，可能是死代码或遗漏导出',
      from: {
        orphan: true,
        path: '^src/',
      },
      to: {},
    },
  ],

  options: {
    // 解析 TS 预编译依赖（type imports、.ts 扩展）
    tsPreCompilationDeps: true,
    // 通过 tsConfig 解析 @/ 别名
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      exportsFields: ['exports'],
    },
    // 排除动态 import 与 node_modules
    exclude: { dynamic: true },
    doNotFollow: { path: 'node_modules' },
  },
}
