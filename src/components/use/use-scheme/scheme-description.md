| Theme           | Base16 | Gogh       | SolaDk  | Gogh         | SolaLi  | Gogh         | TmrLi   | Gogh       | TmDk    | Gogh       |
| --------------- | ------ | ---------- | ------- | ------------ | ------- | ------------ | ------- | ---------- | ------- | ---------- |
| app-background  | (ORIG) |            |
| !background     | base00 | background | #002b36 | background   | #fdf6e3 | background   | #ffffff | background | #1d1f21 | background |
| input           | base01 |            | #073642 | black        | #eee8d5 | white        | #e0e0e0 | white      | #282a2e |            |
|                 | base02 |            | #586e75 |              | #93a1a1 | brightCyan   | #d6d6d6 |            | #373b41 |            |
| button, comment | base03 |            | #657b83 | brightBlack  | #839496 | brightBlue   | #8e908c |            | #969896 |            |
|                 | base04 |            | #839496 | foreground   | #657b83 | foreground   | #969896 |            | #b4b7b4 |            |
| textcolor       | base05 | foreground | #93a1a1 |              | #586e75 | brightGreen  | #4d4d4c | foreground | #c5c8c6 | foreground |
|                 | base06 |            | #eee8d5 | white        | #073642 | black        | #282a2e |            | #e0e0e0 |            |
|                 | base07 |            | #fdf6e3 | brightWhite  | #002b36 | brightBlack  | #1d1f21 |            | #ffffff |            |
| error           | base08 | red        | #dc322f | red          | #dc322f | red          | #c82829 | red        | #cc6666 | red        |
| constant        | base09 |            | #cb4b16 |              | #cb4b16 | brightRed    | #f5871f |            | #de935f |            |
|                 | base0A | yellow     | #b58900 | yellow       | #b58900 | brightGreen  | #eab700 | yellow     | #f0c674 | yellow     |
| string          | base0B | green      | #859900 | green        | #859900 | green        | #718c00 | green      | #b5bd68 | green      |
| keyword         | base0C | cyan       | #2aa198 | cyan         | #2aa198 | cyan         | #3e999f | cyan       | #8abeb7 | cyan       |
|                 | base0D | blue       | #268bd2 | blue         | #268bd2 | blue         | #4271ae | blue       | #81a2be | blue       |
| function        | base0E | purple     | #6c71c4 | brightPurple | #6c71c4 | brightPurple | #8959a8 | purple     | #b294bb | purple     |
|                 | base0F |            | #d33682 | purple       | #d33682 | purple       | #a3685a |            | #a3685a |            |

# Alpha

frame = textcolor (alpha: 10%)
translucent = background (alpha: 90%)

# Dynamic to app-background

guide = one of COLORS whose hue is the most opposite to app-background (default: 240)
highlight = one of COLORS whose hue is the most nearest to app-background
