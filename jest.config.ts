import type {Config} from '@jest/types'

const config: Config.InitialOptions = {
	verbose: true,
	transform: {
		'\\.pegjs': 'jest-raw-loader',
		'^.+\\.ts$': 'ts-jest',
	},
	moduleNameMapper: {
		'@/(.*)': ['<rootDir>/src/$1'],
	},
}

export default config
