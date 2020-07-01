### *

Returns the product of nums

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & x      | `number`  |              |

**Returns**: `number`


### +

Returns the sum of nums

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & x      | `number`  |              |

**Returns**: `number`


### -

If multiple `xs` are supplied, substracts the rest of `xs` from the first one, else returns the negation of x

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & x      | `number`  |              |

**Returns**: `number`


### .x

Gets x value from vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**Returns**: `number`


### .y

Gets y value from vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**Returns**: `number`


### /

If multiple `xs` are supplied, returns numerator divided by the rest of `xs`, else returns reciprocal number

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & x      | `number`  |              |


### binding

Creates a new binding

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Binds    | `code`    |              |
| Body     | `code`    |              |


### catch

Catch


### ceil

Returns the next largest integer more than or equal to a number

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |

**Returns**: `number`


### clamp

Clamp `x` between two other value

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |
| Min      | `number`  |              |
| Max      | `number`  |              |

**Returns**: `number`


### color/gray

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| v        | ``        |              |

**Returns**: `color`


### color/hsl

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Hue      | `number`  |              |
| Saturation | `number`  |              |
| Lightness | `number`  |              |
| Alpha    | `number`  |              |

**Returns**: `color`

**Alias:** `hsl`


### color/rgb

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Red      | `number`  |              |
| Green    | `number`  |              |
| Blue     | `number`  |              |
| Alpha    | `number`  |              |

**Returns**: `color`

**Alias:** `rgb`


### column

Returns a vector of nums from *from* to *to* (both inclusive) that each of element is multiplied by *step*

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| From     | `number`  | From         |
| To       | `number`  | To           |
| Step     | `number`  | Step         |


### compare

Returns -1 if x < y, 0 if x == y, +1 otherwise

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |
| y        | `number`  |              |

**Returns**: `number`


### const

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `any`     |              |


### cubic-bezier

Calcurates CSS's cubic-bezier

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| t        | `number`  |              |
| x1       | `number`  |              |
| y1       | `number`  |              |
| x2       | `number`  |              |
| y2       | `number`  |              |


### def

Defines a variable

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Symbol   | `symbol`  |              |
| Value    | `any`     |              |


### defmacro

Defines a macro

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Symbol   | `symbol`  |              |
| Params   | `any`     |              |


### defn

Defines a function

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Symbol   | `symbol`  |              |
| Params   | `any`     |              |


### deftime

Defines a numeric variable with playback control

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Symbol   | `symbol`  |              |
| Time     | `number`  |              |
| & _      | ``        |              |


### defvar

Creates a variable which can be changed by the bidirectional evaluation

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Symbol   | `symbol`  |              |
| Value    | `any`     |              |


### deg

Represents an angle in degrees

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Degrees  | `number`  |              |

**Returns**: `number`


### do

Evaluates *forms* in order and returns the value of the last

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & Form   | `code`    |              |


### drop

Returns a sequence of all but the first n items in coll

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| n        | ``        |              |
| Coll     | ``        |              |


### drop-last

Returns a sequence of all but the last n items in coll

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| n        | ``        |              |
| Coll     | ``        |              |


### drop-nth

Returns a sequence of all but the nth item in coll

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| n        | ``        |              |
| Coll     | ``        |              |


### ends-with?

True if *s* ends with substr

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| s        | `string`  |              |
| Substr   | `string`  |              |


### env-chain

Env chain


### eval-in-env

Inside macro, evaluates the expression in a scope that called macro. Otherwise, executes *eval* normally

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Form     | `code`    |              |


### fit

Maps the value in the range `omin`-`omax` and shifts it to the corresponding value in the new range `nmin`-`omax`.

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `number`  |              |
| Old Min  | `number`  |              |
| Old Max  | `number`  |              |
| New Min  | `number`  |              |
| New Max  | `number`  |              |

**Returns**: `number`


### fit01

Maps the value between 0-1 to `min`-`max`

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `number`  |              |
| Min      | `number`  |              |
| Max      | `number`  |              |

**Returns**: `number`


### fit11

Maps the value between -1 - 1 to `min`-`max`

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `number`  |              |
| Min      | `number`  |              |
| Max      | `number`  |              |

**Returns**: `number`


### floor

Returns the largest integer less than or equal to a number

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |

**Returns**: `number`


### fn

Defines a function

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Params   | `code`    |              |
| Form     | `code`    |              |


### fn-params

Gets the list of a function parameter

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Function | `symbol`  |              |


### fn-sugar

syntactic sugar for (fn [] *form*)


### for

