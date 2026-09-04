# 从 v0.5 静态项目迁移到 v1.0

1. 原 `starter-doctor.browser.js` 被拆成 `src/algorithms/` 中职责明确的模块。
2. 原 `scripts/` 与 `reports/` 不再散落：枚举器、审核器和 2,016 组合结果全部归入算法目录。
3. 原 `research/` 整体迁入 `src/references/`，运行时引用元数据也从算法文件中移出。
4. 原 `index.html + app.js + styles.css` 改为 Vue 3 + Vue Router + Vite。
5. 新增 Supabase：
   - 邮箱/密码注册和登录
   - 自动系统用户 ID
   - U/A 权限字段
   - 设备绑定
   - 10 分钟历史数据
   - RLS 隔离
6. 原诊断算法行为由迁移后的 Node 回归测试继续覆盖，2,016 组合枚举仍要求零结构异常。

运行：

```bash
npm install
npm test
npm run audit
npm run dev
```
