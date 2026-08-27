# DeepSeek Harness Studio · 桌面应用

[English](README.md) | 中文

桌面应用负责监管现有的回环 Web Host；窗口关闭后，系统托盘继续持有 Host 的生命周期。

## 开发

安装依赖后，使用桌面开发命令。首次运行、相关输入发生变化或关键产物缺失时，该命令会先构建 Host 与客户端包、Web 前端和 Electron main 进程，再启动应用；输入和产物均未变化时，则直接从已验证的构建启动 Electron：

```sh
pnpm run dev:desktop
```

启动器会在已忽略的 `apps/desktop/lib/` 产物目录中记录内容指纹。源码、manifest、构建配置、Node 运行时或构建环境变化都会使记录失效；仅修改文档不会触发重建。构建失败时绝不会留下可复用记录。排查生成产物或工具链状态时，可强制执行一次完整构建：

```sh
pnpm run dev:desktop:rebuild
```

启动器也会把自身使用的 Node 绝对路径传给 Electron，因此开发态 Host 启动与包恢复不会依赖交互式 shell 的 `PATH`。

关闭窗口会隐藏窗口。通过托盘菜单恢复窗口或退出应用。显式退出会等待 Host 进程停止，并在 Host 的有界宽限期结束后升级终止行为。

桌面应用只接受 `dsh web` 为 `127.0.0.1` 或 `localhost` 输出的就绪 URL。页面导航限制在该来源；HTTP 和 HTTPS 链接交给系统浏览器打开。

Electron 中的工作区选择通过固定 preload 方法调用 main 进程的 `dialog.showOpenDialog`。只有当前归属明确的 renderer 可以发起调用；取消时不返回路径。普通本地 Web 部署继续使用 Host 原生选择器适配器。

原生窗口外观按宿主平台区分。macOS 使用无边框内嵌标题栏、交通灯和侧栏 vibrancy；收起侧栏宽 90px，其中的控件水平居中，最上方控件在交通灯下方与展开态 logo 行对齐。Windows 保留系统边框、阴影、缩放与 Snap 行为以及 Windows 11 圆角，同时用隐藏标题栏把原生窗口按钮放入 Session header 首行；Windows 侧栏不预留交通灯区域。该行的空白部分可拖动，控件仍可点击；没有 Session header 时，常驻拖拽带覆盖同一行。Windows acrylic 和 macOS vibrancy 只透过侧栏，会话区与详情区保持不透明。Linux 使用无边框窗口和不透明侧栏降级样式。

### 插件中心可信生命周期

Desktop 持有插件中心发现、兼容与包变更权威。公开发现会合并 npm `dsh-plugin` 约定、有界文本查询、完整 scoped 包名直查，以及明确 `https://github.com/<owner>/<repo>` 仓库解析；短名与完整 scoped 名都可使用。只要有界文本查询成功，即使并发的关键词全量索引暂时不可用，精确文本匹配也会继续展示，因此 npm 对宽泛索引的限流不会隐藏目标包。关键词和 GitHub 映射只是发现信号，不代表官方背书或安装权威；Desktop 不会 clone、构建或直接安装 GitHub 源码。目录只允许固定 npm Registry 中声明 `dsh.bundle` 的确定版本继续；缓存候选形成权威前必须重新读取，每次查询最多为排序后的 96 个候选读取确定元数据。确定详情补全会针对一次临时连接错误、408/425/429 或 5xx 失败重试一次，并在有界范围内遵循 `Retry-After`；结构校验失败绝不重试。随后 Desktop 下载不可变 npm tarball，并校验 registry 完整性、SHA-256、压缩包边界、包身份、Host 同源 YAML schema 下的 Bundle patch、聚合包确定依赖与激活身份。Loader 条目可以使用由该 Bundle 包自身持有、且经过校验的 npm 导出子路径，例如 `dsh-builtin-browser/browser`；不安全或未声明的包引用仍会被拒绝。Bundle 可以复用封闭 Desktop Host 依赖表中的模块，持久权威同时按该依赖表的确定指纹隔离。Desktop 会在 Host 启动前通过受管命令目录原子暴露打包内精确 pnpm 入口，因此即使图形界面启动没有终端 PATH、npm 或 Corepack，Host 插件仍可解析 `pnpm`。沙箱渲染器只能调用固定目录和操作方法，安装意图只包含插件 id、确定版本与幂等键。