Make a iteration loop

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Binds    | `code`    |              |
| & Body   | `code`    |              |


### g

Creates a element group with attributes

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Attribute | `exp`     |              |
| & Body   | `exp`     |              |


### get-all-symbols

Gets all existing symbols


### graphics/background

Fill the entire view or artboard with a color

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Color    | `color`   | A background color |

**Alias:** `background`


### graphics/fill

Creates a fill property

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Color    | `color`   | Color to fill |

**Alias:** `fill`


### graphics/no-fill

Disables all the previous fill styles

**Alias:** `no-fill`


### graphics/no-stroke

Disables all the previous stroke styles

**Alias:** `no-stroke`


### graphics/point-cloud

Creates vector of points

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & Point  | `vec2`    |              |

**Alias:** `point-cloud`


### graphics/stroke

Creates a stroke property

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Color    | `color`   |              |
| Width    | `number`  |              |
| & Options | ``        |              |

**Alias:** `stroke`


### graphics/text

Generates a text shape

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Text     | `string`  | the alphanumeric symbols to be displayed |
| Pos      | `vec2`    |              |
| & Xs     | ``        |              |

**Alias:** `text`


### hex2

Maps the 8-bit value between 0-255 (0xff) to a normalized 0-1

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |

**Returns**: `number`


### if

Evaluates *test*. If truthy, evaluates and yields *then*, otherwise, evaluates and yields *else*. If *else* is not supplied it defaults to nil

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Test     | `code`    |              |
| Then     | `code`    |              |
| Else     | `code`    |              |


### lerp

Calculates a number between two numbers at a specific increment

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `number`  | First value  |
| b        | `number`  | Second value |
| t        | `number`  | Normalized amount to interpolate between the two values |

**Returns**: `number`


### let

Creates a lexical scope

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Binds    | `code`    |              |
| Body     | `code`    |              |


### macro



**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Param    | `code`    |              |
| Form     | `code`    |              |


### macroexpand

Expands the macro


### mat2d

Creates mat2d

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `mat2d`   |              |

**Returns**: `mat2d`


### mat2d/*

Multipies the mat2d's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & Matrix | `mat2d`   |              |

**Returns**: `mat2d`


### mat2d/ident

Returns ident matrix


### mat2d/invert

Inverts `matrix`

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Matrix   | `mat2d`   |              |


### mat2d/pivot

Pivot

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Pos      | `vec2`    |              |
| & Matrix | `mat2d`   |              |

**Returns**: `null`

**Alias:** `pivot`


### mat2d/rotate

Returns rotation matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Angle    | `angle`   |              |

**Returns**: `mat2d`

**Alias:** `rotate`


### mat2d/scale

Returns scaling matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**Returns**: `mat2d`

**Alias:** `scale`


### mat2d/scale-x

Returns scaling matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Sx       | `number`  |              |

**Returns**: `mat2d`

**Alias:** `scale-x`


### mat2d/scale-y

Returns scaling matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Sy       | `number`  |              |

**Returns**: `mat2d`

**Alias:** `scale-y`


### mat2d/translate

Returns translation matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    | Amount of translation |

**Returns**: `null`

**Alias:** `translate`


### mat2d/translate-x

Returns translation matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |

**Returns**: `mat2d`

**Alias:** `translate-x`


### mat2d/translate-y

Returns translation matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| y        | `number`  |              |

**Alias:** `translate-y`


### mat2d?

Checks if x is mat2d

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `any`     |              |

**Returns**: `boolean`


### mod

Modulus of num and div. Truncates toward negative infinity

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |
| y        | `number`  |              |

**Returns**: `number`


### name

Returns the string name of string, symbol or keyword

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `any`     |              |

**Returns**: `string`


### percent

Map the percentage value between 0-100 to normalized 0-1

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `number`  |              |

**Returns**: `number`


### point-cloud/scatter

Scatters points

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Center   | `vec2`    |              |
| Radius   | `number`  |              |
| n        | `number`  |              |
| Seed     | `seed`    |              |


### println

Prints the string with newline

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & Text   | `any`     |              |


### prn

Prints the objects to the console

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & x      | `any`     |              |


### quasiquote

Quasiquote

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Form     | `code`    |              |


### quote

Yields the unevaluated *form*

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Form     | `code`    |              |


### range

Returns a vector of nums from *start* to *end* (exclusive), by *step*

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| End      | `number`  |              |


| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Start    | `number`  |              |
| End      | `number`  |              |


| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Start    | `number`  |              |
| End      | `number`  |              |
| Step     | `number`  |              |


