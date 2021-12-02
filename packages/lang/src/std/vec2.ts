import {parse} from '../parser'
import {GlobalScope} from '../std/global'

const scope = GlobalScope.extend({})

scope.def('Vec2', parse('(struct "Vec2" {x:Num y:Num})'))

scope.def(
	'Vec2/length',
	parse('(=> v:Vec2 {x = (v "x") y = (v "y") (sqrt (+ (* x x) (* y y)))})')
)

scope.def(
	'Vec2/+',
	parse(`(=> (x:Vec2 y:Vec2)
	           (Vec2 (+ (x "x") (y "x")) (+ (x "y") (y "y"))))`)
)

export default scope
