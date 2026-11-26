# 本地起始页规格

坐标都相对于各自画板左上角，单位是设计像素。精确数字和来源文件在 `local-spec.json`。

## 来源

两个导出目录里没有 CSV、JPG、WEBP。

| 文件 | 用途 |
| --- | --- |
| `独立站/独立站.svg` | 宽屏。画布 6480×6011，底色 `#1E1E1E` |
| `独立站 (1)/独立站.svg` | 窄屏。画布 1393×5760，底色 `#1E1E1E` |
| `独立站/EN / Home / 01 Device.png` 到 `05 Timing.png` | 宽屏轮播，5760×3600，是 1440×900 的 4 倍 |
| `独立站 (1)/Mobile / EN / Home · 375×812.png` 及 `-1` 到 `-4` | 窄屏轮播，1500×3248，是 375×812 的 4 倍 |

SVG 里的字已经转成路径，没有 `font-family`、`font-weight`、`font-size`。下面的宽高是字形外框，不是 CSS 字号。文案从 PNG 和按画板渲染的 SVG 转写。撇号写成 `'`，乘号写成 `×`。

目录名带空格，例如文件夹是 `EN `、` Home `，文件名是 ` 01 Device.png`。

## 颜色

| 色值 | 用在 |
| --- | --- |
| `#FFFAF5` | 轮播和 Contact 的屏底 |
| `#FFF9F3` | 只有宽屏 Stay updated 的屏底 |
| `#FF6F28` | 主橙：SourMate、副标题、Stay updated、聊天气泡、分页 |
| `#FF6B25` | 右侧导航、窄屏底部标题、大标题 Stay updated with Ferjoo |
| `#FFBF9F` / 30% | 轮播上的 Stay updated 胶囊 |
| `#FFB05A` | 只有宽屏 Stay updated 的提交按钮 |
| `#FFA24F` | Contact 提交按钮，以及窄屏 Stay updated 的提交按钮 |
| `#FFF1E7` | 输入框 |
| `#EADDD2` | 描边 |
| `#FFFFFF` | 表单卡片 |
| `#30251F` | 宽屏正文、宽屏表单标签和按钮字 |
| `#33211A` | 窄屏表单按钮字 |
| `#75665B` | 宽屏占位符和脚注 |
| `#755E52` | 窄屏标签、占位符和脚注 |

## 画板

一共 14 个屏幕。宽屏 7 个，窄屏 7 个。

宽屏画布右侧还有一条导航状态条（约 x=5434，1046×224，白底，五列 Data / Journal / Doctor / Timing）。那是选中态示意，不是页面。

PNG 里没有这四屏，它们只在 SVG 里：

- 宽屏 Stay updated
- 宽屏 Contact
- 窄屏 Stay updated
- 窄屏 Contact

Contact 画面上没有 “Contact” 这个词。

## 宽屏轮播（1440×900）

五屏共用左侧和导航。屏底 `#FFFAF5`。气泡图 `blob.png` 放在 (39, 44)，1362×851，水平翻转，透明度 0.12。

| 元素 | 位置与尺寸 | 颜色 |
| --- | --- | --- |
| Logo `logo-wordmark.png` | (85, 41) 94×36 | |
| 聊天气泡 | (1320, 46) 25×25 | `#FF6F28` |
| SourMate | (86, 370) 149×25 | `#FF6F28` |
| Understand your starter. | (88, 426) 374×32 | `#FF6F28` |
| 胶囊 | (85, 481) 215×56，圆角 28 | `#FFBF9F` / 30% |
| Stay updated | (116, 501) 132×20 | `#FF6F28` |
| 胶囊箭头 | (263, 503) 约 6×12，线宽 1.8 | `#FF6F28` |

右侧导航没有 “Device” 这个词。第一项是罐子图标 (1314, …) 13×17。当前项是实色，并在 x=1340 处有 11×4 的短横；其余标签透明度 0.5，圆点 5×5。标签从左到右对齐到短横附近：Data 宽 40，Journal 宽 61，Doctor 宽 57，Timing 宽 54。每一屏的纵向位置不同，见 JSON 的 `perSlideY`。

