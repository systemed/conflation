# Run locally with rackup -p 8080

puts "Loading conflation server"
require './server'

use Rack::Static,
	urls: ["/conflation-browser.js", "/index.html", "/osmgraph.js", "/spec.json", "/mbgl", "/leaflet"],
	root: "static",
	header_rules: [[/.json\z/, { "Content-Type"=>"application/json" }],
				   [/.png\z/,  { "Content-Type"=>"image/png" }],
				   [/.pbf\z/,  { "Content-Type"=>"application/octet-stream" }]]
use Rack::Reloader, 0
use Rack::ShowExceptions

run ConflationServer.new("vector_tiles.mbtiles")
