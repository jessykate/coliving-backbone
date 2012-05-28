$(function() {

	/////////////////////// MODELS ////////////////////////

	window.House = Backbone.Model.extend({
	});

	window.Houses = Backbone.Collection.extend({
		model: House
	});

	/////////////////////// VIEWS ////////////////////////
	
	window.Signup = Backbone.View.extend({
		events: {'click #form-submit': 'formSubmit'},
	
		initialize: function() {
			this.template = _.template($("#signup-template").html());
			_.bindAll(this, 'render');
		},

		render: function() {
			console.log("rendering signup form");
			$(this.el).html(this.template({}));
			return this;
		},

		formSubmit: function(e) {
			h = new House();
			// retrieve the form fields and populate a new House model with the info. 
			$('form input, form textarea').each(function(i) {
				//if ( $(this).is(":checked") ) {
				if ( $(this).type( $(this).val() ) {
					console.log($(this).attr("name") + ":" + $(this).val());
				}
			})
			// save the model
			// reload the map with the new house
			e.preventDefault();
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
