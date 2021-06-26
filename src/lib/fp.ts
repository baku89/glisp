// Functional Programming

import {Option} from 'fp-ts/lib/Option'

export type Read<T> = (str: string) => Option<T>

export type Validator<T> = (value: T) => Option<T>
