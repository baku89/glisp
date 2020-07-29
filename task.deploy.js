const FtpDeploy = require('ftp-deploy')
const {execSync} = require('child_process')
const fetch = require('node-fetch')
const argv = require('yargs').argv
const fs = require('fs')
const FtpInfo = require('./ftp.info.js')

const siteURL = 'https://glisp.app'

const gitHash = execSync('git rev-parse HEAD').toString().trim().slice(0, 7)

async function upload() {
	// Upload to the subdirectory with git hash
	if (argv.commit) {
		await deploy('commit')
	}

	if (argv.docs) {
		await deploy('doc')
	}
}
upload()

async function deploy(mode) {
	const ftpDeploy = new FtpDeploy()

	const urlSuffix = mode === 'commit' ? `commit:${gitHash}` : 'docs'
	const remoteRoot = `${FtpInfo.remoteRoot}/${urlSuffix}`
	const localRoot = `${__dirname}/${mode === 'commit' ? 'dist' : 'docs'}/`
	const publishedURL = `${siteURL}/${urlSuffix}`

	console.log(`Start Uploading: ${publishedURL}`)

	const config = {
		...FtpInfo,
		localRoot,
		remoteRoot,
		include: ['*', '**/*', '.htaccess'],
		exclude: ['**/*.map', 'node_modules/**', 'node_modules/**/.*', '.git/**'],
		// delete ALL existing files at destination before uploading, if true
		deleteRemote: true,
		// Passive mode is forced (EPSV command is not sent)
		forcePasv: true,
	}

	ftpDeploy.on('uploading', function (data) {
		console.log(`[${urlSuffix}]`, 'Uploading...', data.filename)
	})

	// Upload
	try {
		await ftpDeploy.deploy(config)
		console.log(`Uploaded: ${publishedURL}`)
	} catch (err) {
		console.error(err)
	}

	// Update Commits.json
	if (mode === 'commit') {
		const res = await fetch(`${siteURL}/commits.json`)
		const commits = await res.json()
		if (commits.length === 0 || commits[commits.length - 1][0] !== gitHash) {
			commits.push([gitHash, Date.now()])
		}
		fs.writeFileSync(`${localRoot}/commits.json`, JSON.stringify(commits))

		try {
			await ftpDeploy.deploy({
				...FtpInfo,
				localRoot,
				remoteRoot: FtpInfo.remoteRoot,
				include: ['commits.json'],
				forcePasv: true,
			})
			console.log('Updated commits.json')
		} catch (err) {
			console.error(err)
		}
	}
}
