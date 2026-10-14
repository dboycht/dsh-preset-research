# 更新日志

## 1.0.2 — 2026-10-14

**站点经验库插件化** —— 本模式把经验库交接给独立插件 **`dsh-site-experience`**。

> ⚠️ **本版本依赖插件**：装完本 preset 还必须装
> [`dsh-site-experience`](https://github.com/dboycht/dsh-site-experience)（`plugin_manager`
> `action: install_bundle`，target = 插件目录）。没有它，模式仍能跑浏览器检索，
> 但**站点经验库不可用**（persona 会要求 agent 如实说明这一点，而不是假装用过经验）。

### 变更

- **删除**本包里的 `knowledge/`（索引 + 18 份平台手册）与 `check-sites.mjs` —— 库与门禁**唯一来源**
  改为 `dsh-site-experience` 插件，避免两份互相漂移。
- **删除**工作区根的注入存根 `SITES.md`，并把 `agent-instructions` 的
  `instructionFileCandidates` 恢复为 `AGENTS.md, CLAUDE.md`（**不再注入 `SITES.md`**）。
  ⇒ 原先整张平台表进系统提示的开销**归零**（插件改用一段提示词讲"库在哪 + 四条硬要求"）。
- persona §零 压成一句指针，并保留兜底：**插件不可用时要如实说"不可用"**。
- `validate.mjs` 的 `[5]` 段改为守新架构：**不许再有 `SITES.md` 候选、不许再自带 `knowledge/`、
  persona 必须指向插件**，并核对插件目录、它的库与门禁都在。
- 随附文档同步（README §1.1 标注旧方案已被取代；DEVELOPMENT 目录地图重画）。

### 安装顺序

1. 先装插件 `dsh-site-experience`；
2. 再装本 preset（`plugin_manager action: install_bundle`）；
3. 重启 DSH，在新会话的模式选择器里选 **「Chrome信息检索模式」**。

---

## 1.0.1 — 2026-10-14

首个开源版本。给 DeepSeek Harness 提供一个 **Chrome信息检索模式**（agent preset，模式 id `research`）。

### 浏览器自动化

- 经 `@deepseek-ai/dsh-mcp-client` 挂 `@playwright/mcp`，驱动**本机已装的真 Chrome**（有头 + 持久 profile）。
- Windows 上以 `cmd /c npx …` 启动（Node 的 `spawn` 不能直接执行 `.cmd`）。
- `--browser chrome`：用系统 Chrome，**免掉 Playwright 自带浏览器那 ~150 MB 下载**；
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 掐掉它的 postinstall 下载。
- `--output-max-size`：给产物目录设上限，**由 Playwright 自己淘汰最旧的输出**（不靠人定期清）。
- `--user-data-dir` 用 `!!js` 从 `%USERPROFILE%` 推导 ⇒ **配置里不含任何用户名**。

### 人机验证交回用户

遇到验证码 / 滑块 / 点选图块 / 短信验证 / 登录墙时**立即停手**，用 `ask_user_question`
说清"哪个页面、什么验证、需要你做什么"，用户处理完再继续。**不做打码、不伪造身份、不做 IP 轮换。**

### 站点经验库（本模式与"通用浏览器"的核心差异）

- `knowledge/INDEX.md` —— 索引（一行一个平台）；`knowledge/sites/<域名>.md` —— 各平台作业手册。
- 工作区根的 `SITES.md` 是**只含指针的注入存根**（约 1.8 KB）—— 它每轮都被**全文注入**系统提示，
  所以体积有**上限断言**守着（`validate.mjs` 里 4096 字节）；
  平台清单放索引里**按需读**，不进注入。
- `check-sites.mjs` —— 机械门禁：索引 ↔ 手册**双向一一对应** + 手册必需四小节 + 注入存根在否；
  **自带漂移自测**（确认它真的会红）。
- persona 要求：开工先读索引与对应手册、收工把新验证到的事实写回、**交付时点名用了哪条经验**。

### 检索纪律

- **题面不一定给平台**：给了就去那个平台；没给就先判题型（学术文献 → 学术数据库；专利 → 专利库；
  其他事实 → 权威原站），并说明"选了哪里、为什么"。
- **`web_search` 只用于定位**（这篇文献在哪个库、DOI、题录），**不用于取证** ——
  任何要写进答案的事实都要在原站核对。
- **多跳题逐跳落权威来源**（例：论文 → 作者 → 硕士导师 → 导师出生年），某一跳找不到就如实说卡在哪一跳。

### 随附

- 18 份平台经验手册（万方数据、中国专利公布公告、WIPO Patentscope、必应、百度系、知乎、B 站、贴吧等）。
- `probe-mcp.mjs` —— 不经 DSH 直接对 MCP 服务器说协议，验证浏览器链路；
  支持 `--dry-run` 只打印推导出的路径、不弹浏览器。
- `validate.mjs` —— 装前静态校验（YAML / 字段 / 路径形态 / 无重复 id / 存根体积 / 经验库接线）。

> ⚠️ **安装前请先按 README §3.1 改掉几处写死的本机绝对路径**（注入存根、persona 里的库路径与门禁命令、
> `--output-dir`、`validate.mjs` 的存根默认路径）。
