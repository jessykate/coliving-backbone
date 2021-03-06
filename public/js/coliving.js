$(function() {

	/////////////////////// SETTINGS ////////////////////////
	API_BASE = "http://localhost:8111/api/v1/";
	MEDIA_BASE = "http://localhost:8989/";

	/////////////////////// UTIL ////////////////////////
	locationParse = function(locString) {
		// returns a list item of floats, [longitude, latitude] (in that order!)
		ll = locString.split(",");
		latitude = parseFloat(ll[0]);
		longitude = parseFloat(ll[1]);
		loc = [longitude, latitude];
		return loc;
	};

	registerInputAutoComplete = function(div_id) {
		// register a location autocomplete function on the search box.
		var location_search_field = document.getElementById(div_id);
		var options = {
			types: ['geocode']
		}
		var autocomplete = new google.maps.places.Autocomplete(location_search_field, options);
	};

	geoIcon = function() {
		var size = new OpenLayers.Size(21,25);
		var offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
		var icon = new OpenLayers.Icon(MEDIA_BASE +'img/noun_project_2847.svg',size,offset);
		icon.setOpacity(0.6);
		return icon;
	};

	getCustomControls = function() {
		var controls = [
			new OpenLayers.Control.Attribution(),
			new OpenLayers.Control.TouchNavigation(),
			new OpenLayers.Control.ZoomPanel()
		];
		return controls;
	};

	// object literal. exists outside the app view since a new app view object
	// is created each time the view is loaded. (could change that instead i
	// suppose) 
	ActiveSearch = function() {
		this.center= null,
		// serves as the default search radius
		this.radius= 20,
		// radius in m
		this.radius_m = 20000,
		this.bounds= null,
		this.search_string = "",
		this.update= function(search_gloc, radius, search_str) {
			// this is probably a *google* maps latLong object (hence
			// the g). 
			this.center = search_gloc; 
			this.search_string = search_str;
			// radius is in meters
			this.radius = radius; 
			this.radius_m = this.radius*1000.0;
			this.computeBounds();
		},
		this.computeBounds= function() {
			// informal bounds caculation: http://stackoverflow.com/questions/
			// 1253499/simple-calculations-for-working-with-lat-lon-km-distance
			// Latitude: 1 deg = 110.54 km ==> 110540m. 
			//	ie radius(m)/110540 = num degrees
			// Longitude: 1 deg = 111.320*cos(latitude) km
			//	ie radius(m)/(113.320*cos(lat)*1000 m) = deg
			var m_per_deg_lat = 110540.0;
			var m_per_deg_long = 113.320*Math.cos(this.center.lat())*1000.0;
			var delta_lat =  this.radius_m/m_per_deg_lat;					
			var delta_lon = this.radius_m/m_per_deg_long;

			var north, east;
			if (this.center.lng() < 0 && this.center.lat() > 0) {
				// north america 
				north = 1;
				east = 1;
			} else if (this.center.lng() > 0 && this.center.lat() > 0) {
				// europe
				 north = 1;
				 east = -1;
			} else if (this.center.lng() > 0 && this.center.lat() < 0) {
				// australia
				 north = -1;
				 east = -1;
			} else {
				// south america
				 north = -1;
				 east = -1;
			}

			this.bounds = new OpenLayers.Bounds();
			this.bounds.left = this.center.lng() - east*delta_lon;
			this.bounds.right = this.center.lng() + east*delta_lon;
			this.bounds.top = this.center.lat() + north*delta_lat;
			this.bounds.bottom = this.center.lat() - north*delta_lon;
			console.log(this.bounds);
		},
		this.getBounds= function() {
			// need a NEW object, not just the existing one (or all refs to
			// bounds will point to the same object). 
			return this.bounds.clone();
		}
	};
	activeSearch = new ActiveSearch();

	////////////// MODELS & COLLECTIONS /////////////////

	window.House = Backbone.Model.extend({
		initialize: function() { },
		url: function() { 
			if (this.isNew()) {
				return API_BASE + "houses/?format=json";
			} else {
				return API_BASE + "houses/" + this.id + "?format=json";
			}
		},
		geocodeAddr: function() {
			// a model change event is set to trigger in the NewHouseView if geocoding succeeds
			var geocoder = new google.maps.Geocoder();
			that = this;
			geocoder.geocode( { 'address': this.get("address")}, function(results, status) {
				if (status == google.maps.GeocoderStatus.OK) {
					latStr = results[0].geometry.location.lat().toString();
					lngStr = results[0].geometry.location.lng().toString();
					var newLatLong = latStr + "," + lngStr;
					that.set({latLong: newLatLong});
					console.log("latLong was set to " + newLatLong);
				} else {
					console.log("Error: Geocode was not successful: " + status);
				}
			});
		},

		htmlSummary: function() {
			var html = "";
			
			// set title
			if (this.get("name")) {
				html += ( "<h2><a class='house-link' href='/house/" + this.id + "'>" + this.get("name") + "</a></h2>" );
				html += ( "<h3>" + this.get("address") + "</h3>" );
			} else {
				html += ( "<h2>" + this.get("address") + "</h2>" );
			}

			// set contents
			html += ("<div>Rooms: " + this.get("rooms") + "</div>" );
			if (this.get("website")) {
				html += ("<div>Website: <a href='" + this.get("website") + "' target='_blank'>Visit Website</a></div>" );
			}
			if (this.get("description")) {
				html += ("<div>" + this.get("description") + "</div>" );
			}
			return html;
		}
	});

	window.Houses = Backbone.Collection.extend({
		model: House,
		initialize: function(models, options) { },
		// XXX (jks) careful with pagination and limits once list gets long
		url: function() {
			return API_BASE + "houses/?format=json&limit=200";
		},

		parse: function(response) {
			/* from the backbone docs: "The function is passed the raw response
			 * object, and should return the array of model attributes to be
			 * added to the collection. The default implementation is a no-op,
			 * simply passing through the JSON response." */
			
			// the tasty-pie API we are working with returns some metadata we
			// don't want to include in the model, such as limits and
			// pagination information. we need to pull out the models. 
			return response.objects;
		}
	});

	/////////////////////// VIEWS ////////////////////////

	window.houses = new Houses();

	window.HouseView = Backbone.View.extend({
		initialize: function() {
			this.template = _.template($("#house-template").html());
		},

		render: function() {
			console.log("rendering individual house view");
			console.log(this.model.toJSON());
			$(this.el).html(this.template( {house: this.model.toJSON()} ));
			this.locationMap();
			return this;
		},

		// XXX this is an exact copy of the locationMap function from the
		// newHouse view. should create a common base view. 
		locationMap: function() {
			console.log("in individual house locationMap().");

			// set up the map with the tile layer and a layer to put markers
			// in. 
			$("#house-map").html("");
			var map = new OpenLayers.Map({div: "house-map"});
			var panel = new OpenLayers.Control.Panel();
			panel.addControls(getCustomControls());
			map.addLayer(new OpenLayers.Layer.OSM());
			var markerLayer = new OpenLayers.Layer.Markers( "Markers" );
			map.addLayer(markerLayer);

			var latLong = this.model.get("latLong");
			// returns location string as array
			loc = locationParse(latLong);
			var lonlat = new OpenLayers.LonLat(loc[0], loc[1]).transform(
				new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
				new OpenLayers.Projection("EPSG:900913")
			);

			markerLayer.addMarker(new OpenLayers.Marker(lonlat, geoIcon()))

			map.updateCenter = function(loc, zoom) {
				var fromProjection = new OpenLayers.Projection("EPSG:4326");   // Transform from WGS 1984
				var toProjection = new OpenLayers.Projection("EPSG:900913"); // to Spherical Mercator Projection
				// center the map somewhere in the middle of the world
				var mapCenter = new OpenLayers.LonLat(loc[0], loc[1]).transform( fromProjection, toProjection);
				// forces the tiles of the map to render. 
				this.setCenter(mapCenter, zoom);
			}

			var zoom = 15;
			map.updateCenter(loc, zoom);
		},

	});

	window.NewHouseView = Backbone.View.extend({
		events: {'click #form-submit': 'formSubmit'},

		initialize: function(options) {
			this.model.on('change:latLong', this.locationMap, this);
			//this.model.on('sync', this.displayHouse, this);
			this.template = _.template($("#signup-template").html());
			_.bindAll(this, 'render', 'formSubmit', 'locationMap');
		},

		render: function() {
			console.log("rendering new house form");
			$(this.el).html(this.template());
			
			// credit: http://stackoverflow.com/questions/1909441/jquery-keyup-delay
			var delay = function(callback, ms) {
				var timer = 0;
				return function(callback,ms) {
					clearTimeout(timer);
					timer = setTimeout(callback,ms);
				};
			}();
			
			var that = this;
			console.log(that.model);

			registerInputAutoComplete('form-address');

			// also register a keyup function that, after a brief delay, will
			// geocode the address contained in the text field. 
			$('#form-address').keyup(function() {
				delay(function() {
					// get address field and geocode it, then display a map
					// with the house location marked. 
					var addr = $('#form-address').val();
					console.log("looking up lat long of address '" + addr + "'");
					that.model.set({address: addr}); 
					that.model.geocodeAddr();
				}, 3000 );
			});

			return this;
		},

		locationMap: function() {
			console.log("in locationMap().");

			// set up the map with the tile layer and a layer to put markers
			// in. 
			$("#house-map").html("");
			var map = new OpenLayers.Map({div: "house-map"});
			var panel = new OpenLayers.Control.Panel();
			panel.addControls(getCustomControls());
			map.addLayer(new OpenLayers.Layer.OSM());
			var markerLayer = new OpenLayers.Layer.Markers( "Markers" );
			map.addLayer(markerLayer);

			var latLong = this.model.get("latLong");
			// returns location string as array
			loc = locationParse(latLong);
			var lonlat = new OpenLayers.LonLat(loc[0], loc[1]).transform(
				new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
				new OpenLayers.Projection("EPSG:900913")
			);

			markerLayer.addMarker(new OpenLayers.Marker(lonlat, geoIcon()))

			map.updateCenter = function(loc, zoom) {
				var fromProjection = new OpenLayers.Projection("EPSG:4326");   // Transform from WGS 1984
				var toProjection = new OpenLayers.Projection("EPSG:900913"); // to Spherical Mercator Projection
				// center the map somewhere in the middle of the world
				var mapCenter = new OpenLayers.LonLat(loc[0], loc[1]).transform( fromProjection, toProjection);
				// forces the tiles of the map to render. 
				this.setCenter(mapCenter, zoom);
			}

			var zoom = 15;
			map.updateCenter(loc, zoom);
		},

		formSubmit: function(e) {
			console.log("in formSubmit");
			houseAttr = this.houseFromForm(e);
			console.log(houseAttr);
			//this.model.set(houseAttr);
			// save triggers 'sync' which in turn triggers the 'add' event on
			// the model.
			this.model.save(houseAttr, {success: function(model, response) {
				console.log("sync succeeded, redirecting to house profile.");
				console.log(model);
				path = "/house/"+ model.id;
				console.log(path);
				app.navigate(path, {trigger:true});
			}, error: function(model, response) {
				console.log("error in saving object: " + response);
			}, wait:true}); 
			e.preventDefault();
		},

		houseFromForm: function(e) {
			houseAttr = {}
			// retrieve the form fields and populate a new House model with the info. 
			$('form input, form textarea').each(function() {
				if ( $(this).is(":checked") ) {
					houseAttr[$(this).attr("name")] = true;
				} else if ( !$(this).is("input[type=checkbox]") && $(this).val() ) {
					houseAttr[$(this).attr("name")] = $(this).val();
				}
			});
			return houseAttr;
		}
	});

	// populated when the first fetch takes place. 
	all_houses = [];

	window.AppView = Backbone.View.extend({
		events: {'click #add-house': 'newHouseForm',
			'click #submit-location-search': 'formSearch',
			'click .house-link': 'displayHouse'
		},
	
		initialize: function(options) {
			_.bindAll(this, 'render', 'newHouseForm', 'renderMap');
		},

		render: function() {
			var tmpl_str = $("#search-banner-template").html() + $("#map-template").html();
			var tmpl = _.template(tmpl_str);
			console.log("active search string: " + activeSearch.search_string);
			console.log("active search radius: " + activeSearch.radius);
			$(this.el).html(tmpl({houses: this.collection.toJSON(), 
				search_string: activeSearch.search_string, 
				radius: activeSearch.radius
			}));
			registerInputAutoComplete('input-location-search');
			this.renderMap();
		},

		renderList: function(search_results) {
			this.render();
			var tmpl_str = $("#listings-template").html();
			var tmpl = _.template(tmpl_str);
			$(this.el).append(tmpl({houses: search_results.toJSON()}));
			console.log("loading data tables plugin");
			$('#house-listing-table').dataTable();
			$('tr.row-link').hover( function() {
				$(this).toggleClass('hover');
			});
			registerInputAutoComplete('input-location-search');
			return this;
		},

		urlSearch: function(search_str_clean) {
			console.log("in urlSearch");
			var search_loc = search_str_clean.replace(/\+/g, " ");
			var radius = activeSearch.radius;
			console.log("radius in urlSearch: " + radius);
			this.doSearch(search_loc, radius);
		},

		formSearch: function(e) {
			// pull out the value of the input field, and do a text search on
			// the database model's address field. 
			console.log("in formSearch");
			e.preventDefault();
			search_loc = $('#input-location-search').val();
			var radius = $('#radius-location-search').val();
			radius = parseInt(radius); // value in km
			activeSearch.radius = radius;
			// generate a path string by converting spaces to plus
			// signs and removing commas
			var search_clean = search_loc.replace(/ /g,"+").replace(/,/g,"");
			var path = "/search/" + search_clean;
			app.navigate(path, {trigger:true});
		},


		doSearch: function(search_loc, radius) {
			console.log("in doSearch");

			// geocode the search location
			that = this;
			var matches = [];
			var geocoder = new google.maps.Geocoder();
			geocoder.geocode({'address': search_loc}, function(results, status) {
				if (status == google.maps.GeocoderStatus.OK) {
					// XXX HERE: debuging radius. 
					var search_gloc = results[0].geometry.location;
					matches = get_loc_matches(search_gloc, radius);
					// populate a collection with the matched items, display
					// them on the map. 
					
					search_results = new Houses(matches);
					console.log(search_results.length + " matches found.");

					// save info about the location and bounds of the active search.
					activeSearch.update(search_gloc, radius, search_loc ); 
					if (search_results.length == 0) {
						$("#search-banner").prepend('<div class="alert" id="search-alert-empty"><a class="close" data-dismiss="alert" href="#">×</a> <strong>Oops!</strong> No results for that search.</div>');
					} else {
						that.renderList(search_results);
					}
				} else {
					console.log("Error: Geocode was not successful: " + status);
				}
			});
			
			get_loc_matches = function(search_gloc, radius) {
				// unbind the reset event or this will prematurely trigger the call to render()
				that.collection.unbind('reset');
				// ensure the collection has all known locations before doing
				// the search (use the local cache of known locations...)
				that.collection.reset(all_houses);
				console.log("get_loc_matches: iterating over " + that.collection.length + "items");
				that.collection.forEach(function(l) {
					// encode string and create a GLatLng object 
					// compute the distance between this location and the search location
					var this_loc = locationParse(l.get("latLong")); 
					var this_gloc = new google.maps.LatLng(this_loc[1], this_loc[0]);
					var dist = google.maps.geometry.spherical.computeDistanceBetween(search_gloc, this_gloc);
					if (dist < radius*1000.0) {
						matches.push(l)
					};
				});
				return matches;
			}; 
		},

		displayHouse: function(e) {
			console.log("in displayHouse");
			var path = $(e.target).parent().find("a").attr("href");
			console.log(path);
			app.navigate(path, {trigger:true});
			e.preventDefault();
			return false;
		},

		newHouseForm: function(e) {
			app.navigate("/new", {trigger:true});
			e.preventDefault();
		},

		renderMap: function() {
			console.log("in renderMap(). processing " + this.collection.length + " items.");

			//var map = new OpenLayers.Map({div: "mainmap", controls: getCustomControls()});
			var map = new OpenLayers.Map({div:"mainmap"});

			var fromProjection = new OpenLayers.Projection("EPSG:4326");   // Transform from WGS 1984
			var toProjection = new OpenLayers.Projection("EPSG:900913"); // to Spherical Mercator Projection
			
			map.updateCenter = function(locStr, zoom) {
				loc = locationParse(locStr)
				var mapCenter = new OpenLayers.LonLat(loc[0], loc[1]).transform( fromProjection, toProjection);
				// forces the tiles of the map to render. 
				this.setCenter(mapCenter, zoom);
			}
			

			// if there's an active search, restrict the bounds of the map to
			// the search area. else show the whole world.
			if (activeSearch.bounds != null) {
				console.log("processing bounds of active search");
				var extent = activeSearch.getBounds().transform(fromProjection, toProjection);
				map.addLayer(new OpenLayers.Layer.OSM({
					'maxExtent': extent,
					'maxResolution': "auto"
				}));
				map.zoomToExtent(extent);

			} else {
				console.log("no active search");
				map.addLayer(new OpenLayers.Layer.OSM({
					'maxResolution': "auto"
				}));
				var zoom = 2;
				// manually set location
				//map.updateCenter("33.137551, -163.476563", zoom);
				map.updateCenter("41.137551, -77.476563", zoom);
			}

			var markerLayer = new OpenLayers.Layer.Markers( "Markers" );
			map.addLayer(markerLayer);

			that = this;
			this.collection.forEach(function(house) {
				var ll = house.get("latLong");
				loc = locationParse(ll);
				var lonlat = new OpenLayers.LonLat(loc[0], loc[1]).transform(
					new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
					new OpenLayers.Projection("EPSG:900913")
				);
				var marker = new OpenLayers.Marker(lonlat, geoIcon());
				var popup = new OpenLayers.Popup.FramedCloud("house-popup", 
					marker.lonlat,
					new OpenLayers.Size(200, 200),
					house.htmlSummary(),
					null, true
				);
				popup.maxSize = new OpenLayers.Size(200,300);
				//popup.overflow: true;

				marker.events.register("click", marker, function(e) { 
					if (this.popup == null) {
						this.popup = popup;
						map.addPopup(this.popup);
						this.popup.show();
						// prevent the default behaviour on new links
						$("a.house-link").click(function(e) {
							e.preventDefault();
							app.navigate("/house/"+ house.id, {trigger:true});
						});
					} else {
						this.popup.toggle();
					}
				});
				markerLayer.addMarker(marker);
			});
		},
	});

	/////////////////////// ROUTER ////////////////////////
	
	var AppRouter = Backbone.Router.extend({
		// remember you can't visit urls directly unless you have the server
		// resonding to a request at this url. 

		routes: {
			"": "home",
			"new": "newHouse",
			"search/:search_str": "search",
			"house/:houseid": "showHouse"
		},

		initialize: function() {
		},
		
		// view for searching and displaying filtered lists of houses. 
		home: function() {
			var appview = new AppView({el:$("#content"), collection: houses});
			appview.collection.on('reset', appview.render);
			appview.collection.fetch({success: function(collection, response) {
				// save the list of all houses so it can be re-used for
				// searches
				all_houses = collection.toJSON();
			}});
		},

		search: function(search_str) {
			var appview = new AppView({el:$("#content"), collection: houses});
			appview.collection.on('reset', appview.urlSearch(search_str));
			appview.collection.fetch({success: function(collection, response) {
				// save the list of all houses so it can be re-used for
				// searches
				all_houses = collection.toJSON();
			}});
			
		},

		// view for creating and submitting (and eventually editing) a new
		// house
		newHouse: function() {
			house = new House();
			houseform = new NewHouseView({el: $("#content"), model: house});
			houseform.render();
		},

		// detail view for a specific house
		showHouse: function(houseid) {
			console.log("retreiving view for house id = " + houseid);
			var h = new House({id:houseid});
			h.fetch({success: function(model, resp){
				console.log(model);
				houseview = new HouseView({ el: $("#content"), model: model });
				houseview.render();
			}});
		}

	});

	app = new AppRouter();
	Backbone.history.start({pushState:true});

})

