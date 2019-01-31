
var exports = module.exports = {};
//some geo primitives we'll use everywhere

exports.Color = function ()
{
	this.r;
	this.g;
	this.b;

	this.fromHexString = function (h)
	{
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

		const e = eatHexString(h);

		this.r = e.r;
		this.g = e.g;
		this.b = e.b;
	}

	this.toHex = function ()
	{
		function componentToHex(c)
		{
			var hex = c.toString(16);
			return hex.length == 1 ? "0" + hex : hex;
		}

		function rgbToHex(r, g, b)
		{
			return "#" + componentToHex(this,r) + componentToHex(this.g) + componentToHex(this.b);
		}

		return rgbToHex(this.r, this.g, this.b);
	}

	this.fromRgbString = function (str)
	{
		const s = str.split(',');
		const  output = {r: parseInt(s[0]), g: parseInt(s[1]), b: parseInt(s[2])};

		this.r = output.r;
		this.g = output.g;
		this.b = output.b;

		return this;
	}

	this.toRgbString  = function ()
	{
		return r + ',' + g + ',' + b;
	}

	this.fromRgb = function (r, g, b)
	{
		this.r = r;
		this.g = g;
		this.b = b;

		return this;
	}
}

exports.Point = function (x, y)
{
	this.x = parseInt(x);
	this.y = parseInt(y);

	//returns the distance to another point
	this.distance = function (p)
	{
		return Math.sqrt( Math.pow( p.x - this.x) + Math.pow( p.y - this.y));
	}

	//returns the midpoint between this point and another point
	this.midpoint = function (p)
	{
		return Point( (this.x + p.x) / 2, (this.y + p.y) / 2);
	}

	//draws on an led matrix we give it
	this.draw = function (l, color)
	{
		l.setPixel(parseInt(this.x), parseInt(this.y), parseInt(color.r), parseInt(color.g), parseInt(color.b));
	}
}

//takes two points, and returns a line between them
exports.Line = function (start, end)
{
	this.start = start;
	this.end   = end;

	this.yMax = function ()
	{
		return start.y > end.y ? start.y : end.y;
	}

	this.yMin = function ()
	{
		return start.y < end.y ? start.y : end.y;
	}




	this.intersects = function (line)
	{
		function onSegment (p, q, r)
		{
			if (q.x <= Math.max(p.x, r.x) &&
				q.x >= Math.min(p.x, r.x) &&
				q.y <= Math.max(p.y, r.y) &&
				q.y >= Math.min(p.y, r.y))
			{
				return true;
			}

			return false;
		}

		function orientation (p, q, r)
		{
			val = (q.y - p.y) * (r.x - q.x) -(q.x - p.x) * (r.y - q.y);

			if (val == 0) return 0;  // colinear

			return (val > 0)? 1: 2; // clock or counterclock wise
		}


		p1 = this.start;
		q1 = this.end;
		p2 = line.start;
		q2 = line.end;

		o1 = orientation(p1, q1, p2);
		o2 = orientation(p1, q1, q2);
		o3 = orientation(p2, q2, p1);
		o4 = orientation(p2, q2, q1);

		if (o1 != o2 && o3 != o4)
			return true;

		// Special Cases
		// p1, q1 and p2 are colinear and p2 lies on segment p1q1
		if (o1 == 0 && onSegment(p1, p2, q1)) return true;

		// p1, q1 and q2 are colinear and q2 lies on segment p1q1
		if (o2 == 0 && onSegment(p1, q2, q1)) return true;

		// p2, q2 and p1 are colinear and p1 lies on segment p2q2
		if (o3 == 0 && onSegment(p2, p1, q2)) return true;

		 // p2, q2 and q1 are colinear and q1 lies on segment p2q2
		if (o4 == 0 && onSegment(p2, q1, q2)) return true;

		return false; // Doesn't fall in any of the above cases
	}

	//draw on an led matrix we give it
	this.draw = function (l, color)
	{
		l.drawLine( this.start.x, this.start.y, this.end.x, this.end.y, parseInt(color.r), parseInt(color.g), parseInt(color.b));
	}
}

exports.Polygon = function (p)
{
	this.points = p;
	this.drawLineCache;
	this.drawFillCache = [];

	this.boundryIntersections = function (l)
	{
		num = 0;
		height = l.start.y;

		for (const c of this.getLines())
		{
			if(height == c.yMax()) continue;
			if(l.intersects(c)) num++;
		}

		return num;
	}

	this.clipBounds = function ()
	{
		tx = this.points[0].x;
		ty = this.points[0].y;
		bx = this.points[0].x;
		by = this.points[0].y;

		for( const p of this.points)
		{
			tx = p.x < tx ? p.x : tx;
			ty = p.y < ty ? p.y : ty;
			bx = p.x > bx ? p.x : bx;
			by = p.y > by ? p.y : by;
		}

		return {topLeft: new exports.Point(tx, ty), bottomRight: new exports.Point(bx, by)}
	}

	this.getLines = function ()
	{
		lines = [];

		first = this.points[0];
		last  = undefined;

		for(const p of this.points)
		{
			if (last)
				lines.push(new exports.Line(last, p));

			last = p;
		}

		lines.push(new exports.Line(last, first));
		return lines;
	}

	//moved this to a pure function so its fine to call async
	//pure function just means it doesn't modify any variables outside its scope
	//returns a buffer instead of editing the classes one
	this.pureFill = function()
	{
		var dfCache = [];
		const bounds = this.clipBounds();


		for(var x = bounds.topLeft.x; x < bounds.bottomRight.x; x++)
		{
			for(var y = bounds.topLeft.y; y < bounds.bottomRight.y; y++)
			{
				const leftTest  = new exports.Line( new exports.Point(bounds.topLeft.x, y), new exports.Point(x, y));
				const rightTest = new exports.Line( new exports.Point(x, y), new exports.Point(bounds.bottomRight.x, y));

				const left  = this.boundryIntersections(leftTest);
				const right = this.boundryIntersections(rightTest);

				if ((left % 2) && (right % 2))
				{
					dfCache.push( new exports.Point(x, y));
				}
			}
		}

		return dfCache;
	}

	//wrap our pure function in a promise
	//promises run asynchronously, and have a .then() method which defines 
	//-- what happens when the result is returned
	this.promiseWrapperFill = function()
	{
		//tricky error here, which is that 'this' is not captured in these lambdas 
		const n = this;

		//so we just make a n. thing to use as this
		//probably should have assigned a const to this at the global scope, which ill probably do
		return new Promise(function(resolve, reject)
			{
				const buffer = n.pureFill();
				resolve(buffer);
			});
	}


	this.fill = function ()
	{

		//remmeber that 'this' isn't captured
		const n = this;

		//.then() notation
		this.promiseWrapperFill().then(function(result)
			{
				n.drawFillCache = result;
			});
	}


	this.draw = function (l, color)
	{
		this.drawLinesCache = this.getLines();

		for( const c of this.drawLinesCache)
		{
			c.draw(l, color);
		}

		for( const p of this.drawFillCache)
		{
			p.draw(l, color);
		}
	}
}
