<template>
	<Tab :tabs="['inputs', 'others']" initialTab="inputs">
		<template #head-inputs>
			<SvgIcon style="font-size: 1.2em">
				<path
					d="M28 6 L4 6 M28 16 L4 16 M28 26 L4 26 M24 3 L24 9 M8 13 L8 19 M20 23 L20 29"
				/>
			</SvgIcon>
			Inputs
		</template>
		<template #head-others>Others</template>
		<template #panel-inputs>
			<h2>Input Components</h2>
			<dl class="PageUI__ui-list">
				<dt>String</dt>
				<dd>
					<InputString v-model="data.string" />
				</dd>
				<dt>Textarea</dt>
				<dd>
					<InputString
						v-model="data.code"
						:multiline="true"
						:monospace="true"
					/>
				</dd>
				<dt>Number</dt>
				<dd><InputNumber v-model="data.number" /></dd>
				<dt>Slider</dt>
				<dd>
					<InputSlider v-model="data.number" :min="0" :max="100" />
				</dd>
				<dt>Dropdown</dt>
				<dd>
					<InputDropdown
						v-model="data.colorSpace"
						:values="['r|g|b', 'svh', 'hsv', 'hvs', 'hsvr']"
						:labels="['RGB', 'SVH', 'HSV', 'HVS', 'Radial']"
					/>
				</dd>
				<dt>Checkbox</dt>
				<dd>
					<InputCheckbox v-model="data.useAlpha" label="Use Alpha" />
				</dd>
				<dt>Radio</dt>
				<dd>
					<InputRadio
						v-model="data.align"
						:values="['left', 'center', 'right']"
					/>
				</dd>
				<dt>Rotery</dt>
				<dd>
					<InputRotery v-model="data.angle" />
				</dd>
				<dt>Seed</dt>
				<dd>
					<InputSeed v-model="data.number" :min="0" :max="100" />
				</dd>
				<dt>Color</dt>
				<dd>
					<InputColor v-model="data.color" :pickers="colorPickers" />
				</dd>
				<dt>Translate</dt>
				<dd>
					<InputTranslate v-model="data.position" :min="0" :max="100" />
					<span class="comment"> Value: [{{ data.position.join(' ') }}]</span>
				</dd>
				<dt>Button</dt>
				<dd>
					<InputButton label="Action" @click="action" />
				</dd>
			</dl>
		</template>
		<template #panel-others> Others!!!! </template>
	</Tab>
</template>
