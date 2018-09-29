var Matrix		= require('node-rpi-rgb-led-matrix')
var getPixels	= require('get-pixels');


//var led = new LedMatrix(64, 64, 1, 2, "adafruit-hat-pwm");

module.exports = function(RED) {

	var led;

	/*
	 * a config node that holds global state for the led matrix
	 * nodes that want to use the hardware will hook into an instance of this
	 * but right now it uses global var 'led' meaning its limited to one hardware output per flow
	 */

	function eatRGBString (str)
	{
		var s = str.split(',');
		var output = {r: parseInt(s[0]), g: parseInt(s[1]), b: parseInt(s[2])};

		return output;

	}

	function eatHexString (hex)
	{
		// Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
		var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
		hex = hex.replace(shorthandRegex, function(m, r, g, b) {
			return r + r + g + g + b + b;
		});

		var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : null;
	}

	function LedMatrix(n)
	{
		RED.nodes.createNode(this, n);

		//get the field settings, these inputs are defined in the html

		this.width		= (n.width		|| 64);
		this.height		= (n.height		|| 64);
		this.chained	= (n.chained	|| 2);
		this.parallel	= (n.parallel	|| 1);
		this.brightness = (n.brightness || 100);
		this.mapping	= (n.mapping	|| "adafruit-hat-pwm");


		//if led is undefined we create a new one
		if(!led)
		{
			led = new Matrix( parseInt(this.width), parseInt(this.height), parseInt(this.parallel), parseInt(this.chained), parseInt(this.brightness), this.mapping);
		}

		//otherwise we clear the one we have, without these checks it can spawn new evertime we deploy
		if(led)
		{
			led.clear();
			led.update();
		}

	}

	/*
	 * this node takes a pixel object and sticks it on the canvas
	 * it won't show up until you update the display, but we might alter this control flow
	 */

	function PixelNode (config)
	{
		RED.nodes.createNode(this, config);
		var node = this;

		node.on('input', function(msg)
		{

			//if someone injects a string then split it on comas and try and feat it to the matrix
			if(typeof msg.payload == "string")
			{
				var vals = msg.payload.split(',');
				if(vals.length < 4)
				{
					node.error("your pixel csv doesn't seem correct:", vals);
				}

				led.setPixel(parseInt(vals[0]), parseInt(vals[1]), parseInt(vals[2]), parseInt(vals[3]), parseInt(vals[4]));
				return;
			}

			//but normally we want to use a javascript object
			//here we do some crude javascript type checking
			if(msg.payload.x && msg.payload.y && msg.payload.r && msg.payload.g && msg.payload.b)
			{
				led.setPixel(msg.payload.x, msg.payload.y, msg.payload.r, msg.payload.g, msg.payload.b);
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
		var node = this;

		node.on('input', function(msg)
		{
			//if the payload isn't null or false push the buffer
			if(msg.payload)
			{
				led.update();
			}
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
		var node = this;

		node.xOffset = config.xOffset;
		node.yOffset = config.yOffset;

		//filename or URL to look for an image
		//and an array we will will with pixels
		var output;
		var lastSent;
		var lastX;
		var lastY;

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
			for(var i = 0; i < output.length; i++)
			{
				let payload = output[i].payload;
				led.setPixel( parseInt(payload.x), parseInt(payload.y), parseInt(payload.r), parseInt(payload.g), parseInt(payload.b));
			}
		}

		//function that takes a file, and an offset and tries to convert the file into a stream of pixels
		function createPixelStream (file, xOffset, yOffset)
		{
			getPixels(file, function(err, pixels)
			{
				if(!pixels)
				{
					node.error("image did not convert correctly\n please check the url or file location");
					return;
				}
				//empties the array before we start
				output = [];
				var width  = Math.min( 128, pixels.shape[0]);
				var height = Math.min( 64,  pixels.shape[1]);


				//loop over the 2d array of pixels returned by getPixels
				for(var x = 0; x < width; x++)
				{
					for(var y = 0; y < height; y++)
					{
						//make sure the array actually contains data for this location
						if(pixels.get(x,y,0))
						{
							//push pixels to the output buffer
							//console.log(x);
							//console.log(y);
							output.push({payload: { x: x + xOffset, y: y + yOffset, r:pixels.get(x,y,0), g:pixels.get(x,y,1), b:pixels.get(x,y,2)} });
						}
					}
				}

				//call our send function from earlier
				readySend();
			})
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
				if(msg.payload === lastSent && (output && output.length > 0) && lastY == node.yOffset && lastX == node.xOffset)
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
				if(msg.payload.data === lastSent && (output && output.length > 0) && lastX == msg.payload.xOffset && lastY == msg.payload.yOffset)
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
		var node = this;

		node.on('input', function(msg)
		{
			if(msg.payload)
			{
				led.clear();
			}
		});
	}


	function Text (config)
	{
		RED.nodes.createNode(this, config);
		var node = this;

		node.font		= config.font;
		node.xOffset	= config.xOffset;
		node.yOffset	= config.yOffset;
		node.rgb		= config.rgb;




		node.on('input', function(msg)
		{
			var x		= msg.payload.xOffset ? msg.payload.xOffset : node.xOffset;
			var y		= msg.payload.yOffset ? msg.payload.yOffset : node.yOffset;
			var data	= msg.payload.data	  || msg.payload;
			var rgb		= msg.payload.rgb	  || node.rgb;

			if(msg.payload)
			{
				var color = eatRGBString(rgb);

				led.drawText(parseInt(x), parseInt(y), data, node.font, parseInt(color.r), parseInt(color.g), parseInt(color.b));
			}
		});
	}

	function PixelDataTransform (config)
	{
		RED.nodes.createNode(this, config);
		var node = this;

		node.xOffset = (config.xOffset || 0);
		node.yOffset = (config.yOffset || 0);
		node.refresh = (config.refresh || 0);
		node.rgb	 = (config.rgb     || "255,255,255");

		function outputFromString (msg)
		{
			var output =
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
			var output =
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


	function CircleToMatrix (config)
	{
		RED.nodes.createNode(this, config);
		var node = this;

		node.xPos	 = (config.xPos   || 0);
		node.yPos	 = (config.yPos	  || 0);
		node.radius	 = (config.radius || 0);
		node.rgb	 = (config.rgb    || "255,255,255");

		node.on('input', function (msg)
		{
			var color = eatRGBString(node.rgb);
			led.drawCircle( parseInt(node.xPos), parseInt(node.yPos), parseInt(node.radius), parseInt(color.r), parseInt(color.g), parseInt(color.b));
		});
	};

	function LineToMatrix (config)
	{
		RED.nodes.createNode(this, config);
		var node = this;

		node.x0Pos = (config.x0Pos || 0);
		node.y0Pos = (config.y0Pos || 0);
		node.x1Pos = (config.x1Pos || 0);
		node.y1Pos = (config.y1Pos || 0);
		node.rgb   = (config.rgb || "255,255,255");

		node.on('input', function (msg)
		{
			var color = eatRGBString(node.rgb);
			led.drawLine( parseInt(node.x0Pos), parseInt(node.y0Pos), parseInt(node.x1Pos), parseInt(node.y1Pos), parseInt(color.r), parseInt(color.g), parseInt(color.b));
		});


	};

	function TriangleToMatrix (config)
	{
		RED.nodes.createNode(this, config);
		var node = this;

		node.x0Pos = (config.x0Pos || 0);
		node.y0Pos = (config.y0Pos || 0);
		node.x1Pos = (config.x1Pos || 0);
		node.y1Pos = (config.y1Pos || 0);
		node.x2Pos = (config.x2Pos || 0);
		node.y2Pos = (config.y2Pos || 0);
		node.rgb   = (config.rgb || "255,255,255");

		node.on('input', function (msg)
		{
			var color = eatRGBString(node.rgb);
			led.drawLine( parseInt(node.x0Pos), parseInt(node.y0Pos), parseInt(node.x1Pos), parseInt(node.y1Pos), parseInt(color.r), parseInt(color.g), parseInt(color.b));
			led.drawLine( parseInt(node.x1Pos), parseInt(node.y1Pos), parseInt(node.x2Pos), parseInt(node.y2Pos), parseInt(color.r), parseInt(color.g), parseInt(color.b));
			led.drawLine( parseInt(node.x2Pos), parseInt(node.y2Pos), parseInt(node.x0Pos), parseInt(node.y0Pos), parseInt(color.r), parseInt(color.g), parseInt(color.b));
		});


	};


	//register our functions with node-red
	RED.nodes.registerType("led-matrix", LedMatrix);
	RED.nodes.registerType("clear-matrix", ClearMatrix);
	RED.nodes.registerType("pixel", PixelNode);
	RED.nodes.registerType("refresh-matrix", RefreshMatrix);
	RED.nodes.registerType("image-to-matrix", ImageToPixels);
	RED.nodes.registerType("text-to-matrix", Text);
	RED.nodes.registerType("pixel-transform", PixelDataTransform);
	RED.nodes.registerType("circle-to-matrix", CircleToMatrix);
	RED.nodes.registerType("line-to-matrix", LineToMatrix);
	RED.nodes.registerType("triangle-to-matrix", TriangleToMatrix);
}
