# coc-tsserver

Tsserver language server extension for [coc.nvim](https://github.com/neoclide/coc.nvim).

Most of the code is from `typescript-language-features` extension which is bundled with VSCode.

**Note:** if you're using [nvm](https://github.com/creationix/nvm) or other
node version manager, you need to configure `tsserver.npm` to your global npm
executable path to avoid fetching types on vim start every time.

**Note:** for React to work as expected, you need your JSX filetype to be
`javascript.jsx` and your TSX filetype to be `typescript.jsx` or
`typescript.tsx`. In coc.nvim, these filetypes are mapped to `javascriptreact`
and `typescriptreact` because that's what tsserver uses.

## Install

In your vim/neovim, run command:

```
:CocInstall coc-tsserver
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
  - `tsserver.format`
  - `tsserver.organizeImports`
  - `tsserver.watchBuild`
- Code completion support.
- Go to definition.
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
- Rename symbols support.
- Rename imports on file rename, require [watchman](https://facebook.github.io/watchman/) installed in your \$PATH.
- Search for workspace symbols.

Tsserver module first resolved from your local workspace. If it's not found,
use tsserver from `tsserver.tsdk` configuration or use bundled tsserver with
this extension.

## Configuration options

- `tsserver.enable`:Enable tsserver extension, default: `true`
- `tsserver.locale`:Locale of tsserver, default: `""`
- `tsserver.typingsCacheLocation`:Folder path for cache typings, default: `""`
- `tsserver.formatOnType`:Run format on type special characters., default: `true`
- `tsserver.enableJavascript`:Use tsserver for javascript files, default: `true`
- `tsserver.tsdk`:Directory contains tsserver.js,, default: `""`
- `tsserver.npm`:Executable path of npm for download typings, default: `""`
- `tsserver.log`:Log level of tsserver, default: `"off"`
- `tsserver.trace.server`:Trace level of tsserver, default: `"off"`
- `tsserver.pluginRoot`:Folder contains tsserver plugins, default: `[]`
- `tsserver.debugPort`:Debug port number of tsserver
- `tsserver.reportStyleChecksAsWarnings` default: `true`
- `tsserver.implicitProjectConfig.checkJs`:Enable checkJs for implicit project, default: `false`
- `tsserver.implicitProjectConfig.experimentalDecorators`:Enable experimentalDecorators for implicit project, default: `false`
- `tsserver.disableAutomaticTypeAcquisition`:Disable download of typings, default: `false`
- `tsserver.useBatchedBufferSync`: use batched buffer synchronize support.
- `typescript.updateImportsOnFileMove.enable`:Enable update imports on file move., default: `true`
- `typescript.implementationsCodeLens.enable`:Enable codeLens for implementations, default: `true`
- `typescript.referencesCodeLens.enable`:Enable codeLens for references, default: `true`
- `typescript.preferences.importModuleSpecifier` default: `"non-relative"`
- `typescript.preferences.quoteStyle` default: `"single"`
- `typescript.suggestionActions.enabled`:Enable/disable suggestion diagnostics for TypeScript files in the editor. Requires using TypeScript 2.8 or newer in the workspace., default: `true`
- `typescript.validate.enable`:Enable/disable TypeScript validation., default: `true`
- `typescript.showUnused`: show unused variable hint, default: `true`.
- `typescript.suggest.enabled` default: `true`
- `typescript.suggest.paths`:Enable/disable suggest paths in import statement and require calls, default: `true`
- `typescript.suggest.autoImports`:Enable/disable auto import suggests., default: `true`
- `typescript.suggest.completeFunctionCalls`:Enable snippet for method suggestion, default: `true`
- `typescript.format.insertSpaceAfterCommaDelimiter` default: `true`
- `typescript.format.insertSpaceAfterConstructor` default: `false`
- `typescript.format.insertSpaceAfterSemicolonInForStatements` default: `true`
- `typescript.format.insertSpaceBeforeAndAfterBinaryOperators` default: `true`
- `typescript.format.insertSpaceAfterKeywordsInControlFlowStatements` default: `true`
- `typescript.format.insertSpaceAfterFunctionKeywordForAnonymousFunctions` default: `true`
- `typescript.format.insertSpaceBeforeFunctionParenthesis` default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets` default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces` default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis` default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces` default: `false`
- `typescript.format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces` default: `false`
- `typescript.format.insertSpaceAfterTypeAssertion` default: `false`
- `typescript.format.placeOpenBraceOnNewLineForFunctions` default: `false`
- `typescript.format.placeOpenBraceOnNewLineForControlBlocks` default: `false`
- `javascript.showUnused`: show unused variable hint.
- `javascript.updateImportsOnFileMove.enable` default: `true`
- `javascript.implementationsCodeLens.enable` default: `true`
- `javascript.referencesCodeLens.enable` default: `true`
- `javascript.preferences.importModuleSpecifier` default: `"non-relative"`
- `javascript.preferences.quoteStyle` default: `"single"`
- `javascript.validate.enable`:Enable/disable JavaScript validation., default: `true`
- `javascript.suggestionActions.enabled`:Enable/disable suggestion diagnostics for JavaScript files in the editor. Requires using TypeScript 2.8 or newer in the workspace., default: `true`
- `javascript.suggest.names` default: `true`
- `javascript.suggest.enabled` default: `true`
- `javascript.suggest.paths`:Enable/disable suggest paths in import statement and require calls, default: `true`
- `javascript.suggest.autoImports`:Enable/disable auto import suggests., default: `true`
- `javascript.suggest.completeFunctionCalls`:Enable snippet for method suggestion, default: `true`
- `javascript.format.insertSpaceAfterCommaDelimiter` default: `true`
- `javascript.format.insertSpaceAfterConstructor` default: `false`
- `javascript.format.insertSpaceAfterSemicolonInForStatements` default: `true`
- `javascript.format.insertSpaceBeforeAndAfterBinaryOperators` default: `true`
- `javascript.format.insertSpaceAfterKeywordsInControlFlowStatements` default: `true`
- `javascript.format.insertSpaceAfterFunctionKeywordForAnonymousFunctions` default: `true`
- `javascript.format.insertSpaceBeforeFunctionParenthesis` default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets` default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces` default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis` default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces` default: `false`
- `javascript.format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces` default: `false`
- `javascript.format.insertSpaceAfterTypeAssertion` default: `false`
- `javascript.format.placeOpenBraceOnNewLineForFunctions` default: `false`
- `javascript.format.placeOpenBraceOnNewLineForControlBlocks` default: `false`

Configurations are the same as with VSCode. Try completion with `tsserver`, `typescript`
or `javascript` in your `coc-settings.json`.

## Related extensions

- [coc-tslint-plugin](https://github.com/neoclide/coc-tslint-plugin): enable [tslint](https://github.com/palantir/tslint)
  plugin for tsserver.
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

If you find any issues, please [create an issue](https://github.com/neoclide/coc-tsserver/issues/new).

## License

MIT
