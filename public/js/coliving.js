$(function() {

	//
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
	
	window.ListingView = Backbone.View.extend({
		initialize: function() {
			this.template = _.template($("#listing-template").html());
		},

		render: function() {
			console.log("rendering house listing");
			$(this.el).html(this.template(this.model.toJSON()));
			return this;
		}

	});

	window.NewHouse = Backbone.View.extend({
		events: {'click #form-submit': 'formSubmit'},
	
		initialize: function() {
			this.houses = new Houses();
			//this.houses.fetch();

			this.template = _.template($("#signup-template").html());
			_.bindAll(this, 'render', 'addHouse');
			this.houses.bind('add', this.addHouse);
		},

		render: function() {
			console.log("rendering signup form");
			$(this.el).html(this.template({}));
			return this;
		},

		renderMap: function() {
			console.log("in renderMap()");
			map = new OpenLayers.Map("mainmap");
			map.addLayer(new OpenLayers.Layer.OSM());
			var zoom=16;
			
			var markers = new OpenLayers.Layer.Markers( "Markers" );
			map.addLayer(markers);


			var locations = this.houses.pluck("latLong");
			console.log(locations);
			locations.forEach(function(ll) {
				ll = ll.split(",");
				latitude = parseFloat(ll[0]);
				longitude = parseFloat(ll[1]);
				markers.addMarker(new OpenLayers.Marker(
					new OpenLayers.LonLat(latitude, longitude)
				));
			});
		},

		formSubmit: function(e) {
			console.log("in formSubmit");
			h = new House();
			newhouse = {}
			// retrieve the form fields and populate a new House model with the info. 
			$('form input, form textarea').each(function() {
				if ( $(this).is(":checked") ) {
					newhouse[$(this).attr("name")] = true;
				} else if ( !$(this).is("input[type=checkbox]") && $(this).val() ) {
					newhouse[$(this).attr("name")] = $(this).val();
				}
			});
			console.log(newhouse);
			
			// save a new model to the collection, which will also trigger the
			// 'add' event on the collection and the model. 
			houseModel = this.houses.create(newhouse);
			// geocode the address
			// TODO this should probably be set up as an event that
			// automatically triggers on creation.
			houseModel.geocodeAddr();
			console.log("lat and long (might not have returned yet):");
			console.log(houseModel.get("latLong"));
			e.preventDefault();
		},

		addHouse: function(house) {
			// reload the map with the new house and display the house listing
			// below the map
			var listing = new ListingView({model:house});
			$("#content").html(listing.render().el);
			this.renderMap();
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
