$(function() {

	/////////////////////// MODELS ////////////////////////

	window.House = Backbone.Model.extend({
	});

	window.Houses = Backbone.Collection.extend({
		model: House,
		url: "/houses"
	});

	/////////////////////// VIEWS ////////////////////////
	
	window.Signup = Backbone.View.extend({
		events: {'click #form-submit': 'formSubmit'},
	
		initialize: function() {
			this.houses = new Houses();
			//this.houses.fetch();

			this.template = _.template($("#signup-template").html());
			_.bindAll(this, 'render');
			this.houses.bind('add', this.addOne);
		},

		render: function() {
			console.log("rendering signup form");
			$(this.el).html(this.template({}));
			return this;
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
			//
			// save a new model to the collection, which will also trigger the
			// 'add' event on the collection. 
			this.houses.create(newhouse)
			e.preventDefault();
		},

		addOne: function(house) {
			// reload the map with the new house
			// var houseListing = new HouseListingView(house);
		}
	});

	/////////////////////// ROUTER ////////////////////////
	
	var AppRouter = Backbone.Router.extend({

		routes: {
			"": "home"
		},

		home: function() {
			signup = new Signup({el:$("#content")});
			signup.render();
		}

	});

	app = new AppRouter();
	Backbone.history.start({pushState:true});

})