同一个串行事务持有安装、启用、停用、确定更新和卸载。它在变更前快照 Profile，保留明确的活动或停用 Bundle 意图，在替换或删除包前停止 Host，并且只在目标 Profile 与已声明 Host、客户端和 Skill 证据一致后提交。连续性核对会排除属于实时预设实例、无法跨 Host 换代保持的 `include:agent-presets:*` Loader 子项。停用或卸载时，如果插件注册了 Skill 却没有把它写入 `expectedSkillIds`，校验器也允许该 Skill 随目标插件消失；已声明目标身份、其 `agent-presets` 所有者条目，以及全部无关 Loader 条目和客户端模块仍为必需证据。卸载默认保留配置与插件自有数据；提交后的独立桥接只能删除插件存储根下的确定声明路径。Host 换代时会保留桌面端最后一帧，直至新页面完成绘制，因此成功变更不会暴露中间导航。已安装管理器处于展开状态时，一项白名单 renderer URL 标记会把该子页面带入替换 Host，其他任意查询状态不会被迁移。普通 Host 启动前，Desktop 会停用与当前应用版本不兼容的已校验外部 Bundle，同时保留包和可解释原因。它还会在确认所选 Profile 已持有实际安装的 `dshmarket` Bundle 后，仅移除旧版手动插入的重复 `dshmarket`；按 id 覆盖的设置与其他 patch 均保持不变。生产 preload 已通过带恢复能力的控制器开放这些操作。

### Preset 广场安装

Desktop 持有 Preset 广场的网络访问权威，只接受渲染器提交的闭合排序、搜索文本、slug 和可选本地目标 id。它仅从 `https://www.dshdesktop.com/preset/` 读取元数据和归档，拒绝重定向，限制响应大小，安装前重新解析详情，并在把字节发送给环回 Host 导入器前校验公开的归档大小与 SHA-256。渲染器不能提交 URL、归档、文件系统路径或 Host origin。

应用在 `resources/preset-square/presets/` 内随包交付七套精简能力包，目录来源统一显示为 **赋范官方**：AI WebApp、PPT Office、视频生成、内容工厂、AI 报表、飞书数字员工和 LLM Wiki Producer；最后一套会安装用于分阶段开发与验证企业知识库项目的「LLM Wiki 全栈工程师」Agent Preset。“赋范官方”表示由赋范桌面端开发团队维护，不代表 DeepSeek Harness 官方。Desktop 从只读资源生成确定且经完整性校验的归档，Host 仍把它们安装到可写的用户 Preset 根目录，因此可删除和重新安装。

未提交日志在普通 Host 启动前进入恢复。变更副作用会持久记录前后边界，因此 Host 停止、Profile 或包变更、Host 启动和页面重连前后的中断都进入同一恢复路径。恢复控制器校验旧快照、重建旧包状态并核对旧 Host、客户端和 Skill 证据；快照、Profile、依赖、锁或 Host 健康检查失败时继续只打开受保护恢复页，并允许同事务重试和脱敏诊断导出。只有恢复后的 Host 已通过健康检查、但确定运行清单仍不一致时，Desktop 才会用正常渲染器直接打开插件中心的受限安全模式：目录浏览、重试、诊断、配置、停用与卸载可用，安装、更新与启用保持关闭，直到恢复通过或安全清理成功提交（[决策](../../.agents/notes/implemented/bug-fix/2026-08-24-plugin-recovery-safe-mode.zh.md)）。损坏或未来版本日志不会被猜测执行。

确定的浏览器验收使用 `pnpm run dev:desktop:web` 并复用同一组客户端组件与进度合同。该开发桥接只模拟阶段和持久状态，不拥有 Electron、Profile、文件系统、包管理器、MCP 或 Host 重启权威。

## 打包

本地打包命令会先从源码重新构建随包的 FF–LLM Wiki 应用，再执行完整的仓库构建，为 Host 暂存封闭的生产依赖树，并为当前平台生成未封装应用。生成的应用产物保持忽略，不作为干净发布 checkout 的事实源。无需另行手动构建：

