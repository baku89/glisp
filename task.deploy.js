const FtpDeploy = require('ftp-deploy')
const {execSync} = require('child_process')
const argv = require('yargs').argv

const FtpInfo = require('./ftp.info.js')

async function upload() {
	// Upload to the subdirectory with git hash
	if (argv.commit) {
		const gitHash = execSync('git rev-parse HEAD')
			.toString()
			.trim()
			.slice(0, 8)
		await deploy({remoteSubdir: gitHash, deleteRemote: true})
	}

	// Upload to the root
	if (argv.root) {
		await deploy({deleteRemote: false})
	}

	if (argv.doc) {
		await deploy({
			deleteRemote: true,
			localSubdir: 'docs',
			remoteSubdir: 'docs'
		})
	}
}
upload()

async function deploy({remoteSubdir, deleteRemote, localSubdir}) {
	const ftpDeploy = new FtpDeploy()

	const urlSuffix = remoteSubdir ? `/${remoteSubdir}` : ''
	const remoteRoot = `${FtpInfo.remoteRoot}/${urlSuffix}`
	const publishedURL = `https://baku89.com/glisp${urlSuffix}`

	localSubdir = localSubdir || 'dist'

	console.log(`Start Uploading: ${publishedURL}`)

	const config = {
		user: FtpInfo.user,
		// Password optional, prompted if none given
		password: FtpInfo.password,
		host: FtpInfo.host,
		port: FtpInfo.port,
		localRoot: `${__dirname}/${localSubdir}/`,
		remoteRoot,
		include: ['*', '**/*', '.htaccess'],
		exclude: [
			'dist/**/*.map',
			'node_modules/**',
			'node_modules/**/.*',
			'.git/**'
		],
		// delete ALL existing files at destination before uploading, if true
		deleteRemote,
		// Passive mode is forced (EPSV command is not sent)
		forcePasv: true
	}

	ftpDeploy.on('uploading', function(data) {
		// console.log(data.totalFilesCount); // total file count being transferred
		// console.log(data.transferredFileCount); // number of files transferred
		console.log(`[${remoteSubdir || 'ROOT'}]`, 'Uploading...', data.filename) // partial path with filename being uploaded
	})

	// Upload
	try {
		await ftpDeploy.deploy(config)
		console.log(`Uploaded: ${publishedURL}`)
	} catch (err) {
		console.log(err)
	}
}
