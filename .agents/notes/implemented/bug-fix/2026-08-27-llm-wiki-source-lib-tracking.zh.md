# Agent Note: LLM Wiki 源码库保持受跟踪

Status: implemented

[English](2026-08-27-llm-wiki-source-lib-tracking.md) | 中文

## Problem

FF–LLM Wiki 把浏览器 API、导航和流式问答模块放在 `application/apps/web/src/lib`。仓库与插件的 `lib/` 忽略规则没有锚定根目录，Git 因此把该源码目录误当成生成的包产物。长期使用的开发检出可以依靠被忽略的本地文件完成构建，而干净检出缺少所有主要 Web 视图导入的模块，在部署前就会失败。

## Decision

插件级产物规则锚定到插件包顶层的 `/lib/`，仓库忽略文件则明确恢复应用 Web 源码树下的 TypeScript 模块。`api.ts`、`graph-adapt.ts`、`model-settings.ts`、`nav.ts` 与 `qa.ts` 都是受跟踪的应用输入；其他位置生成的包 `lib/` 目录继续保持忽略。

## Alternatives considered

**不修正忽略规则，直接强制添加文件。** 不采用，因为同目录后续新增或修改的源码仍会从普通 Git 状态检查中消失。

**重命名源码目录。** 不采用，因为 `src/lib` 属于普通应用布局；缺陷来自范围过大的产物规则，而不是模块名称。

**在打包时生成这些模块。** 不采用，因为 API 行为、导航和流解析属于人工维护的产品源码，必须在构建前可供审查。

## Consequences

干净检出会包含完整 FF–LLM Wiki 前端，并可执行生产构建。忽略文件增加两条窄范围例外；同目录新增源码时必须明确加入例外，除非有意扩大该范围。

## Testing

验证要求五个路径全部出现在 `git ls-files` 中，并由这些受跟踪输入完成应用级生产构建。
