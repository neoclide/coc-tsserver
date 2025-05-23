# 2.3.1

- Added configuration `tsserver.socketPath` for standalone tsserver (not recommended).
- Fix `tsserver.watchBuild` not work on windows.

# 2.3.0

- Added configuration `tsserver.disabledSchemes`.
- Use in memory prefix for none file buffer, avoid server error.

# 2.2.5

- Add configuration `typescript.preferences.preferTypeOnlyAutoImports`.

# 2.2.4

- Improve file select on refactor.

# 2.2.3

- Remove unnecessary selection on refactor.

# 2.2.2

- Support module target of tsconfig.json.

# 2.2.1

- Show warning message when insert closing tag which can be disabled.

# 2.2.0

- Support `javascript.preferGoToSourceDefinition` and `typescript.preferGoToSourceDefinition` #449.
- Support refactor action `move to file` #445.
- Support `javascript.unstable` and `typescript.unstable`, see
  https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#case-insensitive-import-sorting-in-editors.
- Fix update import on file rename may not work by increase delay #447.

# 2.1.0

- Support "Remove Unused Imports" source action.

# 2.0.9

- Support `tsserver.tsdk` as workspace folder value (should be path relative to
  workspace folder), only used when `tsserver.useLocalTsdk` is `true`.

# 2.0.8

- Upgrade typescript to 4.9.3.
- Support `tsserver.useLocalTsdk` as user configuration, not recommended since
  the local typescript module could be outdated.
- Fix range of completionItem when triggered by `#`
- Avoid cache cancelled response for code lens.

# 2.0.3

- Pass `triggerReason` and kind for refactor request.

# 2.0.0

- Global `tsserver.tsdk` would be used when exists by default.
- Fix action with `notApplicableReason` not disabled.
- Added `TypeScriptAutoFixProvider` for provide source actions.
- Added configurations:
  - `tsserver.useLocalTsdk`
  - `tsserver.useSyntaxServer`
  - `tsserver.experimental.enableProjectDiagnostics` very experimental state
  - `typescript.inlayHints.variableTypes.suppressWhenTypeMatchesName`
  - `javascript.inlayHints.variableTypes.suppressWhenTypeMatchesName`
  - `typescript.preferences.autoImportFileExcludePatterns`
  - `javascript.preferences.autoImportFileExcludePatterns`
  - `tsserver.implicitProjectConfig.module`
  - `tsserver.implicitProjectConfig.target`
  - `tsserver.implicitProjectConfig.strictNullChecks`
  - `tsserver.implicitProjectConfig.strictFunctionTypes`
- Renamed configurations:
  - `javascript.updateImportsOnFileMove.enable` => `javascript.updateImportsOnFileMove.enabled`
  - `typescript.updateImportsOnFileMove.enable` => `typescript.updateImportsOnFileMove.enabled`
  - `javascript.referencesCodeLens.enable` => `javascript.referencesCodeLens.enabled`
  - `typescript.referencesCodeLens.enable` => `typescript.referencesCodeLens.enabled`
  - `javascript.implementationsCodeLens.enable` => `javascript.implementationsCodeLens.enabled`
  - `typescript.format.enabled` => `typescript.format.enable`
  - `javascript.format.enabled` => `javascript.format.enable`
  - `typescript.implementationsCodeLens.enable` => `typescript.implementationsCodeLens.enabled`
- `referencesCodeLens` and `implementationsCodeLens` changed to disabled by default.
- Remove configuration `typescript.suggest.importStatements`, always `true`.
- Remove configuration `tsserver.ignoreLocalTsserver`, local tsserver not used
  by default, use `tsserver.useLocalTsdk` to enable tsserver from workspace
  folder.
- `watchBuild` use resolved config file returned from tsserver by default.
- Add command `tsserver.chooseVersion`

# 1.12.0

- Disable snippet function completion when following character is `(`.
- Remove configuration `tsserver.typingsCacheLocation`.
- Remove configuration `tsserver.formatOnType`.
- Remove configuration `tsserver.enableJavascript`.
- Remove configuration `tsserver.useBatchedBufferSync`.
- Support preference tsserver `provideRefactorNotApplicableReason`.
- Added `scope` for configurations, support some language-overridable
  configurations.

# 1.11.0

- Add command `tsserver.goToSourceDefinition`.

# 1.10.5

- Fix a fold issue #380

# 1.10.2

- Fix snippet completion not work for optional complete item.

# 1.10.1

- Avoid unnecessary fetch of format option.
- Add `typescript.suggest.objectLiteralMethodSnippets.enabled`

# 1.10.0

- Support jsdoc completion.
- Add configurations `javascript.suggest.completeJSDocs` and `typescript.suggest.completeJSDocs`.

# 1.9.15

- Fix uri for `zipfile`.

# 1.9.14

- Add javascript snippets
- Fix command `tsserver.restart` not work

# 1.9.11

- Resued resolved tsserver path after `:CocRestart`

# 1.9.10

