
	// Globals
	
	var glMap, style={}, graph, popup, proposedEdits, displayedEdit, leafletMap, leafletFeature, leafletCandidate, selectedFeature, changesetID;
	var TOP_LEVEL = ["aeroway","amenity","barrier","boundary","building","emergency","entrance","highway","historic","landuse",
		"leisure", "man_made", "natural", "office", "place", "power", "public_transport", "railway", "route", "shop", "traffic_sign",
		"tourism", "waterway"];

	// Begin by fetching metadata

	function fetchMetadata() {
		fetch("/metadata")
			.then(function(resp) { return resp.json(); })
			.then(initialiseMap)
			.catch(mapError);
	}

	// Initialise map
	
	function initialiseMap(metadata) {
		graph = new OSMGraph("https://www.openstreetmap.org");
//		graph = new OSMGraph("https://master.apis.dev.openstreetmap.org"); // for testing
		var bbox = metadata.bounds.split(',').map(x=>Number(x));

		// Auto-generate style
		// for ESRI Clarity background: https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
		// for OSM background: or http://tile.openstreetmap.org/{z}/{x}/{y}.png
		style = {
			"version": 8,
			"name": "conflation default",
			"sources": {
				"raster": {
					"type": "raster",
					"tiles": ["https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
					"scheme": "xyz"
				},
				"conflation": {
					"type": "vector",
					"tiles": [window.location.protocol+"//"+window.location.host+"/{z}/{x}/{y}.pbf"],
					"minzoom": Number(metadata.minzoom),
					"maxzoom": Number(metadata.maxzoom),
					"scheme": "xyz"
				}
			},
			"layers": [{
				"id": "raster",
				"type": "raster",
				"source": "raster",
				"minzoom": 0,
				"maxzoom": 22
			}]
		};
		var polygonLayers=[], pointLayers=[], polylineLayers=[];
		for (const src of metadata.json.vector_layers) {
			var base = {
				"source": "conflation",
				"source-layer": src.id,
				"minzoom": src.minzoom,
				"maxzoom": 22
			};
			var polygonLayer = {
				"id": src.id+"_poly",
				"type": "fill",
				"filter": ["all", 
					["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
					["match", ["get","id"], ["ZZZ"], false, true]
				]
				// layout, paint
			};
			var pointLayer = {
				"id": src.id+"_point",
				"type": "circle",
				"filter": ["all", 
					["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
					["match", ["get","id"], ["ZZZ"], false, true]
				],
				"paint": { "circle-color": "#FF0000", "circle-radius": 8 }
			};
			var polylineLayer = {
				"id": src.id+"_line",
				"type": "line",
				"paint": {"line-color":"#4444ee","line-width":3},
				"filter": ["all", 
					["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
					["match", ["get","id"], ["ZZZ"], false, true]
				],
				"paint": { "line-color": "#00FFFF", "line-width": 3 }
			};
			Object.assign(polygonLayer, base);  polygonLayers.push(polygonLayer);
			Object.assign(pointLayer, base);    pointLayers.push(pointLayer);
			Object.assign(polylineLayer, base); polylineLayers.push(polylineLayer);
		}
		style.layers = style.layers.concat(polygonLayers, polylineLayers, pointLayers);

		var centre = [(bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2];
		glMap = new mapboxgl.Map({
		    container: 'map',
		    style: style,
		    center: centre,
		    zoom: 14
		});
		// glMap.showTileBoundaries=true; // for tile debugging
		glMap.addControl(new mapboxgl.NavigationControl());

		glMap.on('click', featureClicked);
		glMap.on('move', mapMoved);

		// Initialise Leaflet map
		leafletMap = L.map('leaflet').setView([centre[1],centre[0]],14);
		var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: "<a href='https://osm.org/copyright' target='_blank'>&copy; OpenStreetMap contributors</a> | Satellite imagery ©ESRI",
			maxNativeZoom: 19,
			maxZoom: 22 }).addTo(leafletMap);
			
		// Set up keyboard listener for fast edits
		document.addEventListener("keydown", keyListener);

		// Initialise UI
		clearProposedEdits();
	}

	// ============================================================================================================================================
	// Clicking on a feature for an edit

	// Clicked a feature so find nearby features
	function featureClicked(e) {
		if (popup) popup.remove();
		if (leafletFeature) { leafletMap.removeLayer(leafletFeature); leafletFeature = null; }

		// Look for features around the point
		var bbox = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
		var features = glMap.queryRenderedFeatures(bbox) //, { layers: ['counties'] });

		// Choose a feature, preferring points
		if (features.length==0) return;
		var feature = null;
		for (var f of features) {
			if (f.layer.type=='circle') { feature=f; break; }
		}
		feature = feature || features[0];
		selectedFeature = feature;

		// Show popup
		var html="<div>";
		for (var k in feature.properties) {
			if (k=='id') continue;
			html += k+"="+feature.properties[k]+"<br/>";
		}
		html+="</div>";

		popup = new mapboxgl.Popup()
			.setLngLat(glMap.unproject(e.point))
			.setHTML(html)
			.addTo(glMap);
		fetchOSMAPI(feature, glMap.unproject(e.point));

		// Highlight feature on Leaflet map too
		var geom = JSON.parse(JSON.stringify(feature.geometry));
		if (feature.layer.type=='circle') {
			leafletFeature = L.circle(geom.coordinates.reverse(), { radius: 50, fillColor: "#FF0000", fillOpacity: 0.2, stroke: false } ).addTo(leafletMap);
		} else if (feature.layer.type=='line') {
			leafletFeature = L.polyline(geom.coordinates.map(pt => pt.reverse()), { color: "#00FFFF", weight: 15, opacity: 0.5 } ).addTo(leafletMap);
		}
		if (leafletFeature) {
			var b1 = leafletFeature.getBounds();
			var b2 = leafletMap.getBounds();
			if (!b1.intersects(b2)) {
				leafletMap.fitBounds(b1, { maxZoom: leafletMap.getZoom() });
			}
		}
	}

	// Fetch OSM data near the selected feature
	function fetchOSMAPI(feature, latlng) {
		var left  = latlng.lng - 0.001;
		var right = latlng.lng + 0.001;
		var bottom= latlng.lat - 0.001;
		var top   = latlng.lat + 0.001;
		var url = graph.server+"/api/0.6/map?bbox="+([left,bottom,right,top].join(','));
		fetch(url)
			.then(response => response.text())
			.then(str => (new window.DOMParser()).parseFromString(str, "text/xml"))
			.then(doc => parseOSMData(feature, latlng, doc));
	}
	
	// Parse OSM data and find the most likely candidates for our suggested feature
	function parseOSMData(feature,latlng,doc) {
		graph.parseFromXML(doc);
		graph.setPOIFlag();
		var candidates = findCandidates(feature,latlng,graph);
		proposedEdits = [];
		for (var candidate of candidates) {
			var edit = calculateEditFor(candidate, feature);
			if (edit) proposedEdits.push(edit);
		}
		var edit = calculateNewObjectFor(feature,latlng);
		if (edit) proposedEdits.push(edit);
		displayedEdit = 0;
		if (proposedEdits.length>0) { renderProposedEdit(); } else { clearProposedEdits(); }
	}

	// Assemble the suggested edit for an object
	// **** should be a bit smarter - e.g. if candidate has highway=cycleway and feature is highway=primary, then we want to add cycleway=track
	function calculateEditFor(candidate, feature) {
		var ch=0, tags = {};
		for (var k in feature.properties) {
			if (candidate.obj.tags[k] != feature.properties[k]) {
				if (k!='id' && k[0]!='_') {
					tags[k] = feature.properties[k];
					ch++;
				}
			}
		}
		if (ch==0) return null;
		return { action: 'modify', obj: candidate.obj, tags: tags };
	}
	
	// Assemble a new suggested feature
	function calculateNewObjectFor(feature, latlng) {
		var ch=0, tags = JSON.parse(JSON.stringify(feature.properties));
		for (var k in tags) { if (k=='id' || k[0]=='_') { delete tags[k]; } else { ch++; } }
		if (ch==0) return null;
		var geom = JSON.parse(JSON.stringify(feature.geometry));
		if (feature.layer.type=='circle') {
			return { action: 'create', type: 'Node', geometry: geom, tags: tags }
		} else {
			return { action: 'create', type: 'Way', geometry: geom, tags: tags }
		}
	}
	
	// Render a proposed edit
	function renderProposedEdit() {
		var edit = proposedEdits[displayedEdit];
		byId('proposedIndex').innerHTML = (displayedEdit+1);
		byId('proposedCount').innerHTML = proposedEdits.length;

		// Render a Leaflet object
		if (leafletCandidate) { leafletMap.removeLayer(leafletCandidate); leafletCandidate=null; }
		if (edit.action=='modify') {
			leafletCandidate = edit.obj.asLeafletHighlight();
		} else if (edit.type=='Node') {
			leafletCandidate = L.marker(edit.geometry.coordinates.reverse());
		} else if (edit.type=='Way') {
			leafletCandidate = L.polyline(edit.geometry.coordinates.map(pt => pt.reverse()));
		} else {
			console.log("Unrecognised edit",edit);
		}
		leafletCandidate.addTo(leafletMap);

		// Assemble a textual list and put it the "proposed" pane
		var changes = [];
		if (edit.action=='modify') {
			changes.push({ name: null, description: "Modify "+edit.obj.constructor.name+" "+edit.obj.id+
			 	" <a href='https://osm.org/"+edit.obj.constructor.name.toLowerCase()+"/"+edit.obj.id+"' target='_blank'>⧉</a>"});
		} else {
			changes.push({ name: null, description: "Create new "+edit.type });
		}
		for (var k in edit.tags) {
			if (edit.action=='create' || !edit.obj.tags[k]) {
				changes.push({ name: k, description: "Add tag "+k+"="+edit.tags[k] });
			} else {
				changes.push({ name: k, description: "Change tag "+k+" to "+edit.tags[k]+" (from "+edit.obj.tags[k]+")" })
			}
		}
		var ct=0;
		byId('changes').innerHTML = "<div>" + changes.map(function(c) {
			if (c.name) {
				ct++;
				return "<input type='checkbox' class='tag_change' name='"+c.name+"' id='toggle"+ct+"' checked>"+c.description+" "+String.fromCharCode(9311+ct)+"<br/>";
			} else {
				return c.description+"<br/>";
			}
		}).join('') + "</div>";
		byId('nextButton').disabled = byId('acceptButton').disabled = byId('ignoreButton').disabled = false;
	}
	
	// Clear proposed edit area
	function clearProposedEdits() {
		byId('changes').innerHTML='';
		byId('proposedIndex').innerHTML = '-';
		byId('proposedCount').innerHTML = '-';
		byId('nextButton').disabled = byId('acceptButton').disabled = byId('ignoreButton').disabled = true;
	}

	function nextProposed() {
		if (!proposedEdits) return;
		displayedEdit = (displayedEdit+1) % proposedEdits.length;
		renderProposedEdit();
	}

	// ============================================================================================================================================
	// Accept/reject changes
	
	function acceptProposed() {
		if (!selectedFeature) return;
		if (popup) { popup.remove(); popup=null; }
		if (leafletFeature) { leafletMap.removeLayer(leafletFeature); leafletFeature = null; }
		if (leafletCandidate) { leafletMap.removeLayer(leafletCandidate); leafletCandidate = null; }
		hideFeature(selectedFeature.properties.id);
		byId('editCount').innerHTML = Number(byId('editCount').innerHTML)+1;
		applyChange(proposedEdits[displayedEdit]);
		clearProposedEdits();
	}
	function applyChange(change) {
		var tags = {};
		for (var k in change.tags) { 
			var el = document.querySelectorAll("input.tag_change[name="+k+"]")[0];
			if (el.checked) { tags[k] = change.tags[k]; }
		}

		if (change.action=='modify') {
			// modify
			for (var k in tags) { change.obj.tags[k] = tags[k]; }
			change.obj.dirty = true;

		} else if (change.type=='Way') {
			// create way
			// **** could potentially Douglas-Peucker it
			var nodeIndex = {}, nodeList = [];
			for (var i=0; i<change.geometry.coordinates.length; i++) {
				var ll = change.geometry.coordinates[i];
				var n = nodeIndex[ll.join(',')] || new Node(graph.nextNegative(), {}, 1, ll[0], ll[1]);
				n.dirty = true;
				nodeIndex[ll.join(',')]=n;
				nodeList.push(n);
				graph.add(n);
			}
			var w = new Way(graph.nextNegative(), tags, 1, nodeList);
			w.dirty = true;
			graph.add(w);

		} else if (change.type=='Node') {
			// create node
			var n = new Node(graph.nextNegative(), tags, 1, change.geometry.coordinates[0], change.geometry.coordinates[1]);
			n.dirty = true;
			graph.add(n);
		}
	}
	function ignoreProposed() {
		if (!selectedFeature) return;
		if (popup) { popup.remove(); popup=null; }
		if (leafletFeature) { leafletMap.removeLayer(leafletFeature); leafletFeature = null; }
		if (leafletCandidate) { leafletMap.removeLayer(leafletCandidate); leafletCandidate = null; }
		hideFeature(selectedFeature.properties.id);
		clearProposedEdits();
	}
	function uploadEdits() {
		if (Number(byId('editCount').innerHTML)==0) return;
		var username = byId('username').value;
		var password = byId('password').value;
		if (!username || !password) return;
		if (!changesetID) {
			var comment = prompt("Enter a changeset comment.");
			graph.openChangeset(username, password, { created_by: "Live Conflation", comment: comment }, function(success,cid) {
				if (!success) { alert("Couldn't open the changeset."); return; }
				changesetID = cid;
				graph.uploadChanges(username, password, changesetID, editsUploaded);
			} );
		} else {
			graph.uploadChanges(username, password, changesetID, editsUploaded);
		}
	}
	function editsUploaded(success, response) {
		if (!success) {
			alert("Failed to upload data.");
			response.text().then(text => console.log(response.status+": "+text));
		} else {
			console.log(response);
			byId('editCount').innerHTML = "0";
		}
	}

	// ============================================================================================================================================
	// Matching
	
	// Find likely candidates
	function findCandidates(feature,latlng,graph) {
		var sets;	// should we look through nodes, ways, relations?
		var filter;	// filter function to get the correct type (e.g. only POI nodes, or only closed ways)
		if (feature.properties['_filter']) {
			// if we have an explicit filter type, use that
			// **** only waynode:(tag) supported at present
			var wayKey = feature.properties['_filter'].split(':')[1];
			sets = [graph.nodes];
			filter = function(obj) {
				return !obj.poi && obj.parentWaysWithKey(wayKey,graph).length>0;
			}
		} else if (feature.layer.type=='circle') {
			// if it's a circle, look for POI nodes or closed ways
			sets = [graph.nodes, graph.ways, graph.relations];
			filter = function(obj) {
				if (obj.constructor.name=='Node') {
					return obj.poi;
				} else {
					return obj.isArea();
				}
			}
		} else if (feature.layer.type=='line') {
			// if it's a line, look for unclosed ways
			sets = [graph.ways];
			filter = function(obj) { return !obj.isArea(); }
			
		} else if (feature.layer.type=='fill') {
			// if it's a polygon, look for closed ways/multipolygons
			sets = [graph.ways, graph.relations];
			filter = function(obj) { return obj.isArea(); }
		}

		var candidates = [];
		for (var s of sets) {
			for (var id in s) {
				var obj = s[id];
				if (!filter(obj)) continue;										// filter on type
				var c = compatible(feature,obj.tags); if (c==0) continue;		// filter on tags
				var d = obj.distanceFrom(latlng); if (d.distance>150) continue;	// filter on distance
				// **** if it's a way, we probably want to filter on "distance between polylines", not just from the clickpoint
				//		(obviously a bit tricky because the way and feature will have different extents)
				candidates.push( { distance: d.distance, score: c, obj: obj });
			}
		}
		candidates.sort(function(a,b) { return cmp( Math.sqrt(a.distance) + 10*a.score,
													Math.sqrt(b.distance) + 10*b.score ) });
		return candidates;
	}
	function cmp(a,b) {
		if (a > b) return +1;
		if (a < b) return -1;
		return 0;
	}

	// Compare tags
	// score 0 for no match, 1 for top-level key match, 2 for top-level key match with same value
	function compatible(feature,tags) {
		var score = 0;
		for (var k of TOP_LEVEL) {
			if (feature.properties[k] && tags[k]) {
				score = Math.max(feature.properties[k]==tags[k] ? 3 : 1, score);
			}
		}
		// _match_key allows us to look for a particular key
		var mk = feature.properties['_match_key'];
		if (tags[mk] || (mk=="" && !tags[mk])) { score = Math.max(1,score); }
		// custom matches
		// highway=path/footway/cycleway equivalent
		if (feature.properties['highway']=='path' && (tags['highway']=='cycleway' || tags['highway']=='footway')) { score=2; }
		// cycleway= implies highway=
		if (feature.properties['cycleway'] && tags['highway']) { score=1.5; }
		// **** could add lots more here
		return score;
	}

	// ============================================================================================================================================
	// Keyboard listener for fast edits
	
	function keyListener(event) {
		if (document.activeElement.nodeName=="INPUT") return; // don't hijack text entry
		if (event.key=="Enter") {
			// accept change
			acceptProposed();
		} else if (event.key=="Backspace") {
			// ignore change
			ignoreProposed();
		} else if (event.key==" ") {
			// next candidate
			nextProposed();
			event.stopImmediatePropagation();
		} else if (event.keyCode>=49 && event.keyCode<=57) {
			// toggle checkbox
			var el = byId("toggle"+event.key);
			if (el) el.checked=!el.checked;
		}
	}

	// ============================================================================================================================================
	// Support code

	// Hide feature
	
	function hideFeature(id) {
		for (var layer of glMap.getStyle().layers) {
			if (!layer.filter) continue;
			if (layer.filter[2][2].indexOf(id)>-1) continue;
			var f = JSON.parse(JSON.stringify(layer.filter));
			f[2][2].push(id);
			glMap.setFilter(layer.id,f);
		}
	}

	// Leaflet map interaction

	function mapMoved(event) {
		var ll = glMap.getCenter();
		leafletMap.panTo(ll, { animate: false });
	}
	
	// Debug etc.

	function mapError(err) {
		console.log("Error",err);
	}

	function byId(id) { return document.getElementById(id); }
