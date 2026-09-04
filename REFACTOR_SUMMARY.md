# Ferjoo v1.0 重构交付摘要

## 已完成

### 1. 算法集中化
所有算法相关内容统一进入 `src/algorithms/`：

- 有限轴与先验配置
- 自然语言解析与归一化
- 翻倍时间数值预测
- 阶段/活性/安全规则
- 2,016 组合枚举器
- 2,016 组合完整预生成结果
- 审核队列构建器与预生成审核队列

公共调用只允许走 `src/algorithms/index.js`。Vue 组件进一步通过 `services/diagnosis.service.js` 调用，不接触算法内部文件。

### 2. 参考文献集中化
全部参考文献与证据资产统一进入 `src/references/`：

- 运行时 citation catalog
- 30 张证据卡 registry
- 食品安全证据
- 发酵证据
- 引用系统与 schema
- 历史审计文档

算法只通过 `src/references/index.js` 获取引用，不再在算法文件复制文献元数据。

### 3. Vue 3 重构
原始静态 `index.html + app.js + styles.css` 已替换为：

- Vue 3
- Vue Router
- Vite
- 组件化诊断表单与结果页
- 登录/注册页
- 设备历史页
- service/composable 分层

### 4. Supabase
已提供 `supabase/migrations/001_initial.sql`，包含：

- `profiles`
- U/A 角色
- `U26090001` 格式系统 ID 自动分配
- 并发安全月度序号计数器
- `devices`
- `device_measurements`
- 10 分钟 `bucket_start`
- 同设备同 10 分钟桶唯一约束
- RLS
- 用户/管理员数据隔离
- 设备 last_seen 自动更新
- 管理员角色提升的服务器端函数

### 5. 用户系统
浏览器端已接入 Supabase JS：

- 邮箱注册
- 邮箱密码登录
- 自动读取系统 ID / 权限
- 退出
- 设备绑定
- 历史数据读取
- 手工写入测试数据点

“不验证邮箱正确性”按“不验证邮箱所有权”实现：部署时关闭 Supabase Confirm email。Supabase 仍保留基本邮箱格式要求。

## 验收结果

- `npm test`：通过
- 原翻倍预测测试：12/12
- 原规则引擎测试：9/9
- 原诊断算法测试：24/24
- v0.4 回归测试：7/7
- 2,016 场景测试：8/8
- review queue：614 项 / 56 核心叙事类
- 架构边界测试：通过
- `npm run audit`：2,016 场景 / 56 类 / 0 异常
- Node JS 语法检查：24 个文件全部通过

## 尚需部署环境完成

本执行环境没有 `node_modules` 且不能联网下载 npm 依赖，因此没有执行 `vite build`。
在本机/CI 中运行：

```bash
npm install
npm test
npm run build
```

随后按 `supabase/README.md` 部署 SQL 并配置 `.env`。
