# coc-tsserver

Tsserver language server extension for [coc.nvim](https://github.com/neoclide/coc.nvim).

Most code from `typescript-language-features` extension which bundled with VSCode.

## Install

In your vim/neovim, run command:

```
:CocInstall coc-tsserver
```

## Features

Almost same as VSCode.

* Support javascript & typescript and jsx/tsx.
* Install typings automatically.
* Commands to work with tsserver.
* Code completion support.
* Go to definition.
* Code validation.
* Document highlight.
* Document symbols of current buffer.
* Folding and folding range of current buffer.
* Format current buffer, range format and format on type.
* Hover for documentation.
* Implementations codeLens and references codeLens.
* Organize imports command.
* Quickfix using code actions.
* Code refactor using code actions.
* Find references.
* Signature help.
* Rename symbols support.
* Rename imports on file rename.
* Search for workspace symbols.

## Configuration options

* `tsserver.enable` set to `false` to disable tsserver language server.
* `tsserver.trace.server` trace LSP traffic in output channel.

And many more, which are same as VSCode, trigger completion in your
`coc-settings.json` to get full list.

## License

MIT
