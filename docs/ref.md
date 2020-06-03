### prn

Prints the objects to the console

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & x      | `any`     |              |


### println

Prints the string with newline

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & Text   | `any`     |              |


### type

Retruns the type of `x` in keyword

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `any`     |              |

**returns** `keyword`


### +

Returns the sum of nums

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & x      | `number`  |              |

**returns** `number`


### -

If no ys are supplied, returns the negation of x, else subtracts the ys from x

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |
| & y      | `number`  |              |

**returns** `number`


### *

Returns the product of nums

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & x      | `number`  |              |

**returns** `number`


### /

If no ys are supplied, returns 1/x, else returns numerator divided by all of the ys

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |
| & y      | `number`  |              |


### mod

Modulus of num and div. Truncates toward negative infinity

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `number`  |              |
| y        | `number`  |              |

**returns** `number`


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


**returns** `vector`


### rnd

Returns a random number between 0-1. Unlike *random*, always returns same value for same *seed*

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | ``        |              |
| %1       | ``        |              |
| %2       | ``        |              |
| %3       | ``        |              |

**returns** `number`


### defmacro

Define a macro

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | ``        |              |
| %1       | ``        |              |


### defn

Define a function

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | ``        |              |
| %1       | ``        |              |


### def

Create a variable

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Symbol   | `symbol`  |              |
| Value    | `any`     |              |


### let

Creates a lexical scope


### do

Evaluates *exprs* in order and returns the value of the last

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & Expr   | `code`    |              |


### if

Evaluates *test*. If truthy, evaluates and yields *then*, otherwise, evaluates and yields *else*. If *else* is not supplied it defaults to nil

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Test     | `code`    |              |
| Then     | `code`    |              |
| Else     | `code`    |              |


### quote

Yields the unevaluated *form*

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Form     | `code`    |              |


### fn

Defines a function

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Params   | `code`    |              |
| Expr     | `code`    |              |


### macro

Defines a macro

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Params   | `code`    |              |
| Expr     | `code`    |              |


### ?

Show the help of function

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Function | `fn`      |              |

**returns** `nil`


### name

Returns the string name of string, symbol or keyword

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `any`     |              |

**returns** `string`


### when

Evaluates test. If true, evaluates body in an implicit do

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `code`    |              |
| & %2     | `code`    |              |


### for

Make a iteration loop

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Binds    | `code`    |              |
| & Body   | `code`    |              |


### zero?

Returns true if x is equal to 0


### percent

Map the percentage value between 0-100 to normalized 0-1

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  |              |


### compare

Returns -1 if x < y, 0 if x == y, +1 otherwise

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  |              |
| %1       | `number`  |              |


### take

Retruns a sequence of the first n items in coll


### drop

Returns a sequence of all but the first n items in coll


### take-last

Returns a seq of the last n items in coll


### drop-last

Returns a sequence of all but the last n items in coll


### ends-with?

True if *s* ends with substr

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `string`  |              |
| %1       | `string`  |              |


### starts-with?

True if *s* ends with substr

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `string`  |              |
| %1       | `string`  |              |


### artboard

Creates an artboard

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Options  | `code`    |              |
| & Body   | `code`    |              |


### color

Creates a color string


### color/gray

**returns** `color`


### color/rgb

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Red      | `number`  |              |
| Green    | `number`  |              |
| Blue     | `number`  |              |

**returns** `color`


### color/hsl

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Hue      | `number`  |              |
| Saturation | `number`  |              |
| Lightness | `number`  |              |

**returns** `color`


### background

Fill the entire view or artboard with a color

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `color`   | A background color |


### column

Returns a vector of nums from *from* to *to* (both inclusive) that each of element is multiplied by *step*

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| From     | `number`  | From         |
| To       | `number`  | To           |
| Step     | `number`  | Step         |


### view-center

Returns the center of view or artboard

**returns** `vec2`


### fill

Creates a fill property

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Color    | `color`   | Color to fill |


### stroke

Creates a stroke property

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Color    | `color`   |              |
| Width    | `number`  |              |
| & %3     | ``        |              |


### text

Generate a text shape

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `string`  | the alphanumeric symbols to be displayed |
| %1       | `vec2`    |              |
| & %3     | ``        |              |


