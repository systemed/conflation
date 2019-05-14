### OpenStreetMap Live Conflation

OSM Live Conflation provides a visual interface for manually merging third-party datasets into OpenStreetMap.

Your third-party data is encoded into vector tiles (Mapbox MVT format). The UI enables mappers to select items from the vector tiles and either transfer their attributes to existing OSM objects, or create new objects. By calling the OSM API to find nearby features and then matching based on proximity and tag similarity, the most likely candidates are presented first. Once the mapper has merged their chosen features, the resulting changes can be uploaded direct to the OSM API.

### Requirements

The server is written in Ruby. The sqlite gem is required (to serve vector tiles in .mbtiles format), and either rack (for a local webserver) or Phusion Passenger (for deployment). If deploying with Phusion Passenger, use the supplied config.ru and point your Apache root to /srv/yoursitename/static .

Vector tiles are prepared using [tilemaker](https://github.com/systemed/tilemaker). You are recommended to build the latest version from source.

### Getting up and running

Make sure your input data is in shapefile format, EPSG 4326 projection (simple WGS84 lat/long). You can convert most vector formats to shapefile using ogr2ogr, for example:

	ogr2ogr -f "ESRI Shapefile" -t_srs "EPSG:4326" shp OOCIE_Extract_20190214.gdb.zip

Then create vector tiles from the data using tilemaker. To do this you'll need to write two config files, examples of which are provided.

* config.json lists the shapefiles that you want to read; what zoom levels each should show up at; and the bounding box for your project.
* process.lua is a Lua script that reads the shapefile attributes and converts them to OSM tags. This is where you put your tag remapping logic. `attribute_function` is called with a table (hash) of shapefile attributes and must return a table (hash) of OSM tags.

Make sure you're in the directory containing these two files, then simply

    tilemaker --output vector_tiles.mbtiles
	
The result is an .mbtiles file containing vector tiles with all your data. (An example is provided: delete this before creating your own.)

You can now spin up the server. To run it locally:

    ruby server.rb vector_tiles.mbtiles
	
Then open the site at http://localhost:8080/index.html .

### Using OSM Live Conflation

![Screen layout](https://www.systemed.net/osm/conflation_screenshot.jpg "OSM Live Conflation")

Your source data is on the left, OSM on the right.

The points and lines from your source data are overlaid on a satellite map. Clicking on any of these will identify OSM candidates to be modified, or a new geometry to be created. Use the 'Next >' button to page through the candidates. Each candidate is highlighted on the OSM map (top right) as you do so.

Once you've chosen one, you can use the checkboxes to deselect any tags you don't want to be applied. Click 'Accept' to make the change. The source feature is temporarily removed from the left-hand map when you do so. (If you don't want to remove it - for example, if a source feature maps to more than one OSM feature - then click 'Accept and keep open').

To upload your changes, enter your OSM username and password into the input fields; click 'Upload'; and enter a changeset comment.

Keyboard shortcuts are available: 1-9 to toggle tags, Space to cycle through candidates, Enter to accept, Delete to ignore.

### Using vector tiles in iD

You can also load your vector tiles directly into iD, OpenStreetMap's default online editor.

In iD, click the 'Map data' icon on the right, then '...' by 'Custom Map Data'. In the dialogue that appears, enter a URL like https://url.of.your.server/{z}/{x}/{y}.pbf .

### Advanced tag remapping

When rewriting tags into vector tiles, you can add special keys/values. Currently the following are supported:

* You should always add an "id" key with a value unique to that feature. (Since a feature may cross vector tile boundaries, this enables features to be consistently removed from the source map display.)
* The key "_match_key" indicates that candidates must have a tag with that key (e.g. _match_key=highway)
* A key "_filter", with value "waynode:highway", indicates that candidates must be nodes within a highway way
* Any other key beginning with "_" will be ignored (useful for comments)

### About this project

Work on this project was supported by the Open Data Institute via Oxfordshire County Council: https://theodi.org/article/the-projects-were-funding-to-explore-open-geospatial-data-in-local-government/

See https://github.com/systemed/conflation/issues/1 for a to-do list of identified enhancements.

Map rendering is via [Mapbox GL](https://github.com/mapbox/mapbox-gl-js) and [Leaflet](https://leafletjs.com).

MIT licence, (c) Richard Fairhurst 2019.
