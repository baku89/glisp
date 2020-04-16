import readStr from './reader'
import printExp from './printer'
import evalExp from './eval'
import {replEnv} from './repl'
import Env from './env'

const readEvalStr = (str: string, env: Env) => evalExp(readStr(str), env)

export {readStr, evalExp, printExp, replEnv, readEvalStr}
