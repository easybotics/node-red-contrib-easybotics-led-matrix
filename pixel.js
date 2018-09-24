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

		this.warn(this.brightness);

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

		//filename or URL to look for an image 
		//and an array we will will with pixels 
		var output = [];
		var lastSent;

		//function to actually send the output to the next node 
		function readySend () 
		{
			//console.log("sending pixels");
			
			//see node-red docmentation for how node.send treats arrays 
			//node.send(output) would send one pixel to n outputs 
			//node.send([output], true) sends the pixiels to output 1, and true to output 2 
			node.send([output]); 
		}

		//function that takes a file, and an offset and tries to convert the file into a stream of pixels 
		function createPixelStream (file, xOffset, yOffset)
		{
			getPixels(file, function(err, pixels) 
			{
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
			//set the url var
			if( typeof msg.payload === "string")
			{
				if(msg.payload === lastSent)
					return readySend();

				lastSent = msg.payload;
				return createPixelStream( msg.payload, 0, 0);
			}

			if( msg.payload.data && msg.payload.xOffset && msg.payload.yOffset)
			{
				if(msg.payload.data === lastSent)
					return readySend();

				lastSent = msg.payload.data;

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

		node.font = config.font;


		node.on('input', function(msg) 
		{
			var x		= msg.payload.xOffset || 0; 
			var y		= msg.payload.yOffset || 0; 
			var data	= msg.payload.data || msg.payload; 

			if(msg.payload)
			{
				led.drawText(x, y, data, node.font,255,0,0); 
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
		node.color   = ("#ffffff");

		function outputFromString (msg) 
		{
			var output = 
			{
				data:    msg.payload,
				xOffset: parseInt(node.xOffset), 
				yOffset: parseInt(node.yOffset), 
				refresh: parseInt(node.refresh), 
				color:   node.color
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
				color:   node.color
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

	
		


	



	//register our functions with node-red 
	RED.nodes.registerType("led-matrix", LedMatrix);
	RED.nodes.registerType("clear-matrix", ClearMatrix);
	RED.nodes.registerType("pixel", PixelNode);
	RED.nodes.registerType("refresh-matrix", RefreshMatrix);
	RED.nodes.registerType("image-to-pixels", ImageToPixels);
	RED.nodes.registerType("text", Text); 
	RED.nodes.registerType("pixel-transform", PixelDataTransform);
}
			
