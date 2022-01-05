import {parseModule} from '../parser'
import {PreludeScope} from './prelude'

const MathScope = PreludeScope.extend({})

MathScope.defs(
	parseModule(`
Vec2: (struct "Vec2" {x:Num y:Num})

Vec2/length: (=> v:Vec2 (hypot (v "x") (v "y")))

Vec2/+: (=> [x:Vec2 y:Vec2]
            (Vec2 (+ (x "x") (y "x"))
                  (+ (x "y") (y "y"))))

Vec2/-: (=> [x:Vec2 y:Vec2] (Vec2/+ x (Vec2/neg y)))

Vec2/map: (=> [f:(-> [Num] Num) v:Vec2]
              (Vec2 (f (v "x"))
                    (f (v "y"))))

Vec2/scale: (=> [v:Vec2 s:Num] (Vec2/map (=> [x:Num] (* x s)) v))

Vec2/neg: (=> [v:Vec2] (Vec2/scale v -1))

Vec2/distance: (=> [x:Vec2 y:Vec2] (Vec2/length (Vec2/- x y)))

Vec2/dot: (=> [x:Vec2 y:Vec2]
              (+ (* (x "x") (y "x"))
                 (* (x "y") (y "y"))))


Frac: (struct "Frac" {num:Num den:Num})

Frac/fromNum: (=> [num:Num den:Num] (Frac/reduce (Frac num den)))

Frac/asNum: (=> r:Frac (/ (r "num") (r "den")))

Frac/reduce: (=> r:Frac
                 (let num: (r "num")
                      den: (r "den")
                      g:   (gcd num den)
                      (Frac (/ num g) (/ den g))))

Frac/+: (=> [x:Frac y:Frac]
            (let xn: (x "num")
                 xd: (x "den")
                 yn: (y "num")
                 yd: (y "den")
                 (Frac/fromNum (+ (* xn yd) (* yn xd))
                               (* xd yd))))

Frac/-: (=> [x:Frac y:Frac] (Frac/+ x (Frac/neg y)))

Frac/*: (=> [x:Frac y:Frac]
            (let xn: (x "num")
                 xd: (x "den")
                 yn: (y "num")
                 yd: (y "den")
                 (Frac/fromNum (* (* xn yd) (* yn xd))
                               (* xd yd))))

Frac/scale: (=> [r:Frac s:Num]
                (Frac/fromNum (* (r "num") s) (r "den")))

Frac/neg = (=> r:Frac (Frac/scale r -1))
`)
)

export {MathScope}
