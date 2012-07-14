#!/usr/bin/env ruby

require 'rubygems'
require 'sinatra'
require 'json'

# any request that doesn't start with '/api should return index.html
get /.*/ do
	content_type 'text/html'
	File.new('public/index.html').readlines
end

