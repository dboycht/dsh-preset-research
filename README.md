# dsh-preset-research —— Chrome信息检索模式

> 给 AI 信息检索竞赛用的 DSH 模式（agent preset）。
> agent 驱动一个**有头的真 Chrome**去题面指定的平台检索；
> 遇到**人机验证 / 登录 / 滑块**时**停下来用 `ask_user_question` 请你在浏览器窗口里接管**，
> 其余步骤自动完成。

---

## 1. 它到底做了什么

一个 bundle，往当前 profile 的 Loader 树里 `insert` 一条 **agent preset 声明**（`config.id = research`）。
这个模式的子插件清单 = **随附 `standard` 模式的原文** + 一条 **MCP 浏览器客户端**，另有两处刻意的改动：

| 改动 | 为什么 |
|---|---|
| `persona.suffix` 追加一份**检索作业规程**（人机验证交接 / 运行时自检 / 流程 / 证据纪律） | 这是"遇验证码就问人"这件事的**行为来源**；纯配置做不到，必须写进系统提示 |
| `tool-plugin-manager` 设为 `disabled: true` | 竞赛模式里不允许一边考试一边改 profile（沿用 `standard` 的取值） |
| 追加 `@deepseek-ai/dsh-mcp-client` 行（`serverName: browser`） | **本模式唯一的增量能力**：浏览器自动化 |

浏览器后端起 `@playwright/mcp@0.0.83`：

```
cmd /c npx -y @playwright/mcp@0.0.83 \
  --browser chrome \
  --user-data-dir %USERPROFILE%\.dsh\browser-profile-research \
  --output-dir    <你放置本包>\runtime \
  --output-max-size 16777216
```

> `--user-data-dir` 在配置里写成 `!!js` 表达式（从 `process.env.USERPROFILE` 推导），
> **所以开源包里不含任何用户名**；上面写成 `%USERPROFILE%` 只是为了读起来直观。

模型看到的工具名是 **`mcp__browser__*`**（例：`mcp__browser__browser_navigate`）。

### 1.1 站点经验库（本模式的"记忆"）

**目的**：同一个平台第二次遇到时**不再从零试错**；第一次遇到就**把经验记下来**。

| 组件 | 位置 | 作用 |
|---|---|---|
| **注入存根** | `D:\code\DeepSeekHarness\SITES.md` | **唯一被自动注入系统提示的文件**（靠 `agent-instructions` 的 `instructionFileCandidates`）。⚠️ **故意只留指针、不列平台清单** —— 因为它每轮都被**全文**注入 |
| 索引 | `…\dsh-preset-research\knowledge\INDEX.md` | 一行一个平台：域名 / 平台名 / 最后更新 / 手册路径。**按需读取** |
| 手册 | `…\dsh-preset-research\knowledge\sites\<域名>.md` | 每平台的作业手册：入口 URL、字段名、检索式、坑、实测记录。**读一个平台的就行** |
| 门禁 | `…\dsh-preset-research\check-sites.mjs` | **机械检查**：索引 ↔ 手册一一对应 + 手册必须有四个小节 + **注入存根仍在且指向索引**。agent 收工前必跑，exit 0 才算完 |

> ⚠️ **为什么索引不直接注入**（2026-10-14 重构）：原先索引写着 18 个平台的整张表、且被全文注入，
> 涨到 **14 KB**，等于**每轮请求白付几千 token**。现在注入的是 1.8 KB 的存根，
> 索引按需读。`validate.mjs` 里有一条**存根体积上限（4096 字节）**断言防它再胖回去。

**为什么要做成机制而不是"请记得写"**：只写一句"请记经验"的话，它迟早不做、而且**没人能发现它没做**。
这里用三条把它钉住：

