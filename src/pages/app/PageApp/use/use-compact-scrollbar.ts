export default function useCompactScrollBar() {
	const isMacOS = /mac/i.test(navigator.platform)

	// Set the style for platforms other than macOS
	if (!isMacOS) {
		const head = document.head || document.getElementsByTagName('head')
		const style = document.createElement('style')

		head.appendChild(style)

		style.type = 'text/css'
		style.appendChild(
			document.createTextNode(`

			::-webkit-scrollbar {
				width: 0.25rem;
				height: 0.5rem;
			}

			/* Track */
			::-webkit-scrollbar-track {
				display: none;
			}

			/* Handle */
			::-webkit-scrollbar-thumb {
				border-radius: 0.125rem;
				background: rgba(128, 128, 128, 0.3);
			}`)
		)
	}
}
