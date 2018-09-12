var Matrix = require('node-rpi-rgb-led-matrix')

//var led = new LedMatrix(64, 64, 1, 2, "adafruit-hat-pwm");

module.exports = function(RED) {

	var led = {};

	function LedMatrix(n) {
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
			led.setPixel(msg.x, msg.y, msg.r, msg.g, msg.b);

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


	RED.nodes.registerType("led-matrix", LedMatrix);
	RED.nodes.registerType("pixel", PixelNode);
	RED.nodes.registerType("refresh-matrix", RefreshMatrix);
}
			
