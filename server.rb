require 'sqlite3'
begin; require 'glug'	# Optional glug dependency
rescue LoadError; end 	#  |

class ConflationServer
	
	CONTENT_TYPES = {
		json: "application/json",
		png: "image/png",
		pbf: "application/octet-stream",
		css: "text/css",
		js: "application/javascript",
	}

	def initialize(mbtiles)
		@@mbtiles = mbtiles
		ConflationServer.connect
	end

	def self.connect
		@@db = SQLite3::Database.new(@@mbtiles)
		Dir.chdir("static") unless Dir.pwd.include?("static")
		self
	end

	def call(env)
		path = (env['REQUEST_PATH'] || env['REQUEST_URI']).sub(/^\//,'')
		if path.empty? then path='index.html' end
		if path =~ %r!(\d+)/(\d+)/(\d+).*\.pbf!
			# Serve .pbf tile from mbtiles
			z,x,y = $1.to_i, $2.to_i, $3.to_i
			tms_y = 2**z - y - 1
			res = @@db.execute("SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?", [z, x, tms_y])
			if res.length>0
				blob = res[0][0]
				['200', {
					'Content-Type'    => 'application/x-protobuf', 
					'Content-Encoding'=> 'gzip', 
					'Content-Length'  => blob.bytesize.to_s, 
					'Cache-Control'   => 'max-age=0',
					'Access-Control-Allow-Origin' => '*'
				}, [blob]]
			else
				puts "Empty #{z}/#{x}/#{y}"
				['204', {}, ["Resource at #{path} not found"]]
			end

		elsif path=='metadata'
			# Serve mbtiles metadata
			doc = {}
			@@db.execute("SELECT name,value FROM metadata").each do |row|
				k,v = row
				doc[k] = k=='json' ? JSON.parse(v) : v
			end
			['200', {'Content-Type' => 'application/json', 'Cache-Control' => 'max-age=0' }, [doc.to_json]]

		elsif File.exist?(path)
			# Serve static file
			ct = path.match(/\.(\w+)$/) ? (CONTENT_TYPES[$1.to_sym] || 'text/html') : 'text/html'
			['200', {'Content-Type' => ct, 'Cache-Control' => 'max-age=0'}, [File.read(path)]]

		else
			# Not found
			puts "Couldn't find #{path}"
			['404', {'Content-Type' => 'text/html'}, ["Resource at #{path} not found"]]
		end
	end

	# Start server

	if defined?(PhusionPassenger)
		puts "Starting Passenger server"
		PhusionPassenger.on_event(:starting_worker_process) do |forked|
			if forked then ConflationServer.connect end
		end

	else
		puts "Starting local server"
		require 'rack'

		server = ConflationServer.new(ARGV[0])
		app = Proc.new do |env|
			server.call(env)
		end
		Rack::Handler::WEBrick.run(app)
	end
end