### lerp

Calculates a number between two numbers at a specific increment

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  | First value  |
| %1       | `number`  | Second value |
| %2       | `number`  | Normalized amount to interpolate between the two values |

**returns** `number`


### to-deg

Converts an angles to degrees

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  |              |

**returns** `number`


### deg

Represents an angle in degrees

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  |              |

**returns** `number`


### .x

Gets x value from vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**returns** `number`


### .y

Gets y value from vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**returns** `number`


### vec2

Creates vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |


### vec2?

Checks if x is vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `any`     |              |

**returns** `boolean`


### vec2/+

Adds two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |

**returns** `vec2`


### vec2/-

Subtracts *b* from *a*

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |

**returns** `vec2`


### vec2/*

Multiplies two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |

**returns** `vec2`


### vec2/div

Divides two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |

**returns** `vec2`


### vec2/ceil

Rounds a each element up to the next largest integer

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**returns** `vec2`


### vec2/floor

Replaces a each element with a largest integer less than or equal to it

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**returns** `vec2`


### vec2/min

Returns the minimum of two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |

**returns** `vec2`


### vec2/max

Returns the maximum of two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |

**returns** `vec2`


### vec2/dir

Createsa a vec2 with specified angle and length

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Angle    | `number`  |              |
| Length   | `number`  |              |

**returns** `vec2`


### vec2/angle

Returns a angle of vec2 in radians

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**returns** `vec2`


### vec2/scale

Scales a vec2 by a scalar number

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |
| Scale    | `number`  |              |

**returns** `vec2`


### vec2/scale-add

Adds two vec2's after scaling the second operand by a scalar value

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |
| %2       | `number`  |              |

**returns** `vec2`


### vec2/dist

Calculate the distance between two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |

**returns** `number`


### vec2/rotate

Rotates a vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `number`  |              |
| %2       | `vec2`    |              |

**returns** `vec2`


### vec2/normalize

Normalizes a vec2

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |


### vec2/dot

Calculates the dot product of two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |

**returns** `number`


### vec2/lerp

Performs a linear interpolation between two vec2's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| %1       | `vec2`    |              |
| %2       | `number`  |              |

**returns** `vec2`


### vec2/transform-mat2d

Transforms the vec2 with a mat2d

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `vec2`    |              |
| Matrix   | `mat2d`   |              |

**returns** `vec2`


### mat2d

Creates mat2d

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `mat2d`   |              |

**returns** `mat2d`


### mat2d?

Checks if x is mat2d

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `any`     |              |

**returns** `boolean`


### mat2d/ident

Returns ident matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |


### mat2d/translate

Returns translation matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    | Amount of translation |

**returns** `null`


### mat2d/translate-x

Returns translation matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  |              |

**returns** `mat2d`


### mat2d/translate-y

Returns translation matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  |              |


### mat2d/scale

Returns scaling matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Value    | `vec2`    |              |

**returns** `mat2d`


### mat2d/scale-x

Returns scaling matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  |              |

**returns** `mat2d`


### mat2d/scale-y

Returns scaling matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  |              |

**returns** `mat2d`


### mat2d/rotate

Returns rotation matrix

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| %0       | `number`  |              |

**returns** `mat2d`


### mat2d/invert

Inverts `matrix`

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Matrix   | `mat2d`   |              |


### mat2d/*

Multipies the mat2d's

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| & Matrix | `mat2d`   |              |

**returns** `mat2d`


### mat2d/pivot

Pivot

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| Pos      | `vec2`    |              |
| & Matrix | `mat2d`   |              |

**returns** `null`


### translate

Alias for `mat2d/translate`


### translate-x

Alias for `mat2d/translate-x`


### translate-y

Alias for `mat2d/translate-y`


### scale

Alias for `mat2d/scale`


### scale-x

Alias for `mat2d/scale-x`


### scale-y

Alias for `mat2d/scale-y`


### rotate

Alias for `mat2d/rotate`


### pivot

Alias for `mat2d/pivot`


### rect2d

Creates a rectangle representing a region

**Parameter**

| Name     | Type      | Description  |
| -------- | --------- | :----------- |
| x        | `rect2d`  |              |

