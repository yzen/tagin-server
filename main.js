(function () {

    var http = require('http');
    var url = require('url');
    var events = require('events');
    
    var utils = {};
    
    utils.isArrayable = function (list) {
        return list && 
            typeof list === "object" && 
            typeof list.length === "number" && 
            !(list.propertyIsEnumerable("length")) && 
            typeof list.splice === 'function';
    };
    
    utils.each = function (list, callback) {
        if (!list) {
            return;
        }
        if (!callback || typeof callback !== "function") {
            return;
        }
        if (utils.isArrayable(list)) {
            var i;
            for (i = 0; i < list.length; ++i) {
                callback(list[i], i);
            }
        } else {
            var key;
            for (key in list) {
                callback(list[key], key);
            }
        }       
    };
    
    var mapImpl = function (list, togo, key, args) {
        var value = list[key];
        var i = 1;
        for (i; i < args.length; ++i) {
            value = args[i](value, key);
        }
        togo[key] = value;
    };
    
    utils.map = function (list) {
        if (!list) {
            return;
        }
        var isArrayable = utils.isArrayable(list);
        var togo = isArrayable ? [] : {};
        if (isArrayable) {
            var i;
            for (i = 0; i < list.length; ++i) {
                mapImpl(list, togo, i, arguments);
            }
        } else {
            var key;
            for (key in list) {
                mapImpl(list, togo, key, arguments);
            }
        }
        return togo;
    };
    
    utils.find = function (list, callback, deflt) {
        var disp;
        if (utils.isArrayable(list)) {
            var i;
            for (i = 0; i < list.length; ++i) {
                disp = callback(list[i], i);
                if (disp !== undefined) {
                    return disp;
                }
            }
        } else {
            var key;
            for (key in list) {
                disp = callback(list[key], key);
                if (disp !== undefined) {
                    return disp;
                }
            }
        }
        return deflt;
    };
    
    ////////////////////////////////////////////////////////////////////////
    
    var makeDBRequest = function (options, emitter, event) {
        var req = http.request({
            host: "127.0.0.1",
            port: "5984",
            method: options.type,
            path: options.path,
            headers: options.headers
        }, function (res) {
            var data = "";
            res.setEncoding("utf8");
            res.on("data", function (chunk) {
                data += chunk;
            });
            res.on("end", function () {
                emitter.emit(event, data);
            });
        });
        req.on('error', function(e) {
            console.log("ERROR: " + e.message);
        });
        if (options.data) {
            req.write(JSON.stringify(options.data));
        }
        req.end();
    };
    
    var getRadioId = function (data) {
        for (i = 0; i < data.length; ++i) {
            var value = data[i];
            if (value.type === "radio") {
                return value.radio_id;
            }
        }
    };
    
    var buildKeys = function (keys) {
        return {
            keys: keys
        };
    };
    
    var getMacKeys = function (data) {
        var macs = [], i;
        for (i = 0; i < data.length; ++i) {
            var value = data[i];
            if (value.type === "beacon") {
                macs.push(value.mac);
            }
        }
        return buildKeys(macs);
    };
    
    var parseResponse = function (response) {
        var list = [], i, key, seen={};
        for (i = 0; i < response.rows.length; ++i) {
            var row = response.rows[i];
            for (key in row.value) {
                if (!seen[key]) {
                    seen[key] = true;
                    list.push(key);
                }
            }
        }
        return list;
    };
    
    var parseRadioIds = function (response) {
        var list = [], i, key, seen={};
        for (i = 0; i < response.rows.length; ++i) {
            var value = response.rows[i].value;
            if (!seen[value.radio_id]) {
                seen[value.radio_id] = true;
                list.push(value.radio_id);
            }
        }
        return list;
    };
    
    var inArray = function (value, array) {
        var i;
        for (i = 0; i < array.length; ++i) {
            if (array[i] === value) {
                return true;
            }
        };
        return false;
    };
    
    var getKeys = function (response) {
        return buildKeys(parseResponse(response));
    };
    
    var lookupRange = function (radios, id) {
        return utils.find(radios.rows, function (row) {
            if (row.key === id) {
                return row.value;
            }
        });
    };
    
    var getRange = function (radios, id, data) {
        var range = {};
        utils.each(data, function (fp) {
            if (fp.type !== "fingerprint") {
                return;
            }
            range.min_rssi = range.min_rssi && range.min_rssi < fp.rssi ? range.min_rssi : fp.rssi;
            range.max_rssi = range.max_rssi && range.max_rssi > fp.rssi ? range.max_rssi : fp.rssi;
        });
        var dbRange = lookupRange(radios, id);
        if (!dbRange) {
            return range;
        }
        return {
            min_rssi: range.min_rssi > dbRange.min_rssi ? dbRange.min_rssi : range.min_rssi,
            max_rssi: range.max_rssi > dbRange.max_rssi ? dbRange.max_rssi : range.max_rssi
        };
    };
    
    var normalize = function (val, min, max) {
        return (val - min) / (max - min);
    };
    
    var getRanks = function (data, range) {
        var ranks = {};
        utils.each(data, function (fp) {
            if (fp.type !== "fingerprint") {
                return;
            }
            ranks[fp.beacon_mac] = normalize(fp.rssi, range.min_rssi, range.max_rssi);
        });
        return ranks;
    };
    
    var getDistance = function (tagRanks, ranks) {
        var dSquared = 0;
        utils.each(tagRanks, function (tagRank, tagMac) {
            var rank = ranks[tagMac];
            dSquared += Math.pow(tagRank - (rank || 0), 2);
        });
        utils.each(ranks, function (rank, mac) {
            var tagRank = tagRanks[mac];
            if (!tagRank) {
                dSquared += Math.pow(rank, 2);
            }
        });
        return Math.sqrt(dSquared);
    };
    
    var calculateDistances = function (data) {
        var ranks = getRanks(data.data, getRange(data.radios, data.radioId, data.data));
        var tags = {};
        utils.each(data.fingerprints.rows, function (row) {
            var tag = row.key;
            if (!tags[tag]) {
                tags[tag] = {
                    data: [],
                    radio_id: row.value.radio_id
                };
            }
            tags[tag].data.push({
                type: row.value.type,
                rssi: row.value.rssi,
                beacon_mac: row.value.beacon_mac
            });
        });
        var tagRanks = {};
        utils.each(tags, function (tag, tagName) {
            tagRanks[tagName] = getRanks(tag.data, lookupRange(data.radios, tag.radio_id));
        });
        var distances = {}, minDistance, maxDistance;
        utils.each(tagRanks, function (rankList, tag) {
            var distance = getDistance(rankList, ranks);
            distances[tag] = distance;
            minDistance = minDistance && minDistance < distance ? minDistance : distance;
            maxDistance = maxDistance && maxDistance > distance ? maxDistance : distance;
        });
        /*
        utils.each(distances, function (distance, tag) {
            distances[tag] = normalize(distance, minDistance, maxDistance);
        });
        */
        return distances;
    };
    
    var handleFetch = function (req, res) {
        console.log("Handling request to /fetch");
        var emitter = new events.EventEmitter();
        
        var togo = {};
    
        req.on("data", function (data) {
            
            togo.data = JSON.parse(data);;
            togo.radioId = getRadioId(JSON.parse(data));
            
            emitter.on("radio", function (radio) {
                togo.radios = JSON.parse(radio);
                successHandler(res, calculateDistances(togo));
            });
            emitter.on("tagToFingerprint", function (fingerprints) {
                togo.fingerprints = JSON.parse(fingerprints);
                var radios = buildKeys(parseRadioIds(JSON.parse(fingerprints)));
                if (!inArray(togo.radioId, radios.keys)) {
                    radios.keys.push(togo.radioId);
                }
                makeDBRequest({
                    type: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    path: "/tagin/_design/tagin/_view/radio?group=true",
                    data: radios
                }, emitter, "radio");
            });
            emitter.on("fingerprintToTag", function (fingerprints) {
                makeDBRequest({
                    type: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    path: "/tagin/_design/tagin/_view/tagToFingerprint",
                    data: getKeys(JSON.parse(fingerprints))
                }, emitter, "tagToFingerprint");
            });
            emitter.on("macToFingerprint", function (fingerprints) {
                var fps = JSON.parse(fingerprints);
                if (fps.rows.length < 1) {
                    successHandler(res, {});
                    return;
                }
                makeDBRequest({
                    type: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    path: "/tagin/_design/tagin/_view/fingerprintToTag?group=true",
                    data: getKeys(fps)
                }, emitter, "fingerprintToTag");
            });
            makeDBRequest({
                type: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                path: "/tagin/_design/tagin/_view/macToFingerprint?group=true",
                data: getMacKeys(JSON.parse(data))
            }, emitter, "macToFingerprint");
            
        });
    };
    
    var handleSave = function (req, res) {
        console.log("Handling request to /save");
        var emitter = new events.EventEmitter();
        
        emitter.on("saveWifi", function (response) {
            res.end(response);
        });
        req.on("data", function (data) {
            makeDBRequest({
                type: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                path: "/tagin/_bulk_docs",
                data: {
                    docs: JSON.parse(data)
                }
            }, emitter, "saveWifi");
        });
    };
    
    var config = {
        "fetch": handleFetch,
        "save": handleSave
    };
    
    var successHandler = function (res, response) {
        console.log(JSON.stringify(response));
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(response));
    };
    
    var errorHandler = function (res, error) {
        console.log(error);
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({
            isError: true,
            message: error
        }));
    };
    
    var applyHandler = function (handler, req, res) {
        if (!handler) {
            return errorHandler(res, "Invalid Path");
        }
        handler(req, res);
    };

    http.createServer(function (req, res) {
        req.setEncoding('utf8');
        var requestHandler = config[url.parse(req.url).pathname.slice(1)];
        applyHandler(requestHandler, req, res);
    }).listen(8080, "127.0.0.1");
    
})();