```sh
pnpm run package:desktop
```

打包后的应用通过 Electron 的 Node 模式，在独立进程内运行已暂存的 `@deepseek-ai/dsh` CLI。应用因此保留受 supervisor 管理的 Host 生命周期，无需携带第二个 Node 可执行文件。如果暂存的 CLI 入口、Web 前端入口、通用 HTTPS 更新提供方或明确更新渠道缺失，`afterPack` 检查会在签名前拒绝该产物；它还会核验 Harness 图片管线所需的 macOS arm64 或 Windows x64 Sharp 原生模块。同一钩子会为所有目标写入 `app-update.yml`，包括预览压缩包使用的未封装目录。预览包因此会请求已经发布的 `rc-mac.yml` 或 `rc.yml`，而不是 Electron 默认但并不存在的渠道文件，并能把同版本更新源正确识别为“已是最新”。macOS 和 Windows 都从受跟踪、带透明圆角的 `apps/desktop/build/icon.png` 派生平台图标；仓库不提交独立的平台专用变体。

### 已签名的 macOS DMG 与 ZIP

macOS 发布命令会生成用于安装的 DMG 和自动更新器所需的 ZIP。它要求构建用户的 Keychain 中安装有效的 `Developer ID Application` 身份，且证书与私钥必须同时存在。它还需要一组完整的公证凭据。Keychain profile 可以避免应用专用密码进入仓库或 shell 历史记录：

```sh
xcrun notarytool store-credentials "dsh-notary" --apple-id "<Apple ID>" --team-id "<Team ID>"
```

`notarytool` 会交互式请求秘密。使用已存储的 profile 构建已签名、开启 hardened runtime 且已公证的 DMG：

```sh
APPLE_KEYCHAIN_PROFILE=dsh-notary pnpm run dist:mac:desktop
```

现有秘密文件可以提供 `MAC_CERT_P12_BASE64`、`MACOS_SIGN_IDENTITY`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID`，无需把证书导入持久 Keychain：

```sh
node --env-file=/absolute/path/to/macos-signing-secrets.env --import tsx apps/desktop/scripts/release-mac.ts
```

Electron Builder 会把该 Base64 PKCS#12 证书导入临时 Keychain，并在构建结束时删除。wrapper 不会把签名和公证变量传给仓库构建与运行时暂存子进程，只会将其传给 Electron Builder。秘密文件及其路径都不会受版本控制。

发布预检查会在仓库构建前运行。如果宿主不是 macOS、所提供身份不是 `Developer ID Application` 身份、签名凭据不完整、签名发现被禁用，或公证凭据缺失或不完整，预检查都会失败。未提供 PKCS#12 凭据组时，Keychain 中必须存在带私钥的可用 `Developer ID Application` 身份。除 Keychain profile 外，该命令也接受完整的 Apple ID 凭据组（`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID`），或 App Store Connect API 密钥组（`APPLE_API_KEY`、`APPLE_API_KEY_ID` 和 `APPLE_API_ISSUER`）。

构建成功后，挂载生成的 DMG，再验证其中应用的签名、Gatekeeper 评估和已装订的公证票据：

```sh
DMG_PATH="$(find apps/desktop/dist -maxdepth 1 -type f -name '*.dmg' -print -quit)"
MOUNT_POINT="$(mktemp -d)"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -readonly
APP_PATH="$MOUNT_POINT/DeepSeek Harness.app"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"
xcrun stapler validate "$APP_PATH"
hdiutil detach "$MOUNT_POINT"
rmdir "$MOUNT_POINT"
```

### 发布在线更新

Desktop 安装包只检查本包配置的赋范空间 OSS 更新源，绝不会用 DeepSeek Harness 上游产物覆盖这个定制应用。Electron Builder 的 generic provider 会生成渠道元数据，但不会负责上传。通过受保护的环境机制注入 `ALIYUN_OSS_ACCESS_KEY_ID` 与 `ALIYUN_OSS_ACCESS_KEY_SECRET` 后，发布维护者再上传一个或多个已经通过签名与平台验收的平台产物目录：

```sh
pnpm run publish:desktop-update -- \
  --dir /path/to/macos-output \
  --dir /path/to/windows-output
