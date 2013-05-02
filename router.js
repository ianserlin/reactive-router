//////////////////////////////////////////////////////////////////////////////////////////////////////////////

	/**
	 * Perform initial dispatch.
	 */

	var dispatch = true;

	/**
	 * Base path.
	 */

	var base = '';

	/**
	 * Running flag.
	 */

	var running;

	/**
	 * To work properly with the URL
	 * history.location generated polyfill in https://github.com/devote/HTML5-History-API
	 */
	var location = history.location || window.location;

	/**
	 * Register `path` with callback `fn()`,
	 * or route `path`, or `page.start()`.
	 *
	 *   page(fn);
	 *   page('*', fn);
	 *   page('/user/:id', load, user);
	 *   page('/user/' + user.id, { some: 'thing' });
	 *   page('/user/' + user.id);
	 *   page();
	 *
	 * @param {String|Function} path
	 * @param {Function} fn...
	 * @api public
	 */

	function page(path, fn) {
		// <callback>
		if ('function' == typeof path) {
			return page('*', path);
		}

		// route <path> to <callback ...>
		if ('function' == typeof fn) {
			var route = new Route(path);
			for (var i = 1; i < arguments.length; ++i) {
				page.callbacks.push(route.middleware(arguments[i]));
			}
		// show <path> with [state]
		} else if ('string' == typeof path) {
			page.show(path, fn);
		// start [options]
		} else {
			page.start(path);
		}
	}

	/**
	 * Callback functions.
	 */

	page.callbacks = [];

	/**
	 * Get or set basepath to `path`.
	 *
	 * @param {String} path
	 * @api public
	 */

	page.base = function(path){
		if (0 == arguments.length) return base;
		base = path;
	};

	/**
	 * Bind with the given `options`.
	 *
	 * Options:
	 *
	 *    - `click` bind to click events [true]
	 *    - `popstate` bind to popstate [true]
	 *    - `dispatch` perform initial dispatch [true]
	 *
	 * @param {Object} options
	 * @api public
	 */

	page.start = function(options){
		options = options || {};
		if (running) return;
		running = true;
		if (false === options.dispatch) dispatch = false;
		if (false !== options.popstate) addEvent(window, 'popstate', onpopstate);
		if (false !== options.click) addEvent(document, 'click', onclick);
		if (!dispatch) return;
		page.replace(location.pathname + location.search, null, true, dispatch);
	};

	/**
	 * Unbind click and popstate event handlers.
	 *
	 * @api public
	 */

	page.stop = function(){
		running = false;
		removeEvent(document, 'click', onclick);
		removeEvent(window, 'popstate', onpopstate);
	};

	/**
	 * Show `path` with optional `state` object.
	 *
	 * @param {String} path
	 * @param {Object} state
	 * @param {Boolean} dispatch
	 * @return {Context}
	 * @api public
	 */

	page.show = function(path, state, dispatch){
		var ctx = new Context(path, state);
		if (false !== dispatch) page.dispatch(ctx);
		if (!ctx.unhandled && !ctx.cancelled) ctx.pushState(); // IAN
		return ctx;
	};

	/**
	 * Replace `path` with optional `state` object.
	 *
	 * @param {String} path
	 * @param {Object} state
	 * @return {Context}
	 * @api public
	 */

	page.replace = function(path, state, init, dispatch){
		var ctx = new Context(path, state);
		ctx.init = init;
		if (null == dispatch) dispatch = true;
		if (dispatch) page.dispatch(ctx);
		ctx.save();
		return ctx;
	};

	/**
	 * Dispatch the given `ctx`.
	 *
	 * @param {Object} ctx
	 * @api private
	 */

	page.dispatch = function(ctx){
		var i = 0;

		function next() {
			var fn = page.callbacks[i++];
			if (!fn) return unhandled(ctx);
			fn(ctx, next);
		}

		next();
	};

	/**
	 * Unhandled `ctx`. When it's not the initial
	 * popstate then redirect. If you wish to handle
	 * 404s on your own use `page('*', callback)`.
	 *
	 * @param {Context} ctx
	 * @api private
	 */

	function unhandled(ctx) {
		if (location.pathname + location.search == ctx.canonicalPath) return;
		page.stop();
		ctx.unhandled = true;
		window.location = ctx.canonicalPath;
	}

	/**
	 * Initialize a new "request" `Context`
	 * with the given `path` and optional initial `state`.
	 *
	 * @param {String} path
	 * @param {Object} state
	 * @api public
	 */

	function Context(path, state) {
		if ('/' == path[0] && 0 != path.indexOf(base)) path = base + path;
		var i = path.indexOf('?');
		this.canonicalPath = path;
		this.path = path.replace(base, '') || '/';
		this.title = document.title;
		this.state = state || {};
		this.state.path = path;
		this.querystring = ~i ? path.slice(i + 1) : '';
		this.pathname = ~i ? path.slice(0, i) : path;
		this.params = [];
	}

	/**
	 * Expose `Context`.
	 */

	page.Context = Context;

	/**
	 * Push state.
	 *
	 * @api private
	 */

	Context.prototype.pushState = function(){
		history.pushState(this.state, this.title, this.canonicalPath);
	};

	/**
	 * Save the context state.
	 *
	 * @api public
	 */

	Context.prototype.save = function(){
		history.replaceState(this.state, this.title, this.canonicalPath);
	};

	/**
	 * Initialize `Route` with the given HTTP `path`,
	 * and an array of `callbacks` and `options`.
	 *
	 * Options:
	 *
	 *   - `sensitive`    enable case-sensitive routes
	 *   - `strict`       enable strict matching for trailing slashes
	 *
	 * @param {String} path
	 * @param {Object} options.
	 * @api private
	 */

	function Route(path, options) {
		options = options || {};
		this.path = path;
		this.method = 'GET';
		this.regexp = pathtoRegexp(path
			, this.keys = []
			, options.sensitive
			, options.strict);
	}

	/**
	 * Expose `Route`.
	 */

	page.Route = Route;

	/**
	 * Return route middleware with
	 * the given callback `fn()`.
	 *
	 * @param {Function} fn
	 * @return {Function}
	 * @api public
	 */

	Route.prototype.middleware = function(fn){
		var self = this;
		return function(ctx, next){
			if (self.match(ctx.path, ctx.params)) return fn(ctx, next);
			next();
		}
	};

	/**
	 * Check if this route matches `path`, if so
	 * populate `params`.
	 *
	 * @param {String} path
	 * @param {Array} params
	 * @return {Boolean}
	 * @api private
	 */

	Route.prototype.match = function(path, params){
		var keys = this.keys
			, qsIndex = path.indexOf('?')
			, pathname = ~qsIndex ? path.slice(0, qsIndex) : path
			, m = this.regexp.exec(pathname);

		if (!m) return false;

		for (var i = 1, len = m.length; i < len; ++i) {
			var key = keys[i - 1];

			var val = 'string' == typeof m[i]
				? decodeURIComponent(m[i])
				: m[i];

			if (key) {
				params[key.name] = undefined !== params[key.name]
					? params[key.name]
					: val;
			} else {
				params.push(val);
			}
		}

		return true;
	};

	/**
	 * Normalize the given path string,
	 * returning a regular expression.
	 *
	 * An empty array should be passed,
	 * which will contain the placeholder
	 * key names. For example "/user/:id" will
	 * then contain ["id"].
	 *
	 * @param  {String|RegExp|Array} path
	 * @param  {Array} keys
	 * @param  {Boolean} sensitive
	 * @param  {Boolean} strict
	 * @return {RegExp}
	 * @api private
	 */

	function pathtoRegexp(path, keys, sensitive, strict) {
		if (path instanceof RegExp) return path;
		if (path instanceof Array) path = '(' + path.join('|') + ')';
		path = path
			.concat(strict ? '' : '/?')
			.replace(/\/\(/g, '(?:/')
			.replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?/g, function(_, slash, format, key, capture, optional){
				keys.push({ name: key, optional: !! optional });
				slash = slash || '';
				return ''
					+ (optional ? '' : slash)
					+ '(?:'
					+ (optional ? slash : '')
					+ (format || '') + (capture || (format && '([^/.]+?)' || '([^/]+?)')) + ')'
					+ (optional || '');
			})
			.replace(/([\/.])/g, '\\$1')
			.replace(/\*/g, '(.*)');
		return new RegExp('^' + path + '$', sensitive ? '' : 'i');
	};

	/**
	 * Handle "populate" events.
	 */

	function onpopstate(e) {
		if (e.state) {
			var path = e.state.path;
			page.replace(path, e.state);
		}
	}

	/**
	 * Handle "click" events.
	 */

	function onclick(e) {
		if (!which(e)) return;
		if (e.metaKey || e.ctrlKey || e.shiftKey) return;
		if (e.defaultPrevented) return;
		var el = e.target || e.srcElement;
		while (el && 'A' != el.nodeName) el = el.parentNode;
		if (!el || 'A' != el.nodeName) return;
		var href = el.href;
		var path = el.pathname + el.search;
		
		// XXX: I don't think this hack will work in earlier versions of IE, 
		// fix to properly parse out path from href; I'm just putting this in for
		// now to see if it works
		if (path[0] !== '/')
			path = '/' + path;
		
		if (el.hash || '#' == el.getAttribute('href')) return;
		if (!sameOrigin(href)) return;
		var orig = path;
		path = path.replace(base, '');
		if (base && orig == path) return;
		e.preventDefault ? e.preventDefault() : e.returnValue = false;
		page.show(orig);
	}

	/**
	 * Event button.
	 */

	function which(e) {
		e = e || window.event;
		return null == e.which
			? e.button == 0
			: e.which == 1;
	}
	
	/**
	 * Check if `href` is the same origin.
	 */

	function sameOrigin(href) {
		var origin = location.protocol + '//' + location.hostname;
		if (location.port) origin += ':' + location.port;
		return 0 == href.indexOf(origin);
	}
	
	/**
	 * Basic cross browser event code
	 */

	 function addEvent(obj, type, fn) {
		 if (obj.addEventListener) {
			 obj.addEventListener(type, fn, false);
		 } else {
			 obj.attachEvent('on' + type, fn);
		 }
	 }

	 function removeEvent(obj, type, fn) {
		 if (obj.removeEventListener) {
			 obj.removeEventListener(type, fn, false);
		 } else {
			 obj.detachEvent('on' + type, fn);
		 }
	 }

	/**
	 * Expose `page`.
	 */

	if ('undefined' == typeof module) {
		window.page = page;
	} else {
		module.exports = page;
	}

	//////////////////////////////////////////////////////////////////////////////////////////////////////////////

