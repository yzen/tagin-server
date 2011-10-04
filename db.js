/*global require, module, console*/

(function () {

    "use strict";
    
    var http = require("http");

    var makeDBRequest = function (options, emitter, event) {
        var headers;
        // If POST, automatically set Content-Type to "application/json"
        if (options.type === "POST") {
            headers = {
                "Content-Type": "application/json"
            };
        }
        // If headers settings were passed in the options, use those.
        headers = options.headers || headers;
        
        var req = http.request({
            host: "127.0.0.1",
            port: "5984",
            method: options.type,
            path: options.path,
            headers: headers
        }, function (res) {
            var data = "";
            res.setEncoding("utf8");
            res.on("data", function (chunk) {
                data += chunk;
            });
            res.on("end", function () {
                var parsed;
                try {
                    parsed = JSON.parse(data);
                }
                catch (e) {
                    console.log("ERROR: " + e);
                }
                emitter.emit(event, parsed);
            });
        });
        
        // Handle request error (log and fire 'error' event).
        req.on('error', function(e) {
            console.log("ERROR: " + e.message);
            emitter.emit("error", e.message);
        });
        
        // If there's data going to the server, stringify it and send.
        if (options.data) {
            req.write(JSON.stringify(options.data));
        }
        
        req.end();
    };
    
    var db = {};
    
    db.request = makeDBRequest;
    db.post = function (options, emitter, event) {
        // Set request type to POST.
        options.type = "POST";
        makeDBRequest(options, emitter, event);
    };
    db.get = function (options, emitter, event) {
        // Set request type to GET.
        options.type = "GET";
        // Remove, if present, data to be sent to the server.
        delete options.data;
        makeDBRequest(options, emitter, event);
    };
    
    module.exports = db;
    
})();