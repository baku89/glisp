import {BrushDefinition} from '../brush-definition'
import brushes from './brushes.yml'

const BuiltinBrushes = brushes as {
	[name: string]: BrushDefinition
}
export default BuiltinBrushes
