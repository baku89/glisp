// import Env from './env'
// import {
// 	MalList,
// 	MalMap,
// 	MalSeq,
// 	MalSymbol,
// 	MalType,
// 	MalVal,
// 	MalVector,
// } from './types'

// export enum ExpandType {
// 	Constant = 1,
// 	Env,
// 	Unchange,
// }

// export interface ExpandInfoConstant {
// 	type: ExpandType.Constant
// 	exp: MalVal
// }

// export interface ExpandInfoEnv {
// 	type: ExpandType.Env
// 	exp: MalVal
// 	env: Env
// }

// export interface ExpandInfoUnchange {
// 	type: ExpandType.Unchange
// }

// export type ExpandInfo = ExpandInfoConstant | ExpandInfoEnv | ExpandInfoUnchange

// // Expand
// function expandSymbolsInExp(exp: MalVal, env: Env): MalVal {
// 	const type = exp.type
// 	switch (type) {
// 		case MalType.List:
// 		case MalType.Vector: {
// 			let arr = (exp as MalSeq).value.map(val => expandSymbolsInExp(val, env))
// 			return type === MalType.List
// 				? MalList.from(...arr)
// 				:  MalVector.from(...arr)
// 		}
// 		case MalType.Map: {
// 			const map: Record<string, MalVal> = {}
// 			Object.entries(exp as MalMap).forEach(([key, val]) => {
// 				map[key] = expandSymbolsInExp(val, env)
// 			})
// 			return MalMap.from(map)
// 		}
// 		case MalType.Symbol:
// 			if (env.hasOwn(exp as MalSymbol)) {
// 				return env.get(exp as MalSymbol)
// 			} else {
// 				return exp
// 			}
// 		default:
// 			return exp
// 	}
// }

// export function setExpandInfo(exp: MalSeq, info: ExpandInfo) {
// 	exp[M_EXPAND] = info
// }

// export function expandExp(exp: MalVal) {
// 	if (MalList.is(exp) && M_EXPAND in exp) {
// 		const info = exp[M_EXPAND]
// 		switch (info.type) {
// 			case ExpandType.Constant:
// 				return info.exp
// 			case ExpandType.Env:
// 				return expandSymbolsInExp(info.exp, info.env)
// 			case ExpandType.Unchange:
// 				return exp
// 		}
// 	} else {
// 		return exp.evaluated
// 	}
// }
