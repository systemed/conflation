hazards = { ["Barrier Types"] = { "barrier", "yes"} ,
			["Lamp Posts"] = { "highway", "street_lamp" },
			["Traffic Calming"] = { "traffic_calming", "yes" },
			["Bus Stops"] = { "highway", "bus_stop" } }

routes =  { ["Off-Road"] = { "highway", "cycleway" } ,
			["On-Road"] = { "_match_key", "highway" } ,
			["Parallel"] = { "highway", "cycleway" } }

lights =  { ["None"] = { "lit", "no" },
			["Street"] = { "lit", "yes" } }
			
surfaces= { ["Coloured Surface"] = { "surface", "asphalt" },
			["Tarmac"] = { "surface", "asphalt" },
			["Unbound Hardcore"] = { "surface", "gravel" } }

widths =  { ["Narrow"] = { "width", "<1.5m" },
			["Very Narrow"] = { "width", "<1m" } }

speeds =  { ["30"] = { "maxspeed", "30 mph" },
			["40"] = { "maxspeed", "40 mph" },
			["50"] = { "maxspeed", "50 mph" },
			["NSL"]= { "maxspeed", "60 mph" } }

crossings={ ["Refuge"]= { "crossing", "island" },
			["Zebra"] = { "crossing", "zebra" } }

function attribute_function(attr)
	local tags = {}
	
	remap_tags(tags,attr,"HazardType", hazards)
	remap_tags(tags,attr,"RouteType" , routes)
	remap_tags(tags,attr,"Lighting"  , lights)
	remap_tags(tags,attr,"SurfaceMat", surfaces)
	remap_tags(tags,attr,"CycleLaneW", widths)
	remap_tags(tags,attr,"CycleTrack", widths)
	remap_tags(tags,attr,"SpeedLimit", speeds)
	remap_tags(tags,attr,"CrossingTy", crossings)

	if attr["Comment"] and attr["Comment"]~="" then tags["_comment"]=attr["Comment"] end
	tags["id"] = attr["GlobalID"]
	return tags
end

function remap_tags(tags,attr,key,hash)
	if attr[key] then
		local tag = hash[attr[key]]
		if tag then tags[tag[1]]=tag[2] end
	end
end

function node_function(node)
end

function way_function(way)
end

node_keys = {}