- Watch for `tsserver.enable` configuration to change service state.
- Fix tsserver not work well with `:CocList services`

# 1.9.9

- Use documentChanges for workspaceEdit.

# 1.9.8

- Log to output when document content exceed limit of semantic tokens.

# 1.9.7

- Change default of `javascript.autoClosingTags` and `typescript.autoClosingTags` to `true`.

# 1.9.6

- Rework codeLens related.

# 1.9.5

- Change 'allImportsAreUnused' diagnostic kind to warning.

# 1.9.4

- Improve file pattern for config file.

# 1.9.2

- Inlay hints support (#335)

# 1.9.1

- use `TSS_DEBUG` & `TSS_DEBUG_BRK` for debug port

# 1.9.0

- Add semanticTokens support #313
- Add jsxAttributeCompletionStyle settings #319
- Add command `tsserver.sortImports` #322
- Add suggest.classMemberSnippets.enabled configuration cd16da8
- Add suggest.jsdoc.generateReturns configuration 5a8c68f
- Add typescript.preferences.includePackageJsonAutoImports configuration 4d78b61
- Add tsserver.enableTracing configuration 43e6f62
- Add typescript.check.npmIsInstalled configuration 3bd84b1

# 1.8.3

- Support deprecated tag for document symbols, diagnostic, workspace symbols.

# 1.8.2

- Support call hierarchy.
- Support `tags` and access modifier for document symbols.
- Support return `DefinitionLink[]` for definition provider.

# 1.8.1

- Support `tsserver.tsconfigPath` configuration.

# 1.8.0

- Support [Import Statement Completions](https://devblogs.microsoft.com/typescript/announcing-typescript-4-3/#import-statement-completions)

# 1.7.0

- Support tag closing for JSX

# 1.6.4

- Support `typescript.format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces` and `ypescript.format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces`

# 1.6.2

- Support languages from plugins.

# 1.5.5

- Support `typescript.preferences.useAliasesForRenames` and `javascript.preferences.useAliasesForRenames`

# 1.5.3

- Support the new path of Yarn v2 pnpify SDK.
- Us `tsserver.pluginPaths` replace `tsserver.pluginRoot`.

# 1.5.0

- Support @ts-expect-error directive on tsserver v390.
- Support `tsserver.watchOptions` configuration.

# 1.4.13

- Add `preferences.importModuleSpecifierEnding` configuration.
- Change `preferences.importModuleSpecifier` default to `auto`.

# 1.4.12

- Support `tsserver.maxTsServerMemory` configuration.

# 1.4.9

- Support semicolons format option.

# 1.4.8

- support `format.enabled` configuration

# 1.4.3

- Use global tsc when local tsc not foun

# 1.4.0

- remove noSemicolons preferences

# 1.3.15

- Add missing option "auto" to importModuleSpecifier

# 1.3.11

- Add `tsserver.ignoreLocalTsserver` configuration.

# 1.3.6

- Support `b:coc_tsserver_disable`

# 1.3.2

- fix suggestionActions.enabled configuration not working

# 1.3.1

- fix validate.enable not work sometimes

# 1.3.0

- Loading status.
- Batched buffer synchronize.
- Configuration for showUnused variable.
- Smart selection support.
- Support 'auto' as quoteStyle.
- Support 'validateDefaultNpmLocation'.

# 1.1.30

- rework of typescriptService, support interuptGetErr

# 1.1.29

- Support plugin feature.

# 1.1.28

- add codeAction provider for import missing node builtin modules.

# 1.1.26

- Add install module codeAction for module not found diagnostic.
- Rework `tsserver.watchBuild`, use background process, support statusline.

# 1.1.25

- Support autofix of node modules import

# 1.1.23

- Add command `tsserver.executeAutofix`

# 1.1.13

- Add triggerCharacters for SignatureHelp

# 1.1.12

- Add typescript snippets from VSCode

# 1.1.11

- Fix throw error of "No content available" on completion.

# 1.1.10

- Support projectRootPath for document

# 1.1.9

- Support commitCharacters of completion items

# 1.1.8

- Add status bar support.

# 1.1.7

- Add settings `javascript.validate.enable` and `typescript.validate.enable`

# 1.1.6

- Fix suggestionActions.enabled not works

# 1.1.5

- Use quickfix list for watchBuild errors

# 1.1.4

- Fix organizeImports not working sometimes

# 1.1.3

- Remove settings with `commaAfterImport`, use `typescript.preferences.noSemicolons` and `javasscript.preferences.noSemicolons` instead.

# 1.1.2

- Support diagnostic of config file.

# 1.1.1

- Remove unnecessary use of workspace terminal.

# 1.1.0

- Support rename import path: https://code.visualstudio.com/updates/v1_28#_rename-import-path
- Use new `suggest` for completion configuration: https://code.visualstudio.com/updates/v1_28#_new-settings-for-jsts-suggestions
- Convert to async function: https://code.visualstudio.com/updates/v1_28#_convert-to-async-function
- Remove semicolons on format: set `typescript.preferences.noSemicolons` to true
