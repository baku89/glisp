import {languages} from 'monaco-editor'

languages.register({id: 'glsl'})

languages.setLanguageConfiguration('glsl', {
	comments: {
		lineComment: '//',
		blockComment: ['/*', '*/'],
	},
	brackets: [
		['{', '}'],
		['[', ']'],
		['(', ')'],
	],
	autoClosingPairs: [
		{open: '[', close: ']'},
		{open: '{', close: '}'},
		{open: '(', close: ')'},
	],
	surroundingPairs: [
		{open: '{', close: '}'},
		{open: '[', close: ']'},
		{open: '(', close: ')'},
	],
})

languages.setMonarchTokensProvider('glsl', {
	defaultToken: '',

	brackets: [
		{token: 'delimiter.curly', open: '{', close: '}'},
		{token: 'delimiter.parenthesis', open: '(', close: ')'},
		{token: 'delimiter.square', open: '[', close: ']'},
		{token: 'delimiter.angle', open: '<', close: '>'},
	],

	// GL Variables
	glVariables:
		/BackColor|BackLightModelProduct|BackLightProduct|BackMaterial|BackSecondaryColor|ClipDistance|ClipPlane|ClipVertex|Color|DepthRange|DepthRangeParameters|EyePlaneQ|EyePlaneR|EyePlaneS|EyePlaneT|Fog|FogCoord|FogFragCoord|FogParameters|FragColor|FragCoord|FragData|FragDepth|FrontColor|FrontFacing|FrontLightModelProduct|FrontLightProduct|FrontMaterial|FrontSecondaryColor|InstanceID|Layer|LightModel|LightModelParameters|LightModelProducts|LightProducts|LightSource|LightSourceParameters|MaterialParameters|ModelViewMatrix|ModelViewMatrixInverse|ModelViewMatrixInverseTranspose|ModelViewMatrixTranspose|ModelViewProjectionMatrix|ModelViewProjectionMatrixInverse|ModelViewProjectionMatrixInverseTranspose|ModelViewProjectionMatrixTranspose|MultiTexCoord[0-7]|Normal|NormalMatrix|NormalScale|ObjectPlaneQ|ObjectPlaneR|ObjectPlaneS|ObjectPlaneT|Point|PointCoord|PointParameters|PointSize|Position|PrimitiveIDIn|ProjectionMatrix|ProjectionMatrixInverse|ProjectionMatrixInverseTranspose|ProjectionMatrixTranspose|SecondaryColor|TexCoord|TextureEnvColor|TextureMatrix|TextureMatrixInverse|TextureMatrixInverseTranspose|TextureMatrixTranspose|Vertex|VertexID/,

	glConstants:
		/MaxClipPlanes|MaxCombinedTextureImageUnits|MaxDrawBuffers|MaxFragmentUniformComponents|MaxLights|MaxTextureCoords|MaxTextureImageUnits|MaxTextureUnits|MaxVaryingFloats|MaxVertexAttribs|MaxVertexTextureImageUnits|MaxVertexUniformComponents/,

	// Keywords
	keywordModifier:
		/layout|attribute|centroid|sampler|patch|const|flat|in|inout|invariant|noperspective|out|smooth|uniform|varying|buffer|shared|coherent|readonly|writeonly|volatile|restrict/,

	keywordType:
		/void|bool|int|uint|float|double|vec[234]|dvec[234]|bvec[234]|ivec[234]|uvec[234]|mat[234]|mat2x2|mat2x3|mat2x4|mat3x2|mat3x3|mat3x4|mat4x2|mat4x3|mat4x4|dmat2|dmat3|dmat4|dmat2x2|dmat2x3|dmat2x4|dmat3x2|dmat3x3|dmat3x4|dmat4x2|dmat4x3|dmat4x4|sampler[123]D|image[123]D|samplerCube|imageCube|sampler2DRect|image2DRect|sampler[12]DArray|image[12]DArray|samplerBuffer|imageBuffer|sampler2DMS|image2DMS|sampler2DMSArray|image2DMSArray|samplerCubeArray|imageCubeArray|sampler[12]DShadow|sampler2DRectShadow|sampler[12]DArrayShadow|samplerCubeShadow|samplerCubeArrayShadow|isampler[123]D|iimage[123]D|isamplerCube|iimageCube|isampler2DRect|iimage2DRect|isampler[12]DArray|iimage[12]DArray|isamplerBuffer|iimageBuffer|isampler2DMS|iimage2DMS|isampler2DMSArray|iimage2DMSArray|isamplerCubeArray|iimageCubeArray|atomic_uint|usampler[123]D|uimage[123]D|usamplerCube|uimageCube|usampler2DRect|uimage2DRect|usampler[12]DArray|uimage[12]DArray|usamplerBuffer|uimageBuffer|usampler2DMS|uimage2DMS|usampler2DMSArray|uimage2DMSArray|usamplerCubeArray|uimageCubeArray|struct/,

	keywordControl:
		/break|case|continue|default|discard|do|else|for|if|return|switch|while/,

	keywordPrecision: /precision|highp|mediump|lowp/,

	builtinFunctions:
		/abs|acos|all|any|asin|atan|ceil|clamp|cos|cross|degrees|dFdx|dFdy|distance|dot|equal|exp|exp2|faceforward|floor|fract|ftransform|fwidth|greaterThan|greaterThanEqual|inversesqrt|length|lessThan|lessThanEqual|log|log2|matrixCompMult|max|min|mix|mod|noise[1-4]|normalize|not|notEqual|outerProduct|pow|radians|reflect|refract|shadow1D|shadow1DLod|shadow1DProj|shadow1DProjLod|shadow2D|shadow2DLod|shadow2DProj|shadow2DProjLod|sign|sin|smoothstep|sqrt|step|tan|texture1D|texture1DLod|texture1DProj|texture1DProjLod|texture2D|texture2DLod|texture2DProj|texture2DProjLod|texture3D|texture3DLod|texture3DProj|texture3DProjLod|textureCube|textureCubeLod|transpose/,

	// The main tokenizer for our languages
	tokenizer: {
		root: [
			// GL
			[
				/gl_(\w+)/,
				{
					cases: {
						'$1~@glVariables': 'support',
						'$1~@glConstants': 'support',
						'@default': '',
					},
				},
			],

			[
				/[a-z]\w+/,
				{
					cases: {
						'~@keywordModifier': 'keyword',
						'~@keywordType': 'keyword',
						'~@keywordControl': 'keyword',
						'~@keywordPrecision': 'keyword',
						'~@builtinFunctions': 'function',
						'@default': '',
					},
				},
			],

			// Preprocessor directive
			[/^\s*#\s*\w+/, 'keyword.directive'],

			// whitespace
			{include: '@whitespace'},

			// delimiters and operators
			[/[{}()[\]]/, '@brackets'],

			// numbers
			[
				/\b([0-9][0-9_]*)(\.([0-9][0-9_]*))?([eE][+/-]?([0-9][0-9_]*))?\b/,
				'number',
			],

			// delimiter: after number because of .\d floats
			[/[;,]/, 'delimiter'],
		],

		whitespace: [
			[/[ \t\r\n]+/, ''],
			[/\/\*/, 'comment', '@comment'],
			[/\/\/.*$/, 'comment'],
		],

		comment: [
			[/[^/*]+/, 'comment'],
			[/\*\//, 'comment', '@pop'],
			[/[/*]/, 'comment'],
		],
	},
})
