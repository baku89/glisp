/**
 * vue-tsc, without what it says of pave and geome. They are imported from source, so they
 * come under the settings here, stricter than their own, which `typecheck:modules` holds
 * them to instead. Everything else still has to pass, Tweeq included.
 */

import { spawnSync } from 'node:child_process'

const THEIRS = /^(\.\.\/\.\.\/)?dev_modules\/(pave|geome)\//
const STARTS_ERROR = /^\S.*\(\d+,\d+\): error TS\d+:/

const { status, stdout, stderr, error } = spawnSync('npx', ['vue-tsc', '--noEmit'], {
	encoding: 'utf8',
	maxBuffer: 64 * 1024 * 1024,
})
if (error) throw error

// An error can go on over more lines, which are indented.
const errors = []
const other = []
for (const line of stdout.split('\n')) {
	if (STARTS_ERROR.test(line)) errors.push([line])
	else if (errors.length > 0 && /^\s/.test(line)) errors.at(-1).push(line)
	else if (line.trim() !== '') other.push(line)
}

const ours = errors.filter(([first]) => !THEIRS.test(first))
for (const lines of ours) console.log(lines.join('\n'))
for (const line of other) console.log(line)
process.stderr.write(stderr)
console.log(`${ours.length} errors, and ${errors.length - ours.length} left out in pave and geome`)

// Failing with nothing to say for it is a failure too, such as vue-tsc not running at all.
process.exit(ours.length > 0 || (status !== 0 && errors.length === 0) ? 1 : 0)