// TODO list
// + houses list should persist after return to home view
// + persistent storage
// + map not showing initial houses on load (delay map loading till fetch completes?)
// + click on and view individual houses. push state for individual house ids
// + use data tables to display and search house listings
// + main app view render() is called twice each time
// + fwd and back buttons still wonky.
// + calling urls directly is a problem because houses collection is not yet populated. 
// + new house submission event trigger now broken (event not being triggered properly)
// + newly added house is missing ID field when url is generated. 
// + fields with spaces are being b0rked (cf. name field)
// + decide what to show on map if we render the /new page directly. 
// + change modernomad house model 
// + - add slug 
// + - rename summary to description
// + - review suggestions from embassy peeps
// homeview: 
// + - call to action ("Find Communities!") on RHS. 
// + - primary search on location. 
// + - ui autocomplete hooked up to api search (http://docs.jquery.com/UI/Autocomplete)
// + - map should update to reflect houses displayed in list. 
// + new house submit should redirect to house view page
// + home view - show location on map only. 
// + search bar should execute on enter
// + custom icon for map marker 
// + map bounds should match location and radius of search
// + "locations" collection should actually be a collection of summary-house objects.
// + popups for map markers
// + e.preventDefault() on link in map popup, and on "new" link 
// + backbone form should include new fields (slug and mission?)
// + push state for searches 
// + - hitting back button from individual house view should show listings again
// + location and radius not persisting
// + search results being overwritten by duplicate call to render()
// + in processing search results, empty search results should display a notice
// + and (obviously) not execute the fetch. 
// + individual house listing