_state = new ReactiveDict();

function Router(options){
	this.options = options;
	// _state.set('layoutName', options.layout || 'layout');
	var self = this;
	Meteor.startup(function(){
		self.start();
		page();
	});

	// _.bind(this._render, this);
}

// to: "templateName",
// layout: "layoutName",
// nav: "nav key",
// before: [ before callbacks ],
// as: "path helpers name"

// [
// 	{ 
// 		from: ''
// 		, to: ''
// 	}
// ]

Router.prototype = {
	constructor: Router,
	renderDependency: new Deps.Dependency,

	start: function(){
		var self = this;
		Deps.autorun(function autoRenderPage(){
			var template = _state.get('templateName')
				ast = template && Template[template] ? [[">", template]] : [];
			delete Template.renderPage;
			Meteor._def_template('renderPage', function renderPage(data, options){
				self.renderDependency.depend();
				// XXX in options.helpers we can add a lookup function for the
				// current reactive context

				return Handlebars.json_ast_to_func(ast).call(this, data, options)
			});
			self.renderDependency.changed();
		});
		_state.set('layoutName', 'layout');
		Deps.autorun(function autoRenderLayout(){
			var template = _state.get('layoutName');
			if(template){
				document.body.innerHTML = '';
				document.body.appendChild(
					Spark.render(
						Meteor._def_template( null, Handlebars.json_ast_to_func(
							[
            					[">", template]
        					]
        				) )
					)
				);
			}
		});
	},

	_generateCallback: function(route) {
		var self = this;
		return function routerTemplateCallback(ctx, next){
			// XXX is this probably causing a memory leak
			// with the autoruns or something?
			self.reactiveContext = new ReactiveDict();
			var cancelled = _.any(route.before, function beforeFilterRunner(beforeFilter){
				return beforeFilter.call(self.reactiveContext, ctx) === false;
			});
			if(cancelled !== true){
				// self.currentContext = reactiveContext;
				console.log('setting template name to', route.to);
				_state.set('templateName', route.to);
				// self.templateName = route.to;
				// self._render();
			}else{
				ctx.cancelled = true;
			}
		}
	},

	route: function (routes) {
		var self = this;
		_.each(routes, function(route){
			if('function' == typeof route.before){ route.before = [route.before]}
			page(route.path, self._generateCallback(route));
			self.addPathHelper(route);
		});
	},

	addPathHelper: function (route) {
		var helperName = route.to + 'Path'
			self = this;
		// pathWithContext
		if (!Meteor[helperName]) {
	    	var helper = function (context) {
				return self.populatedPath(route, context);
			}

			Meteor[helperName] = helper;
	    	if (Handlebars._default_helpers[helperName]) return;

		    Handlebars.registerHelper(helperName, function (context, options) {
		    	if (arguments.length === 1)
		    		return helper(this);
				else
					return helper(context);
		    });
		}
	},

    populatedPath: function (route, context) {
        var path = route.path
        	, regex = pathtoRegexp(path, [], false, false)
        	, parts;
          
		parts = regex.exec(path).slice(1);
		context = context || {};

		var replacePathPartWithContextValue = function (part) {
			var re = new RegExp(part, "g"),
				prop = part.replace(":", ""),
				val;

			if (val = context[prop])
				path = path.replace(re, val);
			else
				path = path.replace(re, "");
		};

		_.each(parts, replacePathPartWithContextValue);

		return path;
    }
};