| 屏 | 画布原点 | PNG | 画面 | 底部一句 |
| --- | --- | --- | --- | --- |
| Device | (1642, 1127) | ` 01 Device.png` | `jar-device.png` (682, 98) 427×669，绕左上角转 5.16° | 无 |
| Data | (1642, 2123) | ` 02 Data.png` | 上升图 (780, 147) 353×286；温度图 (780, 472) 353×218；`jar-data.png` (595, 249) 257×388，转 −5.14°，透明度 0.8 | Know when your starter is rising, peaking and ready. 位置 (658, 728) 454×18，`#30251F` |
| Journal | (1642, 3119) | ` 03 Journal.png` | `journal-phone.png` (682, 158) 364×538，轻微前景模糊 1.65 | Look back on every day of your starter's journey. (650, 728) 426×18 |
| Doctor | (1642, 4115) | ` 04 Doctor.png` | `jar-doctor.png` (585, 187) 262×499；`doctor-card.png` (865, 348) 278×253 | Your sourdough starter's personal doctor. (683, 728) 361×18 |
| Timing | (1642, 5111) | ` 05 Timing.png` | `timing-dial.png` (608, 277) 345×345 圆裁切，阴影 (−4, 4) 模糊 7.5、黑色 10%；`jar-timing.png` (922, 268) 222×363，转 5.59° | See when your starter is expected to peak. (684, 731) 377×18 |

## 窄屏轮播（375×812）

屏底 `#FFFAF5`，内缩 0.5 的描边 `#EADDD2`，尺寸 374×811。气泡是 600×376 的图旋转 −90° 后大约落在 (6, 151)，376×600，透明度 0.15。

| 元素 | 位置与尺寸 | 颜色 |
| --- | --- | --- |
| Logo | (30, 30) 80×30 | |
| 聊天气泡 | (321, 35) 19×19 | `#FF6F28` |
| SourMate | (34, 136) 112×19 | `#FF6F28` |
| Understand your starter. | (35, 173) 280×24 | `#FF6F28` |
| 胶囊 | (33, 212) 161×42，圆角 21 | `#FFBF9F` / 30% |
| Stay updated | (54, 227) 99×15 | `#FF6F28` |
| 箭头 | (165.75, 228.5) 4.5×9，线宽 1.8 | `#FF6F28` |

底部分页：罐子图标 (164.4, 758.6) 6×8，四个半径 2.5 的点，圆心 x 为 179.5、189.5、199.5、209.5，y 都是 762.5，颜色 `#FF6F28`。Device 屏四个点都是 50% 透明，罐子是实色。Data、Journal、Doctor、Timing 依次点亮第 1 到第 4 个点。

PNG 对应：`375×812.png` Device，`-1` Data，`-2` Journal，`-3` Doctor，`-4` Timing。画布 x 都是 473，y 依次是 1092、2056、3020、3984、4948。

Device 没有底部标题。其余四屏在 y≈646 有橙色标题 Data / Journal / Doctor / Timing，下面两行说明，外框高 26，颜色 `#30251F`。说明句子和宽屏相同。

插画：

- Device：`jar-device.png` (83, 306) 244×382，转 5.16°
- Data：上升图 (148, 327) 182×148；温度图 (148, 495) 182×113；`jar-data.png` (26, 374) 142×214，转 −5.14°，透明度 0.8
- Journal：手机 (89, 317) 196×290，模糊 1.65
- Doctor：罐子 (48, 349) 134×257；卡片 (155, 416) 171×155，圆角 12，阴影 (4, 4) 模糊 5、黑色 10%
- Timing：表盘 (44, 357) 209×209 圆裁切，阴影 (−4, 4) 模糊 7.5；罐子 (218, 389) 126×206，转 5.59°

## Stay updated

宽屏在画布 (0, 0)，屏底 `#FFF9F3`。窄屏在画布 (0, 0)。两套文案不一样。

宽屏：

- ‹ Back to home，(86, 148) 122×12，`#FF6B25`
- 左卡片 (179, 318) 520×264，白，圆角 24，阴影向下 8、模糊 12、`#30251F` 7%
- Email address；(220, 384) 439×57 输入框，圆角 17.5，`#FFF1E7`；占位 name@example.com，`#75665B`
- 按钮 (219, 466) 440×58，圆角 29，`#FFB05A`；字 Keep me posted，`#30251F`
- 脚注 Only Ferjoo product updates and beta invitations. No spam.
- 右侧标题 Stay updated with Ferjoo，(849, 391) 443×36，`#FF6B25`
- 副标题两行：Product news and beta invitations, / delivered straight to your inbox. 外框 (848, 463) 301×48，`#FF6F28`
- 气泡 (720, 76) 681×851，透明度 0.18

