<template>
	<component :is="tagName" ref="$el">
		<transition
			:name="transition"
			:enter-active-class="enterActiveClass"
			:leave-active-class="leaveActiveClass"
			@after-leave="doDestroy"
		>
			<span ref="popper" :class="rootClass" v-show="!disabled && showPopper">
				<slot>{{ content }}</slot>
			</span>
		</transition>
		<slot name="reference"></slot>
	</component>
</template>

<script lang="ts">
import Popper from 'popper.js'
import {
	defineComponent,
	nextTick,
	onMounted,
	onUnmounted,
	PropType,
	reactive,
	ref,
	toRefs,
	watch,
} from 'vue'

type TriggerType = 'clickToOpen' | 'click' | 'clickToToggle' | 'hover' | 'focus'

export default defineComponent({
	props: {
		tagName: {
			type: String,
			default: 'span',
		},
		trigger: {
			type: String as PropType<TriggerType>,
			default: 'hover',
			validator: (value: TriggerType) =>
				[
					'clickToOpen',
					'click', // Same as clickToToggle, provided for backwards compatibility.
					'clickToToggle',
					'hover',
					'focus',
				].indexOf(value) > -1,
		},
		delayOnMouseOver: {
			type: Number,
			default: 10,
		},
		delayOnMouseOut: {
			type: Number,
			default: 10,
		},
		disabled: {
			type: Boolean,
			default: false,
		},
		content: String,
		enterActiveClass: String,
		leaveActiveClass: String,
		boundariesSelector: String,
		reference: {},
		forceShow: {
			type: Boolean,
			default: false,
		},
		dataValue: {
			default: null,
		},
		appendToBody: {
			type: Boolean,
			default: false,
		},
		visibleArrow: {
			type: Boolean,
			default: true,
		},
		transition: {
			type: String,
			default: '',
		},
		stopPropagation: {
			type: Boolean,
			default: false,
		},
		preventDefault: {
			type: Boolean,
			default: false,
		},
		options: {
			type: Object as PropType<Popper.PopperOptions>,
			default: () => ({}),
		},
		rootClass: {
			type: String,
			default: '',
		},
	},
	setup(props, context) {
		// State
		const $el = ref<null | Element>(null)

		const data = reactive({
			referenceElm: null as null | Element,
			popper: null as null | Element,
			popperJS: null as null | Popper,
			appendedArrow: false,
			appendedToBody: false,
			showPopper: false,
			currentPlacement: '',
			popperOptions: {
				placement: 'bottom',
				computeStyle: {
					gpuAcceleration: false,
				},
			} as Popper.PopperOptions,
			timer: undefined as undefined | number,
		})

		// Methods
		function on(element: Node | null, event: string, handler: any) {
			if (element && event && handler) {
				element.addEventListener(event, handler, false)
			}
		}
		function off(element: Node | null, event: string, handler: any) {
			if (element && event) {
				element.removeEventListener(event, handler, false)
			}
		}

		function doToggle(event: Event) {
			if (props.stopPropagation) {
				event.stopPropagation()
			}
			if (props.preventDefault) {
				event.preventDefault()
			}
			if (!props.forceShow) {
				data.showPopper = !data.showPopper
			}
		}

		function doShow() {
			data.showPopper = true
		}

		function doClose() {
			data.showPopper = false
		}

		function doDestroy() {
			if (data.showPopper) {
				return
			}
			if (data.popperJS) {
				data.popperJS.destroy()
				data.popperJS = null
			}
			if (data.appendedToBody) {
				data.appendedToBody = false
				if (data.popper?.parentElement) {
					document.body.removeChild(data.popper.parentElement)
				}
			}
		}

		function createPopper() {
			nextTick(() => {
				if (props.visibleArrow) {
					appendArrow(data.popper)
				}
				if (props.appendToBody && !data.appendedToBody) {
					data.appendedToBody = true
					if (data.popper?.parentElement) {
						document.body.appendChild(data.popper.parentElement)
					}
				}
				if (data.popperJS && data.popperJS.destroy) {
					data.popperJS.destroy()
				}
				if (props.boundariesSelector) {
					const boundariesElement = document.querySelector(
						props.boundariesSelector
					)
					if (boundariesElement) {
						data.popperOptions.modifiers = Object.assign(
							{},
							data.popperOptions.modifiers
						)
						data.popperOptions.modifiers.preventOverflow = Object.assign(
							{},
							data.popperOptions.modifiers.preventOverflow
						)
						data.popperOptions.modifiers.preventOverflow.boundariesElement = boundariesElement
					}
				}
				data.popperOptions.onCreate = () => {
					context.emit('created')
					nextTick(updatePopper)
				}
				if (data.referenceElm && data.popper) {
					data.popperJS = new Popper(
						data.referenceElm,
						data.popper,
						data.popperOptions
					)
				}
			})
		}

		function destroyPopper() {
			off(data.referenceElm, 'click', doToggle)
			off(data.referenceElm, 'mouseup', doClose)
			off(data.referenceElm, 'mousedown', doShow)
			off(data.referenceElm, 'focus', doShow)
			off(data.referenceElm, 'blur', doClose)
			off(data.referenceElm, 'mouseout', onMouseOut)
			off(data.referenceElm, 'mouseover', onMouseOver)
			document.removeEventListener('click', handleDocumentClick)
			data.showPopper = false
			doDestroy()
		}

		function appendArrow(element: Element | null) {
			if (data.appendedArrow || !element) {
				return
			}
			data.appendedArrow = true
			const arrow = document.createElement('div')
			arrow.setAttribute('x-arrow', '')
			arrow.className = 'popper__arrow'
			element.appendChild(arrow)
		}

		function updatePopper() {
			data.popperJS ? data.popperJS.scheduleUpdate() : createPopper()
		}

		function onMouseOver() {
			clearTimeout(data.timer)
			data.timer = setTimeout(() => {
				data.showPopper = true
			}, props.delayOnMouseOver) as any
		}

		function onMouseOut() {
			clearTimeout(data.timer)
			data.timer = setTimeout(() => {
				data.showPopper = false
			}, props.delayOnMouseOut) as any
		}

		function handleDocumentClick(e: MouseEvent) {
			if (
				!$el.value ||
				!data.referenceElm ||
				elementContains($el.value, e.target) ||
				elementContains(data.referenceElm, e.target) ||
				!data.popper ||
				elementContains(data.popper, e.target)
			) {
				return
			}
			context.emit('document-click')
			if (props.forceShow) {
				return
			}
			data.showPopper = false
		}

		function elementContains(elm: Node, otherElm: any) {
			return elm.contains(otherElm)
		}

		// Hooks
		onMounted(() => {
			data.appendedToBody = false
			data.popperOptions = Object.assign(data.popperOptions, props.options)

			// data.referenceElm = props.reference || context.slots.reference[0].elm
			// data.popper = context.slots.default[0].elm
			switch (props.trigger) {
				case 'clickToOpen':
					on(data.referenceElm, 'click', doShow)
					document.addEventListener('click', handleDocumentClick)
					break
				case 'click': // Same as clickToToggle, provided for backwards compatibility.
				case 'clickToToggle':
					on(data.referenceElm, 'click', doToggle)
					document.addEventListener('click', handleDocumentClick)
					break
				case 'hover':
					on(data.referenceElm, 'mouseover', onMouseOver)
					on(data.popper, 'mouseover', onMouseOver)
					on(data.referenceElm, 'mouseout', onMouseOut)
					on(data.popper, 'mouseout', onMouseOut)
					break
				case 'focus':
					on(data.referenceElm, 'focus', onMouseOver)
					on(data.popper, 'focus', onMouseOver)
					on(data.referenceElm, 'blur', onMouseOut)
					on(data.popper, 'blur', onMouseOut)
					break
			}
		})

		onUnmounted(() => {
			destroyPopper()
		})

		// Watchers
		watch(
			() => data.showPopper,
			value => {
				if (value) {
					context.emit('show')
					if (data.popperJS) {
						data.popperJS.enableEventListeners()
					}
					updatePopper()
				} else {
					if (data.popperJS) {
						data.popperJS.disableEventListeners()
					}
					context.emit('hide')
				}
			}
		)

		watch(
			() => props.forceShow,
			value => (value ? doShow() : doClose()),
			{immediate: true}
		)

		watch(
			() => props.disabled,
			value => {
				if (value) {
					data.showPopper = false
				}
			}
		)

		return {
			...toRefs(data),
			doDestroy,
		}
	},
})
</script>