var router = new Router();

var MeteorExtensions = {
	route: function(routes){
		router.route(routes);
	}
	, go: function(path){
		page(path)
	}
	, currentPage: function(key, value){
		if('string' == typeof key && arguments.length > 1){
			router.reactiveContext.set(key, value);
		}else{
			return router.reactiveContext.get(key);
		}
	}
	, router: router // XXX remove
	, page: page // XXX remove
};

_.extend(Meteor, MeteorExtensions);

function reactiveDictToObject(rdict){
	var plain = {};
	
	_.each(rdict.keys, function(value, key){
		plain[key] = rdict.get(key);
	});
	return plain;
};

// _.extend(ReactiveDict, ReactiveDictExtensions);

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

Handlebars.registerHelper("log", function handlebarsLogger(msg, options) {
	console.log('HANDLEBARS LOG - ', msg);
	return '';
});

Handlebars.registerHelper("page", function handlebarsPageHelper(dataPath, options){
	var target
		, parts;

	// lookup path in the reactive context
	if(router.reactiveContext){
		parts = dataPath.split('.');
		if(parts[0]){
			target = router.reactiveContext.get(parts.shift());
			_.each(parts, function(part){
				if(target && part && target.hasOwnProperty(part)){
					target = target[part];
				}else{
					target = null;
				}
			});
		}
	}
	return target || '';
});