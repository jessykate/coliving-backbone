$(function() {

	// boostrap a list of existing houses. 
	// TODO (jessykate) retrieve real list from server
	bootstrapHouses = [
		{address: "21677 rainbow drive, cupertino, ca, 95014", bedrooms: 8, name:"Rainbow Mansion", 
			contact: "zwexlerberon@gmail.com", website: "http://rainbowmansion.com", latLong: "37.300079,-122.05498899999998",
			accommodations:true, events: true, description: "a warm and welcoming community in the south bay full of passionate and driven community builders."}, 
		{address: "775 14th Street, san francisco, ca, 94114", bedrooms: 13, name:"The Elements", 
			contact: "corwinh@gmail.com", latLong: "37.7675567,-122.4305766"}
	];

	// fake the saving while we don't have a persistence layer. 
	Backbone.sync = function(method, model, options) {
		return 0;
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
		url: "/houses"
	});

	/////////////////////// VIEWS ////////////////////////
	
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

	window.ListingsView = Backbone.View.extend({
		initialize: function() {
			this.template = _.template($("#listings-template").html());
		},

		render: function() {
			console.log("rendering house listings");
			$(this.el).html(this.template({houses: this.collection.toJSON()}));
			return this;
		}

	});

	window.NewHouse = Backbone.View.extend({
		events: {'click #form-submit': 'formSubmit',
				'click #form-confirm': 'confirmSubmit'	
		},
	
		initialize: function() {
			this.houses = new Houses();
			this.houses.reset(bootstrapHouses);

			this.template = _.template($("#signup-template").html());
			_.bindAll(this, 'render', 'preview', 'houseListingPreview', 'confirmSubmit', 'formSubmit', 'renderMap');
			this.houses.bind('add', this.showListings);
			this.renderMap();
		},

		render: function() {
			console.log("rendering signup form");
			$(this.el).html(this.template({}));
			return this;
		},

		locationParse: function(locString) {
			// returns a list [longitude, latitude] (in that order!)
			ll = locString.split(",");
			latitude = parseFloat(ll[0]);
			longitude = parseFloat(ll[1]);
			loc = [longitude, latitude];
			return loc;
		},

		renderMap: function() {
			console.log("in renderMap()");
			map = new OpenLayers.Map("mainmap");
			//map.addLayer(new OpenLayers.Layer.OSM("New Layer", "http://otile1.mqcdn.com/tiles/1.0.0/osm/${z}/${x}/${y}.png"));
			map.addLayer(new OpenLayers.Layer.OSM());
			var markerLayer = new OpenLayers.Layer.Markers( "Markers" );
			map.addLayer(markerLayer);

			var locations = this.houses.pluck("latLong");
			self = this;
			locations.forEach(function(ll) {
				loc = self.locationParse(ll);
				var lonlat = new OpenLayers.LonLat(loc[0], loc[1]).transform(
					new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
					new OpenLayers.Projection("EPSG:900913")
					//map.getProjectionObject() // to Spherical Mercator Projection
				);
				markerLayer.addMarker(new OpenLayers.Marker(lonlat));
			});

			this.map = map;
			this.markerLayer = markerLayer;

			this.map.updateCenter = function(locStr, zoom, that) {
				var fromProjection = new OpenLayers.Projection("EPSG:4326");   // Transform from WGS 1984
				var toProjection = new OpenLayers.Projection("EPSG:900913"); // to Spherical Mercator Projection
				// center the map somewhere in the middle of the world
				loc = that.locationParse(locStr)
				var mapCenter = new OpenLayers.LonLat(loc[0], loc[1]).transform( fromProjection, toProjection);
				// forces the tiles of the map to render. 
				this.setCenter(mapCenter, zoom);
			}

			var zoom = 2;
			this.map.updateCenter("33.137551, -163.476563", zoom, this);
		},

		// update the map as a callback when a model latLong attribute changes.
		updateMap: function(model) {
			loc = this.locationParse(model.get("latLong"));
			var lonlat = new OpenLayers.LonLat(loc[0], loc[1]).transform(
				new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
				new OpenLayers.Projection("EPSG:900913")
				//map.getProjectionObject() // to Spherical Mercator Projection
			);
			this.markerLayer.addMarker(new OpenLayers.Marker(lonlat));

			// re-render the map, slightly zoomed in around the area of the
			// newly added house
			var zoom = 12;
			this.map.updateCenter(model.get("latLong"), zoom, this);
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

		formSubmit: function(e) {
			console.log("in formSubmit");
			houseAttr = this.houseFromForm(e);
			console.log(houseAttr);
			
			// create a model to store the object attributes, 
			// house = this.houses.create(newhouse);
			house = new House(houseAttr);
			house.bind('change:latLong', this.preview, this);
			
			// geocode the address. geocode triggers the preview() method when
			// the latLong attribute has successfully been set on the House
			// model.
			house.geocodeAddr();

			e.preventDefault();
		},

		confirmSubmit: function(e) {
			// save the verified model to the collection, which will trigger
			// the 'add' event on the collection and the model. 
			houseAttr = this.houseFromForm(e);
			console.log("house attributes after confirm.");
			console.log(houseAttr);
			house = this.houses.create(houseAttr);
			e.preventDefault();
		},

		houseListingPreview: function(house) {
			// display the house listing below the map. triggered by the add event on the collection. 
			var pv = new PreviewView({model:house});
			$("#content").html(pv.render().el);
		},

		showListings: function(model, coll) {
			var lv = new ListingsView({collection:coll});
			$("#content").html(lv.render().el);
		}
	});

	/////////////////////// ROUTER ////////////////////////
	
	var AppRouter = Backbone.Router.extend({

		routes: {
			"": "home"
		},

		home: function() {
			newhouse = new NewHouse({el:$("#content")});
			newhouse.render();
		}

	});

	app = new AppRouter();
	Backbone.history.start({pushState:true});

})

// TODO list
// home view should show listings
// click on and view individual links. push state for individual house ids
// persistent storage
// gmaps search-ahead
// bootstrap from server 
// quicksearch? display/filter/search (update map correspondingly)
// different color for the location most recently submitted.
// form validation - required fields, url, email, 
// open layers form control - make less fugly
// map markers should have basic house info and link
