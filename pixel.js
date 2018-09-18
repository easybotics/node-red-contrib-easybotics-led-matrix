var Matrix = require('node-rpi-rgb-led-matrix')
var getPixels = require('get-pixels'); 


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
		this.width = n.width; 
		this.height = n.height; 

		//if led is undefined we create a new one
		if(!led) 
		{
			led = new Matrix(64, 64, 1, 2, "adafruit-hat-pwm");
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
			//self documenting 
			led.setPixel(msg.payload.x, msg.payload.y, msg.payload.r, msg.payload.g, msg.payload.b);

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
		node.file = config.file; 
		var output = [];

		//function to actually send the output to the next node 
		function readySend () 
		{
			console.log("sending pixels");
			
			//see node-red docmentation for how node.send treats arrays 
			//node.send(output) would send one pixel to n outputs 
			//node.send([output], true) sends the pixiels to output 1, and true to output 2 
			node.send([output]); 
		}

		//if we receive input
		node.on('input', function(msg) 
		{
			//set the url var
			if(msg.payload)
			{
				console.log(msg.payload);
				node.file = msg.payload; 
			}

			getPixels(node.file, function(err, pixels) 
			{
				//empties the array before we start 
				output = [];

				//loop over the 2d array of pixels returned by getPixels 
				for(var x = 0; x < 128; x++) 
				{
					for(var y = 0; y < 64; y++)
					{
						//make sure the array actually contains data for this location 
						if(pixels.get(x,y,0))
						{
							//push pixels to the output buffer 
							output.push({payload: { x:x, y:y, r:pixels.get(x,y,0), g:pixels.get(x,y,1), b:pixels.get(x,y,2)} });
						}
					}
				}

				//call our send function from earlier 
				readySend();
			});

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
			




	//register our functions with node-red 
	RED.nodes.registerType("led-matrix", LedMatrix);
	RED.nodes.registerType("clear-matrix", ClearMatrix);
	RED.nodes.registerType("pixel", PixelNode);
	RED.nodes.registerType("refresh-matrix", RefreshMatrix);
	RED.nodes.registerType("image-to-pixels", ImageToPixels);
}
			
