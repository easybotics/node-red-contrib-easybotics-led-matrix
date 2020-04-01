var exports = module.exports = {}

/*
 * this was a probably uncesary project that Ryan did in order to help validate user input
 * for example, the 'validOrDefault' function is used for taking a user input, checking if its valid
 * and then providing a default value if the user value isn't valid
 * it's used in pixel.js sparsleey to validate .config options for node-red
 *
 */

/*
 * Used to convert types in validateOrDefault, easy to add more if needed
 */
let converters = new Map([
	['number', function(num) {
		let out = Number(num)
		//Number() doesn't output NaN when given an empty string
		if(num === '') return false
		if(isNaN(out)) return false
		return out
	}]
])

/*
 * Typically just for parsing HTML input fields, checks if a value is valid
 * based on validation function if provided, otherwise checks if it's the right
 * data type, if not right type or validated, it returns the default value
 */
exports.validateOrDefault = function(input, d, v = false)
{
	let parsed

	//if we have a validation function, use it
	if(v !== false)
	{
		parsed = v(input) ? input : d
	}
	//if no validation function, check if input is the right type
	else if(typeof input === typeof d)
	{
		parsed = input
	}
	//if not, try to convert it to the right type
	else if(converters.has(typeof d))
	{
		parsed = converters.get(typeof d)(input)
		if(parsed === false) parsed = d
	}
	//if we can't do anything, use default value
	else
	{
		parsed = d
	}

	return parsed
}

/*
 * Validation function for RGB sequences
 */
exports.validateRGBSequence = function(str)
{
	if(str.includes('R') && str.includes('G') && str.includes('B') && str.length === 3) {
		return true
	} else {
		return false
	}
}