窄屏：

- ‹ Back to home，(25, 139)，`#FF6F28`
- 标题 Stay updated with Ferjoo，(43, 215) 248×20，`#FF6B25`
- 副标题同上两句，外框 (43, 254) 234×36，`#FF6F28`
- 卡片 (20.5, 351.5) 334×211，圆角 23.5，白，描边 `#EADDD2`
- 占位 you@example.com
- 按钮字是 Keep me updated，不是 Keep me posted。按钮 (42, 470) 291×52，圆角 26，`#FFA24F`，字 `#33211A`
- 脚注 Only occasional product updates. Unsubscribe anytime.
- 标签、占位、脚注都是 `#755E52`

## Contact

宽屏画布原点 (3326, 0)，窄屏 (1018, 0)。都没有大标题。

宽屏卡片 (336, 152) 768×596，圆角 24。三个输入框都在 x=374、宽 691、圆角 17.5、填充 `#FFF1E7`：

| 标签 | 占位 | 输入框 y / 高 |
| --- | --- | --- |
| Email address | name@example.com | 226 / 57 |
| Name | Your name | 342 / 57 |
| Message | Tell us about your question or idea... | 458 / 154 |

按钮 (374, 632) 692×58，圆角 29，`#FFA24F`，字 Send message。脚注 The Ferjoo team will reply to your email. 返回链接是 `#FF6F28`。标签 `#30251F`，占位和脚注 `#75665B`。

窄屏卡片 (20.5, 178.5) 334×454。输入框 x=42.5、宽 290、描边 `#EADDD2`：

| 标签 | 占位 | y / 高 |
| --- | --- | --- |
| Email address | you@example.com | 225.5 / 45 |
| Name | Your name | 313.5 / 45 |
| Message | How can we help? | 401.5 / 111 |

按钮字仍是 Send message，颜色 `#33211A`，按钮 `#FFA24F`。脚注 We'll get back to you as soon as we can. 标签、占位、脚注 `#755E52`。

## 插画里的字

这些字在图片里，不是页面路径。

- `chart-rise.png`：Starter Rise，Peak 2.63×，13:26 1.00×，Max 2.63×，Min 0.95×，13:26 – 00:24
- `chart-temperature.png`：Temperature，Avg. 27.2°C，21:25 29.4°C，Max 33.0°C，min 22.2°C，13:26 – 00:24
- `doctor-card.png`：Recommendations；Log when your starter peaks and falls to establish a baseline.；Bake with a starter that rises consistently across feedings.；Why it matters；A strong rise suggests good activity. Check the full curve, appearance, and smell together.；Feeding ratio 1 : 2 : 2；Target temperature 24–26°C
- `timing-dial.png`：TIME TO PEAK，02:35:00，Est. peak at 18:40
- `journal-phone.png`：状态栏 3:37；Journal；November 2026；November 12；0 feedings；Starter Doctor；Fed Nov 11 at 13:26；Auto-ended；Details；Feeding ratio 1:1:1 · Fermented for 11 h；1.12× Peak rise；33°C Avg. temperature；100% Avg. humidity；View daily data

## 素材

都在 `.design-extract/local-assets/`，从宽屏 SVG 的内嵌图抽出。窄屏 SVG 里是同一批字节。

| 文件 | 像素 | 内嵌编号 |
| --- | --- | --- |
| `blob.png` | 1586×992 | image0 |
| `logo-wordmark.png` | 908×348 | image1 |
| `jar-device.png` | 539×843 | image2 |
| `chart-rise.png` | 542×440 | image3 |
| `chart-temperature.png` | 542×334 | image4 |
| `jar-data.png` | 665×1006 | image5 |
| `journal-phone.png` | 877×1297 | image6 |
| `jar-doctor.png` | 575×1096 | image7 |
| `doctor-card.png` | 563×512 | image8 |
| `timing-dial.png` | 1254×1254 | image9 |
| `jar-timing.png` | 653×1073 | image10 |

`EN / Home /05 / Timing /image 6.png`（375×375）和 `Mobile / EN /image 6.png`（239×239）是表盘的圆形裁切，边缘有杂点。干净原图用 `timing-dial.png`。没有把 `src/assets/welcome/_preview-*` 当作产品图。
