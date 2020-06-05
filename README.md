# GLISP

<div align="center">
	<img src="public/assets/logo.png" width="200" />
</div>

Glisp stands for Graphical Lisp.

This project is the exploration of what if a design tool meets a way of creative coding and obtain the self-bootstrapping power of LISP.
This tool looks like integration of Illustrator and Processing IDE at a glance. And in fact, it adopts both benefits of intuitiveness of direct manipulation on GUI and abstractness of programming language.

Glisp literally uses a Lisp-like code as a project file. And as the code-as-data concept of Lisp, its project file itself is the program to generate an output at the same time as it is a list of shapes. And even the large part of the app's built-in features are implemented by the same syntax of Lisp as a project file. By this nature so-called [homoiconicity](https://en.wikipedia.org/wiki/Homoiconicity), artists can dramatically hack the app and transform it into any tool which can be specialized for daily graphic design, illustration, generative art, drawing flow-chart, or whatever you want. I call such a design concept "purpose-agnostic". Compared to the most of existing design tools that are strictly optimized for a concrete genre of graphics such as printing or UI of smartphone apps, I believe the attitude that developers intentionally keep being agnostic on how a tool should be used by designers makes it further powerful.

Developed by [Baku Hashimoto](https://baku89.com)

## Helpful Repositories

- The implementation of Lisp interpreter is the modified version of [Make a Lisp project](https://github.com/kanaka/mal).
- Boolean Operator and some bezier manipualations by [Paper.js](http://paperjs.org/).
- Bezier curve analyzation by [Bezier.js](https://pomax.github.io/bezierjs/)

## Similar projects

Information by [Tomoya Matsuura](https://twitter.com/tomoya_nonymous/status/1255647212580646912?s=20)

- [Para](http://alumni.media.mit.edu/~jacobsj/para/) by Jeninifer Jacobs
- [Sketch-n-Sketch](https://ravichugh.github.io/sketch-n-sketch/)

## Development

The project adopts Vue-CLI.

- _Setup_: `yarn install`
- _Launch server for development_: `yarn serve`
- _Build_: `yarn build`
- _Lint_: `yarn lint`

## LICENSE

This repository is published under a MIT License. See the included [LISENCE file](/LICENSE).
