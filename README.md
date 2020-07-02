# Glisp

<div align="center">
	<img src="assets/screenshot.png" />
</div>

<!-- <div align="center">
	<img src="assets/logo.png" width="150" />
</div> -->

- [Demo (Chrome Only)](https://glisp.app)
- [Documentation (Japanese)](https://glisp.app/docs)

Glisp, an acronym for **G**raphical **LISP**, is the prototyping project to experiment what if a design tool meets a way of creative coding, and obtain the self-bootstrapping power of LISP.
This tool looks like the integration of Illustrator and Processing IDE at a glance. And in fact, it adopts both benefits of intuitiveness of direct manipulation on GUI and abstractness of programming language.

Glisp literally uses a customized dialect of Lisp as a project file. As the [Code as Data](https://en.wikipedia.org/wiki/Code_as_data) concept of Lisp, the project file itself is the program to generate an output at the same time as a tree structure representing SVG-like list of shapes. And even the large part of the app's built-in features are implemented by the identical syntax to project files. By this nature so-called [homoiconicity](https://en.wikipedia.org/wiki/Homoiconicity), artists can dramatically hack the app and transform it into any tool which can be specialized in various realms of graphics -- daily graphic design, illustration, generative art, drawing flow-chart, or whatever they want. I call such a design concept "purpose-agnostic". Compared to the most of existing design tools that are strictly optimized for a concrete genre of graphics such as printing or UI of smartphone apps, I believe the attitude that developers intentionally keep being agnostic on how a tool should be used by designers makes it further powerful.

Developed by [Baku Hashimoto](https://baku89.com)

## Features list I've been fantasizing

✨: High priority  
🍡: Personally think it'd be cool  
🌶️: Important but difficult to implement, while I have no clue how to do

- [ ] UI enhancements
  - [ ] ✨Selects path/group by clicking viewport
  - [ ] ✨Transplants [Programmable Pen Tool](https://s.baku89.com/pentool/animation)
  - [ ] Touch-screen support
  - [ ] Much more intuitive interface for designers I prototyped [here](http://ui.baku89.com/)
- [ ] Improve the GUI to allow non-programmers edit the project without seeing any Lisp code
  - [ ] ✨Layer list view
- [ ] Lisp interpreter optimization/ehnancement
  - [ ] 🌶️ Incremental evaluation system to avoid the overhead by re-calculating entire project for each tweak
  - [ ] [Incremental Lisp parser](https://hal.archives-ouvertes.fr/hal-01887230/document)
  - [ ] 🌶️ Enables to refer other node's value by relative path without explicitly defining a symbol, like Houdini's `ch("../transform/tx")` expression
  - [ ] Headless REPL environment to render images by command (partially supported)
  - [ ] Standalone JS library to dynamically render the sketch embedded in a web page
- [ ] Timeline features
  - [ ] Video exporter
  - [ ] AE-like layer view and curve editor
  - [ ] 🍡 [Velocity/accelation based easing editor](https://www.youtube.com/watch?v=6aBBHjqAc4Y)
- [ ] Raster image manipulation
  - [ ] Writes custom filters in GLSL ([Interactive Shader Format](https://editor.isf.video/) might be useful)
  - [ ] 🍡 Captures still image from video input (e.g. webcam) to make a stop-motion
- [ ] Abstraction of user inputs
  - [ ] Not only mice and keyboards, add support to bind commands with any controller's inputs via OSC/MIDI on the fly while you design. The notion "remembering hotkeys" will be vanished.
  - [ ] 🍡 Wouldn't it be cool if we can even use Leap Motion to record an animation...?
  - [ ] Input hooks. Quantizing, copying, flipping, and smoothing the mouse coordinate for instances.

## Helpful Repositories

- The implementation of Lisp interpreter is the modified version of [Make a Lisp project](https://github.com/kanaka/mal).
- Boolean Operator and some bezier manipulations by [Paper.js](http://paperjs.org/).
- Bezier curve analyzation by [Bezier.js](https://pomax.github.io/bezierjs/)

## Similar and Inspirational Projects

Below are all cool projects I've deeply inspired by.

- Programming-oriented Drawing Apps

  - [Para](http://alumni.media.mit.edu/~jacobsj/para/) and [Dynamic Brush](http://jenniferjacobs.mat.ucsb.edu/#db) by [Jeninifer Jacobs](http://jenniferjacobs.mat.ucsb.edu/)
  - [Sketch-n-Sketch](https://ravichugh.github.io/sketch-n-sketch/)

- Lisp-based Creative Coding Toolkits

  - [Ronin](https://100r.co/site/ronin.html) by [Hundred Rabitts](https://100r.co/)
  - [Quil](http://www.quil.info/)
  - [snek](https://github.com/inconvergent/snek) by [Anders Hoff](https://inconvergent.net/)

- Past researches, products, and plugin-ins for generative design

  - [Autoshop](http://www.signwave.co.uk/go/products/autoshop)
  - [Auto-Illustrator](http://swai.signwave.co.uk/)
  - [Scriptographer](https://scriptographer.org/) and [Paper.js](http://paperjs.org/) by [Jürg Lehni](http://juerglehni.com/)

Informations by [Tomoya Matsuura](https://twitter.com/tomoya_nonymous/status/1255647212580646912?s=20) and [Yasuhiro Tsuchiya](http://www.cbc-net.com/dots/yasuhiro_tsuchiya/tsuchiya_02/)

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