**Returns**: `vector`


### rect2d

Creates a rectangle representing a region

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `rect2d`  |              |


### rect2d/expand

Expands a bound by horizontal and vertical amounts

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Horizontal | `number`  |              |
| Vertical | `number`  |              |
| Bound    | `rect2d`  |              |

**Returns**: `rect2d`


### rect2d/from-to

Creates a bound from two corners

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| From     | ``        |              |
| To       | ``        |              |

**Returns**: `rect2d`


### rnd

Returns a random number between 0-1. Unlike *random*, always returns same value for same *seed*

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Seed     | `number`  |              |

**Returns**: `number`


### round

Returns the value of a number rounded to the nearest integer

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |

**Returns**: `number`


### sqrt

Returns the square root of a number

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |

**Returns**: `number`


### starts-with?

True if *s* ends with substr

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| s        | `string`  |              |
| Substr   | `string`  |              |


### style

Applies a style to elements

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Style    | `exp`     |              |
| & Body   | `exp`     |              |


### take

Retruns a sequence of the first n items in coll

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| n        | ``        |              |
| Coll     | ``        |              |


### take-last

Returns a seq of the last n items in coll

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| n        | ``        |              |
| Coll     | ``        |              |


### to-deg

Converts an angles to degrees

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Radians  | `number`  |              |

**Returns**: `number`


### to-turn

Converts an angles to turn

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Radians  | `number`  |              |

**Returns**: `number`


### transform

Transforms elements

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Transform | `mat2d`   |              |
| & Body   | `exp`     |              |


### try

Try


### turn

Represents an angle in a number of turns

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Turn     | `number`  |              |

**Returns**: `number`


### type

Retruns the type of `x` in keyword

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `any`     |              |

**Returns**: `keyword`


### vec2

Creates vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |


### vec2/*

Multiplies two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `vec2`    |              |
| b        | `vec2`    |              |

**Returns**: `vec2`


### vec2/+

Adds two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| &        | `vec2`    |              |
| Xs       | `vec2`    |              |

**Returns**: `vec2`


### vec2/-

Subtracts *b* from *a*

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `vec2`    |              |
| b        | `vec2`    |              |

**Returns**: `vec2`


### vec2/angle

Returns a angle of vec2 in radians

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**Returns**: `vec2`


### vec2/ceil

Rounds a each element up to the next largest integer

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**Returns**: `vec2`


### vec2/dir

Createsa a vec2 with specified angle and length

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Angle    | `number`  |              |
| Length   | `number`  |              |

**Returns**: `vec2`


### vec2/dist

Calculate the distance between two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `vec2`    |              |
| b        | `vec2`    |              |

**Returns**: `number`


### vec2/div

Divides two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `vec2`    |              |
| b        | `vec2`    |              |

**Returns**: `vec2`


### vec2/dot

Calculates the dot product of two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `vec2`    |              |
| b        | `vec2`    |              |

**Returns**: `number`


### vec2/floor

Replaces a each element with a largest integer less than or equal to it

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**Returns**: `vec2`


### vec2/lerp

Performs a linear interpolation between two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `vec2`    |              |
| b        | `vec2`    |              |
| t        | `number`  |              |

**Returns**: `vec2`


### vec2/max

Returns the maximum of two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `vec2`    |              |
| b        | `vec2`    |              |

**Returns**: `vec2`


### vec2/min

Returns the minimum of two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `vec2`    |              |
| b        | `vec2`    |              |

**Returns**: `vec2`


### vec2/normalize

Normalizes a vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |


### vec2/rotate

Rotates a vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Center   | `vec2`    |              |
| Angle    | `number`  |              |
| Value    | `vec2`    |              |

**Returns**: `vec2`


### vec2/scale

Scales a vec2 by a scalar number

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |
| Scale    | `number`  |              |

**Returns**: `vec2`


### vec2/scale-add

Adds two vec2's after scaling the second operand by a scalar value

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| a        | `vec2`    |              |
| b        | `vec2`    |              |
| Scale    | `number`  |              |

**Returns**: `vec2`


### vec2/transform-mat2d

Transforms the vec2 with a mat2d

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |
| Matrix   | `mat2d`   |              |

**Returns**: `vec2`


### vec2?

Checks if x is vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `any`     |              |

**Returns**: `boolean`


### view-center

Returns the center of view or artboard

**Returns**: `vec2`


### when

Evaluates test. If true, evaluates body in an implicit do

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Test     | `code`    |              |
| & Body   | `code`    |              |


### zero?

Returns true if x is equal to 0

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | ``        |              |

