# Agent Note: Profile manifest 接受 UTF-8 字节顺序标记

Status: implemented

[English](2026-09-01-profile-manifest-utf8-bom.md) | 中文

## Problem

Windows 编辑器和 PowerShell 命令可能在 UTF-8 JSON 前写入字节顺序标记。`~/.dsh` 下的 Profile manifest 会跨 Desktop 升级保留，因此只要其中一个文件带有该标记，Profile 和插件兼容性读取器就会把解码后的标记直接交给 `JSON.parse`，使每个已安装的 Desktop 版本都在启动期间失败。Electron 弹窗只显示解析器的片段，没有指出实际出错的持久化文件。

## Decision

共享 Profile 加载器和 Desktop 兼容性投影在对 package manifest 进行 UTF-8 解码后，只移除一个位于开头的 U+FEFF 码点。其他字节和所有 JSON 验证规则保持不变。解析失败会指出 manifest 路径；Desktop 兼容性修订号仍会在解码前对原始字节进行哈希，因此 BOM 的添加或移除仍然是可观测的 Profile 变更。

## Alternatives considered

**Desktop 启动时删除或重建 `~/.dsh`。** 不采用，因为该目录拥有用户配置和已安装插件，安装器不应为了修复一个编码标记而销毁这些状态。

**把所有 JSON 解析失败都视为可恢复的 BOM 问题。** 不采用，因为格式错误或被截断的 manifest 仍必须在 Loader 消费含糊配置前失败。

**只修复打包后的 Windows 运行时。** 不采用，因为持久失败的输入是各个 Desktop 版本和 CLI 启动共用的 Profile 或已安装插件 manifest，而不是平台专用的可执行文件。

## Consequences

带有合法 UTF-8 BOM 的 Profile 和已安装插件包可以加载，且不会重写文件。格式错误的 JSON 仍会失败并显示准确路径。聚焦测试覆盖共享 Profile 读取器，以及 Desktop 对带 BOM 的 Profile 和 Bundle manifest 所做的投影。
