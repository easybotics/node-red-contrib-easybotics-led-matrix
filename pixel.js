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

	function PixelNode(config) 
	{
		RED.nodes.createNode(this, config); 
		var node = this; 



		node.on('input', function(msg) 
		{ 
			node.send(msg); 
			led.setPixel(0,0,255,255,255);
			led.update();

		});
	}




	RED.nodes.registerType("led-matrix", LedMatrix);
	RED.nodes.registerType("pixel", PixelNode);
}
			
