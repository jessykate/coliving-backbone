$(function() {

	// boostrap a list of existing houses. 
	// TODO (jessykate) retrieve real list from server
	/*
	bootstrapHouses = [
		{address: "21677 rainbow drive, cupertino, ca, 95014", bedrooms: 8, name:"Rainbow Mansion", 
			contact: "zwexlerberon@gmail.com", website: "http://rainbowmansion.com", latLong: "37.300079,-122.05498899999998",
			accommodations:true, events: true, description: "a warm and welcoming community in the south bay full of passionate and driven community builders."}, 
		{address: "775 14th Street, san francisco, ca, 94114", bedrooms: 13, name:"The Elements", 
			contact: "corwinh@gmail.com", latLong: "37.7675567,-122.4305766"}
	];

	// fake the saving while we don't have a persistence layer. 
	//Backbone.sync = function(method, model, options) {
	//	return 0;
	//};
	*/

	/////////////////////// UTIL ////////////////////////
	locationParse = function(locString) {
		// returns a list [longitude, latitude] (in that order!)
		ll = locString.split(",");
		latitude = parseFloat(ll[0]);
		longitude = parseFloat(ll[1]);
		loc = [longitude, latitude];
		return loc;
	};

	/////////////////////// MODELS ////////////////////////

	window.House = Backbone.Model.extend({
		initialize: function() { },
		url: function() { 
			if (this.isNew()) {
				return "http://localhost:8080/api/v1/houses/?format=json";
			} else {
				return "http://localhost:8080/api/v1/houses/" + this.id + "?format=json";
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
		// XXX (jks) careful with pagination and limits once list gets long
		url: "http://localhost:8080/api/v1/houses/?format=json",
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

	// houses needs to be declared before the objects below refer to it, since
	// javascript is evaluated immediately. 
	// XXX (jessykate) why does this not work when using "this"?
	window.houses = new Houses();

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
			this.model.on('sync', this.returnHome, true);
			this.template = _.template($("#signup-template").html());
			_.bindAll(this, 'render', 'formSubmit', 'locationMap');
		},

		render: function() {
			console.log("rendering new house form");
			$(this.el).html(this.template());
			
			var delay = function(callback, ms) {
				var timer = 0;
				return function(callback,ms) {
					clearTimeout(timer);
					timer = setTimeout(callback,ms);
				};
			}();
			
			var that = this;
			console.log(that.model);
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
			markerLayer.addMarker(new OpenLayers.Marker(lonlat));

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
			/* saving the verified model triggers the 'add' event on the model,
			 * which in turn calls app.navigate.  otherwise the create() call
			 * might not be done by the time navigate is called.  
			 */
			this.model.set(houseAttr);
			this.model.save(); 
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
		},

		returnHome: function() {
			console.log("sync event triggered, returning to Home View");
			app.navigate("/", {trigger:true});
		}

	});

	window.AppView = Backbone.View.extend({
		events: {'click #add-house': 'newHouseForm',
			'click .row-link': 'displayHouse'
		},
	
		initialize: function(options) {
			this.collection = houses;
			houses.on('reset', this.render, this);
			this.template = _.template($("#listings-template").html());
			_.bindAll(this, 'render', 'newHouseForm', 'renderMap');

		},

		render: function() {
			$(this.el).html(this.template({houses: this.collection.toJSON()}));
			console.log("loading data tables plugin");
			$('#house-listing-table').dataTable();
			$('tr.row-link').hover( function() {
				$(this).toggleClass('hover');
			});
			this.renderMap();
			return this;
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
				markerLayer.addMarker(new OpenLayers.Marker(lonlat));
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
			// TODO bootstrap properly
			// fetch() triggers the reset event, which renders the view. 
			var appview = new AppView({el:$("#content"), collection: houses});
			houses.fetch();
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
// newly added house is missing ID field when url is generated. 
// fields with spaces are being b0rked (cf. name field)
// change modernomad house model to add slug and rename summary to description
// decide what to show on map if we render the /new page directly. 
// house url should use url (vanity url?)
// homeview: should be a call to action ("search!") while loading houses in
//  the background. filtering the list using datatables should also filter the
//  list of houses displayed on the map. 
// include map for individual houses
// map marker - different color for the location most recently submitted.
// map markers should have basic house info and link
// form validation - required fields, url, email, 
// bootstrap properly from server - first page of listings
// include error callbacks where appropriate (to match success callbacks)
// house edit - use django auth
// order listings by date added? (options: most recent, nearby, within xx km of yy)
// open layers form control - make less fugly
// recapcha for new house submission
// email reports
// address field search-ahead?
