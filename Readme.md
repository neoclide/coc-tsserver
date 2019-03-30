# coc-tsserver

Tsserver language server extension for [coc.nvim](https://github.com/neoclide/coc.nvim).

Most code from `typescript-language-features` extension which bundled with VSCode.

**Note:** if you're using nvm, you need configure `tsserver.npm` to your global
npm executable path.

## Install

In your vim/neovim, run command:

```
:CocInstall coc-tsserver
```

## Features

Almost same as VSCode.

- Support javascript & typescript and jsx/tsx.
- Install typings automatically.
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
- Rename imports on file rename.
- Search for workspace symbols.

Tsserver module is resolved from local workspace, if not found, bundled tsserver
module would be used.

## Configuration options

- `tsserver.enable` set to `false` to disable tsserver language server.
- `tsserver.trace.server` trace LSP traffic in output channel.
- `tsserver.orgnizeImportOnSave` orgnize import on file save, default `false`.
- `tsserver.formatOnType` run format on special character inserted.
- `tsserver.implicitProjectConfig.experimentalDecorators` enable experimentalDecorators for implicit project.
- `typescript.updateImportsOnFileMove.enable` enable update imports on file move, requires [watchman](https://facebook.github.io/watchman/) installed, default `true`.
- `typescript.implementationsCodeLens.enable` enable codeLens for
  implementations, default `true`
- `typescript.referencesCodeLens.enable` enable codeLens for
  references, default `true`
- `typescript.preferences.noSemicolons` remove semicolons on format for
  typescript.
- `typescript.preferences.quoteStyle` quote style of typescript, could be
  `single` or `double`, default `"double"`
- `typescript.suggestionActions.enabled` enable suggestion actions for
  typescript, default `true`
- `typescript.validate.enable` enable typescript validation, default `true`
- `typescript.suggest.enabled` enable typescript completion, default `true`
- `typescript.suggest.paths` enable suggest paths in import statement and
  require calls, default `true`
- `typescript.suggest.autoImports` enable suggest for auto import, default
  `true`
- `typescript.suggest.completeFunctionCalls` enable using snippet for method
  suggestion.
- `javascript.updateImportsOnFileMove.enable` enable update imports on file move, requires [watchman](https://facebook.github.io/watchman/) installed, default `true`.
- `javascript.implementationsCodeLens.enable` enable codeLens for
  implementations, default `true`
- `javascript.referencesCodeLens.enable` enable codeLens for
  references, default `true`
- `javascript.preferences.noSemicolons` remove semicolons on format for
  javascript.
- `javascript.preferences.quoteStyle` quote style of javascript, could be
  `single` or `double`, default `"double"`
- `javascript.suggestionActions.enabled` enable suggestion actions for
  javascript, default `true`
- `javascript.validate.enable` enable javascript validation, default `true`
- `javascript.suggest.enabled` enable javascript completion, default `true`
- `javascript.suggest.paths` enable suggest paths in import statement and
  require calls, default `true`
- `javascript.suggest.autoImports` enable suggest for auto import, default
  `true`
- `javascript.suggest.completeFunctionCalls` enable using snippet for method
  suggestion.

And more, which are same as VSCode, trigger completion with `tsserver`, `typescript`
or `javascript` in your `coc-settings.json` to get full list.

## Related extensions

- [coc-tslint-plugin](https://github.com/neoclide/coc-tslint-plugin): enable [tslint](https://github.com/palantir/tslint)
  plugin for tsserver.
- [coc-vetur](https://github.com/neoclide/coc-vetur): [vue](https://github.com/vuejs/vue) extension.
- [coc-angular](https://github.com/iamcco/coc-angular): [angular](https://github.com/angular/angular) extension.

## Trouble shooting

- Add `"tsserver.log": "verbose"` to your `coc-settings.json` (opened by command
  `:CocConfig`)
- To trace LSP communication, add `"tsserver.trace.server": "verbose"` to your
  `coc-settings.json`
- Restart coc server by command `:CocRestart`
- Make the issue happen.
- Open tsserver log file by command `CocCommand tsserver.openTsServerLog`
- Open tsserver output channel by command `CocCommand workspace.showOutput tsserver`

## License

MIT
