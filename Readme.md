# coc-tsserver

Tsserver language server extension for
[coc.nvim](https://github.com/neoclide/coc.nvim).

Tsserver is part of [TypeScript](https://github.com/microsoft/TypeScript) which
provide rich features for javascript and typescript.

This extension is a fork of `typescript-language-features` extension which is
bundled with VSCode.

**Note:** for React to work as expected, you need your JSX filetype to be
`javascript.jsx` or `javascriptreact` and your TSX filetype to be
`typescript.jsx` or `typescript.tsx` or `typescriptreact`. In coc.nvim, these
filetypes are mapped to `javascriptreact` and `typescriptreact` because that's
what tsserver uses. For filetype like `typescript.javascript`, you need
configure `g:coc_filetype_map` variable in vimrc.

**Note** for javascript project, configure
[jsconfig.json](https://code.visualstudio.com/docs/languages/jsconfig) to make
tsserver understand your code.

**Note:** for rename import on file rename, you have to install
[watchman](https://facebook.github.io/watchman/) in your \$PATH.

**Note:** for [nvm](https://github.com/creationix/nvm) users, you need configure
`tsserver.npm` to your global npm path or configure
`"tsserver.disableAutomaticTypeAcquisition": false` to disable automatic typings
installation.

**Note:** tsserver could be quite slow to initialize on big project, exclude
unnecessary files in your jsconfig.json/tsconfig.json.

**Note:** if you're using WSL, copy you project files from mounted dirs to linux home otherwise tsserver will not work properly.

**Note:** tsserver treat buffer without a disk file belongs to implicit project,
some feature may not work as expected.

**Important note:** from v2.0.0, tsserver module resolved first from global
configuration `tsserver.tsdk` and use bundled module when not found, if
`tsserver.useLocalTsdk` is enabled in workspace folder configuration, typescript
module inside current workspace folder would be used when exists.

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
  - `tsserver.organizeImports`
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
- `tsserver.chooseVersion` Choose different typescript version

## Configuration options

Checkout [using the configuration
file](https://github.com/neoclide/coc.nvim/wiki/Using-the-configuration-file)
for guide of coc.nvim's configuration.

- `tsserver.enable`: Enable running of tsserver. default: `true` (added by coc-tsserver)
- `tsserver.useLocalTsdk`: Use tsserver from typescript module in workspace folder, ignore tsserver.tsdk configuration. default: `false` (added by coc-tsserver)
- `tsserver.tsconfigPath`: Path to tsconfig file for the `tsserver.watchBuild` command. Defaults to `tsconfig.json`. default: `"tsconfig.json"` (added by coc-tsserver)
- `tsserver.locale`: default: `"auto"`
  Valid options: ["auto","de","es","en","fr","it","ja","ko","ru","zh-CN","zh-TW"]
- `tsserver.maxTsServerMemory`: Set the maximum amount of memory to allocate to the TypeScript server process default: `3072`
- `tsserver.watchOptions`: Configure which watching strategies should be used to keep track of files and directories. Requires using TypeScript 3.8+ in the workspace.
- `tsserver.tsdk`: default: `""`
- `tsserver.npm`: default: `""`
- `tsserver.log`: Log level of tsserver default: `"off"`
  Valid options: ["normal","terse","verbose","off"]
- `tsserver.trace.server`: Trace level of tsserver default: `"off"`
  Valid options: ["off","messages","verbose"]
- `tsserver.enableTracing`: Enables tracing TS server performance to a directory. These trace files can be used to diagnose TS Server performance issues. The log may contain file paths, source code, and other potentially sensitive information from your project. default: `false`
- `tsserver.pluginPaths`: Additional paths to discover TypeScript Language Service plugins. default: `[]`
- `tsserver.reportStyleChecksAsWarnings`: Report style checks as warnings. default: `true`
- `tsserver.implicitProjectConfig.checkJs`: Enable checkJs for implicit project default: `false`
- `tsserver.implicitProjectConfig.module`: default: `"ESNext"`
  Valid options: ["CommonJS","AMD","System","UMD","ES6","ES2015","ES2020","ESNext","None","ES2022","Node12","NodeNext"]
- `tsserver.implicitProjectConfig.target`: default: `"ES2020"`
  Valid options: ["ES3","ES5","ES6","ES2015","ES2016","ES2017","ES2018","ES2019","ES2020","ES2021","ES2022","ESNext"]
- `tsserver.implicitProjectConfig.strictNullChecks`: default: `true`
- `tsserver.implicitProjectConfig.strictFunctionTypes`: default: `true`
- `tsserver.implicitProjectConfig.experimentalDecorators`: Enable experimentalDecorators for implicit project default: `false`
- `tsserver.disableAutomaticTypeAcquisition`: default: `false`
- `tsserver.useSyntaxServer`: Controls if TypeScript launches a dedicated server to more quickly handle syntax related operations, such as computing code folding. default: `"auto"`
  Valid options: ["always","never","auto"]
- `tsserver.experimental.enableProjectDiagnostics`: (Experimental) Enables project wide error reporting. default: `false`
- `typescript.check.npmIsInstalled`: default: `true`
- `typescript.showUnused`: Show unused variable hint. default: `true`
- `typescript.showDeprecated`: Show deprecated variable hint. default: `true`
- `typescript.updateImportsOnFileMove.enabled`: Enable/disable automatic updating of import paths when you rename or move a file in VS Code. default: `"prompt"`
  Valid options: ["prompt","always","never"]
- `typescript.implementationsCodeLens.enabled`: Enable codeLens for implementations default: `false`
- `typescript.referencesCodeLens.enabled`: Enable codeLens for references default: `false`
- `typescript.referencesCodeLens.showOnAllFunctions`: Enable/disable references CodeLens on all functions in typescript files. default: `false`
- `typescript.preferences.importModuleSpecifier`: Preferred path style for auto imports. default: `"shortest"`
  Valid options: ["shortest","relative","non-relative","project-relative"]
- `typescript.preferences.importModuleSpecifierEnding`: Preferred path ending for auto imports. default: `"auto"`
  Valid options: ["auto","minimal","index","js"]
- `typescript.preferences.jsxAttributeCompletionStyle`: Preferred style for JSX attribute completions. default: `"auto"`
  Valid options: ["auto","braces","none"]
- `typescript.preferences.includePackageJsonAutoImports`: default: `"auto"`
  Valid options: ["auto","on","off"]
- `typescript.preferences.quoteStyle`: default: `"auto"`
  Valid options: ["auto","single","double"]
- `typescript.preferences.useAliasesForRenames`: Enable/disable introducing aliases for object shorthand properties during renames. Requires using TypeScript 3.4 or newer in the workspace. default: `true`
- `typescript.preferences.autoImportFileExcludePatterns`:
- `typescript.preferences.renameShorthandProperties`: Enable/disable introducing aliases for object shorthand properties during renames. Requires using TypeScript 3.4 or newer in the workspace. default: `true`
- `typescript.suggestionActions.enabled`: Enable/disable suggestion diagnostics for TypeScript files in the editor. Requires using TypeScript 2.8 or newer in the workspace. default: `true`
- `typescript.validate.enable`: Enable/disable TypeScript validation. default: `true`
- `typescript.suggest.enabled`: Enabled/disable autocomplete suggestions. default: `true`
- `typescript.suggest.paths`: Enable/disable suggest paths in import statement and require calls default: `true`
- `typescript.suggest.autoImports`: Enable/disable auto import suggests. default: `true`
- `typescript.suggest.completeFunctionCalls`: Enable snippet for method suggestion default: `true`
- `typescript.suggest.includeCompletionsForImportStatements`: Enable/disable auto-import-style completions on partially-typed import statements. Requires using TypeScript 4.3+ in the workspace. default: `true`
- `typescript.suggest.includeCompletionsWithSnippetText`: Enable/disable snippet completions from TS Server. Requires using TypeScript 4.3+ in the workspace. default: `true`
- `typescript.suggest.classMemberSnippets.enabled`: Enable/disable snippet completions for class members. Requires using TypeScript 4.5+ in the workspace default: `true`
- `typescript.suggest.jsdoc.generateReturns`: default: `true`
- `typescript.format.enable`: Enable format for typescript. default: `true`
- `typescript.format.insertSpaceAfterCommaDelimiter`: Defines space handling after a comma delimiter. default: `true`
- `typescript.format.insertSpaceAfterConstructor`: Defines space handling after the constructor keyword. default: `false`
- `typescript.format.insertSpaceAfterSemicolonInForStatements`: Defines space handling after a semicolon in a for statement. default: `true`
- `typescript.format.insertSpaceBeforeAndAfterBinaryOperators`: Defines space handling after a binary operator. default: `true`
- `typescript.format.insertSpaceAfterKeywordsInControlFlowStatements`: Defines space handling after keywords in a control flow statement. default: `true`
- `typescript.format.insertSpaceAfterFunctionKeywordForAnonymousFunctions`: Defines space handling after function keyword for anonymous functions. default: `true`
- `typescript.format.insertSpaceBeforeFunctionParenthesis`: Defines space handling before function argument parentheses. default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis`: Defines space handling after opening and before closing non-empty parenthesis. default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets`: Defines space handling after opening and before closing non-empty brackets. default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces`: Defines space handling after opening and before closing empty braces. default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces`: Defines space handling after opening and before closing non-empty braces. default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces`: Defines space handling after opening and before closing template string braces. default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces`: Defines space handling after opening and before closing JSX expression braces. default: `false`
- `typescript.format.insertSpaceAfterTypeAssertion`: Defines space handling after type assertions in TypeScript. default: `false`
- `typescript.format.placeOpenBraceOnNewLineForFunctions`: Defines whether an open brace is put onto a new line for functions or not. default: `false`
- `typescript.format.placeOpenBraceOnNewLineForControlBlocks`: Defines whether an open brace is put onto a new line for control blocks or not. default: `false`
- `typescript.format.semicolons`: Defines handling of optional semicolons. Requires using TypeScript 3.7 or newer in the workspace. default: `"ignore"`
  Valid options: ["ignore","insert","remove"]
- `typescript.suggest.includeAutomaticOptionalChainCompletions`: Enable/disable showing completions on potentially undefined values that insert an optional chain call. Requires TS 3.7+ and strict null checks to be enabled. default: `true`
- `typescript.workspaceSymbols.scope`: Controls which files are searched by [go to symbol in workspace](https://code.visualstudio.com/docs/editor/editingevolved#_open-symbol-by-name). default: `"allOpenProjects"`
  Valid options: ["allOpenProjects","currentProject"]
- `typescript.autoClosingTags`: Enable/disable automatic closing of JSX tags. default: `true`
- `javascript.showUnused`: Show unused variable hint. default: `true`
- `javascript.showDeprecated`: Show deprecated variable hint. default: `true`
- `javascript.updateImportsOnFileMove.enabled`: Enable/disable automatic updating of import paths when you rename or move a file in VS Code. default: `"prompt"`
  Valid options: ["prompt","always","never"]
- `javascript.implementationsCodeLens.enabled`: Enable/disable implementations CodeLens. This CodeLens shows the implementers of an interface. default: `false`
- `javascript.referencesCodeLens.enabled`: Enable/disable references CodeLens in JavaScript files. default: `false`
- `javascript.referencesCodeLens.showOnAllFunctions`: Enable/disable references CodeLens on all functions in JavaScript files. default: `false`
- `javascript.preferences.importModuleSpecifier`: Preferred path style for auto imports. default: `"shortest"`
  Valid options: ["shortest","relative","non-relative","project-relative"]
- `javascript.preferences.importModuleSpecifierEnding`: Preferred path ending for auto imports. default: `"auto"`
  Valid options: ["auto","minimal","index","js"]
- `javascript.preferences.jsxAttributeCompletionStyle`: Preferred style for JSX attribute completions. default: `"auto"`
  Valid options: ["auto","braces","none"]
- `javascript.preferences.quoteStyle`: default: `"auto"`
  Valid options: ["auto","single","double"]
- `javascript.preferences.useAliasesForRenames`: Enable/disable introducing aliases for object shorthand properties during renames. Requires using TypeScript 3.4 or newer in the workspace. default: `true`
- `javascript.preferences.autoImportFileExcludePatterns`:
- `javascript.preferences.renameShorthandProperties`: Enable/disable introducing aliases for object shorthand properties during renames. Requires using TypeScript 3.4 or newer in the workspace. default: `true`
- `javascript.validate.enable`: Enable/disable JavaScript validation. default: `true`
- `javascript.suggestionActions.enabled`: Enable/disable suggestion diagnostics for JavaScript files in the editor. Requires using TypeScript 2.8 or newer in the workspace. default: `true`
- `javascript.suggest.names`: default: `true`
- `javascript.suggest.enabled`: Enabled/disable autocomplete suggestions. default: `true`
- `javascript.suggest.paths`: Enable/disable suggest paths in import statement and require calls default: `true`
- `javascript.suggest.autoImports`: Enable/disable auto import suggests. default: `true`
- `javascript.suggest.completeFunctionCalls`: Enable snippet for method suggestion default: `true`
- `javascript.suggest.includeCompletionsForImportStatements`: Enable/disable auto-import-style completions on partially-typed import statements. Requires using TypeScript 4.3+ in the workspace. default: `true`
- `javascript.suggest.classMemberSnippets.enabled`: Enable/disable snippet completions for class members. Requires using TypeScript 4.5+ in the workspace default: `true`
- `javascript.suggest.jsdoc.generateReturns`: default: `true`
- `javascript.format.enable`: Enable format for javascript. default: `true`
- `javascript.format.insertSpaceAfterCommaDelimiter`: default: `true`
- `javascript.format.insertSpaceAfterConstructor`: default: `false`
- `javascript.format.insertSpaceAfterSemicolonInForStatements`: default: `true`
- `javascript.format.insertSpaceBeforeAndAfterBinaryOperators`: default: `true`
- `javascript.format.insertSpaceAfterKeywordsInControlFlowStatements`: default: `true`
- `javascript.format.insertSpaceAfterFunctionKeywordForAnonymousFunctions`: default: `true`
- `javascript.format.insertSpaceBeforeFunctionParenthesis`: default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis`: default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets`: default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces`: default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces`: default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces`: default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces`: default: `false`
- `javascript.format.insertSpaceAfterTypeAssertion`: default: `false`
- `javascript.format.placeOpenBraceOnNewLineForFunctions`: default: `false`
- `javascript.format.placeOpenBraceOnNewLineForControlBlocks`: default: `false`
- `javascript.suggest.includeAutomaticOptionalChainCompletions`: Enable/disable showing completions on potentially undefined values that insert an optional chain call. Requires TS 3.7+ and strict null checks to be enabled. default: `true`
- `typescript.inlayHints.parameterNames.enabled`: Enable/disable inlay hints of parameter names. default: `"none"`
  Valid options: ["none","literals","all"]
- `typescript.inlayHints.parameterNames.suppressWhenArgumentMatchesName`: Suppress parameter name hints on arguments whose text is identical to the parameter name. default: `true`
- `typescript.inlayHints.parameterTypes.enabled`: Enable/disable inlay hints of parameter types. default: `false`
- `typescript.inlayHints.variableTypes.enabled`: Enable/disable inlay hints of variable types. default: `false`
- `typescript.inlayHints.propertyDeclarationTypes.enabled`: Enable/disable inlay hints of property declarations. default: `false`
- `typescript.inlayHints.functionLikeReturnTypes.enabled`: Enable/disable inlay hints of return type for function signatures. default: `false`
- `typescript.inlayHints.enumMemberValues.enabled`: Enable/disable inlay hints of enum member values. default: `false`
- `typescript.inlayHints.variableTypes.suppressWhenTypeMatchesName`: default: `true`
- `javascript.inlayHints.parameterNames.enabled`: Enable/disable inlay hints of parameter names. default: `"none"`
  Valid options: ["none","literals","all"]
- `javascript.inlayHints.parameterNames.suppressWhenArgumentMatchesName`: Suppress parameter name hints on arguments whose text is identical to the parameter name. default: `true`
- `javascript.inlayHints.parameterTypes.enabled`: Enable/disable inlay hints of parameter types. default: `false`
- `javascript.inlayHints.variableTypes.enabled`: Enable/disable inlay hints of variable types. default: `false`
- `javascript.inlayHints.propertyDeclarationTypes.enabled`: Enable/disable inlay hints of property declarations. default: `false`
- `javascript.inlayHints.functionLikeReturnTypes.enabled`: Enable/disable inlay hints of return type for function signatures. default: `false`
- `javascript.inlayHints.enumMemberValues.enabled`: Enable/disable inlay hints of enum member values. default: `false`
- `javascript.inlayHints.variableTypes.suppressWhenTypeMatchesName`: default: `true`
- `javascript.autoClosingTags`: Enable/disable automatic closing of JSX tags. default: `true`
- `javascript.format.semicolons`: Defines handling of optional semicolons. Requires using TypeScript 3.7 or newer in the workspace. default: `"ignore"`
  Valid options: ["ignore","insert","remove"]
- `javascript.suggest.completeJSDocs`: Enable/disable suggestion to complete JSDoc comments. default: `true`
- `typescript.suggest.completeJSDocs`: Enable/disable suggestion to complete JSDoc comments. default: `true`
- `javascript.suggest.objectLiteralMethodSnippets.enabled`: Enable/disable snippet completions for methods in object literals. Requires using TypeScript 4.7+ in the workspace default: `true`
- `typescript.suggest.objectLiteralMethodSnippets.enabled`: Enable/disable snippet completions for methods in object literals. Requires using TypeScript 4.7+ in the workspace default: `true`

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
- `typescript.tsc.autoDetect` Used for task, no such feature.
- `typescript.surveys.enabled` No such feature.

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

## Sponsoring

If you like coc-tsserver, consider supporting me on Patreon or PayPal:

<a href="https://www.patreon.com/chemzqm"><img src="https://c5.patreon.com/external/logo/become_a_patron_button.png" alt="Patreon donate button" /> </a>
<a href="https://www.paypal.com/paypalme/chezqm"><img src="https://werwolv.net/assets/paypal_banner.png" alt="PayPal donate button" /> </a>

## License

MIT