<style lang="stylus">
.popper
	width: auto
	background-color: #fafafa
	color: #212121
	text-align: center
	padding: 2px
	display: inline-block
	border-radius: 3px
	position: absolute
	font-size: 14px
	font-weight: normal
	border: 1px #ebebeb solid
	z-index: 200000
	box-shadow: rgb(58, 58, 58) 0 0 6px 0

	&__arrow
		width: 0
		height: 0
		border-style: solid
		position: absolute
		margin: 5px

	&[x-placement^='top']
		margin-bottom: 5px


	&[x-placement^='top'] &_arrow
		border-width: 5px 5px 0 5px
		border-color: #fafafa transparent transparent transparent
		bottom: -5px
		left: calc(50% - 5px)
		margin-top: 0
		margin-bottom: 0

	&[x-placement^='bottom']
		margin-top: 5px

	&[x-placement^='bottom'] &__arrow
		border-width: 0 5px 5px 5px
		border-color: transparent transparent #fafafa transparent
		top: -5px
		left: calc(50% - 5px)
		margin-top: 0
		margin-bottom: 0

	&[x-placement^='right']
		margin-left: 5px

	&[x-placement^='right'] &__arrow
		border-width: 5px 5px 5px 0
		border-color: transparent #fafafa transparent transparent
		left: -5px
		top: calc(50% - 5px)
		margin-left: 0
		margin-right: 0

	&[x-placement^='left']
		margin-right: 5px

	&[x-placement^='left'] &__arrow
		border-width: 5px 0 5px 5px
		border-color: transparent transparent transparent #fafafa
		right: -5px
		top: calc(50% - 5px)
		margin-left: 0
		margin-right: 0
</style>
