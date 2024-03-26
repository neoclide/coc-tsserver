# coc-tsserver

Tsserver language server extension for [coc.nvim](https://github.com/neoclide/coc.nvim).

Tsserver is part of [TypeScript](https://github.com/microsoft/TypeScript) which
provide rich language features for javascript and typescript.

This extension is a fork of `typescript-language-features` extension which is
bundled with VSCode. File type detect and syntax highlight are not supported by
this extension, use other vim plugin instead.

**Important note:** from v2.0.0, tsserver module resolved first from global
configuration `tsserver.tsdk` and use bundled module when not found, if
`tsserver.useLocalTsdk` is enabled, workspace folder configured `tsserver.tsdk`
or typescript module inside current workspace folder would be used when exists.

## Install

In your vim/neovim, run command:

`:CocInstall coc-tsserver`

For yarn2 ( >= v2.0.0-rc.36) user want to use local typescript module:

- Run command `yarn dlx @yarnpkg/sdks vim`, which will generate
  `.vim/coc-settings.json`, with content:

  ```json
  {
    "eslint.packageManager": "yarn",
    "eslint.nodePath": ".yarn/sdks",
    "workspace.workspaceFolderCheckCwd": false,
    "tsserver.tsdk": ".yarn/sdks/typescript/lib"
  }
  ```

## Features

Almost the same as VSCode.

- Supports javascript & typescript and jsx/tsx.
- Installs typings automatically.
- Commands to work with tsserver, including:
  - `tsserver.reloadProjects`
  - `tsserver.openTsServerLog`
  - `tsserver.goToProjectConfig`
  - `tsserver.restart`
  - `tsserver.watchBuild`
  - `tsserver.findAllFileReferences`
- Code completion support.
- Go to definition (more info in [microsoft/TypeScript#37777](https://github.com/microsoft/TypeScript/issues/37777))
- Code validation.
- Document highlight.
- Document symbols of current buffer.
- Folding and folding range of current buffer.
- Format current buffer, range format and format on type.
- Hover for documentation.
- Implementations codeLens and references codeLens.
- Organize imports command.
- Quickfix using code actions.
- Code refactor using code actions.
- Source code action, including:
  - Fix all fixable JS/TS issues.
  - Remove all unused code.
  - Add all missing imports.
  - Organize Imports.
  - Sort Imports.
  - Remove Unused Imports
- Find references.
- Signature help.
- Call hierarchy.
- Selection range.
- Semantic tokens.
- Rename symbols support.
- Automatic tag closing.
- Rename imports on file rename, require
  [watchman](https://facebook.github.io/watchman/) installed in your \$PATH.
- Search for workspace symbols.
- Inlay hints support using virtual text feature of neovim, which requires:
  - TypeScript >= 4.4.0
  - Neovim >= 0.4.0
  - Enabled by options starts with `typescript.inlayHints` or
    `javascript.inlayHints`.

~Tsserver module first resolved from your local workspace. If it's not found, use
tsserver from `tsserver.tsdk` configuration or use bundled tsserver with this
extension.~

## Commands

Commands contributed to `:CocList commands`

- `tsserver.reloadProjects` Reload current project
- `tsserver.openTsServerLog` Open log file of tsserver.
- `tsserver.goToProjectConfig` Open project config file.
- `tsserver.restart` Restart tsserver
- `tsserver.findAllFileReferences` Find File References
- `tsserver.goToSourceDefinition` Go to Source Definition
- `tsserver.watchBuild` Run `tsc --watch` for current project by use vim's job feature.
- `tsserver.executeAutofix` Fix autofixable problems of current document.
- `tsserver.chooseVersion` Choose different typescript version for current project.

## Configuration options

Checkout `:h coc-configuration` for guide of coc.nvim's configuration.

- `tsserver.enable`: Enable running of tsserver. Default: `true`
- `tsserver.tsconfigPath`: Path to tsconfig file for the `tsserver.watchBuild` command. Default: `"tsconfig.json"`
- `tsserver.locale`: Sets the locale used to report JavaScript and TypeScript errors. Defaults to use VS Code's locale. Default: `"auto"`
  Valid options: ["auto","de","es","en","fr","it","ja","ko","ru","zh-CN","zh-TW"]
- `tsserver.useLocalTsdk`: Use tsserver from typescript module in workspace folder, ignore tsserver.tsdk configuration. Default: `false`
- `tsserver.maxTsServerMemory`: Set the maximum amount of memory to allocate to the TypeScript server process Default: `3072`
- `tsserver.watchOptions`: Configure which watching strategies should be used to keep track of files and directories. Requires using TypeScript 3.8+ in the workspace.
- `tsserver.tsdk`: Specifies the folder path to the tsserver and `lib*.d.ts` files under a TypeScript install to use for IntelliSense, for example: `./node_modules/typescript/lib`. - When specified as a user setting, the TypeScript version from `tsserver.tsdk` automatically replaces the built-in TypeScript version. - When specified as a workspace setting, the tsserver is used when `tsserver.useLocalTsdk` is true. Use command `:CocCommand tsserver.chooseVersion` to choose different typescript version. Default: `""`
- `tsserver.npm`: Specifies the path to the npm executable used for [Automatic Type Acquisition](https://code.visualstudio.com/docs/nodejs/working-with-javascript#_typings-and-automatic-type-acquisition). Default: `""`
- `tsserver.log`: Log level of tsserver Default: `"off"`
  Valid options: ["normal","terse","verbose","off"]
- `tsserver.trace.server`: Trace level of tsserver Default: `"off"`
  Valid options: ["off","messages","verbose"]
- `tsserver.enableTracing`: Enables tracing TS server performance to a directory. These trace files can be used to diagnose TS Server performance issues. The log may contain file paths, source code, and other potentially sensitive information from your project. Default: `false`
- `tsserver.pluginPaths`: Additional paths to discover TypeScript Language Service plugins. Default: `[]`
- `tsserver.reportStyleChecksAsWarnings`: Report style checks as warnings. Default: `true`
- `tsserver.implicitProjectConfig.checkJs`: Enable checkJs for implicit project Default: `false`
- `tsserver.implicitProjectConfig.module`: Sets the module system for the program. See more: https://www.typescriptlang.org/tsconfig#module. Default: `"ESNext"`
  Valid options: ["CommonJS","AMD","System","UMD","ES6","ES2015","ES2020","ESNext","None","ES2022","Node12","NodeNext"]
- `tsserver.implicitProjectConfig.target`: Set target JavaScript language version for emitted JavaScript and include library declarations. See more: https://www.typescriptlang.org/tsconfig#target. Default: `"ES2020"`
  Valid options: ["ES3","ES5","ES6","ES2015","ES2016","ES2017","ES2018","ES2019","ES2020","ES2021","ES2022","ESNext"]
- `tsserver.implicitProjectConfig.strictNullChecks`: Enable/disable [strict null checks](https://www.typescriptlang.org/tsconfig#strictNullChecks) in JavaScript and TypeScript files that are not part of a project. Existing `jsconfig.json` or `tsconfig.json` files override this setting. Default: `true`
- `tsserver.implicitProjectConfig.strictFunctionTypes`: Enable/disable [strict function types](https://www.typescriptlang.org/tsconfig#strictFunctionTypes) in JavaScript and TypeScript files that are not part of a project. Existing `jsconfig.json` or `tsconfig.json` files override this setting. Default: `true`
- `tsserver.implicitProjectConfig.experimentalDecorators`: Enable experimentalDecorators for implicit project Default: `false`
- `tsserver.disableAutomaticTypeAcquisition`: Disables [automatic type acquisition](https://code.visualstudio.com/docs/nodejs/working-with-javascript#_typings-and-automatic-type-acquisition). Automatic type acquisition fetches `@types` packages from npm to improve IntelliSense for external libraries. Default: `false`
- `tsserver.useSyntaxServer`: Controls if TypeScript launches a dedicated server to more quickly handle syntax related operations, such as computing code folding. Default: `"auto"`
  Valid options: ["always","never","auto"]
- `tsserver.experimental.enableProjectDiagnostics`: (Experimental) Enables project wide error reporting. Default: `false`
- `typescript.check.npmIsInstalled`: Check if npm is installed for [Automatic Type Acquisition](https://code.visualstudio.com/docs/nodejs/working-with-javascript#_typings-and-automatic-type-acquisition). Default: `true`
- `typescript.showUnused`: Show unused variable hint. Default: `true`
- `typescript.showDeprecated`: Show deprecated variable hint. Default: `true`
- `typescript.updateImportsOnFileMove.enabled`: Enable/disable automatic updating of import paths when you rename or move a file in VS Code. Default: `"prompt"`
  Valid options: ["prompt","always","never"]
- `typescript.implementationsCodeLens.enabled`: Enable codeLens for implementations Default: `false`
- `typescript.referencesCodeLens.enabled`: Enable codeLens for references Default: `false`
- `typescript.referencesCodeLens.showOnAllFunctions`: Enable/disable references CodeLens on all functions in typescript files. Default: `false`
- `typescript.preferences.importModuleSpecifier`: Preferred path style for auto imports. Default: `"shortest"`
  Valid options: ["shortest","relative","non-relative","project-relative"]
- `typescript.preferences.importModuleSpecifierEnding`: Preferred path ending for auto imports. Default: `"auto"`
  Valid options: ["auto","minimal","index","js"]
- `typescript.preferences.jsxAttributeCompletionStyle`: Preferred style for JSX attribute completions. Default: `"auto"`
  Valid options: ["auto","braces","none"]
- `typescript.preferences.includePackageJsonAutoImports`: Enable/disable searching `package.json` dependencies for available auto imports. Default: `"auto"`
  Valid options: ["auto","on","off"]
- `typescript.preferences.quoteStyle`: Preferred quote style to use for quick fixes. Default: `"auto"`
  Valid options: ["auto","single","double"]
- `typescript.preferences.useAliasesForRenames`: Enable/disable introducing aliases for object shorthand properties during renames. Requires using TypeScript 3.4 or newer in the workspace. Default: `true`
- `typescript.preferences.autoImportFileExcludePatterns`: Specify glob patterns of files to exclude from auto imports. Requires using TypeScript 4.8 or newer in the workspace.
- `typescript.preferences.renameShorthandProperties`: Enable/disable introducing aliases for object shorthand properties during renames. Requires using TypeScript 3.4 or newer in the workspace. Default: `true`
- `typescript.suggestionActions.enabled`: Enable/disable suggestion diagnostics for TypeScript files in the editor. Requires using TypeScript 2.8 or newer in the workspace. Default: `true`
- `typescript.validate.enable`: Enable/disable TypeScript validation. Default: `true`
- `typescript.suggest.enabled`: Enabled/disable autocomplete suggestions. Default: `true`
- `typescript.suggest.paths`: Enable/disable suggest paths in import statement and require calls Default: `true`
- `typescript.suggest.autoImports`: Enable/disable auto import suggests. Default: `true`
- `typescript.suggest.completeFunctionCalls`: Enable snippet for method suggestion Default: `true`
- `typescript.suggest.includeCompletionsForImportStatements`: Enable/disable auto-import-style completions on partially-typed import statements. Requires using TypeScript 4.3+ in the workspace. Default: `true`
- `typescript.suggest.includeCompletionsWithSnippetText`: Enable/disable snippet completions from TS Server. Requires using TypeScript 4.3+ in the workspace. Default: `true`
- `typescript.suggest.classMemberSnippets.enabled`: Enable/disable snippet completions for class members. Requires using TypeScript 4.5+ in the workspace Default: `true`
- `typescript.suggest.jsdoc.generateReturns`: Enable/disable generating `@return` annotations for JSDoc templates. Requires using TypeScript 4.2+ in the workspace. Default: `true`
- `typescript.format.enable`: Enable format for typescript. Default: `true`
- `typescript.format.insertSpaceAfterCommaDelimiter`: Defines space handling after a comma delimiter. Default: `true`
- `typescript.format.insertSpaceAfterConstructor`: Defines space handling after the constructor keyword. Default: `false`
- `typescript.format.insertSpaceAfterSemicolonInForStatements`: Defines space handling after a semicolon in a for statement. Default: `true`
- `typescript.format.insertSpaceBeforeAndAfterBinaryOperators`: Defines space handling after a binary operator. Default: `true`
- `typescript.format.insertSpaceAfterKeywordsInControlFlowStatements`: Defines space handling after keywords in a control flow statement. Default: `true`
- `typescript.format.insertSpaceAfterFunctionKeywordForAnonymousFunctions`: Defines space handling after function keyword for anonymous functions. Default: `true`
- `typescript.format.insertSpaceBeforeFunctionParenthesis`: Defines space handling before function argument parentheses. Default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis`: Defines space handling after opening and before closing non-empty parenthesis. Default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets`: Defines space handling after opening and before closing non-empty brackets. Default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces`: Defines space handling after opening and before closing empty braces. Default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces`: Defines space handling after opening and before closing non-empty braces. Default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces`: Defines space handling after opening and before closing template string braces. Default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces`: Defines space handling after opening and before closing JSX expression braces. Default: `false`
- `typescript.format.insertSpaceAfterTypeAssertion`: Defines space handling after type assertions in TypeScript. Default: `false`
- `typescript.format.placeOpenBraceOnNewLineForFunctions`: Defines whether an open brace is put onto a new line for functions or not. Default: `false`
- `typescript.format.placeOpenBraceOnNewLineForControlBlocks`: Defines whether an open brace is put onto a new line for control blocks or not. Default: `false`
- `typescript.format.semicolons`: Defines handling of optional semicolons. Requires using TypeScript 3.7 or newer in the workspace. Default: `"ignore"`
  Valid options: ["ignore","insert","remove"]
- `typescript.suggest.includeAutomaticOptionalChainCompletions`: Enable/disable showing completions on potentially undefined values that insert an optional chain call. Requires TS 3.7+ and strict null checks to be enabled. Default: `true`
- `typescript.workspaceSymbols.scope`: Controls which files are searched by [go to symbol in workspace](https://code.visualstudio.com/docs/editor/editingevolved#_open-symbol-by-name). Default: `"allOpenProjects"`
  Valid options: ["allOpenProjects","currentProject"]
- `typescript.autoClosingTags`: Enable/disable automatic closing of JSX tags. Default: `true`
- `typescript.preferGoToSourceDefinition`: Makes Go to Definition avoid type declaration files when possible by triggering Go to Source Definition instead. Requires using TypeScript 4.7+ in the workspace. Default: `false`
- `javascript.showUnused`: Show unused variable hint. Default: `true`
- `javascript.showDeprecated`: Show deprecated variable hint. Default: `true`
- `javascript.updateImportsOnFileMove.enabled`: Enable/disable automatic updating of import paths when you rename or move a file in VS Code. Default: `"prompt"`
  Valid options: ["prompt","always","never"]
- `javascript.implementationsCodeLens.enabled`: Enable/disable implementations CodeLens. This CodeLens shows the implementers of an interface. Default: `false`
- `javascript.referencesCodeLens.enabled`: Enable/disable references CodeLens in JavaScript files. Default: `false`
- `javascript.referencesCodeLens.showOnAllFunctions`: Enable/disable references CodeLens on all functions in JavaScript files. Default: `false`
- `javascript.preferences.importModuleSpecifier`: Preferred path style for auto imports. Default: `"shortest"`
  Valid options: ["shortest","relative","non-relative","project-relative"]
- `javascript.preferences.importModuleSpecifierEnding`: Preferred path ending for auto imports. Default: `"auto"`
  Valid options: ["auto","minimal","index","js"]
- `javascript.preferences.jsxAttributeCompletionStyle`: Preferred style for JSX attribute completions. Default: `"auto"`
  Valid options: ["auto","braces","none"]
- `javascript.preferences.quoteStyle`: Preferred quote style to use for quick fixes. Default: `"auto"`
  Valid options: ["auto","single","double"]
- `javascript.preferences.useAliasesForRenames`: Enable/disable introducing aliases for object shorthand properties during renames. Requires using TypeScript 3.4 or newer in the workspace. Default: `true`
- `javascript.preferences.autoImportFileExcludePatterns`: Specify glob patterns of files to exclude from auto imports. Requires using TypeScript 4.8 or newer in the workspace.
- `javascript.preferences.renameShorthandProperties`: Enable/disable introducing aliases for object shorthand properties during renames. Requires using TypeScript 3.4 or newer in the workspace. Default: `true`
- `javascript.validate.enable`: Enable/disable JavaScript validation. Default: `true`
- `javascript.suggestionActions.enabled`: Enable/disable suggestion diagnostics for JavaScript files in the editor. Requires using TypeScript 2.8 or newer in the workspace. Default: `true`
- `javascript.suggest.names`: Enable/disable including unique names from the file in JavaScript suggestions. Note that name suggestions are always disabled in JavaScript code that is semantically checked using `@ts-check` or `checkJs`. Default: `true`
- `javascript.suggest.enabled`: Enabled/disable autocomplete suggestions. Default: `true`
- `javascript.suggest.paths`: Enable/disable suggest paths in import statement and require calls Default: `true`
- `javascript.suggest.autoImports`: Enable/disable auto import suggests. Default: `true`
- `javascript.suggest.completeFunctionCalls`: Enable snippet for method suggestion Default: `true`
- `javascript.suggest.includeCompletionsForImportStatements`: Enable/disable auto-import-style completions on partially-typed import statements. Requires using TypeScript 4.3+ in the workspace. Default: `true`
- `javascript.suggest.classMemberSnippets.enabled`: Enable/disable snippet completions for class members. Requires using TypeScript 4.5+ in the workspace Default: `true`
- `javascript.suggest.jsdoc.generateReturns`: Enable/disable generating `@return` annotations for JSDoc templates. Requires using TypeScript 4.2+ in the workspace. Default: `true`
- `javascript.format.enable`: Enable format for javascript. Default: `true`
- `javascript.format.insertSpaceAfterCommaDelimiter`: Default: `true`
- `javascript.format.insertSpaceAfterConstructor`: Default: `false`
- `javascript.format.insertSpaceAfterSemicolonInForStatements`: Default: `true`
- `javascript.format.insertSpaceBeforeAndAfterBinaryOperators`: Default: `true`
- `javascript.format.insertSpaceAfterKeywordsInControlFlowStatements`: Default: `true`
- `javascript.format.insertSpaceAfterFunctionKeywordForAnonymousFunctions`: Default: `true`
- `javascript.format.insertSpaceBeforeFunctionParenthesis`: Default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis`: Default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets`: Default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces`: Default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces`: Default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces`: Default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces`: Default: `false`
- `javascript.format.insertSpaceAfterTypeAssertion`: Default: `false`
- `javascript.format.placeOpenBraceOnNewLineForFunctions`: Default: `false`
- `javascript.format.placeOpenBraceOnNewLineForControlBlocks`: Default: `false`
- `javascript.suggest.includeAutomaticOptionalChainCompletions`: Enable/disable showing completions on potentially undefined values that insert an optional chain call. Requires TS 3.7+ and strict null checks to be enabled. Default: `true`
- `typescript.inlayHints.parameterNames.enabled`: Enable/disable inlay hints of parameter names. Default: `"none"`
  Valid options: ["none","literals","all"]
- `typescript.inlayHints.parameterNames.suppressWhenArgumentMatchesName`: Suppress parameter name hints on arguments whose text is identical to the parameter name. Default: `true`
- `typescript.inlayHints.parameterTypes.enabled`: Enable/disable inlay hints of parameter types. Default: `false`
- `typescript.inlayHints.variableTypes.enabled`: Enable/disable inlay hints of variable types. Default: `false`
- `typescript.inlayHints.propertyDeclarationTypes.enabled`: Enable/disable inlay hints of property declarations. Default: `false`
- `typescript.inlayHints.functionLikeReturnTypes.enabled`: Enable/disable inlay hints of return type for function signatures. Default: `false`
- `typescript.inlayHints.enumMemberValues.enabled`: Enable/disable inlay hints of enum member values. Default: `false`
- `typescript.inlayHints.variableTypes.suppressWhenTypeMatchesName`: Suppress type hints on variables whose name is identical to the type name. Requires using TypeScript 4.8+ in the workspace. Default: `true`
- `javascript.inlayHints.parameterNames.enabled`: Enable/disable inlay hints of parameter names. Default: `"none"`
  Valid options: ["none","literals","all"]
- `javascript.inlayHints.parameterNames.suppressWhenArgumentMatchesName`: Suppress parameter name hints on arguments whose text is identical to the parameter name. Default: `true`
- `javascript.inlayHints.parameterTypes.enabled`: Enable/disable inlay hints of parameter types. Default: `false`
- `javascript.inlayHints.variableTypes.enabled`: Enable/disable inlay hints of variable types. Default: `false`
- `javascript.inlayHints.propertyDeclarationTypes.enabled`: Enable/disable inlay hints of property declarations. Default: `false`
- `javascript.inlayHints.functionLikeReturnTypes.enabled`: Enable/disable inlay hints of return type for function signatures. Default: `false`
- `javascript.inlayHints.enumMemberValues.enabled`: Enable/disable inlay hints of enum member values. Default: `false`
- `javascript.inlayHints.variableTypes.suppressWhenTypeMatchesName`: Suppress type hints on variables whose name is identical to the type name. Requires using TypeScript 4.8+ in the workspace. Default: `true`
- `javascript.autoClosingTags`: Enable/disable automatic closing of JSX tags. Default: `true`
- `javascript.preferGoToSourceDefinition`: Makes Go to Definition avoid type declaration files when possible by triggering Go to Source Definition instead. Requires using TypeScript 4.7+ in the workspace. Default: `false`
- `javascript.format.semicolons`: Defines handling of optional semicolons. Requires using TypeScript 3.7 or newer in the workspace. Default: `"ignore"`
  Valid options: ["ignore","insert","remove"]
- `javascript.suggest.completeJSDocs`: Enable/disable suggestion to complete JSDoc comments. Default: `true`
- `typescript.suggest.completeJSDocs`: Enable/disable suggestion to complete JSDoc comments. Default: `true`
- `javascript.suggest.objectLiteralMethodSnippets.enabled`: Enable/disable snippet completions for methods in object literals. Requires using TypeScript 4.7+ in the workspace Default: `true`
- `typescript.suggest.objectLiteralMethodSnippets.enabled`: Enable/disable snippet completions for methods in object literals. Requires using TypeScript 4.7+ in the workspace Default: `true`

Most Configurations are the same as with VSCode. Install
[coc-json](https://github.com/neoclide/coc-json) and try completion with
`tsserver`, `typescript` or `javascript` in your
`coc-settings.json`.

### Differences between VSCode

Added configurations by coc-tsserver:

- `tsserver.useLocalTsdk` only works when used as workspace folder configuration.
- `tsserver.tsconfigPath`
- `tsserver.enable`

Removed configurations:

- `typescript.tsserver.useSeparateSyntaxServer` Use `tsserver.useSyntaxServer` instead.
- `typescript.enablePromptUseWorkspaceTsdk` No propmpts given.
- `typescript.tsc.autoDetect` Used for task, not supported.
- `typescript.surveys.enabled` Not supported.

Renamed configurations to use `tsserver` as prefix:

- `typescript.tsdk` => `tsserver.tsdk`
- `typescript.disableAutomaticTypeAcquisition` => `tsserver.disableAutomaticTypeAcquisition`
- `typescript.npm` => `tsserver.npm`
- `typescript.locale` => `tsserver.locale`
- `typescript.tsserver.maxTsServerMemory` => `tsserver.maxTsServerMemory`
- `typescript.tsserver.watchOptions` => `tsserver.watchOptions`
- `typescript.tsserver.useSyntaxServer` => `tsserver.useSyntaxServer`
- `typescript.tsserver.log` => `tsserver.log`
- `typescript.tsserver.trace` => `tsserver.trace.server`
- `typescript.tsserver.enableTracing` => `tsserver.enableTracing`
- `typescript.tsserver.pluginPaths` => `tsserver.pluginPaths`
- `typescript.reportStyleChecksAsWarnings` => `tsserver.reportStyleChecksAsWarnings`
- `js/ts.implicitProjectConfig.checkJs` => `tsserver.implicitProjectConfig.checkJs`
- `js/ts.implicitProjectConfig.experimentalDecorators` => `tsserver.implicitProjectConfig.experimentalDecorators`
- `js/ts.implicitProjectConfig.module` => `tsserver.implicitProjectConfig.module`
- `js/ts.implicitProjectConfig.target` => `tsserver.implicitProjectConfig.target`
- `js/ts.implicitProjectConfig.strictNullChecks` => `tsserver.implicitProjectConfig.strictNullChecks`
- `js/ts.implicitProjectConfig.strictFunctionTypes` => `tsserver.implicitProjectConfig.strictFunctionTypes`
- `typescript.tsserver.experimental.enableProjectDiagnostics` => `tsserver.experimental.enableProjectDiagnostics`

## Related extensions

- [coc-eslint](https://github.com/neoclide/coc-eslint): enable [eslint](https://github.com/eslint/eslint) plugin for tsserver to lint TypeScript and JavaScript files.
- [coc-tslint-plugin](https://github.com/neoclide/coc-tslint-plugin): enable [tslint](https://github.com/palantir/tslint) plugin for tsserver ([deprecated](https://github.com/palantir/tslint/issues/4534)).
- [coc-styled-components](https://github.com/fannheyward/coc-styled-components/): Styled component for coc.nvim as a tsserver plugin.
- [coc-react-refactor](https://github.com/fannheyward/coc-react-refactor): React refactor extension for coc.nvim, forked from vscode-react-refactor.
- [coc-vetur](https://github.com/neoclide/coc-vetur): [vue](https://github.com/vuejs/vue) extension.
- [coc-angular](https://github.com/iamcco/coc-angular): [angular](https://github.com/angular/angular) extension.

## Troubleshooting

- Add `"tsserver.log": "verbose"` to your `coc-settings.json` (opened by command
  `:CocConfig`)
- To trace LSP communication, add `"tsserver.trace.server": "verbose"` to your
  `coc-settings.json`
- Restart coc server by command `:CocRestart`
- Make the issue happen.
- Open tsserver log file by command `CocCommand tsserver.openTsServerLog`
- Open tsserver output channel by command `CocCommand workspace.showOutput tsserver`

If you find any issues, please [create an
issue](https://github.com/neoclide/coc-tsserver/issues/new).

## Q & A

Q: Automatic type acquisition not work.

A: configure `tsserver.npm` to your global npm path or configure
`"tsserver.disableAutomaticTypeAcquisition": false` to disable automatic typings
installation.

Q: The extension needs some time to work.

A: The initialize of tsserver requires some time, you can add `g:coc_status` to
your status line, see `:h coc-status`. If your tsserver get slow, try exclude
unnecessary files in your jsconfig.json/tsconfig.json, make sure typescript
version > 4.9 and disable logging (disabled by default).

Q: Update import on file rename not work.

A: Make sure install [watchman](https://facebook.github.io/watchman/) in your
\$PATH. Use command `:CocCommand workspace.showOutput watchman` to check
watchman output.

Q: Not work with buffer just created.

A: Tsserver treat buffer without a disk file belongs to implicit project, VSCode
could work because VSCode create empty file first for buffer, save the buffer to
disk to make tsserver work.

Q: Not work with my javascript project.

A: Configure [jsconfig.json](https://code.visualstudio.com/docs/languages/jsconfig) to make
tsserver understand your code. Some features may still not work well, it's
recommended to use typescript.

Q: Not work on WSL.

A: Copy you project files from mounted dirs to linux home otherwise tsserver
may not work properly.

## Sponsoring

If you like coc-tsserver, consider supporting me on Patreon or PayPal:

<a href="https://www.patreon.com/chemzqm"><img src="https://c5.patreon.com/external/logo/become_a_patron_button.png" alt="Patreon donate button" /> </a>
<a href="https://www.paypal.com/paypalme/chezqm"><img src="https://werwolv.net/assets/paypal_banner.png" alt="PayPal donate button" /> </a>

## License

MIT
