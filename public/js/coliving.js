$(function() {

	/////////////////////// SETTINGS ////////////////////////
	API_BASE = "http://localhost:8080/api/v1/";
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
		console.log(MEDIA_BASE + 'img/noun_project_2847.png');
		var icon = new OpenLayers.Icon(MEDIA_BASE +'img/noun_project_2847.svg',size,offset);
		icon.setOpacity(0.6);
		return icon;
	};

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
		}
	});

	window.Houses = Backbone.Collection.extend({
		model: House,
		initialize: function(models, options) {
			if (options && options.subset != "undefined") {
				this.subset = true;
			}
		},
		// XXX (jks) careful with pagination and limits once list gets long
		url: function() {
			if (this.subset == true) {
				ids = this.pluck("id");
				ids_str = ids.join(";");
				return API_BASE + "houses/set/" + ids_str +"/?format=json"
			} else {
				return API_BASE + "houses/?format=json";
			}
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

	window.Location = Backbone.Model.extend({});

	window.Locations = Backbone.Collection.extend({
		model: Location,
		url: "http://localhost:8080/api/v1/locations/?format=json",
		parse: function(response) {
			return response.objects;
		}
	});

	/////////////////////// VIEWS ////////////////////////

	window.locations = new Locations();

	window.HouseView = Backbone.View.extend({
		initialize: function() {
			this.template = _.template($("#house-template").html());
		},

		render: function() {
			console.log("rendering individual house view");
			console.log(this.model.toJSON());
			$(this.el).html(this.template( {house: this.model.toJSON()} ));
			return this;
		}

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
			var map = new OpenLayers.Map("house-map");
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

		/*
		displayHouse: function() {
			console.log("sync event triggered, redirecting to house profile.");
			console.log(this.model);
			path = "/house/"+ this.model.id
			app.navigate(path, {trigger:true});
		}*/

	});

	window.AppView = Backbone.View.extend({
		events: {'click #add-house': 'newHouseForm',
			'click #submit-location-search': 'doSearch',
			'click .row-link': 'displayHouse'
		},
	
		initialize: function(options) {
			// set fetch() to trigger the reset event and render the view. 
			this.collection.on('reset', this.render, this);
			this.collection.fetch();
			_.bindAll(this, 'render', 'newHouseForm', 'renderMap');
		},

		render: function() {
			var tmpl_str = $("#search-banner-template").html() + $("#map-template").html()
			var tmpl = _.template(tmpl_str);
			$(this.el).html(tmpl({houses: this.collection.toJSON()}));
			registerInputAutoComplete('input-location-search');
			this.renderMap();

		},

		renderList: function() {
			this.render();
			var tmpl_str = $("#listings-template").html();
			var tmpl = _.template(tmpl_str);
			$(this.el).append(tmpl({houses: this.collection.toJSON()}));
			console.log("loading data tables plugin");
			$('#house-listing-table').dataTable();
			$('tr.row-link').hover( function() {
				$(this).toggleClass('hover');
			});
			registerInputAutoComplete('input-location-search');
			return this;
		},

		doSearch: function(e) {
			console.log("in doSearch");
			// pull out the value of the input field, and do a text search on
			// the database model's address field. 
			this.search_loc = $('#input-location-search').val();
			var radius = $('#radius-location-search').val();
			this.radius = parseInt(radius)*1000; // distance calculation returns value in meters. 
			
			// geocode the search location
			that = this;
			var matches = [];
			var geocoder = new google.maps.Geocoder();
			geocoder.geocode({'address': this.search_loc}, function(results, status) {
				if (status == google.maps.GeocoderStatus.OK) {
					console.log("geocoding results for search location:");
					matches = get_loc_matches(results[0].geometry.location);
					console.log("matches were:");
					console.log(matches);
					//populate a collection with the matched items, display them on the map. 
					// get the list of ids
					// make a list of houses with those ids
					that.collection = new Houses(matches, {subset: true});
					var ids = that.collection.pluck("id");
					console.log("ids matched were: " + ids);
					// fetch will actually reset the collection. since subset
					// was set to 'true', only models with the existing ids
					// will be fetched. reset event will be triggered. 
					that.collection.fetch({success: function() {
						that.renderList();
					}});
				} else {
					console.log("Error: Geocode was not successful: " + status);
				}
			});
			
			get_loc_matches = function(search_gloc) {
				console.log("get_loc_matches: iterating over " + that.collection.length + "items");
				that.collection.forEach(function(l) {
					// encode string and create a GLatLng object 
					// compute the distance between this location and the search location
					var this_loc = locationParse(l.get("latLong")); 
					var this_gloc = new google.maps.LatLng(this_loc[1], this_loc[0]);
					var dist = google.maps.geometry.spherical.computeDistanceBetween(search_gloc, this_gloc);
					console.log(dist);
					if (dist < that.radius) {
						matches.push(l)
					};
				});
				console.log("matches were:");
				console.log(matches);
				return matches;
			}; 

			e.preventDefault();
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

			// set up the map with the tile layer and a layer to put markers
			// in. 
			var map = new OpenLayers.Map("mainmap");
			//map.addControl(new OpenLayers.Control.MouseToolbar());
			map.addLayer(new OpenLayers.Layer.OSM());
			var markerLayer = new OpenLayers.Layer.Markers( "Markers" );
			map.addLayer(markerLayer);

			var locations = this.collection.pluck("latLong");
			locations.forEach(function(ll) {
				loc = locationParse(ll);
				var lonlat = new OpenLayers.LonLat(loc[0], loc[1]).transform(
					new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
					new OpenLayers.Projection("EPSG:900913")
				);
				
				markerLayer.addMarker(new OpenLayers.Marker(lonlat, geoIcon()));
			});

			map.updateCenter = function(locStr, zoom, that) {
				var fromProjection = new OpenLayers.Projection("EPSG:4326");   // Transform from WGS 1984
				var toProjection = new OpenLayers.Projection("EPSG:900913"); // to Spherical Mercator Projection
				// center the map somewhere in the middle of the world
				loc = locationParse(locStr)
				var mapCenter = new OpenLayers.LonLat(loc[0], loc[1]).transform( fromProjection, toProjection);
				// forces the tiles of the map to render. 
				this.setCenter(mapCenter, zoom);
			}

			var zoom = 2;
			map.updateCenter("33.137551, -163.476563", zoom, this);
		},

	});

	/////////////////////// ROUTER ////////////////////////
	
	var AppRouter = Backbone.Router.extend({
		// remember you can't visit urls directly unless you have the server
		// resonding to a request at this url. 

		routes: {
			"": "home",
			"new": "newHouse",
			"house/:houseid": "showHouse"
		},

		initialize: function() {
		},
		
		// view for searching and displaying filtered lists of houses. 
		home: function() {
			var appview = new AppView({el:$("#content"), collection: locations});
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

// do we want to support 'back' button for searches? (probably... blargh)
// map bounds should match location and radius of search
// "locations" collection should actually be a collection of summary-house objects.
// custom icon for map marker 
// popups for map markers
// backbone form should include new fields (slug and mission?)
// house url should use slug 
// advanced options: other fields, radius.
// site credits: http://thenounproject.com/noun/map-marker/#icon-No2847
// individual house listing
// - show map (make this entirely contained in a popup/side div?)
// - map in bg with overlapping info div?
// - style
// map 
// - different color for the location most recently submitted.
// - framed popups with house info
// - custom icon 
// form validation - required fields, url, email, 
// bootstrap properly from server - first page of listings (depends what we want homepage to be)
// include error callbacks where appropriate (to match success callbacks)
// house edit - use django auth
// order listings by date added? (options: most recent, nearby, within xx km of yy)
// open layers form control - make less fugly
// recapcha for new house submission
// email reports
// + address field search-ahead?
