class OSMGraph {
	constructor(serverURL) {
		this.nodes = {};
		this.ways = {};
		this.relations = {};
		this.negativeID = 0;
		this.server = serverURL;
	}

	// Set poi flag on all nodes
	setPOIFlag() {
		for (var id in this.ways) {
			var w = this.ways[id];
			for (var nd of w.nodes) {
				nd.poi = false;
			}
		}
	}

	// Utility methods
	static fastDistance(lat1,lon1,lat2,lon2) {
		var deg2rad = Math.PI / 180;
		lat1 *= deg2rad;
		lon1 *= deg2rad;
		lat2 *= deg2rad;
		lon2 *= deg2rad;
		var diam = 12742000;
		var dLat = lat2 - lat1;
		var dLon = lon2 - lon1;
		var a = (
			(1 - Math.cos(dLat)) +
			(1 - Math.cos(dLon)) * Math.cos(lat1) * Math.cos(lat2)
		) / 2;
		return diam * Math.asin(Math.sqrt(a));
	}

	// XML parser
	parseFromXML(doc) {
		// Parse nodes
		for (var n of doc.getElementsByTagName('node')) {
			var node = new Node(
				n.attributes['id'].value, 
				OSMGraph.parseTags(n), 
				n.attributes['version'].value,
				n.attributes['lat'].value, 
				n.attributes['lon'].value
			);
			if (this.nodes[node.id] && this.nodes[node.id].dirty) continue;
			this.nodes[node.id] = node;
		}
		// Parse ways
		for (var w of doc.getElementsByTagName('way')) {
			var nodelist = [];
			for (var nd of w.getElementsByTagName('nd')) {
				var nid = nd.attributes['ref'].value;
				if (this.nodes[nid]) nodelist.push(this.nodes[nid]);
			}
			var way = new Way(
				w.attributes['id'].value,
				OSMGraph.parseTags(w),
				w.attributes['version'].value,
				nodelist
			);
			if (this.ways[way.id] && this.ways[way.id].dirty) continue;
			this.ways[way.id] = way;
		}
		// Parse relations
		for (var r of doc.getElementsByTagName('relation')) {
			var memberlist = [];
			for (var m of r.getElementsByTagName('member')) {
				var t  = m.attributes['type'].value;
				var id = m.attributes['ref' ].value;
				var rl = m.attributes['role'].value;
				if (t=='relation') continue; // noooope
				var obj= t=='way' ? this.ways[id] : this.nodes[id];
				if (obj) memberlist.push(new RelationMember(obj, rl));
			}
			var relation = new Relation(
				r.attributes['id'].value,
				OSMGraph.parseTags(r),
				r.attributes['version'].value,
				memberlist
			);
			if (this.relations[relation.id] && this.relations[relation.id].dirty) continue;
			this.relations[relation.id] = relation;
		}
	}
	static parseTags(obj) {
		var tags = {};
		for (var t of obj.getElementsByTagName('tag')) {
			tags[t.attributes['k'].value] = t.attributes['v'].value;
		}
		return tags;
	}
	static tagsToXML(osmObj,xml,xmlObj) {
		for (var k in osmObj.tags) {
			var tag = xml.createElement("tag");
			tag.setAttribute("k",k);
			tag.setAttribute("v",osmObj.tags[k]);
			xmlObj.appendChild(tag);
		}
	}

	// Find dirty objects
	dirtyObjects() {
		var id, dirty = { ways: [], nodes: [], relations: [] };
		for (id in this.nodes    ) { if (this.nodes[id].dirty    ) { dirty.nodes.push(this.nodes[id]);         } }
		for (id in this.ways     ) { if (this.ways[id].dirty     ) { dirty.ways.push(this.ways[id]);           } }
		for (id in this.relations) { if (this.relations[id].dirty) { dirty.relations.push(this.relations[id]); } }
		return dirty;
	}
	
	// Add an object
	add(obj) {
		if      (obj.constructor.name=='Way'     ) { this.ways[obj.id] = obj; }
		else if (obj.constructor.name=='Node'    ) { this.nodes[obj.id] = obj; }
		else if (obj.constructor.name=='Relation') { this.relations[obj.id] = obj; }
	}
	
	// Get a negative ID
	nextNegative() {
		this.negativeID--;
		return this.negativeID;
	}
	
