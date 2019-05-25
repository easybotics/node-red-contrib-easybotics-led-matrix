var dp = require('../displayPrimitives.js')

module.exports = function(RED) {
	function BallTest(config)
	{
		RED.nodes.createNode(this, config)
		const node = this
		dp.
	}

	//register our functions with node-red
	RED.nodes.registerType('ball-test', BallTest)
}
