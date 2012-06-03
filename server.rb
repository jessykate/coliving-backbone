#!/usr/bin/env ruby

require 'rubygems'
require 'sinatra'
require 'mongo'
require 'json'

DB = Mongo::Connection.new.db("coliving") 

# any request that doesn't start with '/api should return index.html
get /^(?!\/(api))/ do
	content_type 'text/html'
	File.new('public/index.html').readlines
end

# get a list of all houses. 
get '/api/houses.json' do
	content_type :json
	resp = []
	DB.collection('houses').find({}).each do |row| 
		# map the id to a string representation of the object's id 
		resp << from_bson_id(row)
	end
	# output to JSON
	puts resp.to_json
	resp = resp.to_json
end

# post (create) a new fog by inserting its metadata into the meta collection.
# each fog will also be its own collection, but the collection can be created ,
# lazily as needed. the document (post object) is passed in the request data
# (not the url). used for new posts and creating a new fog by submitting
# metadata. 
post %r{/api/houses/?} do
	payload = request.body.read.to_s
	puts payload
	oid = DB.collection('houses').insert(JSON.parse(payload)) 
	# return the object (document) id as a string
	# either return the id as _id and use the idAttribute mapping in the model,
	# OR return it as "id" here. 
	"{\"_id\": \"#{oid.to_s}\"}" 
end

delete %r{api/houses/?} do
end

# retrieve info about a single house
get %r{/api/houses/(.*)/?} do
	content_type :json
	houseid = params[:captures].first
	puts "retrieving house id #{houseid}"
	oid = to_bson_id(houseid)
	res = DB.collection('houses').find("_id" => oid).to_a
	# res[0] assumes only one matching response
	resp = from_bson_id(res[0]).to_json
	puts resp
	return resp
end

# utilities for generating/converting MongoDB ObjectIds
def to_bson_id(id) BSON::ObjectId.from_string(id) end
def from_bson_id(obj) obj.merge({'_id' => obj['_id'].to_s}) end