	// Open a changeset
	openChangeset(username, password, changesetTags, successFunction) {
		// Create changeset XML
		var xml = document.implementation.createDocument(null,null);
		var osm = xml.createElement("osm");
		var changeset = xml.createElement("changeset");
		for (var k in changesetTags) {
			var tag = xml.createElement("tag");
			tag.setAttribute('k',k);
			tag.setAttribute('v',changesetTags[k]);
			changeset.appendChild(tag);
		}
		osm.appendChild(changeset);
		xml.appendChild(osm);
		// Send to OSM
		fetch(this.server+"/api/0.6/changeset/create", {
			method: "PUT",
		    headers: { "Content-Type": "text/xml",
			           "Authorization": "Basic " + window.btoa(username + ":" + password) },
			body: new XMLSerializer().serializeToString(xml)
		}).then(response => {
			response.text().then(text => {
				if (isNaN(text)) {
					successFunction(false);
				} else {
					successFunction(true,text); // this is just the changeset ID
				}
			})
		});
	}
	
	// Upload all dirty objects
	uploadChanges(username, password, changesetID, successFunction) { var _this=this;
		// Create XML document
		var xml = document.implementation.createDocument(null,null);
		var osc = xml.createElement("osmChange");
		osc.setAttribute('version','0.6');
		osc.setAttribute('generator','osmgraph.js');
		var create = xml.createElement("create");
		var modify = xml.createElement("modify");
		// Serialise all changes
		var dirty = this.dirtyObjects();
		for (var node of dirty.nodes) {
			var x = node.toXML(xml,changesetID);
			node.id<0 ? create.appendChild(x) : modify.appendChild(x);
		}
		for (var way of dirty.ways) {
			var x = way.toXML(xml,changesetID);
			way.id<0 ? create.appendChild(x) : modify.appendChild(x);
		}
		for (var node of dirty.relations) {
			var x = relation.toXML(xml,changesetID);
			relation.id<0 ? create.appendChild(x) : modify.appendChild(x);
		}
		osc.appendChild(create);
		osc.appendChild(modify);
		xml.appendChild(osc);
		// Upload
		fetch(this.server+"/api/0.6/changeset/"+changesetID+"/upload", {
			method: "POST",
		    headers: { "Content-Type": "text/xml",
			           "Authorization": "Basic " + window.btoa(username+":"+password) },
			body: new XMLSerializer().serializeToString(xml)
		}).then(response => {
			if (response.ok) {
				response.text()
				.then(str => (new window.DOMParser()).parseFromString(str, "text/xml"))
				.then(doc => _this.parseDiffResponse(doc))
				.then(() => successFunction(true));
			} else {
				successFunction(false, response);
			}
		});
	}
	
	// Parse OSM diff response
	parseDiffResponse(doc) {
		for (var n of doc.getElementsByTagName('node')    ) { this.assignNew(n,this.nodes); }
		for (var w of doc.getElementsByTagName('way')     ) { this.assignNew(w,this.ways); }
		for (var r of doc.getElementsByTagName('relation')) { this.assignNew(r,this.relations); }
	}
	assignNew(el,collection) {
		var old_id = Number(el.attributes['old_id'].value);
		var new_id = Number(el.attributes['new_id'].value);
		if (!collection[old_id]) return;
		collection[old_id].id = new_id;
		collection[old_id].version = Number(el.attributes['new_version'].value);
		collection[old_id].dirty = false;
		collection[new_id] = collection[old_id];
		delete collection[old_id];
	}
}

