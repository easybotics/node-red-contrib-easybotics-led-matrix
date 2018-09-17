var Matrix = require('node-rpi-rgb-led-matrix')
var getPixels = require('get-pixels'); 


//var led = new LedMatrix(64, 64, 1, 2, "adafruit-hat-pwm");

module.exports = function(RED) {

	var led;

	function LedMatrix(n) 
	{
		RED.nodes.createNode(this, n);
		this.width = n.width; 
		this.height = n.height; 

		console.log("initing led matrix node"); 
		if(!led) 
		{
			led = new Matrix(64, 64, 1, 2, "adafruit-hat-pwm");
		}

		if(led) 
		{
			led.clear();
			led.update(); 
		}

	}

	function PixelNode (config) 
	{
		RED.nodes.createNode(this, config); 
		var node = this; 

		node.on('input', function(msg) 
		{ 
			led.setPixel(msg.payload.x, msg.payload.y, msg.payload.r, msg.payload.g, msg.payload.b);

		});
	}

	function RefreshMatrix (config)
	{
		RED.nodes.createNode(this, config); 
		var node = this; 

		node.on('input', function(msg) 
		{
			if(msg.payload) 
			{
				led.update(); 
			}
		}); 
	}

	function ImageToPixels (config) 
	{
		RED.nodes.createNode(this, config); 
		var node = this; 
		node.file = config.file; 

		var output = [];

		function readySend () 
		{
			console.log("sending pixels");
			node.send([output]); 
		}

		node.on('input', function(msg) 
		{
			if(msg.payload)
			{
				console.log(msg.payload);
				node.file = msg.payload; 
			}

			getPixels(node.file, function(err, pixels) 
			{
				for(var x = 0; x < 128; x++) 
				{
					for(var y = 0; y < 64; y++)
					{
						if(pixels.get(x,y,0))
						{
							console.log(x, y);
							output.push({payload: { x:x, y:y, r:pixels.get(x,y,0), g:pixels.get(x,y,1), b:pixels.get(x,y,2)} });
						}
					}
				}

				readySend();
			});

		});
	}

	function ClearMatrix (config) 
	{
		RED.nodes.createNode(this, config); 
		var node = this; 

		node.on('input', function(msg) 
		{
			if(msg.payload) 
			{
				console.log("clearing");
				led.clear(); 
			}
		}); 
	}
			




	RED.nodes.registerType("rled-matrix", LedMatrix);
	RED.nodes.registerType("rclear-matrix", ClearMatrix);
	RED.nodes.registerType("rpixel", PixelNode);
	RED.nodes.registerType("rrefresh-matrix", RefreshMatrix);
	RED.nodes.registerType("rimage-to-pixels", ImageToPixels);
}
			
