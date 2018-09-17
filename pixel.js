var Matrix = require('node-rpi-rgb-led-matrix')
var getPixels = require('get-pixels'); 


//var led = new LedMatrix(64, 64, 1, 2, "adafruit-hat-pwm");

module.exports = function(RED) {

	var led = {};

	function LedMatrix(n) 
	{
		RED.nodes.createNode(this, n);
		this.width = n.width; 
		this.height = n.height; 

		led = new Matrix(64, 64, 1, 2, "adafruit-hat-pwm");

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
			led.update(); 
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
							output.push({payload: { x:x, y:y, r:pixels.get(x,y,0), g:pixels.get(x,y,1), b:pixels.get(x,y,2)} });
						}
					}
				}

				readySend();
			});

		});
	}





	RED.nodes.registerType("led-matrix", LedMatrix);
	RED.nodes.registerType("pixel", PixelNode);
	RED.nodes.registerType("refresh-matrix", RefreshMatrix);
	RED.nodes.registerType("image-to-pixels", ImageToPixels);
}
			
