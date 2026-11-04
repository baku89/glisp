<script setup lang="ts">
defineProps<{
	/** The edge of the window that it comes out of. */
	edge: 'left' | 'right' | 'bottom'
}>()
</script>

<template>
	<!--
		What comes out of an edge of the window, and goes into it by a curve, rather than
		meeting it square. These go behind what is in
		it, and are all here together as a blur only sees through to the canvas from outside of
		anything else that blurs.
	-->
	<div class="EdgeSurface" :class="edge" aria-hidden="true">
		<div class="fill" />
		<div class="line" />
		<div class="fillet first" />
		<div class="fillet last" />
	</div>
</template>

<style scoped>
.EdgeSurface {
	--r: var(--edge-fillet);
	position: absolute;
	/* Over the border that what holds it keeps for itself. */
	inset: -1px;
	z-index: -1;
	border-radius: inherit;
	pointer-events: none;
}
.EdgeSurface.left {
	left: 0;
}
.EdgeSurface.right {
	right: 0;
}
.EdgeSurface.bottom {
	bottom: 0;
}
.fill,
.line {
	position: absolute;
	inset: 0;
	border-radius: inherit;
}
.fill,
.fillet::before {
	background: var(--tq-color-surface);
	backdrop-filter: blur(var(--tq-popup-blur));
}
.fill {
	box-shadow: var(--tq-shadow-popup);
}
/* The line goes on into the curve where it reaches it, rather than on to the edge. */
.line {
	border: 1px solid var(--tq-color-border);
}
.left .line {
	border-left: none;
	clip-path: inset(0 0 0 var(--r));
}
.right .line {
	border-right: none;
	clip-path: inset(0 var(--r) 0 0);
}
.bottom .line {
	border-bottom: none;
	clip-path: inset(0 0 var(--r) 0);
}
/* A square outside of it, with a circle out of it that touches both it and the edge. */
.fillet {
	position: absolute;
	width: var(--r);
	height: var(--r);
}
.fillet::before,
.fillet::after {
	content: '';
	position: absolute;
	inset: 0;
}
.fillet::before {
	mask: radial-gradient(
		circle at var(--center),
		transparent calc(var(--r) - 0.5px),
		black calc(var(--r) + 0.5px)
	);
}
.fillet::after {
	background: radial-gradient(
		circle at var(--center),
		transparent calc(var(--r) - 0.25px),
		var(--tq-color-border) calc(var(--r) + 0.25px),
		var(--tq-color-border) calc(var(--r) + 0.75px),
		transparent calc(var(--r) + 1.25px)
	);
}
.left .fillet {
	left: 0;
}
.right .fillet {
	right: 0;
}
.left .fillet.first,
.right .fillet.first {
	bottom: 100%;
}
.left .fillet.last,
.right .fillet.last {
	top: 100%;
}
.left .first {
	--center: 100% 0;
}
.left .last {
	--center: 100% 100%;
}
.right .first {
	--center: 0 0;
}
.right .last {
	--center: 0 100%;
}
/* Its line is as far in as the one it goes on from. */
.left .first::after,
.right .first::after {
	bottom: -1px;
}
.left .last::after,
.right .last::after {
	top: -1px;
}
.bottom .fillet {
	bottom: 0;
}
.bottom .first {
	--center: 0 0;
	right: 100%;
}
.bottom .last {
	--center: 100% 0;
	left: 100%;
}
.bottom .first::after {
	right: -1px;
}
.bottom .last::after {
	left: -1px;
}
</style>
