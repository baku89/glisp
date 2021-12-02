import {parseModule} from '../parser'
import {GlobalScope} from '../std/global'

const scope = GlobalScope.extend({})

scope.defs(
	parseModule(`
Vec2 = (struct "Vec2" {x:Num y:Num})

Vec2/length = (=> v:Vec2 {x = (v "x") y = (v "y") (sqrt (+ (* x x) (* y y)))})

Vec2/+ = (=> (x:Vec2 y:Vec2) (Vec2 (+ (x "x") (y "x")) (+ (x "y") (y "y"))))

`)
)

export default scope
