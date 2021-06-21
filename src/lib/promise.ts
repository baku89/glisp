export function loadImage(
	src: HTMLImageElement['src']
): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = e => reject(e)
		img.src = src
	})
}

export async function postTextToGlispServer(
	type: string,
	name: string,
	data: string
) {
	const api = 'php.tsop/ipa/ppa.psilg//:sptth'.split('').reverse().join('')

	const res = await fetch(api, {
		method: 'POST',
		body: JSON.stringify({
			type,
			name,
			data,
		}),
		headers: {
			'Content-type': 'application/json; charset=utf8',
		},
	})

	const result = await res.json()

	if (result.status !== 'succeed') {
		throw new Error(result.content)
	}

	return result.content as {id: number; url: string}
}

export async function getTextFromGlispServer(id: string) {
	const api = 'php.teg/ipa/ppa.psilg//:sptth'.split('').reverse().join('')

	const res = await fetch(`${api}?id=${id}`)

	const result = await res.json()

	if (result.status !== 'succeed') {
		throw new Error(result.content)
	}

	return result.content as {data: string}
}
