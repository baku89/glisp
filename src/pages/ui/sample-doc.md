# What's Glisp?

As its name implies, the large part of features of Glisp is built on the programming language **Lisp**. While we'll leave the details to [another chapter](why-lisp), Lisp has the notable property that it is both program and data. This duality is called "[code as data](https://en.wikipedia.org/wiki/Code_as_data)" or [homoiconicity](https://en.wikipedia.org/wiki/Homoiconicity) . Therefore, Glisp can use Lisp not only for scripting but also for various data representations such as project files, plugins, and even application settings. And since they are also the programs themselves, it means that each function can be modified, automated, and hacked with the equivalent level of flexibility as programming.

> On Lisp is a comprehensive study of advanced Lisp techniques, with bottom-up programming as the unifying theme. It gives the first complete description of macros and macro applications. The book also covers important subjects related to bottom-up programming, including functional programming, rapid prototyping, interactive development, and embedded languages.

# Glispとは?

一言でいうと、**めちゃめちゃ柔軟で色んな使い方ができる次世代のデザインツール**を探求するプロジェクトです。[橋本麦](https://baku89.com)を中心に、[コントリビューター](https://github.com/baku89/glisp/graphs/contributors)、[スポンサー](https://github.com/sponsors/baku89?o=sd&sc=t)の皆さんの協力の元、オープンソースとして開発を進めています。

---

# A First Level Header

## A Second Level Header

### A Third Level Header

#### A Fourth Level Header

##### A Fifth Level Header

###### A Sixed Level Header

Now is the time for all good men to come to
the aid of their country. This is just a
regular paragraph.

The quick brown fox jumped over the lazy
dog's back.

---

### [Header 3 with Link](https://baku89.com)

> This is a blockquote with two paragraphs. Lorem ipsum dolor sit amet,
> consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
> Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.
>
> Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
> id sem consectetuer libero luctus adipiscing.
>
> ## This is an H2 in a blockquote
>
> This is the first level of quoting.
>
> > This is nested blockquote.
>
> Back to the first level.

Some of these words _are emphasized_.
Some of these words _are emphasized also_.

Use two asterisks for **strong emphasis**.
Or, if you prefer, **use two underscores instead**.

- String
- Number
- Boolean
- Collection

  - List
  - Vector
  - HashMap

- A list item.

With multiple paragraphs.

- Another item in the list.
- This is a list item with two paragraphs. Lorem ipsum dolor
  sit amet, consectetuer adipiscing elit. Aliquam hendrerit
  mi posuere lectus.

- A list item with a bit of `code` inline.
- A list item with a blockquote:

  > This is a blockquote
  > inside a list item.

Here is an example of a pre code block

    (let {square: (=> [x: Number] PosNumber::(* x x))
          w: 20
          c: Color::"Pink"
          p: Vec2::[0 0]}
      (style (fill c)
        (ellipse p [(vec2/x ../center) (square w)])))

### `graphics/artboard`

Creates an artboard

- **Parameter**

  | Name    | Type      | Description                             |
  | ------- | --------- | :-------------------------------------- |
  | Flag    | `Boolean` | This is a description for the parameter |
  | Color   | `Color`   |                                         |
  | Width   | `Number`  |                                         |
  | ...Body | `Shape`   |                                         |

- **Returns**: `item`
- **Alias:** `artboard`
