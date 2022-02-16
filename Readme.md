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

## Supporting

If you like my extension, consider supporting me on Patreon or PayPal:

<a href="https://www.patreon.com/chemzqm"><img src="https://c5.patreon.com/external/logo/become_a_patron_button.png" alt="Patreon donate button" /> </a>
<a href="https://www.paypal.com/paypalme/chezqm"><img src="https://werwolv.net/assets/paypal_banner.png" alt="PayPal donate button" /> </a>

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

Tsserver module first resolved from your local workspace. If it's not found, use
tsserver from `tsserver.tsdk` configuration or use bundled tsserver with this
extension.

## Configuration options

Checkout [using the configuration
file](https://github.com/neoclide/coc.nvim/wiki/Using-the-configuration-file)
for guide of coc.nvim's configuration.

- `tsserver.enable`:Enable tsserver extension, default: `true`
- `tsserver.locale`:Locale of tsserver, default: `""`
- `tsserver.ignoreLocalTsserver`:Always use tsserver module from tsserver.tsdk
  or coc-tsserver extension.
- `tsserver.typingsCacheLocation`:Folder path for cache typings, default: `""`
- `tsserver.formatOnType`:Run format on type special characters., default:
  `true`
- `tsserver.enableJavascript`:Use tsserver for javascript files, default: `true`
- `tsserver.maxTsServerMemory`:Set the maximum amount of memory to allocate to
  the TypeScript server process
- `tsserver.tsdk`:Directory contains tsserver.js,, default: `""`
- `tsserver.npm`:Executable path of npm for download typings, default: `""`
- `tsserver.log`:Log level of tsserver, default: `"off"`
- `tsserver.trace.server`:Trace level of tsserver, default: `"off"`
- `tsserver.pluginPaths`:Folders contains tsserver plugins, default: `[]`
- `tsserver.watchOptions`:Configure which watching strategies should be used to
  keep track of files and directories. Requires using TypeScript 3.8+ in the
  workspace, default: `undefined`
- `tsserver.reportStyleChecksAsWarnings` default: `true`
- `tsserver.implicitProjectConfig.checkJs`:Enable checkJs for implicit project,
  default: `false`
- `tsserver.implicitProjectConfig.experimentalDecorators`:Enable
  experimentalDecorators for implicit project, default: `false`
- `tsserver.disableAutomaticTypeAcquisition`:Disable download of typings,
  default: `false`
- `tsserver.useBatchedBufferSync`: use batched buffer synchronize support, default: `true`
- `tsserver.enableTracing`: Enables tracing TS server performance to a
  directory. These trace files can be used to diagnose TS Server performance
  issues. The log may contain file paths, source code, and other potentially
  sensitive information from your project, default: `false`
- `typescript.check.npmIsInstalled`: Check if npm is installed for [Automatic
  Type
  Acquisition](https://code.visualstudio.com/docs/nodejs/working-with-javascript#_typings-and-automatic-type-acquisition).
- `typescript.updateImportsOnFileMove.enable`:Enable update imports on file
  move., default: `true`
- `typescript.implementationsCodeLens.enable`:Enable codeLens for
  implementations, default: `true`
- `typescript.referencesCodeLens.enable`:Enable codeLens for references,
  default: `true`
- `typescript.referencesCodeLens.showOnAllFunctions`: Enable/disable references CodeLens on all functions in typescript files. Default: `false`
- `typescript.preferences.importModuleSpecifier` default: `"shortest"`
- `typescript.preferences.importModuleSpecifierEnding` default: `"auto"`
- `typescript.preferences.quoteStyle` default: `"single"`
- `typescript.preferences.includePackageJsonAutoImports`: Enable/disable
  searching `package.json` dependencies for available auto imports, default:
  `"auto"`
- `typescript.suggestionActions.enabled`:Enable/disable suggestion diagnostics
  for TypeScript files in the editor. Requires using TypeScript 2.8 or newer in
  the workspace., default: `true`
- `typescript.validate.enable`:Enable/disable TypeScript validation., default:
  `true`
- `typescript.showUnused`: show unused variable hint, default: `true`.
- `typescript.autoClosingTags`: Enable/disable autoClosing of JSX tags, default: `true`
- `typescript.suggest.enabled` default: `true`
- `typescript.suggest.paths`:Enable/disable suggest paths in import statement
  and require calls, default: `true`
- `typescript.suggest.autoImports`:Enable/disable auto import suggests,
  default: `true`
- `typescript.suggest.completeFunctionCalls`:Enable snippet for method
  suggestion, default: `true`
- `typescript.suggest.includeCompletionsForImportStatements`: Enable/disable
  auto-import-style completions on partially-typed import statements. Requires using
  TypeScript 4.3+ in the workspace, default: `true`
- `typescript.suggest.includeCompletionsWithSnippetText`: Enable snippet completions
  from TS Server. Requires using TypeScript 4.3+ in the workspace, default: `true`
- `typescript.suggest.classMemberSnippets.enabled`: Enable/disable
  snippet completions for class members. Requires using TypeScript 4.5+ in the
  workspace, default: `true`
- `typescript.suggest.jsdoc.generateReturns`: Enable/disable generating
  `@return` annotations for JSDoc templates. Requires using TypeScript 4.2+ in
  the workspace. default: `true`
- `typescript.suggest.includeAutomaticOptionalChainCompletions`: default: `true`
- `typescript.format.enabled`:Enable/disable format of typescript files.
- `typescript.format.insertSpaceAfterCommaDelimiter` default: `true`
- `typescript.format.insertSpaceAfterConstructor` default: `false`
- `typescript.format.insertSpaceAfterSemicolonInForStatements` default: `true`
- `typescript.format.insertSpaceBeforeAndAfterBinaryOperators` default: `true`
- `typescript.format.insertSpaceAfterKeywordsInControlFlowStatements` default:
  `true`
- `typescript.format.insertSpaceAfterFunctionKeywordForAnonymousFunctions`
  default: `true`
- `typescript.format.insertSpaceBeforeFunctionParenthesis` default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets`
  default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces`
  default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces`
  default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis`
  default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces`
  default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces`
  default: `false`
- `typescript.format.insertSpaceAfterTypeAssertion` default: `false`
- `typescript.format.placeOpenBraceOnNewLineForFunctions` default: `false`
- `typescript.format.placeOpenBraceOnNewLineForControlBlocks` default: `false`
- `typescript.inlayHints`: inlayHints related options.
- `javascript.format.enabled`: Enable/disable format for javascript files, default: `true`
- `javascript.showUnused`: show unused variable hint, default: `true`
- `javascript.autoClosingTags`: Enable/disable autoClosing of JSX tags, default: `true`
- `javascript.updateImportsOnFileMove.enable` default: `true`
- `javascript.implementationsCodeLens.enable` default: `true`
- `javascript.referencesCodeLens.enable` default: `true`
- `javascript.referencesCodeLens.showOnAllFunctions`: Enable/disable references CodeLens on all functions in JavaScript files default: `false`
- `javascript.preferences.importModuleSpecifier` default: `"shortest"`
- `javascript.preferences.importModuleSpecifierEnding` default: `"auto"`
- `javascript.preferences.quoteStyle` default: `"single"`
- `javascript.validate.enable`: Enable/disable JavaScript validation., default:
  `true`
- `javascript.suggestionActions.enabled`: Enable/disable suggestion diagnostics
  for JavaScript files in the editor. Requires using TypeScript 2.8 or newer in
  the workspace., default: `true`
- `javascript.suggest.names`: default `true`
- `javascript.suggest.enabled`: default `true`
- `javascript.suggest.paths`: Enable/disable suggest paths in import statement
  and require calls, default: `true`
- `javascript.suggest.autoImports`: Enable/disable auto import suggests.,
  default: `true`
- `javascript.suggest.completeFunctionCalls`:Enable snippet for method
  suggestion, default: `true`
- `javascript.suggest.includeCompletionsForImportStatements`: Enable/disable
  auto-import-style completions on partially-typed import statements. Requires
  using TypeScript 4.3+ in the workspace, default: `true`
- `javascript.suggest.jsdoc.generateReturns`: Enable/disable generating
  `@return` annotations for JSDoc templates. Requires using TypeScript 4.2+ in
  the workspace. default: `true`
- `javascript.suggest.classMemberSnippets.enabled`: Enable/disable
  snippet completions for class members. Requires using TypeScript 4.5+ in the
  workspace, default: `true`
- `javascript.suggest.includeAutomaticOptionalChainCompletions`: default: `true`
- `javascript.format.insertSpaceAfterCommaDelimiter` default: `true`
- `javascript.format.insertSpaceAfterConstructor` default: `false`
- `javascript.format.insertSpaceAfterSemicolonInForStatements` default: `true`
- `javascript.format.insertSpaceBeforeAndAfterBinaryOperators` default: `true`
- `javascript.format.insertSpaceAfterKeywordsInControlFlowStatements` default:
  `true`
- `javascript.format.insertSpaceAfterFunctionKeywordForAnonymousFunctions`
  default: `true`
- `javascript.format.insertSpaceBeforeFunctionParenthesis` default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets`
  default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces`
  default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces`
  default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis`
  default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces`
  default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces`
  default: `false`
- `javascript.format.insertSpaceAfterTypeAssertion` default: `false`
- `javascript.format.placeOpenBraceOnNewLineForFunctions` default: `false`
- `javascript.format.placeOpenBraceOnNewLineForControlBlocks` default: `false`
- `javascript.inlayHints`: inlayHints related options.

Configurations are the same as with VSCode. Install
[coc-json](https://github.com/neoclide/coc-json) and try completion with
`tsserver`, `typescript` or `javascript` in your
`coc-settings.json`.

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

## License

MIT
