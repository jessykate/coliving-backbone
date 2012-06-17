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
		initialize: function() {
			this.geocoder = new google.maps.Geocoder();
		},

		geocodeAddr: function() {
			var self = this;
			this.geocoder.geocode( { 'address': this.get("address")}, function(results, status) {
				if (status == google.maps.GeocoderStatus.OK) {
				latStr = results[0].geometry.location.lat().toString();
				lngStr = results[0].geometry.location.lng().toString();
				self.set({latLong: latStr + "," + lngStr });
				console.log("laLong was set to " + self.get("latLong"));
				} else {
					console.log("Geocode was not successful for the following reason: " + status);
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
	// TODO this us temporary - bootstrap properly! 
	// fetch() triggers the reset event
	houses.fetch()
	

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

	window.PreviewView = Backbone.View.extend({
		initialize: function() {
			this.template = _.template($("#preview-template").html());
		},

		render: function() {
			console.log("rendering house listing preview");
			$(this.el).html(this.template(this.model.toJSON()));
			return this;
		}

	});

	window.NewHouseView = Backbone.View.extend({
		events: {'click #form-submit': 'formSubmit',
				'click #form-confirm': 'confirmSubmit'	
		},

		initialize: function(options) {
			this.collection = houses;
			this.template = _.template($("#signup-template").html());
			_.bindAll(this, 'render', 'preview', 'formSubmit', 'updateMap', 'confirmSubmit');
			this.collection.on('sync', this.returnHome, true);
		},

		render: function() {
			console.log("rendering new house form");
			$(this.el).html(this.template());
			return this;
		},

		returnHome: function() {
			console.log("sync event triggered, returning to Home View");
			app.navigate("/", {trigger:true});
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

		preview: function(model, value, options) {
			// preview() is called as a callback once the latLong attribute has
			// been set. 
			this.houseListingPreview(model);
			this.updateMap(model);
		},

		houseListingPreview: function(house) {
			// display the house listing below the map. triggered by the add
			// event on the collection. 
			var pv = new PreviewView({model:house});
			$("#content").html(pv.render().el);
		},

		formSubmit: function(e) {
			console.log("in formSubmit");
			houseAttr = this.houseFromForm(e);
			console.log(houseAttr);
			
			// create a model to store the object attributes and trigger the
			// geocoding
			house = new House(houseAttr);
			house.bind('change:latLong', this.preview, this);
			
			// geocode the address. geocode triggers the preview() method when
			// the latLong attribute has successfully been set on the House
			// model.
			house.geocodeAddr();
			e.preventDefault();
		},

		// update the map as a callback when a model latLong attribute changes.
		updateMap: function(model) {
			loc = locationParse(model.get("latLong"));
			var lonlat = new OpenLayers.LonLat(loc[0], loc[1]).transform(
				new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
				new OpenLayers.Projection("EPSG:900913")
				//map.getProjectionObject() // to Spherical Mercator Projection
			);
			markerLayer.addMarker(new OpenLayers.Marker(lonlat));

			// re-render the map, slightly zoomed in around the area of the
			// newly added house
			var zoom = 12;
			map.updateCenter(model.get("latLong"), zoom, this);
		},

		confirmSubmit: function(e) {
			/* save the verified model to the collection, which will trigger
			 * the 'add' event on the model. app.navigate is set up to trigger
			 * on the ADD event rather than being called directly here, since
			 * otherwise the create() call might not be done by the time
			 * navigate is called.  
			 */
			houseAttr = this.houseFromForm(e);
			console.log("house attributes after confirm.");
			console.log(houseAttr);
			this.collection.create(houseAttr, {wait: true});
			e.preventDefault();
		}

	});

	window.AppView = Backbone.View.extend({
		events: {'click #add-house': 'newHouseHandler',
			'click .house-link': 'displayHouse',
			'click tr.house-link': 'houseDisplayHandler'
		},
	
		initialize: function(options) {
			this.collection = houses;

			this.template = _.template($("#listings-template").html());
			houses.on('reset', this.render, this);
			_.bindAll(this, 'render', 'newHouseHandler', 'renderMap');
		},

		render: function() {
			this.renderMap();
			$(this.el).html(this.template({houses: this.collection.toJSON()}));
			console.log("loading data tables plugin");
			$('#house-listing-table').dataTable();
			$('tr.row-link').click( function() {
				window.location = $('a', this).attr('href');
			});
			$('tr.row-link').hover( function() {
				$(this).toggleClass('hover');
			});
			return this;
		},

		houseDisplayHandler: function(e) {
			console.log("in houseDisplayHandler");
		},

		displayHouse: function(e) {
			console.log("in displayHouse");
			var path = e.target.getAttribute('href');
			app.navigate(path, {trigger:true});
			e.preventDefault();
			return false;
		},

		newHouseHandler: function(e) {
			app.navigate("/new", {trigger:true});
			e.preventDefault();
		},

		renderMap: function() {
			console.log("in renderMap(). processing " + this.collection.length + " items.");

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

		/*
		showListings: function(model, coll) {
			var lv = new ListingsView({collection:coll});
			$("#content").html(lv.render().el);

		}
		*/
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
		
		home: function() {
			appview = new AppView({el:$("#content"), collection: houses});
			appview.render();
		},

		newHouse: function() {
			houseform = new NewHouseView({el: $("#content"), collection: houses});
			houseform.render();
		},

		showHouse: function(houseid) {
			console.log("retreiving view for house id = " + houseid);
			var h = houses.get(houseid);
			console.log(h);
			houseview = new HouseView({ el: $("#content"), model: h });
			houseview.render();
		}

	});

	// make the houses collection and map available to all routes and views
	window.map = new OpenLayers.Map("mainmap");
	map.addLayer(new OpenLayers.Layer.OSM());
	window.markerLayer = new OpenLayers.Layer.Markers( "Markers" );
	map.addLayer(markerLayer);

	app = new AppRouter();
	Backbone.history.start({pushState:true});

})

// TODO list
// + houses list should persist after return to home view
// + persistent storage
// fields with spaces are being b0rked (cf. name field)
// map not showing initial houses on load (delay map loading till fetch completes?)
// house edit - use django auth
// main app view render() is called twice each time
// click on and view individual houses. push state for individual house ids
// calling urls directly is a problem because houses collection is not yet populated. 
// different color for the location most recently submitted.
// map markers should have basic house info and link
// recapcha
// gmaps search-ahead
// bootstrap from server 
// use data tables to display and search house listings
// form validation - required fields, url, email, 
// open layers form control - make less fugly
