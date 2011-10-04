(function () {

    var http = require("http"),
        url = require("url"),
        events = require("events"),
        utils = require("./utils.js"),
        db = require("./db.js");
    
    
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
        return distances;
    };
    
    var handleFetch = function (req, res) {
        console.log("Handling request to /fetch");
        var emitter = new events.EventEmitter();
        
        var togo = {};
    
        req.on("data", function (data) {
        
            data = JSON.parse(data);
            togo.data = data;
            togo.radioId = getRadioId(data);
            
            emitter.on("error", function (errorMessage) {
                errorHandler(res, errorMessage);
            });
            
            emitter.on("radio", function (radios) {
                if (!radios) {
                    errorHandler(res, "Response is empty");
                }
                togo.radios = radios;
                successHandler(res, calculateDistances(togo));
            });

            emitter.on("tagToFingerprint", function (fingerprints) {
                
                if (!fingerprints) {
                    errorHandler(res, "Response is empty");
                }
                togo.fingerprints = fingerprints;
                var radios = buildKeys(parseRadioIds(fingerprints));
                if (!inArray(togo.radioId, radios.keys)) {
                    radios.keys.push(togo.radioId);
                }
                
                db.post({
                    path: "/tagin/_design/tagin/_view/radio?group=true",
                    data: radios
                }, emitter, "radio");
            });

            emitter.on("fingerprintToTag", function (fingerprints) {
            
                if (!fingerprints) {
                    errorHandler(res, "Response is empty");
                }
                
                db.post({
                    path: "/tagin/_design/tagin/_view/tagToFingerprint",
                    data: getKeys(fingerprints)
                }, emitter, "tagToFingerprint");
            });

            emitter.on("macToFingerprint", function (fingerprints) {

                if (!fingerprints) {
                    errorHandler(res, "Response is empty");
                }
                if (fingerprints.rows.length < 1) {
                    successHandler(res, {});
                    return;
                }

                db.post({
                    path: "/tagin/_design/tagin/_view/fingerprintToTag?group=true",
                    data: getKeys(fingerprints)
                }, emitter, "fingerprintToTag");
            });
            
            db.post({
                path: "/tagin/_design/tagin/_view/macToFingerprint?group=true",
                data: getMacKeys(data)
            }, emitter, "macToFingerprint");
        });
    };
    
    var handleSave = function (req, res) {
        console.log("Handling request to /save");
        var emitter = new events.EventEmitter();
        
        emitter.on("saveWifi", function (response) {
            if (!response) {
                errorHandler(res, "Response is empty");
            }
            successHandler(res, response);
        });
        
        emitter.on("error", function (errorMessage) {
            errorHandler(res, errorMessage);
        });
        
        req.on("data", function (data) {
            db.post({
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
        res.end(typeof response === "string" ? response : JSON.stringify(response));
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