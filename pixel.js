var Matrix		= require('easybotics-rpi-rgb-led-matrix')
var getPixels	= require('get-pixels')
var dp			= require('./displayPrimitives.js')


//var led = new LedMatrix(64, 64, 1, 2, 'adafruit-hat-pwm')

module.exports = function(RED) {


	var led
	var nodeRegister
	var context = 0


	/*
	 * some functions for parsing color strings, between html hex values and rgb values
	 */
	function eatRGBString (str)
	{
		const s = str.split(',')
		const  output = {r: parseInt(s[0]), g: parseInt(s[1]), b: parseInt(s[2])}

		return output
	}


	/*
	 * a config node that holds global state for the led matrix
	 * nodes that want to use the hardware will hook into an instance of this
	 * but right now it uses global var 'led' meaning its limited to one hardware output per node-red instance
	 */
	function LedMatrix(n)
	{
		RED.nodes.createNode(this, n)
		const node = this
		var lastDraw = 0
		var drawSpeed = 0


		//get the field settings, these inputs are defined in the html
		node.width		  = (n.width		|| 64)
		node.height		  = (n.height		|| 64)
		node.chained	  = (n.chained		|| 2)
		node.parallel	  = (n.parallel		|| 1)
		node.brightness   = (n.brightness	|| 100)
		node.mapping	  = (n.mapping		|| 'adafruit-hat-pwm')
		node.refreshDelay = (n.refreshDelay || 500)
		node.autoRefresh  = (n.autoRefresh)

		context++

		//nodes that wish to draw things on the matrix register themselves in the 'nodeRegister' set
		//then when this node.draw callback is called we sort the set by Z level and call their draw callbacks
		node.draw = function()
		{

			led.clear()

			var nArray = []

			for(let n of nodeRegister)
			{
				nArray.push(n)
			}

			nArray.sort(function(a, b)
			{
				const aa = a.zLevel != undefined ? a.zLevel : -99
				const bb = b.zLevel != undefined ? b.zLevel : -99

				return aa > bb
			})


			for(let n of nArray)
			{
				n.draw()
			}

			led.update()

		}

		//nodes can request the display be refreshed, redrawing every registered node
		//however their is a ratelimiting in effect based on the refreshDelay property
		node.refresh = function ()
		{
			if (!node.autoRefresh) {return}

			const currentMilli = Date.now()
			const passed = currentMilli - lastDraw
			var actualDelay = node.refreshDelay

			if(node.refreshDelay < (drawSpeed))
			{
				actualDelay = parseInt(node.refreshDelay) + parseInt(drawSpeed)
			}



			if (passed > actualDelay)
			{
				node.draw()
				lastDraw = currentMilli

				if(actualDelay > node.refreshDelay)
				{
					node.log('using delay ' + actualDelay)
				}
			}
		}


		//if led is undefined we create a new one
		//some funky stuff due to the global state we're managing
		if(!led)
		{
			node.warn('initing led')
			led = new Matrix( parseInt(node.height), parseInt(node.width), parseInt(node.parallel), parseInt(node.chained), parseInt(node.brightness), node.mapping)
			led.clear()
			led.update()

			if(!nodeRegister) nodeRegister= new Set()
		}
		else
		{
			led.brightness( node.brightness)
		}

		//otherwise we clear the one we have, without these checks it can spawn new evertime we deploy

		led.clear()
		led.update()
		nodeRegister.clear()
	}

	/*
	 * this node pushes the frame buffer to the hardware
	 * faster than updating after every pixel change
	 */
	function RefreshMatrix (config)
	{
		RED.nodes.createNode(this, config)
		const node = this
		node.matrix = RED.nodes.getNode(config.matrix)

		node.on('input', function()
		{
			led.clear()
			node.matrix.draw();
			led.update()
		})
	}


	/*
	 * Takes an image URI (not URL) and caches it in memory as an array of pixels
	 * Can also cache an animated gif as a higher dimensional array
	 * Increments frame when poked, and draws its cache to the display when requested
	 */
	function ImageToPixels (config)
	{
		RED.nodes.createNode(this, config)
		const node = this
		node.matrix = RED.nodes.getNode(config.matrix)

		//get config data
		node.offset = new dp.Point(config.xOffset, config.yOffset)
		node.zLevel = config.zLevel != undefined ? config.zLevel : 0
		node.file = config.file

		//info about the frame we've built last; expensive so we want to avoid repeating this if we can!
		node.currentFrame = 0
		node.frames = 0
		node.cache = undefined

		//callback used by the LED matrix object
		//first we register ourselves to be drawn, and then wait for LED matrix to use this callback
		//we can also manually request for the LED matrix to come and draw us
		node.draw = function ()
		{
			if(node.cache)
			{
				for(const tuple of node.cache[node.currentFrame])
				{
					tuple.point.draw(led, tuple.color, node.offset)
				}
			}
		}

		node.clear = function ()
		{
			nodeRegister.delete(node)
			node.matrix.refresh()
		}

		//function to actually send the output to the next node
		function readySend ()
		{
			nodeRegister.add(node)
			node.matrix.refresh()
		}

		//function that takes a file and tries to convert the file into a stream of pixels
		//takes a callback which is handed the output and the number of frames
		//imagine if it returned a promise though!
		//probably uncesarry because we dont actually have to syncronize this to drawing, drawing when done is fine
		function createPixelStream (file, callback)
		{
			const cc = context

			getPixels(file, function(err, pixels, c = cc)
			{
				var output = []
				if(!pixels)
				{
					node.error('image did not convert correctly\n please check the url or file location')
					return
				}

				const width = pixels.shape.length == 4 ?  Math.min(128, pixels.shape[1]) :  Math.min(128, pixels.shape[0])
				const height = pixels.shape.length == 4 ?  Math.min(128, pixels.shape[2]) :  Math.min(128, pixels.shape[1])
				//for getPixels, all gifs need to be treated the same way, even
				//single frame ones. this is why we need the gif variable, so
				//a single frame gif's pixels won't be accessed the same as a still image
				const isGif = pixels.shape.length == 4
				const frames = isGif ? pixels.shape[0] : 1

				//loop agnostic between images and gifs
				for(var frame = 0; frame < frames; frame++)
				{
					output[frame] = []
					for(let x = 0;  x < width; x++)
					{
						if(c != context) return
						for(let y = 0; y < height; y++)
						{
							//getting pixel is different for still images
							const r = isGif ? pixels.get(frame, x, y, 0) : pixels.get(x, y, 0)
							const g = isGif ? pixels.get(frame, x, y, 1) : pixels.get(x, y, 1)
							const b = isGif ? pixels.get(frame, x, y, 2) : pixels.get(x, y, 2)

							if(!(r || g || b)) continue

							//push to output array
							output[frame].push({point: new dp.Point(x, y), color: new dp.Color().fromRgb(r, g, b)})
						}
					}
				}

				//call our send function from earlier
				//just sets the cache and the number of frames, remember that still images have '0' frames
				if(c == context)
				{
					//give our callback function the output and the number of frames
					callback(output, frames)

				}

			})
		}

		//if we receive input
		node.on('input', function(msg)
		{
			if(msg.clear)
			{
				node.clear()
				return
			}

			var runFile = undefined

			//catch various attemps to modify the file and offset, either via direct injection
			//or via a msg.payload.data property
			if(typeof msg.payload === 'string')
			{
				runFile = msg.payload
			}
			else if(msg.payload.data)
			{
				runFile = msg.payload.data
			}
			else //if we don't do any type of payload and use the edit dialog instead
			{
				runFile = node.file
			}

			if(msg.payload.x !== undefined && msg.payload.y !== undefined){
				node.offset = new dp.Point(msg.payload.x, msg.payload.y)
			}

			//make a cache for the image if it doesn't exist or it's for a different image
			if(node.cache == undefined || runFile != node.file)
			{
				node.file = runFile
				//set cache to an intermediate but valid state
				//thatway we only run when node.cache is in an UNDEFINED state, or we change the file
				//we only draw node.cache when it is in a valid drawable state
				//undefined -> intermediate -> drawable
				node.cache = false

				//give create pixel stream a callback which sets node.cache to a state that node.draw can use
				createPixelStream(node.file, function (output, frames)
				{
					node.cache = output
					node.frames = frames
					readySend()
					node.cache = output
				})

				return
			}

			//update frame on animated images
			node.currentFrame++
			if(node.currentFrame >= node.frames) node.currentFrame = 0
			readySend();
		})
	}


	//clears our internal framebuffer, doesn't clear the hardware buffer though
	function ClearMatrix (config)
	{
		RED.nodes.createNode(this, config)
		const node = this

		node.on('input', function(msg)
		{
			if(msg.payload)
			{
				led.clear()
			}
		})
	}


	/*
	 * draws text to the buffer, if updated it tries to erease its previous drawing first
	 */
	function Text (config)
	{
		RED.nodes.createNode(this, config)
		var node = this

		node.matrix		= RED.nodes.getNode(config.matrix)
		node.prefix		= config.prefix || ''
 		node.source		= config.source || 'msg.payload'
		node.font		= config.font
		node.xOffset	= config.xOffset
		node.yOffset	= config.yOffset
		node.rgb		= config.rgb
		node.zLevel = config.zLevel != undefined ? config.zLevel : 2

		var outputInfo

		node.draw = function ()
		{
			if(outputInfo != undefined)
			{
				const color = eatRGBString(outputInfo.rgb)
				const fontDir = __dirname + '/fonts/' + node.font
				led.drawText(parseInt(outputInfo.x), parseInt(outputInfo.y), outputInfo.data, fontDir, parseInt(color.r), parseInt(color.g), parseInt(color.b))
			}
		}

		node.clear = function ()
		{
			nodeRegister.delete(node)
			node.matrix.refresh()
		}

		node.on('input', function(msg)
		{
			if(msg.clear)
			{
				node.clear()
				return
			}

			const outputData =  eval( node.source)

			const handleFloat = function (i)
			{
				if( !isNaN(i))
				{
					return Math.round(i * 100) / 100
				}

				return i
			}

			if(outputData != undefined)
			{

				outputInfo =
				{
					x : outputData.x ? outputData.x : node.xOffset,
					y : outputData.y ? outputData.y : node.yOffset,
					data: node.prefix + handleFloat((outputData.data  ? outputData.data    : outputData)),
					rgb: outputData.rgb	  || node.rgb,
				}

				nodeRegister.add(node)
				node.matrix.refresh()
			}
		})
	}


	/*
	 * node to create and modify .data objects we send to different display nodes
	 */
	function PixelDataTransform (config)
	{
		RED.nodes.createNode(this, config)
		const node = this

		node.matrix  = RED.nodes.getNode(config.matrix)
		node.xOffset = (config.xOffset || 0)
		node.yOffset = (config.yOffset || 0)
		node.refresh = (config.refresh || 0)
		node.rgb	 = (config.rgb     || '255,255,255')

		function outputFromString (msg)
		{
			const output =
			{
				data:    msg.payload,
				x: parseInt(node.xOffset),
				y: parseInt(node.yOffset),
				refresh: parseInt(node.refresh),
				rgb:	 node.rgb,

			}

			msg.payload = output
			node.send( msg)
		}

		function outputFromObject (msg)
		{
			const output =
			{
				data:    msg.payload.data,
				x		: parseInt(node.xOffset),
				y		: parseInt(node.yOffset),
				refresh: parseInt(node.refresh),
				rgb    : node.rgb,

			}

			msg.payload = output
			node.send( msg)

		}

		node.on('input', function(msg)
		{
			if (typeof msg.payload == 'string')
			{
				return outputFromString(msg)
			}

			return outputFromObject(msg)
		})
	}


	/*
	 * node to print a circle to the matrix buffer
	 */
	function Circle (config)
	{
		RED.nodes.createNode(this, config)
		const node = this
		var outputInfo

		node.matrix  = RED.nodes.getNode(config.matrix)
		node.xPos	 = (config.xPos   || 0)
		node.yPos	 = (config.yPos	  || 0)
		node.radius	 = (config.radius || 0)
		node.rgb	 = (config.rgb    || '255,255,255')
		node.zLevel = config.zLevel != undefined ? config.zLevel : 1

		node.draw = function()
		{
			if (outputInfo != undefined)
			{
				let o = outputInfo
				led.drawCircle( o.x, o.y, o.radius, o.color.r, o.color.g, o.color.b)
			}
		}

		node.clear = function ()
		{
			nodeRegister.delete(node)
			node.matrix.refresh()
		}

		node.on('input', function (msg)
		{
			if(msg.clear)
			{
				node.clear()
				return
			}

			const data   = msg.payload.data != undefined ? msg.payload.data : msg.payload
			outputInfo =
			{
				color	: data.rgb		!= undefined   ? eatRGBString(data.rgb) : eatRGBString(node.rgb),
				y		: data.y		!= undefined   ? parseInt(data.y)		: parseInt(node.yPos),
				x		: data.x		!= undefined   ? parseInt(data.x)		: parseInt(node.xPos),
				radius	: data.radius	!= undefined   ? parseInt(data.radius)  : parseInt(node.radius),
			}

			nodeRegister.add(node)
			node.matrix.refresh()

		})
	}


	function ClearNode (config)
	{
		RED.nodes.createNode(this, config)
		const node = this

		node.on('input', function (msg)
		{
			msg.clear = true
			node.send(msg)
		})
	}


	function Polygon (config)
	{
		RED.nodes.createNode(this, config)
		const node = this
		node.matrix = RED.nodes.getNode(config.matrix)

		//get the config data we'll use later
		node.zLevel = config.zLevel != undefined ? config.zLevel : 1
		node.savedPts = config.savedPts
		node.offset = new dp.Point(config.xOffset != undefined ? config.xOffset : 0,
			config.yOffset != undefined ? config.yOffset : 0)
		node.rgb = config.rgb || '255,255,255'
		node.filled = config.filled || false

		node.oldPoints = undefined
		node.oldRgb = undefined
		node.oldFilled = undefined

		//the data we'll use to actually draw starts off empty
		node.polygon = undefined
		node.color = undefined


		//this functin returns a dp Polygon based on the config data
		//we only call this if the user doesn't want to draw their own custom polygon
		node.buildFromConfig = function(points, filled)
		{
			const realPoints = new Array()

			//fill realPoints with dp points to make a polygon later
			for(var i = 0; i < points.length; i++)
			{
				const x = points[i].x
				const y = points[i].y

				realPoints.push(new dp.Point(x, y))
			}
			//create our DP polygon
			const polygon = new dp.Polygon(realPoints)

			if(filled) polygon.fill(node.matrix.refresh)

			return polygon
		}


		node.draw = function ()
		{

			if(node.polygon && node.color)
			{
				node.polygon.draw(led, node.color, node.offset)
			}
		}

		node.clear = function ()
		{
			nodeRegister.delete(node)
			node.matrix.refresh()
		}

		node.on('input', function (msg)
		{
			if(msg.clear)
			{
				node.clear()
				return
			}

			const data = msg.payload
			var runPts		= undefined
			var runColor	= undefined
			var runFilled	= undefined

			if(data.savedPts) runPts = data.savedPts
			if(data.filled) runFilled = data.filled
			if(data.rgb) runColor = data.rgb

			if(!runPts) runPts = node.savedPts
			if(!runFilled) runFilled = node.filled
			if(!runColor) runColor = node.rgb


			//color is cheap so we'll just set this every time
			node.color = new dp.Color().fromRgbString(runColor)


			if(node.polygon && (node.oldPoints == runPts && node.oldFilled == runFilled))
				return

			//don't redo this if we haven't had user data and the config hasn't changed
			//this if statement will need changing
			node.polygon = node.buildFromConfig(runPts, runFilled)
			node.oldPoints = runPts
			node.oldFilled = runFilled
			if(data.xOffset != undefined && data.yOffset != undefined)
			{
				node.offset = new dp.Point(data.xOffset, data.yOffset)
			}

			//dont forget to register our node to be drawn
			readySend()
			return


		})


		function readySend ()
		{
			nodeRegister.add(node)
			node.matrix.refresh()
		}

	}

	//register our functions with node-red
	RED.nodes.registerType('led-matrix', LedMatrix)
	//RED.nodes.registerType('clear-matrix', ClearMatrix)
	RED.nodes.registerType('refresh-matrix', RefreshMatrix)
	RED.nodes.registerType('image-to-matrix', ImageToPixels)
	RED.nodes.registerType('text-to-matrix', Text)
	RED.nodes.registerType('pixel-transform', PixelDataTransform)
	RED.nodes.registerType('circle', Circle)
	RED.nodes.registerType('clear-node', ClearNode)
	RED.nodes.registerType('polygon', Polygon)
}