1. **自动注入（存根）**：`SITES.md` 无条件进系统提示且体积受限 —— 不依赖 agent 主动去找，也不会越滚越大；
2. **机械门禁**：`check-sites.mjs` 双向校验索引与手册、并检查存根是否还在，缺一个就 exit 1（脚本自带漂移自测，确认它会红）；
3. **交付点名**：persona 要求 agent 在交付时说明"用的是哪条既有经验 / 新建了哪条"——
   **说不出来就等于没做**，用户据此一眼看穿。

手册的四个必需小节（门禁检查）：

```
## 入口       平台各功能的 URL / 入口路径，标注「已实测」或「待确认」
## 检索要点   字段名与语义、检索式写法、逻辑运算符、导出方式
## 坑与对策   踩过的坑与下次怎么办
## 实测记录   日期 / 做了什么 / 结论
```

⚠️ **手册只写"亲眼在页面上验证过"的事实；推断必须显式标「待确认」**，验证后改成「已实测（日期）」。

---

## 2. 为什么是这几个决定（都踩过点）

| 决定 | 依据 |
|---|---|
| **做成 preset，不是 profile 级插件** | 浏览器工具只该在这个模式出现：不污染 `standard`/`minimal`，也省工具 schema 的 token |
| **必须写在 `- insert:` 之下** | 非 insert 条目的语义是「按 id 覆盖已有行」；id 不存在时只打 `patch: entry "..." not found` 然后**静默跳过** —— 配置看着生效、实际什么都没挂 |
| **子插件清单照抄 `standard` 全文** | 模式声明的 `config` 是**整块替换**、没有增量合并 ⇒ 想吃掉 standard 的能力就得原样重述。代价：**不会**自动跟进上游未来更新 |
| **`--browser chrome` 而不是默认 chromium** | 本机已装 Chrome（`C:\Program Files\Google\Chrome\Application\chrome.exe`）⇒ 免掉 Playwright 自带浏览器的下载 |
| **`env: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`** | `@playwright/mcp` 依赖完整的 `playwright`，其 postinstall 会拉 ~150MB 自带浏览器 —— 用系统 Chrome 时纯属白等 |
| **`command: cmd` + `args: [/c, npx, ...]`** | ⚠️ Windows 上 Node 的 `spawn` **不能直接执行 `.cmd`/`.bat`** ⇒ 必须包一层 `cmd /c` |
| **不依赖 PATH 里的 node/npm** | DSH 运行时目录里**只有 `node.exe` + `pnpm`，没有 npm/npx**；`npx` 由 `cmd` 从系统 PATH 解析 |
| **`--user-data-dir` 固定绝对路径** | 持久 profile ⇒ 登录一次长期有效。⚠️ 参数文档明确：**同一持久 profile 同时只能有一个浏览器实例** |
| **`failOnStartupError: false`** | 浏览器起不来（断网 / npx 挂）时不让整个模式失效，降级到 `web_search`/`web_fetch`；再由 persona 里那条**运行时自检**把"工具不存在"显式报告给你，把静默失败变响 |
| **`toolCallTimeoutMs: 180000`** | 检索站点慢是常态（默认 60s 偏紧） |

---

## 3. 装

```
plugin_manager  action: install_bundle  target: <本目录绝对路径>
                 即 D:\code\DeepSeekHarness\PluginWork\dsh-preset-research
```

`install_bundle` 会自己完成包安装与 bundle 选择 —— **不要**手写 profile 的 `package.json` / `cordis.patch.yml`，
**不要**在 `$DSH_HOME` 下建包，**不要**在 profile 目录里跑 pnpm。

### 3.1 ⚠️ 装之前：这几行必须改成你自己的路径

本包有几处**写死的本机绝对路径**（发布时**刻意保留**成醒目的一行，便于一眼看到要改什么）。
**先改成你自己的路径再装**，否则浏览器产物会落到别人的目录、经验库也找不到：

