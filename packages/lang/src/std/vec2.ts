import {parseModule} from '../parser'
import {GlobalScope} from '../std/global'

const scope = GlobalScope.extend({})

scope.defs(
	parseModule(`
Vec2 = (struct "Vec2" {x:Num y:Num})

Vec2/length = (=> v:Vec2 (hypot (v "x") (v "y")))

Vec2/+ = (=> (x:Vec2 y:Vec2)
             (Vec2 (+ (x "x") (y "x"))
                   (+ (x "y") (y "y"))))

Vec2/- = (=> (x:Vec2 y:Vec2) (Vec2/+ x (Vec2/neg y)))

Vec2/map = (=> (f:(-> Num Num) v:Vec2)
               (Vec2 (f (v "x"))
                     (f (v "y"))))

Vec2/scale = (=> (v:Vec2 s:Num) (Vec2/map (=> x:Num (* x s)) v))

Vec2/neg = (=> v:Vec2 (Vec2/scale v -1))

Vec2/distance = (=> (x:Vec2 y:Vec2) (Vec2/length (Vec2/- x y)))

Vec2/dot = (=> (x:Vec2 y:Vec2)
               (+ (* (x "x") (y "x"))
                  (* (x "y") (y "y"))))
`)
)

export default scope
