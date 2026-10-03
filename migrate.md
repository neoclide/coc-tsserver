# Upstream Sync Ledger

## 2026-10-03 incremental sync

Reviewed `microsoft/vscode` `extensions/typescript-language-features` from
`d43a612ad8121ff1f7fe19a5ee13e237c3c5463c` to
`67cb2a17e24d903be7d50486a70d9bd835e95ad6`.

- Adopt `6ebcc0a377a`: distinguish an unset implicit `checkJs` setting from an
  explicitly configured false value. Translate VS Code configuration inspection
  to the three configuration scopes supported by Coc. Keep the published Coc
  key and default unchanged; omit the unset value from the tsserver JSON payload.
- Skip `fab0e01e6b7` notification link filtering: Coc's message/notification
  implementation displays plain content and explicit action buttons; it does
  not execute VS Code Markdown `command:` links. Do not suppress useful error
  text solely to mirror VS Code's notification renderer.
- Skip `4dbe1643e61` and `d211d0584de`: TypeScript 7 marketplace suggestions,
  telemetry experiments and VS Code extension detection are host-specific.
- Skip `3879d0e80fa`, `beab7a2a9d5`, `0edf2a06932`: behavior-neutral upstream
  lint updates and merge bookkeeping.
- Skip `efc2c86f03d`, `fc3e038bfa9`: upstream CodeQL/build dependency changes.

Added regression coverage for omitted checkJs and explicit false/true settings.
Preserved all Coc command/configuration IDs, existing strict/compiler settings,
server generation guards, signature help state and project reload behavior.

Validation: baseline build/typecheck and 53 Neovim tests passed. Final build and
typecheck passed; Neovim 55/55 and Vim 55/55 passed; contract inventory reported
zero risks and diff whitespace checks passed. Vim emits existing asynchronous
RPC-disconnect messages during test teardown even though all assertions pass.

PR review correction: leave `checkJs` absent from the compiler-options object
when unset, instead of assigning an own property with value undefined. This
also keeps generated jsconfig/tsconfig snippets valid JSON. Regression tests
check own-property presence and parse the actual snippet generator output for
both project types with unset, false and true settings. Build/typecheck and
Neovim 56/56 passed. An initial full Vim run showed inconsistent runner counts
(exit 0 with one failed count); the focused 8/8 and final full 56/56 runs passed,
with the existing asynchronous teardown RPC messages still present.

记录 coc-tsserver 从 VS Code `typescript-language-features` 同步上游改动的清单。

## 同步范围

- 上游仓库: [microsoft/vscode](https://github.com/microsoft/vscode) 的
  `extensions/typescript-language-features`
- 上游 HEAD: `d43a612ad8` (2026-08-08)
- 检查范围: 2025-04-01 起涉及该扩展的 157 个提交
- 同步方式: 逐个检查上游提交，共享逻辑/可适配行为移植，VS Code 专属行为跳过并记录原因

## 已移植的上游提交

| 上游 commit | 日期 | 改动 |
| --- | --- | --- |
| `7a1d5016f8` | 2025-05-05 | 新增 `typescript/javascript.hover.maximumLength`（默认 500），下发 `maximumHoverLength` 偏好 |
| `c4c7118590` | 2025-06-05 | `tsserver.log` 支持 `requestTime` 日志级别 |
| `b2152a7418` | 2025-07-09 | `tsserver.log` manifest enum 增加 `requestTime` |
| `822232673f` | 2025-08-14 | 新增 `tsserver.implicitProjectConfig.strict`（默认 true） |
| `949aadab93` | 2025-08-05 | implicit target 默认改为 `ES2024`，枚举增加 `ES2023`/`ES2024` |
| `63c89d7a78` | 2025-04-16 | 隐式项目 jsx 默认从 `react` 改为 `react-jsx` |
| `602bc5a588` | 2026-04-09 | 隐式项目 compilerOptions 显式覆盖默认值（false 也下发） |
| `ef6d5f314e` | 2026-03-26 | 无可见编辑器时也向 tsserver 下发用户偏好 |
| `69e459e483` | 2026-07-29 | 修复签名帮助 active overload 不更新（新增 SignatureHelpState） |
| `1d68945dd8` | 2026-08-07 | tsserver 事件增加 generation guard，忽略过期 server 的事件 |

说明: `c4c7118590` 的上游 `fromString` 存在大小写匹配缺陷（先 `toLowerCase()`
再匹配 `requestTime`，导致该级别实际不生效），移植时修正为匹配 `requesttime`，
使 `requestTime` 日志级别真正可用。

## 判定不移植的主要类别及原因

- tsgo / 原生 TypeScript 相关（约 15 个提交，如 `a0cd135c8e`、`4151d4bc5e`、
  `9dfb647be4`、`8ff11209da` 等）: 依赖 VS Code 扩展宿主与原生扩展
  （microsoft/typescript-go），coc 无对应能力。
- 遥测 / `$traceId` 相关（`0c129cf983`、`720ee54497`、`4d32398e42` 等）:
  coc 没有对应 telemetry 实现，空参数崩溃修复不适用。
- 统一 `js/ts` 设置重构（约 20 个提交，如 `11a5279976`、`2a2f6407e4`、
  `5ded895db4`、`7566dfb857` 等）: 纯 VS Code 配置层重组；coc 使用
  `tsserver.*`/`typescript.*`/`javascript.*` 配置布局，行为已由现有键覆盖。
  `8f2f873054` 的 scope 变更只涉及上游独有的 `js/ts.format.*` 键，coc 无对应键。
- requestQueue 追踪改进（`bd9d26deb3`、`155d317f52`、`1b196d8046`）:
  仅用于日志/遥测转储输出，coc 无对应错误转储功能。
- 移除 `~/Library` watch workaround（`19007fb635`）: coc 本就没有该 workaround。
- 删除废弃设置（`8067943119`）: 会破坏 coc 已发布的配置契约，保留。
- Web / Electron / 构建 / 依赖 / lint / 文档类提交: 与 coc 运行时无关。
- 已被覆盖: `cd5348abcd`（implementations CodeLens overrides）等价于此前移植的
  `showOnAllClassMethods` 行为，无需重复。