| # | 位置 | 现在写的是 | 要改成 |
|---|---|---|---|
| 1 | **工作区根的注入存根** `SITES.md`（里面有 3 条路径） | `D:\code\DeepSeekHarness\PluginWork\dsh-preset-research\knowledge\` 等 | 你那份 `knowledge\` / `knowledge\sites\` / `check-sites.mjs` 的绝对路径 |
| 2 | `cordis.patch.yml` · persona「库的根目录是 …」 | 同上 | 你那份 `knowledge\` 的绝对路径 |
| 3 | `cordis.patch.yml` · persona 里那条门禁命令 | `node D:\code\...\check-sites.mjs` | 你那份 `check-sites.mjs` 的绝对路径 |
| 4 | `cordis.patch.yml` · MCP 的 `--output-dir` | `D:\code\...\dsh-preset-research\runtime` | 你那份 `runtime\` 的绝对路径 |
| 5 | `validate.mjs` · 存根的默认路径 | `D:/code/DeepSeekHarness/SITES.md` | 你的存根路径（也可用 `node validate.mjs <你的存根路径>` 覆盖，不改代码） |

> ✅ **不用改的**：
> - `--user-data-dir` —— 用 `!!js` 从 `%USERPROFILE%` 推导（`%USERPROFILE%\.dsh\browser-profile-research`），**不含任何用户名**；
> - `probe-mcp.mjs`、`check-sites.mjs`、`validate.mjs` 的**自身路径** —— 都用 `import.meta.dirname` 自我定位。

改完先自检（都不需要 DSH 在跑）：

```
node <你的路径>\validate.mjs      # 存根 / 索引 / 手册 / 路径形态 / 存根体积上限
node <你的路径>\check-sites.mjs   # 索引 ↔ 手册一一对应 + 手册四小节 + 存根在否
```

装完：
1. 确认行真的在：`Config.listConfigs(name='@deepseek-ai/dsh-agent-preset')` 里应出现 `preset-research`；
2. **开一个新会话**（已有会话保留它启动时的插件代际），在模式选择器里选 **「Chrome信息检索模式」**；
3. 客户端模式列表可能需要**刷新一次页面**才会出现新卡片。

---

## 4. 用

1. 选好模式，把题目整段贴进来（题目通常会写明平台与条件）。
2. agent 先解析题目 → 写检索式 → 用浏览器打开平台检索。
3. **一遇人机验证**：agent 立刻停手并弹 `ask_user_question` 告诉你"哪个页面、什么验证、要你做什么"；
   你在**那个 Chrome 窗口**里手动完成，然后回复它继续。
4. 交付时给：答案 + 平台与检索式 + 关键证据（页面标题 / URL / 截图）+ 不确定之处。

### 两个可调旋钮

| 旋钮 | 当前值 | 说明 |
|---|---|---|
| `--user-data-dir` | `!!js` 推导 ⇒ `%USERPROFILE%\.dsh\browser-profile-research` | Chrome 持久 profile，**登录态存这儿**。**不含用户名**；想换位置 / 并存多实例就改那个表达式里的目录名 |
| `--output-dir` | `<本包>\runtime` | 浏览器自动命名的截图等落盘处；agent 用 `read_image` 从这里取证。⚠️ 这个值**是写死的绝对路径**，换机器要改（见 §3.1） |
| `--output-max-size` | `16777216`（16 MiB） | **产物上限**：超过就由 Playwright 自己淘汰最旧的输出 —— 否则 `runtime\` 会无上限膨胀（实测涨到过 6.4 MB / 319 个文件） |

改这几处只要改本目录的 `cordis.patch.yml`（**配置行改动会热重载**）；改插件本体才需要重启 DSH。

---

## 5. 已知限制 / 排障

| 现象 | 原因与处置 |
|---|---|
| 模型工具表里**没有** `mcp__browser__*` | 浏览器没起来。先看 DSH 日志里 mcp 的报错；手动跑一遍第 1 节那条 `cmd /c npx …` 看是不是 npx / 网络问题。首次运行要下 `@playwright/mcp`（几 MB），**慢是正常的** |
| 报 **profile 被占用 / 浏览器起不来** | 持久 profile 一次只能一个实例。关掉残留的 Chrome（那个 profile 的），或另换 `--user-data-dir` |
| 平台点不动 / 元素找不到 | Playwright MCP 默认基于无障碍快照；个别页面需要 `--caps vision` 开坐标点击。加参数前先确认真的需要（会多一批工具、多耗 token） |
| ⚠️ **想接你日常在用的 Chrome（已有登录态）** | Chrome **136+ 禁止对默认 profile 开 `--remote-debugging-port`**。别去改默认 profile；正解是**这个专用 profile 登录一次**，或用 `real-browser-mcp` 那类走扩展的方案 |
| 页面需要**登录**而你没登录态 | 按规程 agent 同样会停下来问你。你在这个 Chrome 里登录一次，profile 会记住 |
| Python/Node 工具要装东西 | 本模式**没有** `plugin_manager`（刻意关掉），也不该在考试中改环境 |

---

## 6. 边界（务必知道）

- 本模式**不会**绕验证码、不做打码、**不冒用他人身份**（伪装 IP / 借用他人账号 / 冒充机构身份）。
  它做的是**把人叫过来**。
- ⚠️ **如实说明（2026-10-10 与用户确认的取舍）**：本模式启动的 Chrome 带着 Playwright 的
  **出厂默认**参数 `--disable-blink-features=AutomationControlled`，它会隐藏"这是自动化浏览器"的信号。
  那是 Playwright 自带的，**不是本模式加的**；而本模式**不在此之上再叠加任何反检测手段**
  （不装 stealth 插件、不改 UA / Canvas / WebGL 指纹、不做 IP 轮换）。
  **保留它的理由**：摘掉会明显降低对反爬站点的容错（可能提前被拦），代价大于收益；
  **所以改的是说法而不是行为** —— 文档与 persona 都改成准确表述，不留"绝不伪造指纹"这种不成立的保证。
- 浏览器是**独立的 Chrome 窗口**，不是 DSH 侧边栏里那个浏览器 tab。
  DSH 自带的侧边栏浏览器（`@deepseek-ai/dsh-client-ui-sidebar-browser`）**不注册任何工具、内容不进模型请求**
  —— 它是纯用户侧展示，agent 驱动不了，两者也不共享 cookie。
- `--allowed-origins` / `--blocked-origins` 官方明确说明**不是安全边界**，别当作隔离手段。

---

## 7. 维护

本目录三个脚本，都**自我定位**（`import.meta.dirname`），换机器不用改自身路径：

| 脚本 | 用途 | 用法 |
|---|---|---|
| `validate.mjs` | 装前静态校验：YAML / 字段 / 子插件 id 无重复 / MCP 行参数 / 路径形态 / **存根体积上限** / 经验库接线 | `node validate.mjs`（存根路径可用第 1 个参数覆盖） |
| `check-sites.mjs` | 经验库门禁：索引 ↔ 手册双向一致 + 手册四小节 + 注入存根在否；**自带漂移自测** | `node check-sites.mjs`（`--self-test` 只跑合成样例） |
| `probe-mcp.mjs` | 不经 DSH 直接对 MCP 服务器说协议，验证浏览器链路（会弹一个 Chrome 窗口） | `node probe-mcp.mjs [网址]`；**`--dry-run` 只打印推导出的路径、不弹浏览器** |

- ⚠️ **`runtime/` 目录本身要在仓库里**（用 `runtime/.gitkeep` 保住），因为预设的 `--output-dir` 指向它，
  目录不存在会让新 clone 的人第一次运行就失败；目录里的**产物**被 `.gitignore` 排除。
- 升 `@playwright/mcp` 版本前，先查它的 CLI 选项表有没有改名：
  `npm view @playwright/mcp readme` 里搜 `--browser` / `--user-data-dir` / `--output-max-size`。
