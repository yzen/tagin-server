(function () {

    var http = require("http"),
        url = require("url"),
        events = require("events"),
        utils = require("./utils.js"),
        engine = require("./engine.js"),
        db = require("./db.js");
    
    var handleFetch = function (req, res) {
        console.log("Handling request to /fetch");
        var emitter = new events.EventEmitter();
        
        var togo = {};
    
        req.on("data", function (data) {
        
            data = JSON.parse(data);
            togo.data = data;
            togo.radioId = engine.getRadioId(data);
            
            emitter.on("error", function (errorMessage) {
                errorHandler(res, errorMessage);
            });
            
            emitter.on("radio", function (radios) {
                if (!radios) {
                    errorHandler(res, "Response is empty");
                }
                togo.radios = radios;
                successHandler(res, engine.calculateDistances(togo));
            });

            emitter.on("tagToFingerprint", function (fingerprints) {
                
                if (!fingerprints) {
                    errorHandler(res, "Response is empty");
                }
                togo.fingerprints = fingerprints;
                var radios = engine.buildKeys(engine.parseRadioIds(fingerprints));
                if (!utils.find(radios.keys, function (key) {
                    if (key === togo.radioId) {
                        return key;
                    }
                })) {
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
                    data: engine.getKeys(fingerprints)
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
                    data: engine.getKeys(fingerprints)
                }, emitter, "fingerprintToTag");
            });
            
            db.post({
                path: "/tagin/_design/tagin/_view/macToFingerprint?group=true",
                data: engine.getMacKeys(data)
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