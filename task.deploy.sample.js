const FtpDeploy = require('ftp-deploy')
const {execSync} = require('child_process')
const ftpDeploy = new FtpDeploy()

const gitHash = execSync('git rev-parse HEAD')
	.toString()
	.trim()
	.slice(0, 8)

const config = {
	user: '<USER>',
	// Password optional, prompted if none given
	password: '<PASSWORD>',
	host: '<HOST>',
	port: 21,
	localRoot: __dirname + '/dist/',
	remoteRoot: '<REMOTE_ROOT>',
	// include: ["*", "**/*"],      // this would upload everything except dot files
	include: ['*', '**/*'],
	// e.g. exclude sourcemaps, and ALL files in node_modules (including dot files)
	exclude: [
		'dist/**/*.map',
		'node_modules/**',
		'node_modules/**/.*',
		'.git/**'
	],
	// delete ALL existing files at destination before uploading, if true
	deleteRemote: true,
	// Passive mode is forced (EPSV command is not sent)
	forcePasv: true
}

const configCommit = {...config}

configCommit.remoteRoot += gitHash

// Upload
;(async () => {
	try {
		const res = await ftpDeploy.deploy(config)
		console.log('Uploaded:', res)
	} catch (err) {
		console.log(err)
	}
})()