// house model changes: 
//	text vs char field?
//	events description field. 
// htmlSummary() should always include url to house listing
// map marker popup should not include description or url. 
// address obfuscation option
// search results map bounds are slightly off
// fix modernomad documentation about PIL install, remove mailman dep.  
// pull out local settings for coliving.org
// use noun project icons for "has event space" "has short term rooms" etc. 
// image uploads! / url
// oath authentication to google? and house edit. 

// house url should use slug 
// clean up extra font and image includes. 
// font selection: http://www.google.com/webfonts#UsePlace:use/Collection:Average|Port+Lligat+Sans|Balthazar|Pontano+Sans|Belleza|Fanwood+Text|Marmelad|Advent+Pro|Megrim|Goudy+Bookletter+1911|Ruda
// front-page filters for short-term accommodations, events, sharing. 
// handle pagination properly (currently just upping the limit for a single call). 
// common base view for new and existing houses with locationMap function code shared. 
// embed twitter, flickr, other social media streams?
// map zoom in/out should trigger a new search?
// site credits: http://thenounproject.com/noun/map-marker/#icon-No2847
// massive radius b0rks the search results map (validate radius before submission)
// form validation - required fields, url, email. 
// bootstrap properly from server - first page of listings (depends what we want homepage to be)
// include error callbacks where appropriate (to match success callbacks)

// house edit - use django auth
// popup toggle breaks after you zoom in (? sometimes? overlapping markers?)
// order listings by date added? (options: most recent, nearby, within xx km of yy)
// open layers form control - make less fugly
// advanced options: other fields, radius.
// recapcha for new house submission
// email reports
// + address field search-ahead?