```

该命令会验证所有目录使用同一个版本和渠道，核对每条元数据记录的大小与 SHA-512，要求每个载荷都有 blockmap，并拒绝没有 ZIP 的 macOS 发布。它先上传版本化产物，最后才覆盖 `rc-mac.yml` 或 `rc.yml`，随后通过公网地址读取两份 manifest。只有已记录的文件大小与 SHA-512 完全相同时，命令才会复用现有不可变对象。

`--dry-run` 会完成全部本地检查，但不连接 OSS。`--allow-current-baseline` 只用于一次性发布已经分发、但 macOS 测试包早于 ZIP 要求的当前版本；它能让同版本检查返回“已是最新”，但不构成跨版本更新发布。后续版本必须先走已签名的 DMG+ZIP 和已签名的 Windows NSIS 路径，再执行发布。凭证只通过受保护的环境注入，不得进入命令记录、构建输出或受跟踪文件。

### Windows x64 NSIS 安装包

使用以下命令构建引导式 Windows x64 安装包：

```sh
pnpm run dist:win:desktop
```

引导流程默认安装给当前用户，也允许选择所有用户安装和自定义安装目录。该命令会构建完整工作区、暂存面向 Windows 的 Host 运行时，移除 Node 运行时不会加载的声明文件与 source map，核验 Koffi、Sharp 和 node-pty 所需的 x64 原生模块，再生成 `.exe` 安装包、blockmap 与更新元数据。macOS 交叉构建会把 Electron Builder 的 NSIS 模板映射到一个较短的临时路径，因为 NSIS 在 POSIX include 路径上仍使用固定的 260 字符缓冲区；构建结束后会删除该临时符号链接。

替换或移除现有安装前，NSIS 会请求正在运行的单实例进入普通显式退出路径，最多等待五秒让 supervisor 管理的 Host 停稳，再以两次有界尝试终止任何残留的 `DeepSeek Harness.exe` 进程树。如果仍有进程占用安装目录，操作会明确失败，不会留下半卸载状态。如果手动删除或卸载失败留下损坏的注册信息和不完整的专属 `DeepSeek Harness` 应用目录，替换程序会自动清理残留、跳过不可用的旧卸载器、写入干净载荷并重建卸载注册信息。所有已注册的 `0.1.0-rc.*` 预览版安装都走同一替换路径，旧卸载器不会在升级时重新引入通用的“应用无法关闭”循环。Profile 数据位于应用目录之外，不受该替换影响。

在配置 Windows Authenticode 证书前，内部测试安装包保持未签名。测试者核对已发布的 SHA-256 后，SmartScreen 可能仍要求选择“更多信息”→“仍要运行”。不需要关闭 Defender。原生 Windows 生命周期工作流会安装到非默认目录，启动打包 Host，在应用仍运行时卸载，再安装到同一目录，模拟应用目录已手动删除但注册表仍残留的状态，完成修复后重复启动与卸载检查。

## 已知限制

首个桌面装配使用回环 HTTP Host。renderer 和 Host 协议保持不变，因此后续可替换为 GUI 架构预留的 IPC carrier，而无需改动产品功能。

浏览器进度与恢复提示仍只属于模拟证据；真实搜索、包变更、Host 重启与卸载必须在 Desktop 中执行。公开 npm 索引是社区分发渠道，不等于 DeepSeek 安全审计。第一版实时来源只接受预构建 npm DSH Bundle，并拒绝缺少 `dsh.bundle`、压缩包不安全、不可变证据不一致或带安装生命周期脚本的包；一键安装不会构建仅存在于 GitHub 源码中的插件。

macOS 已有签名并公证的发布路径。Windows 已有 x64 NSIS 安装包路径，但生产级 Authenticode 签名仍属于发布工作。Linux 目前仍只生成未封装应用，尚无安装包格式与发行签名路径。

## 模型体验

桌面壳不会增加模型可见输入。复用的 Web profile 继续持有现有的 Web 运行时上下文。
