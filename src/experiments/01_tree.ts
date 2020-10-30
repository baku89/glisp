type AST = number | [number | AST, number | AST]

interface DAGLeaf {
	type: 'leaf'
	value: number
}

interface DAGNode {
	type: 'node'
	left: DAG
	right: DAG
	evaluated: number | null
}

type DAG = DAGLeaf | DAGNode

function generateDAG(ast: AST): DAG {
	if (typeof ast === 'number') {
		return {
			type: 'leaf',
			value: ast,
		}
	} else {
		return {
			type: 'node',
			left: generateDAG(ast[0]),
			right: generateDAG(ast[1]),
			evaluated: null,
		}
	}
}

function evalDAG(dag: DAG): number {
	if (dag.type === 'leaf') {
		return dag.value
	} else {
		if (dag.evaluated) {
			return dag.evaluated
		}

		const result = evalDAG(dag.left) + evalDAG(dag.right)
		dag.evaluated = result
		return result
	}
}

function evalAST(ast: AST): number {
	return evalDAG(generateDAG(ast))
}

const ret = evalAST([[[1, 2], 3], 4])
console.log(ret)
