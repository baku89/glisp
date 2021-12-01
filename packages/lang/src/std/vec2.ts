import * as Exp from '../exp'
import {parse} from '../parser'
import {GlobalScope} from '../std/global'
import * as Val from '../val'

const Vec2 = Val.tyProd('Vec2', {x: Val.tyNum, y: Val.tyNum}, [
	Val.num(0),
	Val.num(0),
])

const scope = GlobalScope.extend({
	Vec2: Exp.obj(Vec2),
})

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
