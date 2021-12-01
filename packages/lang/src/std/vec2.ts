import * as Exp from '../exp'
import {Writer} from '../utils/Writer'
import * as Val from '../val'

const Vec2 = Val.tyProd('Vec2', {x: Val.tyNum, y: Val.tyNum}, [
	Val.num(0),
	Val.num(0),
])

const scope = Exp.scope({
	Vec2: Exp.obj(Vec2),
	'Vec2/length': Exp.obj(
		Val.fn(
			(v: Val.Prod) => {
				const x = (v.items[0] as Val.Num).value
				const y = (v.items[1] as Val.Num).value
				return Writer.of(Val.num(Math.sqrt(x * x + y * y)))
			},
			{x: Vec2},
			Val.tyNum
		)
	),
	'Vec2/+': Exp.obj(
		Val.fn(
			(x: Val.Prod, y: Val.Prod) => {
				const [x1, y1] = x.items as Val.Num[]
				const [x2, y2] = y.items as Val.Num[]

				const sx = x1.value + x2.value
				const sy = y1.value + y2.value

				return Writer.of(Vec2.of(Val.num(sx), Val.num(sy)))
			},
			{x: Vec2, y: Vec2},
			Vec2
		)
	),
})

export default scope
