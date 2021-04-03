<template>
	<div class="PageHaptics">
		<p>
			<InputButton label="Connect" @click="connect" />
			{{ isDeviceConnected ? 'Connected' : 'Not Connected' }}
		</p>
		<p>
			<InputButton label="Rumble" @click="rumble" />
		</p>
		<p>
			Low Freq
			<InputSlider
				v-model="lowFreq"
				:min="40"
				:max="640"
				:clamped="true"
				@end-tweak="rumble"
			/>
		</p>
		<p>
			High Freq
			<InputSlider
				v-model="highFreq"
				:min="80"
				:max="1252"
				:clamped="true"
				@end-tweak="rumble"
			/>
		</p>
		<p>
			Amp
			<InputSlider
				v-model="amp"
				:min="0"
				:max="1"
				:clamped="true"
				@end-tweak="rumble"
			/>
		</p>
		<p>
			Duration
			<InputSlider
				v-model="duration"
				:min="0"
				:max="100"
				:clamped="true"
				@end-tweak="rumble"
			/>
		</p>
		<p>
			Sample Integer Value
			<InputSlider
				:modelValue="sampleInteger"
				@update:modelValue="updateSampleInteger"
				:min="0"
				:max="20"
				:clamped="true"
				@end-tweak="rumble"
			/>
		</p>
	</div>
</template>

<script lang="ts">
import {clamp} from 'lodash'
import {computed, defineComponent, ref} from 'vue'

import InputButton from '@/components/inputs/InputButton.vue'
import InputSlider from '@/components/inputs/InputSlider.vue'
import useScheme from '@/components/use/use-scheme'

export default defineComponent({
	name: 'PageHaptics',
	components: {
		InputButton,
		InputSlider,
	},
	setup() {
		useScheme()

		// Status
		const device = ref<any>(null)

		const lowFreq = ref(160)
		const highFreq = ref(320)
		const amp = ref(0.6)
		const duration = ref(50)

		const sampleInteger = ref(10)

		const isDeviceConnected = computed(() => device.value !== null)

		let globalCounter = 0

		// Filter on devices with the Nintendo Switch Joy-Con USB Vendor/Product IDs.
		const filters = [
			{
				vendorId: 0x057e, // Nintendo Co., Ltd
				productId: 0x2006, // Joy-Con Left
			},
			{
				vendorId: 0x057e, // Nintendo Co., Ltd
				productId: 0x2007, // Joy-Con Right
			},
		]

		async function connect() {
			// Prompt user to select a Joy-Con device.
			const [_device] = await (navigator as any).hid.requestDevice({filters})

			if (!_device.opened) {
				await _device.open()
			}

			device.value = _device ?? null
		}

		function createRumbleData(l_f: number, h_f: number, amp: number) {
			// https://github.com/Looking-Glass/JoyconLib/blob/master/Packages/com.lookingglass.joyconlib/JoyconLib_scripts/Joycon.cs
			const data = new Uint8Array(9)

			data[0] = globalCounter++ & 0xff

			if (amp === 0) {
				data[1] = 0x00
				data[2] = 0x01
				data[3] = 0x40
				data[4] = 0x40
			} else {
				l_f = clamp(l_f, 40.875885, 626.286133)
				amp = clamp(amp, 0, 1)
				h_f = clamp(h_f, 81.75177, 1252.572266)

				const hf = (Math.round(32 * Math.log2(h_f * 0.1)) - 0x60) * 4
				const lf = Math.round(32 * Math.log2(l_f * 0.1)) - 0x40
				let hf_amp

				if (amp == 0) hf_amp = 0
				else if (amp < 0.117)
					hf_amp =
						(Math.log2(amp * 1000) * 32 - 0x60) / (5 - Math.pow(amp, 2)) - 1
				else if (amp < 0.23) hf_amp = Math.log2(amp * 1000) * 32 - 0x60 - 0x5c
				else hf_amp = (Math.log2(amp * 1000) * 32 - 0x60) * 2 - 0xf6

				let lf_amp = Math.round(hf_amp) * 0.5
				const parity = lf_amp % 2
				if (parity > 0) --lf_amp

				lf_amp = lf_amp >> 1
				lf_amp += 0x40
				if (parity > 0) lf_amp |= 0x8000

				data[1] = hf & 0xff
				data[2] = hf_amp + ((hf >>> 8) & 0xff)
				data[3] = lf + ((lf_amp >>> 8) & 0xff)
				data[4] += lf_amp & 0xff
			}

			// Copy 1-4 to 5-8
			for (let i = 0; i < 4; ++i) {
				data[5 + i] = data[1 + i]
			}

			return data
		}

		async function setVibrationEnabled(flag: boolean) {
			// First, send a command to enable vibration.
			// Magical bytes come from https://github.com/mzyy94/joycon-toolweb
			const data = [
				globalCounter++ & 0xff,
				0x00,
				0x01,
				0x40,
				0x40,
				0x00,
				0x01,
				0x40,
				0x40,
				0x48,
				flag ? 0x01 : 0x00,
			]

			await device.value.sendReport(0x01, new Uint8Array(data))
		}

		async function delay(millseconds: number) {
			await new Promise(resolve => setTimeout(resolve, millseconds))
		}

		async function sendRumbleData(lf: number, hf: number, amp: number) {
			const rumbleData = createRumbleData(lf, hf, amp)
			await device.value.sendReport(0x10, rumbleData)
		}

		async function rumble() {
			await setVibrationEnabled(true)
			await sendRumbleData(lowFreq.value, highFreq.value, amp.value)

			await delay(duration.value)
			await sendRumbleData(lowFreq.value, highFreq.value, 0)
			// await setVibrationEnabled(false)
		}

		function updateSampleInteger(v: number) {
			const newValue = Math.round(v)
			if (newValue !== sampleInteger.value) {
				rumble()
			}

			sampleInteger.value = newValue
		}

		return {
			isDeviceConnected,
			lowFreq,
			highFreq,
			amp,
			duration,
			sampleInteger,
			connect,
			rumble,
			updateSampleInteger,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'
@import '~@/components/style/global.styl'

html
	font-size 18px

.PageHaptics
	position relative
	padding 2rem
	app()
</style>
