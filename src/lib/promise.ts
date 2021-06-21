export function loadImage(src: Image['src']): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = e => reject(e)
	})
}
