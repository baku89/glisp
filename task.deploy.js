const FtpDeploy = require('ftp-deploy')
const {execSync} = require('child_process')
const ftpDeploy = new FtpDeploy()

const FtpInfo = require('./ftp.info.js')
const gitHash = execSync('git rev-parse HEAD')
	.toString()
	.trim()
	.slice(0, 8)

const config = {
	user: FtpInfo.user,
	// Password optional, prompted if none given
	password: FtpInfo.password,
	host: FtpInfo.host,
	port: FtpInfo.port,
	localRoot: __dirname + '/dist/',
	// remoteRoot: FtpInfo.remoteRoot + '/' + gitHash,
	remoteRoot: FtpInfo.remoteRoot + '/' + gitHash,
	include: ['*', '**/*', '.htaccess'],
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

ftpDeploy.on('uploading', function(data) {
	// console.log(data.totalFilesCount); // total file count being transferred
	// console.log(data.transferredFileCount); // number of files transferred
	console.log('Uploading...', data.filename) // partial path with filename being uploaded
})

const configCommit = {...config}

configCommit.remoteRoot += gitHash

// Upload
;(async () => {
	try {
		const res = await ftpDeploy.deploy(config)
		console.log('Uploaded:', `https://baku89.com/glisp/${gitHash}/`)
	} catch (err) {
		console.log(err)
	}
})()
