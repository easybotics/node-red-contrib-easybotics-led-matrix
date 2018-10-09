var Matrix		= require('node-rpi-rgb-led-matrix')
var getPixels	= require('get-pixels');


//var led = new LedMatrix(64, 64, 1, 2, "adafruit-hat-pwm");

module.exports = function(RED) {

	var led;
	var nodeRegister;
	var context = 0;


	/*
	 * some functions for parsing color strings, between html hex values and rgb values
	 */
	function eatRGBString (str)
	{
		const s = str.split(',');
		const  output = {r: parseInt(s[0]), g: parseInt(s[1]), b: parseInt(s[2])};

		return output;
	}

	function eatHexString (hex)
	{
		// Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
		const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;

		hex = hex.replace(shorthandRegex, function(m, r, g, b)
			  {
					return r + r + g + g + b + b;
			  });

		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16)} : null;
	}


	/*
	 * a config node that holds global state for the led matrix
	 * nodes that want to use the hardware will hook into an instance of this
	 * but right now it uses global var 'led' meaning its limited to one hardware output per flow
	 */
	function LedMatrix(n)
	{
		RED.nodes.createNode(this, n);
		const node = this;
		var lastDraw = 0;
		var drawSpeed = 0;


		//get the field settings, these inputs are defined in the html
		node.width		  = (n.width		|| 64);
		node.height		  = (n.height		|| 64);
		node.chained	  = (n.chained		|| 2);
		node.parallel	  = (n.parallel		|| 1);
		node.brightness   = (n.brightness	|| 100);
		node.mapping	  = (n.mapping		|| "adafruit-hat-pwm");
		node.refreshDelay = (n.refreshDelay || 500);
		node.autoRefresh  = (n.autoRefresh);

		context++;

		node.draw = function()
		{
			const time = Date.now();

			led.clear();

			for(let n of nodeRegister)
			{
				const start = Date.now();
				n.draw();
				const end = Date.now();
			}
			led.update();

		}

		node.refresh = function ()
		{
			if (!node.autoRefresh) {return;};

			const currentMilli = Date.now();
			const passed = currentMilli - lastDraw;
			var actualDelay = node.refreshDelay;

			if(node.refreshDelay < (drawSpeed))
			{
				actualDelay = parseInt(node.refreshDelay) + parseInt(drawSpeed);
			}



			if (passed > actualDelay)
			{
				node.draw();
				lastDraw = currentMilli;

				if(actualDelay > node.refreshDelay)
				{
					node.log("using delay " + actualDelay);
				}
			}
		}


		//if led is undefined we create a new one
		if(!led)
		{
			node.warn("initing led");
			led = new Matrix( parseInt(node.width), parseInt(node.height), parseInt(node.parallel), parseInt(node.chained), parseInt(node.brightness), node.mapping);
			led.clear();
			led.update();

			if(!nodeRegister) nodeRegister= new Set();
		}
		else
		{
			node.warn("reusing led");
		}

		//otherwise we clear the one we have, without these checks it can spawn new evertime we deploy

		led.clear();
		led.update();
		nodeRegister.clear();

	}


	/*
	 * this node takes a pixel object and sticks it on the canvas
	 * it won't show up until you update the display, but we might alter this control flow
	 */
	function PixelNode (config)
	{
		RED.nodes.createNode(this, config);
		const node = this;
		node.matrix = RED.nodes.getNode(config.matrix);

		var outputInfo;

		node.draw = function ()
		{
			if( outputInfo != undefined)
			{
				const o = outputInfo;
				led.setPixel( o.x, o.y, o.r, o.g, o.b);
			}
		}

		node.on('input', function (msg)
		{
			//if someone injects a string then split it on comas and try and feat it to the matrix
			if(typeof msg.payload == "string")
			{
				const vals = msg.payload.split(',');
				if(vals.length < 4)
				{
					node.error("your pixel csv doesn't seem correct:", vals);
				}

				outputInfo =
					{
						x: parseInt(vals[0]),
						y: parseInt(vals[1]),
						r: parseInt(vals[2]),
						g: parseInt(vals[3]),
						b: parseInt(vals[4]),
					};

				return;
			}

			//but normally we want to use a javascript object
			//here we do some crude javascript type checking
			if(msg.payload.x && msg.payload.y && msg.payload.r && msg.payload.g && msg.payload.b)
			{
				outputInfo =
					{
						x: parseInt(msg.payload.x),
						y: parseInt(msg.payload.y),
						r: parseInt(msg.payload.r),
						g: parseInt(msg.payload.g),
						b: parseInt(msg.payload.b),
					};

				return;
			}

		});
	}


	/*
	 * this node pushes the frame buffer to the hardware
	 * faster than updating after every pixel change
	 */
	function RefreshMatrix (config)
	{
		RED.nodes.createNode(this, config);
		const node = this;
		node.matrix = RED.nodes.getNode(config.matrix);

		node.on('input', function(msg)
		{
			led.clear();

			for(let n of nodeRegister)
			{
				n.draw();
			}

			led.update();
		});
	}


	/*
	 * takes a url and turns it into an array of pixel objects
	 * instead of sending a buffer, it uses the node.send() method
	 * overload for an array, meaning it in effect calls its output over and over again
	 */
	function ImageToPixels (config)
	{
		RED.nodes.createNode(this, config);
		const node = this;

		node.matrix = RED.nodes.getNode(config.matrix);
		node.xOffset = config.xOffset;
		node.yOffset = config.yOffset;

		//filename or URL to look for an image
		//and an array we will will with pixels
		var output;
		var lastSent;
		var lastX;
		var lastY;
		var currentFrame = 0;

		node.draw = function ()
		{
			if(output != undefined)
			{
				for(let i = 0; i < output.length; i++)
				{
					let payload = output[i].payload;
					led.setPixel( parseInt(payload.x), parseInt(payload.y), parseInt(payload.r), parseInt(payload.g), parseInt(payload.b));
				}
			}
		}

		//function to actually send the output to the next node
		function readySend ()
		{
			//console.log("sending pixels");

			//see node-red docmentation for how node.send treats arrays
			//node.send(output) would send one pixel to n outputs
			//node.send([output], true) sends the pixiels to output 1, and true to output 2
			//
			//node.send([output]);
			//instead of sending it out we're not just processing it in place here to match the text node
			/*
			for(var i = 0; i < output.length; i++)
			{
				let payload = output[i].payload;
				led.setPixel( parseInt(payload.x), parseInt(payload.y), parseInt(payload.r), parseInt(payload.g), parseInt(payload.b));
			}
			*/


			nodeRegister.add(node);
			node.matrix.refresh();
		}

		//function that takes a file, and an offset and tries to convert the file into a stream of pixels
		function createPixelStream (file, xOffset, yOffset)
		{
			const cc = context;

			getPixels(file, function(err, pixels, c = cc)
			{

				output = [];

				if(!pixels)
				{
					node.error("image did not convert correctly\n please check the url or file location");
					return;
				}
				const width = pixels.shape.length == 4 ?  Math.min( 128, pixels.shape[1]) :  Math.min( 128, pixels.shape[0]);
				const height = pixels.shape.length == 4 ?  Math.min( 128, pixels.shape[2]) :  Math.min( 128, pixels.shape[1]);


				//loop over the 2d array of pixels returned by getPixels
				for(let x = 0; x < width; x++)
				{
					for(let y = 0; y < height; y++)
					{
						//make sure the array actually contains data for this location
						if(pixels.get(x,y,0) || pixels.get(currentFrame,x,y,0))
						{
							//push pixels to the output buffer
							if(pixels.shape.length == 4)  //gif
							{
								output.push({payload: { x: x + xOffset, y: y + yOffset, r: pixels.get(currentFrame,x,y,0), g: pixels.get(currentFrame,x,y,1), b: pixels.get(currentFrame,x,y,2)} });

								if(currentFrame == pixels.shape[0] -1)
								{
									currentFrame = 0; //restart the gif
								}
							}
							else
							{ //still image
								output.push({payload: { x: x + xOffset, y: y + yOffset, r:pixels.get(x,y,0), g:pixels.get(x,y,1), b:pixels.get(x,y,2)} });
							}
						}
					}
				}

				//call our send function from earlier
				if(c == context)
				{
					readySend();
					currentFrame++;
				}

			});
		}

		//if we receive input
		node.on('input', function(msg)
		{


			if(!msg.payload)
			{
				node.error("empty payload");
				return;
			}

			//set the url var
			if( typeof msg.payload === "string")
			{
				if(msg.payload === lastSent && (output && output.length > 0) && lastY == node.yOffset && lastX == node.xOffset && (!currentFrame))
				{


					return readySend();
				}

				lastX = node.xOffset;
				lastY = node.yOffset;
				lastSent = msg.payload;

				return createPixelStream( msg.payload, parseInt(node.xOffset), parseInt(node.yOffset));
			}

			if( msg.payload.data)
			{
				if(msg.payload.data === lastSent && (output && output.length > 0) && lastX == msg.payload.xOffset && lastY == msg.payload.yOffset && (!currentFrame))
				{

					return readySend();
				}

				lastSent = msg.payload.data;
				lastX = msg.payload.xOffset;
				lastY = msg.payload.yOffset;

				return createPixelStream(msg.payload.data, msg.payload.xOffset, msg.payload.yOffset);
			}
		});
	}


	//clears our internal framebuffer, doesn't clear the hardware buffer though
	function ClearMatrix (config)
	{
		RED.nodes.createNode(this, config);
		const node = this;

		node.on('input', function(msg)
		{
			if(msg.payload)
			{
				led.clear();
			}
		});
	}


	/*
	 * draws text to the buffer, if updated it tries to erease its previous drawing first
	 */
	function Text (config)
	{
		RED.nodes.createNode(this, config);
		var node = this;

		node.matrix		= RED.nodes.getNode(config.matrix);
		node.prefix		= config.prefix || "";
 		node.source		= config.source || "msg.payload";
		node.font		= config.font;
		node.xOffset	= config.xOffset;
		node.yOffset	= config.yOffset;
		node.rgb		= config.rgb;

		var lastMsg;
		var outputInfo;

		node.draw = function ()
		{
			if(outputInfo != undefined)
			{
				let color = eatRGBString(outputInfo.rgb);
				led.drawText(parseInt(outputInfo.x), parseInt(outputInfo.y), outputInfo.data, node.font, parseInt(color.r), parseInt(color.g), parseInt(color.b));
			}
		}

		node.on('input', function(msg)
		{
			const outputData = node.prefix + eval( node.source);

			if(outputData)
			{

				outputInfo =
				{
					x : outputData.xOffset ? outputData.xOffset : node.xOffset,
					y : outputData.yOffset ? outputData.yOffset : node.yOffset,
					data: outputData.data  ? outputData.data    : outputData,
					rgb: outputData.rgb	  || node.rgb,
				};

				lastMsg = msg;
				nodeRegister.add(node);
				node.matrix.refresh();
			}
		});
	}


	/*
	 * node to create and modify .data objects we send to different display nodes
	 */
	function PixelDataTransform (config)
	{
		RED.nodes.createNode(this, config);
		const node = this;

		node.matrix  = RED.nodes.getNode(config.matrix);
		node.xOffset = (config.xOffset || 0);
		node.yOffset = (config.yOffset || 0);
		node.refresh = (config.refresh || 0);
		node.rgb	 = (config.rgb     || "255,255,255");

		function outputFromString (msg)
		{
			const output =
			{
				data:    msg.payload,
				xOffset: parseInt(node.xOffset),
				yOffset: parseInt(node.yOffset),
				refresh: parseInt(node.refresh),
				rgb:	 node.rgb,

			}

			msg.payload = output;
			node.send( msg);
		}

		function outputFromObject (msg)
		{
			const output =
			{
				data:    msg.payload.data,
				xOffset: parseInt(node.xOffset),
				yOffset: parseInt(node.yOffset),
				refresh: parseInt(node.refresh),
				rgb    : node.rgb,

			}

			msg.payload = output;
			node.send( msg);

		}

		node.on('input', function(msg)
		{
			if (typeof msg.payload == "string")
			{
				return outputFromString(msg);
			}

			return outputFromObject(msg);
		});
	}


	/*
	 * node to print a circle to the matrix buffer
	 */
	function CircleToMatrix (config)
	{
		RED.nodes.createNode(this, config);
		const node = this;
		var outputInfo;

		node.matrix  = RED.nodes.getNode(config.matrix);
		node.x	 = (config.x   || 0);
		node.y	 = (config.y	  || 0);
		node.radius	 = (config.radius || 0);
		node.rgb	 = (config.rgb    || "255,255,255");

		node.draw = function()
		{
			if (outputInfo != undefined)
			{
				let o = outputInfo;
				led.drawCircle( o.x, o.y, o.radius, o.color.r, o.color.g, o.color.b);
			}
		}

		node.on('input', function (msg)
		{
			const data   = msg.payload.data != undefined ? msg.payload.data : msg;
			outputInfo =
			{
				color  : data.rgb	 != undefined   ? eatRGBString(data.rgb) : eatRGBString(node.rgb),
				y   : data.y	 != undefined   ? parseInt(data.y)    : parseInt(node.y),
				x   : data.x	 != undefined   ? parseInt(data.x)    : parseInt(node.x),
				radius : data.radius != undefined   ? parseInt(data.radius)  : parseInt(node.radius),
			};

			nodeRegister.add(node);
			node.matrix.refresh();

		});
	};


	/*
	 * draws a line to the matrix buffer
	 */
	function LineToMatrix (config)
	{
		RED.nodes.createNode(this, config);
		const node = this;

		node.matrix = RED.nodes.getNode(config.matrix);
		node.x0		= (config.x0 || 0);
		node.y0		= (config.y0 || 0);
		node.x1		= (config.x1 || 0);
		node.y1		= (config.y1 || 0);
		node.rgb    = (config.rgb || "255,255,255");

		node.draw = function ()
		{

			var color = eatRGBString(node.rgb);
			led.drawLine( parseInt(node.x0), parseInt(node.y0), parseInt(node.x1), parseInt(node.y1), parseInt(color.r), parseInt(color.g), parseInt(color.b));
		}


		node.on('input', function (msg)
		{
			nodeRegister.add(node);
			node.matrix.refresh();
			/*
			var color = eatRGBString(node.rgb);
			led.drawLine( parseInt(node.x0Pos), parseInt(node.y0Pos), parseInt(node.x1Pos), parseInt(node.y1Pos), parseInt(color.r), parseInt(color.g), parseInt(color.b));
			*/
		});


	};


	/*
	 * node that draws a triangle to the screen
	 */

	function TriangleToMatrix (config)
	{
		RED.nodes.createNode(this, config);
		const node = this;

		node.matrix = RED.nodes.getNode(config.matrix);
		node.x0		= (config.x0 || 0);
		node.y0		= (config.y0 || 0);
		node.x1		= (config.x1 || 0);
		node.y1		= (config.y1 || 0);
		node.x2		= (config.x2 || 0);
		node.y2		= (config.y2 || 0);
		node.rgb    = (config.rgb || "255,255,255");

		node.draw = function ()
		{
			if (outputInfo != undefined)
			{
				let o = outputInfo;
				led.drawLine( parseInt(o.x0), parseInt(o.y0), parseInt(o.x1), parseInt(o.y1), parseInt(o.color.r), parseInt(o.color.g), parseInt(o.color.b));
				led.drawLine( parseInt(o.x1), parseInt(o.y1), parseInt(o.x2), parseInt(o.y2), parseInt(o.color.r), parseInt(o.color.g), parseInt(o.color.b));
				led.drawLine( parseInt(o.x2), parseInt(o.y2), parseInt(o.x0), parseInt(o.y0), parseInt(o.color.r), parseInt(o.color.g), parseInt(o.color.b));
			}
		}

		node.on('input', function (msg)
		{
			const data   = msg.payload.data != undefined ? msg.payload.data : msg;
			outputInfo =
			{
				color   : data.rgb	  != undefined   ? eatRGBString(data.rgb)	: eatRGBString(node.rgb),
				x0		: data.x	  != undefined   ? parseInt(data.x0)		: parseInt(node.x0),
				y0		: data.y	  != undefined   ? parseInt(data.y0)		: parseInt(node.y0),
				x1		: data.x	  != undefined   ? parseInt(data.x1)		: parseInt(node.x1),
				y1		: data.y	  != undefined   ? parseInt(data.y1)		: parseInt(node.y1),
				x2		: data.x	  != undefined   ? parseInt(data.x2)		: parseInt(node.x2),
				y2		: data.y	  != undefined   ? parseInt(data.y2)		: parseInt(node.y2),
				radius  : data.radius != undefined   ? parseInt(data.radius)	: parseInt(node.radius),
			};

			nodeRegister.add(node);
			node.matrix.refresh();
		});
	};

	function ClearNode (config)
	{
		RED.nodes.createNode(this, config);
		const node = this;

		node.on('input', function (msg)
		{
			msg.payload = "_clear";
			node.send(msg);
		});
	};



	//register our functions with node-red
	RED.nodes.registerType("led-matrix", LedMatrix);
//	RED.nodes.registerType("clear-matrix", ClearMatrix);
	RED.nodes.registerType("refresh-matrix", RefreshMatrix);
	RED.nodes.registerType("pixel", PixelNode);
	RED.nodes.registerType("image-to-matrix", ImageToPixels);
	RED.nodes.registerType("text-to-matrix", Text);
	RED.nodes.registerType("pixel-transform", PixelDataTransform);
	RED.nodes.registerType("circle-to-matrix", CircleToMatrix);
	RED.nodes.registerType("line-to-matrix", LineToMatrix);
	RED.nodes.registerType("triangle-to-matrix", TriangleToMatrix);
	RED.nodes.registerType("clear-node", ClearNode);
}