class Node {
	constructor(id,tags,version,lat,lon) {
		this.id = Number(id);
		this.tags = tags;
		this.version = Number(version);
		this.lon = Number(lon);
		this.lat = Number(lat);
		this.poi = true;
		this.dirty = false;
		this.parents = [];
	}
	distanceFrom(latlng) {
		return { distance: OSMGraph.fastDistance(latlng.lat,latlng.lng,this.lat,this.lon), lat: this.lat, lon: this.lon }
	}
	asLeafletHighlight() {
		return L.marker([this.lat,this.lon]);
	}
	parentWaysWithKey(k,graph) {
		var parentWays = [];
		for (var p of this.parents) {
			if (p.constructor.name=='Way' && p.tags[k]) {
				parentWays.push(p);
			}
		}
		return parentWays;
	}
	toXML(xml,changesetID) {
		var node = xml.createElement("node");
		node.setAttribute("id",this.id);
		if (this.id > 0) node.setAttribute("version",this.version);
		if (changesetID) node.setAttribute("changeset",changesetID);
		node.setAttribute("lat",this.lat);
		node.setAttribute("lon",this.lon);
		OSMGraph.tagsToXML(this,xml,node);
		return node;
	}
}
class Way {
	constructor(id,tags,version,nodes) {
		this.id = Number(id);
		this.tags = tags;
		this.version = Number(version);
		this.nodes = nodes;
		this.dirty = false;
		this.parents = [];
		for (var n of this.nodes) { n.parents.push(this); }
	}
	distanceFrom(latlng) {
		if (this.isClosed() && this.encloses(latlng)) return 0;
		var bestDist = Infinity, bestLatLng;
		for (var i=0; i<this.nodes.length-1; i++) {
			var dx = this.nodes[i+1].lon - this.nodes[i].lon;
			var dy = this.nodes[i+1].lat - this.nodes[i].lat;
			if (dx==0 && dy==0) { continue; }

			var u = ((latlng.lng-this.nodes[i].lon)*dx + (latlng.lat-this.nodes[i].lat)*dy) / (dx*dx + dy*dy);
			var closest;
			if      (u < 0) { closest = { lat: this.nodes[i  ].lat, lon: this.nodes[i  ].lon }; }
			else if (u > 1) { closest = { lat: this.nodes[i+1].lat, lon: this.nodes[i+1].lon }; }
			else            { closest = { lat: this.nodes[i].lat+u*dx, lon: this.nodes[i].lon+u*dy }; }
			var dist = OSMGraph.fastDistance(closest.lat,closest.lon,latlng.lat,latlng.lng);
			if (dist<bestDist) {
				bestDist = dist;
				bestLatLng = closest;
			}
		}
		return { distance: bestDist, lat: bestLatLng.lat, lon: bestLatLng.lon }
	}
	distanceFromFeature(feature) {
		// *****
	}
	asLeafletHighlight() {
		var latlngs=[];
		for (var node of this.nodes) latlngs.push([node.lat,node.lon]);
		return L.polyline(latlngs);
	}
	isClosed() {
		return this.nodes[0]==this.nodes[this.nodes.length-1];
	}
	isArea() {
		return this.isClosed() && (!this.tags['highway'] || this.tags['area']=='yes');
	}
	encloses(latlng) {
		var y = latlng.lat, x = latlng.lng;
		var inside = false;
		for (var i=0, j=this.nodes.length-1; i<this.nodes.length; j=i++) {
			var xi = this.nodes[i].lon, yi = this.nodes[i].lat;
			var xj = this.nodes[j].lon, yj = this.nodes[j].lat;
			var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
			if (intersect) inside = !inside;
		}
		return inside;
	}
	toXML(xml,changesetID) {
		var way = xml.createElement("way");
		way.setAttribute("id",this.id);
		if (this.id > 0) way.setAttribute("version",this.version);
		if (changesetID) way.setAttribute("changeset",changesetID);
		OSMGraph.tagsToXML(this,xml,way);
		for (var node of this.nodes) {
			var nd = xml.createElement("nd");
			nd.setAttribute("ref",node.id);
			way.appendChild(nd);
		}
		return way;
	}
}
class Relation {
	constructor(id,tags,version,members) {
		this.id = Number(id);
		this.tags = tags;
		this.version = Number(version);
		this.members = members;
		this.dirty = false;
		this.parents = [];
		for (var m of this.members) { m.obj.parents.push(this); }
	}
	findOuter() {
		if (this.tags['type']!='multipolygon') return null;
		for (var m of this.members) {
			if (m.role=='outer') return m.obj;
		}
		return null;
	}
	// Geometry operators just look at a single outer ring currently
	asLeafletHighlight() { var o = this.findOuter(); return o ? o.asLeafletHighlight() : null; }
	distanceFrom(latlng) { var o = this.findOuter(); return o ? o.distanceFrom(latlng) : null; }
	distanceFromFeature(feature) { var o = this.findOuter(); return o ? o.distanceFromFeature(latlng) : null; }
	isClosed() { var o = this.findOuter(); return o ? o.isClosed() : false; }
	isArea() { return this.isClosed(); }
	encloses(latlng) { var o = this.findOuter(); return o ? o.encloses(latlng) : false; }
	toXML(xml,changesetID) {
		var rel = xml.createElement("relation");
		rel.setAttribute("id",this.id);
		if (this.id > 0) rel.setAttribute("version",this.version);
		if (changesetID) rel.setAttribute("changeset",changesetID);
		OSMGraph.tagsToXML(this,xml,rel);
		for (var member of this.members) { rel.appendChild(member.toXML(xml)); }
		return rel;
	}
}
class RelationMember {
	constructor(obj,role) {
		this.obj = obj;
		this.role = role;
	}
	toXML(xml) {
		var mem = xml.createElement("member");
		mem.setAttribute("ref",this.obj.id);
		mem.setAttribute("type",this.obj.constructor.name.toLowerCase());
		if (this.role) mem.setAttribute("role",this.role);
		return mem;
	}
}