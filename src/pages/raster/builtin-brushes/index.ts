import {BrushDefinition} from '../brush-definition'
import brush from './brush.yml'
import pinch from './pinch.yml'

const BuiltinBrushes = {brush, pinch} as {
	[name: string]: BrushDefinition
}
export default BuiltinBrushes
