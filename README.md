# 酵种医生 · Dr. Ferjoo

“让每一次发酵，都有迹可循。”

## 快速开始

直接打开 `index.html` 即可使用。

也可以在本目录起一个静态服务：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

## 目录结构

```
.
├── index.html                 # 页面入口，直接打开即可使用
├── app.js                     # 前端交互与渲染逻辑
├── styles.css                 # 样式
├── starter-doctor.browser.js  # 核心诊断规则引擎（浏览器/Node 共用）
├── starter-doctor.js          # Node 适配入口
├── assets/                    # 图标与品牌资源
├── research/                  # 证据、引用与场景模型
├── scripts/                   # 场景枚举与审核队列生成脚本
├── tests/                     # 诊断算法、规则引擎与 UI 回归测试
└── reports/                   # 生成的场景与审核队列数据
```

## 测试

项目不依赖第三方测试库，Node.js 18 及以上即可运行：

```bash
npm test          # 运行全部诊断算法、规则引擎、场景遍历与 UI 回归测试
npm run audit     # 对全部 2,016 个输入组合做结构自检
```

`tests/diagnosis-algorithms.test.js` 系统覆盖归一化、自然语言解析、污染检测、pH 分层、预期翻倍时间、阶段覆盖、成熟期活性判断、时间与温度上下文、证据追踪与格式化。
