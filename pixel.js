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
	 * but right now it uses global var 'led' meaning its limited to one hardware output per flow
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
			node.warn('reusing led')
			led.brightness( node.brightness)
			node.log('set brightness')
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

		node.on('input', function(msg)
		{
			led.clear()

			for(let n of nodeRegister)
			{
				n.draw()
			}

			led.update()
		})
	}


	/*
	 * takes a url and turns it into an array of pixel objects
	 * instead of sending a buffer, it uses the node.send() method
	 * overload for an array, meaning it in effect calls its output over and over again
	 */
	function ImageToPixels (config)
	{
		RED.nodes.createNode(this, config)
		const node = this
		node.matrix = RED.nodes.getNode(config.matrix)

		//get config data
		node.xOffset = config.xOffset
		node.yOffset = config.yOffset
		node.zLevel = config.zLevel != undefined ? config.zLevel : 0
		node.file = config.file

		//info about the frame we've built last; expensive so we want to avoid repeating this if we can!
		node.output		  = undefined
		node.lastFile	  = undefined
		node.lastPoint	  = undefined
		node.currentFrame = 0

		node.draw = function ()
		{
			if(node.output != undefined)
			{
				for(const tuple of node.output)
				{
					tuple.point.draw(led, tuple.color)
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

		//function that takes a file, and an offset and tries to convert the file into a stream of pixels
		function createPixelStream (file, offset)
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

				const width = pixels.shape.length == 4 ?  Math.min( 128, pixels.shape[1]) :  Math.min( 128, pixels.shape[0])
				const height = pixels.shape.length == 4 ?  Math.min( 128, pixels.shape[2]) :  Math.min( 128, pixels.shape[1])

				//loop over the 2d array of pixels returned by getPixels
				for(let x = 0; x < width; x++)
				{
					//give up if the next frame is already being pushed
					if(c != context) return

					for(let y = 0; y < height; y++)
					{
						//make sure the array actually contains data for this location
						if(pixels.get(x,y,0) || pixels.get(node.currentFrame,x,y,0))
						{
							//push pixels to the output buffer
							if(pixels.shape.length == 4)  //gif
							{
								output.push( { point: new dp.Point(offset.x + x, offset.y + y), color: new dp.Color().fromRgb( pixels.get(node.currentFrame, x, y, 0), pixels.get(node.currentFrame, x, y, 1) ,pixels.get(node.currentFrame, x, y, 2))})


								if(node.currentFrame == pixels.shape[0] -1)
								{
									node.currentFrame = 0 //restart the gif
								}
							}
							else
							{ //still image
								output.push( { point: new dp.Point(x + offset.x, y + offset.y), color: new dp.Color().fromRgb( pixels.get(x, y, 0), pixels.get(x, y, 1) ,pixels.get(x, y, 2))})
							}
						}
					}
				}

				//call our send function from earlier
				if(c == context)
				{
					node.output = output;
					readySend()
					if(pixels.shape[0] > 1) node.currentFrame++
				}

			})
		}

		//if we receive input
		node.on('input', function(msg)
		{

			//start out with a blank file and offset
			var runFile = undefined
			var runPoint = undefined

			if(msg.clear)
			{
				node.clear()
				return
			}

			//catch various attemps to modify the file and offset, either via direct injection
			//or via a msg.payload.data property
			//set the url var
			if( typeof msg.payload === 'string')
			{
				runFile = msg.payload
			}

			if( msg.payload.data)
			{
				runFile = msg.payload.data
				runPoint = new dp.Point(msg.payload.x, msg.payload.y)
			}

			//if the user didn't provide a file or offset, use the one from the config
			if( !runFile) runFile = node.file
			if( !runPoint) runPoint = new dp.Point(node.xOffset, node.yOffset)


			//if we didn't dislpay an image yet, always display one
			if(node.oldFile == undefined  || node.oldPoint == undefined || node.currentFrame)
			{
				node.oldFile = runFile
				node.oldPoint = runPoint

				createPixelStream(runFile, runPoint)
				return
			}

			//otherwise, carefully check if we are trying to draw the same image twice for no reason
			if(runFile != node.oldFile && (runPoint.x != node.oldPoint.x && runPoint.y != node.oldPoint.y))
			{
				node.oldFile = runFile
				node.oldPoint = runPoint

				createPixelStream(runFile, runPoint)
				return
			}

			node.log('falling through, not running pixel stream')
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
		node.rgb = config.rgb || '255,255,255'
		node.filled = config.filled || false

		//the data we'll use to actually draw starts off empty
		node.polygon = undefined
		node.color = undefined


		//this functin returns a dp Polygon based on the config data
		//we only call this if the user doesn't want to draw their own custom polygon
		node.buildFromConfig = function()
		{
			const realPoints = new Array()

			//fill realPoints with dp points to make a polygon later
			for(var i = 0; i < node.savedPts.length; i++)
			{
				const x = node.savedPts[i].x
				const y = node.savedPts[i].y

				realPoints.push(new dp.Point(x, y))
			}
			//create our DP polygon
			const polygon = new dp.Polygon(realPoints)

			if(node.filled) polygon.fill()

			return polygon
		}


		node.draw = function ()
		{
			if(node.polygon && node.color)
			{
				node.polygon.draw( led, node.color)
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
			node.rgb = data.rgb != undefined ? data.rgb : node.rgb
			node.savedPts = data.savedPts != undefined ? data.savedPts : node.savedPts
			node.filled = data.filled != undefined ? data.filled : node.filled

			//don't redo this if we haven't had user data and the config hasn't changed
			//this if statement will need changing
			if(!node.polygon)
			{
				node.polygon = node.buildFromConfig()
				node.color = new dp.Color().fromRgbString(node.rgb)
			}


			//dont forget to register the node
			nodeRegister.add(node)
			node.matrix.refresh()

		})


		function readySend ()
		{
			nodeRegister.add(node)
			node.matrix.refresh()
		}

	}

	//register our functions with node-red
	RED.nodes.registerType('led-matrix', LedMatrix)
//	RED.nodes.registerType('clear-matrix', ClearMatrix)
	RED.nodes.registerType('refresh-matrix', RefreshMatrix)
	RED.nodes.registerType('image-to-matrix', ImageToPixels)
	RED.nodes.registerType('text-to-matrix', Text)
	RED.nodes.registerType('pixel-transform', PixelDataTransform)
	RED.nodes.registerType('circle', Circle)
	RED.nodes.registerType('clear-node', ClearNode)
	RED.nodes.registerType('polygon', Polygon)
}
