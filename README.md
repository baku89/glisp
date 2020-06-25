# Glisp

<div align="center">
	<img src="assets/screenshot.png" />
</div>

<!-- <div align="center">
	<img src="assets/logo.png" width="150" />
</div> -->

Glisp, an acronym for **G**raphical **LISP**, is the prototyping project of what if a design tool meets a way of creative coding and obtain the self-bootstrapping power of LISP.
This tool looks like the integration of Illustrator and Processing IDE at a glance. And in fact, it adopts both benefits of intuitiveness of direct manipulation on GUI and abstractness of programming language.

Glisp literally uses a Lisp-like code as a project file. And as the code-as-data concept of Lisp, its project file itself is the program to generate an output at the same time as it is a list of shapes. And even the large part of the app's built-in features are implemented by the same syntax of Lisp as a project file. By this nature so-called [homoiconicity](https://en.wikipedia.org/wiki/Homoiconicity), artists can dramatically hack the app and transform it into any tool which can be specialized for daily graphic design, illustration, generative art, drawing flow-chart, or whatever you want. I call such a design concept "purpose-agnostic". Compared to the most of existing design tools that are strictly optimized for a concrete genre of graphics such as printing or UI of smartphone apps, I believe the attitude that developers intentionally keep being agnostic on how a tool should be used by designers makes it further powerful.

Developed by [Baku Hashimoto](https://baku89.com)

## Helpful Repositories

- The implementation of Lisp interpreter is the modified version of [Make a Lisp project](https://github.com/kanaka/mal).
- Boolean Operator and some bezier manipulations by [Paper.js](http://paperjs.org/).
- Bezier curve analyzation by [Bezier.js](https://pomax.github.io/bezierjs/)

## Similar and Inspirational Projects

Below are all cool projects I've deeply inspired by.

- Programming-like Drawing Apps

  - [Para](http://alumni.media.mit.edu/~jacobsj/para/) and [Dynamic Brush](http://jenniferjacobs.mat.ucsb.edu/#db) by [Jeninifer Jacobs](http://jenniferjacobs.mat.ucsb.edu/)
  - [Sketch-n-Sketch](https://ravichugh.github.io/sketch-n-sketch/)

- Lisp-based Creative Coding Toolkits

  - [Ronin](https://100r.co/site/ronin.html) by [Hundred Rabitts](https://100r.co/)
  - [Quil](http://www.quil.info/)
  - [snek](https://github.com/inconvergent/snek) by [Anders Hoff](https://inconvergent.net/)

Information by [Tomoya Matsuura](https://twitter.com/tomoya_nonymous/status/1255647212580646912?s=20)

## Supporters

This projects are supported by these kindful people. I'd be appreciated if you would support me to cups of coffee:)

[Sponsor @baku89 on GitHub Sponsors](https://github.com/sponsors/baku89#sponsors)

## Development

The project adopts Vue-CLI.

- _Setup_: `yarn install`
- _Launch server for development_: `yarn serve`
- _Build_: `yarn build`
- _Lint_: `yarn lint`

## Supporters

## LICENSE

This repository is published under an MIT License. See the included [LISENCE file](/LICENSE).
